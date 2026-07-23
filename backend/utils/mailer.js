const nodemailer = require('nodemailer');

// Transporte SMTP configurado desde variables de entorno.
// Si faltan SMTP_USER / SMTP_PASS, queda null y el sistema sigue en "modo demo"
// (el enlace de recuperación se muestra en pantalla en vez de enviarse por correo).
let transporter = null;

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  console.log('[Mailer] SMTP configurado — los correos se enviarán por', process.env.SMTP_HOST || 'smtp.gmail.com');
} else {
  console.log('[Mailer] SMTP NO configurado — recuperación de contraseña en modo demo (enlace en pantalla).');
}

const correoConfigurado = () => !!transporter;

async function enviarCorreo({ para, asunto, html }) {
  if (!transporter) throw new Error('SMTP no configurado');
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Lubricentro Villagra" <${process.env.SMTP_USER}>`,
    to: para,
    subject: asunto,
    html
  });
}

module.exports = { enviarCorreo, correoConfigurado };
