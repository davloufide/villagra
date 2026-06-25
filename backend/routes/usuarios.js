const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// Todas las rutas de este módulo son solo para administrador
router.use(verificarToken, soloRol('administrador'));

// GET /api/usuarios — listar todos los usuarios
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre, correo, activo, id_rol, created_at, roles(nombre)')
    .order('id_usuario');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/usuarios — crear usuario (admin)
router.post('/', async (req, res) => {
  const { nombre, correo, password, id_rol } = req.body;
  if (!nombre || !correo || !password || !id_rol)
    return res.status(400).json({ error: 'nombre, correo, password e id_rol son requeridos' });
  if (password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });

  const hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('usuarios')
    .insert({ nombre, correo: correo.toLowerCase().trim(), password_hash: hash, id_rol: parseInt(id_rol) })
    .select('id_usuario, nombre, correo, activo, id_rol')
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese correo ya está registrado' });
    return res.status(500).json({ error: error.message });
  }

  // Si es cliente (rol 3), crear su perfil en la tabla clientes
  if (parseInt(id_rol) === 3) {
    await supabase.from('clientes').insert({ id_usuario: data.id_usuario }).then(() => {}, () => {});
  }

  res.status(201).json(data);
});

// PATCH /api/usuarios/:id — editar usuario (admin)
router.patch('/:id', async (req, res) => {
  const { nombre, correo, id_rol, activo, password } = req.body;
  const cambios = {};
  if (nombre !== undefined)  cambios.nombre = nombre;
  if (correo !== undefined)  cambios.correo = correo.toLowerCase().trim();
  if (id_rol !== undefined)  cambios.id_rol = parseInt(id_rol);
  if (activo !== undefined)  cambios.activo = !!activo;
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });
    cambios.password_hash = await bcrypt.hash(password, 10);
  }

  if (!Object.keys(cambios).length)
    return res.status(400).json({ error: 'No hay cambios para guardar' });

  const { data, error } = await supabase
    .from('usuarios')
    .update(cambios)
    .eq('id_usuario', req.params.id)
    .select('id_usuario, nombre, correo, activo, id_rol')
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese correo ya está en uso' });
    return res.status(500).json({ error: error.message });
  }

  // Si pasó a rol cliente, asegurar su perfil
  if (parseInt(id_rol) === 3) {
    const { data: existe } = await supabase.from('clientes').select('id_cliente').eq('id_usuario', data.id_usuario).maybeSingle();
    if (!existe) await supabase.from('clientes').insert({ id_usuario: data.id_usuario }).then(() => {}, () => {});
  }

  res.json(data);
});

// DELETE /api/usuarios/:id — eliminar usuario (admin)
router.delete('/:id', async (req, res) => {
  // Evitar que el admin se elimine a sí mismo
  if (parseInt(req.params.id) === req.usuario.id)
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });

  const { error } = await supabase.from('usuarios').delete().eq('id_usuario', req.params.id);
  if (error) {
    // FK: el usuario tiene registros asociados (empleado/cliente/mantenimientos…)
    if (error.code === '23503')
      return res.status(409).json({ error: 'No se puede eliminar: el usuario tiene registros asociados. Mejor desactívalo.' });
    return res.status(500).json({ error: error.message });
  }
  res.json({ ok: true });
});

module.exports = router;
