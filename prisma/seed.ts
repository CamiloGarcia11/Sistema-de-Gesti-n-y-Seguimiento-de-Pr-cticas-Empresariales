// ==============================================================================
// SIGETRAP - Script de Semilla Inicial (Database Seeder)
// ==============================================================================

import { PrismaClient, Role, AgreementStatus, PracticeStatus, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando la siembra de datos de prueba para SIGETRAP...');

  // 1. Limpiar base de datos (orden inverso de dependencias)
  await prisma.practiceStatusHistory.deleteMany();
  await prisma.workPlan.deleteMany();
  await prisma.followUpVisit.deleteMany();
  await prisma.report.deleteMany();
  await prisma.evaluation.deleteMany();
  await prisma.practice.deleteMany();
  await prisma.application.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.agreement.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  await prisma.StudyPlan.deleteMany();

  const passwordHash = await bcrypt.hash('Password123!', 10);
    await prisma.StudyPlan.create({
    data: {
      program: 'Ingeniería de Sistemas',
      name: 'Plan de Estudios Ingeniería de Sistemas',
      minCreditsForPractice: 100,
      minAverageForPractice: 3.0,
    },
  });

  // 2. Crear Empresa con Convenio VIGENTE (RN-01)
  const company = await prisma.company.create({
    data: {
      nit: '900123456-1',
      businessName: 'Tech Innovations Colombia S.A.S.',
      legalRepresentative: 'Carlos Mendoza',
      contactEmail: 'contacto@techinnovations.co',
      contactPhone: '+57 300 123 4567',
      address: 'Calle 100 # 15-20',
      city: 'Bogotá D.C.',
      agreements: {
        create: {
          agreementNumber: 'CONV-2026-001',
          status: AgreementStatus.VIGENTE,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2028-12-31'),
          signedByDirector: true,
          documentUrl: 'https://storage.sigetrap.co/agreements/conv-2026-001.pdf',
          notes: 'Convenio marco de cooperación interinstitucional vigente',
        },
      },
    },
  });

  console.log('✅ Empresa y Convenio VIGENTE creados.');

  // 3. Crear Usuarios para cada Rol RBAC
  const director = await prisma.user.create({
    data: {
      email: 'director.sistemas@ufps.edu.co',
      name: 'Dr. Roberto Gómez (Director)',
      passwordHash,
      documentNumber: '1010203040',
      role: Role.DIRECTOR_PROGRAMA,
      program: 'Ingeniería de Sistemas',
      status: UserStatus.ACTIVO,
      isActive: true,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin.sigetrap@ufps.edu.co',
      name: 'Administrador del Sistema',
      passwordHash,
      documentNumber: '1000000001',
      role: Role.ADMIN,
      status: UserStatus.ACTIVO,
      isActive: true,
    },
  });

  const teacher = await prisma.user.create({
    data: {
      email: 'docente.practica@ufps.edu.co',
      name: 'Ing. Laura Restrepo (Docente Supervisor)',
      passwordHash,
      documentNumber: '1020304050',
      role: Role.DOCENTE_PRACTICA,
      program: 'Ingeniería de Sistemas',
      status: UserStatus.ACTIVO,
      isActive: true,
    },
  });

  const tutor = await prisma.user.create({
    data: {
      email: 'tutor@techinnovations.co',
      name: 'Ing. Andrés Silva (Tutor Empresarial)',
      passwordHash,
      documentNumber: '1030405060',
      role: Role.TUTOR_EMPRESARIAL,
      companyId: company.id,
      status: UserStatus.ACTIVO,
      isActive: true,
    },
  });

  const student = await prisma.user.create({
    data: {
      email: 'estudiante@ufps.edu.co',
      name: 'Juan David Pérez (Estudiante Practicante)',
      passwordHash,
      documentNumber: '1090123456',
      studentCode: '1152001',
      academicAverage: 4.25,
      approvedCredits: 130,
      role: Role.ESTUDIANTE,
      program: 'Ingeniería de Sistemas',
      status: UserStatus.ACTIVO,
      isActive: true,
    },
  });

  console.log('✅ Usuarios para los 5 roles creados con contraseña: Password123!');

  // 4. Crear Vacante
  const vacancy = await prisma.vacancy.create({
    data: {
      companyId: company.id,
      createdById: tutor.id,
      title: 'Desarrollador Fullstack Junior / Practicante',
      description: 'Participación en el desarrollo de microservicios y frontend en Next.js.',
      requirements: 'Estudiante de 9no o 10mo semestre con conocimientos en TypeScript, React y SQL.',
      vacanciesCount: 2,
    },
  });

  // 5. Crear Práctica de ejemplo en estado ACEPTADO_ARL_PENDIENTE para probar RN-06
  const practice = await prisma.practice.create({
    data: {
      studentId: student.id,
      companyId: company.id,
      vacancyId: vacancy.id,
      teacherId: teacher.id,
      tutorId: tutor.id,
      directorId: director.id,
      currentStatus: PracticeStatus.ACEPTADO_ARL_PENDIENTE,
      presentationLetterUrl: 'https://storage.sigetrap.co/docs/oficio_presentacion_juan_perez.pdf',
      statusHistory: {
        createMany: {
          data: [
            {
              fromStatus: PracticeStatus.ASPIRANTE,
              toStatus: PracticeStatus.POSTULADO,
              changedByUserId: student.id,
              notes: 'Postulación inicial a la vacante',
            },
            {
              fromStatus: PracticeStatus.POSTULADO,
              toStatus: PracticeStatus.PRESENTADO_A_EMPRESA,
              changedByUserId: director.id,
              notes: 'Emisión de Oficio de Presentación #OP-2026-45',
            },
            {
              fromStatus: PracticeStatus.PRESENTADO_A_EMPRESA,
              toStatus: PracticeStatus.ACEPTADO_ARL_PENDIENTE,
              changedByUserId: tutor.id,
              notes: 'Estudiante seleccionado tras entrevista técnica. Pendiente afiliación ARL.',
            },
          ],
        },
      },
    },
  });

  console.log(`✅ Práctica de prueba creada con ID: ${practice.id} (Estado: ${practice.currentStatus})`);
  console.log('🚀 Semilla completada exitosamente.');
}

main()
  .catch((e) => {
    console.error('Error en seeder:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
