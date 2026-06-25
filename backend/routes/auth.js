const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const supabase = require('../db/supabase');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password)
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre, correo, password_hash, activo, roles(nombre)')
    .eq('correo', correo.toLowerCase().trim())
    .single();

  if (error || !usuario)
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  if (!usuario.activo)
    return res.status(403).json({ error: 'Cuenta desactivada' });

  const coincide = await bcrypt.compare(password, usuario.password_hash);
  if (!coincide)
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  const token = jwt.sign(
    {
      id: usuario.id_usuario,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.roles.nombre
    },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );

  res.json({
    token,
    usuario: {
      id: usuario.id_usuario,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.roles.nombre
    }
  });
});

// POST /api/auth/registro (solo admin crea usuarios)
router.post('/registro', async (req, res) => {
  const { nombre, correo, password, id_rol } = req.body;
  if (!nombre || !correo || !password || !id_rol)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });

  const hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('usuarios')
    .insert({ nombre, correo: correo.toLowerCase().trim(), password_hash: hash, id_rol })
    .select('id_usuario, nombre, correo')
    .single();

  if (error) {
    if (error.code === '23505')
      return res.status(409).json({ error: 'Correo ya registrado' });
    return res.status(500).json({ error: 'Error al crear usuario' });
  }

  // Si es rol cliente (id_rol=3), crear automáticamente su perfil en clientes
  if (parseInt(id_rol) === 3) {
    await supabase.from('clientes').insert({ id_usuario: data.id_usuario });
  }

  res.status(201).json(data);
});

// POST /api/auth/recuperar — solicitar recuperación de contraseña
// Genera un token JWT de un solo propósito (expira en 1h). En MODO DEMO
// se devuelve el token en la respuesta y se imprime en consola; en producción
// se enviaría por correo y NO se devolvería.
router.post('/recuperar', async (req, res) => {
  const { correo } = req.body;
  if (!correo) return res.status(400).json({ error: 'Correo requerido' });

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre, activo')
    .eq('correo', correo.toLowerCase().trim())
    .single();

  // Respuesta genérica: no revelamos si el correo existe (buena práctica)
  const respuestaGenerica = { mensaje: 'Si el correo está registrado, se generó un enlace de recuperación.' };

  if (!usuario || !usuario.activo) {
    return res.json(respuestaGenerica);
  }

  const token = jwt.sign(
    { id: usuario.id_usuario, tipo: 'reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log(`\n[RECUPERAR CONTRASEÑA] ${usuario.nombre} (${correo})`);
  console.log(`  Token (válido 1h): ${token}\n`);

  // MODO DEMO: devolvemos el token para mostrar el enlace en pantalla.
  res.json({ ...respuestaGenerica, demo: true, token });
});

// POST /api/auth/reset — establecer nueva contraseña con el token
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password)
    return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
  if (password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'El enlace es inválido o expiró. Solicita uno nuevo.' });
  }
  if (payload.tipo !== 'reset')
    return res.status(400).json({ error: 'Token no válido para esta acción' });

  const hash = await bcrypt.hash(password, 10);
  const { error } = await supabase
    .from('usuarios')
    .update({ password_hash: hash })
    .eq('id_usuario', payload.id);

  if (error) return res.status(500).json({ error: 'No se pudo actualizar la contraseña' });
  res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
});

module.exports = router;
