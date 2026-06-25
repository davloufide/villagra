document.addEventListener('DOMContentLoaded', async () => {
  // Solo admin ve el dashboard; mecánico y cliente van a su página
  const rol = iniciarLayout(['administrador']);
  if (!rol) return;

  // ── KPIs (resumen del mes) ────────────────────────────────
  try {
    const r = await reportes.resumen();
    document.getElementById('kpi-ingresos').textContent = '₡' + Number(r.ingresos_mes).toLocaleString('es');
    document.getElementById('kpi-mant').textContent     = r.mantenimientos_mes;
    document.getElementById('kpi-mant-sub').textContent = `${r.completados_mes} completados`;
    document.getElementById('kpi-stock').textContent    = r.stock_bajo;
  } catch (e) {
    console.error('[Dashboard resumen]', e);
  }

  // ── Servicios recientes + activos ─────────────────────────
  try {
    const lista = await mantenimientos.lista();
    const activos = lista.filter(m => m.estado !== 'terminado');
    document.getElementById('kpi-activos').textContent = activos.length;
    document.getElementById('kpi-activos-sub').textContent =
      `${lista.filter(m => m.estado === 'en_progreso').length} en proceso · ${lista.filter(m => m.estado === 'recibido').length} pendientes`;

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
});
