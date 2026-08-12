const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// GET /api/dias-bloqueados — lista de días no disponibles.
// Cualquier rol autenticado la lee (el cliente la necesita para pintar el
// calendario). Opcional: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/', verificarToken, async (req, res) => {
  let q = supabase.from('dias_bloqueados').select('fecha, motivo').order('fecha');
  const { desde, hasta } = req.query;
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// POST /api/dias-bloqueados — bloquear un día (admin). Body { fecha, motivo? }
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { fecha, motivo } = req.body;
  if (!fecha) return res.status(400).json({ error: 'La fecha es requerida' });
  const { data, error } = await supabase
    .from('dias_bloqueados').insert({ fecha, motivo: motivo || null }).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese día ya está marcado como no disponible' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// DELETE /api/dias-bloqueados/:fecha — volver a habilitar un día (admin)
router.delete('/:fecha', verificarToken, soloRol('administrador'), async (req, res) => {
  const { error } = await supabase.from('dias_bloqueados').delete().eq('fecha', req.params.fecha);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
