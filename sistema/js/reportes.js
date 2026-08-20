document.addEventListener('DOMContentLoaded', async () => {
  const rol = iniciarLayout(['administrador']);
  if (!rol) return;

  const money = n => '₡' + Number(n || 0).toLocaleString('es');

  // Datos cargados (se reusan para exportar a PDF, RPS-006)
  const R = {};

  // ── KPIs resumen ──────────────────────────────────────────
  async function cargarResumen() {
    try {
      const r = await reportes.resumen();
      R.resumen = r;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('rep-mantenimientos', r.mantenimientos_mes);
      set('rep-ingresos', money(r.ingresos_mes));
      set('rep-stock-bajo', r.stock_bajo);
    } catch (e) { console.error('[Reportes resumen]', e); }
  }

  // ── Ranking de mecánicos + KPI top ────────────────────────
  async function cargarRanking() {
    try {
      const lista = await reportes.rankingMecanicos();
      R.ranking = lista;
      const cont  = document.getElementById('rep-ranking');

      if (lista.length) {
        document.getElementById('rep-top-num').textContent    = lista[0].servicios;
        document.getElementById('rep-top-nombre').textContent = lista[0].nombre + ' · completados';
      }

      cont.innerHTML = lista.length
        ? lista.slice(0, 5).map((m, i) => `
            <div class="list-item">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="width:24px;height:24px;background:${i === 0 ? '#fef3c7' : '#f1f5f9'};color:${i === 0 ? '#b45309' : '#475569'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:900;">${i + 1}</span>
                <strong style="font-size:0.88rem;">${m.nombre}</strong>
              </div>
              <span class="tag info">${m.servicios} servicios</span>
            </div>`).join('')
        : '<p style="color:#94a3b8;padding:12px;font-size:0.88rem;">Aún no hay tareas completadas este mes</p>';
    } catch (e) { console.error('[Reportes ranking]', e); }
  }

  // ── RPS-004: mantenimientos completados por mecánico ──────
  let mantMecFull = [];   // lista completa (para ranking global y escala de barras)
  let mantMecMax  = 1;

  function renderMantMec(items) {
    const tbody = document.getElementById('rep-mant-mecanico');
    if (!tbody) return;
    if (!mantMecFull.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:24px;">Aún no hay mecánicos registrados</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(m => {
      const i = mantMecFull.indexOf(m);   // posición global (no la de la página)
      return `
        <tr>
          <td><span style="width:24px;height:24px;background:${i === 0 && m.completados > 0 ? '#fef3c7' : '#f1f5f9'};color:${i === 0 && m.completados > 0 ? '#b45309' : '#475569'};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:900;">${i + 1}</span></td>
          <td><strong style="font-size:0.88rem;">${m.nombre}</strong></td>
          <td style="text-align:right;">
            <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
              <div style="width:120px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${(m.completados / mantMecMax * 100).toFixed(0)}%;background:#2563eb;border-radius:99px;"></div>
              </div>
              <span class="tag ${m.completados > 0 ? 'success' : 'neutral'}" style="min-width:34px;text-align:center;">${m.completados}</span>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  const pagMantMec = crearPaginador('pag-mant-mecanico', renderMantMec, 5);

  async function cargarMantPorMecanico() {
    const tbody = document.getElementById('rep-mant-mecanico');
    if (!tbody) return;
    try {
      const lista = await reportes.mantenimientosPorMecanico();
      R.mantMec = lista;
      mantMecFull = lista;
      mantMecMax  = Math.max(...lista.map(m => m.completados), 1);
      pagMantMec.set(lista);
    } catch (e) {
      mantMecFull = [];
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:24px;">No se pudo cargar</td></tr>';
      console.error('[Reportes mant/mecánico]', e);
    }
  }

  // ── Servicios más solicitados ─────────────────────────────
  async function cargarServiciosPopulares() {
    try {
      const lista = await reportes.serviciosPopulares();
      R.servicios = lista;
      const cont  = document.getElementById('rep-servicios');
      if (!lista.length) {
        cont.innerHTML = '<p style="color:#94a3b8;padding:12px;font-size:0.88rem;">Sin datos de servicios todavía</p>';
        return;
      }
      const max = lista[0].cantidad;
      const colores = ['#2563eb', '#7c3aed', '#16a34a', '#f59e0b', '#dc2626'];
      cont.innerHTML = lista.map((s, i) => `
        <div class="stat-row">
          <span class="label">${s.nombre}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:80px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
              <div style="height:100%;width:${(s.cantidad / max * 100).toFixed(0)}%;background:${colores[i % colores.length]};border-radius:99px;"></div>
            </div>
            <span class="value">${s.cantidad}</span>
          </div>
        </div>`).join('');
    } catch (e) { console.error('[Reportes servicios]', e); }
  }

  // ── Gráfico de ingresos mensuales ─────────────────────────
  async function cargarChart() {
    const cont = document.getElementById('rep-chart');
    try {
      const datos = await reportes.ingresosMensuales();
      R.ingresos = datos;
      if (!datos.length) {
        cont.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;margin:auto;">Sin facturación registrada todavía</p>';
        return;
      }
      const max = Math.max(...datos.map(d => d.total), 1);
      cont.innerHTML = datos.map((d, i) => {
        const esUltimo = i === datos.length - 1;
        const h = Math.max(4, (d.total / max * 100));
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;justify-content:flex-end;height:100%;">
            <span style="font-size:0.68rem;color:#94a3b8;">₡${(d.total / 1000).toFixed(0)}K</span>
            <div style="width:100%;background:linear-gradient(180deg,${esUltimo ? '#818cf8,#4f46e5' : '#60a5fa,#2563eb'});border-radius:6px 6px 0 0;height:${h}%;"></div>
            <span style="font-size:0.72rem;color:${esUltimo ? '#0f172a' : '#64748b'};font-weight:${esUltimo ? '700' : '400'};">${d.mes}</span>
          </div>`;
      }).join('');
    } catch (e) {
      cont.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;margin:auto;">No se pudo cargar el gráfico</p>';
      console.error('[Reportes chart]', e);
    }
  }

  // ── RPS-006: exportar los reportes a PDF ──────────────────
  window.exportarReportesPDF = () => {
    const res = R.resumen ?? {};
    const filasRanking = (R.ranking ?? []).slice(0, 10).map((m, i) =>
      `<tr><td>${i + 1}</td><td>${m.nombre}</td><td style="text-align:right;">${m.servicios}</td></tr>`).join('');
    const filasMantMec = (R.mantMec ?? []).map((m, i) =>
      `<tr><td>${i + 1}</td><td>${m.nombre}</td><td style="text-align:right;">${m.completados}</td></tr>`).join('');
    const filasServicios = (R.servicios ?? []).map(s =>
      `<tr><td>${s.nombre}</td><td style="text-align:right;">${s.cantidad}</td></tr>`).join('');
    const filasIngresos = (R.ingresos ?? []).map(d =>
      `<tr><td>${d.mes}</td><td style="text-align:right;">${money(d.total)}</td></tr>`).join('');

    const bloque = (titulo, cabeceras, filas, vacio) => `
      <h3 class="sec">${titulo}</h3>
      ${filas ? `<table><thead><tr>${cabeceras}</tr></thead><tbody>${filas}</tbody></table>`
              : `<p class="vacio">${vacio}</p>`}`;

    const html = `
      <html><head><meta charset="utf-8"><title>Reporte general</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:820px;margin:26px auto;padding:0 20px;}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:18px;}
        .brand{font-size:1.3rem;font-weight:800;color:#1e3a8a;}
        .muted{color:#64748b;font-size:0.85rem;}
        .kpis{display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap;}
        .kpi{flex:1;min-width:150px;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;}
        .kpi .lbl{color:#64748b;font-size:0.76rem;text-transform:uppercase;letter-spacing:.4px;}
        .kpi .val{font-size:1.3rem;font-weight:800;margin-top:3px;}
        h3.sec{font-size:1.02rem;margin:22px 0 6px;padding-bottom:5px;border-bottom:1px solid #e2e8f0;}
        table{width:100%;border-collapse:collapse;margin-top:4px;}
        th,td{padding:7px 9px;border-bottom:1px solid #e2e8f0;font-size:0.84rem;}
        th{background:#f8fafc;text-align:left;color:#475569;}
        .vacio{color:#94a3b8;font-size:0.85rem;padding:8px 0;}
      </style></head>
      <body>
        <div class="head">
          <div>
            <div class="brand">Lubricentro Villagra</div>
            <div class="muted">Moravia, San Vicente, San José, Costa Rica<br>Tel. 8413-2121 · lubricentrovillagra@gmail.com</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.35rem;font-weight:900;">REPORTE GENERAL</div>
            <div class="muted">Generado: ${new Date().toLocaleString('es-CR')}</div>
          </div>
        </div>

        <h3 class="sec">Resumen del mes</h3>
        <div class="kpis">
          <div class="kpi"><div class="lbl">Mantenimientos</div><div class="val">${res.mantenimientos_mes ?? 0}</div></div>
          <div class="kpi"><div class="lbl">Completados</div><div class="val">${res.completados_mes ?? 0}</div></div>
          <div class="kpi"><div class="lbl">Ingresos</div><div class="val">${money(res.ingresos_mes)}</div></div>
          <div class="kpi"><div class="lbl">Stock bajo</div><div class="val">${res.stock_bajo ?? 0}</div></div>
          <div class="kpi"><div class="lbl">Empleados activos</div><div class="val">${res.empleados_activos ?? 0}</div></div>
        </div>

        ${bloque('Ingresos mensuales (últimos 6 meses)',
          '<th>Mes</th><th style="text-align:right;">Total</th>', filasIngresos, 'Sin facturación registrada.')}

        ${bloque('Mantenimientos completados por mecánico (histórico)',
          '<th style="width:40px;">#</th><th>Mecánico</th><th style="text-align:right;">Completados</th>', filasMantMec, 'Sin datos.')}

        ${bloque('Ranking de mecánicos (tareas completadas este mes)',
          '<th style="width:40px;">#</th><th>Mecánico</th><th style="text-align:right;">Servicios</th>', filasRanking, 'Aún no hay tareas completadas este mes.')}

        ${bloque('Servicios más solicitados',
          '<th>Servicio</th><th style="text-align:right;">Cantidad</th>', filasServicios, 'Sin datos de servicios todavía.')}

        <p style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-top:28px;">Reporte generado por Auto Service Pro · Lubricentro Villagra</p>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { toast('Permite las ventanas emergentes para exportar el PDF', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };


  // ══════════════════════════════════════════════════════════
  // ── FLUJO DE CAJA ─────────────────────────────────────────
  // Ingresos (facturas cobradas + manuales) y gastos (manuales)
  // agrupados por día / semana / mes / año.
  // ══════════════════════════════════════════════════════════
  let fcDatos      = null;   // última respuesta del backend
  let fcCategorias = [];     // catálogo de categorías de caja
  let fcChart      = null;   // instancia de Chart.js
  let fcCargadas   = false;  // ¿ya se trajeron las categorías?

  const hoyISO = () => new Date().toISOString().slice(0, 10);
  const iso = (d) => d.toISOString().slice(0, 10);

  // Rango de fechas de cada atajo. La semana arranca el lunes.
  function rangoPreset(preset) {
    const hoy = new Date();
    const y = hoy.getFullYear(), m = hoy.getMonth(), d = hoy.getDate();
    if (preset === 'hoy')    return { desde: hoyISO(), hasta: hoyISO(), agrupar: 'dia' };
    if (preset === 'semana') {
      const lunes = new Date(y, m, d - ((hoy.getDay() + 6) % 7));
      const domingo = new Date(y, m, lunes.getDate() + 6);
      return { desde: iso(lunes), hasta: iso(domingo), agrupar: 'dia' };
    }
    if (preset === 'anio')   return { desde: iso(new Date(y, 0, 1)), hasta: iso(new Date(y, 11, 31)), agrupar: 'mes' };
    // mes (por defecto)
    return { desde: iso(new Date(y, m, 1)), hasta: iso(new Date(y, m + 1, 0)), agrupar: 'dia' };
  }

  window.presetFlujo = (preset) => {
    const { desde, hasta, agrupar } = rangoPreset(preset);
    document.getElementById('fc-desde').value   = desde;
    document.getElementById('fc-hasta').value   = hasta;
    document.getElementById('fc-agrupar').value = agrupar;
    document.querySelectorAll('#fc-presets [data-preset]').forEach(b => {
      const activo = b.dataset.preset === preset;
      b.classList.toggle('btn-primary', activo);
      b.classList.toggle('btn-outline', !activo);
    });
    cargarFlujoCaja();
  };

  function mostrarAvisoFlujo(msg) {
    const box = document.getElementById('fc-aviso');
    if (!box) return;
    if (!msg) { box.style.display = 'none'; return; }
    box.querySelector('p').innerHTML = msg;
    box.style.display = 'block';
  }

  // ── Carga principal ───────────────────────────────────────
  window.cargarFlujoCaja = async () => {
    const desdeEl = document.getElementById('fc-desde');
    if (!desdeEl) return;

    // Primera entrada al submódulo: arrancar en "este mes".
    if (!desdeEl.value) {
      const { desde, hasta, agrupar } = rangoPreset('mes');
      desdeEl.value = desde;
      document.getElementById('fc-hasta').value   = hasta;
      document.getElementById('fc-agrupar').value = agrupar;
    }

    const desde   = desdeEl.value;
    const hasta   = document.getElementById('fc-hasta').value;
    const agrupar = document.getElementById('fc-agrupar').value;

    if (desde > hasta) { toast('La fecha "desde" no puede ser posterior a "hasta"', 'error'); return; }

    if (!fcCargadas) await cargarCategoriasCaja();

    try {
      fcDatos = await flujoCaja.resumen(desde, hasta, agrupar);
      R.flujo = fcDatos;
      mostrarAvisoFlujo(null);
      renderFlujoCaja();
    } catch (e) {
      const falta = /migraci[oó]n|movimientos_caja|categorias_caja|fecha_pago/i.test(e.message || '');
      mostrarAvisoFlujo(falta
        ? '<strong>Falta correr la migración del flujo de caja.</strong> Corré <code>backend/migracion-flujo-caja.sql</code> en el SQL Editor de Supabase para poder registrar ingresos y gastos.'
        : 'No se pudo cargar el flujo de caja: ' + e.message);
      console.error('[Flujo de caja]', e);
    }
  };

  // ── Render de todo el submódulo ───────────────────────────
  function renderFlujoCaja() {
    if (!fcDatos) return;
    const t = fcDatos.totales;

    document.getElementById('fc-kpi-ingresos').textContent = money(t.ingresos);
    document.getElementById('fc-kpi-gastos').textContent   = money(t.gastos);
    document.getElementById('fc-kpi-balance').textContent  = money(t.balance);
    document.getElementById('fc-kpi-movs').textContent     = fcDatos.movimientos.length;

    document.getElementById('fc-kpi-ingresos-det').textContent =
      `${t.facturas_cobradas} factura(s) ${money(t.ingresos_facturas)} + manual ${money(t.ingresos_manuales)}`;
    document.getElementById('fc-kpi-gastos-det').textContent   = `${t.movimientos_manuales} movimiento(s) manual(es)`;
    const balEl = document.getElementById('fc-kpi-balance-det');
    balEl.textContent = t.balance >= 0 ? 'Saldo a favor en el período' : 'El período cierra en negativo';
    document.getElementById('fc-kpi-movs-det').textContent = `Del ${fmtFecha(fcDatos.desde)} al ${fmtFecha(fcDatos.hasta)}`;

    const nombreAgrup = { dia: 'día', semana: 'semana', mes: 'mes', anio: 'año' }[fcDatos.agrupar] || 'período';
    document.getElementById('fc-chart-sub').textContent = 'Agrupado por ' + nombreAgrup;
    document.getElementById('fc-serie-sub').textContent = 'Agrupado por ' + nombreAgrup;

    renderSerieCaja();
    renderCategoriasCaja();
    renderMovimientosCaja();
    renderChartCaja();
  }

  const fmtFecha = (f) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-CR') : '-';

  // ── Tabla: detalle por período ────────────────────────────
  function renderSerieCaja() {
    const tb = document.getElementById('fc-serie-tbody');
    const s = fcDatos.series;
    tb.innerHTML = s.length
      ? s.map(f => `
          <tr>
            <td><strong>${f.etiqueta}</strong></td>
            <td style="text-align:right;color:#16a34a;">${money(f.ingresos)}</td>
            <td style="text-align:right;color:#dc2626;">${money(f.gastos)}</td>
            <td style="text-align:right;font-weight:700;color:${f.balance >= 0 ? '#16a34a' : '#dc2626'};">${money(f.balance)}</td>
          </tr>`).join('') +
        `<tr style="border-top:2px solid var(--border);font-weight:800;">
            <td>Total</td>
            <td style="text-align:right;color:#16a34a;">${money(fcDatos.totales.ingresos)}</td>
            <td style="text-align:right;color:#dc2626;">${money(fcDatos.totales.gastos)}</td>
            <td style="text-align:right;color:${fcDatos.totales.balance >= 0 ? '#16a34a' : '#dc2626'};">${money(fcDatos.totales.balance)}</td>
          </tr>`
      : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;">Sin movimientos en el período.</td></tr>';
  }

  // ── Desglose por categoría ────────────────────────────────
  function renderCategoriasCaja() {
    const cont = document.getElementById('fc-categorias');
    const cats = fcDatos.categorias;
    if (!cats.length) {
      cont.innerHTML = '<p style="color:#94a3b8;padding:12px;font-size:0.88rem;">Sin datos en el período.</p>';
      return;
    }
    const max = Math.max(...cats.map(c => c.total)) || 1;
    cont.innerHTML = cats.map(c => {
      const esIngreso = c.tipo === 'ingreso';
      const color = esIngreso ? '#16a34a' : '#dc2626';
      return `
        <div style="padding:9px 12px;">
          <div style="display:flex;justify-content:space-between;gap:10px;font-size:0.85rem;margin-bottom:5px;">
            <span><i class="fas fa-${esIngreso ? 'arrow-up' : 'arrow-down'}" style="color:${color};font-size:0.72rem;"></i> ${c.categoria} <span style="color:#94a3b8;">(${c.cantidad})</span></span>
            <strong style="color:${color};">${money(c.total)}</strong>
          </div>
          <div style="height:6px;background:var(--surface-2);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${(c.total / max * 100).toFixed(1)}%;background:${color};"></div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Tabla de movimientos (con filtro) ─────────────────────
  window.renderMovimientosCaja = () => {
    if (!fcDatos) return;
    const filtro = document.getElementById('fc-filtro-tipo').value;
    const lista = fcDatos.movimientos.filter(m =>
      !filtro ? true : filtro === 'manual' ? m.origen === 'manual' : m.tipo === filtro);
    pagMovsCaja.set(lista);
  };

  function renderFilasMovsCaja(items) {
    const tb = document.getElementById('fc-movs-tbody');
    if (!items.length) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Sin movimientos en el período.</td></tr>';
      return;
    }
    tb.innerHTML = items.map(m => {
      const esIngreso = m.tipo === 'ingreso';
      const color = esIngreso ? '#16a34a' : '#dc2626';
      return `
        <tr>
          <td style="font-size:0.85rem;">${fmtFecha(m.fecha)}</td>
          <td style="font-size:0.86rem;">${m.concepto}</td>
          <td style="font-size:0.84rem;color:#64748b;">${m.categoria}</td>
          <td><span class="tag ${m.origen === 'factura' ? 'info' : 'warning'}">${m.origen === 'factura' ? 'Factura' : 'Manual'}</span></td>
          <td style="text-align:right;font-weight:700;color:${color};">${esIngreso ? '+' : '−'}${money(m.monto)}</td>
          <td style="text-align:right;">
            ${m.origen === 'manual' ? `
              <button class="btn btn-outline btn-sm" title="Editar" onclick="editarMovimiento(${m.id})"><i class="fas fa-pen"></i></button>
              <button class="btn btn-outline btn-sm" title="Eliminar" onclick="eliminarMovimiento(${m.id})"><i class="fas fa-trash"></i></button>
            ` : '<span style="color:#cbd5e1;font-size:0.78rem;">automático</span>'}
          </td>
        </tr>`;
    }).join('');
  }

  const pagMovsCaja = crearPaginador('pag-movs-caja', renderFilasMovsCaja, 10);

  // ── Gráfico ingresos vs gastos ────────────────────────────
  function renderChartCaja() {
    const canvas = document.getElementById('fc-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (fcChart) { fcChart.destroy(); fcChart = null; }

    const s = fcDatos.series;
    fcChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: s.map(f => f.etiqueta),
        datasets: [
          { label: 'Ingresos', data: s.map(f => f.ingresos), backgroundColor: '#16a34a', borderRadius: 5 },
          { label: 'Gastos',   data: s.map(f => f.gastos),   backgroundColor: '#dc2626', borderRadius: 5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + money(c.parsed.y) } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => '₡' + Number(v).toLocaleString('es') } },
          x: { ticks: { maxRotation: 60, minRotation: 0, font: { size: 10 } } }
        }
      }
    });
  }

  // ── Categorías de caja ────────────────────────────────────
  async function cargarCategoriasCaja() {
    try {
      fcCategorias = await flujoCaja.categorias();
      fcCargadas = true;
    } catch (e) {
      fcCategorias = [];
      console.error('[Categorías caja]', e);
    }
  }

  window.llenarCategoriasMov = (seleccionar) => {
    const tipo = document.getElementById('mov-tipo').value;
    const sel  = document.getElementById('mov-categoria');
    const utiles = fcCategorias.filter(c => c.tipo === tipo || c.tipo === 'ambos');
    sel.innerHTML = '<option value="">-- Sin categoría --</option>' +
      utiles.map(c => `<option value="${c.id_categoria_caja}">${c.nombre}</option>`).join('');
    if (seleccionar) sel.value = seleccionar;
  };

  window.abrirCategoriasCaja = async () => {
    await cargarCategoriasCaja();
    renderTablaCategoriasCaja();
    abrirModal('modal-cat-caja');
  };

  function renderTablaCategoriasCaja() {
    const tb = document.getElementById('cat-caja-tbody');
    const etiqueta = { gasto: 'Gastos', ingreso: 'Ingresos', ambos: 'Ambos' };
    tb.innerHTML = fcCategorias.length
      ? fcCategorias.map(c => `
          <tr>
            <td style="font-size:0.87rem;">${c.nombre}</td>
            <td><span class="tag ${c.tipo === 'ingreso' ? 'success' : c.tipo === 'gasto' ? 'danger' : 'info'}">${etiqueta[c.tipo] || c.tipo}</span></td>
            <td style="text-align:right;">
              <button class="btn btn-outline btn-sm" title="Eliminar" onclick="eliminarCategoriaCaja(${c.id_categoria_caja})"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:20px;">No hay categorías.</td></tr>';
  }

  window.crearCategoriaCaja = async () => {
    const nombre = document.getElementById('cat-caja-nombre').value.trim();
    const tipo   = document.getElementById('cat-caja-tipo').value;
    if (!nombre) { toast('Escribí el nombre de la categoría', 'error'); return; }
    try {
      await flujoCaja.crearCategoria({ nombre, tipo });
      document.getElementById('cat-caja-nombre').value = '';
      await cargarCategoriasCaja();
      renderTablaCategoriasCaja();
      toast('Categoría agregada');
    } catch (e) { toast(e.message, 'error'); }
  };

  window.eliminarCategoriaCaja = async (id) => {
    if (!(await confirmar({ titulo: 'Eliminar categoría', mensaje: '¿Eliminar esta categoría de caja?', confirmar: 'Eliminar' }))) return;
    try {
      await flujoCaja.eliminarCategoria(id);
      await cargarCategoriasCaja();
      renderTablaCategoriasCaja();
      toast('Categoría eliminada');
    } catch (e) { toast(e.message, 'error'); }
  };

  // ── Alta / edición de movimientos manuales ────────────────
  window.nuevoMovimiento = async () => {
    if (!fcCargadas) await cargarCategoriasCaja();
    document.getElementById('mov-titulo').textContent = 'Registrar movimiento';
    document.getElementById('mov-id').value       = '';
    document.getElementById('mov-tipo').value     = 'gasto';
    document.getElementById('mov-fecha').value    = hoyISO();
    document.getElementById('mov-concepto').value = '';
    document.getElementById('mov-monto').value    = '';
    document.getElementById('mov-metodo').value   = '';
    llenarCategoriasMov();
    abrirModal('modal-movimiento');
  };

  window.editarMovimiento = async (id) => {
    const m = fcDatos?.movimientos.find(x => x.origen === 'manual' && x.id === id);
    if (!m) return;
    if (!fcCargadas) await cargarCategoriasCaja();
    document.getElementById('mov-titulo').textContent = 'Editar movimiento';
    document.getElementById('mov-id').value       = m.id;
    document.getElementById('mov-tipo').value     = m.tipo;
    document.getElementById('mov-fecha').value    = m.fecha;
    document.getElementById('mov-concepto').value = m.concepto;
    document.getElementById('mov-monto').value    = m.monto;
    document.getElementById('mov-metodo').value   = m.metodo_pago || '';
    llenarCategoriasMov(m.id_categoria_caja || '');
    abrirModal('modal-movimiento');
  };

  window.guardarMovimiento = async () => {
    const id   = document.getElementById('mov-id').value;
    const body = {
      tipo:       document.getElementById('mov-tipo').value,
      fecha:      document.getElementById('mov-fecha').value,
      concepto:   document.getElementById('mov-concepto').value.trim(),
      monto:      parseFloat(document.getElementById('mov-monto').value),
      id_categoria_caja: document.getElementById('mov-categoria').value || null,
      metodo_pago: document.getElementById('mov-metodo').value || null
    };

    if (!body.fecha)     { toast('Elegí la fecha', 'error'); return; }
    if (!body.concepto)  { toast('Escribí el concepto', 'error'); return; }
    if (!(body.monto > 0)) { toast('El monto debe ser mayor a 0', 'error'); return; }

    const btn = document.getElementById('btn-guardar-mov');
    btnLoading(btn, true);
    try {
      if (id) await flujoCaja.actualizar(id, body);
      else    await flujoCaja.crear(body);
      cerrarModal('modal-movimiento');
      toast(id ? 'Movimiento actualizado' : 'Movimiento registrado');
      await cargarFlujoCaja();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  };

  window.eliminarMovimiento = async (id) => {
    if (!(await confirmar({ titulo: 'Eliminar movimiento', mensaje: '¿Eliminar este movimiento del flujo de caja?', confirmar: 'Eliminar' }))) return;
    try {
      await flujoCaja.eliminar(id);
      toast('Movimiento eliminado');
      await cargarFlujoCaja();
    } catch (e) { toast(e.message, 'error'); }
  };

  // ── Exportar el flujo de caja a PDF ───────────────────────
  window.exportarFlujoPDF = () => {
    if (!fcDatos) { toast('Primero cargá un período', 'error'); return; }
    const t = fcDatos.totales;
    const nombreAgrup = { dia: 'día', semana: 'semana', mes: 'mes', anio: 'año' }[fcDatos.agrupar] || 'período';

    const filasSerie = fcDatos.series.map(f =>
      `<tr><td>${f.etiqueta}</td><td class="r" style="color:#16a34a;">${money(f.ingresos)}</td><td class="r" style="color:#dc2626;">${money(f.gastos)}</td><td class="r"><strong>${money(f.balance)}</strong></td></tr>`).join('');

    const filasCat = fcDatos.categorias.map(c =>
      `<tr><td>${c.categoria}</td><td>${c.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}</td><td class="r">${c.cantidad}</td><td class="r">${money(c.total)}</td></tr>`).join('');

    const filasMovs = fcDatos.movimientos.map(m =>
      `<tr><td>${fmtFecha(m.fecha)}</td><td>${m.concepto}</td><td>${m.categoria}</td><td>${m.origen === 'factura' ? 'Factura' : 'Manual'}</td><td class="r" style="color:${m.tipo === 'ingreso' ? '#16a34a' : '#dc2626'};">${m.tipo === 'ingreso' ? '+' : '−'}${money(m.monto)}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Flujo de caja</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;padding:28px;}
        h1{font-size:1.5rem;margin:0 0 4px;} h2{font-size:1rem;margin:26px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:5px;}
        .sub{color:#64748b;font-size:0.85rem;margin-bottom:18px;}
        table{width:100%;border-collapse:collapse;font-size:0.82rem;}
        th{background:#f1f5f9;text-align:left;padding:7px 9px;font-size:0.76rem;text-transform:uppercase;color:#475569;}
        td{padding:7px 9px;border-bottom:1px solid #e2e8f0;} .r{text-align:right;}
        .kpis{display:flex;gap:12px;margin-bottom:8px;}
        .kpi{flex:1;border:1px solid #e2e8f0;border-radius:9px;padding:12px;}
        .kpi .lbl{font-size:0.72rem;color:#64748b;text-transform:uppercase;}
        .kpi .val{font-size:1.25rem;font-weight:800;margin-top:3px;}
        .vacio{color:#94a3b8;font-size:0.85rem;padding:8px 0;}
      </style></head><body>
      <h1>Flujo de caja</h1>
      <p class="sub">Lubricentro Villagra · del ${fmtFecha(fcDatos.desde)} al ${fmtFecha(fcDatos.hasta)} · agrupado por ${nombreAgrup}<br>Generado el ${new Date().toLocaleString('es-CR')}</p>

      <div class="kpis">
        <div class="kpi"><div class="lbl">Ingresos</div><div class="val" style="color:#16a34a;">${money(t.ingresos)}</div></div>
        <div class="kpi"><div class="lbl">Gastos</div><div class="val" style="color:#dc2626;">${money(t.gastos)}</div></div>
        <div class="kpi"><div class="lbl">Balance</div><div class="val" style="color:${t.balance >= 0 ? '#16a34a' : '#dc2626'};">${money(t.balance)}</div></div>
      </div>
      <p class="sub">Ingresos = ${t.facturas_cobradas} factura(s) cobrada(s) por ${money(t.ingresos_facturas)} + ${money(t.ingresos_manuales)} registrados a mano.</p>

      <h2>Detalle por ${nombreAgrup}</h2>
      ${filasSerie ? `<table><thead><tr><th>Período</th><th class="r">Ingresos</th><th class="r">Gastos</th><th class="r">Balance</th></tr></thead><tbody>${filasSerie}</tbody></table>` : '<p class="vacio">Sin movimientos en el período.</p>'}

      <h2>Por categoría</h2>
      ${filasCat ? `<table><thead><tr><th>Categoría</th><th>Tipo</th><th class="r">Movimientos</th><th class="r">Total</th></tr></thead><tbody>${filasCat}</tbody></table>` : '<p class="vacio">Sin datos.</p>'}

      <h2>Movimientos</h2>
      ${filasMovs ? `<table><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Origen</th><th class="r">Monto</th></tr></thead><tbody>${filasMovs}</tbody></table>` : '<p class="vacio">Sin movimientos.</p>'}

      <p style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-top:28px;">Reporte generado por Auto Service Pro · Lubricentro Villagra</p>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { toast('Permite las ventanas emergentes para exportar el PDF', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  await Promise.all([cargarResumen(), cargarRanking(), cargarMantPorMecanico(), cargarServiciosPopulares(), cargarChart()]);
});
