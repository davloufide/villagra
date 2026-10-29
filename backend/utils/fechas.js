// Fechas en hora de Costa Rica (UTC-6, sin horario de verano).
// El servidor (Render) corre en UTC: sin esto, "hoy" y "este mes" cambian a
// las 6 p. m. hora local y los reportes cuentan registros en el mes que no es.
const OFFSET_MS = 6 * 60 * 60 * 1000;

// 'YYYY-MM-DD' de hoy en Costa Rica
function hoyCR() {
  return new Date(Date.now() - OFFSET_MS).toISOString().slice(0, 10);
}

// 'YYYY-MM' del mes actual en Costa Rica
function mesActualCR() {
  return hoyCR().slice(0, 7);
}

// Día (YYYY-MM-DD, hora CR) de un timestamp guardado en UTC
function diaCR(ts) {
  return new Date(new Date(ts).getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

// Inicio de un día CR ('YYYY-MM-DD') expresado en ISO UTC (00:00 CR = 06:00 UTC)
function inicioDiaCR(fecha) {
  return new Date(`${fecha}T06:00:00.000Z`).toISOString();
}

// Rango [desde, hasta) en ISO UTC que cubre el mes 'YYYY-MM' en hora CR
function rangoMesCR(mes) {
  const [y, m] = mes.split('-').map(Number);
  const sig = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { desde: inicioDiaCR(`${mes}-01`), hasta: inicioDiaCR(`${sig}-01`) };
}

// Valida 'YYYY-MM-DD' (formato y fecha real)
function esFechaValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

module.exports = { hoyCR, mesActualCR, diaCR, inicioDiaCR, rangoMesCR, esFechaValida };
