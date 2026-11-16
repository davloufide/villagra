const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');
const { clave, leerFilas, numeroOpcional, texto } = require('../utils/importacion');

const IVA_RATE = 0.13;   // el precio de venta se guarda con IVA incluido

// La BD tiene un trigger que suma/resta el stock al insertar en
// movimientos_inventario. Por eso PRIMERO se registra el movimiento y DESPUÉS
// se fija el stock al valor exacto: así queda bien con o sin el trigger (antes
// se actualizaba el stock y luego el trigger lo volvía a aplicar: doble conteo).
async function fijarStock(id_producto, nuevoStock, movimiento) {
  if (movimiento && movimiento.cantidad > 0) {
    await supabase.from('movimientos_inventario')
      .insert({ id_producto: parseInt(id_producto), ...movimiento })
      .then(() => {}, () => {});
  }
  return supabase.from('productos')
    .update({ cantidad_stock: nuevoStock })
    .eq('id_producto', id_producto)
    .select()
    .single();
}

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

// POST /api/inventario/categorias — crear categoría (admin) [IVO-006]
router.post('/categorias', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: 'El nombre de la categoría es requerido' });

  const { data, error } = await supabase
    .from('categorias')
    .insert({ nombre: nombre.trim() })
    .select('id_categoria, nombre')
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Esa categoría ya existe' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// DELETE /api/inventario/categorias/:id — eliminar categoría (admin)
// Los productos de esa categoría quedan "Sin categoría" (id_categoria = null).
router.delete('/categorias/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const id = req.params.id;

  const { data: afectados, error: errU } = await supabase
    .from('productos')
    .update({ id_categoria: null })
    .eq('id_categoria', id)
    .select('id_producto');
  if (errU) return res.status(500).json({ error: errU.message });

  const { error } = await supabase.from('categorias').delete().eq('id_categoria', id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, productos_afectados: (afectados ?? []).length });
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

// POST /api/inventario/importar — carga masiva desde Excel (admin)
// Body: { filas: [{ fila, codigo, nombre, marca, categoria, cantidad_stock,
//                  stock_minimo, costo_unitario, precio_sin_iva }] }
// - El producto se identifica por CÓDIGO. Si ya existe se actualizan sus datos
//   y el stock del Excel se SUMA al actual (queda como movimiento de entrada).
//   Si estaba dado de baja, se reactiva.
// - La categoría va por nombre; si no existe se crea.
// - El precio de venta viene SIN IVA y se guarda con el 13% incluido, igual
//   que al registrar un producto a mano.
router.post('/importar', verificarToken, soloRol('administrador'), async (req, res) => {
  const { filas, error: errFilas } = leerFilas(req.body);
  if (errFilas) return res.status(400).json({ error: errFilas });

  const resultado = { creados: 0, actualizados: 0, errores: [] };
  const fallo = (fila, error) => resultado.errores.push({ fila, error });

  // 1) Validar y agrupar por código (un código repetido en el archivo suma su stock)
  const porCodigo = new Map();
  for (const f of filas) {
    const codigo = texto(f.codigo);
    const nombre = texto(f.nombre);
    if (!codigo) { fallo(f.fila, 'Falta el código'); continue; }
    if (!nombre) { fallo(f.fila, 'Falta el nombre'); continue; }

    const nums = {
      cantidad_stock: numeroOpcional(f.cantidad_stock),
      stock_minimo:   numeroOpcional(f.stock_minimo),
      costo_unitario: numeroOpcional(f.costo_unitario),
      precio_sin_iva: numeroOpcional(f.precio_sin_iva)
    };
    const malo = Object.entries(nums).find(([, v]) => v !== undefined && (Number.isNaN(v) || v < 0));
    if (malo) { fallo(f.fila, `"${malo[0].replace(/_/g, ' ')}" no es un número válido`); continue; }
    if (!Number.isInteger(nums.cantidad_stock ?? 0) || !Number.isInteger(nums.stock_minimo ?? 0)) {
      fallo(f.fila, 'El stock y el stock mínimo deben ser números enteros'); continue;
    }

    const k = codigo.toUpperCase();
    const previo = porCodigo.get(k);
    const fila = {
      fila: previo?.fila ?? f.fila, codigo: previo?.codigo ?? codigo, nombre,
      marca: texto(f.marca) || previo?.marca,
      categoria: texto(f.categoria) || previo?.categoria,
      stock: (previo?.stock ?? 0) + (nums.cantidad_stock ?? 0),
      stock_minimo:   nums.stock_minimo   ?? previo?.stock_minimo,
      costo_unitario: nums.costo_unitario ?? previo?.costo_unitario,
      precio_sin_iva: nums.precio_sin_iva ?? previo?.precio_sin_iva
    };
    porCodigo.set(k, fila);
  }

  // 2) Categorías por nombre; crear las que falten
  const { data: cats, error: errC } = await supabase.from('categorias').select('id_categoria, nombre');
  if (errC) return res.status(500).json({ error: errC.message });
  const catPorNombre = new Map(cats.map(c => [clave(c.nombre), c.id_categoria]));
  const nuevasCats = [...new Map([...porCodigo.values()]
    .filter(p => p.categoria && !catPorNombre.has(clave(p.categoria)))
    .map(p => [clave(p.categoria), { nombre: p.categoria }])).values()];
  if (nuevasCats.length) {
    const { data: creadas, error } = await supabase.from('categorias').insert(nuevasCats).select('id_categoria, nombre');
    if (error) return res.status(500).json({ error: 'No se pudieron crear las categorías: ' + error.message });
    creadas.forEach(c => catPorNombre.set(clave(c.nombre), c.id_categoria));
  }

  // 3) Productos existentes por código (incluye los dados de baja)
  const { data: prods, error: errP } = await supabase.from('productos').select('id_producto, codigo, cantidad_stock');
  if (errP) return res.status(500).json({ error: errP.message });
  const prodPorCodigo = new Map(prods.map(p => [String(p.codigo).trim().toUpperCase(), p]));

  const nuevos = [];
  for (const [k, p] of porCodigo) {
    const datos = { nombre: p.nombre };
    if (p.marca)                       datos.marca = p.marca;
    if (p.categoria)                   datos.id_categoria = catPorNombre.get(clave(p.categoria));
    if (p.stock_minimo !== undefined)   datos.stock_minimo = p.stock_minimo;
    if (p.costo_unitario !== undefined) datos.costo_unitario = p.costo_unitario;
    if (p.precio_sin_iva !== undefined) datos.precio_venta = Math.round(p.precio_sin_iva * (1 + IVA_RATE));

    const existente = prodPorCodigo.get(k);
    if (!existente) { nuevos.push({ fila: p.fila, registro: { ...datos, codigo: p.codigo, cantidad_stock: p.stock } }); continue; }

    const { error } = await supabase.from('productos')
      .update({ ...datos, activo: true }).eq('id_producto', existente.id_producto);
    if (error) { fallo(p.fila, error.message); continue; }
    if (p.stock > 0) {
      const { error: eS } = await fijarStock(existente.id_producto,
        (existente.cantidad_stock ?? 0) + p.stock, { tipo: 'entrada', cantidad: p.stock });
      if (eS) { fallo(p.fila, eS.message); continue; }
    }
    resultado.actualizados++;
  }

  // 4) Productos nuevos en un solo insert; si falla, fila por fila para saber cuál
  if (nuevos.length) {
    const { error } = await supabase.from('productos').insert(nuevos.map(n => n.registro));
    if (!error) resultado.creados += nuevos.length;
    else {
      for (const n of nuevos) {
        const { error: e } = await supabase.from('productos').insert(n.registro);
        if (e) fallo(n.fila, e.code === '23505' ? 'Código de producto repetido' : e.message);
        else resultado.creados++;
      }
    }
  }

  resultado.errores.sort((a, b) => a.fila - b.fila);
  res.json(resultado);
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
  const { data, error } = await fijarStock(req.params.id, nuevoStock, { tipo: 'entrada', cantidad });
  if (error) return res.status(500).json({ error: error.message });

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

// PATCH /api/inventario/:id/salida — disminuir el stock (admin) [IVO-003]
router.patch('/:id/salida', verificarToken, soloRol('administrador'), async (req, res) => {
  const cantidad = parseInt(req.body.cantidad);
  if (!cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'La cantidad a disminuir debe ser mayor a 0' });

  const { data: prod, error: pErr } = await supabase
    .from('productos').select('nombre, cantidad_stock').eq('id_producto', req.params.id).single();
  if (pErr || !prod) return res.status(404).json({ error: 'Producto no encontrado' });

  if (prod.cantidad_stock < cantidad)
    return res.status(400).json({ error: `No puedes disminuir ${cantidad}: solo hay ${prod.cantidad_stock} de ${prod.nombre}` });

  const nuevoStock = prod.cantidad_stock - cantidad;
  const { data, error } = await fijarStock(req.params.id, nuevoStock, { tipo: 'salida', cantidad });
  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

// PATCH /api/inventario/:id/ajuste — fijar el stock a un valor exacto (admin) [IVO-010]
// Para correcciones: conteo físico, errores, devoluciones. Registra la diferencia.
router.patch('/:id/ajuste', verificarToken, soloRol('administrador'), async (req, res) => {
  const nueva = parseInt(req.body.cantidad);
  if (isNaN(nueva) || nueva < 0)
    return res.status(400).json({ error: 'La cantidad debe ser 0 o mayor' });

  const { data: prod, error: pErr } = await supabase
    .from('productos').select('cantidad_stock').eq('id_producto', req.params.id).single();
  if (pErr || !prod) return res.status(404).json({ error: 'Producto no encontrado' });

  const diff = nueva - prod.cantidad_stock;
  const { data, error } = await fijarStock(req.params.id, nueva,
    { tipo: diff > 0 ? 'entrada' : 'salida', cantidad: Math.abs(diff) });
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
