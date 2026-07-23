// La relación mantenimiento→factura es 1:1; PostgREST puede devolver
// `facturas` como objeto único, array o null. Esta función normaliza.
function facturaDe(m) {
  const f = m?.facturas;
  if (!f) return null;
  return Array.isArray(f) ? (f[0] ?? null) : f;
}

document.addEventListener('DOMContentLoaded', async () => {

  // Clientes: admin (ve a todos los clientes) y cliente (ve su propio vehículo).
  // El mecánico es redirigido a su taller por iniciarLayout.
  const rol = iniciarLayout(['administrador', 'cliente']);
  if (!rol) return;

  // Estado de "Mis vehículos" (vista cliente)
  let misVehiculos = [];
  let marcasCache  = [];
  let editandoVehId = null;

  if (rol === 'administrador') {
    iniciarVistaAdmin();
  } else {
    iniciarVistaCliente();
  }

  // ══════════════════════════════════════════════════════
  // VISTA ADMIN
  // ══════════════════════════════════════════════════════
  async function iniciarVistaAdmin() {
    // El admin no usa los submódulos del cliente
    document.querySelectorAll('.cliente-only').forEach(el => { el.style.display = 'none'; });
    document.getElementById('vista-admin').style.display = 'block';
    let todosClientes = [];

    try {
      todosClientes = await apiFetch('/clientes');
    } catch (e) {
      toast('Error cargando clientes: ' + e.message, 'error');
      console.error('[Clientes Admin]', e);
      return;
    }

    document.getElementById('adm-total-cli').textContent    = todosClientes.length;
    document.getElementById('adm-nuevos').textContent       = '-';
    document.getElementById('adm-con-vehiculo').textContent = '-';
    document.getElementById('adm-en-servicio').textContent  = '-';

    renderTablaClientes(todosClientes);

    window.filtrarClientes = (q) => {
      const lower = q.toLowerCase();
      renderTablaClientes(todosClientes.filter(c =>
        (c.usuarios?.nombre ?? '').toLowerCase().includes(lower) ||
        (c.usuarios?.correo ?? '').toLowerCase().includes(lower)
      ));
    };
  }

  function renderTablaClientes(lista) {
    const tbody = document.getElementById('cli-tbody');
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Sin clientes registrados</td></tr>';
      return;
    }
    tbody.innerHTML = lista.map(c => {
      const nombre = c.usuarios?.nombre ?? '-';
      const ini    = nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const fecha  = '-';
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:9px;">
              <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:#fff;flex-shrink:0;">${ini}</div>
              <strong style="font-size:0.88rem;">${nombre}</strong>
            </div>
          </td>
          <td style="font-size:0.86rem;">${c.usuarios?.correo ?? '-'}</td>
          <td style="font-size:0.86rem;">${c.telefono ?? '-'}</td>
          <td style="font-size:0.82rem;color:#64748b;">${fecha}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="verDetalleCliente(${c.id_cliente},'${nombre.replace(/'/g,"\\'")}','${(c.usuarios?.correo ?? '').replace(/'/g,"\\'")}')">
              <i class="fas fa-eye"></i> Ver detalle
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.verDetalleCliente = async (id, nombre, correo) => {
    const panel = document.getElementById('cli-detalle');
    document.getElementById('det-nombre').textContent = nombre;
    document.getElementById('det-correo').textContent = correo;
    document.getElementById('det-vehiculos').innerHTML      = '<p style="color:#94a3b8;font-size:0.85rem;padding:8px;">Cargando...</p>';
    document.getElementById('det-mantenimientos').innerHTML = '<tr><td colspan="3" style="color:#94a3b8;text-align:center;">Cargando...</td></tr>';
    panel.style.display = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const cli = await apiFetch(`/clientes/${id}`);

      // Vehículos
      const vehDiv = document.getElementById('det-vehiculos');
      vehDiv.innerHTML = cli.vehiculos?.length
        ? cli.vehiculos.map(v => `
            <div class="list-item">
              <div style="display:flex;align-items:center;gap:10px;">
                <i class="fas fa-car" style="color:#2563eb;font-size:1.1rem;"></i>
                <div>
                  <strong style="font-size:0.9rem;">${v.placa}</strong>
                  <div style="color:#64748b;font-size:0.8rem;">${v.marcas?.nombre_marca ?? '-'}</div>
                </div>
              </div>
              <span class="tag info">${v.mantenimientos?.length ?? 0} servicios</span>
            </div>
          `).join('')
        : '<p style="color:#94a3b8;font-size:0.85rem;padding:8px;">Sin vehículos registrados</p>';

      // Mantenimientos de todos sus vehículos
      const mants = (cli.vehiculos ?? []).flatMap(v =>
        (v.mantenimientos ?? []).map(m => ({ ...m, placa: v.placa }))
      ).sort((a, b) => new Date(b.fecha_ingreso) - new Date(a.fecha_ingreso));

      const tbody = document.getElementById('det-mantenimientos');
      tbody.innerHTML = mants.length
        ? mants.map(m => {
            const fac = facturaDe(m);
            return `
              <tr>
                <td style="font-size:0.84rem;">${new Date(m.fecha_ingreso).toLocaleDateString('es-CR')}<br>
                  <small style="color:#94a3b8;">${m.placa}</small></td>
                <td>${tagEstado(m.estado)}</td>
                <td style="font-size:0.84rem;">${fac
                  ? `₡${Number(fac.total).toLocaleString('es')} · ${tagEstado(fac.estado)}`
                  : '<span style="color:#94a3b8;">Sin factura</span>'}</td>
              </tr>
            `;
          }).join('')
        : '<tr><td colspan="3" style="color:#94a3b8;text-align:center;padding:16px;">Sin historial</td></tr>';

    } catch (e) {
      toast('Error cargando detalle: ' + e.message, 'error');
      console.error('[Clientes Admin Detail]', e);
    }
  };

  window.cerrarDetalle = () => {
    document.getElementById('cli-detalle').style.display = 'none';
  };


  // ══════════════════════════════════════════════════════
  // VISTA CLIENTE
  // ══════════════════════════════════════════════════════
  async function iniciarVistaCliente() {
    // Adaptar sidebar: ocultar items de admin
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.cliente-only').forEach(el => { el.style.display = ''; });
    document.querySelector('.menu-text-admin').style.display   = 'none';
    document.querySelector('.menu-text-cliente').style.display = '';

    document.getElementById('vista-cliente').style.display = 'block';
    mostrarVista('panel');   // submódulo por defecto del cliente
    await cargarDatosCliente();
    await cargarServiciosCita();

    // Listener del botón de cita (una sola vez)
    const btnCita = document.getElementById('btn-guardar-cita');
    btnCita.onclick = async () => {
      const placa       = document.getElementById('cita-placa').value.trim().toUpperCase();
      const idVehSelect = parseInt(document.getElementById('cita-vehiculo').value) || 0;
      const idMarca     = parseInt(document.getElementById('cita-marca').value) || 0;
      const serviciosSel = [...document.querySelectorAll('.cita-serv-check:checked')].map(c => parseInt(c.value));
      const fecha       = document.getElementById('cita-fecha').value;
      const obs         = document.getElementById('cita-obs').value.trim();

      if (!placa && !idVehSelect) { toast('Selecciona un vehículo o ingresa tu placa', 'error'); return; }
      if (!serviciosSel.length) { toast('Selecciona al menos un servicio', 'error'); return; }

      btnLoading(btnCita, true);
      try {
        let id_vehiculo = idVehSelect;

        if (placa) {
          try {
            // Intentar encontrar el vehículo por placa
            const veh = await apiFetch(`/vehiculos/placa/${encodeURIComponent(placa)}`);
            id_vehiculo = veh.id_vehiculo;
            // Ocultar sección de registro si estaba visible
            document.getElementById('registro-vehiculo-section').style.display = 'none';
          } catch {
            // Vehículo no encontrado — ¿ya se mostró la sección de registro?
            const secReg = document.getElementById('registro-vehiculo-section');
            if (secReg.style.display === 'none') {
              // Primera vez: mostrar sección de registro con marcas
              secReg.style.display = '';
              const selMarca = document.getElementById('cita-marca');
              if (selMarca.options.length <= 1) {
                const marcas = await apiFetch('/vehiculos/marcas/lista');
                selMarca.innerHTML = '<option value="">-- Seleccionar marca --</option>';
                marcas.forEach(m => selMarca.innerHTML += `<option value="${m.id_marca}">${m.nombre_marca}</option>`);
              }
              toast('Vehículo no encontrado. Selecciona la marca para registrarlo.', 'error');
              btnLoading(btnCita, false);
              return;
            }

            // Segunda vez: registrar el vehículo con la marca seleccionada
            if (!idMarca) {
              toast('Selecciona la marca del vehículo', 'error');
              btnLoading(btnCita, false);
              return;
            }
            const nuevoVeh = await apiFetch('/vehiculos', {
              method: 'POST',
              body: JSON.stringify({ placa, id_marca: idMarca })
            });
            id_vehiculo = nuevoVeh.id_vehiculo;
          }
        }

        if (!id_vehiculo) {
          toast('No se pudo determinar el vehículo', 'error');
          btnLoading(btnCita, false);
          return;
        }

        const resp = await apiFetch('/mantenimientos', {
          method: 'POST',
          body: JSON.stringify({ id_vehiculo, fecha_estimada_entrega: fecha || null, observaciones_cliente: obs, servicios: serviciosSel })
        });

        toast(resp?.aviso || `Cita agendada con ${serviciosSel.length} servicio(s). Asignada a un mecánico del taller.`);
        mostrarVista('panel');
        document.getElementById('registro-vehiculo-section').style.display = 'none';
        document.getElementById('cita-placa').value = '';
        document.getElementById('cita-marca').value = '';
        document.querySelectorAll('.cita-serv-check:checked').forEach(c => { c.checked = false; });
        document.getElementById('cita-obs').value   = '';
        document.getElementById('cita-fecha').value = '';
        await cargarDatosCliente();
      } catch (e) {
        toast(e.message, 'error');
        console.error('[Agendar Cita]', e);
      } finally {
        btnLoading(btnCita, false);
      }
    };
  }

  async function cargarServiciosCita() {
    const cont = document.getElementById('cita-servicios');
    if (!cont || cont.dataset.cargado) return;
    try {
      const servicios = await apiFetch('/tipos-servicio');
      cont.innerHTML = servicios.map(s => {
        const precio = s.precio_base ? ` · ₡${Number(s.precio_base).toLocaleString('es')}` : '';
        return `
          <label style="display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:9px 12px;cursor:pointer;font-size:0.86rem;">
            <input type="checkbox" class="cita-serv-check" value="${s.id_tipo_servicio}" style="width:16px;height:16px;cursor:pointer;">
            <span>${s.nombre}<span style="color:#94a3b8;font-size:0.78rem;">${precio}</span></span>
          </label>`;
      }).join('');
      cont.dataset.cargado = '1';
    } catch (e) {
      console.error('[Servicios cita]', e);
    }
  }

  async function cargarDatosCliente() {
    let perfil;
    try {
      perfil = await apiFetch('/clientes/mi-perfil');
    } catch (e) {
      toast('Error cargando tu perfil: ' + e.message, 'error');
      console.error('[Cliente Perfil]', e);
      return;
    }

    const vehiculos = perfil.vehiculos ?? [];
    misVehiculos = vehiculos;
    renderMisVehiculos();

    // Poblar select de vehículos
    const selVeh = document.getElementById('cita-vehiculo');
    selVeh.innerHTML = vehiculos.length
      ? vehiculos.map(v => `<option value="${v.id_vehiculo}">${v.placa} · ${v.marcas?.nombre_marca ?? ''}</option>`).join('')
      : '<option value="">Sin vehículos registrados</option>';

    // KPI vehículo
    const primerVeh = vehiculos[0];
    document.getElementById('cli-placa').textContent = primerVeh?.placa ?? 'Sin vehículo';
    document.getElementById('cli-marca').textContent = primerVeh?.marcas?.nombre_marca ?? '-';

    // Todos los mantenimientos ordenados
    const todosMants = vehiculos.flatMap(v =>
      (v.mantenimientos ?? []).map(m => ({ ...m, placa: v.placa, marca: v.marcas?.nombre_marca }))
    ).sort((a, b) => new Date(b.fecha_ingreso) - new Date(a.fecha_ingreso));

    // Servicio activo
    const activo = todosMants.find(m => m.estado === 'en_progreso' || m.estado === 'recibido');
    if (activo) {
      document.getElementById('cli-estado').textContent = activo.estado === 'en_progreso' ? 'En proceso' : 'Recibido';
      document.getElementById('cli-avance').textContent  = (activo.porcentaje_avance ?? 0) + '%';
      document.getElementById('cli-barra-prog').style.width = (activo.porcentaje_avance ?? 0) + '%';
      document.getElementById('cli-serv-fecha').textContent = 'Ingresó: ' + new Date(activo.fecha_ingreso).toLocaleDateString('es-CR');
      document.getElementById('cli-serv-tag').innerHTML = tagEstado(activo.estado);

      const tareas = activo.tareas ?? [];
      const comp   = tareas.filter(t => t.estado === 'completada').length;
      document.getElementById('cli-prog-label').textContent =
        tareas.length ? `${comp} de ${tareas.length} tareas completadas` : 'Sin tareas asignadas aún';

      document.getElementById('cli-tareas').innerHTML = tareas.length
        ? tareas.map(t => {
            const icon  = t.estado === 'completada' ? 'fa-check-circle' : t.estado === 'en_proceso' ? 'fa-circle-half-stroke' : 'fa-clock';
            const color = t.estado === 'completada' ? '#16a34a' : t.estado === 'en_proceso' ? '#f59e0b' : '#94a3b8';
            return `
              <tr>
                <td><i class="fas ${icon}" style="color:${color};margin-right:7px;"></i>${t.tipos_servicio?.nombre ?? t.descripcion ?? 'Servicio'}</td>
                <td style="font-size:0.84rem;">${t.empleados?.usuarios?.nombre ?? '-'}</td>
                <td>${tagEstado(t.estado)}</td>
              </tr>
            `;
          }).join('')
        : '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:16px;">Sin tareas asignadas aún</td></tr>';
    } else {
      document.getElementById('cli-estado').textContent        = 'Sin servicio activo';
      document.getElementById('cli-avance').textContent        = '-';
      document.getElementById('cli-serv-fecha').textContent    = 'No hay servicio en curso';
      document.getElementById('cli-serv-tag').innerHTML        = '';
      document.getElementById('cli-prog-label').textContent    = '';
      document.getElementById('cli-tareas').innerHTML          =
        '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:20px;">Sin servicio activo</td></tr>';
    }

    // Facturas
    const todasFacturas = todosMants
      .map(m => { const f = facturaDe(m); return f ? { ...f, _fecha: m.fecha_ingreso } : null; })
      .filter(Boolean)
      .sort((a, b) => new Date(b._fecha) - new Date(a._fecha));

    const ultimaFac = todasFacturas[0];
    document.getElementById('cli-factura-total').textContent = ultimaFac ? '₡' + Number(ultimaFac.total).toLocaleString('es') : '₡0';
    document.getElementById('cli-factura-estado').innerHTML  = ultimaFac ? tagEstado(ultimaFac.estado) : '-';

    // Lista completa de mantenimientos (activos e históricos) con su estado y tareas
    document.getElementById('cli-historial').innerHTML = todosMants.length
      ? todosMants.map(m => {
          const fac    = facturaDe(m);
          const tareas = m.tareas ?? [];
          const comp   = tareas.filter(t => t.estado === 'completada').length;
          const avance = m.porcentaje_avance ?? 0;
          const tareasHtml = tareas.length
            ? tareas.map(t => {
                const done = t.estado === 'completada';
                return `<div style="display:flex;align-items:center;gap:7px;font-size:0.82rem;color:${done ? '#16a34a' : '#64748b'};padding:2px 0;">
                  <i class="fas ${done ? 'fa-circle-check' : 'fa-clock'}"></i>
                  <span>${t.tipos_servicio?.nombre ?? t.descripcion ?? 'Servicio'}</span>
                </div>`;
              }).join('')
            : '<div style="font-size:0.8rem;color:#94a3b8;">Aún sin tareas asignadas</div>';
          return `
            <div style="border:1px solid #e2e8f0;border-radius:11px;padding:13px 15px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
                <div>
                  <strong style="font-size:0.9rem;">${m.placa} · ${m.marca ?? ''}</strong>
                  <div style="color:#94a3b8;font-size:0.78rem;">${new Date(m.fecha_ingreso).toLocaleDateString('es-CR')}${fac ? ' · ₡' + Number(fac.total).toLocaleString('es') : ''}</div>
                </div>
                ${tagEstado(m.estado)}
              </div>
              <div class="progress" style="margin-bottom:6px;"><span style="width:${avance}%"></span></div>
              <div style="font-size:0.78rem;color:#94a3b8;margin-bottom:8px;">${comp} de ${tareas.length} tareas completadas (${avance}%)</div>
              ${tareasHtml}
            </div>
          `;
        }).join('')
      : '<p style="color:#94a3b8;padding:12px;font-size:0.88rem;">Aún no tienes mantenimientos registrados</p>';

    // Tabla facturas
    document.getElementById('cli-facturas-tbody').innerHTML = todasFacturas.length
      ? todasFacturas.map(f => `
          <tr>
            <td style="font-size:0.84rem;">${f._fecha ? new Date(f._fecha).toLocaleDateString('es-CR') : '-'}</td>
            <td style="font-weight:700;">₡${Number(f.total).toLocaleString('es')}</td>
            <td>${tagEstado(f.estado)}</td>
            <td><button class="btn btn-outline btn-sm" onclick="descargarFacturaPDF(${f.id_factura})"><i class="fas fa-file-pdf"></i> PDF</button></td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px;">Sin facturas</td></tr>';
  }

  // Toggle formulario de cita
  // "Nueva cita" es ahora un submódulo (mostrarVista('cita') en ui.js).

  // ══════════════════════════════════════════════════════
  // MIS VEHÍCULOS (registrar / editar — solo los propios)
  // ══════════════════════════════════════════════════════
  function renderMisVehiculos() {
    const cont = document.getElementById('veh-lista');
    if (!cont) return;
    cont.innerHTML = misVehiculos.length
      ? misVehiculos.map(v => `
          <div class="list-item">
            <div style="display:flex;align-items:center;gap:11px;">
              <i class="fas fa-car" style="color:#2563eb;font-size:1.15rem;"></i>
              <div>
                <strong style="font-size:0.92rem;">${v.placa}</strong>
                <div style="color:#64748b;font-size:0.8rem;">${v.marcas?.nombre_marca ?? '-'}${v.observaciones ? ' · ' + v.observaciones : ''}</div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="editarVehiculo(${v.id_vehiculo})"><i class="fas fa-pen"></i> Editar</button>
          </div>`).join('')
      : '<p style="color:#94a3b8;padding:12px;font-size:0.88rem;">Aún no tienes vehículos registrados. Usa "Registrar vehículo".</p>';
  }

  async function cargarMarcasVehiculo() {
    const sel = document.getElementById('veh-f-marca');
    if (!sel || sel.options.length > 1) return;
    try {
      marcasCache = await vehiculos.marcas();
      marcasCache.forEach(m => sel.innerHTML += `<option value="${m.id_marca}">${m.nombre_marca}</option>`);
    } catch (e) { console.error('[Marcas vehiculo]', e); }
  }

  window.abrirFormVehiculo = async () => {
    editandoVehId = null;
    document.getElementById('veh-form-titulo').textContent = 'Registrar vehículo';
    document.getElementById('veh-f-placa').value = '';
    document.getElementById('veh-f-marca').value = '';
    document.getElementById('veh-f-obs').value   = '';
    await cargarMarcasVehiculo();
    document.getElementById('veh-form').style.display = 'block';
  };

  window.editarVehiculo = async (id) => {
    const v = misVehiculos.find(x => x.id_vehiculo === id);
    if (!v) return;
    await cargarMarcasVehiculo();
    editandoVehId = id;
    document.getElementById('veh-form-titulo').textContent = 'Editar vehículo';
    document.getElementById('veh-f-placa').value = v.placa ?? '';
    // marca: buscar por nombre en marcasCache (mi-perfil trae nombre, no id)
    const marca = marcasCache.find(m => m.nombre_marca === v.marcas?.nombre_marca);
    document.getElementById('veh-f-marca').value = marca ? marca.id_marca : '';
    document.getElementById('veh-f-obs').value   = v.observaciones ?? '';
    document.getElementById('veh-form').style.display = 'block';
    document.getElementById('veh-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.cerrarFormVehiculo = () => {
    document.getElementById('veh-form').style.display = 'none';
    editandoVehId = null;
  };

  document.getElementById('btn-guardar-vehiculo').addEventListener('click', async () => {
    const btn   = document.getElementById('btn-guardar-vehiculo');
    const placa = document.getElementById('veh-f-placa').value.trim().toUpperCase();
    const id_marca = document.getElementById('veh-f-marca').value;
    const obs   = document.getElementById('veh-f-obs').value.trim();

    if (!placa || !id_marca) { toast('Placa y marca son requeridas', 'error'); return; }

    btnLoading(btn, true);
    try {
      if (editandoVehId) {
        await vehiculos.actualizar(editandoVehId, { placa, id_marca, observaciones: obs });
        toast('Vehículo actualizado');
      } else {
        await vehiculos.crear({ placa, id_marca, observaciones: obs });
        toast('Vehículo registrado');
      }
      cerrarFormVehiculo();
      await cargarDatosCliente();  // recarga perfil + vehículos + citas
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

});
