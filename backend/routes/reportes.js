const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// GET /api/reportes/resumen — KPIs del mes actual (admin)
router.get('/resumen', verificarToken, soloRol('administrador'), async (req, res) => {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [mantenimientos, ingresos, stockBajo, empleados] = await Promise.all([
    supabase
      .from('mantenimientos')
      .select('id_mantenimiento, estado')
      .gte('fecha_ingreso', inicioMes.toISOString()),

    supabase
      .from('facturas')
      .select('total')
      .gte('fecha_emision', inicioMes.toISOString()),

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

// GET /api/reportes/ingresos-mensuales — últimos 6 meses (admin)
router.get('/ingresos-mensuales', verificarToken, soloRol('administrador'), async (req, res) => {
  const hace6meses = new Date();
  hace6meses.setMonth(hace6meses.getMonth() - 6);

  const { data, error } = await supabase
    .from('facturas')
    .select('total, fecha_emision')
    .gte('fecha_emision', hace6meses.toISOString())
    .order('fecha_emision');

  if (error) return res.status(500).json({ error: error.message });

  const porMes = {};
  data.forEach(f => {
    const mes = new Date(f.fecha_emision).toLocaleString('es', { month: 'short', year: '2-digit' });
    porMes[mes] = (porMes[mes] ?? 0) + parseFloat(f.total);
  });

  res.json(Object.entries(porMes).map(([mes, total]) => ({ mes, total })));
});

// GET /api/reportes/ranking-mecanicos — top mecánicos del mes (admin)
router.get('/ranking-mecanicos', verificarToken, soloRol('administrador'), async (req, res) => {
  const inicioMes = new Date();
  inicioMes.setDate(1);

  const { data, error } = await supabase
    .from('tareas')
    .select('id_empleado, estado, empleados(usuarios(nombre))')
    .eq('estado', 'completada')
    .gte('updated_at', inicioMes.toISOString());

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

// GET /api/reportes/mantenimientos-por-mecanico — total de mantenimientos
// COMPLETADOS (estado terminado) por mecánico, histórico (admin) [RPS-004]
router.get('/mantenimientos-por-mecanico', verificarToken, soloRol('administrador'), async (req, res) => {
  // Mantenimientos terminados con las tareas y el mecánico de cada una
  const [mant, emps] = await Promise.all([
    supabase
      .from('mantenimientos')
      .select('id_mantenimiento, estado, tareas(id_empleado, empleados(usuarios(nombre)))')
      .eq('estado', 'terminado'),
    supabase
      .from('empleados')
      .select('id_empleado, usuarios(nombre, roles(nombre))')
  ]);

  if (mant.error) return res.status(500).json({ error: mant.error.message });
  if (emps.error) return res.status(500).json({ error: emps.error.message });

  // Inicializar a 0 todos los mecánicos (para evaluar también a quienes no tienen ninguno)
  const conteo = {};
  (emps.data ?? []).forEach(e => {
    if (e.usuarios?.roles?.nombre === 'mecanico') {
      conteo[e.id_empleado] = { nombre: e.usuarios?.nombre ?? 'Mecánico', completados: 0 };
    }
  });

  // Contar cada mantenimiento terminado UNA vez por mecánico que participó
  (mant.data ?? []).forEach(m => {
    const empleadosDelMant = new Set();
    (m.tareas ?? []).forEach(t => { if (t.id_empleado != null) empleadosDelMant.add(t.id_empleado); });
    empleadosDelMant.forEach(idEmp => {
      if (!conteo[idEmp]) {
        // Mecánico que ya no está en la lista activa pero trabajó en el mantenimiento
        const nombre = (mant.data.flatMap(x => x.tareas ?? []).find(t => t.id_empleado === idEmp))?.empleados?.usuarios?.nombre ?? 'Desconocido';
        conteo[idEmp] = { nombre, completados: 0 };
      }
      conteo[idEmp].completados++;
    });
  });

  const ranking = Object.values(conteo).sort((a, b) => b.completados - a.completados);
  res.json(ranking);
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
