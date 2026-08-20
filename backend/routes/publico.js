// ── Rutas PÚBLICAS (sin token) ───────────────────────────────
// Permiten que una persona que NO quiere registrarse pueda solicitar
// una cita. Se crea (o se reusa) un cliente "invitado" con los datos
// mínimos: nombre + teléfono (obligatorios) y correo (opcional).
// La cita entra como estado_cita='solicitada', igual que la de un
// cliente registrado, y aparece en Operación → Solicitudes de cita.
const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const supabase = require('../db/supabase');

const ROL_CLIENTE = 3;

// ── Anti-spam simple (en memoria) ────────────────────────────
// El endpoint es público, así que se limita cuántas solicitudes puede
// mandar la misma IP por hora. No sustituye a un captcha, pero evita
// que alguien llene la bandeja con un script.
const MAX_POR_HORA = 5;
const VENTANA_MS   = 60 * 60 * 1000;
const intentos     = new Map();   // ip -> [timestamps]

// Solo se cuentan las citas REALMENTE creadas: si alguien se equivoca al
// llenar el formulario no debe quedar bloqueado.
function limiteAlcanzado(ip) {
  const ahora = Date.now();
  const previos = (intentos.get(ip) || []).filter(t => ahora - t < VENTANA_MS);
  intentos.set(ip, previos);
  return previos.length >= MAX_POR_HORA;
}

function registrarCita(ip) {
  const previos = intentos.get(ip) || [];
  previos.push(Date.now());
  intentos.set(ip, previos);
}

// ── Helpers ──────────────────────────────────────────────────
const soloDigitos = (t) => String(t || '').replace(/\D/g, '');
const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

// Correo de relleno para invitados que no dejaron el suyo. La columna
// usuarios.correo es única, así que se deriva del teléfono (determinista:
// el mismo teléfono no genera dos usuarios distintos).
const correoInvitado = (telefono) => `invitado.${soloDigitos(telefono)}@sin-registro.local`;

// ── GET /api/publico/servicios — catálogo para elegir en la cita ──
router.get('/servicios', async (req, res) => {
  const { data, error } = await supabase
    .from('tipos_servicio')
    .select('id_tipo_servicio, nombre, descripcion, precio_base')
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// ── GET /api/publico/marcas — para registrar el vehículo ─────────
router.get('/marcas', async (req, res) => {
  const { data, error } = await supabase
    .from('marcas').select('id_marca, nombre_marca').order('nombre_marca');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// ── GET /api/publico/dias-bloqueados — días no disponibles ───────
// Solo devuelve las fechas (no el motivo): es información pública mínima.
router.get('/dias-bloqueados', async (req, res) => {
  try {
    const { data, error } = await supabase.from('dias_bloqueados').select('fecha');
    if (error) throw error;
    res.json((data ?? []).map(d => d.fecha));
  } catch {
    res.json([]);   // si la tabla aún no existe, no hay días bloqueados
  }
});

// ── POST /api/publico/citas — solicitar cita sin cuenta ──────────
router.post('/citas', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'desconocida';
  if (limiteAlcanzado(ip))
    return res.status(429).json({ error: 'Demasiadas solicitudes desde este dispositivo. Intenta de nuevo más tarde o llámanos.' });

  const {
    nombre, telefono, correo,
    placa, id_marca,
    servicios, fecha, observaciones
  } = req.body;

  // ── Validaciones ──
  const nom = String(nombre || '').trim();
  const tel = String(telefono || '').trim();
  const mail = String(correo || '').trim().toLowerCase();
  const pla = String(placa || '').trim().toUpperCase();

  if (nom.length < 3)  return res.status(400).json({ error: 'Escribe tu nombre completo' });
  if (soloDigitos(tel).length < 8) return res.status(400).json({ error: 'Escribe un teléfono válido (mínimo 8 dígitos)' });
  if (mail && !correoValido(mail)) return res.status(400).json({ error: 'El correo no tiene un formato válido' });
  if (!pla) return res.status(400).json({ error: 'La placa del vehículo es requerida' });

  const listaServicios = Array.isArray(servicios) ? servicios.map(Number).filter(Boolean) : [];
  if (!listaServicios.length) return res.status(400).json({ error: 'Selecciona al menos un servicio' });
  if (!fecha) return res.status(400).json({ error: 'Elige el día de la cita' });

  const hoy = new Date().toISOString().slice(0, 10);
  if (fecha < hoy) return res.status(400).json({ error: 'La fecha de la cita no puede ser en el pasado' });

  // Los servicios deben existir en el catálogo (el body viene de fuera).
  const { data: servsOk } = await supabase
    .from('tipos_servicio').select('id_tipo_servicio').in('id_tipo_servicio', listaServicios);
  const idsValidos = (servsOk ?? []).map(s => s.id_tipo_servicio);
  if (!idsValidos.length) return res.status(400).json({ error: 'Los servicios seleccionados no son válidos' });

  // ── Día disponible ──
  try {
    const { data: bloq } = await supabase
      .from('dias_bloqueados').select('fecha').eq('fecha', fecha).maybeSingle();
    if (bloq) return res.status(409).json({ error: 'Ese día no está disponible para citas. Elige otra fecha.' });
  } catch { /* si la tabla no existe, no se valida */ }

  try {
    // ── 1. Resolver el cliente (reusar si ya existe) ──────────────
    let id_cliente = null;
    let clienteNuevo = false;

    // 1a. Por correo (es único en usuarios)
    if (mail) {
      const { data: u } = await supabase
        .from('usuarios').select('id_usuario, id_rol').eq('correo', mail).maybeSingle();
      if (u) {
        if (u.id_rol !== ROL_CLIENTE)
          return res.status(409).json({ error: 'Ese correo pertenece a una cuenta del taller. Inicia sesión para agendar.' });
        const { data: c } = await supabase
          .from('clientes').select('id_cliente').eq('id_usuario', u.id_usuario).maybeSingle();
        if (c) id_cliente = c.id_cliente;
      }
    }

    // 1b. Por teléfono (mismo número = misma persona)
    if (!id_cliente) {
      const telNorm = soloDigitos(tel);
      const { data: cands } = await supabase.from('clientes').select('id_cliente, telefono');
      const match = (cands ?? []).find(c => c.telefono && soloDigitos(c.telefono) === telNorm);
      if (match) id_cliente = match.id_cliente;
    }

    // 1c. No existe: crear usuario invitado + perfil de cliente
    if (!id_cliente) {
      const correoFinal = mail || correoInvitado(tel);
      // Contraseña aleatoria e inutilizable: el invitado no inicia sesión.
      // Si dejó su correo puede reclamar la cuenta con "¿Olvidaste tu contraseña?".
      const hash = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
      const base = { nombre: nom, correo: correoFinal, password_hash: hash, id_rol: ROL_CLIENTE };

      let usuario, uErr;
      ({ data: usuario, error: uErr } = await supabase
        .from('usuarios').insert({ ...base, es_invitado: true }).select('id_usuario').single());
      // Si la migración aún no se corrió (columna inexistente), reintentar sin ella.
      if (uErr && (uErr.code === 'PGRST204' || /es_invitado/i.test(uErr.message || ''))) {
        ({ data: usuario, error: uErr } = await supabase
          .from('usuarios').insert(base).select('id_usuario').single());
      }
      if (uErr) {
        if (uErr.code === '23505')
          return res.status(409).json({ error: 'Ya existe una cuenta con ese correo. Inicia sesión para agendar.' });
        throw uErr;
      }

      const { data: cli, error: cErr } = await supabase
        .from('clientes').insert({ id_usuario: usuario.id_usuario, telefono: tel }).select('id_cliente').single();
      if (cErr) throw cErr;
      id_cliente = cli.id_cliente;
      clienteNuevo = true;
    }

    // ── 2. Resolver el vehículo por placa ─────────────────────────
    let id_vehiculo;
    const { data: veh } = await supabase
      .from('vehiculos').select('id_vehiculo').eq('placa', pla).maybeSingle();

    if (veh) {
      // La placa ya está en el sistema: se reusa el vehículo tal cual
      // (no se le cambia el dueño; el taller lo revisa al confirmar).
      id_vehiculo = veh.id_vehiculo;
    } else {
      if (!id_marca)
        return res.status(400).json({ error: 'Selecciona la marca del vehículo', requiere_marca: true });
      const { data: nuevo, error: vErr } = await supabase
        .from('vehiculos')
        .insert({ placa: pla, id_marca: Number(id_marca), id_cliente })
        .select('id_vehiculo').single();
      if (vErr) throw vErr;
      id_vehiculo = nuevo.id_vehiculo;
    }

    // ── 3. Crear la solicitud de mantenimiento ────────────────────
    const notas = [
      `Cita solicitada en línea sin cuenta. Contacto: ${nom} · ${tel}${mail ? ' · ' + mail : ''}`,
      String(observaciones || '').trim()
    ].filter(Boolean).join(' — ');

    const registro = {
      id_vehiculo,
      fecha_estimada_entrega: fecha,
      observaciones_cliente: notas
    };

    let mant, mErr;
    ({ data: mant, error: mErr } = await supabase
      .from('mantenimientos').insert({ ...registro, estado_cita: 'solicitada' }).select().single());
    if (mErr && (mErr.code === 'PGRST204' || /estado_cita/i.test(mErr.message || ''))) {
      ({ data: mant, error: mErr } = await supabase
        .from('mantenimientos').insert(registro).select().single());
    }
    if (mErr) throw mErr;

    // ── 4. Una tarea por servicio, sin mecánico asignado ──────────
    // (queda en la "bolsa": la toma un mecánico o la asigna el admin)
    let tareasCreadas = 0;
    for (const sid of idsValidos) {
      const { error: tErr } = await supabase
        .from('tareas')
        .insert({ id_mantenimiento: mant.id_mantenimiento, id_empleado: null, id_tipo_servicio: sid });
      if (!tErr) tareasCreadas++;
    }

    registrarCita(ip);
    res.status(201).json({
      ok: true,
      numero: mant.id_mantenimiento,
      tareas_creadas: tareasCreadas,
      cliente_nuevo: clienteNuevo,
      mensaje: 'Solicitud recibida. El taller la confirmará y te contactará al teléfono que dejaste.'
    });
  } catch (e) {
    console.error('[publico/citas]', e);
    res.status(500).json({ error: e.message || 'No se pudo registrar la solicitud' });
  }
});

module.exports = router;
