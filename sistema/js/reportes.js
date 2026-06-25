document.addEventListener('DOMContentLoaded', async () => {
  const rol = iniciarLayout(['administrador']);
  if (!rol) return;

  const money = n => '₡' + Number(n || 0).toLocaleString('es');

  // ── KPIs resumen ──────────────────────────────────────────
  async function cargarResumen() {
    try {
      const r = await reportes.resumen();
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

  // ── Servicios más solicitados ─────────────────────────────
  async function cargarServiciosPopulares() {
    try {
      const lista = await reportes.serviciosPopulares();
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

  await Promise.all([cargarResumen(), cargarRanking(), cargarServiciosPopulares(), cargarChart()]);
});
