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
  async function cargarMantPorMecanico() {
    const tbody = document.getElementById('rep-mant-mecanico');
    if (!tbody) return;
    try {
      const lista = await reportes.mantenimientosPorMecanico();
      R.mantMec = lista;
      if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:24px;">Aún no hay mecánicos registrados</td></tr>';
        return;
      }
      const max = Math.max(...lista.map(m => m.completados), 1);
      tbody.innerHTML = lista.map((m, i) => `
        <tr>
          <td><span style="width:24px;height:24px;background:${i === 0 && m.completados > 0 ? '#fef3c7' : '#f1f5f9'};color:${i === 0 && m.completados > 0 ? '#b45309' : '#475569'};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:900;">${i + 1}</span></td>
          <td><strong style="font-size:0.88rem;">${m.nombre}</strong></td>
          <td style="text-align:right;">
            <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
              <div style="width:120px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${(m.completados / max * 100).toFixed(0)}%;background:#2563eb;border-radius:99px;"></div>
              </div>
              <span class="tag ${m.completados > 0 ? 'success' : 'neutral'}" style="min-width:34px;text-align:center;">${m.completados}</span>
            </div>
          </td>
        </tr>`).join('');
    } catch (e) {
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

  await Promise.all([cargarResumen(), cargarRanking(), cargarMantPorMecanico(), cargarServiciosPopulares(), cargarChart()]);
});
