// ── Calendario mensual reutilizable (vanilla JS) ─────────────
// Uso:
//   const cal = crearCalendario('id-contenedor', {
//     editable: true|false,
//     bloqueados: ['2026-08-07', ...],   // días no disponibles
//     seleccion: '2026-08-10'|null,      // día elegido (modo cliente)
//     soloFuturo: true,                  // no permite días pasados (cliente)
//     onToggle: (fecha, estabaBloqueado) => {},  // modo admin: click alterna
//     onSelect: (fecha) => {}                    // modo cliente: click elige
//   });
//   cal.setBloqueados([...]);  cal.getSeleccion();
const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_ES  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function fechaStr(y, m0, d) {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function crearCalendario(contenedorId, opciones = {}) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return null;

  const hoy = new Date();
  let anio = hoy.getFullYear();
  let mes  = hoy.getMonth(); // 0-based
  let bloqueados = new Set(opciones.bloqueados || []);
  let seleccion  = opciones.seleccion || null;
  const editable = !!opciones.editable;
  const soloFuturo = !!opciones.soloFuturo;
  const hoyStr = fechaStr(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  cont.classList.add('cal');
  if (editable) cont.classList.add('editable');

  // Delegación de clicks (una vez)
  cont.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-cal-nav]');
    if (nav) {
      mes += parseInt(nav.dataset.calNav);
      if (mes < 0) { mes = 11; anio--; }
      if (mes > 11) { mes = 0; anio++; }
      dibujar();
      return;
    }
    const cel = e.target.closest('[data-fecha]');
    if (!cel || cel.classList.contains('vacio') || cel.classList.contains('pasado')) return;
    const f = cel.dataset.fecha;
    if (editable) {
      const estaba = bloqueados.has(f);
      if (opciones.onToggle) opciones.onToggle(f, estaba);
    } else {
      if (bloqueados.has(f)) return;   // día no disponible: no se puede elegir
      seleccion = f;
      dibujar();
      if (opciones.onSelect) opciones.onSelect(f);
    }
  });

  function dibujar() {
    const primerDia = new Date(anio, mes, 1).getDay();       // 0=Dom
    const diasMes   = new Date(anio, mes + 1, 0).getDate();

    let celdas = '';
    for (let i = 0; i < primerDia; i++) celdas += '<div class="cal-dia vacio"></div>';
    for (let d = 1; d <= diasMes; d++) {
      const f = fechaStr(anio, mes, d);
      const cls = ['cal-dia'];
      if (bloqueados.has(f)) cls.push('bloqueado');
      if (f === seleccion)   cls.push('sel');
      if (f === hoyStr)      cls.push('hoy');
      if (soloFuturo && f < hoyStr) cls.push('pasado');
      celdas += `<div class="${cls.join(' ')}" data-fecha="${f}">${d}</div>`;
    }

    cont.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-cal-nav="-1" title="Mes anterior"><i class="fas fa-chevron-left"></i></button>
        <span class="cal-title">${MESES_ES[mes]} ${anio}</span>
        <button type="button" class="cal-nav" data-cal-nav="1" title="Mes siguiente"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div class="cal-grid cal-labels">${DIAS_ES.map(d => `<div class="cal-lbl">${d}</div>`).join('')}</div>
      <div class="cal-grid">${celdas}</div>`;
  }

  dibujar();

  return {
    setBloqueados(arr) { bloqueados = new Set(arr || []); dibujar(); },
    getSeleccion() { return seleccion; },
    setSeleccion(f) { seleccion = f; dibujar(); },
    refrescar: dibujar
  };
}
