// ==============================================================================
// SIGETRAP - Script de Verificación de Conexión a Base de Datos Supabase
// ==============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
});

async function checkDatabaseConnection() {
  console.log('🔌 Verificando conexión a la base de datos Supabase / PostgreSQL...');
  console.log(`📡 DATABASE_URL configurada: ${process.env.DATABASE_URL ? 'DEFINIDA' : 'NO DEFINIDA'}`);

  try {
    // 1. Ejecutar consulta simple de ping
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1 as ping`;
    const latency = Date.now() - startTime;
    console.log(`✅ Conexión exitosa a PostgreSQL. Latencia: ${latency}ms\n`);

    // 2. Comprobar existencia de tablas y datos de HU01
    console.log('📊 Verificando tablas del sistema y datos de HU01:');

    const usersCount = await prisma.user.count();
    console.log(`  - Usuarios registrados (users): ${usersCount}`);

    const companiesCount = await prisma.company.count();
    console.log(`  - Empresas vinculadas (companies): ${companiesCount}`);

    const agreementsCount = await prisma.agreement.count();
    console.log(`  - Convenios registrados (agreements): ${agreementsCount}`);

    const practicesCount = await prisma.practice.count();
    console.log(`  - Prácticas en seguimiento (practices): ${practicesCount}`);

    const historyCount = await prisma.practiceStatusHistory.count();
    console.log(`  - Registros de auditoría histórica (practice_status_history): ${historyCount}\n`);

    // 3. Comprobar usuario administrador para HU01
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, email: true, name: true, role: true, status: true, isActive: true },
    });

    if (adminUser) {
      console.log('👑 Usuario Administrador encontrado para HU01:');
      console.log(`  - Email: ${adminUser.email}`);
      console.log(`  - Nombre: ${adminUser.name}`);
      console.log(`  - Estado: ${adminUser.status} (Activo: ${adminUser.isActive})`);
    } else {
      console.log('⚠️ No se encontró ningún usuario con rol ADMIN. Recuerda ejecutar el seeder o script SQL.');
    }

    console.log('\n🚀 La base de datos está 100% configurada y lista para operar con SIGETRAP.');
  } catch (error: any) {
    console.error('\n❌ ERROR DE CONEXIÓN A LA BASE DE DATOS:');
    console.error(error.message || error);
    console.log('\n💡 CONSEJOS:');
    console.log('1. Asegúrate de tener tu archivo .env con las credenciales de Supabase:');
    console.log('   DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"');
    console.log('   DIRECT_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"');
    console.log('2. Puedes ejecutar el script SQL en el SQL Editor de Supabase: database/supabase_schema_and_seed.sql');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseConnection();
