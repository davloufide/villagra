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

    renderMant(lista);
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

      // Tabla del catálogo
      const tb = document.getElementById('cat-tbody');
      if (tb) {
        tb.innerHTML = serviciosCache.length
          ? serviciosCache.map(s => `<tr><td>${s.nombre}</td><td>₡${Number(s.precio_base ?? 0).toLocaleString('es')}</td></tr>`).join('')
          : '<tr><td colspan="2" style="text-align:center;color:#94a3b8;">Sin servicios</td></tr>';
      }
    } catch (e) { console.error('[Operacion catalogo]', e); }
  }

  // Crear servicio nuevo en el catálogo
  const btnCrearSvc = document.getElementById('btn-crear-servicio');
  if (btnCrearSvc) {
    btnCrearSvc.addEventListener('click', async () => {
      const nombre = document.getElementById('cat-nombre').value.trim();
      const precio = document.getElementById('cat-precio').value;
      const desc   = document.getElementById('cat-desc').value.trim();
      if (!nombre) { toast('Escribe el nombre del servicio', 'error'); return; }
      btnLoading(btnCrearSvc, true);
      try {
        await servicios.crear({ nombre, precio_base: precio, descripcion: desc });
        toast('Servicio agregado al catálogo');
        document.getElementById('cat-nombre').value = '';
        document.getElementById('cat-precio').value = '';
        document.getElementById('cat-desc').value   = '';
        await cargarCatalogo();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnCrearSvc, false);
      }
    });
  }

  // ── Ver detalle de un mantenimiento ──────────────────────
  window.verDetalleMant = async (id) => {
    mantSeleccionado = id;
    const panel = document.getElementById('op-panel-tarea');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    document.getElementById('op-panel-tarea').style.display = 'none';
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

  // ── Nuevo mantenimiento (admin) — la navegación la maneja mostrarVista (ui.js) ──
  const btnGuardar = document.getElementById('btn-guardar-mant');
  if (btnGuardar) {
    btnGuardar.addEventListener('click', async () => {
      const id_cliente = document.getElementById('op-cliente').value;
      const placa      = (document.getElementById('op-placa').value ?? '').trim().toUpperCase();
      const id_marca   = document.getElementById('op-marca').value;
      const id_emp     = document.getElementById('op-mecanico').value;
      const fecha      = document.getElementById('op-fecha').value;
      const obs        = document.getElementById('op-obs').value.trim();
      const servicios  = [...document.querySelectorAll('.op-serv-check:checked')].map(c => parseInt(c.value));

      if (!id_cliente) { toast('Selecciona el cliente', 'error'); return; }
      if (!placa)      { toast('Ingresa la placa del vehículo', 'error'); return; }
      if (!servicios.length) { toast('Selecciona al menos una tarea', 'error'); return; }

      btnLoading(btnGuardar, true);
      try {
        // 1. Resolver el vehículo por placa; si no existe, registrarlo bajo el cliente
        let id_vehiculo;
        try {
          const veh = await vehiculos.placa(placa);
          id_vehiculo = veh.id_vehiculo;
        } catch {
          if (!id_marca) {
            toast('Ese vehículo no está registrado. Selecciona la marca para crearlo.', 'error');
            btnLoading(btnGuardar, false);
            return;
          }
          const nuevo = await vehiculos.crear({ id_cliente: parseInt(id_cliente), placa, id_marca: parseInt(id_marca) });
          id_vehiculo = nuevo.id_vehiculo;
        }

        // 2. Crear el mantenimiento
        const mant = await mantenimientos.crear({
          id_vehiculo,
          fecha_estimada_entrega: fecha || null,
          observaciones_cliente: obs || null
        });

        // 3. Crear una tarea por cada servicio (mecánico elegido o auto-asignado)
        for (const sid of servicios) {
          await mantenimientos.agregarTarea(mant.id_mantenimiento, {
            id_tipo_servicio: sid,
            ...(id_emp ? { id_empleado: parseInt(id_emp) } : {})
          });
        }

        toast(`Mantenimiento creado con ${servicios.length} tarea(s)`);
        document.getElementById('op-cliente').value  = '';
        document.getElementById('op-placa').value    = '';
        document.getElementById('op-marca').value    = '';
        document.getElementById('op-mecanico').value = '';
        document.getElementById('op-obs').value      = '';
        document.getElementById('op-fecha').value    = '';
        document.querySelectorAll('.op-serv-check:checked').forEach(c => { c.checked = false; });
        mostrarVista('lista');
        await cargarMantenimientos();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnGuardar, false);
      }
    });
  }

  await Promise.all([cargarMantenimientos(), cargarSelectores(), cargarCatalogo()]);
});
