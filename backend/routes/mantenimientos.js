const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');
const { hoyCR, esFechaValida } = require('../utils/fechas');

const MAX_OBS = 500;

// Fecha estimada de entrega (OPE-013): formato válido y no anterior a hoy.
// Devuelve el mensaje de error o null si es válida (vacía = "por confirmar").
function errorFechaEntrega(fecha) {
  if (!fecha) return null;
  if (!esFechaValida(fecha)) return 'La fecha estimada de entrega no es válida';
  if (fecha < hoyCR()) return 'La fecha estimada de entrega no puede ser anterior a hoy';
  return null;
}

function errorObservaciones(obs) {
  if (obs && String(obs).length > MAX_OBS) return `Las observaciones no pueden superar ${MAX_OBS} caracteres`;
  return null;
}

// Estado actual del mantenimiento + si ya tiene factura (para bloquear cambios)
async function infoMantenimiento(id_mantenimiento) {
  const { data } = await supabase
    .from('mantenimientos')
    .select('id_mantenimiento, estado, observaciones_cliente, facturas(id_factura)')
    .eq('id_mantenimiento', id_mantenimiento)
    .maybeSingle();
  return data;
}

const MSG_CANCELADO = 'Este mantenimiento está cancelado: ya no admite cambios';

// ── Helper: recalcular estado y % avance de un mantenimiento ──
// Reglas:
//   sin tareas            -> estado 'recibido',   avance 0
//   tareas en proceso     -> estado 'en_progreso', avance = completadas/total
//   todas completadas     -> estado 'terminado',  avance 100
async function recalcularMantenimiento(id_mantenimiento) {
  // Un mantenimiento cancelado queda congelado (no vuelve a recibido/en progreso)
  const info = await infoMantenimiento(id_mantenimiento);
  if (info?.estado === 'cancelado') return { estado: 'cancelado', porcentaje_avance: 0 };

  const { data: tareas } = await supabase
    .from('tareas')
    .select('estado')
    .eq('id_mantenimiento', id_mantenimiento);

  const total = tareas?.length ?? 0;
  let estado = 'recibido';
  let porcentaje = 0;

  if (total > 0) {
    const completadas = tareas.filter(t => t.estado === 'completada').length;
    porcentaje = Math.round((completadas / total) * 100);
    estado = completadas === total ? 'terminado' : 'en_progreso';
  }

  await supabase
    .from('mantenimientos')
    .update({ estado, porcentaje_avance: porcentaje })
    .eq('id_mantenimiento', id_mantenimiento);

  return { estado, porcentaje_avance: porcentaje };
}

// ── Helper: elegir el mecánico activo con menos tareas pendientes ──
async function elegirMecanico() {
  // mecánicos = usuarios con rol 2 (mecanico) y activos
  const { data: users } = await supabase
    .from('usuarios').select('id_usuario').eq('id_rol', 2).eq('activo', true);
  const ids = (users ?? []).map(u => u.id_usuario);
  if (!ids.length) return null;

  const { data: emps } = await supabase
    .from('empleados').select('id_empleado').in('id_usuario', ids);
  if (!emps || !emps.length) return null;

  // contar tareas no completadas por mecánico para balancear la carga
  const { data: activas } = await supabase
    .from('tareas').select('id_empleado').neq('estado', 'completada');
  const carga = {};
  (activas ?? []).forEach(t => { carga[t.id_empleado] = (carga[t.id_empleado] ?? 0) + 1; });

  emps.sort((a, b) => (carga[a.id_empleado] ?? 0) - (carga[b.id_empleado] ?? 0));
  return emps[0].id_empleado;
}

// GET /api/mantenimientos — lista según rol
router.get('/', verificarToken, async (req, res) => {
  const { rol, id } = req.usuario;
  // `*` incluye estado_cita cuando la columna existe (y no rompe si aún no se
  // corrió la migración, ya que solo devuelve las columnas presentes).
  let query = supabase
    .from('mantenimientos')
    .select(`
      *,
      vehiculos(placa, marcas(nombre_marca), clientes(usuarios(nombre)))
    `)
    .order('fecha_ingreso', { ascending: false });

  if (rol === 'mecanico') {
    const { data: emp } = await supabase
      .from('empleados').select('id_empleado').eq('id_usuario', id).single();
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const { data: ids } = await supabase
      .from('tareas').select('id_mantenimiento').eq('id_empleado', emp.id_empleado);
    const idList = [...new Set((ids ?? []).map(t => t.id_mantenimiento))];
    query = query.in('id_mantenimiento', idList.length ? idList : [0]);
  }

  if (rol === 'cliente') {
    const { data: cli } = await supabase
      .from('clientes').select('id_cliente').eq('id_usuario', id).single();
    if (!cli) return res.status(404).json({ error: 'Cliente no encontrado' });

    const { data: veh } = await supabase
      .from('vehiculos').select('id_vehiculo').eq('id_cliente', cli.id_cliente);
    const vehIds = (veh ?? []).map(v => v.id_vehiculo);
    query = query.in('id_vehiculo', vehIds.length ? vehIds : [0]);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/mantenimientos/solicitudes — citas pendientes de confirmación ("bolsa")
// Visible para admin y mecánicos. DEBE IR ANTES DE /:id.
router.get('/solicitudes', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  // Se incluye el teléfono del cliente (y si es un invitado sin cuenta) para
  // que el taller pueda llamarlo al confirmar. `es_invitado` es una columna
  // nueva: si la migración aún no se corrió, se reintenta sin ella.
  const consulta = (campoInvitado) => supabase
    .from('mantenimientos')
    .select(`
      id_mantenimiento, fecha_ingreso, fecha_estimada_entrega, observaciones_cliente, estado_cita,
      vehiculos(placa, marcas(nombre_marca), clientes(telefono, usuarios(nombre${campoInvitado}))),
      tareas(id_tarea, tipos_servicio(nombre))
    `)
    .eq('estado_cita', 'solicitada')
    .neq('estado', 'cancelado')
    .order('fecha_ingreso', { ascending: false });

  let { data, error } = await consulta(', es_invitado');
  if (error && /es_invitado/i.test(error.message || '')) {
    ({ data, error } = await consulta(''));
  }

  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// GET /api/mantenimientos/:id — detalle con tareas
router.get('/:id', verificarToken, async (req, res) => {
  const { data, error } = await supabase
    .from('mantenimientos')
    .select(`
      *,
      vehiculos(placa, marcas(nombre_marca), clientes(usuarios(nombre))),
      tareas(
        id_tarea, id_empleado, id_tipo_servicio, descripcion, estado,
        tiempo_invertido, resultado, observaciones_tecnicas,
        empleados(usuarios(nombre)),
        tipos_servicio(nombre)
      ),
      facturas(id_factura, numero_orden, total, estado)
    `)
    .eq('id_mantenimiento', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Mantenimiento no encontrado' });

  // Ordenar las tareas por la columna `orden` si existe (best-effort: si la
  // columna aún no fue creada, se mantiene el orden por id_tarea).
  try {
    const { data: ords, error: ordErr } = await supabase
      .from('tareas').select('id_tarea, orden').eq('id_mantenimiento', req.params.id);
    if (!ordErr && ords && data.tareas) {
      const map = Object.fromEntries(ords.map(o => [o.id_tarea, o.orden ?? 0]));
      data.tareas.sort((a, b) => (map[a.id_tarea] ?? 0) - (map[b.id_tarea] ?? 0) || a.id_tarea - b.id_tarea);
    }
  } catch {}

  res.json(data);
});

// POST /api/mantenimientos — crear (admin o cliente para su propio vehículo)
// Si se envía id_tipo_servicio, se crea automáticamente una tarea y se
// asigna al mecánico con menos carga (así la cita llega directo al taller).
router.post('/', verificarToken, soloRol('administrador', 'cliente', 'mecanico'), async (req, res) => {
  const { id_vehiculo, fecha_estimada_entrega, observaciones_cliente, id_tipo_servicio, servicios } = req.body;
  if (!id_vehiculo)
    return res.status(400).json({ error: 'id_vehiculo requerido' });

  // Servicios solicitados: acepta un array `servicios` o un único `id_tipo_servicio`
  // (sin repetidos: un mismo servicio no se agrega dos veces, OPE-006)
  const listaServicios = [...new Set((Array.isArray(servicios) && servicios.length
    ? servicios
    : (id_tipo_servicio ? [id_tipo_servicio] : [])).map(Number).filter(Boolean))];

  const errDatos = errorFechaEntrega(fecha_estimada_entrega) || errorObservaciones(observaciones_cliente);
  if (errDatos) return res.status(400).json({ error: errDatos });

  // Si es cliente, verificar que el vehículo le pertenece
  if (req.usuario.rol === 'cliente') {
    const { data: cli } = await supabase
      .from('clientes').select('id_cliente').eq('id_usuario', req.usuario.id).single();
    if (!cli) return res.status(403).json({ error: 'Cliente no encontrado' });

    const { data: veh } = await supabase
      .from('vehiculos').select('id_vehiculo')
      .eq('id_vehiculo', id_vehiculo).eq('id_cliente', cli.id_cliente).single();
    if (!veh) return res.status(403).json({ error: 'Este vehículo no te pertenece' });
  }

  // Validar disponibilidad del día pedido (si existe la tabla de días bloqueados)
  if (fecha_estimada_entrega) {
    try {
      const { data: bloq } = await supabase
        .from('dias_bloqueados').select('fecha').eq('fecha', fecha_estimada_entrega).maybeSingle();
      if (bloq) return res.status(409).json({ error: 'Ese día no está disponible para citas. Elige otra fecha.' });
    } catch { /* si la tabla aún no existe, no se valida */ }
  }

  // El cliente crea una SOLICITUD (pendiente de confirmación); el personal crea
  // citas ya confirmadas. estado_cita es una columna nueva: si aún no se corrió
  // la migración, se reintenta el insert sin ella.
  const esCliente = req.usuario.rol === 'cliente';
  const estado_cita = esCliente ? 'solicitada' : 'confirmada';
  const registro = {
    id_vehiculo,
    fecha_estimada_entrega: fecha_estimada_entrega || null,
    observaciones_cliente: observaciones_cliente || null
  };

  let data, error;
  ({ data, error } = await supabase
    .from('mantenimientos').insert({ ...registro, estado_cita }).select().single());
  if (error && (error.code === 'PGRST204' || /estado_cita/i.test(error.message || ''))) {
    ({ data, error } = await supabase.from('mantenimientos').insert(registro).select().single());
  }
  if (error) return res.status(500).json({ error: error.message });

  // Una tarea por servicio. El cliente NO asigna mecánico: la cita entra a la
  // "bolsa" para que un mecánico la confirme (o el admin la asigne). El personal
  // sí puede auto-asignar al menos cargado (compatibilidad).
  let tareasCreadas = 0;
  let aviso = null;
  if (listaServicios.length) {
    for (const sid of listaServicios) {
      const id_empleado = esCliente ? null : await elegirMecanico();
      const { error: tErr } = await supabase
        .from('tareas')
        .insert({ id_mantenimiento: data.id_mantenimiento, id_empleado, id_tipo_servicio: sid });
      if (!tErr) tareasCreadas++;
    }
  }
  if (esCliente) aviso = 'Cita solicitada. Un mecánico o el administrador la confirmará pronto.';

  res.status(201).json({ ...data, tareas_creadas: tareasCreadas, aviso });
});

// POST /api/mantenimientos/:id/tareas — agregar tarea (admin o mecánico)
// - admin: id_empleado opcional (si falta, se asigna al menos cargado)
// - mecánico: la tarea siempre se asigna a sí mismo
router.post('/:id/tareas', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  let { id_empleado, id_tipo_servicio, descripcion } = req.body;
  const id_mantenimiento = parseInt(req.params.id);

  if (!id_tipo_servicio)
    return res.status(400).json({ error: 'id_tipo_servicio es requerido' });

  const info = await infoMantenimiento(id_mantenimiento);
  if (!info) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
  if (info.estado === 'cancelado') return res.status(409).json({ error: MSG_CANCELADO });

  // OPE-006: no repetir un servicio que ya es tarea de este mantenimiento
  const { data: repetida } = await supabase
    .from('tareas').select('id_tarea')
    .eq('id_mantenimiento', id_mantenimiento).eq('id_tipo_servicio', id_tipo_servicio).limit(1);
  if ((repetida ?? []).length)
    return res.status(409).json({ error: 'Ese servicio ya es una tarea de este mantenimiento' });

  if (req.usuario.rol === 'mecanico') {
    const { data: emp } = await supabase
      .from('empleados').select('id_empleado').eq('id_usuario', req.usuario.id).single();
    if (!emp) return res.status(403).json({ error: 'Empleado no encontrado' });
    id_empleado = emp.id_empleado;
  } else if (!id_empleado) {
    id_empleado = await elegirMecanico();
    if (!id_empleado) return res.status(400).json({ error: 'No hay mecánicos disponibles para asignar' });
  }

  const { data, error } = await supabase
    .from('tareas')
    .insert({ id_mantenimiento, id_empleado, id_tipo_servicio, descripcion: descripcion || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Asignar `orden` al final (best-effort; si la columna no existe se ignora)
  try {
    const { data: existing, error: exErr } = await supabase
      .from('tareas').select('orden').eq('id_mantenimiento', id_mantenimiento);
    if (!exErr) {
      const maxOrden = Math.max(0, ...(existing ?? []).map(x => x.orden ?? 0));
      await supabase.from('tareas').update({ orden: maxOrden + 1 }).eq('id_tarea', data.id_tarea);
    }
  } catch {}

  // Al agregar una tarea, el mantenimiento pasa a 'en_progreso'
  const estado = await recalcularMantenimiento(id_mantenimiento);
  res.status(201).json({ ...data, mantenimiento: estado });
});

// POST /api/mantenimientos/:id/reordenar — guardar el orden de las tareas (admin)
router.post('/:id/reordenar', verificarToken, soloRol('administrador'), async (req, res) => {
  const { orden } = req.body; // array de id_tarea en el orden deseado
  if (!Array.isArray(orden) || !orden.length)
    return res.status(400).json({ error: 'Se requiere el arreglo "orden" con los id de tarea' });

  for (let i = 0; i < orden.length; i++) {
    const { error } = await supabase
      .from('tareas').update({ orden: i + 1 })
      .eq('id_tarea', orden[i]).eq('id_mantenimiento', req.params.id);
    if (error) return res.status(500).json({ error: 'No se pudo reordenar (¿falta la columna "orden"?): ' + error.message });
  }
  res.json({ ok: true });
});

// PATCH /api/mantenimientos/tareas/:idTarea — actualizar estado de tarea (admin/mecánico)
router.patch('/tareas/:idTarea', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { estado, tiempo_invertido, resultado, observaciones_tecnicas } = req.body;
  const { id_tipo_servicio, id_empleado, descripcion } = req.body;

  const { data: tarea } = await supabase
    .from('tareas').select('id_tarea, id_mantenimiento, id_empleado, estado')
    .eq('id_tarea', req.params.idTarea).maybeSingle();
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });

  // Si es mecánico, verificar que la tarea le pertenece
  if (req.usuario.rol === 'mecanico') {
    const { data: emp } = await supabase
      .from('empleados').select('id_empleado').eq('id_usuario', req.usuario.id).single();
    if (!emp) return res.status(403).json({ error: 'Empleado no encontrado' });
    if (tarea.id_empleado !== emp.id_empleado)
      return res.status(403).json({ error: 'Esta tarea no está asignada a ti' });
  }

  const info = await infoMantenimiento(tarea.id_mantenimiento);
  if (info?.estado === 'cancelado') return res.status(409).json({ error: MSG_CANCELADO });

  // Reabrir una tarea completada por error (GM-003 / OPE-011): se permite
  // mientras el mantenimiento no esté facturado.
  if (estado !== undefined && estado !== 'completada' && tarea.estado === 'completada' && info?.facturas)
    return res.status(409).json({ error: 'El mantenimiento ya fue facturado: no se pueden reabrir sus tareas' });

  // OPE-006: al cambiar el servicio, que no quede repetido en el mantenimiento
  if (id_tipo_servicio !== undefined) {
    const { data: repetida } = await supabase
      .from('tareas').select('id_tarea')
      .eq('id_mantenimiento', tarea.id_mantenimiento).eq('id_tipo_servicio', parseInt(id_tipo_servicio))
      .neq('id_tarea', tarea.id_tarea).limit(1);
    if ((repetida ?? []).length)
      return res.status(409).json({ error: 'Ese servicio ya es otra tarea de este mantenimiento' });
  }

  const cambios = { updated_at: new Date() };
  if (estado !== undefined)                 cambios.estado = estado;
  if (tiempo_invertido !== undefined)       cambios.tiempo_invertido = tiempo_invertido;
  if (resultado !== undefined)              cambios.resultado = resultado;
  if (observaciones_tecnicas !== undefined) cambios.observaciones_tecnicas = observaciones_tecnicas;
  // Edición de la tarea (OPE-008): servicio y descripción; reasignar mecánico solo admin
  if (id_tipo_servicio !== undefined)       cambios.id_tipo_servicio = parseInt(id_tipo_servicio);
  if (descripcion !== undefined)            cambios.descripcion = descripcion || null;
  if (id_empleado !== undefined && req.usuario.rol === 'administrador')
    cambios.id_empleado = parseInt(id_empleado);

  const { data, error } = await supabase
    .from('tareas')
    .update(cambios)
    .eq('id_tarea', req.params.idTarea)
    .select('id_tarea, id_mantenimiento')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Recalcular el avance del mantenimiento padre
  const mant = await recalcularMantenimiento(data.id_mantenimiento);
  res.json({ ...data, mantenimiento: mant });
});

// Helper: ¿el mecánico tiene alguna tarea en este mantenimiento?
async function mecanicoEnMantenimiento(id_usuario, id_mantenimiento) {
  const { data: emp } = await supabase
    .from('empleados').select('id_empleado').eq('id_usuario', id_usuario).single();
  if (!emp) return false;
  const { data: t } = await supabase
    .from('tareas').select('id_tarea')
    .eq('id_mantenimiento', id_mantenimiento).eq('id_empleado', emp.id_empleado).limit(1);
  return (t ?? []).length > 0;
}

// PATCH /api/mantenimientos/:id — editar info del mantenimiento (admin o mecánico)
router.patch('/:id', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { observaciones_cliente, fecha_estimada_entrega } = req.body;
  const id = parseInt(req.params.id);

  // El mecánico solo puede editar mantenimientos donde tiene tareas asignadas
  if (req.usuario.rol === 'mecanico') {
    const ok = await mecanicoEnMantenimiento(req.usuario.id, id);
    if (!ok) return res.status(403).json({ error: 'No tienes tareas en este mantenimiento' });
  }

  const info = await infoMantenimiento(id);
  if (!info) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
  if (info.estado === 'cancelado') return res.status(409).json({ error: MSG_CANCELADO });

  // OPE-004 / OPE-013: validar antes de guardar
  const errDatos = errorFechaEntrega(fecha_estimada_entrega) || errorObservaciones(observaciones_cliente);
  if (errDatos) return res.status(400).json({ error: errDatos });

  const cambios = {};
  if (observaciones_cliente !== undefined)  cambios.observaciones_cliente = String(observaciones_cliente ?? '').trim() || null;
  if (fecha_estimada_entrega !== undefined) cambios.fecha_estimada_entrega = fecha_estimada_entrega || null;

  if (!Object.keys(cambios).length)
    return res.status(400).json({ error: 'No hay cambios para guardar' });

  const { data, error } = await supabase
    .from('mantenimientos').update(cambios).eq('id_mantenimiento', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/mantenimientos/tareas/:idTarea — quitar una tarea (admin o mecánico dueño)
router.delete('/tareas/:idTarea', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { data: tarea } = await supabase
    .from('tareas').select('id_tarea, id_mantenimiento, id_empleado').eq('id_tarea', req.params.idTarea).single();
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });

  const info = await infoMantenimiento(tarea.id_mantenimiento);
  if (info?.estado === 'cancelado') return res.status(409).json({ error: MSG_CANCELADO });

  if (req.usuario.rol === 'mecanico') {
    const { data: emp } = await supabase
      .from('empleados').select('id_empleado').eq('id_usuario', req.usuario.id).single();
    if (!emp || tarea.id_empleado !== emp.id_empleado)
      return res.status(403).json({ error: 'Esta tarea no está asignada a ti' });
  }

  const { error } = await supabase.from('tareas').delete().eq('id_tarea', req.params.idTarea);
  if (error) return res.status(500).json({ error: error.message });

  const mant = await recalcularMantenimiento(tarea.id_mantenimiento);
  res.json({ ok: true, mantenimiento: mant });
});

// PATCH /api/mantenimientos/:id/confirmar — aceptar una cita (admin o mecánico)
// - mecánico: se autoasigna todas las tareas de la cita.
// - admin: debe enviar { id_empleado } (a qué mecánico se asigna).
// La cita pasa a estado_cita='confirmada'.
router.patch('/:id/confirmar', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const id = parseInt(req.params.id);
  let id_empleado;

  const info = await infoMantenimiento(id);
  if (!info) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
  if (info.estado === 'cancelado') return res.status(409).json({ error: MSG_CANCELADO });

  if (req.usuario.rol === 'mecanico') {
    const { data: emp } = await supabase
      .from('empleados').select('id_empleado').eq('id_usuario', req.usuario.id).single();
    if (!emp) return res.status(403).json({ error: 'Empleado no encontrado' });
    id_empleado = emp.id_empleado;
  } else {
    id_empleado = req.body.id_empleado ? parseInt(req.body.id_empleado) : null;
    if (!id_empleado) return res.status(400).json({ error: 'Selecciona el mecánico a asignar' });
  }

  // Asignar todas las tareas de la cita a ese mecánico
  const { error: eT } = await supabase
    .from('tareas').update({ id_empleado }).eq('id_mantenimiento', id);
  if (eT) return res.status(500).json({ error: eT.message });

  const { data, error } = await supabase
    .from('mantenimientos').update({ estado_cita: 'confirmada' })
    .eq('id_mantenimiento', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/mantenimientos/:id/rechazar — rechazar/soltar una cita (admin o mecánico)
// Devuelve la cita a la "bolsa": estado_cita='solicitada' y desasigna las tareas.
router.patch('/:id/rechazar', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const id = parseInt(req.params.id);

  const { error: eT } = await supabase
    .from('tareas').update({ id_empleado: null }).eq('id_mantenimiento', id);
  if (eT) return res.status(500).json({ error: eT.message });

  const { data, error } = await supabase
    .from('mantenimientos').update({ estado_cita: 'solicitada' })
    .eq('id_mantenimiento', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/mantenimientos/:id/cancelar — cancelar con justificación (admin) [OPE-012]
// Solo si está recibido o en progreso. Libera a los mecánicos (desasigna las
// tareas) y deja el mantenimiento congelado en estado 'cancelado'.
router.patch('/:id/cancelar', verificarToken, soloRol('administrador'), async (req, res) => {
  const id = parseInt(req.params.id);
  const motivo = String(req.body.motivo ?? '').trim();
  if (motivo.length < 5)
    return res.status(400).json({ error: 'Ingresa la justificación de la cancelación (mínimo 5 caracteres)' });
  if (motivo.length > MAX_OBS)
    return res.status(400).json({ error: `La justificación no puede superar ${MAX_OBS} caracteres` });

  const info = await infoMantenimiento(id);
  if (!info) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
  if (info.estado === 'cancelado') return res.status(409).json({ error: 'Este mantenimiento ya está cancelado' });
  if (info.estado === 'terminado' || info.facturas)
    return res.status(409).json({ error: 'No se puede cancelar un mantenimiento terminado' });

  // Primero liberar las tareas (el trigger de tareas recalcula el estado del
  // mantenimiento) y DESPUÉS marcarlo cancelado, para que nada lo pise.
  const { error: eT } = await supabase
    .from('tareas').update({ id_empleado: null }).eq('id_mantenimiento', id);
  if (eT) return res.status(500).json({ error: eT.message });

  // motivo_cancelacion es una columna nueva (migracion-cancelacion.sql): si
  // aún no existe, la justificación se anota en las observaciones.
  let { data, error } = await supabase
    .from('mantenimientos').update({ estado: 'cancelado', motivo_cancelacion: motivo })
    .eq('id_mantenimiento', id).select().single();
  if (error && (error.code === 'PGRST204' || /motivo_cancelacion/i.test(error.message || ''))) {
    const obs = [info.observaciones_cliente, `[Cancelado] ${motivo}`].filter(Boolean).join('\n');
    ({ data, error } = await supabase
      .from('mantenimientos').update({ estado: 'cancelado', observaciones_cliente: obs })
      .eq('id_mantenimiento', id).select().single());
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
