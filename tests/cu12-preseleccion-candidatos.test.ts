// ==============================================================================
// SIGETRAP - Test de Verificación CU12: Preselección y Aceptación de Candidatos
// Módulo / Épica: Selección y Admisión de Practicantes
// Caso de Uso: CU12 - Preselección y Aceptación de Candidatos
//
// Criterios de Aceptación Evaluados:
//   - Criterio 1: Actualización válida de estado de postulación (PU/Integración)
//                 Dado que un reclutador evalúa la hoja de vida de un estudiante con
//                 postulación en estado "En Revisión", cuando selecciona y envía el
//                 cambio de estado a "Preseleccionado" o "Aceptado", entonces el registro
//                 se actualiza en la tabla postulaciones con el nuevo estado, se registra
//                 la fecha/usuario de modificación y el API responde 200 OK.
//   - Criterio 2: Validación de transición o estado no permitido (PU)
//                 Dado que se envía una solicitud de actualización con un valor de estado
//                 no contemplado en el flujo de negocio (o fuera del dominio permitido),
//                 cuando se intenta ejecutar la actualización en la base de datos,
//                 entonces la validación falla por la restricción chk_estado_postulacion
//                 y el API devuelve 400 Bad Request indicando estado de postulación no válido.
//   - Criterio 3: Bloqueo de admisión si se supera el cupo de la plaza (Integración)
//                 Dado que una plaza de práctica ya ha alcanzado el número máximo de
//                 vacantes con estudiantes en estado "Aceptado", cuando el reclutador intenta
//                 marcar a un nuevo candidato como "Aceptado", entonces el sistema bloquea
//                 la operación y el API devuelve 422 Unprocessable Entity informando que
//                 el cupo de vacantes para dicha plaza ha sido completado.
//   - Criterios Adicionales: RBAC, Multitenancy empresarial, Evaluación de CV, Rechazo con motivo
//                            y verificación de endpoints HTTP Route Handler (GET y PATCH).
// ==============================================================================

import { NextRequest } from 'next/server';
import {
  CandidateSelectionService,
  CandidateSelectionError,
  setCandidateSelectionServiceInstance,
} from '../src/server/services/candidate-selection.service';
import { ApplicationRepository } from '../src/server/repositories/application.repository';
import { VacancyRepository } from '../src/server/repositories/vacancy.repository';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import {
  AuthenticatedUser,
  Role,
  UserStatus,
  PracticeStatus,
  PostulacionEstadoDomain,
} from '../src/types';
import { PATCH, GET } from '../src/app/api/v1/postulaciones/[id]/route';
import { generateToken } from '../src/lib/auth';

// ------------------------------------------------------------------------------
// MOCKS EN MEMORIA
// ------------------------------------------------------------------------------

class MockApplicationRepository extends ApplicationRepository {
  public applications: any[] = [];
  public practices: any[] = [];
  public statusHistory: any[] = [];

  constructor(initialApps: any[] = []) {
    super();
    this.applications = initialApps.map((a) => ({ ...a }));
  }

  async findById(id: string) {
    const app = this.applications.find((a) => a.id === id && !a.deletedAt);
    if (!app) return null;

    const practice = this.practices.find((p) => p.applicationId === app.id) || null;

    return {
      ...app,
      practice,
      student: app.student || {
        id: app.studentId,
        name: 'Estudiante Prueba',
        email: 'estudiante@ufps.edu.co',
        studentCode: '1152001',
        program: 'Ingeniería de Sistemas',
      },
      vacancy: app.vacancy || {
        id: app.vacancyId,
        title: 'Desarrollador Frontend',
        companyId: 'company-001',
        company: {
          id: 'company-001',
          businessName: 'Tech Innovations Colombia S.A.S.',
        },
      },
      updatedBy: app.updatedById
        ? {
            id: app.updatedById,
            name: 'Reclutador Tech',
            email: 'recruiter@techinnovations.co',
            role: 'TUTOR_EMPRESARIAL',
          }
        : null,
    };
  }

  async countAcceptedByVacancyId(vacancyId: string): Promise<number> {
    return this.applications.filter(
      (a) =>
        a.vacancyId === vacancyId &&
        !a.deletedAt &&
        (a.status === 'Aceptado' || a.status === 'ACEPTADO')
    ).length;
  }

  async updateApplicationStatus(params: {
    applicationId: string;
    status: string;
    updatedById: string;
    rejectionReason?: string | null;
  }) {
    const app = this.applications.find((a) => a.id === params.applicationId);
    if (!app) throw new Error('Application not found');

    // Simulación de la restricción SQL chk_estado_postulacion
    const allowedByConstraint = [
      'Pendiente',
      'En Revisión',
      'Preseleccionado',
      'Aceptado',
      'Rechazado',
      'POSTULADO',
      'PRESENTADO',
      'ACEPTADO',
      'RECHAZADO',
      'CANCELADO',
      'EN_REVISION',
      'PRESELECCIONADO',
    ];

    if (!allowedByConstraint.includes(params.status)) {
      const err: any = new Error(
        `new row for relation "applications" violates check constraint "chk_estado_postulacion"`
      );
      err.code = '23514'; // PostgreSQL check constraint violation
      err.constraint = 'chk_estado_postulacion';
      throw err;
    }

    app.status = params.status;
    app.updatedById = params.updatedById;
    app.updatedAt = new Date();
    if (params.rejectionReason !== undefined) {
      app.rejectionReason = params.rejectionReason;
    }

    return this.findById(app.id) as any;
  }
}

class MockVacancyRepository extends VacancyRepository {
  public vacancies: any[] = [];

  constructor(initialVacancies: any[] = []) {
    super();
    this.vacancies = initialVacancies.map((v) => ({ ...v }));
  }

  async findById(id: string) {
    const v = this.vacancies.find((item) => item.id === id && !item.deletedAt);
    if (!v) return null;
    return { ...v };
  }

  async updateStatus(id: string, status: any) {
    const v = this.vacancies.find((item) => item.id === id);
    if (v) v.status = status;
    return v;
  }
}

class MockPracticeRepository extends PracticeRepository {
  public practices: any[] = [];
  public history: any[] = [];

  constructor(initialPractices: any[] = []) {
    super();
    this.practices = initialPractices.map((p) => ({ ...p }));
  }

  async executeStatusTransition(params: {
    practiceId: string;
    fromStatus: PracticeStatus;
    toStatus: PracticeStatus;
    changedByUserId: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }) {
    const practice = this.practices.find((p) => p.id === params.practiceId);
    if (!practice) throw new Error('Practice not found');

    practice.currentStatus = params.toStatus;
    practice.updatedAt = new Date();

    const historyEntry = {
      id: `hist_${Date.now()}_${Math.random()}`,
      practiceId: practice.id,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      changedByUserId: params.changedByUserId,
      notes: params.notes,
      metadata: params.metadata,
      createdAt: new Date(),
    };
    this.history.push(historyEntry);

    return {
      practice,
      historyEntry,
    };
  }
}

// ------------------------------------------------------------------------------
// SUITE PRINCIPAL DE PRUEBAS
// ------------------------------------------------------------------------------

async function runCU12Tests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 SIGETRAP - Suite de Pruebas: Selección y Admisión de Practicantes');
  console.log('🧪 Caso de Uso: CU12 - Preselección y Aceptación de Candidatos');
  console.log('🧪 ====================================================================\n');

  // Datos base
  const recruiterActor: AuthenticatedUser = {
    id: 'user-recruiter-01',
    email: 'recruiter@techinnovations.co',
    name: 'Carlos Mendoza (Reclutador)',
    role: 'TUTOR_EMPRESARIAL' as Role,
    status: 'ACTIVO' as UserStatus,
    companyId: 'company-tech-01',
    tokenVersion: 1,
  };

  const otherCompanyRecruiter: AuthenticatedUser = {
    id: 'user-other-recruiter',
    email: 'tutor@otraempresa.com',
    name: 'Tutor Otra Empresa',
    role: 'TUTOR_EMPRESARIAL' as Role,
    status: 'ACTIVO' as UserStatus,
    companyId: 'company-other-02',
    tokenVersion: 1,
  };

  const studentActor: AuthenticatedUser = {
    id: 'student-actor-01',
    email: 'student@ufps.edu.co',
    name: 'Estudiante Juan',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    tokenVersion: 1,
  };

  // Plaza de práctica (vacante) con cupo para 1 solo practicante
  const singleSlotVacancy = {
    id: 'vac-single-01',
    companyId: 'company-tech-01',
    createdById: recruiterActor.id,
    title: 'Practicante Backend Node.js / PostgreSQL',
    description: 'Desarrollo de servicios API y base de datos',
    requirements: 'Manejo de SQL y TypeScript',
    program: 'Ingeniería de Sistemas',
    academicPeriod: '2026-1',
    vacanciesCount: 1, // Cupo = 1
    status: 'PUBLICADA',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Plaza de práctica con 2 cupos
  const doubleSlotVacancy = {
    id: 'vac-double-02',
    companyId: 'company-tech-01',
    createdById: recruiterActor.id,
    title: 'Desarrollador Fullstack Junior',
    description: 'Desarrollo Frontend y Backend',
    requirements: 'React y Node.js',
    program: 'Ingeniería de Sistemas',
    academicPeriod: '2026-1',
    vacanciesCount: 2, // Cupo = 2
    status: 'PUBLICADA',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Postulación 1: Estudiante en estado "En Revisión"
  const appInReview = {
    id: 'app-review-01',
    vacancyId: singleSlotVacancy.id,
    studentId: 'student-01',
    status: 'En Revisión',
    cvUrl: 'https://storage.sigetrap.co/cvs/estudiante_01_cv.pdf',
    presentationLetterUrl: null,
    rejectionReason: null,
    updatedById: null,
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(Date.now() - 3600000),
    deletedAt: null,
    vacancy: {
      id: singleSlotVacancy.id,
      title: singleSlotVacancy.title,
      companyId: singleSlotVacancy.companyId,
      company: {
        id: singleSlotVacancy.companyId,
        businessName: 'Tech Innovations Colombia S.A.S.',
      },
    },
    student: {
      id: 'student-01',
      name: 'Andrés López',
      email: 'andres.lopez@ufps.edu.co',
      studentCode: '1152001',
      program: 'Ingeniería de Sistemas',
      approvedCredits: 130,
      academicAverage: 4.2,
    },
  };

  // Práctica vinculada a la postulación 1
  const practice1 = {
    id: 'practice-01',
    applicationId: appInReview.id,
    studentId: appInReview.studentId,
    companyId: singleSlotVacancy.companyId,
    vacancyId: singleSlotVacancy.id,
    currentStatus: 'POSTULADO' as PracticeStatus,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Postulación 2: Segundo candidato para la misma plaza de cupo 1
  const appCandidate2 = {
    id: 'app-candidate-02',
    vacancyId: singleSlotVacancy.id,
    studentId: 'student-02',
    status: 'En Revisión',
    cvUrl: 'https://storage.sigetrap.co/cvs/estudiante_02_cv.pdf',
    presentationLetterUrl: null,
    rejectionReason: null,
    updatedById: null,
    createdAt: new Date(Date.now() - 1800000),
    updatedAt: new Date(Date.now() - 1800000),
    deletedAt: null,
    vacancy: {
      id: singleSlotVacancy.id,
      title: singleSlotVacancy.title,
      companyId: singleSlotVacancy.companyId,
      company: {
        id: singleSlotVacancy.companyId,
        businessName: 'Tech Innovations Colombia S.A.S.',
      },
    },
    student: {
      id: 'student-02',
      name: 'María Gómez',
      email: 'maria.gomez@ufps.edu.co',
      studentCode: '1152002',
      program: 'Ingeniería de Sistemas',
      approvedCredits: 125,
      academicAverage: 4.5,
    },
  };

  const practice2 = {
    id: 'practice-02',
    applicationId: appCandidate2.id,
    studentId: appCandidate2.studentId,
    companyId: singleSlotVacancy.companyId,
    vacancyId: singleSlotVacancy.id,
    currentStatus: 'POSTULADO' as PracticeStatus,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Postulación 3: En estado "Pendiente" (para vacante de 2 cupos)
  const appPending3 = {
    id: 'app-pending-03',
    vacancyId: doubleSlotVacancy.id,
    studentId: 'student-03',
    status: 'Pendiente',
    cvUrl: 'https://storage.sigetrap.co/cvs/estudiante_03_cv.pdf',
    presentationLetterUrl: null,
    rejectionReason: null,
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    vacancy: {
      id: doubleSlotVacancy.id,
      title: doubleSlotVacancy.title,
      companyId: doubleSlotVacancy.companyId,
      company: {
        id: doubleSlotVacancy.companyId,
        businessName: 'Tech Innovations Colombia S.A.S.',
      },
    },
    student: {
      id: 'student-03',
      name: 'David Torres',
      email: 'david.torres@ufps.edu.co',
      studentCode: '1152003',
      program: 'Ingeniería de Sistemas',
      approvedCredits: 120,
      academicAverage: 4.1,
    },
  };

  const practice3 = {
    id: 'practice-03',
    applicationId: appPending3.id,
    studentId: appPending3.studentId,
    companyId: doubleSlotVacancy.companyId,
    vacancyId: doubleSlotVacancy.id,
    currentStatus: 'POSTULADO' as PracticeStatus,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Inicializar repositorios y servicios mock
  const mockAppRepo = new MockApplicationRepository([appInReview, appCandidate2, appPending3]);
  mockAppRepo.practices = [practice1, practice2, practice3];

  const mockVacancyRepo = new MockVacancyRepository([singleSlotVacancy, doubleSlotVacancy]);
  const mockPracticeRepo = new MockPracticeRepository([practice1, practice2, practice3]);

  const service = new CandidateSelectionService(
    mockAppRepo,
    mockVacancyRepo,
    mockPracticeRepo
  );

  // Registrar la instancia mock para que los Route Handlers HTTP utilicen los mocks en memoria
  setCandidateSelectionServiceInstance(service);

  // ----------------------------------------------------------------------------
  // TEST 1: Criterio 1 - Actualización válida a "Preseleccionado" con fecha y usuario
  // ----------------------------------------------------------------------------
  console.log('📌 Test 1 (Criterio 1): Cambio de estado de "En Revisión" a "Preseleccionado"...');
  const resultPreselect = await service.updateApplicationStatus(
    appInReview.id,
    { estado: 'Preseleccionado' },
    recruiterActor
  );

  if (
    resultPreselect.newStatus === 'Preseleccionado' &&
    resultPreselect.updatedById === recruiterActor.id &&
    resultPreselect.updatedAt instanceof Date
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1): Postulación actualizada a 'Preseleccionado', registrado usuario '${resultPreselect.updatedByName}' y fecha '${resultPreselect.updatedAt.toISOString()}'.`
    );
  } else {
    throw new Error('❌ FALLÓ Test 1: Los datos de actualización no coinciden con lo esperado');
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Criterio 1 - Actualización válida a "Aceptado" (Formalización de Admisión)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 2 (Criterio 1): Cambio de estado a "Aceptado" y formalización de admisión...');
  const resultAccepted = await service.updateApplicationStatus(
    appInReview.id,
    { estado: 'Aceptado', notes: 'Candidato admitido satisfactoriamente tras prueba técnica' },
    recruiterActor
  );

  const updatedPractice1 = mockPracticeRepo.practices.find((p) => p.id === practice1.id);

  if (
    resultAccepted.newStatus === 'Aceptado' &&
    resultAccepted.updatedById === recruiterActor.id &&
    updatedPractice1?.currentStatus === 'ACEPTADO_ARL_PENDIENTE'
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1): Postulación formalizada como 'Aceptado'. Práctica transicionada a 'ACEPTADO_ARL_PENDIENTE' para trámite de ARL.`
    );
  } else {
    throw new Error('❌ FALLÓ Test 2: Falla en formalización o transición de práctica');
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Criterio 2 - Validación de estado no permitido (chk_estado_postulacion) -> 400 Bad Request
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 3 (Criterio 2): Envío de valor de estado no contemplado en el negocio...');
  try {
    await service.updateApplicationStatus(
      appCandidate2.id,
      { estado: 'Aprobado_Arbitrario' }, // Estado fuera del dominio
      recruiterActor
    );
    throw new Error('Se esperaba error por estado inválido');
  } catch (error: any) {
    if (
      error instanceof CandidateSelectionError &&
      error.statusCode === 400 &&
      error.constraint === 'chk_estado_postulacion'
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 2): Falla interceptada por chk_estado_postulacion -> [HTTP ${error.statusCode} ${error.code}] ${error.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 3: Tipo de excepción o código inesperado -> ${error.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 4: Criterio 2 - Rechazo por estado nulo o vacío
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 4 (Criterio 2): Rechazo por estado nulo o no suministrado...');
  try {
    await service.updateApplicationStatus(
      appCandidate2.id,
      { estado: '' },
      recruiterActor
    );
    throw new Error('Se esperaba error por estado vacío');
  } catch (error: any) {
    if (error.statusCode === 400) {
      console.log(`  ✅ PASÓ (Criterio 2): Validación de estado requerido confirmada -> [HTTP 400]`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 5: Criterio 3 - Bloqueo de admisión si se supera el cupo de la plaza -> 422 Unprocessable Entity
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 5 (Criterio 3): Bloqueo de admisión al intentar superar el cupo de vacantes...');
  // La plaza 'vac-single-01' tiene cupo = 1, y appInReview ya fue marcada como 'Aceptado' en Test 2.
  // Intentar marcar al candidato 2 como 'Aceptado' debe bloquearse con 422.
  try {
    await service.updateApplicationStatus(
      appCandidate2.id,
      { estado: 'Aceptado' },
      recruiterActor
    );
    throw new Error('Se esperaba bloqueo por superación de cupo');
  } catch (error: any) {
    if (
      error instanceof CandidateSelectionError &&
      error.statusCode === 422 &&
      error.code === 'VACANCY_CAPACITY_EXCEEDED'
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 3): Admisión bloqueada por cupo completado -> [HTTP ${error.statusCode} ${error.code}] ${error.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 5: Se esperaba HTTP 422 pero se recibió -> ${error.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 6: Criterio 3 - Candidato ya aceptado no consume cupo adicional al actualizarse
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 6: Re-confirmación de candidato ya aceptado no genera falso bloqueo...');
  const reconfirmAccepted = await service.updateApplicationStatus(
    appInReview.id,
    { estado: 'Aceptado', notes: 'Actualización de notas del estudiante ya admitido' },
    recruiterActor
  );
  if (reconfirmAccepted.newStatus === 'Aceptado') {
    console.log('  ✅ PASÓ: El estudiante ya admitido pudo ser re-confirmado sin penalizar cupo.');
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Flujo de Rechazo de candidato con motivo
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 7: Rechazo de candidato no idóneo tras evaluación de hoja de vida...');
  const resultRejection = await service.updateApplicationStatus(
    appCandidate2.id,
    { estado: 'Rechazado', rejectionReason: 'No cumple con conocimientos requeridos en SQL avanzado' },
    recruiterActor
  );
  const updatedPractice2 = mockPracticeRepo.practices.find((p) => p.id === practice2.id);

  if (
    resultRejection.newStatus === 'Rechazado' &&
    resultRejection.rejectionReason?.includes('SQL avanzado') &&
    updatedPractice2?.currentStatus === 'REUBICACION_PENDIENTE'
  ) {
    console.log(
      `  ✅ PASÓ: Candidato rechazado con motivo registrado y práctica en estado 'REUBICACION_PENDIENTE'.`
    );
  } else {
    throw new Error('❌ FALLÓ Test 7: Datos de rechazo no concuerdan');
  }

  // ----------------------------------------------------------------------------
  // TEST 8: Reclutador evalúa hoja de vida (inicia revisión: Pendiente -> En Revisión)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 8: Reclutador inicia revisión de postulación ("Pendiente" -> "En Revisión")...');
  const resultStartReview = await service.updateApplicationStatus(
    appPending3.id,
    { estado: 'En Revisión' },
    recruiterActor
  );
  if (resultStartReview.newStatus === 'En Revisión') {
    console.log('  ✅ PASÓ: Postulación transicionada exitosamente a "En Revisión" para evaluar CV.');
  } else {
    throw new Error('❌ FALLÓ Test 8');
  }

  // ----------------------------------------------------------------------------
  // TEST 9: Seguridad RBAC - Restricción a rol ESTUDIANTE intentando alterar estado
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 9 (RBAC): Bloqueo a rol ESTUDIANTE intentando modificar postulaciones...');
  try {
    await service.updateApplicationStatus(
      appPending3.id,
      { estado: 'Aceptado' },
      studentActor
    );
    throw new Error('Se esperaba denegación RBAC a estudiante');
  } catch (error: any) {
    if (error.statusCode === 403 && error.code === 'FORBIDDEN_OPERATION') {
      console.log(`  ✅ PASÓ (RBAC): Acceso denegado a rol no autorizado -> [HTTP 403 ${error.code}]`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 10: Multitenancy Empresarial - Reclutador de otra empresa bloqueado
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 10 (Multitenancy): Reclutador de otra entidad intenta evaluar postulación ajena...');
  try {
    await service.updateApplicationStatus(
      appPending3.id,
      { estado: 'Preseleccionado' },
      otherCompanyRecruiter
    );
    throw new Error('Se esperaba bloqueo por empresa ajena');
  } catch (error: any) {
    if (error.statusCode === 403 && error.code === 'FORBIDDEN_OPERATION') {
      console.log(
        `  ✅ PASÓ (Multitenancy): Aislamiento entre empresas confirmado -> [HTTP 403 ${error.code}]`
      );
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 11: Consulta de postulación inexistente (404)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 11: Consulta de postulación con ID inexistente...');
  try {
    await service.updateApplicationStatus(
      'app-inexistente-999',
      { estado: 'Aceptado' },
      recruiterActor
    );
    throw new Error('Se esperaba 404');
  } catch (error: any) {
    if (error.statusCode === 404 && error.code === 'APPLICATION_NOT_FOUND') {
      console.log(`  ✅ PASÓ: Error 404 para postulación inexistente -> [HTTP 404 ${error.code}]`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 12: Verificación de HTTP Route Handler (PATCH /api/v1/postulaciones/[id])
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 12 (HTTP Integration): Verificación de Route Handler PATCH /api/v1/postulaciones/[id]...');

  const recruiterToken = generateToken({
    userId: recruiterActor.id,
    email: recruiterActor.email,
    role: recruiterActor.role,
    name: recruiterActor.name,
    status: recruiterActor.status,
    companyId: recruiterActor.companyId,
    tokenVersion: 1,
  });

  // 12.1 Sin autenticación -> 401
  const reqUnauth = new NextRequest(
    `http://localhost:3000/api/v1/postulaciones/${appPending3.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'Preseleccionado' }),
    }
  );
  const resUnauth = await PATCH(reqUnauth, {
    params: Promise.resolve({ id: appPending3.id }),
  });
  if (resUnauth.status === 401) {
    console.log('  ✅ PASÓ (HTTP - 401): Endpoint rechaza peticiones sin autenticación');
  } else {
    throw new Error(`Se esperaba 401 pero se obtuvo ${resUnauth.status}`);
  }

  // 12.2 Estado inválido por chk_estado_postulacion -> 400 Bad Request
  const reqInvalid = new NextRequest(
    `http://localhost:3000/api/v1/postulaciones/${appPending3.id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${recruiterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'Estado_Invalido_123' }),
    }
  );
  const resInvalid = await PATCH(reqInvalid, {
    params: Promise.resolve({ id: appPending3.id }),
  });
  const resInvalidJson = await resInvalid.json();
  if (resInvalid.status === 400 && resInvalidJson.error?.code === 'INVALID_APPLICATION_STATUS') {
    console.log('  ✅ PASÓ (HTTP - Criterio 2): Endpoint retorna 400 Bad Request ante estado no contemplado');
  } else {
    throw new Error(`Se esperaba 400 pero se obtuvo ${resInvalid.status}`);
  }

  // 12.3 Superación de cupo -> 422 Unprocessable Entity
  const reqQuota = new NextRequest(
    `http://localhost:3000/api/v1/postulaciones/${appCandidate2.id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${recruiterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'Aceptado' }),
    }
  );
  const resQuota = await PATCH(reqQuota, {
    params: Promise.resolve({ id: appCandidate2.id }),
  });
  const resQuotaJson = await resQuota.json();
  if (resQuota.status === 422 && resQuotaJson.error?.code === 'VACANCY_CAPACITY_EXCEEDED') {
    console.log('  ✅ PASÓ (HTTP - Criterio 3): Endpoint retorna 422 Unprocessable Entity al superar cupo');
  } else {
    throw new Error(`Se esperaba 422 pero se obtuvo ${resQuota.status}`);
  }

  // 12.4 Actualización válida -> 200 OK
  const reqSuccess = new NextRequest(
    `http://localhost:3000/api/v1/postulaciones/${appPending3.id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${recruiterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'Preseleccionado' }),
    }
  );
  const resSuccess = await PATCH(reqSuccess, {
    params: Promise.resolve({ id: appPending3.id }),
  });
  const resSuccessJson = await resSuccess.json();
  if (
    resSuccess.status === 200 &&
    resSuccessJson.success === true &&
    resSuccessJson.data?.newStatus === 'Preseleccionado'
  ) {
    console.log('  ✅ PASÓ (HTTP - Criterio 1): Endpoint retorna 200 OK con payload de actualización válido');
  } else {
    throw new Error(`Se esperaba 200 pero se obtuvo ${resSuccess.status}`);
  }

  // ----------------------------------------------------------------------------
  // TEST 13: Verificación de HTTP Route Handler (GET /api/v1/postulaciones/[id])
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 13 (HTTP Integration): Verificación de Route Handler GET /api/v1/postulaciones/[id]...');
  const reqGet = new NextRequest(
    `http://localhost:3000/api/v1/postulaciones/${appPending3.id}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${recruiterToken}`,
      },
    }
  );
  const resGet = await GET(reqGet, {
    params: Promise.resolve({ id: appPending3.id }),
  });
  const resGetJson = await resGet.json();
  if (
    resGet.status === 200 &&
    resGetJson.success === true &&
    resGetJson.data?.cvUrl === appPending3.cvUrl
  ) {
    console.log('  ✅ PASÓ (HTTP GET): Consulta individual exitosa con soporte de hoja de vida (cvUrl).');
  } else {
    throw new Error(`Se esperaba 200 pero se obtuvo ${resGet.status}`);
  }

  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE CU12 (PRESELECCIÓN Y ADMISIÓN) PASARON CON ÉXITO');
  console.log('🎉 ====================================================================\n');
}

runCU12Tests().catch((err) => {
  console.error('\n❌ ERROR FATAL EN PRUEBAS CU12:', err);
  process.exit(1);
});
