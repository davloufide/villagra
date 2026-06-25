const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// ── Helper: recalcular estado y % avance de un mantenimiento ──
// Reglas:
//   sin tareas            -> estado 'recibido',   avance 0
//   tareas en proceso     -> estado 'en_progreso', avance = completadas/total
//   todas completadas     -> estado 'terminado',  avance 100
async function recalcularMantenimiento(id_mantenimiento) {
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
  let query = supabase
    .from('mantenimientos')
    .select(`
      id_mantenimiento, fecha_ingreso, fecha_estimada_entrega,
      estado, porcentaje_avance, observaciones_cliente,
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
  const listaServicios = Array.isArray(servicios) && servicios.length
    ? servicios
    : (id_tipo_servicio ? [id_tipo_servicio] : []);

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

  const { data, error } = await supabase
    .from('mantenimientos')
    .insert({ id_vehiculo, fecha_estimada_entrega: fecha_estimada_entrega || null, observaciones_cliente: observaciones_cliente || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Asignación automática: una tarea por servicio, repartiendo entre mecánicos
  let tareasCreadas = 0;
  let aviso = null;
  if (listaServicios.length) {
    for (const sid of listaServicios) {
      const id_empleado = await elegirMecanico();
      if (!id_empleado) { aviso = 'Cita registrada. No hay mecánicos disponibles; el administrador asignará el trabajo.'; break; }
      const { error: tErr } = await supabase
        .from('tareas')
        .insert({ id_mantenimiento: data.id_mantenimiento, id_empleado, id_tipo_servicio: sid });
      if (!tErr) tareasCreadas++;
    }
    if (tareasCreadas) {
      const est = await recalcularMantenimiento(data.id_mantenimiento);
      data.estado = est.estado;
      data.porcentaje_avance = est.porcentaje_avance;
    }
  }

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

  // Si es mecánico, verificar que la tarea le pertenece
  if (req.usuario.rol === 'mecanico') {
    const { data: emp } = await supabase
      .from('empleados').select('id_empleado').eq('id_usuario', req.usuario.id).single();
    if (!emp) return res.status(403).json({ error: 'Empleado no encontrado' });

    const { data: tarea } = await supabase
      .from('tareas').select('id_empleado').eq('id_tarea', req.params.idTarea).single();
    if (!tarea || tarea.id_empleado !== emp.id_empleado)
      return res.status(403).json({ error: 'Esta tarea no está asignada a ti' });
  }

  const { id_tipo_servicio, id_empleado, descripcion } = req.body;
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

  const cambios = {};
  if (observaciones_cliente !== undefined)  cambios.observaciones_cliente = observaciones_cliente || null;
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

module.exports = router;
