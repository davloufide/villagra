const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');

// POST /api/clientes — el admin registra un cliente manualmente
// Crea la cuenta de usuario (rol cliente) + su perfil en la tabla clientes.
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, correo, password, telefono } = req.body;
  if (!nombre || !correo || !password)
    return res.status(400).json({ error: 'nombre, correo y contraseña son requeridos' });
  if (password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });

  const hash = await bcrypt.hash(password, 10);

  // 1. crear el usuario con rol cliente (id_rol = 3)
  const { data: usuario, error: uErr } = await supabase
    .from('usuarios')
    .insert({ nombre, correo: correo.toLowerCase().trim(), password_hash: hash, id_rol: 3 })
    .select('id_usuario')
    .single();
  if (uErr) {
    if (uErr.code === '23505') return res.status(409).json({ error: 'Ese correo ya está registrado' });
    return res.status(500).json({ error: uErr.message });
  }

  // 2. crear su perfil de cliente con el teléfono
  const { data, error } = await supabase
    .from('clientes')
    .insert({ id_usuario: usuario.id_usuario, telefono: telefono || null })
    .select('id_cliente, telefono')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({ ...data, id_usuario: usuario.id_usuario, nombre, correo });
});

// GET /api/clientes — lista todos (admin y mecánico, para registrar servicios)
router.get('/', verificarToken, soloRol('administrador', 'mecanico'), async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select(`
      id_cliente, telefono,
      usuarios(nombre, correo)
    `)
    .order('id_cliente');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/clientes/mi-perfil — datos del cliente logueado (DEBE IR ANTES DE /:id)
router.get('/mi-perfil', verificarToken, soloRol('cliente'), async (req, res) => {
  // Paso 1: obtener perfil base + vehículos
  const { data: cliente, error: cErr } = await supabase
    .from('clientes')
    .select(`
      id_cliente, telefono,
      usuarios(nombre, correo),
      vehiculos(id_vehiculo, placa, marcas(nombre_marca))
    `)
    .eq('id_usuario', req.usuario.id)
    .single();

  if (cErr) return res.status(404).json({ error: cErr.message });

  const vehiculos = cliente.vehiculos ?? [];
  const vehIds = vehiculos.map(v => v.id_vehiculo);

  if (!vehIds.length) {
    return res.json({ ...cliente, vehiculos: [] });
  }

  // Paso 2: obtener mantenimientos de esos vehículos
  const { data: mants, error: mErr } = await supabase
    .from('mantenimientos')
    .select(`
      id_mantenimiento, id_vehiculo, fecha_ingreso,
      estado, porcentaje_avance, observaciones_cliente,
      tareas(descripcion, estado, tipos_servicio(nombre), empleados(usuarios(nombre))),
      facturas(id_factura, total, estado)
    `)
    .in('id_vehiculo', vehIds)
    .order('fecha_ingreso', { ascending: false });

  if (mErr) return res.status(500).json({ error: mErr.message });

  // Combinar: inyectar mantenimientos en cada vehículo
  const vehiculosConMants = vehiculos.map(v => ({
    ...v,
    mantenimientos: (mants ?? []).filter(m => m.id_vehiculo === v.id_vehiculo)
  }));

  res.json({ ...cliente, vehiculos: vehiculosConMants });
});

// GET /api/clientes/:id — detalle de un cliente con vehículos e historial (admin)
router.get('/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select(`
      id_cliente, telefono,
      usuarios(nombre, correo),
      vehiculos(
        id_vehiculo, placa,
        marcas(nombre_marca),
        mantenimientos(
          id_mantenimiento, fecha_ingreso, estado, porcentaje_avance,
          facturas(id_factura, total, estado)
        )
      )
    `)
    .eq('id_cliente', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(data);
});

module.exports = router;
