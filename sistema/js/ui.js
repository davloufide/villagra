// ── Tema claro / oscuro ───────────────────────────────────
// El tema se aplica temprano en api.js (data-theme en <html>) leyendo
// localStorage. Acá va el botón para alternarlo y su persistencia.
function toggleTema() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('tema', next); } catch {}
  actualizarBotonTema();
}
function actualizarBotonTema() {
  const btn = document.getElementById('btn-tema');
  if (!btn) return;
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  btn.innerHTML = dark ? '<i class="fas fa-sun"></i> Modo claro' : '<i class="fas fa-moon"></i> Modo oscuro';
}
function montarToggleTema() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer || document.getElementById('btn-tema')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-tema';
  btn.className = 'theme-toggle';
  btn.type = 'button';
  btn.addEventListener('click', toggleTema);
  footer.insertBefore(btn, footer.firstChild);
  actualizarBotonTema();
}

// ── Navegación por submódulos (menú lateral desplegable) ──
// Compartido por todos los módulos. Cada submódulo es un <a class="subitem"
// data-vista="X" data-titulo="..." data-sub="..."> y su contenido un
// <div id="vista-X" class="vista">. El topbar usa #modulo-titulo / #modulo-sub.
function toggleMenuGrupo(btn) { btn.parentElement.classList.toggle('open'); }

function mostrarVista(vista) {
  document.querySelectorAll('.vista').forEach(v => { v.style.display = 'none'; });
  const el = document.getElementById('vista-' + vista);
  if (el) el.style.display = 'block';

  let activo = null;
  document.querySelectorAll('.submenu .subitem').forEach(a => {
    const on = a.dataset.vista === vista;
    a.classList.toggle('active', on);
    if (on) activo = a;
  });

  const t = document.getElementById('modulo-titulo');
  const s = document.getElementById('modulo-sub');
  if (activo) {
    if (t && activo.dataset.titulo != null) t.textContent = activo.dataset.titulo;
    if (s && activo.dataset.sub != null)    s.textContent = activo.dataset.sub;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Paginador reutilizable para tablas ────────────────────
// Uso:
//   const pag = crearPaginador('id-contenedor', renderFilas, 5);
//   pag.set(listaCompleta);              // al cargar o al filtrar (vuelve a pág. 1)
//   pag.set(listaCompleta, true);        // conservando la página actual
// renderFilas(items) pinta SOLO las filas de la página actual (reusa el render
// existente de cada módulo; si recibe [] debe mostrar su fila de "vacío").
function crearPaginador(contenedorId, renderFilas, porPagina = 5) {
  let datos = [];
  let pagina = 1;
  let bound = false;

  const cont = () => document.getElementById(contenedorId);
  const totalPag = () => Math.max(1, Math.ceil(datos.length / porPagina));

  function bind() {
    const c = cont();
    if (!c || bound) return;
    bound = true;
    c.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pag]');
      if (!b || b.classList.contains('disabled') || b.classList.contains('gap')) return;
      const v = b.dataset.pag;
      if (v === 'prev') pagina--;
      else if (v === 'next') pagina++;
      else pagina = parseInt(v);
      dibujar();
    });
  }

  // Números de página a mostrar (con "…" cuando hay muchas)
  function numeros(tp, act) {
    const out = [];
    const ini = Math.max(1, act - 1);
    const fin = Math.min(tp, act + 1);
    if (ini > 1) { out.push(1); if (ini > 2) out.push('…'); }
    for (let i = ini; i <= fin; i++) out.push(i);
    if (fin < tp) { if (fin < tp - 1) out.push('…'); out.push(tp); }
    return out;
  }

  function dibujar() {
    const tp = totalPag();
    pagina = Math.min(Math.max(1, pagina), tp);
    const desde = (pagina - 1) * porPagina;
    renderFilas(datos.slice(desde, desde + porPagina));

    const c = cont();
    if (!c) return;
    if (datos.length <= porPagina) { c.innerHTML = ''; c.style.display = 'none'; return; }
    c.style.display = 'flex';
    const hasta = Math.min(desde + porPagina, datos.length);
    const nums = numeros(tp, pagina).map(n =>
      n === '…'
        ? '<span class="pag-btn gap">…</span>'
        : `<button class="pag-btn ${n === pagina ? 'active' : ''}" data-pag="${n}">${n}</button>`
    ).join('');
    c.innerHTML = `
      <span class="pag-info">Mostrando <strong>${desde + 1}-${hasta}</strong> de <strong>${datos.length}</strong></span>
      <div class="pag-btns">
        <button class="pag-btn ${pagina === 1 ? 'disabled' : ''}" data-pag="prev" title="Anterior"><i class="fas fa-chevron-left"></i></button>
        ${nums}
        <button class="pag-btn ${pagina === tp ? 'disabled' : ''}" data-pag="next" title="Siguiente"><i class="fas fa-chevron-right"></i></button>
      </div>`;
  }

  return {
    set(lista, mantenerPagina) {
      datos = Array.isArray(lista) ? lista : [];
      if (!mantenerPagina) pagina = 1;
      bind();
      dibujar();
    }
  };
}

// ── Ventanas emergentes (modales) para los formularios de registro ──
// El modal es un <div id="modal-X" class="modal-overlay" style="display:none;">
// con una .card adentro (el formulario). abrirModal lo muestra; se cierra al
// hacer clic en el fondo, con Escape, o con los botones Cancelar/×.
function abrirModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  const yaAbierto = m.style.display === 'flex';   // re-abrir (refresco) no debe saltar foco/scroll
  m.style.display = 'flex';
  document.body.style.overflow = 'hidden';   // evita scroll del fondo
  if (!m._bound) {
    m._bound = true;
    m.addEventListener('click', (e) => { if (e.target === m) cerrarModal(id); });
  }
  if (!yaAbierto) {
    m.scrollTop = 0;
    const first = m.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
    if (first) setTimeout(() => first.focus(), 40);
  }
}

function cerrarModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.style.display = 'none';
  // Restaurar el scroll solo si no queda ningún otro modal abierto
  if (!document.querySelector('.modal-overlay[style*="flex"]')) document.body.style.overflow = '';
}

// Escape cierra el modal abierto (una sola vez, a nivel global)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const abierto = [...document.querySelectorAll('.modal-overlay')].find(m => m.style.display === 'flex');
  if (abierto) cerrarModal(abierto.id);
});

// ── Diálogo de confirmación propio (reemplaza el confirm() del navegador) ──
// Uso: if (!(await confirmar('¿Seguro?'))) return;
//   o: await confirmar({ titulo, mensaje, confirmar, cancelar, peligro })
function confirmar(opciones) {
  const o = typeof opciones === 'string' ? { mensaje: opciones } : (opciones || {});
  const titulo  = o.titulo    ?? 'Confirmar acción';
  const mensaje = o.mensaje   ?? '¿Deseas continuar?';
  const okTxt   = o.confirmar ?? 'Confirmar';
  const noTxt   = o.cancelar  ?? 'Cancelar';
  const peligro = o.peligro !== false; // por defecto, estilo de peligro (rojo)

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .14s;';
    overlay.innerHTML = `
      <div class="confirm-box" style="background:#fff;width:100%;max-width:430px;border-radius:16px;padding:24px 24px 20px;box-shadow:0 24px 60px rgba(0,0,0,0.35);transform:scale(.95);transition:transform .14s;">
        <div style="display:flex;gap:14px;align-items:flex-start;">
          <div style="width:46px;height:46px;flex-shrink:0;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;background:${peligro ? '#fef2f2' : '#eff6ff'};color:${peligro ? '#dc2626' : '#2563eb'};">
            <i class="fas fa-${peligro ? 'triangle-exclamation' : 'circle-question'}"></i>
          </div>
          <div style="flex:1;">
            <h3 style="font-size:1.12rem;font-weight:800;color:#0f172a;margin-bottom:5px;">${titulo}</h3>
            <p style="font-size:0.9rem;color:#64748b;line-height:1.55;">${mensaje}</p>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
          <button class="btn btn-outline" data-c="no">${noTxt}</button>
          <button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" data-c="si">${okTxt}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      overlay.querySelector('.confirm-box').style.transform = 'scale(1)';
    });

    const cerrar = (val) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 140);
      resolve(val);
    };
    // Escape/Enter se atrapan aquí (fase de captura) para que no lleguen al
    // listener global de modales: cancelar NO debe cerrar el panel de atrás.
    const onKey = (e) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      cerrar(e.key === 'Enter');
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return cerrar(false);
      const btn = e.target.closest('[data-c]');
      if (btn) cerrar(btn.dataset.c === 'si');
    });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => overlay.querySelector('[data-c="si"]').focus(), 30);
  });
}

// Fecha de hoy 'YYYY-MM-DD' en hora local (para min de inputs date y validar)
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fecha estimada de entrega (OPE-013): vacía es válida ("por confirmar"),
// pero no puede ser anterior a hoy. Devuelve el mensaje de error o null.
function errorFechaEntrega(fecha) {
  if (!fecha) return null;
  return fecha < hoyISO() ? 'La fecha estimada de entrega no puede ser anterior a hoy' : null;
}

// Los inputs de fecha estimada (.fecha-futura) no ofrecen días pasados
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input.fecha-futura').forEach(i => { i.min = hoyISO(); });
});

// Formato de correo (mismo criterio que el backend, utils/validacion.js)
function correoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(correo ?? '').trim());
}

// Toast de notificaciones
function toast(msg, tipo = 'success') {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:28px;right:28px;z-index:9999;
    padding:13px 20px;border-radius:12px;font-size:0.88rem;font-weight:600;
    color:#fff;box-shadow:0 4px 18px rgba(0,0,0,0.18);
    background:${tipo === 'success' ? '#16a34a' : tipo === 'error' ? '#dc2626' : '#2563eb'};
    transition:opacity .3s;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

// Tag de estado
function tagEstado(estado) {
  const mapa = {
    recibido:    ['info',    'Recibido'],
    en_progreso: ['warning', 'En proceso'],
    terminado:   ['success', 'Terminado'],
    cancelado:   ['danger',  'Cancelado'],
    pendiente:   ['info',    'Pendiente'],
    en_proceso:  ['warning', 'En proceso'],
    completada:  ['success', 'Completada'],
    pagada:      ['success', 'Pagada'],
    aprobada:    ['success', 'Aprobada'],
    rechazada:   ['danger',  'Rechazada'],
  };
  const [cls, label] = mapa[estado] ?? ['neutral', estado];
  return `<span class="tag ${cls}">${label}</span>`;
}

// Descargar una factura como PDF (abre ventana imprimible -> Guardar como PDF)
async function descargarFacturaPDF(id) {
  const money = n => '₡' + Number(n || 0).toLocaleString('es');
  try {
    const f = await facturacion.detalle(id);
    const cli = f.mantenimientos?.vehiculos?.clientes?.usuarios?.nombre ?? '-';
    const veh = `${f.mantenimientos?.vehiculos?.placa ?? ''} ${f.mantenimientos?.vehiculos?.marcas?.nombre_marca ? '· ' + f.mantenimientos.vehiculos.marcas.nombre_marca : ''}`;
    const lineas = f.lineas_factura ?? [];
    const filas = lineas.map(l => `
      <tr>
        <td>${l.descripcion ?? ''}</td>
        <td style="text-align:center;">${l.cantidad}</td>
        <td style="text-align:right;">${money(l.precio_unitario)}</td>
        <td style="text-align:right;">${money(l.subtotal_linea)}</td>
      </tr>`).join('');

    const html = `
      <html><head><meta charset="utf-8"><title>${f.numero_orden ?? 'Factura'}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:720px;margin:30px auto;padding:0 20px;}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:20px;}
        .brand{font-size:1.3rem;font-weight:800;color:#1e3a8a;}
        .muted{color:#64748b;font-size:0.85rem;}
        table{width:100%;border-collapse:collapse;margin-top:14px;}
        th,td{padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:0.9rem;}
        th{background:#f8fafc;text-align:left;color:#475569;}
        .tot{margin-top:16px;margin-left:auto;width:260px;}
        .tot div{display:flex;justify-content:space-between;padding:5px 0;font-size:0.9rem;}
        .tot .grand{border-top:2px solid #0f172a;margin-top:6px;padding-top:10px;font-size:1.15rem;font-weight:800;}
        .estado{display:inline-block;padding:4px 12px;border-radius:99px;font-size:0.78rem;font-weight:700;
          background:${f.estado === 'pagada' ? '#dcfce7' : '#fef3c7'};color:${f.estado === 'pagada' ? '#166534' : '#92400e'};}
      </style></head>
      <body>
        <div class="head">
          <div>
            <div class="brand">Lubricentro Villagra</div>
            <div class="muted">Moravia, San Vicente, San José, Costa Rica<br>Tel. 8413-2121 · lubricentrovillagra@gmail.com</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.4rem;font-weight:900;">FACTURA</div>
            <div class="muted">${f.numero_orden ?? '#' + f.id_factura}</div>
            <div class="muted">${new Date(f.fecha_emision).toLocaleDateString('es-CR')}</div>
            <div style="margin-top:6px;"><span class="estado">${f.estado === 'pagada' ? 'PAGADA' : 'PENDIENTE'}</span></div>
          </div>
        </div>
        <div class="muted"><strong style="color:#0f172a;">Cliente:</strong> ${cli} &nbsp;&nbsp; <strong style="color:#0f172a;">Vehículo:</strong> ${veh} &nbsp;&nbsp; <strong style="color:#0f172a;">Pago:</strong> ${f.metodo_pago ?? '-'}</div>
        <table>
          <thead><tr><th>Descripción</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Subtotal</th></tr></thead>
          <tbody>${filas || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Sin líneas</td></tr>'}</tbody>
        </table>
        <div class="tot">
          <div><span>Subtotal</span><span>${money(f.subtotal)}</span></div>
          ${(() => {
            // Descuento: explícito (columna) o derivado de subtotal-(total-iva)
            const desc = Number(f.descuento) || Math.max(0, Number(f.subtotal) - (Number(f.total) - Number(f.iva)));
            if (desc <= 0) return '';
            const pct = f.subtotal > 0 ? Math.round(desc / Number(f.subtotal) * 100) : 0;
            return `<div style="color:#dc2626;"><span>Descuento${pct ? ` (${pct}%)` : ''}</span><span>-${money(desc)}</span></div>`;
          })()}
          <div><span>IVA (13%)</span><span>${money(f.iva)}</span></div>
          <div class="grand"><span>TOTAL</span><span>${money(f.total)}</span></div>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-top:30px;">Gracias por su preferencia · Lubricentro Villagra</p>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { toast('Permite las ventanas emergentes para descargar el PDF', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  } catch (e) {
    toast('Error generando PDF: ' + e.message, 'error');
  }
}

// ── Modal "Mi perfil" (cualquier rol) ─────────────────────
async function abrirMiPerfil() {
  let overlay = document.getElementById('perfil-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'perfil-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:#fff;width:100%;max-width:440px;border-radius:16px;padding:26px 26px 22px;box-shadow:0 20px 50px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h3 style="font-size:1.2rem;font-weight:800;">Mi perfil</h3>
          <button onclick="cerrarMiPerfil()" style="border:none;background:transparent;font-size:1.1rem;color:#94a3b8;cursor:pointer;">&times;</button>
        </div>
        <p id="perf-rol" style="color:#64748b;font-size:0.85rem;margin-bottom:16px;">-</p>
        <div id="perf-msg" style="display:none;border-radius:9px;padding:9px 13px;font-size:0.83rem;margin-bottom:12px;"></div>

        <div style="display:grid;gap:12px;">
          <div>
            <label style="font-size:0.8rem;color:#475569;font-weight:700;">Correo (no editable)</label>
            <input id="perf-correo" disabled style="width:100%;border:1px solid #e2e8f0;background:#f1f5f9;border-radius:9px;padding:10px 12px;font-size:0.9rem;margin-top:4px;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#475569;font-weight:700;">Nombre completo</label>
            <input id="perf-nombre" style="width:100%;border:1px solid #e2e8f0;background:#f8fafc;border-radius:9px;padding:10px 12px;font-size:0.9rem;margin-top:4px;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#475569;font-weight:700;">Teléfono</label>
            <input id="perf-telefono" placeholder="8888-8888" style="width:100%;border:1px solid #e2e8f0;background:#f8fafc;border-radius:9px;padding:10px 12px;font-size:0.9rem;margin-top:4px;">
          </div>

          <div style="border-top:1px solid #e2e8f0;margin-top:4px;padding-top:12px;">
            <p style="font-size:0.82rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Cambiar contraseña <span style="font-weight:400;text-transform:none;">(opcional)</span></p>
            <input id="perf-pass-actual" type="password" placeholder="Contraseña actual" style="width:100%;border:1px solid #e2e8f0;background:#f8fafc;border-radius:9px;padding:10px 12px;font-size:0.9rem;margin-bottom:8px;">
            <input id="perf-pass-nueva" type="password" placeholder="Nueva contraseña (mín. 8)" style="width:100%;border:1px solid #e2e8f0;background:#f8fafc;border-radius:9px;padding:10px 12px;font-size:0.9rem;">
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:18px;">
          <button id="perf-guardar" onclick="guardarMiPerfil()" class="btn btn-success" style="flex:1;"><i class="fas fa-floppy-disk"></i> Guardar cambios</button>
          <button onclick="cerrarMiPerfil()" class="btn btn-outline"><i class="fas fa-xmark"></i> Cerrar</button>
        </div>
      </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarMiPerfil(); });
    document.body.appendChild(overlay);
  }

  // Cargar datos
  const msg = document.getElementById('perf-msg');
  msg.style.display = 'none';
  overlay.style.display = 'flex';
  try {
    const p = await perfil.obtener();
    const rolLabel = { administrador: 'Administrador', mecanico: 'Mecánico', cliente: 'Cliente' }[p.rol] ?? p.rol;
    document.getElementById('perf-rol').textContent = 'Sesión como ' + rolLabel;
    document.getElementById('perf-correo').value   = p.correo ?? '';
    document.getElementById('perf-nombre').value   = p.nombre ?? '';
    document.getElementById('perf-telefono').value = p.telefono ?? '';
    document.getElementById('perf-pass-actual').value = '';
    document.getElementById('perf-pass-nueva').value  = '';
  } catch (e) {
    toast('Error cargando tu perfil: ' + e.message, 'error');
  }
}

function cerrarMiPerfil() {
  const o = document.getElementById('perfil-overlay');
  if (o) o.style.display = 'none';
}

async function guardarMiPerfil() {
  const btn   = document.getElementById('perf-guardar');
  const nombre   = document.getElementById('perf-nombre').value.trim();
  const telefono = document.getElementById('perf-telefono').value.trim();
  const passA    = document.getElementById('perf-pass-actual').value;
  const passN    = document.getElementById('perf-pass-nueva').value;
  const msg   = document.getElementById('perf-msg');
  msg.style.display = 'none';

  if (!nombre) { msg.style.cssText += 'display:block;background:#fef2f2;color:#dc2626;'; msg.textContent = 'El nombre no puede quedar vacío.'; return; }
  if (passN && passN.length < 8) { msg.style.cssText += 'display:block;background:#fef2f2;color:#dc2626;'; msg.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }

  const body = { nombre, telefono };
  if (passN) { body.password_actual = passA; body.password_nueva = passN; }

  btnLoading(btn, true);
  try {
    const p = await perfil.actualizar(body);
    // Reflejar el nombre nuevo en el sidebar y en localStorage
    const u = getUsuario(); if (u) { u.nombre = p.nombre; localStorage.setItem('usuario', JSON.stringify(u)); }
    const nom = document.getElementById('sidebar-nombre'); if (nom) nom.textContent = p.nombre;
    const av  = document.getElementById('sidebar-avatar');
    if (av) av.textContent = (p.nombre || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    toast(passN ? 'Perfil y contraseña actualizados' : 'Perfil actualizado');
    cerrarMiPerfil();
  } catch (e) {
    msg.style.cssText += 'display:block;background:#fef2f2;color:#dc2626;';
    msg.textContent = e.message;
  } finally {
    btnLoading(btn, false);
  }
}

// Spinner dentro de un botón
function btnLoading(btn, loading) {
  if (loading) {
    btn._orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._orig;
  }
}

// ── Importar desde Excel (catálogo de servicios e inventario) ──
// El navegador lee el .xlsx con SheetJS, reconoce las columnas por su
// encabezado (sin importar tildes ni mayúsculas), valida y muestra una vista
// previa. Al confirmar manda las filas como JSON al backend, que crea o
// actualiza y devuelve { creados, actualizados, errores:[{fila, error}] }.
//
// abrirImportadorExcel({
//   titulo, ayuda, plantilla: 'archivo.xlsx',
//   columnas: [{ clave, encabezado, alias:[...], requerido, numero, ejemplo }],
//   enviar: async (filas) => resultado,
//   alTerminar: () => {}            // refrescar la tabla de la página
// })
const MAX_FILAS_EXCEL = 2000;
let _sheetJS = null;
let _imp = null;   // { cfg, filas, errores }

// SheetJS se descarga solo cuando se usa (no pesa en el resto de páginas)
function cargarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!_sheetJS) {
    _sheetJS = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload  = () => ok(window.XLSX);
      s.onerror = () => { _sheetJS = null; fail(new Error('No se pudo cargar el lector de Excel. Revisá la conexión a internet.')); };
      document.head.appendChild(s);
    });
  }
  return _sheetJS;
}

const _normEnc = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const _escHTML = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Acepta 12500 · "₡12.500" · "12,500.50" · "12500,5". Devuelve NaN si no es número.
function _numeroExcel(v) {
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    // El separador que aparece último es el decimal
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma > -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (punto > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');   // "12.500" = doce mil quinientos
  }
  return s.trim() === '' ? NaN : Number(s);
}

function abrirImportadorExcel(cfg) {
  _imp = { cfg, filas: [], errores: [] };
  let m = document.getElementById('modal-importar');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-importar';
    m.className = 'modal-overlay';
    m.style.display = 'none';
    m.innerHTML = `
      <div class="card" style="max-width:760px;">
        <div class="card-header">
          <div><h3 id="imp-titulo">Importar desde Excel</h3><p id="imp-ayuda"></p></div>
          <button class="modal-close" onclick="cerrarModal('modal-importar')"><i class="fas fa-times"></i></button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
          <button class="btn btn-outline btn-sm" onclick="descargarPlantillaExcel()"><i class="fas fa-download"></i> Descargar plantilla</button>
          <span style="color:var(--muted);font-size:0.82rem;">Columnas: <span id="imp-columnas"></span></span>
        </div>
        <div class="field">
          <label>Archivo de Excel (.xlsx, .xls o .csv)</label>
          <input id="imp-archivo" type="file" accept=".xlsx,.xls,.csv" onchange="leerArchivoExcel(this.files[0])">
        </div>
        <div id="imp-resumen" style="margin-top:12px;"></div>
        <div class="form-actions">
          <button id="imp-btn" class="btn btn-success" style="flex:1;" disabled onclick="enviarImportacion()"><i class="fas fa-file-import"></i> Importar</button>
          <button class="btn btn-outline" onclick="cerrarModal('modal-importar')"><i class="fas fa-xmark"></i> Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
  document.getElementById('imp-titulo').textContent = cfg.titulo;
  document.getElementById('imp-ayuda').textContent = cfg.ayuda ?? '';
  document.getElementById('imp-columnas').innerHTML = cfg.columnas
    .map(c => c.requerido ? `<strong>${_escHTML(c.encabezado)}*</strong>` : _escHTML(c.encabezado)).join(' · ');
  document.getElementById('imp-archivo').value = '';
  document.getElementById('imp-resumen').innerHTML = '';
  const btn = document.getElementById('imp-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-file-import"></i> Importar';
  abrirModal('modal-importar');
  cargarSheetJS().catch(() => {});   // precarga mientras el admin elige el archivo
}

async function descargarPlantillaExcel() {
  const { cfg } = _imp;
  try {
    const XLSX = await cargarSheetJS();
    const filas = [cfg.columnas.map(c => c.encabezado)];
    (cfg.columnas[0].ejemplo ?? []).forEach((_, i) => filas.push(cfg.columnas.map(c => c.ejemplo?.[i] ?? '')));
    const hoja = XLSX.utils.aoa_to_sheet(filas);
    hoja['!cols'] = cfg.columnas.map(c => ({ wch: Math.max(14, c.encabezado.length + 4) }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Datos');
    XLSX.writeFile(libro, cfg.plantilla);
  } catch (e) { toast(e.message, 'error'); }
}

async function leerArchivoExcel(archivo) {
  const resumen = document.getElementById('imp-resumen');
  const btn = document.getElementById('imp-btn');
  btn.disabled = true;
  if (!archivo) { resumen.innerHTML = ''; return; }
  resumen.innerHTML = '<p style="color:var(--muted);font-size:0.86rem;"><i class="fas fa-spinner fa-spin"></i> Leyendo archivo...</p>';

  const { cfg } = _imp;
  try {
    const XLSX = await cargarSheetJS();
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const matriz = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: '', blankrows: false });

    // Fila de encabezados: la primera (de las 10 primeras) que tenga alguna columna conocida
    const nombresCol = c => [c.encabezado, c.clave, ...(c.alias ?? [])].map(_normEnc);
    const idxEnc = matriz.slice(0, 10).findIndex(fila => fila.some(v => cfg.columnas.some(c => nombresCol(c).includes(_normEnc(v)))));
    if (idxEnc === -1) throw new Error('No se encontraron los encabezados. Usá la plantilla (primera fila con los nombres de las columnas).');
    const enc = matriz[idxEnc].map(_normEnc);
    const posicion = {};
    cfg.columnas.forEach(c => { posicion[c.clave] = enc.findIndex(e => nombresCol(c).includes(e)); });
    const faltan = cfg.columnas.filter(c => c.requerido && posicion[c.clave] === -1).map(c => c.encabezado);
    if (faltan.length) throw new Error(`Falta la columna: ${faltan.join(', ')}`);

    const filas = [], errores = [];
    matriz.slice(idxEnc + 1).forEach((fila, i) => {
      if (fila.every(v => String(v).trim() === '')) return;
      const numFila = idxEnc + i + 2;   // número de fila tal como se ve en Excel
      const obj = { fila: numFila };
      const problemas = [];
      cfg.columnas.forEach(c => {
        if (posicion[c.clave] === -1) return;
        let v = fila[posicion[c.clave]];
        if (typeof v === 'string') v = v.trim();
        if (v === '' || v === undefined) {
          if (c.requerido) problemas.push(`falta "${c.encabezado}"`);
          return;
        }
        if (c.numero) {
          const n = _numeroExcel(v);
          if (Number.isNaN(n) || n < 0) { problemas.push(`"${c.encabezado}" no es un número válido`); return; }
          v = n;
        }
        obj[c.clave] = c.numero ? v : String(v);
      });
      if (problemas.length) errores.push({ fila: numFila, error: problemas.join(', ') });
      else filas.push(obj);
    });

    if (filas.length + errores.length > MAX_FILAS_EXCEL)
      throw new Error(`El archivo tiene ${filas.length + errores.length} filas; el máximo es ${MAX_FILAS_EXCEL}. Dividilo en varios archivos.`);
    if (!filas.length && !errores.length) throw new Error('El archivo no tiene filas con datos.');

    _imp.filas = filas;
    _imp.errores = errores;
    const muestra = filas.slice(0, 8);
    resumen.innerHTML = `
      <p style="font-size:0.88rem;margin-bottom:8px;">
        <span class="tag success">${filas.length} fila(s) listas</span>
        ${errores.length ? `<span class="tag danger">${errores.length} con errores (no se importan)</span>` : ''}
      </p>
      ${muestra.length ? `
        <div class="table-wrap" style="max-height:240px;overflow:auto;">
          <table>
            <thead><tr><th>Fila</th>${cfg.columnas.map(c => `<th>${_escHTML(c.encabezado)}</th>`).join('')}</tr></thead>
            <tbody>${muestra.map(f => `<tr><td>${f.fila}</td>${cfg.columnas.map(c => `<td>${_escHTML(f[c.clave] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
        ${filas.length > muestra.length ? `<p style="color:var(--muted);font-size:0.8rem;margin-top:6px;">... y ${filas.length - muestra.length} fila(s) más</p>` : ''}` : ''}
      ${_listaErroresImp(errores)}`;
    btn.disabled = !filas.length;
    btn.innerHTML = `<i class="fas fa-file-import"></i> Importar ${filas.length} fila(s)`;
  } catch (e) {
    resumen.innerHTML = `<p style="color:var(--danger);font-size:0.86rem;"><i class="fas fa-circle-exclamation"></i> ${_escHTML(e.message)}</p>`;
  }
}

function _listaErroresImp(errores) {
  if (!errores.length) return '';
  const max = 30;
  return `
    <div style="margin-top:10px;background:var(--danger-soft);border-radius:9px;padding:10px 12px;font-size:0.82rem;max-height:160px;overflow:auto;">
      ${errores.slice(0, max).map(e => `<div><strong>Fila ${e.fila}:</strong> ${_escHTML(e.error)}</div>`).join('')}
      ${errores.length > max ? `<div>... y ${errores.length - max} más</div>` : ''}
    </div>`;
}

async function enviarImportacion() {
  const { cfg, filas, errores } = _imp;
  const btn = document.getElementById('imp-btn');
  btnLoading(btn, true);
  try {
    const r = await cfg.enviar(filas);
    const todosErrores = [...errores, ...(r.errores ?? [])].sort((a, b) => a.fila - b.fila);
    document.getElementById('imp-resumen').innerHTML = `
      <p style="font-size:0.9rem;">
        <span class="tag success">${r.creados} creado(s)</span>
        <span class="tag info">${r.actualizados} actualizado(s)</span>
        ${todosErrores.length ? `<span class="tag danger">${todosErrores.length} con errores</span>` : ''}
      </p>
      ${_listaErroresImp(todosErrores)}`;
    toast(`Importación lista: ${r.creados} creado(s), ${r.actualizados} actualizado(s)`);
    document.getElementById('imp-archivo').value = '';
    _imp.filas = [];
    if (cfg.alTerminar) cfg.alTerminar();
    btnLoading(btn, false);
    btn.disabled = true;
  } catch (e) {
    toast(e.message, 'error');
    btnLoading(btn, false);
  }
}
