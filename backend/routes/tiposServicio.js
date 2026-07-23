const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// GET /api/tipos-servicio
router.get('/', verificarToken, async (req, res) => {
  const { data, error } = await supabase
    .from('tipos_servicio')
    .select('*')
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/tipos-servicio — agregar un servicio al catálogo (admin) [OPE-006]
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, descripcion, precio_base } = req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: 'El nombre del servicio es requerido' });

  const { data, error } = await supabase
    .from('tipos_servicio')
    .insert({
      nombre: nombre.trim(),
      descripcion: descripcion || null,
      precio_base: precio_base ? parseFloat(precio_base) : 0
    })
    .select()
    .single();

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
  if (precio_base !== undefined) cambios.precio_base = precio_base ? parseFloat(precio_base) : 0;

  const { data, error } = await supabase
    .from('tipos_servicio')
    .update(cambios)
    .eq('id_tipo_servicio', req.params.id)
    .select()
    .single();

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
