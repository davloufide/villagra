// Formato de correo: algo@dominio.ext (sin espacios). ADM-001
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function esCorreoValido(correo) {
  return RE_CORREO.test(String(correo ?? '').trim());
}

const MSG_CORREO = 'El correo no tiene un formato válido (ejemplo: nombre@dominio.com)';

module.exports = { esCorreoValido, MSG_CORREO };
