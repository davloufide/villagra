document.addEventListener('DOMContentLoaded', async () => {
  const rol = iniciarLayout(['administrador']);
  if (!rol) return;

  let empleadosCache = [];

  function renderEmpleados(lista) {
    const tbody = document.getElementById('adm-tbody');
    if (!tbody) return;
    tbody.innerHTML = lista.map(e => {
      const ini = (e.usuarios?.nombre ?? '').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const colors = ['#2563eb,#7c3aed','#16a34a,#4ade80','#f59e0b,#fbbf24','#64748b,#94a3b8'];
      const col = colors[e.id_empleado % colors.length];
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:9px;">
              <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,${col});display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;flex-shrink:0;">${ini}</div>
              <div><strong style="font-size:0.88rem;">${e.usuarios?.nombre}</strong><br>
                <small style="color:#94a3b8;">${e.especialidad ?? '-'}</small></div>
            </div>
          </td>
          <td><span class="tag ${e.usuarios?.roles?.nombre === 'administrador' ? 'info' : 'purple'}">${e.usuarios?.roles?.nombre ?? '-'}</span></td>
          <td><span class="tag ${e.usuarios?.activo ? 'success' : 'danger'}">${e.usuarios?.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td>${e.dias_vacaciones} días</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Sin empleados</td></tr>';
  }

  const pagEmpleados = crearPaginador('pag-empleados', renderEmpleados, 5);

  async function cargarEmpleados() {
    try {
      const lista = await empleados.lista();
      empleadosCache = lista;
      pagEmpleados.set(lista);

      document.getElementById('adm-total').textContent  = lista.length;
      document.getElementById('adm-activos').textContent = lista.filter(e => e.usuarios?.activo).length;
    } catch (e) {
      toast('Error cargando empleados', 'error');
    }
  }

  async function cargarVacaciones() {
    try {
      const lista = await empleados.vacaciones();
      const cont  = document.getElementById('adm-vac-list');
      if (!cont) return;
      cont.innerHTML = lista.map(v => `
        <div class="list-item">
          <div>
            <strong style="font-size:0.9rem;">${v.empleados?.usuarios?.nombre}</strong>
            <div style="color:#64748b;font-size:0.8rem;">${v.fecha_inicio} al ${v.fecha_fin} · ${v.dias_habiles} días hábiles</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-success btn-sm" onclick="responderVac(${v.id_vacacion},'aprobada')"><i class="fas fa-check"></i></button>
            <button class="btn btn-danger btn-sm" onclick="responderVac(${v.id_vacacion},'rechazada')"><i class="fas fa-xmark"></i></button>
          </div>
        </div>
      `).join('') || '<p style="color:#94a3b8;padding:12px;">Sin solicitudes pendientes</p>';

      const kpi = document.getElementById('adm-vac-pendientes');
      if (kpi) kpi.textContent = lista.length;
    } catch (e) {
      const cont = document.getElementById('adm-vac-list');
      if (cont) cont.innerHTML = `<p style="color:#dc2626;padding:12px;font-size:0.86rem;">No se pudieron cargar las solicitudes. ${e.message}</p>`;
    }
  }

  window.responderVac = async (id, estado) => {
    try {
      await empleados.responderVac(id, { estado });
      toast(estado === 'aprobada' ? 'Vacaciones aprobadas' : 'Vacaciones rechazadas', estado === 'aprobada' ? 'success' : 'error');
      cargarVacaciones();
      cargarHistorialVac();
      cargarEmpleados();   // el saldo del empleado cambia al aprobar
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ── Historial de vacaciones (#6) ─────────────────────────
  let historialVacCache = [];
  let filtroVac = 'todas';

  window.cargarHistorialVac = async () => {
    const tbody = document.getElementById('adm-vac-historial');
    if (!tbody) return;
    try {
      historialVacCache = await empleados.historialVac();
      renderHistorialVac();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#dc2626;padding:20px;">No se pudo cargar el historial. ${e.message}</td></tr>`;
    }
  };

  window.filtrarHistorialVac = (f, btn) => {
    filtroVac = f;
    document.querySelectorAll('#adm-vac-filtros .vacf').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderHistorialVac();
  };

  function renderHistorialVac() {
    const tbody = document.getElementById('adm-vac-historial');
    if (!tbody) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const esProxima    = v => v.estado === 'aprobada' && v.fecha_inicio > hoy;
    const esDisfrutada = v => v.estado === 'aprobada' && v.fecha_fin < hoy;

    let lista = historialVacCache;
    if (filtroVac === 'proximas')         lista = lista.filter(esProxima);
    else if (filtroVac === 'disfrutadas') lista = lista.filter(esDisfrutada);
    else if (filtroVac !== 'todas')       lista = lista.filter(v => v.estado === filtroVac);

    tbody.innerHTML = lista.length ? lista.map(v => {
      let cls, label;
      if (v.estado === 'pendiente')      { cls = 'warning'; label = 'Solicitada'; }
      else if (v.estado === 'rechazada') { cls = 'danger';  label = 'Rechazada'; }
      else if (esProxima(v))             { cls = 'info';    label = 'Aprobada · Próxima'; }
      else if (esDisfrutada(v))          { cls = 'neutral'; label = 'Aprobada · Disfrutada'; }
      else                               { cls = 'success'; label = 'Aprobada · En curso'; }
      return `
        <tr>
          <td><strong style="font-size:0.88rem;">${v.empleados?.usuarios?.nombre ?? '-'}</strong></td>
          <td style="font-size:0.85rem;">${v.fecha_inicio}</td>
          <td style="font-size:0.85rem;">${v.fecha_fin}</td>
          <td style="text-align:center;">${v.dias_habiles}</td>
          <td><span class="tag ${cls}">${label}</span></td>
        </tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Sin registros en esta categoría</td></tr>';
  }

  const btnGuardar = document.getElementById('btn-guardar-empleado');
  if (btnGuardar) {
    btnGuardar.addEventListener('click', async () => {
      const nombre      = document.getElementById('adm-nombre').value.trim();
      const correo      = document.getElementById('adm-correo').value.trim();
      const telefono    = document.getElementById('adm-telefono').value.trim();
      const id_rol      = document.getElementById('adm-rol').value;
      const tipo_empleo = document.getElementById('adm-tipo').value;
      const fecha       = document.getElementById('adm-fecha').value;
      const esp         = document.getElementById('adm-especialidad').value;
      const password    = 'Villagra1!';

      if (!nombre || !correo || !id_rol) { toast('Nombre, correo y rol son requeridos', 'error'); return; }

      btnLoading(btnGuardar, true);
      try {
        // Los días de vacaciones los calcula el backend según la fecha de ingreso
        await empleados.crear({ nombre, correo, password, id_rol: parseInt(id_rol), telefono, tipo_empleo, fecha_ingreso: fecha || null, especialidad: esp });
        toast(`Empleado creado. Contraseña temporal: Villagra1!`);
        ['adm-nombre','adm-correo','adm-telefono','adm-fecha'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        cerrarModal('modal-empleado');
        cargarEmpleados();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnGuardar, false);
      }
    });
  }

  // ── Registrar cliente manualmente ────────────────────────
  const btnCli = document.getElementById('btn-registrar-cliente');
  if (btnCli) {
    btnCli.addEventListener('click', async () => {
      const nombre   = document.getElementById('ncli-nombre').value.trim();
      const correo   = document.getElementById('ncli-correo').value.trim();
      const telefono = document.getElementById('ncli-telefono').value.trim();
      const password = document.getElementById('ncli-password').value.trim() || 'Cliente123!';

      if (!nombre || !correo) { toast('Nombre y correo son requeridos', 'error'); return; }

      btnLoading(btnCli, true);
      try {
        await clientes.crear({ nombre, correo, telefono, password });
        toast(`Cliente registrado. Contraseña: ${password}`);
        ['ncli-nombre', 'ncli-correo', 'ncli-telefono', 'ncli-password'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        cerrarModal('modal-cliente');
        await cargarUsuarios();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btnLoading(btnCli, false);
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // CRUD DE USUARIOS
  // ══════════════════════════════════════════════════════
  let usuariosCache = [];
  let editandoId = null;
  const ROL_NOMBRE = { 1: 'Administrador', 2: 'Mecánico', 3: 'Cliente' };
  const ROL_TAG    = { 1: 'info', 2: 'purple', 3: 'success' };

  function renderUsuarios(lista) {
    const tbody = document.getElementById('usr-tbody');
    tbody.innerHTML = lista.length
      ? lista.map(u => `
          <tr>
            <td><strong style="font-size:0.88rem;">${u.nombre}</strong></td>
            <td style="font-size:0.85rem;">${u.correo}</td>
            <td><span class="tag ${ROL_TAG[u.id_rol] ?? 'neutral'}">${ROL_NOMBRE[u.id_rol] ?? u.roles?.nombre ?? '-'}</span></td>
            <td><span class="tag ${u.activo ? 'success' : 'danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>
              <div style="display:flex;gap:5px;">
                <button class="btn btn-outline btn-sm" onclick="editarUsuario(${u.id_usuario})"><i class="fas fa-pen"></i></button>
                <button class="btn ${u.activo ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleActivoUsuario(${u.id_usuario}, ${!u.activo})">
                  <i class="fas fa-${u.activo ? 'ban' : 'check'}"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="eliminarUsuario(${u.id_usuario})"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Sin usuarios</td></tr>';
  }

  const pagUsuarios = crearPaginador('pag-usuarios', renderUsuarios, 5);

  async function cargarUsuarios() {
    try {
      usuariosCache = await usuarios.lista();
      pagUsuarios.set(usuariosCache);
    } catch (e) {
      toast('Error cargando usuarios: ' + e.message, 'error');
    }
  }

  window.filtrarUsuarios = (q) => {
    const l = q.toLowerCase();
    pagUsuarios.set(usuariosCache.filter(u =>
      (u.nombre ?? '').toLowerCase().includes(l) || (u.correo ?? '').toLowerCase().includes(l)
    ));
  };

  window.abrirEdicionUsuario = () => {
    editandoId = null;
    document.getElementById('usr-form-titulo').textContent = 'Nuevo usuario';
    document.getElementById('usr-nombre').value   = '';
    document.getElementById('usr-correo').value   = '';
    document.getElementById('usr-rol').value      = '3';
    document.getElementById('usr-activo').value   = 'true';
    document.getElementById('usr-password').value = '';
    document.getElementById('usr-pass-label').innerHTML = 'Contraseña <span style="color:#dc2626;">*</span>';
    abrirModal('modal-usuario');
  };

  window.editarUsuario = (id) => {
    const u = usuariosCache.find(x => x.id_usuario === id);
    if (!u) return;
    editandoId = id;
    document.getElementById('usr-form-titulo').textContent = 'Editar usuario';
    document.getElementById('usr-nombre').value   = u.nombre ?? '';
    document.getElementById('usr-correo').value   = u.correo ?? '';
    document.getElementById('usr-rol').value      = String(u.id_rol);
    document.getElementById('usr-activo').value   = String(u.activo);
    document.getElementById('usr-password').value = '';
    document.getElementById('usr-pass-label').innerHTML = 'Nueva contraseña <span style="color:#94a3b8;font-weight:400;">(dejar vacío para no cambiar)</span>';
    abrirModal('modal-usuario');
  };

  window.cerrarEdicionUsuario = () => {
    cerrarModal('modal-usuario');
    editandoId = null;
  };

  document.getElementById('btn-guardar-usuario').addEventListener('click', async () => {
    const btn      = document.getElementById('btn-guardar-usuario');
    const nombre   = document.getElementById('usr-nombre').value.trim();
    const correo   = document.getElementById('usr-correo').value.trim();
    const id_rol   = document.getElementById('usr-rol').value;
    const activo   = document.getElementById('usr-activo').value === 'true';
    const password = document.getElementById('usr-password').value;

    if (!nombre || !correo) { toast('Nombre y correo son requeridos', 'error'); return; }

    btnLoading(btn, true);
    try {
      if (editandoId) {
        const body = { nombre, correo, id_rol, activo };
        if (password) body.password = password;
        await usuarios.actualizar(editandoId, body);
        toast('Usuario actualizado');
      } else {
        if (!password) { toast('La contraseña es requerida', 'error'); btnLoading(btn, false); return; }
        await usuarios.crear({ nombre, correo, password, id_rol });
        toast('Usuario creado');
      }
      cerrarEdicionUsuario();
      await Promise.all([cargarUsuarios(), cargarEmpleados()]);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  window.toggleActivoUsuario = async (id, activar) => {
    try {
      await usuarios.actualizar(id, { activo: activar });
      toast(activar ? 'Usuario activado' : 'Usuario desactivado');
      await cargarUsuarios();
    } catch (e) { toast(e.message, 'error'); }
  };

  window.eliminarUsuario = async (id) => {
    const u = usuariosCache.find(x => x.id_usuario === id);
    if (!(await confirmar({ titulo: 'Eliminar usuario', mensaje: `¿Eliminar a "${u?.nombre ?? 'este usuario'}"? Esta acción no se puede deshacer.`, confirmar: 'Eliminar' }))) return;
    try {
      await usuarios.eliminar(id);
      toast('Usuario eliminado');
      await Promise.all([cargarUsuarios(), cargarEmpleados()]);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  await Promise.all([cargarEmpleados(), cargarVacaciones(), cargarHistorialVac(), cargarUsuarios()]);
});
