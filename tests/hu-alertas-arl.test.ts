// ==============================================================================
// SIGETRAP - Test de Verificación: Implementación de Alertas Automáticas de ARL Estudiante
// Módulo / Épica: Seguimiento y Control de Prácticas / Cumplimiento Legal ARL
//
// Criterios de Aceptación (Gherkin) y Reglas de Negocio Evaluados:
//   - Criterio 1: Alerta por falta de afiliación antes del inicio de práctica (<= 5 días hábiles)
//   - Criterio 2: Alertas automáticas de próximo vencimiento de vigencia (umbrales 15 días y 5 días)
//   - Criterio 3: Notificación y bloqueo de actividades (bitácoras/informes) por ARL vencida
//   - Criterio 4: Visualización del estado (Semáforo) en el panel de coordinación y filtrado rápido
//   - RN01: Periodicidad del chequeo diario (Cron Job / Worker 00:00 hrs)
//   - RN02: Validez de documentos ("Pendiente de revisión" al subir hasta validación del coordinador)
//   - RN03: Inactividad por falta de cobertura (enabledForInPersonWork = false en Vencido/Sin Afiliación)
//   - Endpoints API:
//       * GET   /api/v1/practicas/alertas/arl
//       * POST  /api/v1/practicas/alertas/arl
//       * POST  /api/v1/estudiantes/[id]/arl/documento
//       * PATCH /api/v1/estudiantes/[id]/arl/validar
// ==============================================================================

import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { generateToken } from '../src/lib/auth';
import {
  ArlAlertService,
  setArlAlertServiceInstance,
} from '../src/server/services/arl-alert.service';
import {
  ArlAlertRepository,
  PracticeArlRecord,
} from '../src/server/repositories/arl-alert.repository';
import {
  PracticeFollowUpService,
  PracticeFollowUpError,
} from '../src/server/services/practice-followup.service';
import { AdvanceReportRepository } from '../src/server/repositories/advance-report.repository';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import { arlAlertsCronWorker, ARL_ALERTS_CRON_EXPRESSION } from '../src/server/jobs/arl-alerts.cron';
import {
  GET as getArlAlertsRoute,
  POST as postArlAlertsBatchRoute,
} from '../src/app/api/v1/practicas/alertas/arl/route';
import { POST as uploadArlDocumentoRoute } from '../src/app/api/v1/estudiantes/[id]/arl/documento/route';
import { PATCH as validateArlDocumentoRoute } from '../src/app/api/v1/estudiantes/[id]/arl/validar/route';
import type { AuthenticatedUser } from '../src/types';

class InMemoryArlAlertRepository extends ArlAlertRepository {
  public records: PracticeArlRecord[];

  constructor(initialRecords: PracticeArlRecord[]) {
    super();
    this.records = initialRecords.map((r) => ({ ...r }));
  }

  override async findAllPracticesForArlEvaluation(params?: {
    studentId?: string;
    practiceId?: string;
  }): Promise<PracticeArlRecord[]> {
    return this.records
      .filter((r) => {
        if (params?.studentId && r.studentId !== params.studentId) return false;
        if (params?.practiceId && r.id !== params.practiceId) return false;
        return true;
      })
      .map((r) => ({ ...r }));
  }

  override async findActivePracticeByStudentId(
    studentId: string,
    practiceId?: string
  ): Promise<PracticeArlRecord | null> {
    const found = this.records.find(
      (r) => r.studentId === studentId && (!practiceId || r.id === practiceId)
    );
    return found ? { ...found } : null;
  }

  override async findPracticeById(practiceId: string): Promise<PracticeArlRecord | null> {
    const found = this.records.find((r) => r.id === practiceId);
    return found ? { ...found } : null;
  }

  override async saveArlDocumentUpload(params: {
    practiceId: string;
    studentId: string;
    actorId: string;
    currentPracticeStatus: string;
    arlSupportUrl: string;
    arlExpirationDate: Date;
    arlPolicyNumber?: string | null;
    arlEntityName?: string | null;
    observations?: string | null;
  }): Promise<PracticeArlRecord> {
    const idx = this.records.findIndex((r) => r.id === params.practiceId);
    if (idx === -1) throw new Error('Practice not found');
    const updated: PracticeArlRecord = {
      ...this.records[idx],
      arlSupportUrl: params.arlSupportUrl,
      arlValidatedAt: null,
      arlValidatedById: null,
      arlExpirationDate: params.arlExpirationDate,
      arlStatus: 'PENDIENTE_REVISION',
      arlPolicyNumber: params.arlPolicyNumber || null,
      arlEntityName: params.arlEntityName || null,
      arlRejectionReason: null,
      updatedAt: new Date(),
    };
    this.records[idx] = updated;
    return { ...updated };
  }

  override async saveArlValidationResult(params: {
    practiceId: string;
    actorId: string;
    currentPracticeStatus: string;
    approved: boolean;
    arlSupportUrl: string | null;
    arlExpirationDate: Date | null;
    arlPolicyNumber?: string | null;
    arlEntityName?: string | null;
    rejectionReason?: string | null;
    observations?: string | null;
  }): Promise<PracticeArlRecord> {
    const idx = this.records.findIndex((r) => r.id === params.practiceId);
    if (idx === -1) throw new Error('Practice not found');
    const current = this.records[idx];
    const updated: PracticeArlRecord = {
      ...current,
      arlSupportUrl: params.approved ? current.arlSupportUrl : null,
      arlValidatedAt: params.approved ? new Date() : null,
      arlValidatedById: params.approved ? params.actorId : null,
      arlExpirationDate: params.arlExpirationDate ?? current.arlExpirationDate,
      arlStatus: params.approved ? 'VIGENTE' : 'SIN_AFILIACION',
      arlRejectionReason: params.approved ? null : params.rejectionReason || null,
      updatedAt: new Date(),
    };
    this.records[idx] = updated;
    return { ...updated };
  }

  override async recordExpiredArlFromPeriodicCheck(params: {
    practiceId: string;
    currentPracticeStatus: string;
    arlSupportUrl: string | null;
    arlExpirationDate: string | null;
    arlPolicyNumber?: string | null;
    arlEntityName?: string | null;
    coordinatorId?: string | null;
  }): Promise<void> {
    const idx = this.records.findIndex((r) => r.id === params.practiceId);
    if (idx !== -1) {
      this.records[idx].arlStatus = 'VENCIDO';
      this.records[idx].updatedAt = new Date();
    }
  }
}

async function runTests() {
  console.log('==================================================================');
  console.log(' INICIANDO SUITE DE PRUEBAS: ALERTAS AUTOMÁTICAS DE ARL ESTUDIANTE');
  console.log('==================================================================\n');

  // Fecha de referencia fija: Lunes 2026-05-04T00:00:00.000Z
  const refDate = new Date('2026-05-04T00:00:00.000Z');

  const coordinatorUser: AuthenticatedUser = {
    id: 'coord-01',
    name: 'Dr. Carlos Coordinador',
    email: 'coordinador@ufps.edu.co',
    role: 'DIRECTOR_PROGRAMA',
    status: 'ACTIVO',
  };

  const studentSinArl: AuthenticatedUser = {
    id: 'est-sin-arl',
    name: 'Ana María Sin ARL',
    email: 'ana.sinarl@ufps.edu.co',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
  };

  const studentPorVencer15: AuthenticatedUser = {
    id: 'est-vence-15',
    name: 'Luis Fernando Vence 15d',
    email: 'luis.vence15@ufps.edu.co',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
  };

  const studentPorVencer5: AuthenticatedUser = {
    id: 'est-vence-5',
    name: 'Camila Andrea Vence 5d',
    email: 'camila.vence5@ufps.edu.co',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
  };

  const studentVencido: AuthenticatedUser = {
    id: 'est-vencido',
    name: 'Jorge Andrés ARL Vencida',
    email: 'jorge.vencido@ufps.edu.co',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
  };

  const studentVigente: AuthenticatedUser = {
    id: 'est-vigente',
    name: 'Valentina ARL Vigente',
    email: 'valentina.vigente@ufps.edu.co',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
  };

  const initialRecords: PracticeArlRecord[] = [
    // Caso 1: Criterio 1 - Práctica aprobada que inicia en 4 días hábiles (Viernes 2026-05-08) sin ARL cargada
    {
      id: 'prac-criterio-1',
      studentId: studentSinArl.id,
      companyId: 'comp-01',
      currentStatus: 'ASIGNADO_FORMALMENTE',
      arlSupportUrl: null,
      arlValidatedAt: null,
      arlValidatedById: null,
      arlExpirationDate: null,
      arlStatus: 'SIN_AFILIACION',
      arlPolicyNumber: null,
      arlEntityName: null,
      arlRejectionReason: null,
      startDate: new Date('2026-05-08T00:00:00.000Z'), // 4 días hábiles desde Lunes 04 Mayo
      endDate: new Date('2026-11-08T00:00:00.000Z'),
      totalHoursRequired: 320,
      totalHoursCompleted: 0,
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      updatedAt: new Date('2026-04-20T00:00:00.000Z'),
      student: {
        id: studentSinArl.id,
        name: studentSinArl.name,
        email: studentSinArl.email,
        documentNumber: '1090111222',
        studentCode: '1152001',
        program: 'Ingeniería de Sistemas',
      },
      company: {
        id: 'comp-01',
        businessName: 'Tech Solutions S.A.S.',
        nit: '900111222-1',
      },
    },
    // Caso 2A: Criterio 2 - ARL vigente pero vence en exactamente 15 días calendario (2026-05-19)
    {
      id: 'prac-criterio-2-15d',
      studentId: studentPorVencer15.id,
      companyId: 'comp-01',
      currentStatus: 'PRACTICA_EN_EJECUCION',
      arlSupportUrl: '/uploads/arl/arl-luis.pdf',
      arlValidatedAt: new Date('2026-01-15T00:00:00.000Z'),
      arlValidatedById: coordinatorUser.id,
      arlExpirationDate: new Date('2026-05-19T00:00:00.000Z'), // +15 días desde 2026-05-04
      arlStatus: 'VIGENTE',
      arlPolicyNumber: 'POL-1500',
      arlEntityName: 'Positiva ARL',
      arlRejectionReason: null,
      startDate: new Date('2026-02-01T00:00:00.000Z'),
      endDate: new Date('2026-08-01T00:00:00.000Z'),
      totalHoursRequired: 320,
      totalHoursCompleted: 80,
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
      updatedAt: new Date('2026-01-15T00:00:00.000Z'),
      student: {
        id: studentPorVencer15.id,
        name: studentPorVencer15.name,
        email: studentPorVencer15.email,
        documentNumber: '1090222333',
        studentCode: '1152002',
        program: 'Ingeniería de Sistemas',
      },
      company: {
        id: 'comp-01',
        businessName: 'Tech Solutions S.A.S.',
        nit: '900111222-1',
      },
    },
    // Caso 2B: Criterio 2 - ARL vigente pero vence en 4 días calendario (<= 5 días: 2026-05-08)
    {
      id: 'prac-criterio-2-5d',
      studentId: studentPorVencer5.id,
      companyId: 'comp-01',
      currentStatus: 'PRACTICA_EN_EJECUCION',
      arlSupportUrl: '/uploads/arl/arl-camila.pdf',
      arlValidatedAt: new Date('2026-01-15T00:00:00.000Z'),
      arlValidatedById: coordinatorUser.id,
      arlExpirationDate: new Date('2026-05-08T00:00:00.000Z'), // +4 días desde 2026-05-04
      arlStatus: 'VIGENTE',
      arlPolicyNumber: 'POL-0500',
      arlEntityName: 'Sura ARL',
      arlRejectionReason: null,
      startDate: new Date('2026-02-01T00:00:00.000Z'),
      endDate: new Date('2026-08-01T00:00:00.000Z'),
      totalHoursRequired: 320,
      totalHoursCompleted: 120,
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
      updatedAt: new Date('2026-01-15T00:00:00.000Z'),
      student: {
        id: studentPorVencer5.id,
        name: studentPorVencer5.name,
        email: studentPorVencer5.email,
        documentNumber: '1090333444',
        studentCode: '1152003',
        program: 'Ingeniería de Sistemas',
      },
      company: {
        id: 'comp-01',
        businessName: 'Tech Solutions S.A.S.',
        nit: '900111222-1',
      },
    },
    // Caso 3: Criterio 3 - ARL con fecha de vigencia expirada (2026-05-01, hace 3 días)
    {
      id: 'prac-criterio-3-vencida',
      studentId: studentVencido.id,
      companyId: 'comp-01',
      currentStatus: 'PRACTICA_EN_EJECUCION',
      arlSupportUrl: '/uploads/arl/arl-jorge-expirada.pdf',
      arlValidatedAt: new Date('2026-01-10T00:00:00.000Z'),
      arlValidatedById: coordinatorUser.id,
      arlExpirationDate: new Date('2026-05-01T00:00:00.000Z'), // Expirada (-3 días)
      arlStatus: 'VIGENTE', // Antes del chequeo periódico estaba en VIGENTE
      arlPolicyNumber: 'POL-EXP-99',
      arlEntityName: 'Colmena ARL',
      arlRejectionReason: null,
      startDate: new Date('2026-01-15T00:00:00.000Z'),
      endDate: new Date('2026-07-15T00:00:00.000Z'),
      totalHoursRequired: 320,
      totalHoursCompleted: 40,
      createdAt: new Date('2026-01-10T00:00:00.000Z'),
      updatedAt: new Date('2026-01-10T00:00:00.000Z'),
      student: {
        id: studentVencido.id,
        name: studentVencido.name,
        email: studentVencido.email,
        documentNumber: '1090444555',
        studentCode: '1152004',
        program: 'Ingeniería de Sistemas',
      },
      company: {
        id: 'comp-01',
        businessName: 'Tech Solutions S.A.S.',
        nit: '900111222-1',
      },
    },
    // Caso 4: Estudiante con ARL completamente Vigente (vence en 90 días: 2026-08-02)
    {
      id: 'prac-vigente',
      studentId: studentVigente.id,
      companyId: 'comp-01',
      currentStatus: 'PRACTICA_EN_EJECUCION',
      arlSupportUrl: '/uploads/arl/arl-valentina.pdf',
      arlValidatedAt: new Date('2026-02-01T00:00:00.000Z'),
      arlValidatedById: coordinatorUser.id,
      arlExpirationDate: new Date('2026-08-02T00:00:00.000Z'), // +90 días
      arlStatus: 'VIGENTE',
      arlPolicyNumber: 'POL-OK-2026',
      arlEntityName: 'Positiva ARL',
      arlRejectionReason: null,
      startDate: new Date('2026-02-05T00:00:00.000Z'),
      endDate: new Date('2026-08-05T00:00:00.000Z'),
      totalHoursRequired: 320,
      totalHoursCompleted: 160,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      student: {
        id: studentVigente.id,
        name: studentVigente.name,
        email: studentVigente.email,
        documentNumber: '1090555666',
        studentCode: '1152005',
        program: 'Ingeniería de Sistemas',
      },
      company: {
        id: 'comp-01',
        businessName: 'Tech Solutions S.A.S.',
        nit: '900111222-1',
      },
    },
  ];

  const repo = new InMemoryArlAlertRepository(initialRecords);
  const arlService = new ArlAlertService(repo);
  setArlAlertServiceInstance(arlService);

  // ----------------------------------------------------------------------------
  // TEST 1: Criterio 1 - Alerta preventiva por falta de afiliación antes del inicio (<= 5 días hábiles)
  // ----------------------------------------------------------------------------
  console.log('-> Test 1 (Criterio 1): Alerta preventiva por falta de ARL a <= 5 días hábiles de iniciar...');
  const evalCriterio1 = arlService.evaluatePracticeArlState(initialRecords[0], refDate);
  assert.equal(evalCriterio1.arlStatus, 'SIN_AFILIACION');
  assert.equal(evalCriterio1.arlSemaphoreLabel, 'Sin Afiliación');
  assert.equal(evalCriterio1.businessDaysUntilStart, 4);
  assert.equal(evalCriterio1.hasActiveAlert, true);
  assert.equal(evalCriterio1.alertType, 'FALTA_AFILIACION_PRE_INICIO');
  assert.equal(evalCriterio1.enabledForInPersonWork, false, 'RN03: Sin afiliación no habilita labores presenciales');
  assert.ok(
    evalCriterio1.alertMessage?.includes('no puede iniciar sin cobertura de ARL'),
    'Debe indicar que la práctica no puede iniciar sin cobertura de ARL'
  );
  console.log('   [OK] Criterio 1 verificado exitosamente.');

  // ----------------------------------------------------------------------------
  // TEST 2: Criterio 2 - Alertas automáticas de próximo vencimiento (umbrales 15 días y 5 días)
  // ----------------------------------------------------------------------------
  console.log('-> Test 2 (Criterio 2): Alertas automáticas de próximo vencimiento (15d y 5d) + banner...');
  const eval15d = arlService.evaluatePracticeArlState(initialRecords[1], refDate);
  assert.equal(eval15d.arlStatus, 'PROXIMO_A_VENCER');
  assert.equal(eval15d.arlSemaphoreLabel, 'Próximo a vencer');
  assert.equal(eval15d.daysUntilExpiration, 15);
  assert.equal(eval15d.alertType, 'PROXIMO_VENCIMIENTO_15_DIAS');
  assert.ok(eval15d.studentBannerMessage?.includes('15 día(s)'));

  const eval5d = arlService.evaluatePracticeArlState(initialRecords[2], refDate);
  assert.equal(eval5d.arlStatus, 'PROXIMO_A_VENCER');
  assert.equal(eval5d.arlSemaphoreLabel, 'Próximo a vencer');
  assert.equal(eval5d.daysUntilExpiration, 4);
  assert.equal(eval5d.alertType, 'PROXIMO_VENCIMIENTO_5_DIAS');
  assert.equal(eval5d.alertSeverity, 'ALTA');
  assert.ok(eval5d.studentBannerMessage?.includes('soporte de renovación'));
  console.log('   [OK] Criterio 2 verificado exitosamente.');

  // ----------------------------------------------------------------------------
  // TEST 3: RN01 y Criterio 3 - Ejecución del Job Diario (00:00 hrs), transición a "Vencido",
  //         notificaciones por correo y bloqueo de bitácoras/informes de avance
  // ----------------------------------------------------------------------------
  console.log('-> Test 3 (RN01 & Criterio 3): Job programado diario, transición a "Vencido" y bloqueo de bitácoras...');
  assert.equal(ARL_ALERTS_CRON_EXPRESSION, '0 0 * * *');
  const batchSummary = await arlAlertsCronWorker.runDailyCheck(refDate);
  assert.equal(batchSummary.totalPracticesEvaluated, 5);
  assert.equal(batchSummary.expiredBlockedCount, 1);
  assert.equal(batchSummary.preventivePreStartCount, 1);
  assert.equal(batchSummary.upcomingExpirationCount, 2);
  assert.ok(batchSummary.notifications.length >= 4);

  // Verificar que el registro expirado quedó en estado VENCIDO en el repositorio
  const updatedExpiredRecord = await repo.findPracticeById('prac-criterio-3-vencida');
  assert.equal(updatedExpiredRecord?.arlStatus, 'VENCIDO');

  // Verificar que PracticeFollowUpService.radicarInforme bloquea el registro de informes/bitácoras (Criterio 3)
  class MockPracticeRepoForArl extends PracticeRepository {
    override async findById(id: string): Promise<any> {
      const rec = await repo.findPracticeById(id);
      if (!rec) return null;
      return {
        id: rec.id,
        studentId: rec.studentId,
        currentStatus: rec.currentStatus,
        arlStatus: rec.arlStatus,
        arlExpirationDate: rec.arlExpirationDate,
        totalHoursRequired: 320,
        totalHoursCompleted: 40,
      };
    }
  }

  class MockAdvanceReportRepoForArl extends AdvanceReportRepository {
    override async createAdvanceReportWithLog(params: any): Promise<any> {
      return {
        report: {
          id: 'rep-01',
          practicaId: params.practicaId,
          estudianteId: params.estudianteId,
          tipo: 'SEGUIMIENTO',
          estado: 'Radicado',
          horasEjecutadas: params.horasEjecutadas,
          descripcionActividades: params.descripcionActividades,
          fechaEntrega: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        log: {
          id: 'log-01',
          informeId: 'rep-01',
          practicaId: params.practicaId,
          estudianteId: params.estudianteId,
          fechaActividad: new Date(),
          descripcionActividades: params.descripcionActividades,
          horasEjecutadas: params.horasEjecutadas,
          createdAt: new Date(),
        },
        updatedPractice: {
          id: params.practicaId,
          currentStatus: 'PRACTICA_EN_EJECUCION',
          totalHoursRequired: 320,
          totalHoursCompleted: 60,
        },
      };
    }
  }

  const followUpService = new PracticeFollowUpService(
    new MockAdvanceReportRepoForArl(),
    new MockPracticeRepoForArl()
  );

  await assert.rejects(
    async () => {
      await followUpService.radicarInforme(
        {
          practicaId: 'prac-criterio-3-vencida',
          horasEjecutadas: 20,
          descripcionActividades: 'Desarrollo de microservicios y pruebas unitarias',
        },
        studentVencido
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof PracticeFollowUpError);
      assert.equal(err.code, 'ARL_EXPIRED_BLOCK');
      assert.equal(err.statusCode, 403);
      return true;
    }
  );
  console.log('   [OK] Criterio 3 y RN01 verificados exitosamente (bloqueo 403 ARL_EXPIRED_BLOCK confirmado).');

  // ----------------------------------------------------------------------------
  // TEST 4: Criterio 4 y RN03 - Endpoint GET /api/v1/practicas/alertas/arl con Semáforo y Filtros
  // ----------------------------------------------------------------------------
  console.log('-> Test 4 (Criterio 4 & RN03): Endpoint GET /api/v1/practicas/alertas/arl y semáforo...');
  const coordToken = generateToken({
    userId: coordinatorUser.id,
    email: coordinatorUser.email,
    role: coordinatorUser.role,
    name: coordinatorUser.name,
    status: coordinatorUser.status,
  });

  const reqGetAll = new NextRequest(
    `http://localhost:3000/api/v1/practicas/alertas/arl?referenceDate=${encodeURIComponent(refDate.toISOString())}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${coordToken}` },
    }
  );
  const resGetAll = await getArlAlertsRoute(reqGetAll);
  assert.equal(resGetAll.status, 200);
  const bodyGetAll = await resGetAll.json();
  assert.equal(bodyGetAll.success, true);
  assert.equal(bodyGetAll.data.total, 5);
  assert.equal(bodyGetAll.data.summary.vigente + bodyGetAll.data.summary.proximoAVencer, 3);
  assert.equal(bodyGetAll.data.summary.vencido, 1);
  assert.equal(bodyGetAll.data.summary.sinAfiliacion, 1);

  // Verificar RN03: Vencido y Sin Afiliación NO habilitados para labores presenciales
  const itemVencido = bodyGetAll.data.items.find((i: any) => i.practiceId === 'prac-criterio-3-vencida');
  const itemSinArl = bodyGetAll.data.items.find((i: any) => i.practiceId === 'prac-criterio-1');
  const itemVigente = bodyGetAll.data.items.find((i: any) => i.practiceId === 'prac-vigente');
  assert.equal(itemVencido.enabledForInPersonWork, false);
  assert.equal(itemSinArl.enabledForInPersonWork, false);
  assert.equal(itemVigente.enabledForInPersonWork, true);

  // Filtrado rápido por categoría VENCIDO
  const reqFilterVencido = new NextRequest(
    `http://localhost:3000/api/v1/practicas/alertas/arl?status=VENCIDO&referenceDate=${encodeURIComponent(refDate.toISOString())}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${coordToken}` },
    }
  );
  const resFilterVencido = await getArlAlertsRoute(reqFilterVencido);
  const bodyFilterVencido = await resFilterVencido.json();
  assert.equal(bodyFilterVencido.data.items.length, 1);
  assert.equal(bodyFilterVencido.data.items[0].arlSemaphoreLabel, 'Vencido');
  console.log('   [OK] Criterio 4 y RN03 verificados exitosamente.');

  // ----------------------------------------------------------------------------
  // TEST 5: RN02 - Subida de soporte (POST /api/v1/estudiantes/[id]/arl/documento) -> "Pendiente de revisión"
  //         y Validación del Coordinador (PATCH /api/v1/estudiantes/[id]/arl/validar) -> "Vigente"
  // ----------------------------------------------------------------------------
  console.log('-> Test 5 (RN02): Subida de soporte ARL por estudiante y validación por coordinador...');
  const studentVencidoToken = generateToken({
    userId: studentVencido.id,
    email: studentVencido.email,
    role: studentVencido.role,
    name: studentVencido.name,
    status: studentVencido.status,
  });
  const futureExpiration = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const reqUploadArl = new NextRequest(
    `http://localhost:3000/api/v1/estudiantes/${studentVencido.id}/arl/documento`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentVencidoToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        practiceId: 'prac-criterio-3-vencida',
        documentUrl: '/uploads/arl/renovacion-jorge-2026.pdf',
        expirationDate: futureExpiration,
        policyNumber: 'POL-RENOV-2026',
        arlEntityName: 'Positiva ARL',
      }),
    }
  );

  const resUploadArl = await uploadArlDocumentoRoute(reqUploadArl, {
    params: Promise.resolve({ id: studentVencido.id }),
  });
  assert.equal(resUploadArl.status, 201);
  const bodyUploadArl = await resUploadArl.json();
  assert.equal(bodyUploadArl.success, true);
  assert.equal(bodyUploadArl.data.arlStatus, 'PENDIENTE_REVISION');
  assert.equal(bodyUploadArl.data.arlSemaphoreLabel, 'Pendiente de revisión');

  // Al haber cargado la nueva constancia, el estudiante ya puede radicar su informe de avance (Criterio 3)
  const reportResult = await followUpService.radicarInforme(
    {
      practicaId: 'prac-criterio-3-vencida',
      horasEjecutadas: 20,
      descripcionActividades: 'Actividades desbloqueadas tras cargar nueva constancia de ARL',
    },
    studentVencido
  );
  assert.equal(reportResult.informe.estado, 'Radicado');

  // Ahora el coordinador aprueba la póliza subida (PATCH /api/v1/estudiantes/[id]/arl/validar)
  const reqValidateArl = new NextRequest(
    `http://localhost:3000/api/v1/estudiantes/${studentVencido.id}/arl/validar`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${coordToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        practiceId: 'prac-criterio-3-vencida',
        approved: true,
        expirationDate: futureExpiration,
      }),
    }
  );

  const resValidateArl = await validateArlDocumentoRoute(reqValidateArl, {
    params: Promise.resolve({ id: studentVencido.id }),
  });
  assert.equal(resValidateArl.status, 200);
  const bodyValidateArl = await resValidateArl.json();
  assert.equal(bodyValidateArl.success, true);
  assert.equal(bodyValidateArl.data.arlStatus, 'VIGENTE');
  assert.equal(bodyValidateArl.data.arlSemaphoreLabel, 'Vigente');
  assert.equal(bodyValidateArl.data.enabledForInPersonWork, true);

  // Verificar también POST /api/v1/practicas/alertas/arl (ejecución batch desde API)
  const reqPostBatch = new NextRequest('http://localhost:3000/api/v1/practicas/alertas/arl', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${coordToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ referenceDate: refDate.toISOString() }),
  });
  const resPostBatch = await postArlAlertsBatchRoute(reqPostBatch);
  assert.equal(resPostBatch.status, 200);
  const bodyPostBatch = await resPostBatch.json();
  assert.equal(bodyPostBatch.success, true);
  console.log('   [OK] RN02 y endpoints POST/PATCH verificados exitosamente.\n');

  setArlAlertServiceInstance(null);
  console.log('==================================================================');
  console.log(' TODAS LAS PRUEBAS DE ALERTAS AUTOMÁTICAS DE ARL PASARON (100%)');
  console.log('==================================================================');
}

runTests().catch((err) => {
  console.error('FALLO EN PRUEBAS DE ALERTAS ARL:', err);
  process.exit(1);
});
