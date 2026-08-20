// ── Agendar cita SIN cuenta (página pública) ─────────────────
// Usa los endpoints /api/publico/* (sin token). El backend crea o
// reusa un cliente "invitado" con nombre + teléfono (+ correo opcional)
// y deja la cita como solicitud pendiente de confirmar por el taller.
document.addEventListener('DOMContentLoaded', () => {
  let cal = null;
  let serviciosCache = [];

  const $ = (id) => document.getElementById(id);

  function mostrarError(msg) {
    const el = $('cp-error');
    el.textContent = msg;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const limpiarError = () => { $('cp-error').style.display = 'none'; };

  // ── Carga inicial ──────────────────────────────────────────
  (async function init() {
    // Marcas
    try {
      const marcas = await publico.marcas();
      $('cp-marca').innerHTML = '<option value="">-- Seleccioná la marca --</option>' +
        marcas.map(m => `<option value="${m.id_marca}">${m.nombre_marca}</option>`).join('');
    } catch {
      $('cp-marca').innerHTML = '<option value="">No se pudieron cargar las marcas</option>';
    }

    // Servicios
    try {
      serviciosCache = await publico.servicios();
      const cont = $('cp-servicios');
      cont.innerHTML = serviciosCache.length
        ? serviciosCache.map(s => `
            <label class="serv-opt">
              <input type="checkbox" class="cp-serv" value="${s.id_tipo_servicio}">
              <span class="n">${s.nombre}</span>
            </label>`).join('')
        : '<p class="hint" style="padding:8px;">No hay servicios disponibles en este momento.</p>';
    } catch {
      $('cp-servicios').innerHTML = '<p class="hint" style="padding:8px;color:var(--danger);">No se pudieron cargar los servicios. Recargá la página.</p>';
    }

    // Calendario con los días bloqueados del taller
    let bloqueados = [];
    try { bloqueados = await publico.diasBloqueados(); } catch { bloqueados = []; }
    cal = crearCalendario('cp-cal', {
      soloFuturo: true,
      bloqueados,
      onSelect: (f) => {
        $('cp-fecha').value = f;
        const bonita = new Date(f + 'T00:00:00').toLocaleDateString('es-CR', {
          weekday: 'long', day: 'numeric', month: 'long'
        });
        $('cp-fecha-label').innerHTML = `Día elegido: <strong style="color:var(--text);">${bonita}</strong>`;
        limpiarError();
      }
    });
  })();

  // ── Enviar la solicitud ────────────────────────────────────
  $('cp-enviar').onclick = async () => {
    limpiarError();

    const nombre   = $('cp-nombre').value.trim();
    const telefono = $('cp-telefono').value.trim();
    const correo   = $('cp-correo').value.trim();
    const placa    = $('cp-placa').value.trim().toUpperCase();
    const id_marca = parseInt($('cp-marca').value) || null;
    const fecha    = $('cp-fecha').value;
    const obs      = $('cp-obs').value.trim();
    const servicios = [...document.querySelectorAll('.cp-serv:checked')].map(c => parseInt(c.value));

    // Validación en el navegador (el backend valida igual por su cuenta)
    if (nombre.length < 3)                       return mostrarError('Escribí tu nombre completo.');
    if (telefono.replace(/\D/g, '').length < 8)  return mostrarError('Escribí un teléfono válido (mínimo 8 dígitos).');
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return mostrarError('El correo no tiene un formato válido.');
    if (!placa)                                  return mostrarError('Escribí la placa de tu vehículo.');
    if (!id_marca)                               return mostrarError('Seleccioná la marca del vehículo.');
    if (!servicios.length)                       return mostrarError('Seleccioná al menos un servicio.');
    if (!fecha)                                  return mostrarError('Elegí el día de la cita en el calendario.');

    const btn = $('cp-enviar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Enviando…';

    try {
      const r = await publico.solicitarCita({
        nombre, telefono, correo: correo || null,
        placa, id_marca,
        servicios, fecha, observaciones: obs
      });

      // Resumen de lo solicitado
      const nombresServ = servicios
        .map(id => serviciosCache.find(s => s.id_tipo_servicio === id)?.nombre)
        .filter(Boolean).join(', ');
      const fechaBonita = new Date(fecha + 'T00:00:00').toLocaleDateString('es-CR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });

      $('cp-resumen').innerHTML = `
        <div class="fila"><span>N.º de solicitud</span><span>#${r.numero}</span></div>
        <div class="fila"><span>A nombre de</span><span>${nombre}</span></div>
        <div class="fila"><span>Teléfono</span><span>${telefono}</span></div>
        <div class="fila"><span>Vehículo</span><span>${placa}</span></div>
        <div class="fila"><span>Servicios</span><span>${nombresServ || '—'}</span></div>
        <div class="fila"><span>Día solicitado</span><span>${fechaBonita}</span></div>
        <div class="fila"><span>Estado</span><span style="color:#b45309;">Pendiente de confirmación</span></div>`;

      $('cp-nota-correo').innerHTML = correo
        ? `<i class="fas fa-circle-info"></i> Anotá tu número de solicitud <strong>#${r.numero}</strong>. Como dejaste tu correo, más adelante podés crear tu contraseña desde "¿Olvidaste tu contraseña?" en el login y ver tu historial.`
        : `<i class="fas fa-circle-info"></i> Anotá tu número de solicitud <strong>#${r.numero}</strong> para cuando llames al taller.`;

      $('pantalla-form').style.display = 'none';
      $('pantalla-ok').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      mostrarError(e.message || 'No se pudo enviar la solicitud. Intentá de nuevo.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-calendar-plus" style="margin-right:8px;"></i>Solicitar cita';
    }
  };

  // ── Volver a empezar (otra cita) ───────────────────────────
  window.nuevaSolicitud = () => {
    ['cp-placa', 'cp-obs', 'cp-fecha'].forEach(id => { $(id).value = ''; });
    $('cp-marca').value = '';
    document.querySelectorAll('.cp-serv:checked').forEach(c => { c.checked = false; });
    $('cp-fecha-label').textContent = 'Ningún día seleccionado.';
    if (cal) cal.setSeleccion(null);
    $('pantalla-ok').style.display = 'none';
    $('pantalla-form').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
});
