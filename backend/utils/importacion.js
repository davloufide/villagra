// Utilidades para la carga masiva desde Excel (servicios e inventario).
// El navegador lee el .xlsx y manda las filas ya mapeadas como JSON:
// { filas: [{ fila, ...campos }] }, donde `fila` es el número de fila en Excel
// (para que los errores le digan al admin exactamente dónde corregir).

const MAX_FILAS = 2000;

// Clave para comparar nombres sin importar mayúsculas, tildes ni espacios de más
function clave(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Valida el body; devuelve { filas } o { error } listo para responder 400
function leerFilas(body) {
  const filas = Array.isArray(body?.filas) ? body.filas : null;
  if (!filas || !filas.length) return { error: 'El archivo no tiene filas para importar' };
  if (filas.length > MAX_FILAS) return { error: `Máximo ${MAX_FILAS} filas por archivo (vienen ${filas.length})` };
  return { filas };
}

// Número opcional: undefined si viene vacío, NaN si no es un número válido
function numeroOpcional(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

const texto = v => String(v ?? '').trim();

module.exports = { MAX_FILAS, clave, leerFilas, numeroOpcional, texto };
