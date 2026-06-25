require('dotenv').config();
const bcrypt   = require('bcryptjs');
const supabase = require('./db/supabase');

const usuarios = [
  { correo: 'admin@villagra.cr',  password: 'Admin1234!' },
  { correo: 'kevin@villagra.cr',  password: 'Mecanico1!' },
  { correo: 'luis@villagra.cr',   password: 'Mecanico1!' },
  { correo: 'maria@cliente.cr',   password: 'Cliente1!'  },
];

async function main() {
  console.log('Actualizando contraseñas de usuarios demo...\n');
  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.password, 10);
    const { error } = await supabase
      .from('usuarios')
      .update({ password_hash: hash })
      .eq('correo', u.correo);

    if (error) {
      console.log(`ERROR ${u.correo}: ${error.message}`);
    } else {
      console.log(`OK  ${u.correo}  →  ${u.password}`);
    }
  }
  console.log('\nListo. Ya puedes hacer login.');
  process.exit(0);
}

main().catch(console.error);
