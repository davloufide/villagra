document.addEventListener('DOMContentLoaded', async () => {
  const rol = iniciarLayout(['administrador']);
  if (!rol) return;

  const IVA = 0.13;
  let facturables = [];   // mantenimientos terminados sin factura
  let lineas = [];        // líneas en edición [{descripcion, cantidad, precio_unitario}]

  const money = n => '₡' + Number(n || 0).toLocaleString('es');

  // ── Cargar mantenimientos facturables ─────────────────────
  async function cargarFacturables() {
    try {
      facturables = await facturacion.facturables();
      const sel = document.getElementById('fac-mantenimiento');
      sel.innerHTML = '<option value="">-- Seleccionar --</option>';
      facturables.forEach(m => {
        const placa   = m.vehiculos?.placa ?? '-';
        const cliente = m.vehiculos?.clientes?.usuarios?.nombre ?? '-';
        sel.innerHTML += `<option value="${m.id_mantenimiento}">${placa} · ${cliente}</option>`;
      });
      document.getElementById('fac-vacio').style.display = facturables.length ? 'none' : 'block';
    } catch (e) {
      toast('Error cargando mantenimientos: ' + e.message, 'error');
    }
  }

  // ── Al elegir un mantenimiento, prellenar líneas con sus tareas ──
  document.getElementById('fac-mantenimiento').addEventListener('change', (e) => {
    const m = facturables.find(x => x.id_mantenimiento === parseInt(e.target.value));
    lineas = [];
    if (m) {
      const tareas = m.tareas ?? [];
      if (tareas.length) {
        tareas.forEach(t => lineas.push({
          descripcion: t.tipos_servicio?.nombre ?? t.descripcion ?? 'Servicio',
          cantidad: 1,
          precio_unitario: Number(t.tipos_servicio?.precio_base ?? 0)
        }));
      } else {
        lineas.push({ descripcion: 'Servicio general', cantidad: 1, precio_unitario: 0 });
      }
    }
    renderLineas();
    renderPreview(m);
  });

  // ── Edición de líneas ─────────────────────────────────────
  window.agregarLinea = () => { lineas.push({ descripcion: '', cantidad: 1, precio_unitario: 0 }); renderLineas(); renderPreview(mantActual()); };
  window.quitarLinea  = (i) => { lineas.splice(i, 1); renderLineas(); renderPreview(mantActual()); };
  window.editarLinea  = (i, campo, val) => {
    lineas[i][campo] = campo === 'descripcion' ? val : (parseFloat(val) || 0);
    renderPreview(mantActual());
  };

  function mantActual() {
    return facturables.find(x => x.id_mantenimiento === parseInt(document.getElementById('fac-mantenimiento').value));
  }

  function renderLineas() {
    const cont = document.getElementById('fac-lineas');
    if (!lineas.length) {
      cont.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;padding:8px;">Selecciona un mantenimiento o agrega líneas manualmente.</p>';
      return;
    }
    cont.innerHTML = lineas.map((l, i) => `
      <div class="form-grid" style="grid-template-columns:2.5fr 0.7fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;">
        <div class="field" style="margin:0;">
          ${i === 0 ? '<label>Descripción</label>' : ''}
          <input value="${(l.descripcion ?? '').replace(/"/g, '&quot;')}" oninput="editarLinea(${i},'descripcion',this.value)" placeholder="Descripción">
        </div>
        <div class="field" style="margin:0;">
          ${i === 0 ? '<label>Cant.</label>' : ''}
          <input type="number" min="1" value="${l.cantidad}" oninput="editarLinea(${i},'cantidad',this.value)">
        </div>
        <div class="field" style="margin:0;">
          ${i === 0 ? '<label>Precio unit.</label>' : ''}
          <input type="number" min="0" value="${l.precio_unitario}" oninput="editarLinea(${i},'precio_unitario',this.value)">
        </div>
        <button class="btn btn-outline btn-sm" onclick="quitarLinea(${i})" style="margin-bottom:1px;"><i class="fas fa-trash" style="color:#dc2626;"></i></button>
      </div>`).join('');
  }

  function calcular() {
    const subtotal = lineas.reduce((s, l) => s + (l.cantidad * l.precio_unitario), 0);
    const iva = Math.round(subtotal * IVA);
    return { subtotal, iva, total: subtotal + iva };
  }

  function renderPreview(m) {
    document.getElementById('pv-fecha').textContent    = new Date().toLocaleDateString('es-CR');
    document.getElementById('pv-cliente').textContent  = m?.vehiculos?.clientes?.usuarios?.nombre ?? '-';
    document.getElementById('pv-vehiculo').textContent = m
      ? `${m.vehiculos?.placa ?? ''} · ${m.vehiculos?.marcas?.nombre_marca ?? ''}` : '-';

    const tbody = document.getElementById('pv-lineas');
    tbody.innerHTML = lineas.length
      ? lineas.map(l => `
          <tr>
            <td>${l.descripcion || '<span style="color:#cbd5e1;">(sin descripción)</span>'}</td>
            <td style="text-align:center;">${l.cantidad}</td>
            <td style="text-align:right;font-weight:600;">${money(l.cantidad * l.precio_unitario)}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="color:#94a3b8;text-align:center;padding:14px;">Sin líneas</td></tr>';

    const { subtotal, iva, total } = calcular();
    document.getElementById('pv-subtotal').textContent = money(subtotal);
    document.getElementById('pv-iva').textContent      = money(iva);
    document.getElementById('pv-total').textContent    = money(total);
  }

  // ── Generar factura ───────────────────────────────────────
  document.getElementById('btn-generar-factura').addEventListener('click', async () => {
    const btn = document.getElementById('btn-generar-factura');
    const idMant = parseInt(document.getElementById('fac-mantenimiento').value);
    if (!idMant) { toast('Selecciona un mantenimiento', 'error'); return; }

    const lineasValidas = lineas.filter(l => l.descripcion.trim() && l.precio_unitario > 0);
    if (!lineasValidas.length) { toast('Agrega al menos una línea con descripción y precio', 'error'); return; }

    btnLoading(btn, true);
    try {
      await facturacion.crear({
        id_mantenimiento: idMant,
        metodo_pago: document.getElementById('fac-metodo').value,
        lineas: lineasValidas
      });
      toast('Factura generada correctamente');
      lineas = [];
      document.getElementById('fac-mantenimiento').value = '';
      renderLineas();
      renderPreview(null);
      await Promise.all([cargarFacturables(), cargarHistorial()]);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  // ── Historial + KPIs ──────────────────────────────────────
  async function cargarHistorial() {
    try {
      const lista = await facturacion.lista();

      // KPIs
      const ahora = new Date();
      const delMes = lista.filter(f => {
        const d = new Date(f.fecha_emision);
        return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
      });
      const totalMes = delMes.reduce((s, f) => s + Number(f.total), 0);
      const pendientes = lista.filter(f => f.estado === 'pendiente');
      const ticket = lista.length ? lista.reduce((s, f) => s + Number(f.total), 0) / lista.length : 0;

      document.getElementById('fac-mes').textContent       = money(totalMes);
      document.getElementById('fac-mes-count').textContent = `${delMes.length} factura(s)`;
      document.getElementById('fac-total').textContent     = lista.length;
      document.getElementById('fac-pendientes').textContent = pendientes.length;
      document.getElementById('fac-ticket').textContent    = money(Math.round(ticket));

      const tbody = document.getElementById('fac-historial');
      tbody.innerHTML = lista.length
        ? lista.map(f => {
            const cli = f.mantenimientos?.vehiculos?.clientes?.usuarios?.nombre ?? '-';
            const veh = f.mantenimientos?.vehiculos?.placa ?? '-';
            const pagar = f.estado === 'pendiente'
              ? `<button class="btn btn-success btn-sm" onclick="marcarPagada(${f.id_factura})"><i class="fas fa-check"></i> Cobrar</button>`
              : '';
            return `
              <tr>
                <td><strong>${f.numero_orden ?? '#' + f.id_factura}</strong></td>
                <td>${cli}</td>
                <td>${veh}</td>
                <td style="font-size:0.82rem;color:#64748b;">${new Date(f.fecha_emision).toLocaleDateString('es-CR')}</td>
                <td style="font-weight:700;">${money(f.total)}</td>
                <td>${tagEstado(f.estado)}</td>
                <td>
                  <div style="display:flex;gap:5px;">
                    <button class="btn btn-outline btn-sm" onclick="descargarPDF(${f.id_factura})"><i class="fas fa-file-pdf"></i> PDF</button>
                    ${pagar}
                  </div>
                </td>
              </tr>`;
          }).join('')
        : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;">Sin facturas emitidas</td></tr>';
    } catch (e) {
      toast('Error cargando historial: ' + e.message, 'error');
    }
  }

  window.descargarPDF = (id) => descargarFacturaPDF(id);

  window.marcarPagada = async (id) => {
    try {
      await facturacion.pagar(id, {});
      toast('Factura marcada como pagada');
      await cargarHistorial();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  renderLineas();
  await Promise.all([cargarFacturables(), cargarHistorial()]);
});
