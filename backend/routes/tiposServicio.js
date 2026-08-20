const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

const IVA_RATE = 0.13;
const calcIVA = (base) => parseFloat((base * IVA_RATE).toFixed(2));

// GET /api/tipos-servicio
// El CLIENTE usa esta lista para elegir servicios al agendar, y no debe ver
// los precios (el monto se define al facturar, según lo que encuentre el
// mecánico). Por eso al rol cliente se le devuelve el catálogo sin importes.
router.get('/', verificarToken, async (req, res) => {
  const esCliente = req.usuario.rol === 'cliente';
  const { data, error } = await supabase
    .from('tipos_servicio')
    .select(esCliente ? 'id_tipo_servicio, nombre, descripcion' : '*')
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/tipos-servicio — agregar un servicio al catálogo (admin) [OPE-006]
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, descripcion, precio_base } = req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: 'El nombre del servicio es requerido' });

  const base = precio_base ? parseFloat(precio_base) : 0;
  const registro = { nombre: nombre.trim(), descripcion: descripcion || null, precio_base: base };

  // Guardar el IVA (13% del precio base). Si la migración aún no se corrió
  // (columna inexistente), reintentar sin ella.
  let data, error;
  ({ data, error } = await supabase
    .from('tipos_servicio').insert({ ...registro, iva: calcIVA(base) }).select().single());
  if (error && (error.code === 'PGRST204' || /iva/i.test(error.message || ''))) {
    ({ data, error } = await supabase.from('tipos_servicio').insert(registro).select().single());
  }

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese servicio ya existe' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// PATCH /api/tipos-servicio/:id — editar un servicio (admin)
router.patch('/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, descripcion, precio_base } = req.body;
  const cambios = {};
  if (nombre !== undefined) {
    if (!nombre.trim()) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    cambios.nombre = nombre.trim();
  }
  if (descripcion !== undefined) cambios.descripcion = descripcion || null;
  if (precio_base !== undefined) {
    const base = precio_base ? parseFloat(precio_base) : 0;
    cambios.precio_base = base;
    cambios.iva = calcIVA(base);
  }

  // Actualizar; si la columna iva aún no existe, reintentar sin ella.
  let data, error;
  ({ data, error } = await supabase
    .from('tipos_servicio').update(cambios).eq('id_tipo_servicio', req.params.id).select().single());
  if (error && (error.code === 'PGRST204' || /iva/i.test(error.message || ''))) {
    const { iva, ...sinIva } = cambios;
    ({ data, error } = await supabase
      .from('tipos_servicio').update(sinIva).eq('id_tipo_servicio', req.params.id).select().single());
  }

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un servicio con ese nombre' });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// DELETE /api/tipos-servicio/:id — eliminar un servicio (admin)
// Se bloquea si el servicio está en uso en alguna tarea/mantenimiento.
router.delete('/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data: enUso } = await supabase
    .from('tareas')
    .select('id_tarea')
    .eq('id_tipo_servicio', req.params.id)
    .limit(1);

  if (enUso && enUso.length)
    return res.status(409).json({ error: 'Este servicio está en uso en uno o más mantenimientos. No se puede eliminar.' });

  const { error } = await supabase
    .from('tipos_servicio')
    .delete()
    .eq('id_tipo_servicio', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
