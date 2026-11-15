// ==============================================================================
// SIGETRAP - Suite de Pruebas: HU20 - Protocolo de Traslado y Reubicación de
// Practicante por Ausencia de Tutor Empresarial
//
// Historia de Usuario:
//   "Como Director de Programa y Coordinador de Prácticas, quiero disponer de un
//    flujo de contingencia que permita desvincular a un estudiante de una empresa
//    cuando esta carezca de tutor empresarial disponible y trasladarlo a otra
//    empresa receptora compatible con su perfil (dejando a la UFPS como opción
//    institucional de última instancia), para salvaguardar la continuidad del
//    proceso formativo del practicante sin perder las horas previamente validadas."
//
// Criterios de Aceptación y Reglas de Negocio Evaluados:
//   - Criterio 1: Declaración de causa específica AUSENCIA_TUTOR_EMPRESARIAL,
//     congelamiento de la práctica actual (EN_TRASLADO_EMPRESARIAL) y generación
//     del informe oficial de corte con las horas acumuladas hasta la fecha.
//   - Criterio 2: Búsqueda y compatibilidad de empresas receptoras disponibles
//     con vacantes abiertas y convenio vigente que coincidan con los skills del
//     estudiante, ordenando a la UFPS al final como contingencia de última instancia.
//   - Criterio 3: Asignación a nueva entidad y nuevo tutor empresarial, preservación
//     del historial de informes y horas válidas del periodo anterior, y emisión de
//     notificaciones a estudiante, nueva empresa y docente tutor.
//   - RN01 (Preservación de horas): Las horas radicadas y aprobadas en la empresa
//     de origen no se pierden; se consolidan como saldo a favor en la práctica reubicada.
//   - RN02 (UFPS como último recurso): Advertencia de confirmación obligatoria y
//     justificación de agotamiento de plazas externas afines al seleccionar UFPS.
//   - RN03 (Nueva ARL / Notificación): Reevaluación del estado de ARL
//     (PENDIENTE_REVISION) para asegurar cobertura en las nuevas instalaciones físicas.
//   - Endpoints API:
//     * POST /api/v1/practicas/[id]/solicitar-traslado
//     * GET  /api/v1/practicas/[id]/empresas-compatibles-traslado
//     * POST /api/v1/practicas/[id]/confirmar-traslado
// ==============================================================================

import { NextRequest } from 'next/server';
import { generateToken } from '../src/lib/auth';
import {
  PracticeTransferRepository,
} from '../src/server/repositories/practice-transfer.repository';
import {
  PracticeTransferService,
  PracticeTransferError,
  setPracticeTransferServiceInstance,
} from '../src/server/services/practice-transfer.service';
import { AuthenticatedUser, Role } from '../src/types';
import { POST as postSolicitarTrasladoHandler } from '../src/app/api/v1/practicas/[id]/solicitar-traslado/route';
import { GET as getEmpresasCompatiblesHandler } from '../src/app/api/v1/practicas/[id]/empresas-compatibles-traslado/route';
import { POST as postConfirmarTrasladoHandler } from '../src/app/api/v1/practicas/[id]/confirmar-traslado/route';

// Mock en memoria del repositorio de traslado de prácticas (HU20)
class MockPracticeTransferRepository extends PracticeTransferRepository {
  public practices: Map<string, any> = new Map();
  public companies: Map<string, any> = new Map();
  public transfers: any[] = [];

  constructor() {
    super();
  }

  seedPractice(p: any) {
    this.practices.set(p.id, JSON.parse(JSON.stringify(p)));
  }

  seedCompany(c: any) {
    this.companies.set(c.id, JSON.parse(JSON.stringify(c)));
  }

  async findPracticeWithTransferContext(practiceId: string): Promise<any> {
    const p = this.practices.get(practiceId);
    if (!p) return null;
    const clone = JSON.parse(JSON.stringify(p));
    clone.transfers = this.transfers
      .filter((t) => t.practiceId === practiceId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    return clone;
  }

  async createTransferRequestAndFreezePractice(params: {
    practiceId: string;
    studentId: string;
    sourceCompanyId: string;
    previousStatus: any;
    reasonCode: any;
    justification: string;
    hoursTransferred: number;
    approvedById: string;
    cutoffReportData: {
      id: string;
      code: string;
      summary: string;
      generatedAt: string;
    };
  }): Promise<{ transfer: any; updatedPractice: any }> {
    const p = this.practices.get(params.practiceId);
    if (!p) throw new Error('Práctica no encontrada en mock');

    const transferRecord = {
      id: `trans-${this.transfers.length + 1}`,
      practiceId: params.practiceId,
      sourceCompanyId: params.sourceCompanyId,
      targetCompanyId: null,
      reasonCode: params.reasonCode,
      justification: params.justification,
      hoursTransferred: params.hoursTransferred,
      approvedById: params.approvedById,
      createdAt: params.cutoffReportData.generatedAt,
    };
    this.transfers.push(transferRecord);

    // Congelar práctica y consolidar horas acumuladas (Criterio 1 & RN01)
    p.currentStatus = 'EN_TRASLADO_EMPRESARIAL';
    p.transferStatus = 'EN_TRASLADO_EMPRESARIAL';
    p.totalHoursCompleted = params.hoursTransferred;
    p.tutorId = null;
    p.tutor = null;

    // Registrar informe de corte en el historial de informes de la práctica
    p.advanceReports = p.advanceReports || [];
    p.advanceReports.unshift({
      id: params.cutoffReportData.id,
      practiceId: params.practiceId,
      studentId: params.studentId,
      titulo: `Informe Oficial de Corte por Traslado (${params.cutoffReportData.code})`,
      tipo: 'CORTE_TRASLADO',
      horasEjecutadas: params.hoursTransferred,
      estado: 'Aprobado',
      createdAt: params.cutoffReportData.generatedAt,
    });

    p.statusHistory = p.statusHistory || [];
    p.statusHistory.unshift({
      id: `hist-freeze-${Date.now()}`,
      practiceId: params.practiceId,
      fromStatus: params.previousStatus,
      toStatus: 'EN_TRASLADO_EMPRESARIAL',
      changedByUserId: params.approvedById,
      notes: JSON.stringify({
        hu20TransferProtocol: true,
        action: 'SOLICITUD_TRASLADO_CONGELAMIENTO',
        reasonCode: params.reasonCode,
        hoursTransferred: params.hoursTransferred,
      }),
      createdAt: params.cutoffReportData.generatedAt,
    });

    this.practices.set(p.id, p);
    return {
      transfer: JSON.parse(JSON.stringify(transferRecord)),
      updatedPractice: JSON.parse(JSON.stringify(p)),
    };
  }

  async findCandidateCompaniesForTransfer(excludeSourceCompanyId?: string): Promise<any[]> {
    const all = Array.from(this.companies.values()).filter(
      (c) => c.id !== excludeSourceCompanyId
    );
    const hasUfps = all.some((c) => c.isUfps);
    if (!hasUfps) {
      all.push(this.getFallbackUfpsCompanyRecord());
    }
    return JSON.parse(JSON.stringify(all));
  }

  async findTargetCompanyById(companyId: string): Promise<any> {
    const ufpsFallback = this.getFallbackUfpsCompanyRecord();
    if (companyId === ufpsFallback.id) {
      return JSON.parse(JSON.stringify(ufpsFallback));
    }
    const found = this.companies.get(companyId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async confirmPracticeTransfer(params: {
    practiceId: string;
    sourceCompanyId: string;
    targetCompanyId: string;
    targetCompanyData: any;
    targetTutorId: string | null;
    targetVacancyId: string | null;
    previousStatus: any;
    newStatus: any;
    transferStatus: string;
    hoursTransferred: number;
    justification: string;
    approvedById: string;
    isUfpsContingency: boolean;
    arlSupportUrl?: string | null;
    arlCoverageNote: string;
    notificationsMetadata: any[];
  }): Promise<{ transfer: any; updatedPractice: any }> {
    const p = this.practices.get(params.practiceId);
    if (!p) throw new Error('Práctica no encontrada en mock');

    // Actualizar práctica con nueva empresa, nuevo tutor, preservando horas e informes (Criterio 3, RN01, RN03)
    p.companyId = params.targetCompanyId;
    p.company = {
      id: params.targetCompanyData.id,
      businessName: params.targetCompanyData.businessName,
      nit: params.targetCompanyData.nit,
      city: params.targetCompanyData.city,
    };
    p.tutorId = params.targetTutorId;
    p.vacancyId = params.targetVacancyId;
    p.currentStatus = params.newStatus;
    p.transferStatus = params.transferStatus;
    p.totalHoursCompleted = params.hoursTransferred;
    p.arlValidatedAt = null; // RN03: requiere reevaluación ARL para nuevas instalaciones

    let openTransfer = this.transfers.find(
      (t) => t.practiceId === params.practiceId && !t.targetCompanyId
    );
    if (openTransfer) {
      openTransfer.targetCompanyId = params.targetCompanyId;
      openTransfer.hoursTransferred = params.hoursTransferred;
      openTransfer.justification = params.justification;
      openTransfer.approvedById = params.approvedById;
    } else {
      openTransfer = {
        id: `trans-${this.transfers.length + 1}`,
        practiceId: params.practiceId,
        sourceCompanyId: params.sourceCompanyId,
        targetCompanyId: params.targetCompanyId,
        reasonCode: 'AUSENCIA_TUTOR_EMPRESARIAL',
        justification: params.justification,
        hoursTransferred: params.hoursTransferred,
        approvedById: params.approvedById,
        createdAt: new Date().toISOString(),
      };
      this.transfers.push(openTransfer);
    }

    p.statusHistory = p.statusHistory || [];
    p.statusHistory.unshift({
      id: `hist-confirm-${Date.now()}`,
      practiceId: params.practiceId,
      fromStatus: params.previousStatus,
      toStatus: params.newStatus,
      changedByUserId: params.approvedById,
      notes: JSON.stringify({
        hu20TransferProtocol: true,
        action: 'CONFIRMACION_TRASLADO_Y_REUBICACION',
        arlMetadata: true,
        arlStatus: 'PENDIENTE_REVISION',
        hoursTransferred: params.hoursTransferred,
        notifications: params.notificationsMetadata,
      }),
      createdAt: new Date().toISOString(),
    });

    this.practices.set(p.id, p);
    return {
      transfer: JSON.parse(JSON.stringify(openTransfer)),
      updatedPractice: JSON.parse(JSON.stringify(p)),
    };
  }
}

async function runTestSuite() {
  console.log('🧪 ====================================================================');
  console.log('🧪 SIGETRAP - Suite de Pruebas: HU20 Protocolo de Traslado y Reubicación');
  console.log('🧪 Por Ausencia de Tutor Empresarial (Criterios 1, 2, 3 y RN01, RN02, RN03)');
  console.log('🧪 ====================================================================\n');

  const mockRepo = new MockPracticeTransferRepository();
  const service = new PracticeTransferService(mockRepo);
  setPracticeTransferServiceInstance(service);

  // Actores de prueba
  const directorActor: AuthenticatedUser = {
    id: 'dir-001',
    name: 'Dr. Roberto Gómez (Director de Programa / Coordinador)',
    email: 'director.sistemas@ufps.edu.co',
    role: 'DIRECTOR_PROGRAMA' as Role,
    status: 'ACTIVO',
  };

  const studentActor: AuthenticatedUser = {
    id: 'stud-1152001',
    name: 'Juan David Pérez',
    email: 'estudiante@ufps.edu.co',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO',
  };

  // Sembrar empresas receptoras candidatas
  // 1) Empresa de origen (sin tutor disponible)
  mockRepo.seedCompany({
    id: 'comp-source-001',
    nit: '900111222-1',
    businessName: 'InnovaTech Origen S.A.S.',
    city: 'Cúcuta',
    address: 'Calle 10 # 4-12',
    contactEmail: 'rrhh@innovatech.co',
    contactPhone: '3001112233',
    isActive: true,
    agreements: [
      {
        id: 'ag-source',
        agreementNumber: 'CONV-UFPS-2026-001',
        status: 'VIGENTE',
        endDate: '2028-12-31',
      },
    ],
    vacancies: [],
    tutors: [], // Carece de tutor empresarial
  });

  // 2) Empresa externa compatible #1 (Alta compatibilidad en TypeScript, React, Node.js, SQL)
  mockRepo.seedCompany({
    id: 'comp-target-ext-001',
    nit: '900333444-2',
    businessName: 'DataSystems Soluciones Empresariales S.A.S.',
    city: 'Cúcuta',
    address: 'Av. Libertadores # 15-30',
    contactEmail: 'talento@datasystems.co',
    contactPhone: '3104445566',
    isActive: true,
    agreements: [
      {
        id: 'ag-ext-1',
        agreementNumber: 'CONV-UFPS-2026-010',
        status: 'VIGENTE',
        endDate: '2029-12-31',
      },
    ],
    vacancies: [
      {
        id: 'vac-ext-001',
        title: 'Desarrollador Full Stack TypeScript & React',
        description: 'Desarrollo de aplicaciones web empresariales con Next.js, Node.js y PostgreSQL.',
        requirements: 'TypeScript, React, Next.js, Node.js, SQL, PostgreSQL, Git',
        program: 'Ingeniería de Sistemas',
        status: 'PUBLICADA',
        vacanciesCount: 3,
        _count: { practices: 1 },
      },
    ],
    tutors: [
      {
        id: 'tutor-ext-001',
        name: 'Ing. Carolina Mendoza',
        email: 'carolina.mendoza@datasystems.co',
        role: 'TUTOR_EMPRESARIAL',
        status: 'ACTIVO',
        program: 'Arquitecta Líder de Software',
      },
    ],
  });

  // 3) Empresa externa SIN convenio vigente (Debe ser filtrada y excluida en Criterio 2)
  mockRepo.seedCompany({
    id: 'comp-expired-002',
    nit: '900555666-3',
    businessName: 'Empresa Sin Convenio Vigente Ltda.',
    city: 'Cúcuta',
    isActive: true,
    agreements: [
      {
        id: 'ag-exp',
        agreementNumber: 'CONV-VENCIDO-2021',
        status: 'VENCIDO',
        endDate: '2022-01-01',
      },
    ],
    vacancies: [
      {
        id: 'vac-exp-001',
        title: 'Desarrollador TypeScript',
        requirements: 'TypeScript, React',
        status: 'PUBLICADA',
        vacanciesCount: 2,
      },
    ],
    tutors: [],
  });

  // Sembrar práctica en curso con 140 horas válidas aprobadas en 2 informes previos
  const basePractice = {
    id: 'pract-hu20-001',
    studentId: 'stud-1152001',
    companyId: 'comp-source-001',
    vacancyId: 'vac-origin-001',
    tutorId: null, // Empresa carece de tutor asignado
    teacherId: 'teacher-001',
    currentStatus: 'PRACTICA_EN_EJECUCION',
    transferStatus: null,
    totalHoursRequired: 320,
    totalHoursCompleted: 140,
    arlValidatedAt: '2026-02-10T10:00:00.000Z',
    isActive: true,
    student: {
      id: 'stud-1152001',
      name: 'Juan David Pérez',
      email: 'estudiante@ufps.edu.co',
      studentCode: '1152001',
      documentNumber: '1090123456',
      program: 'Ingeniería de Sistemas',
      specialty: 'TypeScript, React, Node.js, SQL, Desarrollo de Software',
    },
    company: {
      id: 'comp-source-001',
      businessName: 'InnovaTech Origen S.A.S.',
      nit: '900111222-1',
      city: 'Cúcuta',
    },
    vacancy: {
      id: 'vac-origin-001',
      title: 'Practicante Ingeniería de Sistemas',
      requirements: 'TypeScript, React, SQL',
      program: 'Ingeniería de Sistemas',
    },
    teacher: {
      id: 'teacher-001',
      name: 'Ing. Laura Restrepo',
      email: 'docente.practica@ufps.edu.co',
    },
    tutor: null,
    advanceReports: [
      {
        id: 'rep-prev-1',
        titulo: 'Informe Avance Mes 1',
        tipo: 'AVANCE',
        horasEjecutadas: 70,
        estado: 'Aprobado',
      },
      {
        id: 'rep-prev-2',
        titulo: 'Informe Avance Mes 2',
        tipo: 'AVANCE',
        horasEjecutadas: 70,
        estado: 'Aprobado',
      },
    ],
    followUpLogs: [
      { id: 'log-1', actividad: 'Desarrollo módulo API', horasEjecutadas: 70 },
      { id: 'log-2', actividad: 'Pruebas unitarias e integración', horasEjecutadas: 70 },
    ],
    statusHistory: [],
  };

  mockRepo.seedPractice(basePractice);

  // ----------------------------------------------------------------------------
  // TEST 1: Control de Acceso RBAC (Bloqueo a roles no autorizados -> 403)
  // ----------------------------------------------------------------------------
  console.log('📌 Test 1 (RBAC): Intento de iniciar protocolo de traslado por un ESTUDIANTE -> 403...');
  try {
    await service.requestPracticeTransfer(
      'pract-hu20-001',
      { reasonCode: 'AUSENCIA_TUTOR_EMPRESARIAL' },
      studentActor
    );
    throw new Error('Debió rechazar con 403 al rol ESTUDIANTE');
  } catch (e: any) {
    if (e instanceof PracticeTransferError && e.statusCode === 403) {
      console.log('  ✅ PASÓ (RBAC): Operación denegada a rol no autorizado con HTTP 403.');
    } else {
      throw e;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Criterio 1 & RN01 - Declaración de causa AUSENCIA_TUTOR_EMPRESARIAL,
  // congelamiento de la práctica y generación de informe de corte con horas acumuladas
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 2 (Criterio 1 & RN01): Apertura de traslado por AUSENCIA_TUTOR_EMPRESARIAL, congelamiento e informe de corte...');
  const requestRes = await service.requestPracticeTransfer(
    'pract-hu20-001',
    {
      reasonCode: 'AUSENCIA_TUTOR_EMPRESARIAL',
      justification:
        'El tutor empresarial renunció sin reemplazo y la empresa notificó imposibilidad de asignar nuevo supervisor directo.',
    },
    directorActor
  );

  if (
    requestRes.reasonCode === 'AUSENCIA_TUTOR_EMPRESARIAL' &&
    requestRes.currentStatus === 'EN_TRASLADO_EMPRESARIAL' &&
    requestRes.transferStatus === 'EN_TRASLADO_EMPRESARIAL' &&
    requestRes.isFrozen === true &&
    requestRes.hoursAccumulatedAtCutoff === 140 &&
    requestRes.cutoffReport.code.startsWith('CORTE-TRAS-') &&
    requestRes.cutoffReport.hoursAccumulated === 140 &&
    requestRes.cutoffReport.remainingHours === 180
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1 & RN01): Práctica congelada en estado '${requestRes.currentStatus}', causa '${requestRes.reasonCode}' e informe de corte '${requestRes.cutoffReport.code}' generado con ${requestRes.hoursAccumulatedAtCutoff} horas avaladas.`
    );
  } else {
    throw new Error('Falló Test 2: no se cumplió el congelamiento o el informe de corte.');
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Criterio 2 - Búsqueda de empresas compatibles con convenio activo,
  // vacantes disponibles, coincidencia de skills y UFPS ordenada al final
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 3 (Criterio 2): Listado de empresas compatibles ordenando a la UFPS al final como contingencia...');
  const compatibleRes = await service.getCompatibleTransferCompanies(
    'pract-hu20-001',
    {},
    directorActor
  );

  const firstOption = compatibleRes.items[0];
  const lastOption = compatibleRes.items[compatibleRes.items.length - 1];
  const includesExpired = compatibleRes.items.some(
    (i) => i.companyId === 'comp-expired-002'
  );
  const includesSource = compatibleRes.items.some(
    (i) => i.companyId === 'comp-source-001'
  );

  if (
    compatibleRes.total >= 2 &&
    !includesExpired &&
    !includesSource &&
    firstOption.companyId === 'comp-target-ext-001' &&
    firstOption.isUfpsContingency === false &&
    firstOption.priorityLevel === 'PRIORIDAD_SECTOR_PRODUCTIVO' &&
    lastOption.isUfpsContingency === true &&
    lastOption.priorityLevel === 'ULTIMA_INSTANCIA_UFPS' &&
    lastOption.priorityRank === compatibleRes.items.length
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 2): Empresas con convenio vigente y skills compatibles listadas. Sector productivo en prioridad #1 ('${firstOption.businessName}') y UFPS ubicada al final en prioridad #${lastOption.priorityRank} ('${lastOption.businessName}').`
    );
  } else {
    throw new Error(
      `Falló Test 3: ordenamiento o filtrado incorrecto. Items: ${JSON.stringify(
        compatibleRes.items.map((i) => ({ id: i.companyId, isUfps: i.isUfpsContingency, rank: i.priorityRank }))
      )}`
    );
  }

  // ----------------------------------------------------------------------------
  // TEST 4: RN02 - UFPS como último recurso: Bloqueo si se selecciona UFPS sin
  // confirmación de advertencia o sin justificación de agotamiento de plazas externas
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 4 (RN02): Validación de advertencia y justificación obligatoria al seleccionar a la UFPS...');
  const ufpsCompanyId = lastOption.companyId;

  // 4.1 Sin justificación -> 422 UFPS_JUSTIFICATION_REQUIRED
  try {
    await service.confirmPracticeTransfer(
      'pract-hu20-001',
      {
        targetCompanyId: ufpsCompanyId,
        confirmUfpsLastResort: true,
        ufpsJustification: '',
      },
      directorActor
    );
    throw new Error('Debió rechazar selección de UFPS sin justificación');
  } catch (e: any) {
    if (
      e instanceof PracticeTransferError &&
      e.code === 'UFPS_JUSTIFICATION_REQUIRED' &&
      e.statusCode === 422
    ) {
      console.log(
        `  ✅ PASÓ (RN02 - Sin justificación): Rechazado con HTTP 422 [${e.code}].`
      );
    } else {
      throw e;
    }
  }

  // 4.2 Con confirmUfpsLastResort = false -> 422 UFPS_WARNING_CONFIRMATION_REQUIRED
  try {
    await service.confirmPracticeTransfer(
      'pract-hu20-001',
      {
        targetCompanyId: ufpsCompanyId,
        confirmUfpsLastResort: false,
        ufpsJustification: 'Se agotaron las plazas externas afines en la ciudad.',
      },
      directorActor
    );
    throw new Error('Debió exigir confirmación de la advertencia UFPS');
  } catch (e: any) {
    if (
      e instanceof PracticeTransferError &&
      e.code === 'UFPS_WARNING_CONFIRMATION_REQUIRED' &&
      e.statusCode === 422
    ) {
      console.log(
        `  ✅ PASÓ (RN02 - Advertencia de confirmación): Emitió advertencia obligatoria HTTP 422 [${e.code}].`
      );
    } else {
      throw e;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 5: Criterio 3, RN01 y RN03 - Confirmación de traslado hacia empresa del
  // sector productivo, preservación de horas e informes, reevaluación ARL y notificaciones
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 5 (Criterio 3, RN01, RN03): Confirmación de traslado formal a nueva entidad receptora...');
  const confirmRes = await service.confirmPracticeTransfer(
    'pract-hu20-001',
    {
      targetCompanyId: 'comp-target-ext-001',
      targetVacancyId: 'vac-ext-001',
      targetTutorId: 'tutor-ext-001',
      justification:
        'Reubicación aprobada hacia DataSystems S.A.S. por coincidencia del 100% con el perfil técnico del practicante.',
    },
    directorActor
  );

  if (
    confirmRes.targetCompany.id === 'comp-target-ext-001' &&
    confirmRes.newTutor.id === 'tutor-ext-001' &&
    confirmRes.currentStatus === 'PRACTICA_EN_EJECUCION' &&
    confirmRes.transferStatus === 'TRASLADO_COMPLETADO' &&
    confirmRes.hoursPreserved.hoursTransferredFromOrigin === 140 &&
    confirmRes.hoursPreserved.totalHoursCompleted === 140 &&
    confirmRes.hoursPreserved.remainingHoursToComplete === 180 &&
    confirmRes.hoursPreserved.previousReportsPreservedCount >= 2 &&
    confirmRes.arlReevaluation.newArlStatus === 'PENDIENTE_REVISION' &&
    confirmRes.arlReevaluation.requiresNewFacilityCoverageValidation === true &&
    confirmRes.notificationsSent.student === true &&
    confirmRes.notificationsSent.newCompany === true &&
    confirmRes.notificationsSent.teacher === true &&
    confirmRes.notificationsSent.items.length === 3
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 3a - Vinculación): Practicante vinculado a '${confirmRes.targetCompany.businessName}' con nuevo tutor '${confirmRes.newTutor.name}'.`
    );
    console.log(
      `  ✅ PASÓ (Criterio 3b & RN01 - Preservación): ${confirmRes.hoursPreserved.hoursTransferredFromOrigin} horas e informes previos preservados como saldo a favor (restan ${confirmRes.hoursPreserved.remainingHoursToComplete} hrs).`
    );
    console.log(
      `  ✅ PASÓ (RN03 - Reevaluación ARL): Estado ARL reevaluado a '${confirmRes.arlReevaluation.newArlStatus}' para validar cobertura en nuevas instalaciones.`
    );
    console.log(
      `  ✅ PASÓ (Criterio 3c - Notificaciones): Emitidas ${confirmRes.notificationsSent.items.length} notificaciones (Estudiante, Nueva Empresa y Docente Tutor).`
    );
  } else {
    throw new Error('Falló Test 5: datos de confirmación de traslado incompletos.');
  }

  // ----------------------------------------------------------------------------
  // TEST 6: RN02 - Confirmación exitosa hacia UFPS como última instancia con
  // advertencia confirmada y justificación válida
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 6 (RN02 - Contingencia UFPS): Traslado hacia dependencia interna UFPS con justificación válida...');
  const practiceForUfps = {
    ...basePractice,
    id: 'pract-hu20-ufps-002',
    totalHoursCompleted: 95,
  };
  mockRepo.seedPractice(practiceForUfps);

  await service.requestPracticeTransfer(
    'pract-hu20-ufps-002',
    { reasonCode: 'AUSENCIA_TUTOR_EMPRESARIAL', cutoffHoursOverride: 95 },
    directorActor
  );

  const ufpsConfirmRes = await service.confirmPracticeTransfer(
    'pract-hu20-ufps-002',
    {
      targetCompanyId: ufpsCompanyId,
      confirmUfpsLastResort: true,
      ufpsJustification:
        'Se agotaron las plazas externas compatibles en el sector productivo para el periodo actual; se asigna al Centro de Cómputo UFPS como contingencia institucional.',
    },
    directorActor
  );

  if (
    ufpsConfirmRes.ufpsContingencyApplied === true &&
    ufpsConfirmRes.ufpsWarningConfirmed === true &&
    ufpsConfirmRes.hoursPreserved.hoursTransferredFromOrigin === 95 &&
    ufpsConfirmRes.arlReevaluation.isUfpsCampusCoverage === true
  ) {
    console.log(
      `  ✅ PASÓ (RN02 & RN03 UFPS): Reubicación en dependencia UFPS aplicada con justificación registrada, 95 horas preservadas y amparo ARL sede UFPS.`
    );
  } else {
    throw new Error('Falló Test 6: traslado de contingencia a UFPS no cumplió expectativas.');
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Integración de Endpoints HTTP REST (Next.js Route Handlers)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 7 (Endpoints API REST): Verificación de POST solicitar-traslado, GET empresas-compatibles-traslado y POST confirmar-traslado...');
  const practiceForHttp = {
    ...basePractice,
    id: 'pract-hu20-http-003',
    totalHoursCompleted: 160,
  };
  mockRepo.seedPractice(practiceForHttp);

  const directorToken = generateToken(directorActor);
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${directorToken}`,
  };

  // 7.1 POST /api/v1/practicas/[id]/solicitar-traslado
  const reqPostSolicitar = new NextRequest(
    'http://localhost:3000/api/v1/practicas/pract-hu20-http-003/solicitar-traslado',
    {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        reasonCode: 'AUSENCIA_TUTOR_EMPRESARIAL',
        justification: 'Empresa reportó retiro definitivo del único ingeniero supervisor.',
      }),
    }
  );
  const resPostSolicitar = await postSolicitarTrasladoHandler(reqPostSolicitar, {
    params: Promise.resolve({ id: 'pract-hu20-http-003' }),
  });
  const bodySolicitar = await resPostSolicitar.json();

  if (
    resPostSolicitar.status === 201 &&
    bodySolicitar.success === true &&
    bodySolicitar.data?.currentStatus === 'EN_TRASLADO_EMPRESARIAL'
  ) {
    console.log(
      `  ✅ PASÓ (POST /solicitar-traslado -> 201): Expediente abierto y práctica congelada con ${bodySolicitar.data.hoursAccumulatedAtCutoff} hrs.`
    );
  } else {
    throw new Error(`Falló 7.1 POST /solicitar-traslado: status ${resPostSolicitar.status}`);
  }

  // 7.2 GET /api/v1/practicas/[id]/empresas-compatibles-traslado
  const reqGetCompatibles = new NextRequest(
    'http://localhost:3000/api/v1/practicas/pract-hu20-http-003/empresas-compatibles-traslado?skills=TypeScript,React',
    {
      method: 'GET',
      headers: authHeaders,
    }
  );
  const resGetCompatibles = await getEmpresasCompatiblesHandler(reqGetCompatibles, {
    params: Promise.resolve({ id: 'pract-hu20-http-003' }),
  });
  const bodyCompatibles = await resGetCompatibles.json();

  if (
    resGetCompatibles.status === 200 &&
    bodyCompatibles.success === true &&
    bodyCompatibles.data?.items?.length >= 2 &&
    bodyCompatibles.data.items[bodyCompatibles.data.items.length - 1].isUfpsContingency === true
  ) {
    console.log(
      `  ✅ PASÓ (GET /empresas-compatibles-traslado -> 200): Retornó ${bodyCompatibles.data.total} empresas con UFPS en última prioridad.`
    );
  } else {
    throw new Error(`Falló 7.2 GET /empresas-compatibles-traslado: status ${resGetCompatibles.status}`);
  }

  // 7.3 POST /api/v1/practicas/[id]/confirmar-traslado
  const reqPostConfirmar = new NextRequest(
    'http://localhost:3000/api/v1/practicas/pract-hu20-http-003/confirmar-traslado',
    {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        targetCompanyId: 'comp-target-ext-001',
        targetTutorId: 'tutor-ext-001',
        justification: 'Reubicación confirmada vía endpoint REST.',
      }),
    }
  );
  const resPostConfirmar = await postConfirmarTrasladoHandler(reqPostConfirmar, {
    params: Promise.resolve({ id: 'pract-hu20-http-003' }),
  });
  const bodyConfirmar = await resPostConfirmar.json();

  if (
    resPostConfirmar.status === 200 &&
    bodyConfirmar.success === true &&
    bodyConfirmar.data?.transferStatus === 'TRASLADO_COMPLETADO' &&
    bodyConfirmar.data?.hoursPreserved?.hoursTransferredFromOrigin === 160
  ) {
    console.log(
      `  ✅ PASÓ (POST /confirmar-traslado -> 200): Reubicación aplicada y 160 horas traspasadas exitosamente.`
    );
  } else {
    throw new Error(`Falló 7.3 POST /confirmar-traslado: status ${resPostConfirmar.status}`);
  }

  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE LA HU20 PASARON CON ÉXITO (7/7 BLOQUES)');
  console.log('🎉 ====================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ ERROR FATAL EN SUITE DE PRUEBAS HU20:', err);
  process.exit(1);
});
