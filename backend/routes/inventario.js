const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// GET /api/inventario — lista de productos
router.get('/', verificarToken, async (req, res) => {
  const { data, error } = await supabase
    .from('productos')
    .select('*, categorias(nombre)')
    .eq('activo', true)
    .order('nombre');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/inventario/categorias — lista de categorías
router.get('/categorias', verificarToken, async (req, res) => {
  const { data, error } = await supabase
    .from('categorias')
    .select('id_categoria, nombre')
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/inventario/alertas — productos bajo stock mínimo
router.get('/alertas', verificarToken, async (req, res) => {
  // PostgREST no compara columna vs columna en un filtro, así que se
  // traen los productos activos y se filtra en memoria.
  const { data, error } = await supabase
    .from('productos')
    .select('id_producto, nombre, codigo, cantidad_stock, stock_minimo, categorias(nombre)')
    .eq('activo', true);

  if (error) return res.status(500).json({ error: error.message });
  res.json((data ?? []).filter(p => p.cantidad_stock < p.stock_minimo));
});

// POST /api/inventario — crear producto (admin)
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, codigo, marca, id_categoria, cantidad_stock, stock_minimo, costo_unitario, precio_venta } = req.body;
  if (!nombre || !codigo)
    return res.status(400).json({ error: 'nombre y codigo son requeridos' });

  const { data, error } = await supabase
    .from('productos')
    .insert({ nombre, codigo, marca, id_categoria, cantidad_stock, stock_minimo, costo_unitario, precio_venta })
    .select()
    .single();

  if (error) {
    if (error.code === '23505')
      return res.status(409).json({ error: 'Código de producto ya existe' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// PATCH /api/inventario/:id — actualizar producto (admin)
router.patch('/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const campos = req.body;
  delete campos.id_producto;

  const { data, error } = await supabase
    .from('productos')
    .update(campos)
    .eq('id_producto', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/inventario/:id/entrada — aumentar el stock de un producto existente (admin)
router.patch('/:id/entrada', verificarToken, soloRol('administrador'), async (req, res) => {
  const cantidad = parseInt(req.body.cantidad);
  if (!cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'La cantidad a agregar debe ser mayor a 0' });

  const { data: prod, error: pErr } = await supabase
    .from('productos').select('cantidad_stock').eq('id_producto', req.params.id).single();
  if (pErr || !prod) return res.status(404).json({ error: 'Producto no encontrado' });

  const nuevoStock = (prod.cantidad_stock ?? 0) + cantidad;
  const { data, error } = await supabase
    .from('productos')
    .update({ cantidad_stock: nuevoStock })
    .eq('id_producto', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Registrar el movimiento de entrada (best-effort, no bloquea)
  await supabase.from('movimientos_inventario')
    .insert({ id_producto: parseInt(req.params.id), tipo: 'entrada', cantidad })
    .then(() => {}, () => {});

  res.json(data);
});

// GET /api/inventario/movimientos/:idMant — repuestos solicitados para un mantenimiento
router.get('/movimientos/:idMant', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { data, error } = await supabase
    .from('movimientos_inventario')
    .select('id_movimiento, tipo, cantidad, fecha, productos(nombre, codigo)')
    .eq('id_mantenimiento', req.params.idMant)
    .order('fecha', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/inventario/movimiento — solicitar/registrar uso de repuesto (admin o mecánico) [GM-006]
// Actualiza el stock: 'salida' descuenta, 'entrada' suma.
router.post('/movimiento', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { id_producto, id_mantenimiento, tipo, cantidad } = req.body;
  const cant = parseInt(cantidad);
  if (!id_producto || !tipo || !cant || cant <= 0)
    return res.status(400).json({ error: 'id_producto, tipo y cantidad (>0) son requeridos' });

  const { data: prod, error: pErr } = await supabase
    .from('productos').select('nombre, cantidad_stock').eq('id_producto', id_producto).single();
  if (pErr || !prod) return res.status(404).json({ error: 'Producto no encontrado' });

  if (tipo === 'salida' && prod.cantidad_stock < cant)
    return res.status(400).json({ error: `Stock insuficiente de ${prod.nombre} (disponible: ${prod.cantidad_stock})` });

  // Registrar el movimiento
  const { data, error } = await supabase
    .from('movimientos_inventario')
    .insert({ id_producto, id_mantenimiento: id_mantenimiento || null, tipo, cantidad: cant })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Actualizar el stock del producto
  const nuevoStock = tipo === 'salida' ? prod.cantidad_stock - cant : prod.cantidad_stock + cant;
  await supabase.from('productos').update({ cantidad_stock: nuevoStock }).eq('id_producto', id_producto);

  res.status(201).json({ ...data, cantidad_stock: nuevoStock });
});

module.exports = router;
