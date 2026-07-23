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
      document.removeEventListener('keydown', onKey);
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 140);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cerrar(false);
      else if (e.key === 'Enter') cerrar(true);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return cerrar(false);
      const btn = e.target.closest('[data-c]');
      if (btn) cerrar(btn.dataset.c === 'si');
    });
    document.addEventListener('keydown', onKey);
    setTimeout(() => overlay.querySelector('[data-c="si"]').focus(), 30);
  });
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
