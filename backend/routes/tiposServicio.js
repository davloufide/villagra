const router   = require('express').Router();
const supabase = require('../db/supabase');
const { verificarToken, soloRol } = require('../middleware/auth');
const { clave, leerFilas, numeroOpcional, texto } = require('../utils/importacion');

const IVA_RATE = 0.13;
const calcIVA = (base) => parseFloat((base * IVA_RATE).toFixed(2));

// Inserta o actualiza un servicio guardando el IVA; si la columna iva aún no
// existe (migración sin correr), reintenta sin ella.
async function guardarServicio(registro, id) {
  const ejecutar = (r) => id
    ? supabase.from('tipos_servicio').update(r).eq('id_tipo_servicio', id).select().single()
    : supabase.from('tipos_servicio').insert(r).select().single();
  let { data, error } = await ejecutar(registro);
  if (error && (error.code === 'PGRST204' || /iva/i.test(error.message || ''))) {
    const { iva, ...sinIva } = registro;
    ({ data, error } = await ejecutar(sinIva));
  }
  return { data, error };
}

// GET /api/tipos-servicio
// El CLIENTE usa esta lista para elegir servicios al agendar, y no debe ver
// los precios (el monto se define al facturar, según lo que encuentre el
// mecánico). Por eso al rol cliente se le devuelve el catálogo sin importes.
router.get('/', verificarToken, async (req, res) => {
  const esCliente = req.usuario.rol === 'cliente';
  const { data, error } = await supabase
    .from('tipos_servicio')
    .select(esCliente ? 'id_tipo_servicio, nombre, descripcion' : '*')
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/tipos-servicio — agregar un servicio al catálogo (admin) [OPE-006]
router.post('/', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, descripcion, precio_base } = req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: 'El nombre del servicio es requerido' });

  const base = precio_base ? parseFloat(precio_base) : 0;
  const registro = { nombre: nombre.trim(), descripcion: descripcion || null, precio_base: base };

  // Guardar el IVA (13% del precio base)
  const { data, error } = await guardarServicio({ ...registro, iva: calcIVA(base) });

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese servicio ya existe' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// POST /api/tipos-servicio/importar — carga masiva desde Excel (admin)
// Body: { filas: [{ fila, nombre, precio_base, descripcion }] }.
// Si ya existe un servicio con ese nombre (sin distinguir mayúsculas ni
// tildes) se ACTUALIZA su precio/descripción; si no, se crea.
router.post('/importar', verificarToken, soloRol('administrador'), async (req, res) => {
  const { filas, error: errFilas } = leerFilas(req.body);
  if (errFilas) return res.status(400).json({ error: errFilas });

  const { data: existentes, error: errE } = await supabase
    .from('tipos_servicio').select('id_tipo_servicio, nombre');
  if (errE) return res.status(500).json({ error: errE.message });
  const porNombre = new Map(existentes.map(s => [clave(s.nombre), s.id_tipo_servicio]));

  const resultado = { creados: 0, actualizados: 0, errores: [] };
  for (const f of filas) {
    const nombre = texto(f.nombre);
    const base   = numeroOpcional(f.precio_base);
    if (!nombre)                    { resultado.errores.push({ fila: f.fila, error: 'Falta el nombre del servicio' }); continue; }
    if (base === undefined)         { resultado.errores.push({ fila: f.fila, error: 'Falta el precio' }); continue; }
    if (Number.isNaN(base) || base < 0) { resultado.errores.push({ fila: f.fila, error: 'El precio no es un número válido' }); continue; }

    const registro = { precio_base: base, iva: calcIVA(base) };
    if (texto(f.descripcion)) registro.descripcion = texto(f.descripcion);

    // Al actualizar se conserva el nombre tal como está en el catálogo
    const id = porNombre.get(clave(nombre));
    const { data, error } = await guardarServicio(id ? registro : { ...registro, nombre }, id);
    if (error) { resultado.errores.push({ fila: f.fila, error: error.message }); continue; }

    if (id) resultado.actualizados++;
    else { resultado.creados++; porNombre.set(clave(nombre), data.id_tipo_servicio); }
  }
  res.json(resultado);
});

// PATCH /api/tipos-servicio/:id — editar un servicio (admin)
router.patch('/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const { nombre, descripcion, precio_base } = req.body;
  const cambios = {};
  if (nombre !== undefined) {
    if (!nombre.trim()) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    cambios.nombre = nombre.trim();
  }
  if (descripcion !== undefined) cambios.descripcion = descripcion || null;
  if (precio_base !== undefined) {
    const base = precio_base ? parseFloat(precio_base) : 0;
    cambios.precio_base = base;
    cambios.iva = calcIVA(base);
  }

  const { data, error } = await guardarServicio(cambios, req.params.id);

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un servicio con ese nombre' });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// DELETE /api/tipos-servicio/:id — eliminar un servicio (admin)
// Se bloquea si el servicio está en uso en alguna tarea/mantenimiento.
router.delete('/:id', verificarToken, soloRol('administrador'), async (req, res) => {
  const { data: enUso } = await supabase
    .from('tareas')
    .select('id_tarea')
    .eq('id_tipo_servicio', req.params.id)
    .limit(1);

  if (enUso && enUso.length)
    return res.status(409).json({ error: 'Este servicio está en uso en uno o más mantenimientos. No se puede eliminar.' });

  const { error } = await supabase
    .from('tipos_servicio')
    .delete()
    .eq('id_tipo_servicio', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
