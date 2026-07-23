const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// GET /api/facturacion — lista de facturas
router.get('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('facturas')
    .select(`
      id_factura, numero_orden, subtotal, iva, total, metodo_pago, estado, fecha_emision,
      mantenimientos(
        vehiculos(placa, marcas(nombre_marca), clientes(usuarios(nombre)))
      ),
      lineas_factura(descripcion, cantidad, precio_unitario, subtotal_linea)
    `)
    .order('fecha_emision', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/facturacion/facturables — mantenimientos terminados sin factura (admin)
// DEBE IR ANTES DE /:id
router.get('/facturables', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('mantenimientos')
    .select(`
      id_mantenimiento, fecha_ingreso, estado,
      vehiculos(placa, marcas(nombre_marca), clientes(usuarios(nombre))),
      tareas(descripcion, tipos_servicio(nombre, precio_base)),
      facturas(id_factura)
    `)
    .eq('estado', 'terminado')
    .order('fecha_ingreso', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Solo los que NO tienen factura todavía.
  // La relación mantenimiento→factura es 1:1, así que `facturas` puede
  // venir como objeto, array o null según PostgREST: se cubren todos.
  const sinFactura = (data ?? []).filter(m => {
    const f = m.facturas;
    return !f || (Array.isArray(f) && f.length === 0);
  });
  res.json(sinFactura);
});

// GET /api/facturacion/:id — detalle de factura (cliente puede ver la suya)
router.get('/:id', verificarToken, async (req, res) => {
  const { data, error } = await supabase
    .from('facturas')
    .select(`
      *,
      mantenimientos(
        vehiculos(placa, marcas(nombre_marca), clientes(id_cliente, usuarios(nombre)))
      ),
      lineas_factura(id_linea, descripcion, cantidad, precio_unitario, subtotal_linea)
    `)
    .eq('id_factura', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Factura no encontrada' });

  if (req.usuario.rol === 'cliente') {
    const { data: cli } = await supabase
      .from('clientes').select('id_cliente').eq('id_usuario', req.usuario.id).single();
    const propietario = data.mantenimientos?.vehiculos?.clientes?.id_cliente;
    if (propietario !== cli?.id_cliente)
      return res.status(403).json({ error: 'Sin acceso a esta factura' });
  }

  res.json(data);
});

// POST /api/facturacion — generar factura (admin)
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { id_mantenimiento, lineas, metodo_pago, descuento_pct } = req.body;
  if (!id_mantenimiento || !lineas?.length)
    return res.status(400).json({ error: 'id_mantenimiento y lineas son requeridos' });

  // FACT-005: descuento opcional; si viene, debe estar entre 1% y 100%
  let pct = 0;
  if (descuento_pct != null && descuento_pct !== '' && Number(descuento_pct) !== 0) {
    pct = Number(descuento_pct);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100)
      return res.status(400).json({ error: 'El descuento debe ser un porcentaje entre 1% y 100%' });
  }

  const IVA_RATE = 0.13;
  const subtotal  = parseFloat(lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0).toFixed(2));
  const descuento = parseFloat((subtotal * pct / 100).toFixed(2));
  const base      = parseFloat((subtotal - descuento).toFixed(2));
  const iva       = parseFloat((base * IVA_RATE).toFixed(2));
  const total     = parseFloat((base + iva).toFixed(2));

  const numero_orden = `ORD-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

  const registro = { id_mantenimiento, numero_orden, subtotal, iva, total, metodo_pago };

  // Intentar guardar el monto de descuento en su columna; si la migración
  // aún no se corrió (columna inexistente), reintentar sin ella: el descuento
  // igual queda aplicado en iva/total y es derivable de subtotal-(total-iva).
  let factura, error;
  ({ data: factura, error } = await supabase
    .from('facturas').insert({ ...registro, descuento }).select().single());

  if (error && (error.code === 'PGRST204' || /descuento/i.test(error.message || ''))) {
    ({ data: factura, error } = await supabase
      .from('facturas').insert(registro).select().single());
  }

  if (error) {
    if (error.code === '23505')
      return res.status(409).json({ error: 'Ya existe una factura para este mantenimiento' });
    return res.status(500).json({ error: error.message });
  }

  const lineasConId = lineas.map(l => ({
    id_factura: factura.id_factura,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario
  }));

  const { error: errL } = await supabase.from('lineas_factura').insert(lineasConId);
  if (errL) return res.status(500).json({ error: errL.message });

  res.status(201).json({ ...factura, lineas: lineasConId });
});

// PATCH /api/facturacion/:id/pagar — marcar como pagada (admin)
router.patch('/:id/pagar', verificarToken, soloRol('administrador'), async (req, res) => {
  const { metodo_pago } = req.body;

  const { data, error } = await supabase
    .from('facturas')
    .update({ estado: 'pagada', metodo_pago })
    .eq('id_factura', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
