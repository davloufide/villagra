const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// GET /api/empleados — lista de empleados (admin)
router.get('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('empleados')
    .select(`
      id_empleado, telefono, tipo_empleo, fecha_ingreso, dias_vacaciones, especialidad,
      usuarios(nombre, correo, activo, roles(nombre))
    `)
    .order('id_empleado');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/empleados — crear empleado con cuenta (admin)
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, correo, password, id_rol, telefono, tipo_empleo, fecha_ingreso, dias_vacaciones, especialidad } = req.body;

  if (!nombre || !correo || !password || !id_rol)
    return res.status(400).json({ error: 'nombre, correo, password e id_rol requeridos' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });

  const hash = await bcrypt.hash(password, 10);

  const { data: usuario, error: errU } = await supabase
    .from('usuarios')
    .insert({ nombre, correo: correo.toLowerCase(), password_hash: hash, id_rol })
    .select('id_usuario')
    .single();

  if (errU) {
    if (errU.code === '23505') return res.status(409).json({ error: 'Correo ya registrado' });
    return res.status(500).json({ error: errU.message });
  }

  const { data, error } = await supabase
    .from('empleados')
    .insert({ id_usuario: usuario.id_usuario, telefono, tipo_empleo, fecha_ingreso, dias_vacaciones, especialidad })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ...data, id_usuario: usuario.id_usuario });
});

// GET /api/empleados/vacaciones — solicitudes pendientes (admin)
router.get('/vacaciones', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('vacaciones')
    .select('*, empleados(usuarios(nombre))')
    .eq('estado', 'pendiente')
    .order('created_at');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/empleados/vacaciones — solicitar vacaciones (empleado)
router.post('/vacaciones', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { fecha_inicio, fecha_fin, dias_habiles } = req.body;

  const { data: emp } = await supabase
    .from('empleados').select('id_empleado, dias_vacaciones').eq('id_usuario', req.usuario.id).single();

  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });
  if (emp.dias_vacaciones < dias_habiles)
    return res.status(400).json({ error: 'Días disponibles insuficientes' });

  const { data, error } = await supabase
    .from('vacaciones')
    .insert({ id_empleado: emp.id_empleado, fecha_inicio, fecha_fin, dias_habiles })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/empleados/vacaciones/:id — aprobar o rechazar (admin)
router.patch('/vacaciones/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const { estado } = req.body;
  if (!['aprobada', 'rechazada'].includes(estado))
    return res.status(400).json({ error: 'estado debe ser aprobada o rechazada' });

  const { data: vac } = await supabase
    .from('vacaciones').select('*').eq('id_vacacion', req.params.id).single();
  if (!vac) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (vac.estado !== 'pendiente')
    return res.status(409).json({ error: 'Esta solicitud ya fue procesada' });

  // Al aprobar, descontar los días disponibles del empleado (leer y escribir)
  if (estado === 'aprobada') {
    const { data: emp } = await supabase
      .from('empleados').select('dias_vacaciones').eq('id_empleado', vac.id_empleado).single();
    const restantes = Math.max(0, (emp?.dias_vacaciones ?? 0) - vac.dias_habiles);
    await supabase
      .from('empleados')
      .update({ dias_vacaciones: restantes })
      .eq('id_empleado', vac.id_empleado);
  }

  const { data, error } = await supabase
    .from('vacaciones')
    .update({ estado })
    .eq('id_vacacion', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
