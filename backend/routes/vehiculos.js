const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// GET /api/vehiculos — lista todos los vehículos (solo admin)
router.get('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('vehiculos')
    .select(`
      id_vehiculo, placa, observaciones, created_at,
      marcas(nombre_marca),
      clientes(id_cliente, usuarios(nombre))
    `)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/vehiculos/:id — detalle + historial de mantenimientos
router.get('/:id', verificarToken, async (req, res) => {
  const { id } = req.params;

  const { data: vehiculo, error } = await supabase
    .from('vehiculos')
    .select('id_vehiculo, placa, id_cliente, observaciones, marcas(nombre_marca), clientes(usuarios(nombre))')
    .eq('id_vehiculo', id)
    .single();

  if (error) return res.status(404).json({ error: 'Vehículo no encontrado' });

  // Aislamiento: un cliente solo puede ver SUS propios vehículos
  if (req.usuario.rol === 'cliente') {
    const { data: cli } = await supabase
      .from('clientes').select('id_cliente').eq('id_usuario', req.usuario.id).single();
    if (!cli || vehiculo.id_cliente !== cli.id_cliente)
      return res.status(403).json({ error: 'No tienes acceso a este vehículo' });
  }

  const { data: historial } = await supabase
    .from('mantenimientos')
    .select('id_mantenimiento, fecha_ingreso, estado, porcentaje_avance')
    .eq('id_vehiculo', id)
    .order('fecha_ingreso', { ascending: false });

  res.json({ ...vehiculo, historial: historial ?? [] });
});

// GET /api/vehiculos/placa/:placa — buscar por placa
router.get('/placa/:placa', verificarToken, async (req, res) => {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('id_vehiculo, placa, marcas(nombre_marca), clientes(usuarios(nombre))')
    .ilike('placa', req.params.placa.toUpperCase())
    .single();

  if (error) return res.status(404).json({ error: 'Vehículo no encontrado' });
  res.json(data);
});

// POST /api/vehiculos — registrar vehículo (admin/mecánico o cliente para sí mismo)
router.post('/', verificarToken, soloRol('administrador', 'cliente', 'mecanico'), async (req, res) => {
  let { id_cliente, placa, id_marca, observaciones } = req.body;

  if (!placa || !id_marca)
    return res.status(400).json({ error: 'placa e id_marca son requeridos' });

  // Si es cliente, forzar su propio id_cliente (ignora el que venga en body)
  if (req.usuario.rol === 'cliente') {
    const { data: cli, error: cliErr } = await supabase
      .from('clientes').select('id_cliente').eq('id_usuario', req.usuario.id).single();
    if (cliErr || !cli) return res.status(403).json({ error: 'Perfil de cliente no encontrado' });
    id_cliente = cli.id_cliente;
  }

  if (!id_cliente)
    return res.status(400).json({ error: 'id_cliente requerido' });

  const { data, error } = await supabase
    .from('vehiculos')
    .insert({ id_cliente, placa: placa.toUpperCase().trim(), id_marca, observaciones })
    .select()
    .single();

  if (error) {
    if (error.code === '23505')
      return res.status(409).json({ error: 'Placa ya registrada' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// PATCH /api/vehiculos/:id — editar vehículo (admin cualquiera, cliente solo el suyo)
router.patch('/:id', verificarToken, soloRol('administrador', 'cliente'), async (req, res) => {
  const { placa, id_marca, observaciones } = req.body;

  // Aislamiento: el cliente solo puede editar SUS vehículos
  if (req.usuario.rol === 'cliente') {
    const { data: cli } = await supabase
      .from('clientes').select('id_cliente').eq('id_usuario', req.usuario.id).single();
    if (!cli) return res.status(403).json({ error: 'Perfil de cliente no encontrado' });

    const { data: veh } = await supabase
      .from('vehiculos').select('id_vehiculo')
      .eq('id_vehiculo', req.params.id).eq('id_cliente', cli.id_cliente).single();
    if (!veh) return res.status(403).json({ error: 'Este vehículo no te pertenece' });
  }

  const cambios = {};
  if (placa !== undefined)         cambios.placa = placa.toUpperCase().trim();
  if (id_marca !== undefined)      cambios.id_marca = parseInt(id_marca);
  if (observaciones !== undefined) cambios.observaciones = observaciones || null;

  if (!Object.keys(cambios).length)
    return res.status(400).json({ error: 'No hay cambios para guardar' });

  const { data, error } = await supabase
    .from('vehiculos')
    .update(cambios)
    .eq('id_vehiculo', req.params.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Esa placa ya está registrada' });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// GET /api/vehiculos/marcas/lista — lista de marcas para dropdown
router.get('/marcas/lista', async (req, res) => {
  const { data, error } = await supabase
    .from('marcas')
    .select('id_marca, nombre_marca')
    .order('nombre_marca');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
