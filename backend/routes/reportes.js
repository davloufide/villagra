const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');
const { hoyCR, mesActualCR, diaCR, inicioDiaCR, rangoMesCR, esFechaValida } = require('../utils/fechas');

// Rango opcional ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (RPS-002 / RPS-004).
// Devuelve { desde, hasta } (pueden venir vacíos) o { error } si es inválido.
function leerRango(query) {
  const desde = String(query.desde || '').slice(0, 10);
  const hasta = String(query.hasta || '').slice(0, 10);
  if (desde && !esFechaValida(desde)) return { error: 'La fecha "desde" no es válida' };
  if (hasta && !esFechaValida(hasta)) return { error: 'La fecha "hasta" no es válida' };
  if (desde && hasta && desde > hasta) return { error: 'La fecha "desde" no puede ser posterior a "hasta"' };
  if (desde && desde > hoyCR()) return { error: 'El rango no puede empezar en una fecha futura' };
  return { desde, hasta };
}

// GET /api/reportes/resumen — KPIs del mes actual (admin)
// El mes se calcula en hora de Costa Rica (el servidor corre en UTC).
router.get('/resumen', verificarToken, soloRol('administrador'), async (req, res) => {
  const { desde, hasta } = rangoMesCR(mesActualCR());

  const [mantenimientos, ingresos, stockBajo, empleados] = await Promise.all([
    supabase
      .from('mantenimientos')
      .select('id_mantenimiento, estado')
      .gte('fecha_ingreso', desde).lt('fecha_ingreso', hasta),

    supabase
      .from('facturas')
      .select('total')
      .gte('fecha_emision', desde).lt('fecha_emision', hasta),

    supabase
      .from('productos')
      .select('id_producto, cantidad_stock, stock_minimo')
      .eq('activo', true),

    supabase
      .from('empleados')
      .select('id_empleado, usuarios(activo)')
  ]);

  const totalIngresos = ingresos.data?.reduce((s, f) => s + parseFloat(f.total), 0) ?? 0;
  const stockBajoCount = (stockBajo.data ?? []).filter(p => p.cantidad_stock < p.stock_minimo).length;

  res.json({
    mantenimientos_mes: mantenimientos.data?.length ?? 0,
    completados_mes: mantenimientos.data?.filter(m => m.estado === 'terminado').length ?? 0,
    ingresos_mes: totalIngresos,
    stock_bajo: stockBajoCount,
    empleados_activos: empleados.data?.filter(e => e.usuarios?.activo).length ?? 0
  });
});

// GET /api/reportes/mantenimientos-mes?mes=YYYY-MM — demanda de un mes (admin) [RPS-001]
// Cuenta los mantenimientos ingresados en ese mes (hora CR) por estado y los lista.
router.get('/mantenimientos-mes', verificarToken, soloRol('administrador'), async (req, res) => {
  const mes = String(req.query.mes || mesActualCR());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))
    return res.status(400).json({ error: 'El mes no es válido (formato AAAA-MM)' });
  if (mes > mesActualCR())
    return res.status(400).json({ error: 'No se puede generar el reporte de un mes futuro' });

  const { desde, hasta } = rangoMesCR(mes);
  const { data, error } = await supabase
    .from('mantenimientos')
    .select('id_mantenimiento, fecha_ingreso, estado, porcentaje_avance, vehiculos(placa, clientes(usuarios(nombre)))')
    .gte('fecha_ingreso', desde).lt('fecha_ingreso', hasta)
    .order('fecha_ingreso', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const por_estado = { recibido: 0, en_progreso: 0, terminado: 0, cancelado: 0 };
  (data ?? []).forEach(m => { por_estado[m.estado] = (por_estado[m.estado] ?? 0) + 1; });

  res.json({
    mes,
    total: data?.length ?? 0,
    por_estado,
    mantenimientos: (data ?? []).map(m => ({
      id_mantenimiento: m.id_mantenimiento,
      fecha: diaCR(m.fecha_ingreso),
      estado: m.estado,
      porcentaje_avance: m.porcentaje_avance,
      placa: m.vehiculos?.placa ?? '-',
      cliente: m.vehiculos?.clientes?.usuarios?.nombre ?? '-'
    }))
  });
});

// GET /api/reportes/ingresos-mensuales — facturación agrupada por mes (admin) [RPS-002]
// Sin rango: últimos 6 meses. Con ?desde&hasta: ese período (validado).
router.get('/ingresos-mensuales', verificarToken, soloRol('administrador'), async (req, res) => {
  const rango = leerRango(req.query);
  if (rango.error) return res.status(400).json({ error: rango.error });

  let desde = rango.desde;
  if (!desde) {
    const [y, m] = mesActualCR().split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - 5, 1));
    desde = d.toISOString().slice(0, 10);
  }

  let query = supabase
    .from('facturas')
    .select('total, fecha_emision')
    .gte('fecha_emision', inicioDiaCR(desde))
    .order('fecha_emision');
  if (rango.hasta) {
    const sig = new Date(`${rango.hasta}T00:00:00Z`);
    sig.setUTCDate(sig.getUTCDate() + 1);
    query = query.lt('fecha_emision', inicioDiaCR(sig.toISOString().slice(0, 10)));
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Agrupar por mes CR (clave AAAA-MM para ordenar; etiqueta corta para el gráfico)
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const porMes = {};
  (data ?? []).forEach(f => {
    const clave = diaCR(f.fecha_emision).slice(0, 7);
    porMes[clave] = (porMes[clave] ?? 0) + parseFloat(f.total);
  });

  res.json(Object.keys(porMes).sort().map(clave => {
    const [y, m] = clave.split('-');
    return { clave, mes: `${MESES[Number(m) - 1]} ${y.slice(2)}`, total: porMes[clave] };
  }));
});

// GET /api/reportes/ranking-mecanicos — top mecánicos del mes (admin)
router.get('/ranking-mecanicos', verificarToken, soloRol('administrador'), async (req, res) => {
  const { desde } = rangoMesCR(mesActualCR());

  const { data, error } = await supabase
    .from('tareas')
    .select('id_empleado, estado, empleados(usuarios(nombre))')
    .eq('estado', 'completada')
    .gte('updated_at', desde);

  if (error) return res.status(500).json({ error: error.message });

  const conteo = {};
  data.forEach(t => {
    const nombre = t.empleados?.usuarios?.nombre ?? 'Desconocido';
    conteo[nombre] = (conteo[nombre] ?? 0) + 1;
  });

  const ranking = Object.entries(conteo)
    .map(([nombre, servicios]) => ({ nombre, servicios }))
    .sort((a, b) => b.servicios - a.servicios);

  res.json(ranking);
});

// GET /api/reportes/mantenimientos-por-mecanico — mantenimientos COMPLETADOS
// (estado terminado) por mecánico (admin) [RPS-004]. Opcional ?desde&hasta:
// filtra por la fecha en que se completó (la última tarea terminada).
router.get('/mantenimientos-por-mecanico', verificarToken, soloRol('administrador'), async (req, res) => {
  const rango = leerRango(req.query);
  if (rango.error) return res.status(400).json({ error: rango.error });

  // Mantenimientos terminados con las tareas y el mecánico de cada una
  const [mant, emps] = await Promise.all([
    supabase
      .from('mantenimientos')
      .select('id_mantenimiento, estado, tareas(id_empleado, updated_at, empleados(usuarios(nombre)))')
      .eq('estado', 'terminado'),
    supabase
      .from('empleados')
      .select('id_empleado, usuarios(nombre, roles(nombre))')
  ]);

  if (mant.error) return res.status(500).json({ error: mant.error.message });
  if (emps.error) return res.status(500).json({ error: emps.error.message });

  // Fecha de finalización (CR) = la tarea actualizada más tarde
  const terminados = (mant.data ?? []).filter(m => {
    if (!rango.desde && !rango.hasta) return true;
    const fechas = (m.tareas ?? []).map(t => t.updated_at).filter(Boolean).sort();
    if (!fechas.length) return false;
    const fin = diaCR(fechas[fechas.length - 1]);
    return (!rango.desde || fin >= rango.desde) && (!rango.hasta || fin <= rango.hasta);
  });

  // Inicializar a 0 todos los mecánicos (para evaluar también a quienes no tienen ninguno)
  const conteo = {};
  (emps.data ?? []).forEach(e => {
    if (e.usuarios?.roles?.nombre === 'mecanico') {
      conteo[e.id_empleado] = { nombre: e.usuarios?.nombre ?? 'Mecánico', completados: 0 };
    }
  });

  // Contar cada mantenimiento terminado UNA vez por mecánico que participó
  terminados.forEach(m => {
    const empleadosDelMant = new Set();
    (m.tareas ?? []).forEach(t => { if (t.id_empleado != null) empleadosDelMant.add(t.id_empleado); });
    empleadosDelMant.forEach(idEmp => {
      if (!conteo[idEmp]) {
        // Mecánico que ya no está en la lista activa pero trabajó en el mantenimiento
        const nombre = (terminados.flatMap(x => x.tareas ?? []).find(t => t.id_empleado === idEmp))?.empleados?.usuarios?.nombre ?? 'Desconocido';
        conteo[idEmp] = { nombre, completados: 0 };
      }
      conteo[idEmp].completados++;
    });
  });

  const ranking = Object.values(conteo).sort((a, b) => b.completados - a.completados);
  res.json(ranking);
});

// GET /api/reportes/historial?placa=&cliente= — historial de mantenimientos
// por placa o por nombre de cliente (admin) [RPS-005]. Requiere un criterio.
router.get('/historial', verificarToken, soloRol('administrador'), async (req, res) => {
  const placa   = String(req.query.placa || '').trim();
  const cliente = String(req.query.cliente || '').trim();
  if (!placa && !cliente)
    return res.status(400).json({ error: 'Ingresa una placa o el nombre de un cliente para buscar' });

  // Escapar comodines de LIKE que escriba el usuario
  const patron = s => `%${s.replace(/[%_\\]/g, m => '\\' + m)}%`;
  let vehIds = null;

  if (placa) {
    const { data, error } = await supabase
      .from('vehiculos').select('id_vehiculo').ilike('placa', patron(placa));
    if (error) return res.status(500).json({ error: error.message });
    vehIds = (data ?? []).map(v => v.id_vehiculo);
  }

  if (cliente) {
    const { data: users, error: uErr } = await supabase
      .from('usuarios').select('id_usuario').eq('id_rol', 3).ilike('nombre', patron(cliente));
    if (uErr) return res.status(500).json({ error: uErr.message });
    const uIds = (users ?? []).map(u => u.id_usuario);
    const { data: clis } = uIds.length
      ? await supabase.from('clientes').select('id_cliente').in('id_usuario', uIds)
      : { data: [] };
    const cIds = (clis ?? []).map(c => c.id_cliente);
    const { data: vehs } = cIds.length
      ? await supabase.from('vehiculos').select('id_vehiculo').in('id_cliente', cIds)
      : { data: [] };
    const idsCliente = (vehs ?? []).map(v => v.id_vehiculo);
    // Si se buscó por ambos criterios, deben cumplirse los dos
    vehIds = vehIds ? vehIds.filter(id => idsCliente.includes(id)) : idsCliente;
  }

  if (!vehIds.length) return res.json([]);

  const { data, error } = await supabase
    .from('mantenimientos')
    .select(`
      id_mantenimiento, fecha_ingreso, estado, porcentaje_avance,
      vehiculos(placa, marcas(nombre_marca), clientes(usuarios(nombre))),
      tareas(estado, tipos_servicio(nombre)),
      facturas(total, estado)
    `)
    .in('id_vehiculo', vehIds)
    .order('fecha_ingreso', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  res.json((data ?? []).map(m => ({
    id_mantenimiento: m.id_mantenimiento,
    fecha: diaCR(m.fecha_ingreso),
    estado: m.estado,
    porcentaje_avance: m.porcentaje_avance,
    placa: m.vehiculos?.placa ?? '-',
    marca: m.vehiculos?.marcas?.nombre_marca ?? '',
    cliente: m.vehiculos?.clientes?.usuarios?.nombre ?? '-',
    servicios: (m.tareas ?? []).map(t => t.tipos_servicio?.nombre).filter(Boolean),
    total: m.facturas?.total ?? null
  })));
});

// GET /api/reportes/servicios-populares — servicios más solicitados (admin)
router.get('/servicios-populares', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('tareas')
    .select('tipos_servicio(nombre)')
    .not('id_tipo_servicio', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const conteo = {};
  data.forEach(t => {
    const nombre = t.tipos_servicio?.nombre;
    if (nombre) conteo[nombre] = (conteo[nombre] ?? 0) + 1;
  });

  const lista = Object.entries(conteo)
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);

  res.json(lista);
});

module.exports = router;
