import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Consultando usuarios en la base de datos Supabase:');
  const users = await prisma.user.findMany();
  
  for (const u of users) {
    const isPasswordCorrect = await bcrypt.compare('Password123!', u.passwordHash);
    console.log(`- Email: ${u.email}`);
    console.log(`  Nombre: ${u.name}`);
    console.log(`  Rol: ${u.role}`);
    console.log(`  Estado: ${u.status}`);
    console.log(`  ¿Contraseña 'Password123!' válida?: ${isPasswordCorrect ? '✅ SÍ' : '❌ NO'}`);
    console.log('---');
  }
}

main().finally(() => prisma.$disconnect());
