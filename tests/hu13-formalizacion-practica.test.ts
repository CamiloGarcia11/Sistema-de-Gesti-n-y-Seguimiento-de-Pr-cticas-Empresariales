// ==============================================================================
// SIGETRAP - Suite de Pruebas HU13 / CU13: Formalización de la Práctica Empresarial
// Módulo / Épica: Legalización y Formalización de Prácticas
// Caso de Uso Asociado: CU13 - Formalización de la Práctica Empresarial
// Entidades BD: practicas_formativas, estudiantes, docentes_tutores, tutores_empresariales, planes_trabajo
// Restricciones SQL:
//   - chk_estado_practica (estado IN ('En Trámite', 'Formalizada', 'En Curso', 'Finalizada', 'Cancelada'))
//   - fk_practica_docente
//   - fk_practica_tutor_ext
//   - fk_practica_plan_trabajo
//   - uq_estudiante_practica_periodo
//
// Criterios de Aceptación Evaluados:
//   - Criterio 1: Formalización exitosa con requisitos completos (PU/Integración)
//                 Dado que el estudiante cuenta con tutor docente asignado, tutor externo
//                 vinculado y un plan de trabajo en estado "Aprobado", cuando el coordinador
//                 confirma la formalización de la práctica, entonces se actualiza/crea el
//                 registro en practicas_formativas con estado "Formalizada", se genera la
//                 fecha oficial de inicio y el API responde 201 Created (o 200 OK).
//   - Criterio 2: Restricción por plan de trabajo no aprobado o tutores faltantes (PU)
//                 Dado que se intenta emitir la formalización sin haber asignado ambos tutores
//                 o con el plan de trabajo pendiente de aprobación, cuando se envía la solicitud
//                 de formalización al sistema, entonces la validación de negocio/restricción de
//                 integridad falla y el API devuelve 400 Bad Request indicando que los tutores
//                 y la aprobación del plan son obligatorios para formalizar.
//   - Criterio 3: Unicidad de práctica activa por estudiante y periodo (Integración)
//                 Dado que un estudiante ya posee una práctica en estado "Formalizada" o "En Curso"
//                 en el periodo lectivo vigente, cuando se intenta legalizar un segundo registro de
//                 práctica para el mismo estudiante, entonces la base de datos rechaza la operación
//                 por restricción de unicidad (uq_estudiante_practica_periodo) y el API responde
//                 409 Conflict (o 422 Unprocessable Entity).
// ==============================================================================

import { NextRequest } from 'next/server';
import {
  PracticeFormalizationService,
  PracticeFormalizationError,
  setPracticeFormalizationServiceInstance,
} from '../src/server/services/practice-formalization.service';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import { UserRepository } from '../src/server/repositories/user.repository';
import { CompanyRepository } from '../src/server/repositories/company.repository';
import {
  AuthenticatedUser,
  Role,
  UserStatus,
  PracticeStatus,
  WorkPlanStatus,
  DOMAIN_PRACTICE_FORMALIZATION_STATUSES,
} from '../src/types';
import { POST as postFormalizarHandler, PATCH as patchFormalizarHandler } from '../src/app/api/v1/practicas/formalizar/route';
import {
  GET as getPracticeFormalizarDetailsHandler,
  POST as postPracticeIdFormalizarHandler,
  PATCH as patchPracticeIdFormalizarHandler,
} from '../src/app/api/v1/practicas/[id]/formalizar/route';
import { POST as postPracticasRootHandler } from '../src/app/api/v1/practicas/route';
import { generateToken } from '../src/lib/auth';

// ------------------------------------------------------------------------------
// MOCKS EN MEMORIA CON SIMULACIÓN DE RESTRICCIONES SQL DE POSTGRESQL
// ------------------------------------------------------------------------------

class MockUserRepository extends UserRepository {
  public users: any[] = [];

  constructor(initialUsers: any[] = []) {
    super();
    this.users = initialUsers.map((u) => ({ ...u }));
  }

  async findById(id: string) {
    return this.users.find((u) => u.id === id && !u.deletedAt) || null;
  }

  async findMany(params: { role?: Role; status?: UserStatus; search?: string; skip?: number; take?: number }) {
    let filtered = this.users.filter((u) => !u.deletedAt);
    if (params.role) filtered = filtered.filter((u) => u.role === params.role);
    if (params.status) filtered = filtered.filter((u) => u.status === params.status);
    return { users: filtered as any, total: filtered.length };
  }
}

class MockCompanyRepository extends CompanyRepository {
  public companies: any[] = [];

  constructor(initialCompanies: any[] = []) {
    super();
    this.companies = initialCompanies.map((c) => ({ ...c }));
  }

  async findById(id: string) {
    return this.companies.find((c) => c.id === id && !c.deletedAt) || null;
  }
}

class MockPracticeRepository extends PracticeRepository {
  public practices: any[] = [];
  public workPlans: any[] = [];
  public history: any[] = [];
  public usersRef: any[] = [];
  public companiesRef: any[] = [];

  constructor(
    initialPractices: any[] = [],
    initialWorkPlans: any[] = [],
    usersRef: any[] = [],
    companiesRef: any[] = []
  ) {
    super();
    this.practices = initialPractices.map((p) => ({ ...p }));
    this.workPlans = initialWorkPlans.map((wp) => ({ ...wp }));
    this.usersRef = usersRef;
    this.companiesRef = companiesRef;
  }

  async findById(practiceId: string) {
    const p = this.practices.find((item) => item.id === practiceId && !item.deletedAt);
    if (!p) return null;

    const student = this.usersRef.find((u) => u.id === p.studentId) || null;
    const teacher = this.usersRef.find((u) => u.id === p.teacherId) || null;
    const tutor = this.usersRef.find((u) => u.id === p.tutorId) || null;
    const company = this.companiesRef.find((c) => c.id === p.companyId) || null;
    const workPlan = this.workPlans.find((wp) => wp.practiceId === p.id) || p.workPlan || null;

    return {
      ...p,
      student,
      teacher,
      tutor,
      company,
      workPlan,
      statusHistory: this.history.filter((h) => h.practiceId === p.id),
    } as any;
  }

  async findWorkPlanById(workPlanId: string) {
    return this.workPlans.find((wp) => wp.id === workPlanId) || null;
  }

  async findWorkPlanByPracticeId(practiceId: string) {
    return this.workPlans.find((wp) => wp.practiceId === practiceId) || null;
  }

  async findActiveFormalizedOrInCourseByStudentAndPeriod(params: {
    studentId: string;
    academicPeriod: string;
    excludePracticeId?: string;
  }) {
    const normalizedPeriod = (params.academicPeriod || '2026-1').trim();
    return (
      this.practices.find((p) => {
        if (p.deletedAt || p.isActive === false) return false;
        if (p.studentId !== params.studentId) return false;
        if (params.excludePracticeId && p.id === params.excludePracticeId) return false;

        const isActiveFormalizedOrInCourse =
          p.currentStatus === 'ASIGNADO_FORMALMENTE' ||
          p.currentStatus === 'PRACTICA_EN_EJECUCION' ||
          p.currentStatus === 'EVALUACION_PENDIENTE' ||
          p.estado === 'Formalizada' ||
          p.estado === 'En Curso';

        if (!isActiveFormalizedOrInCourse) return false;

        const pPeriod = (p.academicPeriod || p.periodoLectivo || '2026-1').trim();
        return pPeriod === normalizedPeriod;
      }) || null
    );
  }

  async saveFormalizedPractice(params: {
    practiceId?: string;
    studentId: string;
    companyId: string;
    vacancyId?: string | null;
    teacherId: string;
    tutorId: string;
    directorId: string;
    academicPeriod: string;
    targetInternalStatus: PracticeStatus;
    targetDomainStatus: string;
    startDate: Date;
    endDate?: Date | null;
    totalHoursRequired?: number;
    arlSupportUrl?: string | null;
    presentationLetterUrl?: string | null;
    notes?: string;
    workPlanData?: {
      id?: string;
      objectives: string;
      methodology: string;
      schedule: any;
      documentUrl?: string | null;
      status: WorkPlanStatus;
      tutorApproved: boolean;
      teacherApproved: boolean;
      feedback?: string | null;
    };
  }) {
    // 1. Simular restricción SQL chk_estado_practica
    if (
      !DOMAIN_PRACTICE_FORMALIZATION_STATUSES.includes(params.targetDomainStatus as any)
    ) {
      const err: any = new Error(
        'new row for relation "practicas_formativas" violates check constraint "chk_estado_practica"'
      );
      err.code = '23514';
      err.constraint = 'chk_estado_practica';
      throw err;
    }

    // 2. Simular restricción SQL fk_practica_docente
    const teacher = this.usersRef.find(
      (u) => u.id === params.teacherId && u.role === 'DOCENTE_PRACTICA' && !u.deletedAt
    );
    if (!teacher) {
      const err: any = new Error(
        'insert or update on table "practicas_formativas" violates foreign key constraint "fk_practica_docente"'
      );
      err.code = '23503';
      err.constraint = 'fk_practica_docente';
      throw err;
    }

    // 3. Simular restricción SQL fk_practica_tutor_ext
    const tutor = this.usersRef.find(
      (u) => u.id === params.tutorId && u.role === 'TUTOR_EMPRESARIAL' && !u.deletedAt
    );
    if (!tutor) {
      const err: any = new Error(
        'insert or update on table "practicas_formativas" violates foreign key constraint "fk_practica_tutor_ext"'
      );
      err.code = '23503';
      err.constraint = 'fk_practica_tutor_ext';
      throw err;
    }

    // 4. Simular restricción SQL uq_estudiante_practica_periodo
    if (
      params.targetDomainStatus === 'Formalizada' ||
      params.targetDomainStatus === 'En Curso'
    ) {
      const duplicate = await this.findActiveFormalizedOrInCourseByStudentAndPeriod({
        studentId: params.studentId,
        academicPeriod: params.academicPeriod,
        excludePracticeId: params.practiceId,
      });

      if (duplicate) {
        const err: any = new Error(
          'duplicate key value violates unique constraint "uq_estudiante_practica_periodo"'
        );
        err.code = '23505';
        err.constraint = 'uq_estudiante_practica_periodo';
        throw err;
      }
    }

    let practice = params.practiceId
      ? this.practices.find((p) => p.id === params.practiceId)
      : null;
    let isNew = false;

    if (practice) {
      practice.teacherId = params.teacherId;
      practice.tutorId = params.tutorId;
      practice.directorId = params.directorId;
      practice.currentStatus = params.targetInternalStatus;
      practice.estado = params.targetDomainStatus;
      practice.academicPeriod = params.academicPeriod;
      practice.periodoLectivo = params.academicPeriod;
      practice.startDate = params.startDate;
      practice.fechaInicio = params.startDate;
      if (params.endDate !== undefined) practice.endDate = params.endDate;
      if (params.totalHoursRequired) practice.totalHoursRequired = params.totalHoursRequired;
      practice.isActive = true;
      practice.updatedAt = new Date();
    } else {
      isNew = true;
      practice = {
        id: `pract_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        studentId: params.studentId,
        companyId: params.companyId,
        vacancyId: params.vacancyId || null,
        teacherId: params.teacherId,
        tutorId: params.tutorId,
        directorId: params.directorId,
        currentStatus: params.targetInternalStatus,
        estado: params.targetDomainStatus,
        academicPeriod: params.academicPeriod,
        periodoLectivo: params.academicPeriod,
        startDate: params.startDate,
        fechaInicio: params.startDate,
        endDate: params.endDate || null,
        totalHoursRequired: params.totalHoursRequired || 320,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      this.practices.push(practice);
    }

    let workPlan = this.workPlans.find((wp) => wp.practiceId === practice.id);
    if (params.workPlanData) {
      if (workPlan) {
        workPlan.objectives = params.workPlanData.objectives;
        workPlan.methodology = params.workPlanData.methodology;
        workPlan.schedule = params.workPlanData.schedule;
        workPlan.status = params.workPlanData.status;
        workPlan.estado = 'Aprobado';
        workPlan.tutorApproved = params.workPlanData.tutorApproved;
        workPlan.teacherApproved = params.workPlanData.teacherApproved;
        workPlan.updatedAt = new Date();
      } else {
        workPlan = {
          id: params.workPlanData.id || `wp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          practiceId: practice.id,
          objectives: params.workPlanData.objectives,
          methodology: params.workPlanData.methodology,
          schedule: params.workPlanData.schedule,
          status: params.workPlanData.status,
          estado: 'Aprobado',
          tutorApproved: params.workPlanData.tutorApproved,
          teacherApproved: params.workPlanData.teacherApproved,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.workPlans.push(workPlan);
      }
    }

    const fullPractice = await this.findById(practice.id);
    return {
      practice: fullPractice || practice,
      workPlan,
      isNew,
    };
  }
}

// ------------------------------------------------------------------------------
// EJECUCIÓN DE SUITE DE PRUEBAS HU13 / CU13
// ------------------------------------------------------------------------------

async function runHU13Tests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 SIGETRAP - Suite de Pruebas: Legalización y Formalización de Prácticas');
  console.log('🧪 Caso de Uso: CU13 (HU13) - Formalización de la Práctica Empresarial');
  console.log('🧪 ====================================================================\n');

  // 1. Datos Semilla de Entidades BD:
  //    empresas, estudiantes, docentes_tutores, tutores_empresariales, planes_trabajo, practicas_formativas
  const companyTech = {
    id: 'company-tech-001',
    nit: '900123456-1',
    businessName: 'Tech Innovations Colombia S.A.S.',
    city: 'Cúcuta',
    isActive: true,
    deletedAt: null,
  };

  // Coordinador (Director de Programa)
  const coordinatorActor: AuthenticatedUser = {
    id: 'coord-director-001',
    email: 'coordinador.practicas@ufps.edu.co',
    name: 'Dr. Roberto Gómez (Coordinador de Prácticas)',
    role: 'DIRECTOR_PROGRAMA',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  // Tutor Docente en docentes_tutores (fk_practica_docente)
  const teacherTutorUser = {
    id: 'docente-tutor-001',
    email: 'laura.restrepo@ufps.edu.co',
    name: 'Ing. Laura Restrepo (Tutor Docente)',
    documentType: 'CC',
    documentNumber: '1020304050',
    role: 'DOCENTE_PRACTICA' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    program: 'Ingeniería de Sistemas',
    deletedAt: null,
  };

  // Tutor Externo en tutores_empresariales (fk_practica_tutor_ext)
  const externalTutorUser = {
    id: 'tutor-externo-001',
    email: 'andres.silva@techinnovations.co',
    name: 'Ing. Andrés Silva (Tutor Externo)',
    documentType: 'CC',
    documentNumber: '1030405060',
    role: 'TUTOR_EMPRESARIAL' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    program: 'Arquitecto de Software Senior',
    companyId: companyTech.id,
    deletedAt: null,
  };

  // Estudiante 1: Con todos los requisitos completos (para Criterio 1 y Criterio 3)
  const student1 = {
    id: 'estudiante-001',
    email: 'juan.perez@ufps.edu.co',
    name: 'Juan David Pérez',
    documentType: 'CC',
    documentNumber: '1090123456',
    studentCode: '1152001',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    program: 'Ingeniería de Sistemas',
    approvedCredits: 135,
    academicAverage: 4.3,
    deletedAt: null,
  };

  // Estudiante 2: Con requisitos incompletos (para Criterio 2)
  const student2 = {
    id: 'estudiante-002',
    email: 'maria.lopez@ufps.edu.co',
    name: 'María Fernanda López',
    documentType: 'CC',
    documentNumber: '1090654321',
    studentCode: '1152002',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    program: 'Ingeniería de Sistemas',
    approvedCredits: 128,
    academicAverage: 4.1,
    deletedAt: null,
  };

  // Estudiante 3: Con práctica ya "En Curso" en el periodo vigente 2026-1 (para Criterio 3)
  const student3InCourse = {
    id: 'estudiante-003',
    email: 'carlos.ramirez@ufps.edu.co',
    name: 'Carlos Andrés Ramírez',
    documentType: 'CC',
    documentNumber: '1090777888',
    studentCode: '1152003',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    program: 'Ingeniería de Sistemas',
    approvedCredits: 140,
    academicAverage: 4.4,
    deletedAt: null,
  };

  // Práctica en trámite de Estudiante 1 con Tutor Docente, Tutor Externo y Plan de Trabajo "Aprobado"
  const practiceStudent1EnTramite = {
    id: 'practica-est1-001',
    studentId: student1.id,
    companyId: companyTech.id,
    teacherId: teacherTutorUser.id,
    tutorId: externalTutorUser.id,
    directorId: coordinatorActor.id,
    currentStatus: 'ACEPTADO_ARL_PENDIENTE' as PracticeStatus,
    estado: 'En Trámite',
    academicPeriod: '2026-1',
    startDate: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const approvedWorkPlanStudent1 = {
    id: 'plan-trabajo-est1-001',
    practiceId: practiceStudent1EnTramite.id,
    objectives: 'Implementar microservicios de trazabilidad académica y pruebas automatizadas.',
    methodology: 'Metodología ágil Scrum con entregas quincenales.',
    schedule: [{ semana: '1-16', actividad: 'Desarrollo de plataforma' }],
    status: 'APROBADO_DUAL' as WorkPlanStatus,
    estado: 'Aprobado',
    tutorApproved: true,
    teacherApproved: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Práctica de Estudiante 3 que ya está "En Curso" en el periodo 2026-1
  const practiceStudent3EnCurso = {
    id: 'practica-est3-activa',
    studentId: student3InCourse.id,
    companyId: companyTech.id,
    teacherId: teacherTutorUser.id,
    tutorId: externalTutorUser.id,
    directorId: coordinatorActor.id,
    currentStatus: 'PRACTICA_EN_EJECUCION' as PracticeStatus,
    estado: 'En Curso',
    academicPeriod: '2026-1',
    startDate: new Date(),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Inicializar repositorios y servicio mock
  const mockUserRepo = new MockUserRepository([
    coordinatorActor,
    teacherTutorUser,
    externalTutorUser,
    student1,
    student2,
    student3InCourse,
  ]);
  const mockCompanyRepo = new MockCompanyRepository([companyTech]);
  const mockPracticeRepo = new MockPracticeRepository(
    [practiceStudent1EnTramite, practiceStudent3EnCurso],
    [approvedWorkPlanStudent1],
    mockUserRepo.users,
    mockCompanyRepo.companies
  );

  const service = new PracticeFormalizationService(
    mockPracticeRepo,
    mockUserRepo,
    mockCompanyRepo
  );
  setPracticeFormalizationServiceInstance(service);

  const coordinatorToken = generateToken({
    userId: coordinatorActor.id,
    email: coordinatorActor.email,
    role: coordinatorActor.role,
    name: coordinatorActor.name,
    status: coordinatorActor.status,
    tokenVersion: 1,
  });

  // ==========================================================================
  // TEST 1: Criterio 1 - Formalización exitosa con requisitos completos (PU/Integración)
  // ==========================================================================
  console.log(
    '📌 Test 1 (Criterio 1 - PU/Integración): Formalización exitosa con tutor docente, tutor externo y plan de trabajo "Aprobado"...'
  );

  const reqFormalizeSuccess = new NextRequest(
    `http://localhost:3000/api/v1/practicas/${practiceStudent1EnTramite.id}/formalizar`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estudianteId: student1.id,
        docenteTutorId: teacherTutorUser.id,
        tutorExternoId: externalTutorUser.id,
        planTrabajoId: approvedWorkPlanStudent1.id,
        estadoPlanTrabajo: 'Aprobado',
        periodoLectivo: '2026-1',
      }),
    }
  );

  const resFormalizeSuccess = await postPracticeIdFormalizarHandler(reqFormalizeSuccess, {
    params: Promise.resolve({ id: practiceStudent1EnTramite.id }),
  });
  const resFormalizeJson = await resFormalizeSuccess.json();

  if (
    resFormalizeSuccess.status === 201 &&
    resFormalizeJson.success === true &&
    resFormalizeJson.data?.estado === 'Formalizada' &&
    resFormalizeJson.data?.docenteTutorId === teacherTutorUser.id &&
    resFormalizeJson.data?.tutorExternoId === externalTutorUser.id &&
    resFormalizeJson.data?.workPlan?.estado === 'Aprobado' &&
    Boolean(resFormalizeJson.data?.fechaInicio)
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1): Práctica formalizada en practicas_formativas con estado '${resFormalizeJson.data.estado}', fecha oficial de inicio '${resFormalizeJson.data.fechaInicio}' -> [HTTP ${resFormalizeSuccess.status} Created]`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 1: Se esperaba 201 Created con estado 'Formalizada' y fecha oficial de inicio. Recibido: ${resFormalizeSuccess.status} ${JSON.stringify(resFormalizeJson)}`
    );
  }

  // ==========================================================================
  // TEST 2: Criterio 2 - Restricción por falta de Tutor Docente (fk_practica_docente -> 400 Bad Request)
  // ==========================================================================
  console.log(
    '\n📌 Test 2 (Criterio 2 - PU): Intento de formalización sin haber asignado Tutor Docente (fk_practica_docente -> 400 Bad Request)...'
  );

  const reqMissingTeacher = new NextRequest(
    'http://localhost:3000/api/v1/practicas/formalizar',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estudianteId: student2.id,
        empresaId: companyTech.id,
        docenteTutorId: null, // Sin tutor docente asignado
        tutorExternoId: externalTutorUser.id,
        estadoPlanTrabajo: 'Aprobado',
        periodoLectivo: '2026-1',
      }),
    }
  );

  const resMissingTeacher = await postFormalizarHandler(reqMissingTeacher);
  const resMissingTeacherJson = await resMissingTeacher.json();

  if (
    resMissingTeacher.status === 400 &&
    resMissingTeacherJson.success === false &&
    resMissingTeacherJson.error?.details?.constraint === 'fk_practica_docente' &&
    resMissingTeacherJson.error?.message?.toLowerCase().includes('obligatorios para formalizar')
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 2 - Sin Tutor Docente): Rechazo por '${resMissingTeacherJson.error.details.constraint}' -> [HTTP ${resMissingTeacher.status} Bad Request] ${resMissingTeacherJson.error.message}`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 2: Se esperaba 400 Bad Request con fk_practica_docente. Recibido: ${resMissingTeacher.status} ${JSON.stringify(resMissingTeacherJson)}`
    );
  }

  // ==========================================================================
  // TEST 3: Criterio 2 - Restricción por falta de Tutor Externo (fk_practica_tutor_ext -> 400 Bad Request)
  // ==========================================================================
  console.log(
    '\n📌 Test 3 (Criterio 2 - PU): Intento de formalización sin haber vinculado Tutor Externo (fk_practica_tutor_ext -> 400 Bad Request)...'
  );

  const reqMissingExternalTutor = new NextRequest(
    'http://localhost:3000/api/v1/practicas/formalizar',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estudianteId: student2.id,
        empresaId: companyTech.id,
        docenteTutorId: teacherTutorUser.id,
        tutorExternoId: null, // Sin tutor externo vinculado
        estadoPlanTrabajo: 'Aprobado',
        periodoLectivo: '2026-1',
      }),
    }
  );

  const resMissingExternalTutor = await postFormalizarHandler(reqMissingExternalTutor);
  const resMissingExternalTutorJson = await resMissingExternalTutor.json();

  if (
    resMissingExternalTutor.status === 400 &&
    resMissingExternalTutorJson.success === false &&
    resMissingExternalTutorJson.error?.details?.constraint === 'fk_practica_tutor_ext' &&
    resMissingExternalTutorJson.error?.message?.toLowerCase().includes('obligatorios para formalizar')
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 2 - Sin Tutor Externo): Rechazo por '${resMissingExternalTutorJson.error.details.constraint}' -> [HTTP ${resMissingExternalTutor.status} Bad Request] ${resMissingExternalTutorJson.error.message}`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 3: Se esperaba 400 Bad Request con fk_practica_tutor_ext. Recibido: ${resMissingExternalTutor.status} ${JSON.stringify(resMissingExternalTutorJson)}`
    );
  }

  // ==========================================================================
  // TEST 4: Criterio 2 - Restricción por Plan de Trabajo pendiente de aprobación (fk_practica_plan_trabajo -> 400 Bad Request)
  // ==========================================================================
  console.log(
    '\n📌 Test 4 (Criterio 2 - PU): Intento de formalización con Plan de Trabajo pendiente de aprobación (fk_practica_plan_trabajo -> 400 Bad Request)...'
  );

  const reqPendingPlan = new NextRequest(
    'http://localhost:3000/api/v1/practicas/formalizar',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estudianteId: student2.id,
        empresaId: companyTech.id,
        docenteTutorId: teacherTutorUser.id,
        tutorExternoId: externalTutorUser.id,
        planTrabajo: {
          estado: 'Pendiente', // Plan pendiente de aprobación
          objetivos: 'Objetivos en borrador',
        },
        periodoLectivo: '2026-1',
      }),
    }
  );

  const resPendingPlan = await postFormalizarHandler(reqPendingPlan);
  const resPendingPlanJson = await resPendingPlan.json();

  if (
    resPendingPlan.status === 400 &&
    resPendingPlanJson.success === false &&
    resPendingPlanJson.error?.details?.constraint === 'fk_practica_plan_trabajo' &&
    resPendingPlanJson.error?.message?.toLowerCase().includes('obligatorios para formalizar')
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 2 - Plan No Aprobado): Rechazo por '${resPendingPlanJson.error.details.constraint}' -> [HTTP ${resPendingPlan.status} Bad Request] ${resPendingPlanJson.error.message}`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 4: Se esperaba 400 Bad Request con fk_practica_plan_trabajo. Recibido: ${resPendingPlan.status} ${JSON.stringify(resPendingPlanJson)}`
    );
  }

  // ==========================================================================
  // TEST 5: Criterio 3 - Unicidad de práctica activa por estudiante y periodo (uq_estudiante_practica_periodo -> 409 Conflict)
  // Caso 5.1: Estudiante 1 ya posee una práctica en estado "Formalizada" en el periodo 2026-1 (formalizada en Test 1)
  // ==========================================================================
  console.log(
    '\n📌 Test 5 (Criterio 3 - Integración): Rechazo de segundo registro de práctica para estudiante con práctica "Formalizada" en el periodo vigente (uq_estudiante_practica_periodo -> 409 Conflict)...'
  );

  const reqDuplicateFormalized = new NextRequest(
    'http://localhost:3000/api/v1/practicas/formalizar',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estudianteId: student1.id, // Ya tiene práctica Formalizada en 2026-1
        empresaId: companyTech.id,
        docenteTutorId: teacherTutorUser.id,
        tutorExternoId: externalTutorUser.id,
        estadoPlanTrabajo: 'Aprobado',
        periodoLectivo: '2026-1',
      }),
    }
  );

  const resDuplicateFormalized = await postFormalizarHandler(reqDuplicateFormalized);
  const resDuplicateFormalizedJson = await resDuplicateFormalized.json();

  if (
    resDuplicateFormalized.status === 409 &&
    resDuplicateFormalizedJson.success === false &&
    resDuplicateFormalizedJson.error?.details?.constraint === 'uq_estudiante_practica_periodo'
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 3 - Práctica ya Formalizada): Operación rechazada por restricción '${resDuplicateFormalizedJson.error.details.constraint}' -> [HTTP ${resDuplicateFormalized.status} Conflict] ${resDuplicateFormalizedJson.error.message}`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 5: Se esperaba 409 Conflict con uq_estudiante_practica_periodo. Recibido: ${resDuplicateFormalized.status} ${JSON.stringify(resDuplicateFormalizedJson)}`
    );
  }

  // ==========================================================================
  // TEST 6: Criterio 3 - Unicidad cuando el estudiante ya posee una práctica "En Curso" en el periodo vigente (409 Conflict)
  // ==========================================================================
  console.log(
    '\n📌 Test 6 (Criterio 3 - Integración): Rechazo de segundo registro de práctica para estudiante con práctica "En Curso" en el periodo vigente (uq_estudiante_practica_periodo -> 409 Conflict)...'
  );

  const reqDuplicateInCourse = new NextRequest(
    'http://localhost:3000/api/v1/practicas',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estudianteId: student3InCourse.id, // Ya tiene práctica En Curso en 2026-1
        empresaId: companyTech.id,
        docenteTutorId: teacherTutorUser.id,
        tutorExternoId: externalTutorUser.id,
        estadoPlanTrabajo: 'Aprobado',
        periodoLectivo: '2026-1',
      }),
    }
  );

  const resDuplicateInCourse = await postPracticasRootHandler(reqDuplicateInCourse);
  const resDuplicateInCourseJson = await resDuplicateInCourse.json();

  if (
    resDuplicateInCourse.status === 409 &&
    resDuplicateInCourseJson.success === false &&
    resDuplicateInCourseJson.error?.details?.constraint === 'uq_estudiante_practica_periodo'
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 3 - Práctica ya En Curso): Operación rechazada por restricción '${resDuplicateInCourseJson.error.details.constraint}' -> [HTTP ${resDuplicateInCourse.status} Conflict] ${resDuplicateInCourseJson.error.message}`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 6: Se esperaba 409 Conflict con uq_estudiante_practica_periodo. Recibido: ${resDuplicateInCourse.status} ${JSON.stringify(resDuplicateInCourseJson)}`
    );
  }

  // ==========================================================================
  // TEST 7: Restricción SQL chk_estado_practica (Estado fuera del dominio permitido -> 400 Bad Request)
  // ==========================================================================
  console.log(
    '\n📌 Test 7 (Restricción SQL chk_estado_practica): Rechazo de estado no permitido por chk_estado_practica...'
  );

  try {
    await service.formalizePractice(
      {
        estudianteId: student2.id,
        empresaId: companyTech.id,
        docenteTutorId: teacherTutorUser.id,
        tutorExternoId: externalTutorUser.id,
        estadoPlanTrabajo: 'Aprobado',
        estado: 'Estado_Invalido_XYZ',
      },
      coordinatorActor
    );
    throw new Error('Se esperaba fallo por chk_estado_practica');
  } catch (error: any) {
    if (
      error instanceof PracticeFormalizationError &&
      error.statusCode === 400 &&
      error.constraint === 'chk_estado_practica'
    ) {
      console.log(
        `  ✅ PASÓ (chk_estado_practica): Estado inválido bloqueado -> [HTTP ${error.statusCode}] ${error.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 7: ${error.message}`);
    }
  }

  // ==========================================================================
  // TEST 8: Emisión y creación directa en practicas_formativas para Estudiante 2 cuando completa requisitos (201 Created / 200 OK)
  // ==========================================================================
  console.log(
    '\n📌 Test 8 (Criterio 1 - Creación directa y actualización PATCH): Formalización de Estudiante 2 al completar requisitos...'
  );

  const reqCreateStudent2 = new NextRequest(
    'http://localhost:3000/api/v1/practicas/formalizar',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estudianteId: student2.id,
        empresaId: companyTech.id,
        docenteTutorId: teacherTutorUser.id,
        tutorExternoId: externalTutorUser.id,
        planTrabajo: {
          estado: 'Aprobado',
          objetivos: 'Automatización de despliegue continuo y pruebas de integración.',
          metodologia: 'DevSecOps e integración continua.',
        },
        periodoLectivo: '2026-1',
      }),
    }
  );

  const resCreateStudent2 = await postFormalizarHandler(reqCreateStudent2);
  const resCreateStudent2Json = await resCreateStudent2.json();

  if (
    resCreateStudent2.status === 201 &&
    resCreateStudent2Json.data?.estado === 'Formalizada' &&
    resCreateStudent2Json.data?.isNew === true
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1 - Creación): Nuevo registro emitido en practicas_formativas con ID '${resCreateStudent2Json.data.id}', estado '${resCreateStudent2Json.data.estado}' y fecha de inicio '${resCreateStudent2Json.data.fechaInicio}' -> [HTTP 201 Created]`
    );
  } else {
    throw new Error(`❌ FALLÓ Test 8: ${JSON.stringify(resCreateStudent2Json)}`);
  }

  // Verificación de consulta GET /api/v1/practicas/[id]/formalizar
  const reqGetDetails = new NextRequest(
    `http://localhost:3000/api/v1/practicas/${resCreateStudent2Json.data.id}/formalizar`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
      },
    }
  );
  const resGetDetails = await getPracticeFormalizarDetailsHandler(reqGetDetails, {
    params: Promise.resolve({ id: resCreateStudent2Json.data.id }),
  });
  const resGetDetailsJson = await resGetDetails.json();

  if (
    resGetDetails.status === 200 &&
    resGetDetailsJson.data?.estado === 'Formalizada' &&
    resGetDetailsJson.data?.requirementsChecklist?.canFormalize === true
  ) {
    console.log(
      '  ✅ PASÓ (GET /api/v1/practicas/[id]/formalizar): Consulta de expediente y checklist de formalización verificada -> [HTTP 200 OK]'
    );
  } else {
    throw new Error(`❌ FALLÓ consulta GET details: ${JSON.stringify(resGetDetailsJson)}`);
  }

  // ==========================================================================
  // TEST 9: Seguridad RBAC (Bloqueo a roles no autorizados y peticiones sin sesión)
  // ==========================================================================
  console.log('\n📌 Test 9 (RBAC): Bloqueo a rol ESTUDIANTE (403) y petición sin token (401)...');

  const studentActor: AuthenticatedUser = {
    id: student1.id,
    email: student1.email,
    name: student1.name,
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  try {
    await service.formalizePractice(
      {
        estudianteId: student1.id,
        empresaId: companyTech.id,
        docenteTutorId: teacherTutorUser.id,
        tutorExternoId: externalTutorUser.id,
        estadoPlanTrabajo: 'Aprobado',
      },
      studentActor
    );
    throw new Error('Se esperaba bloqueo RBAC a estudiante');
  } catch (error: any) {
    if (error.statusCode === 403 && error.code === 'FORBIDDEN_OPERATION') {
      console.log('  ✅ PASÓ (RBAC - 403): Estudiante bloqueado al intentar formalizar práctica.');
    } else {
      throw error;
    }
  }

  const reqUnauth = new NextRequest('http://localhost:3000/api/v1/practicas/formalizar', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const resUnauth = await postFormalizarHandler(reqUnauth);
  if (resUnauth.status === 401) {
    console.log('  ✅ PASÓ (Auth - 401): Petición sin sesión rechazada con 401 Unauthorized.');
  } else {
    throw new Error(`Se esperaba 401 y se obtuvo ${resUnauth.status}`);
  }

  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE HU13 / CU13 (FORMALIZACIÓN DE PRÁCTICA) PASARON CON ÉXITO');
  console.log('🎉 ====================================================================');
}

runHU13Tests().catch((error) => {
  console.error('\n❌ Error ejecutando la suite de pruebas HU13 / CU13:', error);
  process.exit(1);
});
