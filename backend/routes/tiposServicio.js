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

module.exports = router;
