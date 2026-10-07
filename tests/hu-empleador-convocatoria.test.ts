// ==============================================================================
// SIGETRAP - Test de Verificación: Creación y Publicación de Convocatorias
// Historia de Usuario:
// "Como entidad empleadora, quiero crear y publicar convocatorias vinculadas
//  a programas académicos y periodos específicos, para captar perfiles de practicantes idóneos."
//
// Casos de Prueba Evaluados:
//   - Criterio 1: Creación y publicación exitosa de convocatoria por entidad empleadora
//                 vinculada a programa académico y periodo específico con convenio VIGENTE (RN-01)
//   - Criterio 2: Guardado exitoso de convocatoria en estado BORRADOR
//   - Criterio 3: Publicación exitosa de una convocatoria en borrador validando convenio RN-01
//   - Criterio 4: Bloqueo RN-01: Rechazo al intentar publicar convocatoria de empresa sin convenio VIGENTE
//   - Criterio 5: Rechazo si el número de cupos es menor a 1 (vacanciesCount < 1)
//   - Criterio 6: Rechazo por campos obligatorios faltantes o longitud insuficiente (título, descripción, perfil, periodo)
//   - Criterio 7: Rechazo si la fecha de fin es anterior a la fecha de inicio (endDate < startDate)
//   - Criterio 8: Restricción de permisos RBAC para roles no autorizados (Estudiante o Docente)
//   - Criterio 9: Rechazo si el Tutor Empresarial no tiene empresa asociada
//   - Criterio 10: Consulta de convocatorias creadas por la entidad empleadora
//   - Criterio 11: Verificación de HTTP Route Handler (POST /api/v1/vacantes con auth y Zod)
// ==============================================================================

import { NextRequest } from 'next/server';
import {
  VacancyManagementService,
  VacancyValidationError,
} from '../src/server/services/vacancy-management.service';
import { VacancyRepository } from '../src/server/repositories/vacancy.repository';
import { CompanyRepository } from '../src/server/repositories/company.repository';
import { AgreementRepository } from '../src/server/repositories/agreement.repository';
import { AuthenticatedUser, VacancyStatus } from '../src/types';
import { POST as postVacanteRouteHandler } from '../src/app/api/v1/vacantes/route';
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
      },
    };
  }

  async create(data: any) {
    const newVacancy = {
      id: `vac_${Date.now()}_${Math.random().toString(36).substring(5)}`,
      companyId: data.company.connect.id,
      createdById: data.createdBy.connect.id,
      title: data.title,
      description: data.description,
      requirements: data.requirements,
      program: data.program || 'Ingeniería de Sistemas',
      academicPeriod: data.academicPeriod,
      vacanciesCount: data.vacanciesCount,
      status: data.status || 'PUBLICADA',
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      company: {
        id: data.company.connect.id,
        businessName: 'Tech Innovations Colombia S.A.S.',
        nit: '900123456-1',
        city: 'Cúcuta',
        agreements: [],
      },
      createdBy: {
        id: data.createdBy.connect.id,
        name: 'Tutor Test',
        email: 'tutor@test.com',
      },
      _count: {
        applications: 0,
      },
      applications: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.vacancies.push(newVacancy);
    return newVacancy as any;
  }

  async update(id: string, data: any) {
    const v = this.vacancies.find((item) => item.id === id);
    if (!v) throw new Error('Vacancy not found');
    Object.assign(v, data, { updatedAt: new Date() });
    return v;
  }

  async updateStatus(id: string, status: VacancyStatus) {
    const v = this.vacancies.find((item) => item.id === id);
    if (!v) throw new Error('Vacancy not found');
    v.status = status;
    v.updatedAt = new Date();
    return v;
  }

  async findByCompanyId(companyId: string) {
    return this.vacancies.filter((v) => v.companyId === companyId && !v.deletedAt);
  }
}

class MockCompanyRepository extends CompanyRepository {
  public companies: any[] = [];

  constructor(initialCompanies: any[] = []) {
    super();
    this.companies = [...initialCompanies];
  }

  async findById(id: string) {
    return this.companies.find((c) => c.id === id && !c.deletedAt) || null;
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

// ------------------------------------------------------------------------------
// SUITE DE PRUEBAS
// ------------------------------------------------------------------------------

async function runTests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 Iniciando Suite: Creación y Publicación de Convocatorias Empresariales');
  console.log('🧪 Historia: "Como entidad empleadora, quiero crear y publicar');
  console.log('🧪  convocatorias vinculadas a programas académicos y periodos específicos,"');
  console.log('🧪  para captar perfiles de practicantes idóneos."');
  console.log('🧪 ====================================================================\n');

  // Actores de prueba
  const tutorEmpresarial: AuthenticatedUser = {
    id: 'tutor-emp-01',
    email: 'tutor@techinnovations.co',
    name: 'Ing. Andrés Silva',
    role: 'TUTOR_EMPRESARIAL',
    companyId: 'comp-tech-innovations',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const tutorSinEmpresa: AuthenticatedUser = {
    id: 'tutor-sin-emp-02',
    email: 'tutor.libre@correo.com',
    name: 'Tutor Sin Empresa',
    role: 'TUTOR_EMPRESARIAL',
    companyId: null,
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const adminActor: AuthenticatedUser = {
    id: 'admin-01',
    email: 'admin@ufps.edu.co',
    name: 'Administrador General',
    role: 'ADMIN',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const studentActor: AuthenticatedUser = {
    id: 'student-01',
    email: 'estudiante@ufps.edu.co',
    name: 'Estudiante Practicante',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  // Empresas de prueba
  const companyWithAgreement = {
    id: 'comp-tech-innovations',
    nit: '900123456-1',
    businessName: 'Tech Innovations Colombia S.A.S.',
    city: 'Cúcuta',
    isActive: true,
    deletedAt: null,
  };

  const companyWithoutAgreement = {
    id: 'comp-sin-convenio',
    nit: '900999888-2',
    businessName: 'Empresa Sin Convenio S.A.S.',
    city: 'Bogotá',
    isActive: true,
    deletedAt: null,
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

  // Repositorios Mock
  const mockCompanyRepo = new MockCompanyRepository([
    companyWithAgreement,
    companyWithoutAgreement,
  ]);
  const mockAgreementRepo = new MockAgreementRepository([validAgreement]);
  const mockVacancyRepo = new MockVacancyRepository();

  const service = new VacancyManagementService(
    mockVacancyRepo,
    mockCompanyRepo,
    mockAgreementRepo
  );

  // ----------------------------------------------------------------------------
  // TEST 1 (Criterio 1): Creación y publicación exitosa vinculada a programa y periodo
  // ----------------------------------------------------------------------------
  console.log('📌 Test 1 (Criterio 1): Creación y publicación exitosa de convocatoria...');
  const vacancyData = {
    title: 'Desarrollador Fullstack Cloud Junior',
    description: 'Participación en proyectos ágiles con arquitectura de microservicios y React.',
    requirements: 'Estudiante con conocimientos en TypeScript, Next.js y bases de datos relacionales.',
    program: 'Ingeniería de Sistemas',
    academicPeriod: '2026-1',
    vacanciesCount: 2,
    status: 'PUBLICADA' as const,
    startDate: new Date('2026-02-01'),
    endDate: new Date('2026-06-30'),
  };

  const createdVacancy = await service.createVacancy(vacancyData, tutorEmpresarial);

  if (
    createdVacancy.title === vacancyData.title &&
    createdVacancy.program === 'Ingeniería de Sistemas' &&
    createdVacancy.academicPeriod === '2026-1' &&
    createdVacancy.status === 'PUBLICADA' &&
    createdVacancy.vacanciesCount === 2 &&
    createdVacancy.company.hasActiveAgreement === true
  ) {
    console.log('  ✅ PASÓ (Criterio 1): Convocatoria creada y publicada exitosamente con programa Ingeniería de Sistemas y periodo 2026-1');
  } else {
    throw new Error('Fallo en Test 1: Los datos de la convocatoria no coinciden con lo esperado');
  }

  // ----------------------------------------------------------------------------
  // TEST 2 (Criterio 2): Guardado exitoso de convocatoria en estado BORRADOR
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 2 (Criterio 2): Creación de convocatoria en estado BORRADOR...');
  const draftData = {
    title: 'Ingeniero de Automatización QA',
    description: 'Diseño de pruebas automatizadas y soporte a integración continua.',
    requirements: 'Conocimientos en Cypress o Playwright y pruebas de software.',
    program: 'Ingeniería de Sistemas',
    academicPeriod: '2026-2',
    vacanciesCount: 1,
    status: 'BORRADOR' as const,
  };

  const createdDraft = await service.createVacancy(draftData, tutorEmpresarial);

  if (createdDraft.status === 'BORRADOR' && createdDraft.title === draftData.title) {
    console.log('  ✅ PASÓ (Criterio 2): Convocatoria guardada correctamente como BORRADOR');
  } else {
    throw new Error('Fallo en Test 2: La convocatoria debía estar en estado BORRADOR');
  }

  // ----------------------------------------------------------------------------
  // TEST 3 (Criterio 3): Publicación exitosa de convocatoria en BORRADOR (RN-01)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 3 (Criterio 3): Publicación de convocatoria previamente en BORRADOR...');
  const publishedFromDraft = await service.publishVacancy(createdDraft.id, tutorEmpresarial);

  if (publishedFromDraft.status === 'PUBLICADA') {
    console.log('  ✅ PASÓ (Criterio 3): Convocatoria transicionada a PUBLICADA validando convenio vigente');
  } else {
    throw new Error('Fallo en Test 3: No se pudo publicar la convocatoria en borrador');
  }

  // ----------------------------------------------------------------------------
  // TEST 4 (Criterio 4): Bloqueo RN-01 para empresa sin convenio VIGENTE
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 4 (Criterio 4): Bloqueo RN-01 al intentar publicar sin convenio VIGENTE...');
  try {
    await service.createVacancy(
      {
        companyId: companyWithoutAgreement.id,
        title: 'Desarrollador Backend Python',
        description: 'Desarrollo de APIs REST en FastAPI y bases de datos PostgreSQL.',
        requirements: 'Python y Docker.',
        program: 'Ingeniería de Sistemas',
        academicPeriod: '2026-1',
        vacanciesCount: 1,
        status: 'PUBLICADA',
      },
      adminActor
    );
    throw new Error('Debería haber fallado por falta de convenio VIGENTE (RN-01)');
  } catch (error: any) {
    if (error.code === 'RN01_AGREEMENT_NOT_ACTIVE') {
      console.log(`  ✅ PASÓ (Criterio 4): Validación RN-01 interceptada -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 5 (Criterio 5): Rechazo por número de cupos menor a 1
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 5 (Criterio 5): Rechazo por número de cupos inválido (vacanciesCount < 1)...');
  try {
    await service.createVacancy(
      {
        title: 'Analista de Seguridad TI',
        description: 'Análisis de vulnerabilidades y monitoreo de redes.',
        requirements: 'Redes y seguridad de la información.',
        program: 'Ingeniería de Sistemas',
        academicPeriod: '2026-1',
        vacanciesCount: 0, // Inválido
        status: 'BORRADOR',
      },
      tutorEmpresarial
    );
    throw new Error('Debería haber fallado por cupos inválidos');
  } catch (error: any) {
    if (error.code === 'INVALID_VACANCIES_COUNT') {
      console.log(`  ✅ PASÓ (Criterio 5): Error de cupos validado -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 6 (Criterio 6): Rechazo por campos obligatorios faltantes o insuficientes
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 6 (Criterio 6): Rechazo por periodo académico faltante o insuficiente...');
  try {
    await service.createVacancy(
      {
        title: 'Desarrollador Móvil',
        description: 'Aplicaciones móviles en React Native y Expo.',
        requirements: 'React Native.',
        academicPeriod: '', // Faltante
        vacanciesCount: 1,
      },
      tutorEmpresarial
    );
    throw new Error('Debería haber fallado por academicPeriod faltante');
  } catch (error: any) {
    if (error.code === 'INVALID_ACADEMIC_PERIOD') {
      console.log(`  ✅ PASÓ (Criterio 6): Validación de periodo académico -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 7 (Criterio 7): Rechazo por rango de fechas inconsistente
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 7 (Criterio 7): Rechazo si fecha de fin es anterior a fecha de inicio...');
  try {
    await service.createVacancy(
      {
        title: 'Desarrollador Frontend',
        description: 'Desarrollo de interfaces accesibles con Tailwind CSS.',
        requirements: 'HTML, CSS y JavaScript moderno.',
        academicPeriod: '2026-1',
        vacanciesCount: 1,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-01-01'), // Anterior a startDate
      },
      tutorEmpresarial
    );
    throw new Error('Debería haber fallado por fechas inconsistentes');
  } catch (error: any) {
    if (error.code === 'INVALID_DATE_RANGE') {
      console.log(`  ✅ PASÓ (Criterio 7): Inconsistencia de fechas detectada -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 8 (Criterio 8): Restricción de permisos RBAC para rol no autorizado
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 8 (Criterio 8): Denegación de creación a rol ESTUDIANTE (RBAC)...');
  try {
    await service.createVacancy(
      {
        title: 'Intento por Estudiante',
        description: 'Descripción de prueba.',
        requirements: 'Requisitos de prueba.',
        academicPeriod: '2026-1',
        vacanciesCount: 1,
      },
      studentActor
    );
    throw new Error('Debería haber fallado por rol no autorizado');
  } catch (error: any) {
    if (error.code === 'FORBIDDEN_OPERATION') {
      console.log(`  ✅ PASÓ (Criterio 8): RBAC bloquea a estudiante -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 9 (Criterio 9): Rechazo si el Tutor Empresarial no tiene empresa asociada
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 9 (Criterio 9): Rechazo a tutor empresarial sin empresa asignada...');
  try {
    await service.createVacancy(
      {
        title: 'Convocatoria Sin Empresa',
        description: 'Descripción válida de más de diez caracteres.',
        requirements: 'Perfil idóneo requerido.',
        academicPeriod: '2026-1',
        vacanciesCount: 1,
      },
      tutorSinEmpresa
    );
    throw new Error('Debería haber fallado por tutor sin empresa');
  } catch (error: any) {
    if (error.code === 'TUTOR_WITHOUT_COMPANY') {
      console.log(`  ✅ PASÓ (Criterio 9): Error detectado -> [${error.code}] ${error.message}`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 10 (Criterio 10): Consulta de convocatorias creadas por la entidad empleadora
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 10 (Criterio 10): Listado de convocatorias de la entidad empleadora...');
  const companyVacancies = await service.getCompanyVacancies(companyWithAgreement.id, tutorEmpresarial);

  if (companyVacancies.length >= 2) {
    console.log(`  ✅ PASÓ (Criterio 10): Se recuperaron ${companyVacancies.length} convocatoria(s) de la empresa empleadora`);
  } else {
    throw new Error('Fallo en Test 10: No se listaron las convocatorias esperadas');
  }

  // ----------------------------------------------------------------------------
  // TEST 11 (Criterio 11): Verificación HTTP de Route Handler POST /api/v1/vacantes
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 11 (Criterio 11): Verificación de endpoint HTTP POST /api/v1/vacantes...');
  const tutorToken = generateToken({
    userId: tutorEmpresarial.id,
    email: tutorEmpresarial.email,
    role: 'TUTOR_EMPRESARIAL',
    name: tutorEmpresarial.name,
    companyId: tutorEmpresarial.companyId,
    status: 'ACTIVO',
    tokenVersion: 1,
  });

  const studentToken = generateToken({
    userId: studentActor.id,
    email: studentActor.email,
    role: 'ESTUDIANTE',
    name: studentActor.name,
    status: 'ACTIVO',
    tokenVersion: 1,
  });

  // Sin autenticación -> 401
  const reqUnauth = new NextRequest('http://localhost:3000/api/v1/vacantes', {
    method: 'POST',
    body: JSON.stringify({ title: 'Test' }),
  });
  const resUnauth = await postVacanteRouteHandler(reqUnauth);
  if (resUnauth.status === 401) {
    console.log('  ✅ PASÓ (Criterio 11 - Auth): 401 Unauthorized sin token');
  } else {
    throw new Error(`Esperaba 401 pero recibí ${resUnauth.status}`);
  }

  // Con rol no autorizado (ESTUDIANTE) -> 403
  const reqForbidden = new NextRequest('http://localhost:3000/api/v1/vacantes', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Convocatoria Test',
      description: 'Descripción con más de diez caracteres.',
      requirements: 'Perfil idóneo requerido.',
      academicPeriod: '2026-1',
      vacanciesCount: 1,
    }),
  });
  const resForbidden = await postVacanteRouteHandler(reqForbidden);
  if (resForbidden.status === 403) {
    console.log('  ✅ PASÓ (Criterio 11 - RBAC): 403 Forbidden para rol ESTUDIANTE');
  } else {
    throw new Error(`Esperaba 403 pero recibí ${resForbidden.status}`);
  }

  // Validación Zod por datos incompletos -> 422
  const reqInvalid = new NextRequest('http://localhost:3000/api/v1/vacantes', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tutorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Corto', // < 5 caracteres
    }),
  });
  const resInvalid = await postVacanteRouteHandler(reqInvalid);
  if (resInvalid.status === 422) {
    console.log('  ✅ PASÓ (Criterio 11 - Validación Zod): 422 Unprocessable Entity');
  } else {
    throw new Error(`Esperaba 422 pero recibí ${resInvalid.status}`);
  }

  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE LA HU EMPLEADOR CONVOCATORIA PASARON CON ÉXITO');
  console.log('🎉 ====================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ ERROR FATAL EN PRUEBAS:', err);
  process.exit(1);
});
