// ── Configuración ─────────────────────────────────────────
// En producción (Render) el mismo servidor sirve frontend + API, así que se
// usa una ruta relativa "/api". En local con Live Server (puerto 5500/5501)
// se apunta al backend en el puerto 3000.
const esLiveServer = ['5500', '5501'].includes(location.port);
const API_URL = esLiveServer ? 'http://localhost:3000/api' : '/api';

// ── Helpers ──────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('token');
}

function getUsuario() {
  const raw = localStorage.getItem('usuario');
  return raw ? JSON.parse(raw) : null;
}

function getRolFromToken() {
  const t = getToken();
  if (!t) return null;
  try { return JSON.parse(atob(t.split('.')[1])).rol; } catch { return null; }
}

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = 'login.html';
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...options
  });

  if (res.status === 401 && getToken()) { cerrarSesion(); return; }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

// ── Auth ─────────────────────────────────────────────────
async function login(correo, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ correo, password })
  });
  localStorage.setItem('token', data.token);
  localStorage.setItem('usuario', JSON.stringify(data.usuario));
  return data.usuario;
}

// ── Vehículos ─────────────────────────────────────────────
const vehiculos = {
  lista:   ()     => apiFetch('/vehiculos'),
  detalle: (id)   => apiFetch(`/vehiculos/${id}`),
  placa:   (p)    => apiFetch(`/vehiculos/placa/${p}`),
  marcas:  ()     => apiFetch('/vehiculos/marcas/lista'),
  crear:   (body) => apiFetch('/vehiculos', { method: 'POST', body: JSON.stringify(body) }),
  actualizar: (id, body) => apiFetch(`/vehiculos/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
};

// ── Mantenimientos ────────────────────────────────────────
const mantenimientos = {
  lista:        ()            => apiFetch('/mantenimientos'),
  detalle:      (id)          => apiFetch(`/mantenimientos/${id}`),
  crear:        (body)        => apiFetch('/mantenimientos', { method: 'POST', body: JSON.stringify(body) }),
  editar:       (id, body)    => apiFetch(`/mantenimientos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  agregarTarea: (id, body)    => apiFetch(`/mantenimientos/${id}/tareas`, { method: 'POST', body: JSON.stringify(body) }),
  actualizarTarea: (id, body) => apiFetch(`/mantenimientos/tareas/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  eliminarTarea:   (id)       => apiFetch(`/mantenimientos/tareas/${id}`, { method: 'DELETE' }),
  reordenarTareas: (id, orden) => apiFetch(`/mantenimientos/${id}/reordenar`, { method: 'POST', body: JSON.stringify({ orden }) })
};

// ── Catálogo de servicios (tipos_servicio) ────────────────
const servicios = {
  lista:      ()         => apiFetch('/tipos-servicio'),
  crear:      (body)     => apiFetch('/tipos-servicio', { method: 'POST', body: JSON.stringify(body) }),
  actualizar: (id, body) => apiFetch(`/tipos-servicio/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  eliminar:   (id)       => apiFetch(`/tipos-servicio/${id}`, { method: 'DELETE' })
};

// ── Inventario ────────────────────────────────────────────
const inventario = {
  lista:         ()       => apiFetch('/inventario'),
  categorias:    ()       => apiFetch('/inventario/categorias'),
  crearCategoria:(nombre) => apiFetch('/inventario/categorias', { method: 'POST', body: JSON.stringify({ nombre }) }),
  eliminarCategoria:(id)  => apiFetch(`/inventario/categorias/${id}`, { method: 'DELETE' }),
  alertas:     ()       => apiFetch('/inventario/alertas'),
  crear:       (body)   => apiFetch('/inventario', { method: 'POST', body: JSON.stringify(body) }),
  actualizar:  (id, b)  => apiFetch(`/inventario/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  entrada:     (id, cantidad) => apiFetch(`/inventario/${id}/entrada`, { method: 'PATCH', body: JSON.stringify({ cantidad }) }),
  salida:      (id, cantidad) => apiFetch(`/inventario/${id}/salida`, { method: 'PATCH', body: JSON.stringify({ cantidad }) }),
  ajuste:      (id, cantidad) => apiFetch(`/inventario/${id}/ajuste`, { method: 'PATCH', body: JSON.stringify({ cantidad }) }),
  movimiento:  (body)   => apiFetch('/inventario/movimiento', { method: 'POST', body: JSON.stringify(body) }),
  movimientosDe: (idMant) => apiFetch(`/inventario/movimientos/${idMant}`)
};

// ── Mi perfil (cualquier rol) ─────────────────────────────
const perfil = {
  obtener:    ()     => apiFetch('/perfil'),
  actualizar: (body) => apiFetch('/perfil', { method: 'PATCH', body: JSON.stringify(body) })
};

// ── Clientes ──────────────────────────────────────────────
const clientes = {
  lista: ()     => apiFetch('/clientes'),
  crear: (body) => apiFetch('/clientes', { method: 'POST', body: JSON.stringify(body) })
};

// ── Usuarios (CRUD admin) ─────────────────────────────────
const usuarios = {
  lista:      ()       => apiFetch('/usuarios'),
  crear:      (body)   => apiFetch('/usuarios', { method: 'POST', body: JSON.stringify(body) }),
  actualizar: (id, b)  => apiFetch(`/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  eliminar:   (id)     => apiFetch(`/usuarios/${id}`, { method: 'DELETE' })
};

// ── Empleados ─────────────────────────────────────────────
const empleados = {
  lista:             ()       => apiFetch('/empleados'),
  crear:             (body)   => apiFetch('/empleados', { method: 'POST', body: JSON.stringify(body) }),
  vacaciones:        ()       => apiFetch('/empleados/vacaciones'),
  solicitarVac:      (body)   => apiFetch('/empleados/vacaciones', { method: 'POST', body: JSON.stringify(body) }),
  registrarVac:      (body)   => apiFetch('/empleados/vacaciones/registrar', { method: 'POST', body: JSON.stringify(body) }),
  responderVac:      (id, b)  => apiFetch(`/empleados/vacaciones/${id}`, { method: 'PATCH', body: JSON.stringify(b) })
};

// ── Facturación ───────────────────────────────────────────
const facturacion = {
  lista:       ()       => apiFetch('/facturacion'),
  facturables: ()       => apiFetch('/facturacion/facturables'),
  detalle:     (id)     => apiFetch(`/facturacion/${id}`),
  crear:       (body)   => apiFetch('/facturacion', { method: 'POST', body: JSON.stringify(body) }),
  pagar:       (id, b)  => apiFetch(`/facturacion/${id}/pagar`, { method: 'PATCH', body: JSON.stringify(b) })
};

// ── Reportes ──────────────────────────────────────────────
const reportes = {
  resumen:           () => apiFetch('/reportes/resumen'),
  ingresosMensuales: () => apiFetch('/reportes/ingresos-mensuales'),
  rankingMecanicos:  () => apiFetch('/reportes/ranking-mecanicos'),
  mantenimientosPorMecanico: () => apiFetch('/reportes/mantenimientos-por-mecanico'),
  serviciosPopulares:() => apiFetch('/reportes/servicios-populares')
};

// ── Redirigir a login si no hay sesión ───────────────────
(function protegerPagina() {
  const publica = ['login.html', 'landing.html', 'reset.html'];
  const pagina  = window.location.pathname.split('/').pop();
  if (!publica.includes(pagina) && !getToken()) {
    window.location.href = 'login.html';
  }
})();

// ── Página de inicio según rol ───────────────────────────
function paginaInicioPorRol(rol) {
  if (rol === 'cliente')  return 'cliente.html';
  if (rol === 'mecanico') return 'mecanicos.html';
  return 'index.html';
}

// ── Layout compartido: guard de rol + sidebar + logout ───
// Llamar al inicio de cada página. Devuelve el rol o null (si redirige).
function iniciarLayout(rolesPermitidos) {
  const rol = getRolFromToken();
  if (!rol) { window.location.href = 'login.html'; return null; }

  // Guard: si el rol no tiene permiso, mandar a su página de inicio
  if (rolesPermitidos && !rolesPermitidos.includes(rol)) {
    window.location.href = paginaInicioPorRol(rol);
    return null;
  }

  // Poblar el chip del usuario en el sidebar
  const u = getUsuario();
  const nombre = u?.nombre ?? '';
  const ini = nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const elAv  = document.getElementById('sidebar-avatar');
  const elNom = document.getElementById('sidebar-nombre');
  const elRol = document.getElementById('sidebar-rol');
  if (elAv)  elAv.textContent  = ini || '?';
  if (elNom) elNom.textContent = nombre || '-';
  if (elRol) elRol.textContent = { administrador: 'Administrador', mecanico: 'Mecánico', cliente: 'Cliente' }[rol] ?? rol;

  // Ocultar elementos solo-admin para roles no admin
  if (rol !== 'administrador') {
    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = 'none'; });
  }

  // Hacer clicable el chip del usuario para abrir "Mi perfil" (en todas las páginas)
  const chip = document.querySelector('.user-chip');
  if (chip && typeof abrirMiPerfil === 'function') {
    chip.style.cursor = 'pointer';
    chip.title = 'Editar mi perfil';
    chip.addEventListener('click', () => abrirMiPerfil());
  }

  return rol;
}
