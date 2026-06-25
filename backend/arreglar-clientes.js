require('dotenv').config();
const supabase = require('./db/supabase');

async function arreglarClientes() {
  // 1. Obtener todos los usuarios con rol cliente (id_rol = 3)
  const { data: usuarios, error: uErr } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre')
    .eq('id_rol', 3);

  if (uErr) { console.error('Error leyendo usuarios:', uErr.message); process.exit(1); }

  if (!usuarios.length) {
    console.log('No hay usuarios con rol cliente.');
    return;
  }

  // 2. Ver cuáles ya tienen registro en clientes
  const { data: existentes } = await supabase
    .from('clientes')
    .select('id_usuario');

  const yaExisten = new Set((existentes ?? []).map(c => c.id_usuario));

  // 3. Filtrar los que no tienen perfil
  const sinPerfil = usuarios.filter(u => !yaExisten.has(u.id_usuario));

  if (!sinPerfil.length) {
    console.log('Todos los clientes ya tienen perfil en la tabla clientes.');
    return;
  }

  console.log(`Creando perfiles para: ${sinPerfil.map(u => u.nombre).join(', ')}`);

  // 4. Insertar registros faltantes
  const { error: iErr } = await supabase
    .from('clientes')
    .insert(sinPerfil.map(u => ({ id_usuario: u.id_usuario })));

  if (iErr) {
    console.error('Error creando perfiles:', iErr.message);
  } else {
    console.log(`✓ ${sinPerfil.length} perfil(es) creado(s) correctamente.`);
  }
}

arreglarClientes();
