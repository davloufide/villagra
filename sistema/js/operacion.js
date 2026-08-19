document.addEventListener('DOMContentLoaded', async () => {

  // Operación es solo para administrador (crear mantenimientos y asignar tareas)
  const rol = iniciarLayout(['administrador']);
  if (!rol) return;

  let mantSeleccionado = null;
  let empleadosCache   = [];
  let serviciosCache   = [];
  let mantsCache       = [];
  let tareasPanel      = [];   // tareas del mantenimiento abierto (en orden)
  let editTareaId      = null; // tarea en edición (OPE-008)

  function renderMant(lista) {
    const tbody = document.getElementById('op-tbody-activos');
    tbody.innerHTML = lista.length
      ? lista.map(m => {
          const fecha = m.fecha_ingreso ? new Date(m.fecha_ingreso).toLocaleDateString('es-CR') : '-';
          return `
            <tr>
              <td>
                <strong>${m.vehiculos?.placa ?? '-'}</strong><br>
                <small style="color:#94a3b8;">${m.vehiculos?.marcas?.nombre_marca ?? ''}</small>
              </td>
              <td>${m.vehiculos?.clientes?.usuarios?.nombre ?? '-'}</td>
              <td>${tagEstado(m.estado)}</td>
              <td>
                <div class="progress" style="width:80px;display:inline-block;">
                  <span style="width:${m.porcentaje_avance ?? 0}%"></span>
                </div>
                <small style="color:#94a3b8;"> ${m.porcentaje_avance ?? 0}%</small>
              </td>
              <td style="font-size:0.82rem;color:#64748b;">${fecha}</td>
              <td>
                <button class="btn btn-outline btn-sm" onclick="verDetalleMant(${m.id_mantenimiento})">
                  <i class="fas fa-eye"></i> Ver
                </button>
              </td>
            </tr>`;
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">No hay mantenimientos en esta vista</td></tr>';
  }

  const pagMant = crearPaginador('pag-mantenimientos', renderMant, 5);

  // ── Buscar y filtrar (OPE-014): cliente/placa + estado + rango de fechas ──
  window.aplicarFiltros = () => {
    const q     = (document.getElementById('op-buscar')?.value ?? '').trim().toLowerCase();
    const est   = document.getElementById('op-f-estado')?.value ?? 'todos';
    const desde = document.getElementById('op-f-desde')?.value ?? '';
    const hasta = document.getElementById('op-f-hasta')?.value ?? '';

    const lista = mantsCache.filter(m => {
      // Texto: cliente o placa
      if (q) {
        const cliente = (m.vehiculos?.clientes?.usuarios?.nombre ?? '').toLowerCase();
        const placa   = (m.vehiculos?.placa ?? '').toLowerCase();
        if (!cliente.includes(q) && !placa.includes(q)) return false;
      }
      // Estado
      if (est !== 'todos' && m.estado !== est) return false;
      // Rango de fechas (sobre fecha_ingreso, comparando YYYY-MM-DD)
      if (desde || hasta) {
        const f = m.fecha_ingreso ? String(m.fecha_ingreso).slice(0, 10) : '';
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
      }
      return true;
    });

    pagMant.set(lista);
    const cnt = document.getElementById('op-count');
    if (cnt) cnt.textContent = `${lista.length} de ${mantsCache.length} mantenimiento(s)`;
  };

  window.limpiarFiltros = () => {
    document.getElementById('op-buscar').value   = '';
    document.getElementById('op-f-estado').value = 'todos';
    document.getElementById('op-f-desde').value  = '';
    document.getElementById('op-f-hasta').value  = '';
    aplicarFiltros();
  };

  // ── Cargar lista principal ────────────────────────────────
  async function cargarMantenimientos() {
    try {
      mantsCache = await mantenimientos.lista();

      document.getElementById('op-en-proceso').textContent = mantsCache.filter(m => m.estado === 'en_progreso').length;
      document.getElementById('op-pendientes').textContent  = mantsCache.filter(m => m.estado === 'recibido').length;
      document.getElementById('op-completados').textContent = mantsCache.filter(m => m.estado === 'terminado').length;

      aplicarFiltros();
    } catch (e) {
      toast('Error cargando mantenimientos: ' + e.message, 'error');
    }
  }

  // ── Cargar selectores fijos (mecánicos, clientes, marcas) ──
  async function cargarSelectores() {
    try {
      const [emps, clientes, marcas] = await Promise.all([
        apiFetch('/empleados'),
        apiFetch('/clientes'),
        apiFetch('/vehiculos/marcas/lista')
      ]);
      empleadosCache = emps;

      const opt = (selId, val, txt) => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const o = document.createElement('option');
        o.value = val; o.textContent = txt;
        sel.appendChild(o);
      };

      emps.forEach(e => {
        opt('op-mecanico',       e.id_empleado, e.usuarios?.nombre);
        opt('op-tarea-mecanico', e.id_empleado, e.usuarios?.nombre);
      });
      clientes.forEach(c => opt('op-cliente', c.id_cliente, c.usuarios?.nombre ?? ('Cliente ' + c.id_cliente)));
      marcas.forEach(m => opt('op-marca', m.id_marca, m.nombre_marca));

      await cargarRepuestosSelect();
    } catch (e) { console.error('[Operacion selectores]', e); }
  }

  // Repuestos disponibles para asociar (IVO-008)
  async function cargarRepuestosSelect() {
    try {
      const productos = await inventario.lista();
      const sel = document.getElementById('op-rep-producto');
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Seleccionar repuesto --</option>' +
        productos.map(p => `<option value="${p.id_producto}">${p.nombre} (${p.codigo}) · stock: ${p.cantidad_stock}</option>`).join('');
    } catch (e) { console.error('[Operacion repuestos]', e); }
  }

  async function cargarRepuestosMant(idMant) {
    try {
      const movs = await inventario.movimientosDe(idMant);
      const salidas = (movs ?? []).filter(m => m.tipo === 'salida');
      document.getElementById('op-rep-lista').innerHTML = salidas.length
        ? salidas.map(m => `
            <tr>
              <td>${m.productos?.nombre ?? '-'} <small style="color:#94a3b8;">${m.productos?.codigo ?? ''}</small></td>
              <td>${m.cantidad}</td>
              <td style="font-size:0.82rem;color:#64748b;">${m.fecha ? new Date(m.fecha).toLocaleDateString('es-CR') : '-'}</td>
            </tr>`).join('')
        : '<tr><td colspan="3" style="text-align:center;color:#94a3b8;">Sin repuestos asociados</td></tr>';
    } catch (e) { console.error('[Repuestos mant]', e); }
  }

  // ── Catálogo de servicios (OPE-006) — construye todo lo que depende de servicios ──
  async function cargarCatalogo() {
    try {
      serviciosCache = await apiFetch('/tipos-servicio');

      // Checkboxes del form "Nuevo mantenimiento"
      const cont = document.getElementById('op-servicios');
      if (cont) {
        cont.innerHTML = serviciosCache.map(s => `
          <label style="display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:9px 12px;cursor:pointer;font-size:0.86rem;">
            <input type="checkbox" class="op-serv-check" value="${s.id_tipo_servicio}" style="width:16px;height:16px;cursor:pointer;">
            <span>${s.nombre}${s.precio_base ? ` <span style="color:#94a3b8;font-size:0.78rem;">₡${Number(s.precio_base).toLocaleString('es')}</span>` : ''}</span>
          </label>`).join('');
      }

      // Select de "Agregar tarea" en el panel de detalle
      const selT = document.getElementById('op-tarea-servicio');
      if (selT) {
        selT.innerHTML = '<option value="">-- Seleccionar servicio --</option>';
        serviciosCache.forEach(s => { selT.innerHTML += `<option value="${s.id_tipo_servicio}">${s.nombre}</option>`; });
      }

      // Tabla del catálogo (con editar / eliminar)
      pagCatalogo.set(serviciosCache);
    } catch (e) { console.error('[Operacion catalogo]', e); }
  }

  function renderCatalogo(lista) {
    const tb = document.getElementById('cat-tbody');
    if (!tb) return;
    tb.innerHTML = lista.length
      ? lista.map(s => `
          <tr>
            <td><strong>${s.nombre}</strong>${s.descripcion ? `<br><small style="color:#94a3b8;">${s.descripcion}</small>` : ''}</td>
            <td>₡${Number(s.precio_base ?? 0).toLocaleString('es')}</td>
            <td style="text-align:right;">
              <div style="display:inline-flex;gap:5px;">
                <button class="btn btn-outline btn-sm" onclick="editarServicio(${s.id_tipo_servicio})" title="Editar"><i class="fas fa-pen"></i></button>
                <button class="btn btn-outline btn-sm" onclick="eliminarServicio(${s.id_tipo_servicio}, '${(s.nombre || '').replace(/'/g, "\\'")}')" title="Eliminar"><i class="fas fa-trash" style="color:#dc2626;"></i></button>
              </div>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="text-align:center;color:#94a3b8;">Sin servicios</td></tr>';
  }

  const pagCatalogo = crearPaginador('pag-catalogo', renderCatalogo, 5);

  // Crear / editar servicio del catálogo (OPE-006)
  let editServicioId = null;

  // Abrir el modal en modo "crear" (limpio)
  window.nuevoServicio = () => { cancelarEdicionServicio(); abrirModal('modal-servicio'); };

  window.editarServicio = (id) => {
    const s = serviciosCache.find(x => x.id_tipo_servicio === id);
    if (!s) return;
    editServicioId = id;
    document.getElementById('cat-form-titulo').textContent = 'Editar servicio';
    document.getElementById('cat-nombre').value = s.nombre ?? '';
    document.getElementById('cat-precio').value = s.precio_base ?? '';
    document.getElementById('cat-desc').value   = s.descripcion ?? '';
    document.getElementById('btn-crear-servicio').innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar cambios';
    abrirModal('modal-servicio');
  };

  window.cancelarEdicionServicio = () => {
    editServicioId = null;
    document.getElementById('cat-form-titulo').textContent = 'Agregar servicio';
    document.getElementById('cat-nombre').value = '';
    document.getElementById('cat-precio').value = '';
    document.getElementById('cat-desc').value   = '';
    document.getElementById('btn-crear-servicio').innerHTML = '<i class="fas fa-plus"></i> Agregar al catálogo';
  };

  window.eliminarServicio = async (id, nombre) => {
    if (!(await confirmar({ titulo: 'Eliminar servicio', mensaje: `¿Eliminar el servicio "${nombre}" del catálogo?`, confirmar: 'Eliminar' }))) return;
    try {
      await servicios.eliminar(id);
      toast('Servicio eliminado');
      if (editServicioId === id) cancelarEdicionServicio();
      await cargarCatalogo();
    } catch (e) {
      toast(e.message, 'error');   // 409 si está en uso → muestra el mensaje del backend
    }
  };

  const btnCrearSvc = document.getElementById('btn-crear-servicio');
  if (btnCrearSvc) {
    btnCrearSvc.addEventListener('click', async () => {
      const nombre = document.getElementById('cat-nombre').value.trim();
      const precio = document.getElementById('cat-precio').value;
      const desc   = document.getElementById('cat-desc').value.trim();
      if (!nombre) { toast('Escribe el nombre del servicio', 'error'); return; }
      btnLoading(btnCrearSvc, true);
      let ok = false;
      try {
        if (editServicioId) {
          await servicios.actualizar(editServicioId, { nombre, precio_base: precio, descripcion: desc });
          toast('Servicio actualizado');
        } else {
          await servicios.crear({ nombre, precio_base: precio, descripcion: desc });
          toast('Servicio agregado al catálogo');
        }
        await cargarCatalogo();
        ok = true;
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnCrearSvc, false);
        if (ok) { cancelarEdicionServicio(); cerrarModal('modal-servicio'); }
      }
    });
  }

  // ── Ver detalle de un mantenimiento ──────────────────────
  window.verDetalleMant = async (id) => {
    mantSeleccionado = id;
    abrirModal('modal-op-panel');
    document.getElementById('op-tarea-titulo').textContent = 'Cargando...';
    document.getElementById('op-tareas-lista').innerHTML =
      '<p style="color:#94a3b8;padding:8px;font-size:0.88rem;">Cargando tareas...</p>';

    try {
      const det     = await mantenimientos.detalle(id);
      const placa   = det.vehiculos?.placa ?? '-';
      const marca   = det.vehiculos?.marcas?.nombre_marca ?? '';
      const cliente = det.vehiculos?.clientes?.usuarios?.nombre ?? '-';

      document.getElementById('op-tarea-titulo').textContent =
        `${placa}${marca ? ' · ' + marca : ''}`;
      document.getElementById('op-tarea-sub').textContent =
        `Cliente: ${cliente} · Estado: ${det.estado ?? '-'}`;

      // Prellenar campos de edición
      document.getElementById('op-edit-obs').value   = det.observaciones_cliente ?? '';
      document.getElementById('op-edit-fecha').value = det.fecha_estimada_entrega ?? '';

      const tareas  = det.tareas ?? [];
      tareasPanel = tareas;
      const listaEl = document.getElementById('op-tareas-lista');

      listaEl.innerHTML = tareas.length
        ? `<div class="table-wrap">
            <table>
              <thead>
                <tr><th style="width:70px;">Orden</th><th>Servicio</th><th>Mecánico</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                ${tareas.map((t, i) => `
                  <tr>
                    <td>
                      <button class="btn btn-outline btn-sm" onclick="moverTarea(${i},-1)" ${i === 0 ? 'disabled' : ''} title="Subir"><i class="fas fa-arrow-up"></i></button>
                      <button class="btn btn-outline btn-sm" onclick="moverTarea(${i},1)" ${i === tareas.length - 1 ? 'disabled' : ''} title="Bajar"><i class="fas fa-arrow-down"></i></button>
                    </td>
                    <td>${t.tipos_servicio?.nombre ?? t.descripcion ?? '-'}</td>
                    <td>${t.empleados?.usuarios?.nombre ?? '-'}</td>
                    <td>${tagEstado(t.estado)}</td>
                    <td>
                      <div style="display:flex;gap:5px;">
                        <button class="btn btn-outline btn-sm" onclick="editarTareaMant(${t.id_tarea})" title="Editar tarea"><i class="fas fa-pen"></i></button>
                        <button class="btn btn-outline btn-sm" onclick="eliminarTareaMant(${t.id_tarea})" title="Quitar tarea"><i class="fas fa-trash" style="color:#dc2626;"></i></button>
                      </div>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        : '<p style="color:#94a3b8;font-size:0.88rem;padding:8px;">Sin tareas asignadas todavía.</p>';

      // Repuestos asociados a este mantenimiento (IVO-008)
      document.getElementById('op-rep-cant').value = '';
      await cargarRepuestosMant(id);
    } catch (e) {
      toast('Error cargando detalle: ' + e.message, 'error');
    }
  };

  window.cerrarPanelTarea = () => {
    mantSeleccionado = null;
    cerrarModal('modal-op-panel');
  };

  // ── Asociar repuesto al mantenimiento y descontar stock (IVO-008/009) ──
  const btnOpRep = document.getElementById('btn-op-rep');
  if (btnOpRep) {
    btnOpRep.addEventListener('click', async () => {
      if (!mantSeleccionado) { toast('Abre un mantenimiento primero', 'error'); return; }
      const idProd = document.getElementById('op-rep-producto').value;
      const cant   = parseInt(document.getElementById('op-rep-cant').value);
      if (!idProd) { toast('Selecciona un repuesto', 'error'); return; }
      if (!cant || cant <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }

      btnLoading(btnOpRep, true);
      try {
        await inventario.movimiento({ id_producto: parseInt(idProd), id_mantenimiento: mantSeleccionado, tipo: 'salida', cantidad: cant });
        toast('Repuesto asociado y descontado del inventario');
        document.getElementById('op-rep-cant').value = '';
        await cargarRepuestosSelect();      // refresca stock en el selector
        await cargarRepuestosMant(mantSeleccionado);
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnOpRep, false);
      }
    });
  }

  // ── Editar info del mantenimiento (OPE-003) ───────────────
  const btnEditarMant = document.getElementById('btn-editar-mant');
  if (btnEditarMant) {
    btnEditarMant.addEventListener('click', async () => {
      if (!mantSeleccionado) return;
      btnLoading(btnEditarMant, true);
      try {
        await mantenimientos.editar(mantSeleccionado, {
          observaciones_cliente: document.getElementById('op-edit-obs').value.trim(),
          fecha_estimada_entrega: document.getElementById('op-edit-fecha').value || null
        });
        toast('Mantenimiento actualizado');
        await cargarMantenimientos();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnEditarMant, false);
      }
    });
  }

  // ── Eliminar tarea ────────────────────────────────────────
  window.eliminarTareaMant = async (idTarea) => {
    if (!(await confirmar({ titulo: 'Quitar tarea', mensaje: '¿Seguro que quieres quitar esta tarea del mantenimiento?', confirmar: 'Quitar' }))) return;
    try {
      await mantenimientos.eliminarTarea(idTarea);
      toast('Tarea eliminada');
      if (mantSeleccionado) verDetalleMant(mantSeleccionado);
      cargarMantenimientos();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ── Editar una tarea existente (OPE-008) — reusa el form de agregar ──
  window.editarTareaMant = (idTarea) => {
    const t = tareasPanel.find(x => x.id_tarea === idTarea);
    if (!t) return;
    editTareaId = idTarea;
    document.getElementById('op-tarea-mecanico').value = t.id_empleado ?? '';
    document.getElementById('op-tarea-servicio').value = t.id_tipo_servicio ?? '';
    document.getElementById('op-tarea-desc').value     = t.descripcion ?? '';
    document.getElementById('btn-agregar-tarea').innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar cambios';
    document.getElementById('op-form-tarea-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  function resetFormTarea() {
    editTareaId = null;
    document.getElementById('op-tarea-mecanico').value = '';
    document.getElementById('op-tarea-servicio').value = '';
    document.getElementById('op-tarea-desc').value     = '';
    document.getElementById('btn-agregar-tarea').innerHTML = '<i class="fas fa-plus"></i> Agregar tarea';
  }

  // ── Reordenar tareas (OPE-008) ────────────────────────────
  window.moverTarea = async (idx, dir) => {
    const nueva = idx + dir;
    if (nueva < 0 || nueva >= tareasPanel.length) return;
    const ids = tareasPanel.map(t => t.id_tarea);
    [ids[idx], ids[nueva]] = [ids[nueva], ids[idx]];
    try {
      await mantenimientos.reordenarTareas(mantSeleccionado, ids);
      verDetalleMant(mantSeleccionado);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ── Agregar / editar tarea ────────────────────────────────
  const btnAgregar = document.getElementById('btn-agregar-tarea');
  if (btnAgregar) {
    btnAgregar.addEventListener('click', async () => {
      if (!mantSeleccionado) { toast('Selecciona un mantenimiento primero', 'error'); return; }
      const id_emp = document.getElementById('op-tarea-mecanico').value;
      const id_svc = document.getElementById('op-tarea-servicio').value;
      const desc   = document.getElementById('op-tarea-desc').value.trim();

      if (!id_svc) { toast('Selecciona el tipo de servicio', 'error'); return; }

      btnLoading(btnAgregar, true);
      try {
        if (editTareaId) {
          // Editar tarea existente
          await mantenimientos.actualizarTarea(editTareaId, {
            id_tipo_servicio: parseInt(id_svc),
            descripcion: desc || null,
            ...(id_emp ? { id_empleado: parseInt(id_emp) } : {})
          });
          toast('Tarea actualizada');
        } else {
          // Agregar nueva (mecánico opcional: si falta se auto-asigna)
          await mantenimientos.agregarTarea(mantSeleccionado, {
            id_tipo_servicio: parseInt(id_svc),
            descripcion: desc || null,
            ...(id_emp ? { id_empleado: parseInt(id_emp) } : {})
          });
          toast('Tarea asignada correctamente');
        }
        resetFormTarea();
        verDetalleMant(mantSeleccionado);
        cargarMantenimientos();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnAgregar, false);
      }
    });
  }

  // ── Al elegir cliente, cargar SOLO sus vehículos (placas) en el select ──
  window.cargarVehiculosCliente = async (idCliente) => {
    const sel = document.getElementById('op-vehiculo');
    document.getElementById('op-nuevo-placa-wrap').style.display = 'none';
    document.getElementById('op-nuevo-marca-wrap').style.display = 'none';
    if (!idCliente) { sel.innerHTML = '<option value="">-- Primero elige el cliente --</option>'; return; }
    sel.innerHTML = '<option value="">Cargando...</option>';
    try {
      const vehs = await clientes.vehiculos(idCliente);
      const opts = vehs.map(v => `<option value="${v.id_vehiculo}">${v.placa}${v.marcas?.nombre_marca ? ' · ' + v.marcas.nombre_marca : ''}</option>`).join('');
      sel.innerHTML = '<option value="">-- Selecciona el vehículo --</option>' + opts +
        '<option value="__nuevo__">+ Registrar vehículo nuevo…</option>';
    } catch (e) {
      sel.innerHTML = '<option value="">-- Selecciona el vehículo --</option><option value="__nuevo__">+ Registrar vehículo nuevo…</option>';
    }
  };

  // Mostrar los campos de placa/marca solo si se va a registrar un vehículo nuevo
  window.onOpVehiculoChange = (val) => {
    const nuevo = val === '__nuevo__';
    document.getElementById('op-nuevo-placa-wrap').style.display = nuevo ? '' : 'none';
    document.getElementById('op-nuevo-marca-wrap').style.display = nuevo ? '' : 'none';
  };

  // ── Nuevo mantenimiento (admin) — la navegación la maneja mostrarVista (ui.js) ──
  const btnGuardar = document.getElementById('btn-guardar-mant');
  if (btnGuardar) {
    btnGuardar.addEventListener('click', async () => {
      const id_cliente = document.getElementById('op-cliente').value;
      const vehSel     = document.getElementById('op-vehiculo').value;   // id_vehiculo | '__nuevo__' | ''
      const id_emp     = document.getElementById('op-mecanico').value;
      const fecha      = document.getElementById('op-fecha').value;
      const obs        = document.getElementById('op-obs').value.trim();
      const servicios  = [...document.querySelectorAll('.op-serv-check:checked')].map(c => parseInt(c.value));

      if (!id_cliente) { toast('Selecciona el cliente', 'error'); return; }
      if (!vehSel)     { toast('Selecciona el vehículo del cliente', 'error'); return; }
      if (!servicios.length) { toast('Selecciona al menos una tarea', 'error'); return; }

      btnLoading(btnGuardar, true);
      try {
        // Vehículo: uno ya registrado del cliente, o registrar uno nuevo bajo su cuenta
        let id_vehiculo;
        if (vehSel === '__nuevo__') {
          const placa    = (document.getElementById('op-placa').value ?? '').trim().toUpperCase();
          const id_marca = document.getElementById('op-marca').value;
          if (!placa || !id_marca) {
            toast('Ingresa la placa y la marca del vehículo nuevo', 'error');
            btnLoading(btnGuardar, false);
            return;
          }
          const nuevo = await vehiculos.crear({ id_cliente: parseInt(id_cliente), placa, id_marca: parseInt(id_marca) });
          id_vehiculo = nuevo.id_vehiculo;
        } else {
          id_vehiculo = parseInt(vehSel);
        }

        // Crear el mantenimiento
        const mant = await mantenimientos.crear({
          id_vehiculo,
          fecha_estimada_entrega: fecha || null,
          observaciones_cliente: obs || null
        });

        // Una tarea por cada servicio (mecánico elegido o auto-asignado)
        for (const sid of servicios) {
          await mantenimientos.agregarTarea(mant.id_mantenimiento, {
            id_tipo_servicio: sid,
            ...(id_emp ? { id_empleado: parseInt(id_emp) } : {})
          });
        }

        toast(`Mantenimiento creado con ${servicios.length} tarea(s)`);
        document.getElementById('op-cliente').value  = '';
        document.getElementById('op-vehiculo').innerHTML = '<option value="">-- Primero elige el cliente --</option>';
        document.getElementById('op-placa').value    = '';
        document.getElementById('op-marca').value    = '';
        document.getElementById('op-nuevo-placa-wrap').style.display = 'none';
        document.getElementById('op-nuevo-marca-wrap').style.display = 'none';
        document.getElementById('op-mecanico').value = '';
        document.getElementById('op-obs').value      = '';
        document.getElementById('op-fecha').value    = '';
        document.querySelectorAll('.op-serv-check:checked').forEach(c => { c.checked = false; });
        cerrarModal('modal-nuevo-mant');
        await cargarMantenimientos();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnGuardar, false);
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // SOLICITUDES DE CITA (bolsa de pendientes) — el admin confirma/asigna
  // ══════════════════════════════════════════════════════
  window.cargarSolicitudes = async () => {
    const cont = document.getElementById('op-solicitudes-lista');
    if (!cont) return;
    try {
      const sols = await mantenimientos.solicitudes();
      const mecs = empleadosCache.filter(e => e.usuarios?.roles?.nombre === 'mecanico');
      const lista = mecs.length ? mecs : empleadosCache;
      const opts = lista.map(e => `<option value="${e.id_empleado}">${e.usuarios?.nombre ?? 'Empleado ' + e.id_empleado}</option>`).join('');

      cont.innerHTML = sols.length
        ? sols.map(m => {
            const servs = (m.tareas ?? []).map(t => t.tipos_servicio?.nombre).filter(Boolean).join(', ') || '—';
            const fecha = m.fecha_estimada_entrega
              ? new Date(m.fecha_estimada_entrega + 'T00:00:00').toLocaleDateString('es-CR') : 'sin fecha';
            return `
              <div class="list-item" style="flex-direction:column;align-items:stretch;gap:10px;">
                <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <div>
                    <strong>${m.vehiculos?.placa ?? '-'} · ${m.vehiculos?.marcas?.nombre_marca ?? ''}</strong>
                    <div style="color:#64748b;font-size:0.82rem;">${m.vehiculos?.clientes?.usuarios?.nombre ?? '-'} · ${fecha}</div>
                    <div style="color:#475569;font-size:0.82rem;margin-top:3px;">Servicios: ${servs}</div>
                    ${m.observaciones_cliente ? `<div style="color:#94a3b8;font-size:0.8rem;margin-top:2px;">"${m.observaciones_cliente}"</div>` : ''}
                  </div>
                  <span class="tag warning" style="align-self:flex-start;">Pendiente</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <select id="op-sol-mec-${m.id_mantenimiento}" style="border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:0.84rem;background:#f8fafc;">
                    <option value="">-- Asignar mecánico --</option>${opts}
                  </select>
                  <button class="btn btn-success btn-sm" onclick="confirmarSolicitud(${m.id_mantenimiento})"><i class="fas fa-check"></i> Confirmar</button>
                </div>
              </div>`;
          }).join('')
        : '<p style="color:#94a3b8;padding:12px;font-size:0.88rem;">No hay solicitudes pendientes.</p>';
    } catch (e) {
      const falta = /estado_cita|column|does not exist|solicitudes/i.test(e.message || '');
      cont.innerHTML = `<p style="color:#dc2626;padding:12px;font-size:0.86rem;">No se pudieron cargar las solicitudes.${falta ? ' ¿Ya corriste la migración <strong>migracion-citas.sql</strong> en Supabase?' : ' ' + e.message}</p>`;
    }
  };

  window.confirmarSolicitud = async (id) => {
    const sel = document.getElementById('op-sol-mec-' + id);
    const id_empleado = sel?.value;
    if (!id_empleado) { toast('Selecciona el mecánico a asignar', 'error'); return; }
    try {
      await mantenimientos.confirmar(id, { id_empleado: parseInt(id_empleado) });
      toast('Cita confirmada y asignada');
      await Promise.all([cargarSolicitudes(), cargarMantenimientos()]);
    } catch (e) { toast(e.message, 'error'); }
  };

  // ══════════════════════════════════════════════════════
  // DISPONIBILIDAD (calendario de días bloqueados)
  // ══════════════════════════════════════════════════════
  let calAdmin = null;

  async function initCalendarioAdmin() {
    let dias = [];
    try { dias = await diasBloqueados.lista(); } catch {}
    calAdmin = crearCalendario('op-cal', {
      editable: true,
      bloqueados: dias.map(d => d.fecha),
      onToggle: async (fecha, estaba) => {
        try {
          if (estaba) { await diasBloqueados.desbloquear(fecha); toast('Día habilitado'); }
          else        { await diasBloqueados.bloquear({ fecha }); toast('Día bloqueado para citas'); }
          await refrescarDisponibilidad();
        } catch (e) { toast(e.message, 'error'); }
      }
    });
    renderBloqueadosLista(dias);
  }

  async function refrescarDisponibilidad() {
    let dias = [];
    try { dias = await diasBloqueados.lista(); } catch {}
    if (calAdmin) calAdmin.setBloqueados(dias.map(d => d.fecha));
    renderBloqueadosLista(dias);
  }

  function renderBloqueadosLista(dias) {
    const cont = document.getElementById('op-bloqueados-lista');
    if (!cont) return;
    cont.innerHTML = dias.length
      ? dias.map(d => {
          const [y, m, dd] = d.fecha.split('-');
          return `
            <div class="list-item">
              <div><strong>${dd}/${m}/${y}</strong>${d.motivo ? `<div style="color:#64748b;font-size:0.8rem;">${d.motivo}</div>` : ''}</div>
              <button class="btn btn-outline btn-sm" onclick="desbloquearDia('${d.fecha}')"><i class="fas fa-xmark" style="color:#dc2626;"></i> Habilitar</button>
            </div>`;
        }).join('')
      : '<p style="color:#16a34a;padding:12px;font-size:0.88rem;"><i class="fas fa-check-circle"></i> Todos los días están disponibles.</p>';
  }

  window.desbloquearDia = async (fecha) => {
    try { await diasBloqueados.desbloquear(fecha); toast('Día habilitado'); await refrescarDisponibilidad(); }
    catch (e) { toast(e.message, 'error'); }
  };

  await Promise.all([cargarMantenimientos(), cargarSelectores(), cargarCatalogo()]);
  await Promise.all([cargarSolicitudes(), initCalendarioAdmin()]);
});
