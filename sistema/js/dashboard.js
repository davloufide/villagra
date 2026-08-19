document.addEventListener('DOMContentLoaded', async () => {
  // Solo admin ve el dashboard; mecánico y cliente van a su página
  const rol = iniciarLayout(['administrador']);
  if (!rol) return;

  const money = n => '₡' + Number(n || 0).toLocaleString('es');

  if (window.Chart) {
    Chart.defaults.font.family = 'Inter, system-ui, -apple-system, sans-serif';
    Chart.defaults.color = '#64748b';
  }

  let ingresosData = [];
  let chartIngresos = null;

  // ── KPIs (resumen del mes) ────────────────────────────────
  try {
    const r = await reportes.resumen();
    document.getElementById('kpi-ingresos').textContent   = money(r.ingresos_mes);
    document.getElementById('kpi-mant').textContent       = r.mantenimientos_mes ?? 0;
    document.getElementById('kpi-mant-sub').textContent   = `${r.completados_mes ?? 0} completados`;
    document.getElementById('kpi-terminados').textContent = r.completados_mes ?? 0;
    document.getElementById('kpi-empleados').textContent  = r.empleados_activos ?? 0;
    document.getElementById('kpi-stock').textContent      = r.stock_bajo ?? 0;
  } catch (e) {
    console.error('[Dashboard resumen]', e);
  }

  // ── Mantenimientos: KPI activos + recientes + doughnut de estados ──
  try {
    const lista = await mantenimientos.lista();
    const cont = { recibido: 0, en_progreso: 0, terminado: 0 };
    lista.forEach(m => { if (cont[m.estado] !== undefined) cont[m.estado]++; });

    const activos = lista.filter(m => m.estado !== 'terminado');
    document.getElementById('kpi-activos').textContent = activos.length;
    document.getElementById('kpi-activos-sub').textContent =
      `${cont.en_progreso} en proceso · ${cont.recibido} pendientes`;

    // Servicios recientes (tabla)
    const tbody = document.getElementById('dash-recientes');
    const top = lista.slice(0, 6);
    tbody.innerHTML = top.length
      ? top.map(m => `
          <tr>
            <td><strong>${m.vehiculos?.placa ?? '-'}</strong><br>
              <small style="color:#94a3b8;">${m.vehiculos?.marcas?.nombre_marca ?? ''}</small></td>
            <td>${m.vehiculos?.clientes?.usuarios?.nombre ?? '-'}</td>
            <td>${tagEstado(m.estado)}</td>
            <td>
              <div class="progress" style="width:70px;display:inline-block;"><span style="width:${m.porcentaje_avance ?? 0}%"></span></div>
              <small style="color:#94a3b8;"> ${m.porcentaje_avance ?? 0}%</small>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px;">Sin mantenimientos registrados</td></tr>';

    dibujarDoughnutEstados(cont);
  } catch (e) {
    console.error('[Dashboard mantenimientos]', e);
  }

  // ── Stock crítico ─────────────────────────────────────────
  try {
    const alertas = await inventario.alertas();
    const cont = document.getElementById('dash-stock');
    cont.innerHTML = alertas.length
      ? alertas.map(p => `
          <div class="list-item">
            <span>${p.nombre} <small style="color:#94a3b8;">${p.codigo}</small></span>
            <span class="tag ${p.cantidad_stock === 0 ? 'danger' : 'warning'}">${p.cantidad_stock} uds.</span>
          </div>`).join('')
      : '<p style="color:#16a34a;padding:12px;font-size:0.88rem;"><i class="fas fa-check-circle"></i> Todo el stock está sobre el mínimo</p>';
  } catch (e) {
    console.error('[Dashboard stock]', e);
  }

  // ── Gráficos de reportes ──────────────────────────────────
  try { ingresosData = await reportes.ingresosMensuales(); dibujarIngresos('bar'); }
  catch (e) { console.error('[Dashboard ingresos]', e); }

  try { dibujarServicios(await reportes.serviciosPopulares()); }
  catch (e) { console.error('[Dashboard servicios]', e); }

  try { dibujarMecanicos(await reportes.mantenimientosPorMecanico()); }
  catch (e) { console.error('[Dashboard mecánicos]', e); }

  // ── Helpers de gráficos (Chart.js) ────────────────────────
  function sinDatos(id, msg) {
    const c = document.getElementById(id);
    if (c && c.parentElement) c.parentElement.innerHTML =
      `<p style="color:#94a3b8;font-size:0.86rem;text-align:center;position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);">${msg}</p>`;
  }

  function dibujarIngresos(tipo) {
    if (!window.Chart) return;
    if (!ingresosData.length) return sinDatos('chart-ingresos', 'Sin facturación registrada todavía');
    if (chartIngresos) chartIngresos.destroy();
    const esLinea = tipo === 'line';
    chartIngresos = new Chart(document.getElementById('chart-ingresos'), {
      type: tipo,
      data: {
        labels: ingresosData.map(d => d.mes),
        datasets: [{
          label: 'Ingresos',
          data: ingresosData.map(d => d.total),
          backgroundColor: esLinea ? 'rgba(37,99,235,0.12)' : '#2563eb',
          borderColor: '#2563eb', borderWidth: 2, borderRadius: 6,
          fill: esLinea, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#2563eb'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => money(c.parsed.y) } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => '₡' + (v / 1000).toFixed(0) + 'K' }, grid: { color: '#eef2f7' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
  window.cambiarTipoIngresos = (t) => dibujarIngresos(t);

  function dibujarDoughnutEstados(c) {
    if (!window.Chart) return;
    if (!(c.recibido + c.en_progreso + c.terminado)) return sinDatos('chart-estados', 'Sin mantenimientos todavía');
    new Chart(document.getElementById('chart-estados'), {
      type: 'doughnut',
      data: {
        labels: ['Recibido', 'En proceso', 'Terminado'],
        datasets: [{ data: [c.recibido, c.en_progreso, c.terminado], backgroundColor: ['#94a3b8', '#f59e0b', '#16a34a'], borderWidth: 3, borderColor: '#fff' }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 12 } } } } }
    });
  }

  function dibujarServicios(serv) {
    if (!window.Chart) return;
    if (!serv || !serv.length) return sinDatos('chart-servicios', 'Sin datos de servicios todavía');
    new Chart(document.getElementById('chart-servicios'), {
      type: 'bar',
      data: { labels: serv.map(s => s.nombre), datasets: [{ label: 'Solicitudes', data: serv.map(s => s.cantidad), backgroundColor: '#7c3aed', borderRadius: 6 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f7' } }, y: { grid: { display: false } } }
      }
    });
  }

  function dibujarMecanicos(mec) {
    if (!window.Chart) return;
    if (!mec || !mec.length) return sinDatos('chart-mecanicos', 'Sin datos todavía');
    new Chart(document.getElementById('chart-mecanicos'), {
      type: 'bar',
      data: { labels: mec.map(m => m.nombre), datasets: [{ label: 'Completados', data: mec.map(m => m.completados), backgroundColor: '#16a34a', borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f7' } }, x: { grid: { display: false } } }
      }
    });
  }
});
