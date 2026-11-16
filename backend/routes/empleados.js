const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');
const { esCorreoValido, MSG_CORREO } = require('../utils/validacion');
const { hoyCR, esFechaValida } = require('../utils/fechas');

// "Días faltantes": los mecánicos trabajan por servicios profesionales, así que
// no tienen vacaciones ni saldo. Solo se registra (y aprueba) cuándo van a
// faltar. La tabla sigue llamándose `vacaciones` para no tocar el esquema; la
// columna empleados.dias_vacaciones queda sin uso.

// Valida el rango y los días de una ausencia. Devuelve el mensaje de error o null.
function errorAusencia(fecha_inicio, fecha_fin, dias) {
  if (!esFechaValida(fecha_inicio) || !esFechaValida(fecha_fin))
    return 'Indicá las fechas de inicio y fin';
  if (fecha_fin < fecha_inicio)
    return 'La fecha fin no puede ser anterior a la de inicio';
  if (!Number.isInteger(dias) || dias <= 0)
    return 'Los días deben ser un número mayor a 0';
  return null;
}

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

  // Días faltados en el año en curso (ausencias aprobadas que empiezan este año)
  const anio = hoyCR().slice(0, 4);
  const { data: aus } = await supabase
    .from('vacaciones').select('id_empleado, dias_habiles')
    .eq('estado', 'aprobada')
    .gte('fecha_inicio', `${anio}-01-01`).lte('fecha_inicio', `${anio}-12-31`);
  const faltados = {};
  (aus ?? []).forEach(a => { faltados[a.id_empleado] = (faltados[a.id_empleado] ?? 0) + (a.dias_habiles ?? 0); });

  res.json(data.map(e => ({ ...e, dias_faltados: faltados[e.id_empleado] ?? 0 })));
});

// POST /api/empleados — crear empleado con cuenta (admin)
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, correo, password, id_rol, telefono, tipo_empleo, fecha_ingreso, especialidad } = req.body;

  if (!nombre || !correo || !password || !id_rol)
    return res.status(400).json({ error: 'nombre, correo, password e id_rol requeridos' });

  if (!esCorreoValido(correo))
    return res.status(400).json({ error: MSG_CORREO });

  if (password.length < 8)
    return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });

  const hash = await bcrypt.hash(password, 10);

  const { data: usuario, error: errU } = await supabase
    .from('usuarios')
    .insert({ nombre, correo: correo.toLowerCase().trim(), password_hash: hash, id_rol })
    .select('id_usuario')
    .single();

  if (errU) {
    if (errU.code === '23505') return res.status(409).json({ error: 'Correo ya registrado' });
    return res.status(500).json({ error: errU.message });
  }

  const { data, error } = await supabase
    .from('empleados')
    .insert({ id_usuario: usuario.id_usuario, telefono, tipo_empleo, fecha_ingreso, dias_vacaciones: 0, especialidad })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ...data, id_usuario: usuario.id_usuario });
});

// GET /api/empleados/vacaciones — ausencias pendientes de aprobar (admin)
router.get('/vacaciones', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('vacaciones')
    .select('*, empleados(usuarios(nombre))')
    .eq('estado', 'pendiente')
    .order('created_at');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/empleados/vacaciones/historial — TODO el historial de días faltantes (admin) [#6]
// Devuelve todas las solicitudes con el nombre del empleado y sus fechas. El
// front las agrupa por estado (solicitadas / aprobadas / rechazadas) y calcula
// las "próximas" y las "ya pasadas" según las fechas.
router.get('/vacaciones/historial', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('vacaciones')
    .select('*, empleados(usuarios(nombre))')
    .order('fecha_inicio', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// GET /api/empleados/mis-vacaciones — días faltantes del propio empleado
// (mecánico o admin): sus solicitudes + los días faltados en el año en curso.
router.get('/mis-vacaciones', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { data: emp } = await supabase
    .from('empleados').select('id_empleado').eq('id_usuario', req.usuario.id).single();
  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

  const { data: solicitudes, error } = await supabase
    .from('vacaciones').select('*')
    .eq('id_empleado', emp.id_empleado)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const anio = hoyCR().slice(0, 4);
  const dias_faltados = (solicitudes ?? [])
    .filter(v => v.estado === 'aprobada' && String(v.fecha_inicio).startsWith(anio))
    .reduce((t, v) => t + (v.dias_habiles ?? 0), 0);

  res.json({ dias_faltados, solicitudes: solicitudes ?? [] });
});

// POST /api/empleados/vacaciones — el empleado avisa qué días va a faltar
router.post('/vacaciones', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.body;
  const dias = Number(req.body.dias_habiles);
  const errMsg = errorAusencia(fecha_inicio, fecha_fin, dias);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const { data: emp } = await supabase
    .from('empleados').select('id_empleado').eq('id_usuario', req.usuario.id).single();

  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

  const { data, error } = await supabase
    .from('vacaciones')
    .insert({ id_empleado: emp.id_empleado, fecha_inicio, fecha_fin, dias_habiles: dias })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// POST /api/empleados/vacaciones/registrar — el admin registra directamente
// días que un empleado faltó (queda aprobado; no hay saldo que descontar)
router.post('/vacaciones/registrar', verificarToken, soloRol('administrador'), async (req, res) => {
  const { id_empleado, fecha_inicio, fecha_fin } = req.body;
  const dias = Number(req.body.dias_habiles);

  if (!id_empleado) return res.status(400).json({ error: 'id_empleado es requerido' });
  const errMsg = errorAusencia(fecha_inicio, fecha_fin, dias);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const { data: emp } = await supabase
    .from('empleados').select('id_empleado').eq('id_empleado', id_empleado).single();
  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

  const { data, error } = await supabase
    .from('vacaciones')
    .insert({ id_empleado, fecha_inicio, fecha_fin, dias_habiles: dias, estado: 'aprobada' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/empleados/vacaciones/:id — aprobar o rechazar (admin)
// Al RECHAZAR hay que escribir el motivo: el empleado lo ve en su módulo
// "Días faltantes", así sabe por qué se le negó y puede pedir otras fechas.
router.patch('/vacaciones/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const { estado } = req.body;
  const motivo = String(req.body.motivo ?? '').trim();

  if (!['aprobada', 'rechazada'].includes(estado))
    return res.status(400).json({ error: 'estado debe ser aprobada o rechazada' });
  if (estado === 'rechazada' && motivo.length < 3)
    return res.status(400).json({ error: 'Escribí el motivo del rechazo para que el empleado sepa por qué' });

  const { data: vac } = await supabase
    .from('vacaciones').select('*').eq('id_vacacion', req.params.id).single();
  if (!vac) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (vac.estado !== 'pendiente')
    return res.status(409).json({ error: 'Esta solicitud ya fue procesada' });

  // El motivo solo aplica al rechazo; aprobar lo deja limpio (por si la
  // solicitud se rechazó antes y se está corrigiendo).
  const cambios = { estado, motivo_rechazo: estado === 'rechazada' ? motivo : null };

  // Columna nueva: si la migración aún no se corrió, guardar solo el estado.
  let data, error;
  ({ data, error } = await supabase
    .from('vacaciones').update(cambios).eq('id_vacacion', req.params.id).select().single());
  if (error && (error.code === 'PGRST204' || /motivo_rechazo/i.test(error.message || ''))) {
    ({ data, error } = await supabase
      .from('vacaciones').update({ estado }).eq('id_vacacion', req.params.id).select().single());
  }

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
