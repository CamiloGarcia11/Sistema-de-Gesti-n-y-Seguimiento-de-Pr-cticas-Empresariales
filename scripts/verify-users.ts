import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function verifyUsers() {
  console.log('🔍 Verificando usuarios en Supabase...');

  const testCredentials = [
    { email: 'admin.sigetrap@ufps.edu.co', password: 'Password123!', expectedRole: 'ADMIN' },
    { email: 'director.sistemas@ufps.edu.co', password: 'Password123!', expectedRole: 'DIRECTOR_PROGRAMA' },
    { email: 'docente.practica@ufps.edu.co', password: 'Password123!', expectedRole: 'DOCENTE_PRACTICA' },
    { email: 'tutor@techinnovations.co', password: 'Password123!', expectedRole: 'TUTOR_EMPRESARIAL' },
    { email: 'estudiante@ufps.edu.co', password: 'Password123!', expectedRole: 'ESTUDIANTE' },
  ];

  for (const cred of testCredentials) {
    const user = await prisma.user.findUnique({
      where: { email: cred.email },
    });

    if (!user) {
      console.error(`❌ Usuario NO encontrado: ${cred.email}`);
      continue;
    }

    const passwordMatch = await bcrypt.compare(cred.password, user.passwordHash);
    const roleMatch = user.role === cred.expectedRole;
    const isActive = user.status === 'ACTIVO' && user.isActive;

    console.log(
      `✅ Usuario: ${user.email.padEnd(32)} | Rol: ${user.role.padEnd(18)} | Activo: ${isActive} | Password OK: ${passwordMatch}`
    );

    if (!passwordMatch || !roleMatch || !isActive) {
      console.error(`⚠️ Error en validación de usuario ${cred.email}`);
    }
  }
}

verifyUsers()
  .catch((e) => {
    console.error('Error conectando a Supabase:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
