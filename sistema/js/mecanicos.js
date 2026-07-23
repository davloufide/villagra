document.addEventListener('DOMContentLoaded', async () => {

  // Mecánicos: su taller (mecánico) + supervisión (admin)
  const rol = iniciarLayout(['administrador', 'mecanico']);
  if (!rol) return;

  let serviciosCache = [];
  let panelMantId = null;
  let repMantId   = null;   // mantenimiento activo en el modal de repuestos
  let misMants    = [];

  // ── Cargar lista de mantenimientos + KPIs ─────────────────
  async function cargarMisMantenimientos() {
    try {
      const lista = await mantenimientos.lista();
      misMants = lista;
      const activos = lista.filter(m => m.estado !== 'terminado');

      document.getElementById('mec-asignados').textContent  = activos.length;
      document.getElementById('mec-completados').textContent = lista.filter(m => m.estado === 'terminado').length;
      document.getElementById('mec-pendientes').textContent  = activos.filter(m => m.estado === 'recibido').length;

      const cont = document.getElementById('mec-lista');
      cont.innerHTML = lista.length
        ? lista.map(m => `
            <div class="list-item" style="flex-direction:column;align-items:stretch;gap:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <div>
                  <strong>${m.vehiculos?.placa ?? '-'} · ${m.vehiculos?.marcas?.nombre_marca ?? ''}</strong>
                  <div style="color:#64748b;font-size:0.82rem;margin-top:2px;">${m.vehiculos?.clientes?.usuarios?.nombre ?? '-'}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  ${tagEstado(m.estado)}
                  <button class="btn btn-outline btn-sm" onclick="abrirModalRepuestos(${m.id_mantenimiento})"><i class="fas fa-boxes-stacked"></i> Repuesto</button>
                  <button class="btn btn-outline btn-sm" onclick="gestionarMant(${m.id_mantenimiento})"><i class="fas fa-screwdriver-wrench"></i> Gestionar</button>
                </div>
              </div>
              <div class="progress"><span style="width:${m.porcentaje_avance ?? 0}%"></span></div>
              <small style="color:#94a3b8;">${m.porcentaje_avance ?? 0}% completado</small>
            </div>`).join('')
        : '<p style="color:#94a3b8;padding:12px;font-size:0.88rem;">Sin mantenimientos. Usa "Nuevo mantenimiento" para registrar uno.</p>';
    } catch (e) {
      toast('Error cargando mantenimientos: ' + e.message, 'error');
    }
  }

  // ── Cargar selectores (clientes, marcas, servicios) ───────
  async function cargarSelectores() {
    try {
      const [clientes, marcas, servicios] = await Promise.all([
        apiFetch('/clientes'), vehiculos.marcas(), apiFetch('/tipos-servicio')
      ]);
      serviciosCache = servicios;

      const selC = document.getElementById('mec-n-cliente');
      clientes.forEach(c => selC.innerHTML += `<option value="${c.id_cliente}">${c.usuarios?.nombre ?? 'Cliente ' + c.id_cliente}</option>`);
      const selM = document.getElementById('mec-n-marca');
      marcas.forEach(m => selM.innerHTML += `<option value="${m.id_marca}">${m.nombre_marca}</option>`);

      const contServ = document.getElementById('mec-n-servicios');
      contServ.innerHTML = servicios.map(s => `
        <label style="display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:9px 12px;cursor:pointer;font-size:0.86rem;">
          <input type="checkbox" class="mec-serv-check" value="${s.id_tipo_servicio}" style="width:16px;height:16px;cursor:pointer;">
          <span>${s.nombre}</span>
        </label>`).join('');

      const selAdd = document.getElementById('mec-p-add-servicio');
      servicios.forEach(s => selAdd.innerHTML += `<option value="${s.id_tipo_servicio}">${s.nombre}</option>`);

      // Repuestos disponibles (GM-006)
      const productos = await inventario.lista();
      const selR = document.getElementById('mec-p-repuesto');
      productos.forEach(p => selR.innerHTML += `<option value="${p.id_producto}">${p.nombre} (${p.codigo}) · stock: ${p.cantidad_stock}</option>`);
    } catch (e) { console.error('[Mecanicos selectores]', e); }
  }

  async function cargarRepuestos(idMant) {
    try {
      const movs = await inventario.movimientosDe(idMant);
      const salidas = movs.filter(m => m.tipo === 'salida');
      document.getElementById('mec-p-repuestos').innerHTML = salidas.length
        ? salidas.map(m => `
            <tr>
              <td>${m.productos?.nombre ?? '-'} <small style="color:#94a3b8;">${m.productos?.codigo ?? ''}</small></td>
              <td>${m.cantidad}</td>
              <td style="font-size:0.82rem;color:#64748b;">${m.fecha ? new Date(m.fecha).toLocaleDateString('es-CR') : '-'}</td>
            </tr>`).join('')
        : '<tr><td colspan="3" style="text-align:center;color:#94a3b8;">Sin repuestos solicitados</td></tr>';
    } catch (e) { console.error('[Repuestos]', e); }
  }

  // ══════════════════════════════════════════════════════
  // OPE-002: crear mantenimiento
  // ══════════════════════════════════════════════════════
  // La navegación entre "lista" y "nuevo" la maneja mostrarVista (ui.js).
  document.getElementById('btn-crear-mant-mec').addEventListener('click', async () => {
    const btn = document.getElementById('btn-crear-mant-mec');
    const id_cliente = document.getElementById('mec-n-cliente').value;
    const placa      = document.getElementById('mec-n-placa').value.trim().toUpperCase();
    const id_marca   = document.getElementById('mec-n-marca').value;
    const fecha      = document.getElementById('mec-n-fecha').value;
    const obs        = document.getElementById('mec-n-obs').value.trim();
    const servicios  = [...document.querySelectorAll('.mec-serv-check:checked')].map(c => parseInt(c.value));

    if (!id_cliente) { toast('Selecciona el cliente', 'error'); return; }
    if (!placa)      { toast('Ingresa la placa', 'error'); return; }
    if (!servicios.length) { toast('Selecciona al menos una tarea', 'error'); return; }

    btnLoading(btn, true);
    try {
      let id_vehiculo;
      try {
        const veh = await vehiculos.placa(placa);
        id_vehiculo = veh.id_vehiculo;
      } catch {
        if (!id_marca) { toast('Ese vehículo no existe. Selecciona la marca para crearlo.', 'error'); btnLoading(btn, false); return; }
        const nuevo = await vehiculos.crear({ id_cliente: parseInt(id_cliente), placa, id_marca: parseInt(id_marca) });
        id_vehiculo = nuevo.id_vehiculo;
      }
      const mant = await mantenimientos.crear({ id_vehiculo, fecha_estimada_entrega: fecha || null, observaciones_cliente: obs || null });
      for (const sid of servicios) {
        await mantenimientos.agregarTarea(mant.id_mantenimiento, { id_tipo_servicio: sid }); // backend asigna al mecánico
      }
      toast(`Mantenimiento creado con ${servicios.length} tarea(s)`);
      document.getElementById('mec-n-cliente').value = '';
      document.getElementById('mec-n-placa').value   = '';
      document.getElementById('mec-n-marca').value   = '';
      document.getElementById('mec-n-fecha').value   = '';
      document.getElementById('mec-n-obs').value     = '';
      document.querySelectorAll('.mec-serv-check:checked').forEach(c => { c.checked = false; });
      mostrarVista('lista');
      await cargarMisMantenimientos();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  // ══════════════════════════════════════════════════════
  // OPE-004: gestionar / editar mantenimiento
  // ══════════════════════════════════════════════════════
  window.gestionarMant = async (id) => {
    panelMantId = id;
    const panel = document.getElementById('mec-panel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('mec-p-titulo').textContent = 'Cargando...';
    document.getElementById('mec-p-tareas').innerHTML = '';
    try {
      const det = await mantenimientos.detalle(id);
      document.getElementById('mec-p-titulo').textContent =
        `${det.vehiculos?.placa ?? '-'}${det.vehiculos?.marcas?.nombre_marca ? ' · ' + det.vehiculos.marcas.nombre_marca : ''}`;
      document.getElementById('mec-p-sub').textContent =
        `Cliente: ${det.vehiculos?.clientes?.usuarios?.nombre ?? '-'} · Estado: ${det.estado ?? '-'}`;
      document.getElementById('mec-p-obs').value   = det.observaciones_cliente ?? '';
      document.getElementById('mec-p-fecha').value = det.fecha_estimada_entrega ?? '';

      const tareas = det.tareas ?? [];
      document.getElementById('mec-p-tareas').innerHTML = tareas.length
        ? tareas.map(t => {
            const completa = t.estado === 'completada';
            return `
              <tr>
                <td>${t.tipos_servicio?.nombre ?? t.descripcion ?? '-'}</td>
                <td style="font-size:0.84rem;">${t.empleados?.usuarios?.nombre ?? '-'}</td>
                <td>${tagEstado(t.estado)}</td>
                <td>
                  <div style="display:flex;gap:5px;">
                    ${completa ? '' : `<button class="btn btn-success btn-sm" onclick="completarTareaMec(${t.id_tarea})"><i class="fas fa-check"></i></button>`}
                    <button class="btn btn-outline btn-sm" onclick="eliminarTareaMec(${t.id_tarea})" title="Quitar"><i class="fas fa-trash" style="color:#dc2626;"></i></button>
                  </div>
                </td>
              </tr>`;
          }).join('')
        : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:14px;">Sin tareas. Agrega una abajo.</td></tr>';
    } catch (e) {
      toast('Error cargando el mantenimiento: ' + e.message, 'error');
    }
  };

  // ── Modal de repuestos (GM-006) ───────────────────────────
  window.abrirModalRepuestos = async (id) => {
    repMantId = id ?? panelMantId;
    if (!repMantId) { toast('Selecciona un mantenimiento primero', 'error'); return; }
    const m = misMants.find(x => x.id_mantenimiento === repMantId);
    document.getElementById('rep-modal-sub').textContent = m
      ? `${m.vehiculos?.placa ?? ''} · ${m.vehiculos?.clientes?.usuarios?.nombre ?? ''}`
      : document.getElementById('mec-p-titulo').textContent;
    document.getElementById('rep-modal').style.display = 'flex';
    await cargarRepuestos(repMantId);
  };
  window.cerrarModalRepuestos = () => { document.getElementById('rep-modal').style.display = 'none'; };
  document.getElementById('rep-modal').addEventListener('click', (e) => {
    if (e.target.id === 'rep-modal') cerrarModalRepuestos();
  });

  window.cerrarPanelMec = () => { panelMantId = null; document.getElementById('mec-panel').style.display = 'none'; };

  // Guardar info editada
  document.getElementById('btn-guardar-mant-mec').addEventListener('click', async () => {
    if (!panelMantId) return;
    const btn = document.getElementById('btn-guardar-mant-mec');
    btnLoading(btn, true);
    try {
      await mantenimientos.editar(panelMantId, {
        observaciones_cliente: document.getElementById('mec-p-obs').value.trim(),
        fecha_estimada_entrega: document.getElementById('mec-p-fecha').value || null
      });
      toast('Mantenimiento actualizado');
      await cargarMisMantenimientos();
    } catch (e) { toast(e.message, 'error'); }
    finally { btnLoading(btn, false); }
  });

  // Agregar tarea (se asigna al propio mecánico)
  document.getElementById('btn-agregar-tarea-mec').addEventListener('click', async () => {
    if (!panelMantId) return;
    const sid = document.getElementById('mec-p-add-servicio').value;
    if (!sid) { toast('Selecciona un servicio', 'error'); return; }
    const btn = document.getElementById('btn-agregar-tarea-mec');
    btnLoading(btn, true);
    try {
      await mantenimientos.agregarTarea(panelMantId, { id_tipo_servicio: parseInt(sid) });
      toast('Tarea agregada');
      document.getElementById('mec-p-add-servicio').value = '';
      await gestionarMant(panelMantId);
      cargarMisMantenimientos();
    } catch (e) { toast(e.message, 'error'); }
    finally { btnLoading(btn, false); }
  });

  window.completarTareaMec = async (idTarea) => {
    try {
      await mantenimientos.actualizarTarea(idTarea, { estado: 'completada' });
      toast('Tarea completada');
      if (panelMantId) await gestionarMant(panelMantId);
      cargarMisMantenimientos();
    } catch (e) { toast(e.message, 'error'); }
  };

  window.eliminarTareaMec = async (idTarea) => {
    if (!(await confirmar({ titulo: 'Quitar tarea', mensaje: '¿Seguro que quieres quitar esta tarea del mantenimiento?', confirmar: 'Quitar' }))) return;
    try {
      await mantenimientos.eliminarTarea(idTarea);
      toast('Tarea eliminada');
      if (panelMantId) await gestionarMant(panelMantId);
      cargarMisMantenimientos();
    } catch (e) { toast(e.message, 'error'); }
  };

  // Solicitar repuesto del inventario (GM-006)
  document.getElementById('btn-solicitar-repuesto').addEventListener('click', async () => {
    if (!repMantId) return;
    const idProd = document.getElementById('mec-p-repuesto').value;
    const cant   = parseInt(document.getElementById('mec-p-rep-cant').value);
    if (!idProd) { toast('Selecciona un repuesto', 'error'); return; }
    if (!cant || cant <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }
    const btn = document.getElementById('btn-solicitar-repuesto');
    btnLoading(btn, true);
    try {
      await inventario.movimiento({ id_producto: parseInt(idProd), id_mantenimiento: repMantId, tipo: 'salida', cantidad: cant });
      toast('Repuesto solicitado y descontado del inventario');
      document.getElementById('mec-p-rep-cant').value = '';
      // refrescar el stock mostrado en el selector
      const selR = document.getElementById('mec-p-repuesto');
      selR.innerHTML = '<option value="">-- Seleccionar repuesto --</option>';
      const productos = await inventario.lista();
      productos.forEach(p => selR.innerHTML += `<option value="${p.id_producto}">${p.nombre} (${p.codigo}) · stock: ${p.cantidad_stock}</option>`);
      await cargarRepuestos(repMantId);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  await Promise.all([cargarMisMantenimientos(), cargarSelectores()]);
});
