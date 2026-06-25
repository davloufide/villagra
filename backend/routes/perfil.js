const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const supabase = require('../db/supabase');
const { verificarToken } = require('../middleware/auth');

// El teléfono vive en distinta tabla según el rol
function tablaPerfil(rol) {
  return rol === 'cliente' ? 'clientes' : 'empleados';
}

// GET /api/perfil — datos del usuario autenticado (cualquier rol)
router.get('/', verificarToken, async (req, res) => {
  const { id, rol } = req.usuario;

  const { data: u, error } = await supabase
    .from('usuarios')
    .select('nombre, correo')
    .eq('id_usuario', id)
    .single();
  if (error) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { data: prof } = await supabase
    .from(tablaPerfil(rol))
    .select('telefono')
    .eq('id_usuario', id)
    .maybeSingle();

  res.json({ nombre: u.nombre, correo: u.correo, rol, telefono: prof?.telefono ?? null });
});

// PATCH /api/perfil — editar mi propio perfil
// body: { nombre?, telefono?, password_actual?, password_nueva? }
router.patch('/', verificarToken, async (req, res) => {
  const { id, rol } = req.usuario;
  const { nombre, telefono, password_actual, password_nueva } = req.body;

  // 1. Nombre (tabla usuarios)
  if (nombre !== undefined && nombre.trim()) {
    await supabase.from('usuarios').update({ nombre: nombre.trim() }).eq('id_usuario', id);
  }

  // 2. Teléfono (tabla según rol). Si no existe el perfil, se crea.
  if (telefono !== undefined) {
    const tabla = tablaPerfil(rol);
    const { data: existe } = await supabase.from(tabla).select('id_usuario').eq('id_usuario', id).maybeSingle();
    if (existe) {
      await supabase.from(tabla).update({ telefono: telefono || null }).eq('id_usuario', id);
    } else {
      await supabase.from(tabla).insert({ id_usuario: id, telefono: telefono || null }).then(() => {}, () => {});
    }
  }

  // 3. Contraseña — requiere la actual por seguridad
  if (password_nueva) {
    if (password_nueva.length < 8)
      return res.status(400).json({ error: 'La nueva contraseña debe tener mínimo 8 caracteres' });
    if (!password_actual)
      return res.status(400).json({ error: 'Debes ingresar tu contraseña actual' });

    const { data: u } = await supabase.from('usuarios').select('password_hash').eq('id_usuario', id).single();
    const coincide = await bcrypt.compare(password_actual, u.password_hash);
    if (!coincide) return res.status(401).json({ error: 'La contraseña actual no es correcta' });

    const hash = await bcrypt.hash(password_nueva, 10);
    await supabase.from('usuarios').update({ password_hash: hash }).eq('id_usuario', id);
  }

  // Devolver el perfil actualizado
  const { data: u2 } = await supabase.from('usuarios').select('nombre, correo').eq('id_usuario', id).single();
  const { data: prof } = await supabase.from(tablaPerfil(rol)).select('telefono').eq('id_usuario', id).maybeSingle();
  res.json({ nombre: u2.nombre, correo: u2.correo, rol, telefono: prof?.telefono ?? null });
});

module.exports = router;
