// ==============================================================================
// SIGETRAP - Suite de Pruebas HU05 / CU02: Apertura y Configuración de Periodos Lectivos
// Historia de Usuario:
//   "Como coordinador, quiero aperturar y configurar periodos lectivos con fechas
//    estrictas de vigencia, para enmarcar temporalmente las convocatorias e informes."
//
// Detalles Técnicos:
//   - Módulo / Épica: Parametrización de Periodos Académicos
//   - Caso de Uso Asociado: CU02 - Parametrización y Elegibilidad Académica
//   - Entidades BD: periodos_academicos
//   - Restricciones SQL (Constraints): chk_fechas_periodo (fecha_fin > fecha_inicio)
//
// Criterios de Aceptación Evaluados:
//   - Criterio 1: Restricción de fechas coherentes (PU)
//                 Dado que se ingresan datos de un periodo donde la fecha de inicio
//                 es posterior a la fecha de fin, cuando se intenta registrar en la
//                 base de datos, entonces la validación falla por la restricción
//                 chk_fechas_periodo y el API devuelve 400 Bad Request indicando
//                 fecha_fin > fecha_inicio.
//   - Criterio 2: Apertura y configuración exitosa de periodo lectivo con fechas
//                 estrictas de vigencia (201 Created) y desactivación automática de
//                 periodos previos cuando se marca como vigente.
//   - Criterio 3: Validación de coherencia de fechas en ventanas de convocatorias
//                 e informes y verificación de enmarcado temporal.
//   - Criterio 4: Restricción de unicidad por código de periodo (uq_codigo_periodo -> 409).
//   - Criterio 5: Seguridad RBAC (401 Unauthorized sin token y 403 Forbidden para
//                 roles distintos a Coordinador / Administrador).
// ==============================================================================

import { NextRequest } from 'next/server';
import {
  AcademicPeriodService,
  AcademicPeriodValidationError,
  setAcademicPeriodServiceInstance,
} from '../src/server/services/academic-period.service';
import {
  AcademicPeriodRepository,
  CreateAcademicPeriodRecordInput,
  UpdateAcademicPeriodRecordInput,
  FindAcademicPeriodsParams,
} from '../src/server/repositories/academic-period.repository';
import { AuthenticatedUser } from '../src/types';
import {
  POST as postPeriodoHandler,
  GET as getPeriodosHandler,
} from '../src/app/api/v1/periodos-academicos/route';
import {
  GET as getPeriodoByIdHandler,
  PATCH as patchPeriodoByIdHandler,
} from '../src/app/api/v1/periodos-academicos/[id]/route';
import { generateToken } from '../src/lib/auth';

// ------------------------------------------------------------------------------
// MOCK EN MEMORIA DE LA TABLA periodos_academicos CON RESTRICCIÓN SQL chk_fechas_periodo
// ------------------------------------------------------------------------------

class MockAcademicPeriodRepository extends AcademicPeriodRepository {
  public periods: any[] = [];

  constructor(initialPeriods: any[] = []) {
    super();
    this.periods = initialPeriods.map((p) => ({ ...p }));
  }

  private enforceSqlConstraints(
    data: {
      code?: string;
      startDate: Date;
      endDate: Date;
      vacanciesStartDate?: Date | null;
      vacanciesEndDate?: Date | null;
      reportsStartDate?: Date | null;
      reportsEndDate?: Date | null;
    },
    excludeId?: string
  ) {
    // Simulación exacta de CONSTRAINT "chk_fechas_periodo" CHECK ("fecha_fin" > "fecha_inicio") en PostgreSQL
    if (new Date(data.endDate).getTime() <= new Date(data.startDate).getTime()) {
      const sqlError: any = new Error(
        'new row for relation "periodos_academicos" violates check constraint "chk_fechas_periodo"'
      );
      sqlError.code = '23514'; // PostgreSQL check_violation
      sqlError.constraint = 'chk_fechas_periodo';
      throw sqlError;
    }

    // Simulación de CONSTRAINT "uq_codigo_periodo" UNIQUE ("codigo")
    if (data.code) {
      const duplicate = this.periods.find(
        (p) =>
          p.code.trim().toLowerCase() === data.code!.trim().toLowerCase() &&
          p.id !== excludeId &&
          !p.deletedAt
      );
      if (duplicate) {
        const uniqueError: any = new Error(
          'duplicate key value violates unique constraint "uq_codigo_periodo"'
        );
        uniqueError.code = '23505'; // PostgreSQL unique_violation
        uniqueError.constraint = 'uq_codigo_periodo';
        throw uniqueError;
      }
    }
  }

  async findById(id: string) {
    return this.periods.find((p) => p.id === id && !p.deletedAt) || null;
  }

  async findByCode(code: string) {
    const normalized = code.trim().toLowerCase();
    return (
      this.periods.find(
        (p) => p.code.trim().toLowerCase() === normalized && !p.deletedAt
      ) || null
    );
  }

  async findActivePeriod() {
    return (
      this.periods.find(
        (p) => p.isActive === true && p.status === 'Abierto' && !p.deletedAt
      ) || null
    );
  }

  async findMany(params: FindAcademicPeriodsParams = {}) {
    let filtered = this.periods.filter((p) => !p.deletedAt);

    if (params.status) {
      filtered = filtered.filter((p) => p.status === params.status);
    }

    if (params.isActive !== undefined) {
      filtered = filtered.filter((p) => p.isActive === params.isActive);
    }

    if (params.search && params.search.trim() !== '') {
      const s = params.search.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.code.toLowerCase().includes(s) ||
          p.name.toLowerCase().includes(s) ||
          (p.description && p.description.toLowerCase().includes(s))
      );
    }

    const skip = params.skip ?? 0;
    const take = params.take ?? 50;

    return {
      periods: filtered.slice(skip, skip + take),
      total: filtered.length,
    };
  }

  async create(data: CreateAcademicPeriodRecordInput) {
    this.enforceSqlConstraints({
      code: data.code,
      startDate: data.startDate,
      endDate: data.endDate,
      vacanciesStartDate: data.vacanciesStartDate,
      vacanciesEndDate: data.vacanciesEndDate,
      reportsStartDate: data.reportsStartDate,
      reportsEndDate: data.reportsEndDate,
    });

    const newRecord = {
      id: `per_${Date.now()}_${Math.random().toString(36).substring(6)}`,
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      vacanciesStartDate: data.vacanciesStartDate ? new Date(data.vacanciesStartDate) : null,
      vacanciesEndDate: data.vacanciesEndDate ? new Date(data.vacanciesEndDate) : null,
      reportsStartDate: data.reportsStartDate ? new Date(data.reportsStartDate) : null,
      reportsEndDate: data.reportsEndDate ? new Date(data.reportsEndDate) : null,
      status: data.status ?? 'Abierto',
      isActive: data.isActive ?? true,
      createdById: data.createdById ?? null,
      createdBy: data.createdById
        ? {
            id: data.createdById,
            name: 'Dr. Roberto Gómez (Coordinador)',
            email: 'director.sistemas@ufps.edu.co',
            role: 'DIRECTOR_PROGRAMA' as const,
          }
        : null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    this.periods.push(newRecord);
    return newRecord;
  }

  async update(id: string, data: UpdateAcademicPeriodRecordInput) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('AcademicPeriod not found');
    }

    const nextStartDate = data.startDate ? new Date(data.startDate) : existing.startDate;
    const nextEndDate = data.endDate ? new Date(data.endDate) : existing.endDate;
    const nextCode = data.code ?? existing.code;

    this.enforceSqlConstraints(
      {
        code: nextCode,
        startDate: nextStartDate,
        endDate: nextEndDate,
      },
      id
    );

    Object.assign(existing, data, {
      startDate: nextStartDate,
      endDate: nextEndDate,
      updatedAt: new Date(),
    });

    return existing;
  }

  async deactivateOtherPeriods(excludeId: string) {
    let count = 0;
    for (const p of this.periods) {
      if (p.id !== excludeId && p.isActive && !p.deletedAt) {
        p.isActive = false;
        count++;
      }
    }
    return { count };
  }
}

// ------------------------------------------------------------------------------
// EJECUCIÓN DE CASOS DE PRUEBA (PU / INTEGRACIÓN API)
// ------------------------------------------------------------------------------

async function runTests() {
  console.log('🧪 ==============================================================================');
  console.log('🧪 Iniciando Suite de Pruebas: HU05 - Apertura y Configuración de Periodos Lectivos');
  console.log('🧪 Módulo / Épica: Parametrización de Periodos Académicos (CU02)');
  console.log('🧪 Entidades BD: periodos_academicos | Restricciones SQL: chk_fechas_periodo');
  console.log('🧪 ==============================================================================\n');

  const coordinatorActor: AuthenticatedUser = {
    id: 'c2222222-2222-2222-2222-222222222222',
    email: 'director.sistemas@ufps.edu.co',
    name: 'Dr. Roberto Gómez (Coordinador)',
    role: 'DIRECTOR_PROGRAMA',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const studentActor: AuthenticatedUser = {
    id: 'c5555555-5555-5555-5555-555555555555',
    email: 'estudiante@ufps.edu.co',
    name: 'Juan David Pérez (Estudiante)',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const coordinatorToken = generateToken({
    userId: coordinatorActor.id,
    email: coordinatorActor.email,
    role: coordinatorActor.role,
    name: coordinatorActor.name,
    status: coordinatorActor.status,
    tokenVersion: coordinatorActor.tokenVersion,
  });

  const studentToken = generateToken({
    userId: studentActor.id,
    email: studentActor.email,
    role: studentActor.role,
    name: studentActor.name,
    status: studentActor.status,
    tokenVersion: studentActor.tokenVersion,
  });

  const initialPeriod2026_1 = {
    id: 'f1111111-1111-1111-1111-111111111111',
    code: '2026-1',
    name: 'Primer Semestre Académico 2026',
    description: 'Periodo lectivo primer semestre 2026',
    startDate: new Date('2026-02-01T00:00:00.000Z'),
    endDate: new Date('2026-06-30T23:59:59.000Z'),
    vacanciesStartDate: new Date('2026-02-01T00:00:00.000Z'),
    vacanciesEndDate: new Date('2026-03-15T23:59:59.000Z'),
    reportsStartDate: new Date('2026-03-01T00:00:00.000Z'),
    reportsEndDate: new Date('2026-06-25T23:59:59.000Z'),
    status: 'Abierto',
    isActive: true,
    createdById: coordinatorActor.id,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    updatedAt: new Date('2026-01-15T00:00:00.000Z'),
    deletedAt: null,
  };

  const mockRepo = new MockAcademicPeriodRepository([initialPeriod2026_1]);
  const service = new AcademicPeriodService(mockRepo);
  setAcademicPeriodServiceInstance(service);

  // ============================================================================
  // CRITERIO 1: Restricción de fechas coherentes (PU) - chk_fechas_periodo
  // "Dado que se ingresan datos de un periodo donde la fecha de inicio es
  //  posterior a la fecha de fin, Cuando se intenta registrar en la base de datos,
  //  Entonces la validación falla por la restricción chk_fechas_periodo y el API
  //  devuelve 400 Bad Request indicando fecha_fin > fecha_inicio."
  // ============================================================================
  console.log('📌 Test 1 (Criterio 1 - PU Servicio): Rechazo cuando fecha_inicio es posterior a fecha_fin (chk_fechas_periodo)...');
  try {
    await service.openAndConfigurePeriod(
      {
        codigo: '2026-2',
        nombre: 'Segundo Semestre Académico 2026',
        fecha_inicio: '2026-12-15', // Posterior a fecha_fin
        fecha_fin: '2026-08-01',
      },
      coordinatorActor
    );
    throw new Error('❌ FALLÓ Test 1: Se esperaba fallo por chk_fechas_periodo');
  } catch (error: any) {
    if (
      error instanceof AcademicPeriodValidationError &&
      error.statusCode === 400 &&
      error.constraint === 'chk_fechas_periodo' &&
      error.message.includes('chk_fechas_periodo') &&
      error.message.includes('fecha_fin > fecha_inicio')
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 1 - Servicio): Rechazado con HTTP ${error.statusCode} -> [${error.constraint}] ${error.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 1: Error inesperado -> ${error?.message}`);
    }
  }

  console.log('\n📌 Test 2 (Criterio 1 - API HTTP 400 Bad Request): POST /api/v1/periodos-academicos con fecha_inicio > fecha_fin...');
  const reqInvalidDates = new NextRequest('http://localhost:3000/api/v1/periodos-academicos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${coordinatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      codigo: '2026-2',
      nombre: 'Segundo Semestre Académico 2026',
      fecha_inicio: '2026-11-30',
      fecha_fin: '2026-07-01',
    }),
  });

  const resInvalidDates = await postPeriodoHandler(reqInvalidDates);
  const bodyInvalidDates = await resInvalidDates.json();

  if (
    resInvalidDates.status === 400 &&
    bodyInvalidDates.success === false &&
    bodyInvalidDates.error?.details?.constraint === 'chk_fechas_periodo' &&
    bodyInvalidDates.error?.message?.includes('chk_fechas_periodo') &&
    bodyInvalidDates.error?.message?.includes('fecha_fin > fecha_inicio')
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1 - API HTTP): API respondió 400 Bad Request con constraint '${bodyInvalidDates.error.details.constraint}' y regla '${bodyInvalidDates.error.details.rule}'`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 2: Respuesta inesperada (${resInvalidDates.status}): ${JSON.stringify(bodyInvalidDates)}`
    );
  }

  console.log('\n📌 Test 3 (Criterio 1 - Restricción SQL directa 23514): Intercepción cuando el motor BD lanza violación chk_fechas_periodo...');
  try {
    // Simulamos que el repositorio dispara directamente el error PostgreSQL 23514 (chk_fechas_periodo)
    await (service as any).handleDatabaseError({
      code: '23514',
      constraint: 'chk_fechas_periodo',
      message: 'new row for relation "periodos_academicos" violates check constraint "chk_fechas_periodo"',
    });
    throw new Error('❌ FALLÓ Test 3: Debió lanzar AcademicPeriodValidationError');
  } catch (error: any) {
    if (
      error instanceof AcademicPeriodValidationError &&
      error.statusCode === 400 &&
      error.constraint === 'chk_fechas_periodo' &&
      error.message.includes('fecha_fin > fecha_inicio')
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 1 - SQL 23514): Error PostgreSQL 23514 interceptado y transformado a 400 Bad Request (${error.constraint}: fecha_fin > fecha_inicio)`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 3: ${error?.message}`);
    }
  }

  console.log('\n📌 Test 4 (Criterio 1 - Fechas iguales): Rechazo cuando fecha_inicio === fecha_fin...');
  const reqEqualDates = new NextRequest('http://localhost:3000/api/v1/periodos-academicos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${coordinatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      codigo: '2026-2',
      nombre: 'Segundo Semestre Académico 2026',
      fecha_inicio: '2026-08-01',
      fecha_fin: '2026-08-01',
    }),
  });
  const resEqualDates = await postPeriodoHandler(reqEqualDates);
  const bodyEqualDates = await resEqualDates.json();
  if (
    resEqualDates.status === 400 &&
    bodyEqualDates.error?.details?.constraint === 'chk_fechas_periodo' &&
    bodyEqualDates.error?.message?.includes('fecha_fin > fecha_inicio')
  ) {
    console.log('  ✅ PASÓ (Criterio 1 - Fechas Iguales): API devuelve 400 Bad Request exigiendo fecha_fin > fecha_inicio');
  } else {
    throw new Error('❌ FALLÓ Test 4: Fechas iguales debían rechazarse con 400');
  }

  // ============================================================================
  // CRITERIO 2: Apertura y configuración exitosa de un periodo lectivo (201 Created)
  // ============================================================================
  console.log('\n📌 Test 5 (Apertura Exitosa): Registro de nuevo periodo lectivo 2026-2 con fechas estrictas de vigencia...');
  const reqCreateValid = new NextRequest('http://localhost:3000/api/v1/periodos-academicos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${coordinatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      codigo: '2026-2',
      nombre: 'Segundo Semestre Académico 2026',
      descripcion: 'Periodo lectivo oficial del segundo semestre de 2026.',
      fecha_inicio: '2026-08-01T00:00:00.000Z',
      fecha_fin: '2026-12-15T23:59:59.000Z',
      fecha_inicio_convocatorias: '2026-08-01T00:00:00.000Z',
      fecha_fin_convocatorias: '2026-09-30T23:59:59.000Z',
      fecha_inicio_informes: '2026-09-01T00:00:00.000Z',
      fecha_fin_informes: '2026-12-10T23:59:59.000Z',
      estado: 'Abierto',
      activo: true,
    }),
  });

  const resCreateValid = await postPeriodoHandler(reqCreateValid);
  const bodyCreateValid = await resCreateValid.json();

  if (
    resCreateValid.status === 201 &&
    bodyCreateValid.success === true &&
    bodyCreateValid.data?.codigo === '2026-2' &&
    bodyCreateValid.data?.estado === 'Abierto' &&
    bodyCreateValid.data?.activo === true
  ) {
    console.log(
      `  ✅ PASÓ (Apertura Exitosa): Periodo '${bodyCreateValid.data.codigo}' aperturado con HTTP 201 Created`
    );
  } else {
    throw new Error(
      `❌ FALLÓ Test 5: No se pudo crear el periodo válido (${resCreateValid.status}): ${JSON.stringify(bodyCreateValid)}`
    );
  }

  // Verificar que el periodo anterior (2026-1) quedó desactivado como vigente al activar 2026-2
  const prevPeriod = await mockRepo.findByCode('2026-1');
  if (prevPeriod && prevPeriod.isActive === false) {
    console.log('  ✅ PASÓ (Vigencia Única): El periodo anterior 2026-1 se desactivó automáticamente al aperturar 2026-2 como vigente.');
  } else {
    throw new Error('❌ FALLÓ Test 5B: El periodo anterior debía desactivarse al activar el nuevo.');
  }

  // ============================================================================
  // CRITERIO 3: Configuración / actualización de fechas y enmarcado temporal
  // ============================================================================
  console.log('\n📌 Test 6 (Actualización y Restricción chk_fechas_periodo en PATCH): Intento de actualizar con fecha_fin < fecha_inicio...');
  const createdPeriodId = bodyCreateValid.data.id;

  const reqPatchInvalid = new NextRequest(
    `http://localhost:3000/api/v1/periodos-academicos/${createdPeriodId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fecha_inicio: '2026-12-20',
        fecha_fin: '2026-08-10',
      }),
    }
  );

  const resPatchInvalid = await patchPeriodoByIdHandler(reqPatchInvalid, {
    params: Promise.resolve({ id: createdPeriodId }),
  });
  const bodyPatchInvalid = await resPatchInvalid.json();

  if (
    resPatchInvalid.status === 400 &&
    bodyPatchInvalid.error?.details?.constraint === 'chk_fechas_periodo' &&
    bodyPatchInvalid.error?.message?.includes('fecha_fin > fecha_inicio')
  ) {
    console.log(
      '  ✅ PASÓ (PATCH chk_fechas_periodo): Actualización con fechas incoherentes rechazada con 400 Bad Request'
    );
  } else {
    throw new Error('❌ FALLÓ Test 6: PATCH con fechas incoherentes debía devolver 400');
  }

  console.log('\n📌 Test 7 (Enmarcado Temporal de Convocatorias e Informes): Verificación de fechas dentro y fuera de vigencia...');
  const validConvocatoriaCheck = await service.verifyTemporalFraming(
    '2026-2',
    'CONVOCATORIA',
    new Date('2026-08-15T12:00:00.000Z')
  );
  const expiredConvocatoriaCheck = await service.verifyTemporalFraming(
    '2026-2',
    'CONVOCATORIA',
    new Date('2026-11-15T12:00:00.000Z') // Fuera de ventana de convocatorias (hasta 2026-09-30)
  );
  const validInformeCheck = await service.verifyTemporalFraming(
    '2026-2',
    'INFORME',
    new Date('2026-10-20T12:00:00.000Z')
  );

  if (
    validConvocatoriaCheck.isValid === true &&
    expiredConvocatoriaCheck.isValid === false &&
    validInformeCheck.isValid === true
  ) {
    console.log(
      '  ✅ PASÓ (Enmarcado Temporal): El periodo lectivo enmarca correctamente las fechas permitidas para convocatorias e informes.'
    );
  } else {
    throw new Error('❌ FALLÓ Test 7: Fallo en la validación de enmarcado temporal.');
  }

  // ============================================================================
  // CRITERIO 4: Unicidad de código de periodo (uq_codigo_periodo -> 409 Conflict)
  // ============================================================================
  console.log('\n📌 Test 8 (Restricción UNIQUE codigo): Rechazo al intentar aperturar un periodo con código duplicado (2026-2)...');
  const reqDuplicate = new NextRequest('http://localhost:3000/api/v1/periodos-academicos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${coordinatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      codigo: '2026-2',
      nombre: 'Periodo Duplicado',
      fecha_inicio: '2026-08-01',
      fecha_fin: '2026-12-15',
    }),
  });
  const resDuplicate = await postPeriodoHandler(reqDuplicate);
  if (resDuplicate.status === 409) {
    console.log('  ✅ PASÓ (Unicidad uq_codigo_periodo): Código duplicado rechazado con 409 Conflict');
  } else {
    throw new Error(`❌ FALLÓ Test 8: Se esperaba 409 Conflict pero se recibió ${resDuplicate.status}`);
  }

  // ============================================================================
  // CRITERIO 5: Seguridad RBAC y Consulta GET
  // ============================================================================
  console.log('\n📌 Test 9 (Seguridad RBAC): Denegación de apertura de periodo a rol ESTUDIANTE (403) y sin token (401)...');
  const reqUnauth = new NextRequest('http://localhost:3000/api/v1/periodos-academicos', {
    method: 'POST',
    body: JSON.stringify({
      codigo: '2027-1',
      nombre: 'Primer Semestre 2027',
      fecha_inicio: '2027-02-01',
      fecha_fin: '2027-06-30',
    }),
  });
  const resUnauth = await postPeriodoHandler(reqUnauth);

  const reqForbidden = new NextRequest('http://localhost:3000/api/v1/periodos-academicos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      codigo: '2027-1',
      nombre: 'Primer Semestre 2027',
      fecha_inicio: '2027-02-01',
      fecha_fin: '2027-06-30',
    }),
  });
  const resForbidden = await postPeriodoHandler(reqForbidden);

  if (resUnauth.status === 401 && resForbidden.status === 403) {
    console.log('  ✅ PASÓ (RBAC): 401 Unauthorized sin sesión y 403 Forbidden para rol ESTUDIANTE');
  } else {
    throw new Error(
      `❌ FALLÓ Test 9: Esperaba 401/403 pero recibió ${resUnauth.status}/${resForbidden.status}`
    );
  }

  console.log('\n📌 Test 10 (Consulta GET): Listado de periodos académicos y obtención por ID...');
  const reqList = new NextRequest('http://localhost:3000/api/v1/periodos-academicos');
  const resList = await getPeriodosHandler(reqList);
  const bodyList = await resList.json();

  const reqDetail = new NextRequest(
    `http://localhost:3000/api/v1/periodos-academicos/${createdPeriodId}`
  );
  const resDetail = await getPeriodoByIdHandler(reqDetail, {
    params: Promise.resolve({ id: createdPeriodId }),
  });
  const bodyDetail = await resDetail.json();

  if (
    resList.status === 200 &&
    bodyList.data?.items?.length === 2 &&
    bodyList.data?.activePeriod?.codigo === '2026-2' &&
    resDetail.status === 200 &&
    bodyDetail.data?.codigo === '2026-2'
  ) {
    console.log('  ✅ PASÓ (Consulta GET): Listado y detalle de periodos lectivos retornados correctamente.');
  } else {
    throw new Error('❌ FALLÓ Test 10: Error en la consulta GET de periodos lectivos.');
  }

  console.log('\n🎉 ==============================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE LA HU05 (PERIODOS LECTIVOS - CU02) PASARON EXITOSAMENTE');
  console.log('🎉 ==============================================================================\n');
}

runTests().catch((error) => {
  console.error('\n❌ ERROR FATAL EN SUITE DE PRUEBAS HU05:', error);
  process.exit(1);
});
