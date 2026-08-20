// ── Flujo de caja (solo admin) ───────────────────────────────
// Une DOS fuentes de dinero:
//   * automática  → facturas cobradas (estado 'pagada'), fechadas por
//                   fecha_pago (el día que entró la plata de verdad)
//   * manual      → tabla movimientos_caja (ingresos y gastos que el
//                   admin registra a mano: salarios, alquiler, etc.)
// El agrupado por día/semana/mes/año se hace en JS porque PostgREST no
// hace GROUP BY.
const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// Todas las rutas de este módulo son de administrador.
router.use(verificarToken, soloRol('administrador'));

const num = (v) => Number(v || 0);
const redondear = (n) => Math.round(n * 100) / 100;

// Detecta que falta correr la migración para dar un mensaje claro
// en vez de un error de base de datos.
const faltaMigracion = (error) =>
  !!error && /movimientos_caja|categorias_caja|does not exist|schema cache/i.test(error.message || '');

const ERROR_MIGRACION = {
  error: 'Falta correr la migración del flujo de caja.',
  migracion: 'migracion-flujo-caja.sql'
};

// ── Agrupación de fechas ─────────────────────────────────────
// Devuelve { clave, etiqueta } para ordenar y mostrar cada período.
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function periodoDe(fechaStr, agrupar) {
  const [a, m, d] = String(fechaStr).slice(0, 10).split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));

  if (agrupar === 'anio') {
    return { clave: String(a), etiqueta: String(a) };
  }
  if (agrupar === 'mes') {
    return { clave: `${a}-${String(m).padStart(2, '0')}`, etiqueta: `${MESES[m - 1]} ${a}` };
  }
  if (agrupar === 'semana') {
    // Semana de lunes a domingo: se ancla al lunes.
    const diaSemana = (fecha.getUTCDay() + 6) % 7;   // 0 = lunes
    const lunes = new Date(fecha);
    lunes.setUTCDate(fecha.getUTCDate() - diaSemana);
    const iso = lunes.toISOString().slice(0, 10);
    return {
      clave: iso,
      etiqueta: `Sem. ${String(lunes.getUTCDate()).padStart(2, '0')}/${String(lunes.getUTCMonth() + 1).padStart(2, '0')}`
    };
  }
  // por defecto: día
  return {
    clave: `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    etiqueta: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
  };
}

// ── GET /api/flujo-caja/categorias ───────────────────────────
router.get('/categorias', async (req, res) => {
  const { data, error } = await supabase
    .from('categorias_caja').select('*').order('tipo').order('nombre');
  if (error) return res.status(faltaMigracion(error) ? 409 : 500).json(faltaMigracion(error) ? ERROR_MIGRACION : { error: error.message });
  res.json(data ?? []);
});

// ── POST /api/flujo-caja/categorias ──────────────────────────
router.post('/categorias', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const tipo   = ['ingreso', 'gasto', 'ambos'].includes(req.body.tipo) ? req.body.tipo : 'gasto';
  if (!nombre) return res.status(400).json({ error: 'El nombre de la categoría es requerido' });

  const { data, error } = await supabase
    .from('categorias_caja').insert({ nombre, tipo }).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    return res.status(faltaMigracion(error) ? 409 : 500).json(faltaMigracion(error) ? ERROR_MIGRACION : { error: error.message });
  }
  res.status(201).json(data);
});

// ── DELETE /api/flujo-caja/categorias/:id ────────────────────
// Se bloquea si hay movimientos usándola (no se borra historial).
router.delete('/categorias/:id', async (req, res) => {
  const { data: enUso } = await supabase
    .from('movimientos_caja').select('id_movimiento_caja')
    .eq('id_categoria_caja', req.params.id).limit(1);
  if (enUso && enUso.length)
    return res.status(409).json({ error: 'Esta categoría tiene movimientos registrados. No se puede eliminar.' });

  const { error } = await supabase
    .from('categorias_caja').delete().eq('id_categoria_caja', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Validación compartida de un movimiento manual ────────────
function validarMovimiento(body) {
  const fecha    = String(body.fecha || '').slice(0, 10);
  const tipo     = body.tipo;
  const concepto = String(body.concepto || '').trim();
  const monto    = Number(body.monto);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'La fecha es requerida' };
  if (!['ingreso', 'gasto'].includes(tipo)) return { error: 'El tipo debe ser ingreso o gasto' };
  if (!concepto) return { error: 'El concepto es requerido' };
  if (!Number.isFinite(monto) || monto <= 0) return { error: 'El monto debe ser mayor a 0' };

  return {
    valores: {
      fecha, tipo, concepto,
      monto: redondear(monto),
      id_categoria_caja: body.id_categoria_caja ? Number(body.id_categoria_caja) : null,
      metodo_pago: body.metodo_pago || null
    }
  };
}

// ── POST /api/flujo-caja — registrar ingreso o gasto a mano ──
router.post('/', async (req, res) => {
  const { error: invalido, valores } = validarMovimiento(req.body);
  if (invalido) return res.status(400).json({ error: invalido });

  const { data, error } = await supabase
    .from('movimientos_caja')
    .insert({ ...valores, id_usuario: req.usuario.id })
    .select().single();

  if (error) return res.status(faltaMigracion(error) ? 409 : 500).json(faltaMigracion(error) ? ERROR_MIGRACION : { error: error.message });
  res.status(201).json(data);
});

// ── PATCH /api/flujo-caja/:id — editar un movimiento ─────────
router.patch('/:id', async (req, res) => {
  const { error: invalido, valores } = validarMovimiento(req.body);
  if (invalido) return res.status(400).json({ error: invalido });

  const { data, error } = await supabase
    .from('movimientos_caja').update(valores)
    .eq('id_movimiento_caja', req.params.id).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/flujo-caja/:id ───────────────────────────────
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('movimientos_caja').delete().eq('id_movimiento_caja', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── GET /api/flujo-caja?desde=&hasta=&agrupar= ───────────────
router.get('/', async (req, res) => {
  const desde   = String(req.query.desde || '').slice(0, 10);
  const hasta   = String(req.query.hasta || '').slice(0, 10);
  const agrupar = ['dia', 'semana', 'mes', 'anio'].includes(req.query.agrupar) ? req.query.agrupar : 'dia';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta))
    return res.status(400).json({ error: 'desde y hasta son requeridos (YYYY-MM-DD)' });
  if (desde > hasta)
    return res.status(400).json({ error: 'La fecha "desde" no puede ser posterior a "hasta"' });

  try {
    // ── 1. Ingresos automáticos: facturas cobradas ──
    // Se fechan por fecha_pago; si una factura vieja no la tiene, cae a
    // fecha_emision para no perderla del reporte.
    let facturas = [];
    {
      const { data, error } = await supabase
        .from('facturas')
        .select('id_factura, numero_orden, total, estado, fecha_emision, fecha_pago, metodo_pago, mantenimientos(vehiculos(placa))')
        .eq('estado', 'pagada');
      if (error) {
        if (/fecha_pago/i.test(error.message || '')) return res.status(409).json(ERROR_MIGRACION);
        throw error;
      }
      facturas = (data ?? [])
        .map(f => ({ ...f, fecha_caja: String(f.fecha_pago || f.fecha_emision || '').slice(0, 10) }))
        .filter(f => f.fecha_caja >= desde && f.fecha_caja <= hasta);
    }

    // ── 2. Movimientos manuales ──
    const { data: manuales, error: errMan } = await supabase
      .from('movimientos_caja')
      .select('*, categorias_caja(nombre)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false });
    if (errMan) return res.status(faltaMigracion(errMan) ? 409 : 500).json(faltaMigracion(errMan) ? ERROR_MIGRACION : { error: errMan.message });

    // ── 3. Lista unificada de movimientos ──
    const movimientos = [
      ...facturas.map(f => ({
        origen: 'factura',
        id: f.id_factura,
        fecha: f.fecha_caja,
        tipo: 'ingreso',
        concepto: `Factura ${f.numero_orden || '#' + f.id_factura}` +
                  (f.mantenimientos?.vehiculos?.placa ? ` · ${f.mantenimientos.vehiculos.placa}` : ''),
        categoria: 'Servicios facturados',
        monto: redondear(num(f.total)),
        metodo_pago: f.metodo_pago || null
      })),
      ...(manuales ?? []).map(m => ({
        origen: 'manual',
        id: m.id_movimiento_caja,
        fecha: String(m.fecha).slice(0, 10),
        tipo: m.tipo,
        concepto: m.concepto,
        categoria: m.categorias_caja?.nombre || 'Sin categoría',
        monto: redondear(num(m.monto)),
        metodo_pago: m.metodo_pago || null,
        id_categoria_caja: m.id_categoria_caja
      }))
    ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

    // ── 4. Serie agrupada por período ──
    const mapa = new Map();
    for (const mov of movimientos) {
      const { clave, etiqueta } = periodoDe(mov.fecha, agrupar);
      if (!mapa.has(clave)) mapa.set(clave, { clave, etiqueta, ingresos: 0, gastos: 0 });
      const fila = mapa.get(clave);
      if (mov.tipo === 'ingreso') fila.ingresos += mov.monto;
      else fila.gastos += mov.monto;
    }
    const series = [...mapa.values()]
      .sort((a, b) => (a.clave < b.clave ? -1 : 1))
      .map(f => ({
        ...f,
        ingresos: redondear(f.ingresos),
        gastos: redondear(f.gastos),
        balance: redondear(f.ingresos - f.gastos)
      }));

    // ── 5. Desglose por categoría (para ver en qué se va la plata) ──
    const catMapa = new Map();
    for (const mov of movimientos) {
      const clave = mov.tipo + '|' + mov.categoria;
      if (!catMapa.has(clave)) catMapa.set(clave, { categoria: mov.categoria, tipo: mov.tipo, total: 0, cantidad: 0 });
      const c = catMapa.get(clave);
      c.total += mov.monto;
      c.cantidad++;
    }
    const categorias = [...catMapa.values()]
      .map(c => ({ ...c, total: redondear(c.total) }))
      .sort((a, b) => b.total - a.total);

    // ── 6. Totales ──
    const ingresosFacturas = redondear(facturas.reduce((t, f) => t + num(f.total), 0));
    const ingresosManuales = redondear((manuales ?? []).filter(m => m.tipo === 'ingreso').reduce((t, m) => t + num(m.monto), 0));
    const gastos           = redondear((manuales ?? []).filter(m => m.tipo === 'gasto').reduce((t, m) => t + num(m.monto), 0));
    const ingresos         = redondear(ingresosFacturas + ingresosManuales);

    res.json({
      desde, hasta, agrupar,
      totales: {
        ingresos,
        gastos,
        balance: redondear(ingresos - gastos),
        ingresos_facturas: ingresosFacturas,
        ingresos_manuales: ingresosManuales,
        facturas_cobradas: facturas.length,
        movimientos_manuales: (manuales ?? []).length
      },
      series,
      categorias,
      movimientos
    });
  } catch (e) {
    console.error('[flujo-caja]', e);
    if (faltaMigracion(e)) return res.status(409).json(ERROR_MIGRACION);
    res.status(500).json({ error: e.message || 'No se pudo calcular el flujo de caja' });
  }
});

module.exports = router;
