// ==============================================================================
// SIGETRAP - Test de Verificación: Postulación de Estudiante a Vacante
// Historia de Usuario:
// "Como estudiante elegible, quiero postularme a una vacante adjuntando mi
//  hoja de vida, para participar en el proceso de preselección empresarial."
//
// Criterios de Aceptación Evaluados:
//   - Criterio 1: Postulación exitosa con hoja de vida válida por estudiante elegible (POSTULADO + Práctica + Auditoría)
//   - Criterio 2: Rechazo de postulación si el estudiante no cumple con los créditos mínimos de elegibilidad
//   - Criterio 3: Rechazo si el estudiante ya cuenta con una práctica en curso en estado activo
//   - Criterio 4: Rechazo por postulación duplicada a la misma vacante
//   - Criterio 5: Rechazo si no se adjunta el soporte de la hoja de vida (cvUrl obligatorio y formato válido)
//   - Criterio 6: Rechazo si la vacante pertenece a una empresa sin convenio institucional VIGENTE (RN-01)
//   - Criterio 7: Rechazo si la vacante no se encuentra abierta (estado BORRADOR, CUBIERTA, CANCELADA)
//   - Criterio 8: Restricción de permisos RBAC para roles no autorizados
//   - Criterio 9: Consulta y trazabilidad de postulaciones del estudiante en preselección
//   - Criterio 10: Verificación de la API HTTP Route Handler (POST /api/v1/vacantes/[id]/postular)
// ==============================================================================

import { NextRequest } from 'next/server';
import {
  StudentApplicationService,
  ApplicationValidationError,
  REQUIRED_CREDITS_THRESHOLD,
  MINIMUM_ACADEMIC_AVERAGE,
} from '../src/server/services/student-application.service';
import { VacancyRepository } from '../src/server/repositories/vacancy.repository';
import { ApplicationRepository } from '../src/server/repositories/application.repository';
import { UserRepository } from '../src/server/repositories/user.repository';
import { AgreementRepository } from '../src/server/repositories/agreement.repository';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import { StudyPlanRepository } from '../src/server/repositories/study-plan.repository';
import { AuthenticatedUser, Role, UserStatus, PracticeStatus, VacancyStatus } from '../src/types';
import { POST as postularRouteHandler } from '../src/app/api/v1/vacantes/[id]/postular/route';
import { generateToken } from '../src/lib/auth';

// ------------------------------------------------------------------------------
// MOCKS EN MEMORIA
// ------------------------------------------------------------------------------

class MockVacancyRepository extends VacancyRepository {
  public vacancies: any[] = [];

  constructor(initialVacancies: any[] = []) {
    super();
    this.vacancies = [...initialVacancies];
  }

  async findById(id: string) {
    const v = this.vacancies.find((item) => item.id === id);
    if (!v) return null;
    return {
      ...v,
      applications: v.applications || [],
      _count: {
        applications: (v.applications || []).length,
        practices: (v.applications || []).length,
      },
    };
  }

  async findAvailableVacancies(params: any) {
    const filtered = this.vacancies.filter((v) => !v.deletedAt && ['PUBLICADA', 'EN_SELECCION'].includes(v.status));
    return { vacancies: filtered, total: filtered.length };
  }

  async updateStatus(id: string, status: VacancyStatus) {
    const v = this.vacancies.find((item) => item.id === id);
    if (v) v.status = status;
    return v;
  }
}

class MockApplicationRepository extends ApplicationRepository {
  public applications: any[] = [];
  public practices: any[] = [];
  public history: any[] = [];

  async findByStudentAndVacancy(studentId: string, vacancyId: string) {
    return (
      this.applications.find(
        (a) => a.studentId === studentId && a.vacancyId === vacancyId && !a.deletedAt
      ) || null
    );
  }

  async findById(id: string) {
    return this.applications.find((a) => a.id === id) || null;
  }

  async findManyByStudentId(studentId: string) {
    return this.applications
      .filter((a) => a.studentId === studentId && !a.deletedAt)
      .map((app) => {
        const p = this.practices.find((item) => item.applicationId === app.id);
        return {
          ...app,
          practice: p ? { id: p.id, currentStatus: p.currentStatus } : null,
          vacancy: {
            id: app.vacancyId,
            title: 'Vacante Prueba',
            company: {
              id: 'comp-1',
              businessName: 'Empresa Test',
              city: 'Cúcuta',
            },
          },
        };
      });
  }

  async createApplicationWithPractice(params: {
    vacancyId: string;
    studentId: string;
    companyId: string;
    cvUrl: string;
    presentationLetterUrl?: string | null;
    notes?: string;
  }) {
    const application = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(5)}`,
      vacancyId: params.vacancyId,
      studentId: params.studentId,
      status: 'POSTULADO' as const,
      cvUrl: params.cvUrl,
      presentationLetterUrl: params.presentationLetterUrl ?? null, // <-- Solución
      rejectionReason: null,                                       // <-- Solución
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.applications.push(application);

    const practice = {
      id: `prac_${Date.now()}_${Math.random().toString(36).substring(5)}`,
      applicationId: application.id,
      studentId: params.studentId,
      companyId: params.companyId,
      vacancyId: params.vacancyId,
      currentStatus: 'POSTULADO' as const,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.practices.push(practice);

    const historyEntry = {
      id: `hist_${Date.now()}`,
      practiceId: practice.id,
      fromStatus: 'ASPIRANTE' as const,
      toStatus: 'POSTULADO' as const,
      changedByUserId: params.studentId,
      notes: params.notes || 'Postulación inicial del estudiante a la vacante',
      metadata: { cvUrl: params.cvUrl, applicationId: application.id },
      createdAt: new Date(),
    };
    this.history.push(historyEntry);

    return { application, practice, historyEntry };
  }
}

class MockUserRepository extends UserRepository {
  public users: any[] = [];

  constructor(initialUsers: any[] = []) {
    super();
    this.users = [...initialUsers];
  }

  async findById(id: string) {
    return this.users.find((u) => u.id === id) || null;
  }
}

class MockAgreementRepository extends AgreementRepository {
  public agreements: any[] = [];

  constructor(initialAgreements: any[] = []) {
    super();
    this.agreements = [...initialAgreements];
  }

  async findActiveAgreementByCompanyId(companyId: string) {
    const now = new Date();
    return (
      this.agreements.find(
        (a) =>
          a.companyId === companyId &&
          a.status === 'VIGENTE' &&
          new Date(a.startDate) <= now &&
          new Date(a.endDate) >= now &&
          !a.deletedAt
      ) || null
    );
  }
}

class MockStudyPlanRepository extends StudyPlanRepository {
  // Sin plan configurado: el servicio usa los valores por defecto (100 créditos, 3.0)
  async findActiveByProgram(): Promise<any> {
    return null;
  }
}

class MockPracticeRepository extends PracticeRepository {
  public practices: any[] = [];

  constructor(initialPractices: any[] = []) {
    super();
    this.practices = [...initialPractices];
  }

  async findActiveByStudentId(studentId: string) {
    return (
      this.practices.find(
        (p) => p.studentId === studentId && p.isActive && !p.deletedAt
      ) || null
    );
  }
}

// ------------------------------------------------------------------------------
// SUITE PRINCIPAL DE PRUEBAS
// ------------------------------------------------------------------------------

async function runTests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 Iniciando Suite de Pruebas: Postulación de Estudiante a Vacante');
  console.log('🧪 Historia: "Como estudiante elegible, quiero postularme a una vacante');
  console.log('🧪  adjuntando mi hoja de vida, para participar en la preselección"');
  console.log('🧪 ====================================================================\n');

  // Datos base
  const eligibleStudent = {
    id: 'student-elegible-01',
    email: 'juan.perez@ufps.edu.co',
    name: 'Juan David Pérez',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    studentCode: '1152001',
    academicAverage: 4.25,
    approvedCredits: 130, // >= 100 créditos (elegible)
    tokenVersion: 1,
  };

  const nonEligibleStudentCredits = {
    id: 'student-no-creditos-02',
    email: 'maria.gomez@ufps.edu.co',
    name: 'María Gómez',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    studentCode: '1152002',
    academicAverage: 4.1,
    approvedCredits: 85, // < 100 créditos (no elegible)
    tokenVersion: 1,
  };

  const studentWithActivePractice = {
    id: 'student-con-practica-03',
    email: 'carlos.ruiz@ufps.edu.co',
    name: 'Carlos Ruiz',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    studentCode: '1152003',
    academicAverage: 3.9,
    approvedCredits: 140,
    tokenVersion: 1,
  };

  const teacherActor: AuthenticatedUser = {
    id: 'teacher-01',
    email: 'docente@ufps.edu.co',
    name: 'Docente Supervisor',
    role: 'DOCENTE_PRACTICA',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const studentActor: AuthenticatedUser = {
    id: eligibleStudent.id,
    email: eligibleStudent.email,
    name: eligibleStudent.name,
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const companyWithAgreement = {
    id: 'comp-tech-innovations',
    nit: '900123456-1',
    businessName: 'Tech Innovations Colombia S.A.S.',
    city: 'Cúcuta',
    isActive: true,
  };

  const companyWithoutAgreement = {
    id: 'comp-sin-convenio',
    nit: '900999999-9',
    businessName: 'Empresa Sin Convenio S.A.',
    city: 'Bogotá',
    isActive: true,
  };

  const validAgreement = {
    id: 'ag-001',
    companyId: companyWithAgreement.id,
    agreementNumber: 'CONV-2026-001',
    status: 'VIGENTE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2028-12-31'),
    deletedAt: null,
  };

  const publishedVacancy = {
    id: 'vac-frontend-01',
    companyId: companyWithAgreement.id,
    createdById: 'tutor-01',
    title: 'Desarrollador Frontend Junior',
    description: 'Construcción de interfaces interactivas con React y TypeScript.',
    requirements: 'Mínimo 100 créditos y experiencia con React.',
    vacanciesCount: 2,
    status: 'PUBLICADA' as VacancyStatus,
    company: companyWithAgreement,
    deletedAt: null,
  };

  const closedVacancy = {
    id: 'vac-cerrada-02',
    companyId: companyWithAgreement.id,
    createdById: 'tutor-01',
    title: 'Vacante Cerrada',
    description: 'Vacante no disponible',
    requirements: 'Sin cupos',
    vacanciesCount: 1,
    status: 'CUBIERTA' as VacancyStatus,
    company: companyWithAgreement,
    deletedAt: null,
  };

  const vacancySinConvenio = {
    id: 'vac-sin-conv-03',
    companyId: companyWithoutAgreement.id,
    createdById: 'tutor-02',
    title: 'Analista de Datos',
    description: 'Análisis de datos en empresa sin convenio',
    requirements: 'SQL y Python',
    vacanciesCount: 1,
    status: 'PUBLICADA' as VacancyStatus,
    company: companyWithoutAgreement,
    deletedAt: null,
  };

  // Repositorios Mock inicializados
  const mockUserRepo = new MockUserRepository([
    eligibleStudent,
    nonEligibleStudentCredits,
    studentWithActivePractice,
  ]);
  const mockAgreementRepo = new MockAgreementRepository([validAgreement]);
  const mockVacancyRepo = new MockVacancyRepository([
    publishedVacancy,
    closedVacancy,
    vacancySinConvenio,
  ]);
  const mockPracticeRepo = new MockPracticeRepository([
    {
      id: 'prac-existente-01',
      studentId: studentWithActivePractice.id,
      companyId: companyWithAgreement.id,
      currentStatus: 'PRACTICA_EN_EJECUCION' as PracticeStatus,
      isActive: true,
      deletedAt: null,
    },
  ]);
  const mockAppRepo = new MockApplicationRepository();

  const service = new StudentApplicationService(
    mockVacancyRepo,
    mockAppRepo,
    mockUserRepo,
    mockAgreementRepo,
    mockPracticeRepo,
    new MockStudyPlanRepository()
  );

  // ----------------------------------------------------------------------------
  // TEST 1: Verificación de Elegibilidad Estudiantil
  // ----------------------------------------------------------------------------
  console.log('📌 Test 1: Verificación de elegibilidad académica de estudiante...');
  const eligibilityEligible = await service.checkStudentEligibility(eligibleStudent.id);
  if (eligibilityEligible.isEligible && eligibilityEligible.approvedCredits === 130) {
    console.log('  ✅ PASÓ: Estudiante elegible detectado correctamente con 130 créditos y promedio 4.25');
  } else {
    throw new Error('Fallo en Test 1: El estudiante debía ser considerado elegible');
  }

  // ----------------------------------------------------------------------------
  // TEST 2 (Criterio 1): Postulación Exitosa con Hoja de Vida Adjunta
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 2 (Criterio 1): Postulación exitosa con hoja de vida adjunta (cvUrl)...');
  const validCvUrl = 'https://storage.sigetrap.co/cvs/juan_perez_cv.pdf';
  const applicationResult = await service.applyToVacancy(
    {
      vacancyId: publishedVacancy.id,
      cvUrl: validCvUrl,
      notes: 'Postulación formal para participar en la preselección empresarial',
    },
    studentActor
  );

  if (
    applicationResult.status === 'POSTULADO' &&
    applicationResult.cvUrl === validCvUrl &&
    applicationResult.practiceStatus === 'POSTULADO' &&
    mockAppRepo.applications.length === 1 &&
    mockAppRepo.practices.length === 1 &&
    mockAppRepo.history.length === 1 &&
    mockAppRepo.history[0].fromStatus === 'ASPIRANTE' &&
    mockAppRepo.history[0].toStatus === 'POSTULADO'
  ) {
    console.log('  ✅ PASÓ (Criterio 1): Postulación radicada en estado POSTULADO, práctica vinculada e histórico inmutable de auditoría creado');
  } else {
    throw new Error('Fallo en Test 2: La postulación no generó los registros esperados');
  }

  // ----------------------------------------------------------------------------
  // TEST 3 (Criterio 2): Rechazo si el estudiante NO cumple créditos requeridos
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 3 (Criterio 2): Rechazo por créditos insuficientes (< 100)...');
  try {
    const actorNoCreditos: AuthenticatedUser = {
      id: nonEligibleStudentCredits.id,
      email: nonEligibleStudentCredits.email,
      name: nonEligibleStudentCredits.name,
      role: 'ESTUDIANTE',
      status: 'ACTIVO',
      tokenVersion: 1,
    };
    await service.applyToVacancy(
      {
        vacancyId: publishedVacancy.id,
        cvUrl: 'https://storage.sigetrap.co/cvs/maria_cv.pdf',
      },
      actorNoCreditos
    );
    throw new Error('Debería haber fallado por créditos insuficientes');
  } catch (error: any) {
    if (error.code === 'STUDENT_NOT_ELIGIBLE') {
      console.log(`  ✅ PASÓ (Criterio 2): Error detectado -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 4 (Criterio 3): Rechazo si el estudiante ya tiene una práctica activa en curso
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 4 (Criterio 3): Rechazo si el estudiante ya tiene práctica en ejecución...');
  try {
    const actorConPractica: AuthenticatedUser = {
      id: studentWithActivePractice.id,
      email: studentWithActivePractice.email,
      name: studentWithActivePractice.name,
      role: 'ESTUDIANTE',
      status: 'ACTIVO',
      tokenVersion: 1,
    };
    await service.applyToVacancy(
      {
        vacancyId: publishedVacancy.id,
        cvUrl: 'https://storage.sigetrap.co/cvs/carlos_cv.pdf',
      },
      actorConPractica
    );
    throw new Error('Debería haber fallado por práctica activa previa');
  } catch (error: any) {
    if (error.code === 'STUDENT_NOT_ELIGIBLE') {
      console.log(`  ✅ PASÓ (Criterio 3): Bloqueo por práctica en curso confirmado -> [${error.code}]`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 5 (Criterio 4): Rechazo por postulación duplicada a la misma vacante
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 5 (Criterio 4): Prevención de postulación duplicada a la misma vacante...');
  try {
    await service.applyToVacancy(
      {
        vacancyId: publishedVacancy.id,
        cvUrl: 'https://storage.sigetrap.co/cvs/segundo_intento.pdf',
      },
      studentActor
    );
    throw new Error('Debería haber fallado por postulación duplicada');
  } catch (error: any) {
    if (error.code === 'DUPLICATE_APPLICATION') {
      console.log(`  ✅ PASÓ (Criterio 4): Duplicado interceptado -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 6 (Criterio 5): Rechazo si no se adjunta hoja de vida (cvUrl vacío)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 6 (Criterio 5): Rechazo si falta la hoja de vida (cvUrl)...');
  try {
    // Creamos otro estudiante elegible
    const student2 = {
      id: 'student-02',
      email: 'student2@ufps.edu.co',
      name: 'Estudiante Dos',
      role: 'ESTUDIANTE' as Role,
      status: 'ACTIVO' as UserStatus,
      isActive: true,
      studentCode: '1152004',
      academicAverage: 4.0,
      approvedCredits: 120,
      tokenVersion: 1,
    };
    mockUserRepo.users.push(student2);

    const actor2: AuthenticatedUser = {
      id: student2.id,
      email: student2.email,
      name: student2.name,
      role: 'ESTUDIANTE',
      status: 'ACTIVO',
      tokenVersion: 1,
    };

    await service.applyToVacancy(
      {
        vacancyId: publishedVacancy.id,
        cvUrl: '   ', // Vacío
      },
      actor2
    );
    throw new Error('Debería haber fallado por cvUrl vacío');
  } catch (error: any) {
    if (error.code === 'CV_REQUIRED') {
      console.log(`  ✅ PASÓ (Criterio 5): Error de CV faltante validado -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 7 (Criterio 6): Rechazo si la empresa no tiene convenio VIGENTE (RN-01)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 7 (Criterio 6): Rechazo si empresa no tiene convenio VIGENTE (RN-01)...');
  try {
    const student3 = {
      id: 'student-03',
      email: 'student3@ufps.edu.co',
      name: 'Estudiante Tres',
      role: 'ESTUDIANTE' as Role,
      status: 'ACTIVO' as UserStatus,
      isActive: true,
      studentCode: '1152005',
      academicAverage: 4.0,
      approvedCredits: 120,
      tokenVersion: 1,
    };
    mockUserRepo.users.push(student3);

    const actor3: AuthenticatedUser = {
      id: student3.id,
      email: student3.email,
      name: student3.name,
      role: 'ESTUDIANTE',
      status: 'ACTIVO',
      tokenVersion: 1,
    };

    await service.applyToVacancy(
      {
        vacancyId: vacancySinConvenio.id,
        cvUrl: 'https://storage.sigetrap.co/cvs/cv3.pdf',
      },
      actor3
    );
    throw new Error('Debería haber fallado por falta de convenio vigente');
  } catch (error: any) {
    if (error.code === 'RN01_AGREEMENT_NOT_ACTIVE') {
      console.log(`  ✅ PASÓ (Criterio 6): Validación RN-01 confirmada -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 8 (Criterio 7): Rechazo si la vacante no está abierta
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 8 (Criterio 7): Rechazo si la vacante está en estado CUBIERTA...');
  try {
    const actor3: AuthenticatedUser = {
      id: 'student-03',
      email: 'student3@ufps.edu.co',
      name: 'Estudiante Tres',
      role: 'ESTUDIANTE',
      status: 'ACTIVO',
      tokenVersion: 1,
    };

    await service.applyToVacancy(
      {
        vacancyId: closedVacancy.id,
        cvUrl: 'https://storage.sigetrap.co/cvs/cv3.pdf',
      },
      actor3
    );
    throw new Error('Debería haber fallado por vacante cerrada');
  } catch (error: any) {
    if (error.code === 'VACANCY_NOT_OPEN') {
      console.log(`  ✅ PASÓ (Criterio 7): Bloqueo de vacante no abierta confirmado -> [${error.code}]`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 9 (Criterio 8): Restricción de permisos RBAC para rol no autorizado
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 9 (Criterio 8): Restricción RBAC para Docente intentando postularse...');
  try {
    await service.applyToVacancy(
      {
        vacancyId: publishedVacancy.id,
        cvUrl: 'https://storage.sigetrap.co/cvs/docente.pdf',
      },
      teacherActor
    );
    throw new Error('Debería haber fallado por rol no autorizado');
  } catch (error: any) {
    if (error.code === 'FORBIDDEN_OPERATION') {
      console.log(`  ✅ PASÓ (Criterio 8): RBAC bloquea a no-estudiantes -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 10 (Criterio 9): Consulta de postulaciones en proceso de preselección
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 10 (Criterio 9): Consulta y trazabilidad de postulaciones del estudiante...');
  const studentApps = await service.getStudentApplications(eligibleStudent.id, studentActor);
  if (studentApps.length === 1 && studentApps[0].status === 'POSTULADO' && studentApps[0].cvUrl === validCvUrl) {
    console.log('  ✅ PASÓ (Criterio 9): Consulta exitosa de postulación en preselección empresarial con hoja de vida adjunta');
  } else {
    throw new Error('Fallo en Test 10: No se recuperaron las postulaciones del estudiante correctamente');
  }

  // ----------------------------------------------------------------------------
  // TEST 11 (Criterio 10): Verificación de Endpoint HTTP Route Handler
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 11 (Criterio 10): Prueba HTTP de POST /api/v1/vacantes/[id]/postular...');
  const studentToken = generateToken({
    userId: eligibleStudent.id,
    email: eligibleStudent.email,
    role: 'ESTUDIANTE',
    name: eligibleStudent.name,
    status: 'ACTIVO',
    tokenVersion: 1,
  });

  // Petición HTTP sin autenticación -> 401
  const reqUnauth = new NextRequest('http://localhost:3000/api/v1/vacantes/vac-1/postular', {
    method: 'POST',
    body: JSON.stringify({ cvUrl: 'https://storage.sigetrap.co/cvs/test.pdf' }),
  });
  const resUnauth = await postularRouteHandler(reqUnauth, {
    params: Promise.resolve({ id: 'vac-1' }),
  });
  if (resUnauth.status === 401) {
    console.log('  ✅ PASÓ (Criterio 10 - Auth): Endpoint retorna 401 Unauthorized sin token');
  } else {
    throw new Error(`Esperaba 401 pero recibí ${resUnauth.status}`);
  }

  // Petición HTTP con body inválido (sin cvUrl) -> 422
  const reqInvalid = new NextRequest('http://localhost:3000/api/v1/vacantes/vac-1/postular', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes: 'sin cv' }),
  });
  const resInvalid = await postularRouteHandler(reqInvalid, {
    params: Promise.resolve({ id: 'vac-1' }),
  });
  if (resInvalid.status === 422) {
    console.log('  ✅ PASÓ (Criterio 10 - Validación Zod): Endpoint retorna 422 Unprocessable Entity al omitir cvUrl');
  } else {
    throw new Error(`Esperaba 422 pero recibí ${resInvalid.status}`);
  }

  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE LA HISTORIA DE USUARIO PASARON CON ÉXITO');
  console.log('🎉 ====================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ ERROR FATAL EN PRUEBAS:', err);
  process.exit(1);
});
