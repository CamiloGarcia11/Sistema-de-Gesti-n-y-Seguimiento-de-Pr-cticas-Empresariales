// ==============================================================================
// SIGETRAP - Suite de Pruebas HU09 / CU09: Vinculación de Tutores Empresariales
// Módulo / Épica: Gestión Empresarial y Evaluación de Prácticas
// Caso de Uso Asociado: CU09 - Vinculación de Tutores Empresariales
// Entidades BD: empresas, tutores_empresariales, usuarios, asignaciones_practica
// Restricciones SQL: fk_tutor_empresa, chk_correo_tutor_valido, uq_tutor_documento_empresa, uq_tutor_email
//
// Criterios de Aceptación Evaluados:
//   - Criterio 1: Registro y vinculación exitosa del supervisor (PU/Integración)
//                 Dado que el contacto empresarial ingresa los datos completos y válidos
//                 de un supervisor (nombre, cargo, correo institucional y documento),
//                 cuando confirma el registro en el sistema, entonces se crea/asocia el
//                 registro en tutores_empresariales vinculado a la empresa correspondiente
//                 con estado "Activo" y el API responde 201 Created.
//   - Criterio 2: Validación de correo duplicado o formato inválido (PU)
//                 Dado que se ingresa el correo de un supervisor con formato erróneo o que
//                 ya existe registrado en la plataforma, cuando se intenta almacenar en la
//                 base de datos, entonces la validación falla por la restricción
//                 chk_correo_tutor_valido (o uq_tutor_email) y el API devuelve 400 Bad Request
//                 indicando que el correo electrónico no es válido o ya se encuentra en uso.
//   - Criterio 3: Disponibilidad para asignación como evaluador (Integración/UI)
//                 Dado que un supervisor ha sido correctamente vinculado a una empresa activa,
//                 cuando el usuario ingresa al formulario de formalización/seguimiento de
//                 práctica de un estudiante asignado a dicha organización, entonces el
//                 supervisor aparece listado en el selector de evaluadores directos para
//                 ser asignado al plan de práctica.
// ==============================================================================

import { NextRequest } from 'next/server';
import {
  TutorLinkingService,
  TutorLinkingError,
  setTutorLinkingServiceInstance,
  EMAIL_TUTOR_REGEX,
} from '../src/server/services/tutor-linking.service';
import { CompanyTutorRepository } from '../src/server/repositories/tutor.repository';
import { CompanyRepository } from '../src/server/repositories/company.repository';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import { AuthenticatedUser, Role, UserStatus, PracticeStatus } from '../src/types';
import { POST as postTutorHandler, GET as getTutorsHandler } from '../src/app/api/v1/tutores/route';
import {
  POST as postCompanyTutorHandler,
  GET as getCompanyTutorsHandler,
} from '../src/app/api/v1/empresas/[id]/tutores/route';
import {
  GET as getPracticeEvaluatorsHandler,
  PATCH as patchPracticeEvaluatorHandler,
} from '../src/app/api/v1/practicas/[id]/evaluador/route';
import { generateToken } from '../src/lib/auth';

// ------------------------------------------------------------------------------
// MOCKS EN MEMORIA CON SIMULACIÓN DE RESTRICCIONES SQL DE POSTGRESQL
// ------------------------------------------------------------------------------

class MockCompanyTutorRepository extends CompanyTutorRepository {
  public tutors: any[] = [];
  public companiesRef: any[] = [];

  constructor(initialTutors: any[] = [], companiesRef: any[] = []) {
    super();
    this.tutors = initialTutors.map((t) => ({ ...t }));
    this.companiesRef = companiesRef;
  }

  async findByEmail(email: string) {
    const clean = email.trim().toLowerCase();
    return (
      this.tutors.find((t) => t.email.trim().toLowerCase() === clean && !t.deletedAt) || null
    );
  }

  async findByDocumentNumber(documentNumber: string, companyId?: string) {
    const cleanDoc = documentNumber.trim().toUpperCase();
    return (
      this.tutors.find(
        (t) =>
          t.documentNumber.trim().toUpperCase() === cleanDoc &&
          (!companyId || t.companyId === companyId || true) &&
          !t.deletedAt
      ) || null
    );
  }

  async findById(id: string) {
    return (
      this.tutors.find(
        (t) => t.id === id && t.role === 'TUTOR_EMPRESARIAL' && !t.deletedAt
      ) || null
    );
  }

  async createTutor(params: {
    name: string;
    cargo: string;
    email: string;
    documentType: string;
    documentNumber: string;
    phone?: string | null;
    companyId: string;
    passwordHash: string;
  }) {
    // 1. Simular restricción SQL chk_correo_tutor_valido
    if (!EMAIL_TUTOR_REGEX.test(params.email)) {
      const err: any = new Error(
        'new row for relation "tutores_empresariales" violates check constraint "chk_correo_tutor_valido"'
      );
      err.code = '23514';
      err.constraint = 'chk_correo_tutor_valido';
      throw err;
    }

    // 2. Simular restricción SQL fk_tutor_empresa
    const company = this.companiesRef.find((c) => c.id === params.companyId && !c.deletedAt);
    if (!company) {
      const err: any = new Error(
        'insert or update on table "tutores_empresariales" violates foreign key constraint "fk_tutor_empresa"'
      );
      err.code = '23503';
      err.constraint = 'fk_tutor_empresa';
      throw err;
    }

    // 3. Simular restricción SQL uq_tutor_email
    const dupEmail = await this.findByEmail(params.email);
    if (dupEmail) {
      const err: any = new Error(
        'duplicate key value violates unique constraint "uq_tutor_email"'
      );
      err.code = '23505';
      err.constraint = 'uq_tutor_email';
      throw err;
    }

    // 4. Simular restricción SQL uq_tutor_documento_empresa
    const dupDoc = await this.findByDocumentNumber(params.documentNumber, params.companyId);
    if (dupDoc) {
      const err: any = new Error(
        'duplicate key value violates unique constraint "uq_tutor_documento_empresa"'
      );
      err.code = '23505';
      err.constraint = 'uq_tutor_documento_empresa';
      throw err;
    }

    const newTutor = {
      id: `tutor_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: params.name.trim(),
      email: params.email.trim().toLowerCase(),
      passwordHash: params.passwordHash,
      documentType: params.documentType || 'CC',
      documentNumber: params.documentNumber.trim().toUpperCase(),
      phone: params.phone || null,
      role: 'TUTOR_EMPRESARIAL' as Role,
      status: 'ACTIVO' as UserStatus,
      isActive: true,
      program: params.cargo.trim(),
      cargo: params.cargo.trim(),
      companyId: params.companyId,
      company: {
        id: company.id,
        businessName: company.businessName,
        nit: company.nit,
        city: company.city,
        isActive: company.isActive,
      },
      _count: {
        practicesAsTutor: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    this.tutors.push(newTutor);
    return newTutor;
  }

  async findByCompanyId(params: {
    companyId?: string;
    onlyActive?: boolean;
    search?: string;
  }) {
    let result = this.tutors.filter(
      (t) => t.role === 'TUTOR_EMPRESARIAL' && !t.deletedAt
    );

    if (params.companyId) {
      result = result.filter((t) => t.companyId === params.companyId);
    }

    if (params.onlyActive) {
      result = result.filter(
        (t) =>
          t.status === 'ACTIVO' &&
          t.isActive === true &&
          (!t.company || t.company.isActive !== false)
      );
    }

    if (params.search && params.search.trim()) {
      const s = params.search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(s) ||
          t.email.toLowerCase().includes(s) ||
          t.documentNumber.toLowerCase().includes(s) ||
          (t.program && t.program.toLowerCase().includes(s))
      );
    }

    return result as any;
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
  public tutorsRef: any[] = [];

  constructor(initialPractices: any[] = [], tutorsRef: any[] = []) {
    super();
    this.practices = initialPractices.map((p) => ({ ...p }));
    this.tutorsRef = tutorsRef;
  }

  async findById(practiceId: string) {
    return this.practices.find((p) => p.id === practiceId && !p.deletedAt) || null;
  }

  async assignTutorToPractice(params: {
    practiceId: string;
    tutorId: string;
    teacherId?: string;
    changedByUserId?: string;
    notes?: string;
  }) {
    const practice = this.practices.find((p) => p.id === params.practiceId);
    if (!practice) throw new Error('Practice not found');

    const tutor = this.tutorsRef.find((t) => t.id === params.tutorId);

    practice.tutorId = params.tutorId;
    if (params.teacherId) practice.teacherId = params.teacherId;
    practice.tutor = tutor || null;
    practice.updatedAt = new Date();

    return practice as any;
  }
}

// ------------------------------------------------------------------------------
// EJECUCIÓN DE CASOS DE PRUEBA DE HU09 / CU09
// ------------------------------------------------------------------------------

async function runHU09Tests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 SIGETRAP - Suite de Pruebas: Gestión Empresarial y Evaluación');
  console.log('🧪 Caso de Uso: CU09 (HU09) - Vinculación de Tutores Empresariales');
  console.log('🧪 ====================================================================\n');

  // 1. Datos Semilla en Memoria
  const activeCompany = {
    id: 'company-tech-001',
    nit: '900123456-1',
    businessName: 'Tech Innovations Colombia S.A.S.',
    legalRepresentative: 'Carlos Mendoza',
    contactEmail: 'contacto@techinnovations.co',
    contactPhone: '+57 300 123 4567',
    address: 'Calle 100 # 15-20',
    city: 'Cúcuta',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const otherCompany = {
    id: 'company-other-002',
    nit: '901999888-2',
    businessName: 'DataSystems del Oriente S.A.S.',
    legalRepresentative: 'Laura Gómez',
    contactEmail: 'info@datasystems.co',
    contactPhone: '3109998877',
    address: 'Av. Libertadores # 10-30',
    city: 'Cúcuta',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const inactiveCompany = {
    id: 'company-inactive-003',
    nit: '800555444-3',
    businessName: 'Empresa Suspendida Ltda.',
    legalRepresentative: 'Pedro Ruiz',
    contactEmail: 'suspendida@empresa.co',
    contactPhone: '3001112233',
    address: 'Calle 10 # 5-10',
    city: 'Bogotá',
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Contacto empresarial autenticado de Tech Innovations Colombia S.A.S.
  const companyContactActor: AuthenticatedUser = {
    id: 'user-contact-tech-01',
    email: 'contacto@techinnovations.co',
    name: 'Carlos Mendoza (Contacto Empresarial)',
    role: 'TUTOR_EMPRESARIAL',
    status: 'ACTIVO',
    companyId: activeCompany.id,
    tokenVersion: 1,
  };

  const directorActor: AuthenticatedUser = {
    id: 'user-director-01',
    email: 'director.sistemas@ufps.edu.co',
    name: 'Dr. Roberto Gómez (Director)',
    role: 'DIRECTOR_PROGRAMA',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const studentActor: AuthenticatedUser = {
    id: 'user-student-01',
    email: 'juan.perez@ufps.edu.co',
    name: 'Juan David Pérez (Estudiante)',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  // Asignación de práctica de un estudiante en Tech Innovations Colombia S.A.S.
  const studentPracticeAssignment = {
    id: 'practice-assign-001',
    studentId: studentActor.id,
    companyId: activeCompany.id,
    tutorId: null,
    teacherId: 'teacher-001',
    currentStatus: 'ACEPTADO_ARL_PENDIENTE' as PracticeStatus,
    student: {
      id: studentActor.id,
      name: studentActor.name,
      email: studentActor.email,
      studentCode: '1152001',
    },
    company: activeCompany,
    tutor: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Inicializar repositorios y servicio
  const mockCompanyRepo = new MockCompanyRepository([
    activeCompany,
    otherCompany,
    inactiveCompany,
  ]);
  const mockTutorRepo = new MockCompanyTutorRepository(
    [],
    mockCompanyRepo.companies
  );
  const mockPracticeRepo = new MockPracticeRepository(
    [studentPracticeAssignment],
    mockTutorRepo.tutors
  );

  const service = new TutorLinkingService(
    mockTutorRepo,
    mockCompanyRepo,
    mockPracticeRepo
  );
  setTutorLinkingServiceInstance(service);

  const contactToken = generateToken({
    userId: companyContactActor.id,
    email: companyContactActor.email,
    role: companyContactActor.role,
    name: companyContactActor.name,
    status: companyContactActor.status,
    companyId: companyContactActor.companyId,
    tokenVersion: 1,
  });

  // ==========================================================================
  // TEST 1: Criterio 1 - Registro y vinculación exitosa del supervisor (201 Created)
  // ==========================================================================
  console.log('📌 Test 1 (Criterio 1 - PU/Integración): Registro y vinculación exitosa del supervisor inmediato...');

  const reqCreateTutor = new NextRequest('http://localhost:3000/api/v1/tutores', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${contactToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nombre: 'Ing. Carolina Martínez',
      cargo: 'Líder Técnico de Arquitectura Cloud',
      correo: 'carolina.martinez@techinnovations.co',
      documento: '1090456789',
      tipoDocumento: 'CC',
      telefono: '3157894561',
      empresaId: activeCompany.id,
    }),
  });

  const resCreateTutor = await postTutorHandler(reqCreateTutor);
  const resCreateTutorJson = await resCreateTutor.json();

  if (
    resCreateTutor.status === 201 &&
    resCreateTutorJson.success === true &&
    resCreateTutorJson.data?.estado === 'Activo' &&
    resCreateTutorJson.data?.empresaId === activeCompany.id &&
    resCreateTutorJson.data?.cargo === 'Líder Técnico de Arquitectura Cloud' &&
    resCreateTutorJson.data?.correo === 'carolina.martinez@techinnovations.co'
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1): Supervisor '${resCreateTutorJson.data.nombre}' (${resCreateTutorJson.data.cargo}) registrado y vinculado a '${activeCompany.businessName}' con estado '${resCreateTutorJson.data.estado}' -> [HTTP ${resCreateTutor.status} Created]`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 1: Se esperaba 201 Created con estado 'Activo', se recibió ${resCreateTutor.status}: ${JSON.stringify(resCreateTutorJson)}`
    );
  }

  const createdSupervisorId = resCreateTutorJson.data.id;

  // ==========================================================================
  // TEST 2: Criterio 2 - Validación de correo con formato inválido (chk_correo_tutor_valido -> 400 Bad Request)
  // ==========================================================================
  console.log('\n📌 Test 2 (Criterio 2 - PU): Rechazo de correo de supervisor con formato erróneo (chk_correo_tutor_valido)...');

  const reqInvalidEmail = new NextRequest('http://localhost:3000/api/v1/tutores', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${contactToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nombre: 'Supervisor Correo Malo',
      cargo: 'Jefe de Desarrollo',
      correo: 'correo-formato-invalido-sin-dominio',
      documento: '1090999111',
      empresaId: activeCompany.id,
    }),
  });

  const resInvalidEmail = await postTutorHandler(reqInvalidEmail);
  const resInvalidEmailJson = await resInvalidEmail.json();

  if (
    resInvalidEmail.status === 400 &&
    resInvalidEmailJson.success === false &&
    resInvalidEmailJson.error?.details?.constraint === 'chk_correo_tutor_valido' &&
    resInvalidEmailJson.error?.message?.toLowerCase().includes('correo electrónico no es válido')
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 2 - Formato Inválido): Falla por restricción '${resInvalidEmailJson.error.details.constraint}' -> [HTTP ${resInvalidEmail.status} Bad Request] ${resInvalidEmailJson.error.message}`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 2: Se esperaba 400 Bad Request con chk_correo_tutor_valido, se recibió ${resInvalidEmail.status}: ${JSON.stringify(resInvalidEmailJson)}`
    );
  }

  // ==========================================================================
  // TEST 3: Criterio 2 - Validación de correo duplicado (uq_tutor_email -> 400 Bad Request)
  // ==========================================================================
  console.log('\n📌 Test 3 (Criterio 2 - PU): Rechazo de correo de supervisor ya existente en la plataforma (uq_tutor_email)...');

  const reqDuplicateEmail = new NextRequest('http://localhost:3000/api/v1/tutores', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${contactToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nombre: 'Otro Supervisor Duplicado',
      cargo: 'Director de QA',
      correo: 'carolina.martinez@techinnovations.co', // Ya registrado en Test 1
      documento: '1090888777',
      empresaId: activeCompany.id,
    }),
  });

  const resDuplicateEmail = await postTutorHandler(reqDuplicateEmail);
  const resDuplicateEmailJson = await resDuplicateEmail.json();

  if (
    resDuplicateEmail.status === 400 &&
    resDuplicateEmailJson.success === false &&
    resDuplicateEmailJson.error?.details?.constraint === 'uq_tutor_email' &&
    resDuplicateEmailJson.error?.message?.toLowerCase().includes('ya se encuentra en uso')
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 2 - Correo Duplicado): Falla por restricción '${resDuplicateEmailJson.error.details.constraint}' -> [HTTP ${resDuplicateEmail.status} Bad Request] ${resDuplicateEmailJson.error.message}`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 3: Se esperaba 400 Bad Request con uq_tutor_email, se recibió ${resDuplicateEmail.status}: ${JSON.stringify(resDuplicateEmailJson)}`
    );
  }

  // ==========================================================================
  // TEST 4: Validación de documento duplicado por empresa (uq_tutor_documento_empresa -> 400 Bad Request)
  // ==========================================================================
  console.log('\n📌 Test 4 (Restricción SQL uq_tutor_documento_empresa): Rechazo de documento duplicado...');

  try {
    await service.registerCompanyTutor(
      {
        nombre: 'Supervisor Documento Repetido',
        cargo: 'Coordinador DevOps',
        correo: 'devops.nuevo@techinnovations.co',
        documento: '1090456789', // Mismo documento de Carolina Martínez en Test 1
        empresaId: activeCompany.id,
      },
      companyContactActor
    );
    throw new Error('Se esperaba fallo por uq_tutor_documento_empresa');
  } catch (error: any) {
    if (
      error instanceof TutorLinkingError &&
      error.statusCode === 400 &&
      error.constraint === 'uq_tutor_documento_empresa'
    ) {
      console.log(
        `  ✅ PASÓ (uq_tutor_documento_empresa): Restricción de documento único verificada -> [HTTP ${error.statusCode}] ${error.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 4: ${error.message}`);
    }
  }

  // ==========================================================================
  // TEST 5: Validación de clave foránea fk_tutor_empresa (Empresa inexistente -> 400 Bad Request)
  // ==========================================================================
  console.log('\n📌 Test 5 (Restricción SQL fk_tutor_empresa): Rechazo al vincular supervisor a empresa inexistente...');

  try {
    await service.registerCompanyTutor(
      {
        nombre: 'Supervisor Empresa Fantasma',
        cargo: 'Gerente TI',
        correo: 'gerente@fantasma.co',
        documento: '1090333222',
        empresaId: 'empresa-uuid-inexistente-999',
      },
      directorActor
    );
    throw new Error('Se esperaba fallo por fk_tutor_empresa');
  } catch (error: any) {
    if (
      error instanceof TutorLinkingError &&
      error.statusCode === 400 &&
      error.constraint === 'fk_tutor_empresa'
    ) {
      console.log(
        `  ✅ PASÓ (fk_tutor_empresa): Restricción de clave foránea verificada -> [HTTP ${error.statusCode}] ${error.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 5: ${error.message}`);
    }
  }

  // ==========================================================================
  // TEST 6: Vinculación de un segundo supervisor por endpoint anidado /api/v1/empresas/[id]/tutores
  // ==========================================================================
  console.log('\n📌 Test 6 (Endpoint anidado POST /api/v1/empresas/[id]/tutores): Registro de segundo supervisor...');

  const reqNestedPost = new NextRequest(
    `http://localhost:3000/api/v1/empresas/${activeCompany.id}/tutores`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${contactToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nombre: 'Ing. Sebastián Rojas',
        cargo: 'Arquitecto de Ciberseguridad',
        correo: 'sebastian.rojas@techinnovations.co',
        documento: '1090654321',
      }),
    }
  );

  const resNestedPost = await postCompanyTutorHandler(reqNestedPost, {
    params: Promise.resolve({ id: activeCompany.id }),
  });
  const resNestedPostJson = await resNestedPost.json();

  if (resNestedPost.status === 201 && resNestedPostJson.data?.estado === 'Activo') {
    console.log(
      `  ✅ PASÓ: Segundo supervisor '${resNestedPostJson.data.nombre}' vinculado vía /api/v1/empresas/[id]/tutores -> [HTTP 201 Created]`
    );
  } else {
    throw new Error('❌ FALLÓ Test 6');
  }

  // ==========================================================================
  // TEST 7: Criterio 3 - Disponibilidad en el selector de evaluadores directos (Integración/UI)
  // ==========================================================================
  console.log(
    '\n📌 Test 7 (Criterio 3 - Integración/UI): Consulta del selector de evaluadores directos para formalización/seguimiento de práctica...'
  );

  const reqGetEvaluators = new NextRequest(
    `http://localhost:3000/api/v1/practicas/${studentPracticeAssignment.id}/evaluador`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${contactToken}`,
      },
    }
  );

  const resGetEvaluators = await getPracticeEvaluatorsHandler(reqGetEvaluators, {
    params: Promise.resolve({ id: studentPracticeAssignment.id }),
  });
  const resGetEvaluatorsJson = await resGetEvaluators.json();

  const evaluatorsList: any[] = resGetEvaluatorsJson.data?.evaluators || [];
  const foundCarolina = evaluatorsList.find((e) => e.id === createdSupervisorId);

  if (
    resGetEvaluators.status === 200 &&
    resGetEvaluatorsJson.success === true &&
    evaluatorsList.length === 2 &&
    foundCarolina &&
    foundCarolina.estado === 'Activo' &&
    foundCarolina.cargo === 'Líder Técnico de Arquitectura Cloud'
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 3 - Selector de Evaluadores): El supervisor '${foundCarolina.nombre}' (${foundCarolina.cargo}) aparece listado con estado '${foundCarolina.estado}' en el selector de evaluadores directos de la organización (${evaluatorsList.length} supervisores disponibles).`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 7: El supervisor vinculado no apareció en el selector de evaluadores directos: ${JSON.stringify(resGetEvaluatorsJson)}`
    );
  }

  // ==========================================================================
  // TEST 8: Criterio 3 - Asignación efectiva del supervisor como evaluador directo al plan de práctica
  // ==========================================================================
  console.log(
    '\n📌 Test 8 (Criterio 3 - Asignación al Plan de Práctica): Asignación del supervisor seleccionado como evaluador directo...'
  );

  const reqAssignEvaluator = new NextRequest(
    `http://localhost:3000/api/v1/practicas/${studentPracticeAssignment.id}/evaluador`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${contactToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tutorId: createdSupervisorId,
        notes: 'Asignada como evaluadora directa para el plan de práctica semestral',
      }),
    }
  );

  const resAssignEvaluator = await patchPracticeEvaluatorHandler(reqAssignEvaluator, {
    params: Promise.resolve({ id: studentPracticeAssignment.id }),
  });
  const resAssignEvaluatorJson = await resAssignEvaluator.json();

  const updatedPracticeInRepo = mockPracticeRepo.practices.find(
    (p) => p.id === studentPracticeAssignment.id
  );

  if (
    resAssignEvaluator.status === 200 &&
    resAssignEvaluatorJson.success === true &&
    resAssignEvaluatorJson.data?.tutorId === createdSupervisorId &&
    resAssignEvaluatorJson.data?.tutor?.nombre === 'Ing. Carolina Martínez' &&
    updatedPracticeInRepo?.tutorId === createdSupervisorId
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 3 - Asignación): Supervisor '${resAssignEvaluatorJson.data.tutor.nombre}' asignado exitosamente como evaluador directo en asignaciones_practica -> [HTTP 200 OK]`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 8: Error al asignar evaluador directo: ${JSON.stringify(resAssignEvaluatorJson)}`
    );
  }

  // ==========================================================================
  // TEST 9: Seguridad RBAC y Multitenancy Empresarial
  // ==========================================================================
  console.log('\n📌 Test 9 (RBAC & Multitenancy): Bloqueo a rol ESTUDIANTE y aislamiento entre empresas...');

  // 9.1 Rol ESTUDIANTE bloqueado (403)
  try {
    await service.registerCompanyTutor(
      {
        nombre: 'Intento Estudiante',
        cargo: 'Supervisor',
        correo: 'intento@techinnovations.co',
        documento: '1090111000',
        empresaId: activeCompany.id,
      },
      studentActor
    );
    throw new Error('Se esperaba bloqueo RBAC a estudiante');
  } catch (error: any) {
    if (error.statusCode === 403 && error.code === 'FORBIDDEN_OPERATION') {
      console.log('  ✅ PASÓ (RBAC): Estudiante bloqueado al intentar vincular tutores -> [HTTP 403]');
    } else {
      throw error;
    }
  }

  // 9.2 Contacto empresarial intentando vincular tutor a otra empresa ajena (403)
  try {
    await service.registerCompanyTutor(
      {
        nombre: 'Intento Empresa Ajena',
        cargo: 'Supervisor Externo',
        correo: 'externo@datasystems.co',
        documento: '1090222333',
        empresaId: otherCompany.id, // Empresa distinta a la del actor
      },
      companyContactActor
    );
    throw new Error('Se esperaba bloqueo Multitenancy');
  } catch (error: any) {
    if (error.statusCode === 403 && error.code === 'FORBIDDEN_COMPANY_ACCESS') {
      console.log(
        '  ✅ PASÓ (Multitenancy): Contacto empresarial bloqueado al intentar vincular supervisor en empresa ajena -> [HTTP 403]'
      );
    } else {
      throw error;
    }
  }

  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE HU09 / CU09 (VINCULACIÓN DE TUTORES) PASARON CON ÉXITO');
  console.log('🎉 ====================================================================');
}

runHU09Tests().catch((error) => {
  console.error('\n❌ Error ejecutando la suite de pruebas HU09 / CU09:', error);
  process.exit(1);
});
