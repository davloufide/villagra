document.addEventListener('DOMContentLoaded', async () => {
  const rol = iniciarLayout(['administrador']);
  if (!rol) return;

  let todos = [];
  let editandoId = null;

  // ── Cargar vehículos ──────────────────────────────────────
  async function cargarVehiculos() {
    try {
      todos = await vehiculos.lista();
      document.getElementById('v-total').textContent = todos.length;
      document.getElementById('v-marcas').textContent =
        new Set(todos.map(v => v.marcas?.nombre_marca).filter(Boolean)).size;
      document.getElementById('v-clientes').textContent =
        new Set(todos.map(v => v.clientes?.id_cliente).filter(Boolean)).size;
      renderTabla(todos);
    } catch (e) {
      toast('Error cargando vehículos: ' + e.message, 'error');
    }
  }

  function renderTabla(lista) {
    const tbody = document.getElementById('v-tbody');
    tbody.innerHTML = lista.length
      ? lista.map(v => {
          const fecha = v.created_at ? new Date(v.created_at).toLocaleDateString('es-CR') : '-';
          return `
            <tr>
              <td><strong>${v.placa}</strong></td>
              <td>${v.marcas?.nombre_marca ?? '-'}</td>
              <td>${v.clientes?.usuarios?.nombre ?? '-'}</td>
              <td style="font-size:0.82rem;color:#64748b;">${fecha}</td>
              <td>
                <div style="display:flex;gap:5px;">
                  <button class="btn btn-outline btn-sm" onclick="verHistorialVeh(${v.id_vehiculo})"><i class="fas fa-eye"></i> Ver</button>
                  <button class="btn btn-outline btn-sm" onclick="editarVehiculoAdmin(${v.id_vehiculo})"><i class="fas fa-pen"></i></button>
                </div>
              </td>
            </tr>`;
        }).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Sin vehículos registrados</td></tr>';
  }

  window.filtrarVehiculos = (q) => {
    const l = q.toLowerCase();
    renderTabla(todos.filter(v =>
      (v.placa ?? '').toLowerCase().includes(l) ||
      (v.marcas?.nombre_marca ?? '').toLowerCase().includes(l) ||
      (v.clientes?.usuarios?.nombre ?? '').toLowerCase().includes(l)
    ));
  };

  // ── Historial de un vehículo ──────────────────────────────
  window.verHistorialVeh = async (id) => {
    const panel = document.getElementById('v-detalle');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('vd-titulo').textContent = 'Cargando...';
    document.getElementById('vd-historial').innerHTML = '';
    try {
      const v = await vehiculos.detalle(id);
      document.getElementById('vd-titulo').textContent = `${v.placa} · ${v.marcas?.nombre_marca ?? ''}`;
      document.getElementById('vd-sub').textContent    = 'Propietario: ' + (v.clientes?.usuarios?.nombre ?? '-');
      const h = v.historial ?? [];
      document.getElementById('vd-historial').innerHTML = h.length
        ? h.map(m => `
            <tr>
              <td>${new Date(m.fecha_ingreso).toLocaleDateString('es-CR')}</td>
              <td>${tagEstado(m.estado)}</td>
              <td>${m.porcentaje_avance ?? 0}%</td>
            </tr>`).join('')
        : '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:16px;">Sin servicios registrados</td></tr>';
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  };
  window.cerrarDetalleVeh = () => { document.getElementById('v-detalle').style.display = 'none'; };

  // ── Cargar clientes y marcas en selects ───────────────────
  async function cargarSelects() {
    try {
      const [clientes, marcas] = await Promise.all([apiFetch('/clientes'), vehiculos.marcas()]);
      const selC = document.getElementById('v-propietario');
      clientes.forEach(c => selC.innerHTML += `<option value="${c.id_cliente}">${c.usuarios?.nombre ?? 'Cliente ' + c.id_cliente}</option>`);
      const selM = document.getElementById('v-marca');
      marcas.forEach(m => selM.innerHTML += `<option value="${m.id_marca}">${m.nombre_marca}</option>`);
    } catch (e) {
      console.error('[Vehiculos selects]', e);
    }
  }

  // ── Navegación por submódulos (usa helper compartido de ui.js) ──
  // Ir al submódulo "Registrar" en modo nuevo (limpio)
  window.nuevoVehiculoVista = () => { ponerModoNuevo(); mostrarVista('registrar'); };

  function ponerModoNuevo() {
    editandoId = null;
    document.getElementById('v-form-titulo').textContent = 'Registrar vehículo';
    document.getElementById('v-placa').value = '';
    document.getElementById('v-obs').value   = '';
    document.getElementById('v-marca').value = '';
    document.getElementById('v-propietario').value = '';
    document.getElementById('v-propietario').disabled = false;
  }

  window.editarVehiculoAdmin = (id) => {
    const v = todos.find(x => x.id_vehiculo === id);
    if (!v) return;
    editandoId = id;
    document.getElementById('v-form-titulo').textContent = 'Editar vehículo';
    document.getElementById('v-placa').value = v.placa ?? '';
    document.getElementById('v-obs').value   = v.observaciones ?? '';
    // propietario no se cambia al editar
    const selC = document.getElementById('v-propietario');
    selC.value = v.clientes?.id_cliente ?? '';
    selC.disabled = true;
    // marca por nombre (la lista trae nombre, no id)
    const selM = document.getElementById('v-marca');
    const opt = [...selM.options].find(o => o.textContent === v.marcas?.nombre_marca);
    selM.value = opt ? opt.value : '';
    // Cambiar al submódulo Registrar/Editar (sin resetear los campos ya cargados)
    mostrarVista('registrar');
    document.getElementById('modulo-titulo').textContent = 'Editar vehículo';
  };

  document.getElementById('btn-guardar-vehiculo').addEventListener('click', async () => {
    const btn        = document.getElementById('btn-guardar-vehiculo');
    const placa      = document.getElementById('v-placa').value.trim().toUpperCase();
    const id_cliente = document.getElementById('v-propietario').value;
    const id_marca   = document.getElementById('v-marca').value;
    const obs        = document.getElementById('v-obs').value.trim();

    if (!placa || !id_marca) { toast('Completa placa y marca', 'error'); return; }
    if (!editandoId && !id_cliente) { toast('Selecciona el propietario', 'error'); return; }

    btnLoading(btn, true);
    try {
      if (editandoId) {
        await vehiculos.actualizar(editandoId, { placa, id_marca: parseInt(id_marca), observaciones: obs || null });
        toast('Vehículo actualizado');
      } else {
        await vehiculos.crear({ placa, id_cliente: parseInt(id_cliente), id_marca: parseInt(id_marca), observaciones: obs || null });
        toast('Vehículo registrado correctamente');
      }
      document.getElementById('v-propietario').disabled = false;
      mostrarVista('lista');
      await cargarVehiculos();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  await Promise.all([cargarVehiculos(), cargarSelects()]);
});
