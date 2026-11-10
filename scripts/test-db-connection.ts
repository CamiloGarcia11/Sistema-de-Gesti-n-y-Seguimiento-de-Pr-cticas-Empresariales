// ==============================================================================
// SIGETRAP - Script de Diagnóstico de Conexión a Base de Datos (Supabase)
// Uso: npm run db:check
// ==============================================================================

import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('======================================================');
  console.log('SIGETRAP - Verificando conexión a Supabase PostgreSQL');
  console.log('======================================================');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('❌ ERROR: La variable NEXT_PUBLIC_SUPABASE_URL no está definida en el entorno (.env)');
    process.exit(1);
  }

  console.log(`📡 Instancia Supabase: ${supabaseUrl}`);

  try {
    const startTime = Date.now();
    await prisma.$connect();

    const result = await prisma.$queryRaw<Array<{ current_database: string; current_user: string; now: Date }>>`
      SELECT current_database(), current_user, NOW() as now;
    `;
    const duration = Date.now() - startTime;

    console.log(`✅ Conexión exitosa en ${duration}ms`);
    console.log(`🗄️  Base de datos: ${result[0]?.current_database}`);
    console.log(`👤 Usuario DB:    ${result[0]?.current_user}`);
    console.log(`🕒 Hora Servidor: ${result[0]?.now}`);

    const userCount = await prisma.user.count();
    const companyCount = await prisma.company.count();
    const practiceCount = await prisma.practice.count();

    console.log('\n📊 Estado actual de tablas principales en Supabase:');
    console.log(`   - Usuarios (users):       ${userCount}`);
    console.log(`   - Empresas (companies):   ${companyCount}`);
    console.log(`   - Prácticas (practices):  ${practiceCount}`);
    console.log('======================================================');
  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO DE CONEXIÓN:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
