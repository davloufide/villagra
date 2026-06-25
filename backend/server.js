require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// ── Rutas ────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/vehiculos',      require('./routes/vehiculos'));
app.use('/api/clientes',       require('./routes/clientes'));
app.use('/api/tipos-servicio', require('./routes/tiposServicio'));
app.use('/api/mantenimientos', require('./routes/mantenimientos'));
app.use('/api/inventario',     require('./routes/inventario'));
app.use('/api/empleados',      require('./routes/empleados'));
app.use('/api/usuarios',       require('./routes/usuarios'));
app.use('/api/perfil',         require('./routes/perfil'));
app.use('/api/facturacion',    require('./routes/facturacion'));
app.use('/api/reportes',       require('./routes/reportes'));

// ── Health check ─────────────────────────────────────────
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// ── Servir el frontend (carpeta sistema) ─────────────────
// Así un solo servicio (Render) sirve las pantallas Y la API.
const FRONTEND_DIR = path.join(__dirname, '..', 'sistema');
app.use(express.static(FRONTEND_DIR, { index: false }));
app.get('/', (req, res) => res.redirect('/landing.html'));

// ── 404 ──────────────────────────────────────────────────
// Solo para rutas /api/* desconocidas; lo demás ya lo maneja el estático.
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── Error global ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
