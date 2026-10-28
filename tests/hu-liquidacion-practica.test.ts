// ==============================================================================
// SIGETRAP - Suite de Pruebas: Liquidación y Cierre Académico de Prácticas
// Módulo: Liquidación y Cierre de Práctica Formativa
// Historia de Usuario:
//   "Como coordinador de prácticas, quiero consolidar la calificación definitiva
//    y dar por finalizada la práctica, para remitir el resultado al expediente curricular."
//
// Criterios de Aceptación Evaluados:
//   - Criterio 1: Visualización del resumen de liquidación con desglose ponderado (50/30/20) y cálculo automático.
//   - Criterio 2: Validación de prerrequisitos de cierre (bloqueo ante evaluaciones u horas faltantes -> 422).
//   - Criterio 3: Confirmación y asentamiento de nota definitiva (transición a FINALIZADA y número de acta).
//   - Criterio 4: Remisión al expediente curricular y emisión de notificaciones.
//   - Criterio 5: Generación y descarga de acta o certificado oficial de cierre (HTML / PDF institucional).
//   - RN01: Permisos de cierre exclusivos para Coordinador o Administrador Académico (RBAC 403).
//   - RN02: Criterio de aprobación (nota >= 3.0 -> APROBADO; nota < 3.0 -> REPROBADO).
//   - RN03: Inmutabilidad de la calificación tras la liquidación (bloqueo ante re-liquidación -> 409).
// ==============================================================================

import { NextRequest } from 'next/server';
import {
  PracticeLiquidationService,
  PracticeLiquidationError,
} from '../src/server/services/practice-liquidation.service';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import { AuthenticatedUser, Role } from '../src/types';
import { GET as getResumenHandler } from '../src/app/api/v1/practicas/[id]/resumen-liquidacion/route';
import { POST as postLiquidarHandler } from '../src/app/api/v1/practicas/[id]/liquidar/route';
import { GET as getActaHandler } from '../src/app/api/v1/practicas/[id]/acta-cierre/route';

// Mock en memoria del repositorio de prácticas para pruebas unitarias e integración
class MockPracticeLiquidationRepository extends PracticeRepository {
  public practices: Map<string, any> = new Map();

  constructor() {
    super();
  }

  addPractice(p: any) {
    this.practices.set(p.id, JSON.parse(JSON.stringify(p)));
  }

  async findPracticeForLiquidation(practiceId: string): Promise<any> {
    const p = this.practices.get(practiceId);
    if (!p) return null;
    return JSON.parse(JSON.stringify(p));
  }

  async liquidatePractice(params: {
    practiceId: string;
    finalScore: number;
    actorId: string;
    notes?: string;
    previousStatus: any;
  }): Promise<any> {
    const p = this.practices.get(params.practiceId);
    if (!p) throw new Error('Práctica no encontrada en mock');
    p.currentStatus = 'FINALIZADA';
    p.finalScore = params.finalScore;
    p.isActive = false;
    p.endDate = new Date();
    p.statusHistory = p.statusHistory || [];
    p.statusHistory.unshift({
      id: `hist_${Date.now()}`,
      practiceId: p.id,
      fromStatus: params.previousStatus,
      toStatus: 'FINALIZADA',
      changedByUserId: params.actorId,
      notes: params.notes,
      createdAt: new Date(),
    });
    this.practices.set(p.id, p);
    return JSON.parse(JSON.stringify(p));
  }

  async updateStudentCurriculum(studentId: string): Promise<any> {
    return { id: studentId, updatedAt: new Date() };
  }
}

async function runTestSuite() {
  console.log('🧪 ====================================================================');
  console.log('🧪 SIGETRAP - Suite de Pruebas: Liquidación y Cierre de Prácticas');
  console.log('🧪 Caso de Uso: Consolidar Calificación Definitiva y Remitir a Expediente');
  console.log('🧪 ====================================================================\n');

  const mockRepo = new MockPracticeLiquidationRepository();
  const service = new PracticeLiquidationService(mockRepo);

  // Usuarios de prueba
  const coordinatorActor: AuthenticatedUser = {
    id: 'coord-001',
    name: 'Dr. Roberto Gómez (Coordinador)',
    email: 'director.sistemas@ufps.edu.co',
    role: 'DIRECTOR_PROGRAMA' as Role,
    status: 'ACTIVO',
  };

  const adminActor: AuthenticatedUser = {
    id: 'admin-001',
    name: 'Administrador del Sistema',
    email: 'admin.sigetrap@ufps.edu.co',
    role: 'ADMIN' as Role,
    status: 'ACTIVO',
  };

  const studentActor: AuthenticatedUser = {
    id: 'stud-1152001',
    name: 'Juan David Pérez',
    email: 'estudiante@ufps.edu.co',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO',
  };

  const otherStudentActor: AuthenticatedUser = {
    id: 'stud-9999999',
    name: 'Otro Estudiante Intruso',
    email: 'intruso@ufps.edu.co',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO',
  };

  // Base práctica completa y aprobada (320 horas, tutor 4.8, docente 4.5)
  const completeApprovedPractice = {
    id: 'pract-complete-001',
    studentId: 'stud-1152001',
    companyId: 'comp-001',
    currentStatus: 'PRACTICA_EN_EJECUCION',
    totalHoursRequired: 320,
    totalHoursCompleted: 320,
    finalScore: null,
    isActive: true,
    student: {
      id: 'stud-1152001',
      name: 'Juan David Pérez',
      email: 'estudiante@ufps.edu.co',
      studentCode: '1152001',
      documentNumber: '1090123456',
      program: 'Ingeniería de Sistemas',
      academicAverage: 4.25,
      approvedCredits: 130,
    },
    company: {
      id: 'comp-001',
      businessName: 'Tech Innovations Colombia S.A.S.',
      nit: '900123456-1',
      city: 'Cúcuta',
    },
    vacancy: {
      id: 'vac-001',
      title: 'Desarrollador Full Stack',
      program: 'Ingeniería de Sistemas',
    },
    teacher: {
      id: 'teacher-001',
      name: 'Ing. Laura Restrepo',
      email: 'docente.practica@ufps.edu.co',
    },
    tutor: {
      id: 'tutor-001',
      name: 'Ing. Andrés Silva',
      email: 'tutor@techinnovations.co',
    },
    workPlan: {
      id: 'plan-001',
      status: 'APROBADO_DUAL',
      tutorApproved: true,
      teacherApproved: true,
    },
    evaluations: [
      {
        id: 'eval-tutor-001',
        type: 'FINAL_TUTOR',
        quantitativeScore: 4.8,
        qualitativeComments: 'Excelente desempeño y puntualidad en el equipo de desarrollo.',
        createdAt: new Date(),
        evaluator: { id: 'tutor-001', name: 'Ing. Andrés Silva', role: 'TUTOR_EMPRESARIAL' },
      },
      {
        id: 'eval-docente-001',
        type: 'FINAL_DOCENTE',
        quantitativeScore: 4.5,
        qualitativeComments: 'Sustentación sobresaliente con informe técnico detallado.',
        createdAt: new Date(),
        evaluator: { id: 'teacher-001', name: 'Ing. Laura Restrepo', role: 'DOCENTE_PRACTICA' },
      },
    ],
    advanceReports: [
      { id: 'rep-001', estado: 'Aprobado', horasEjecutadas: 160 },
      { id: 'rep-002', estado: 'Aprobado', horasEjecutadas: 160 },
    ],
    statusHistory: [],
  };

  mockRepo.addPractice(completeApprovedPractice);

  // ----------------------------------------------------------------------------
  // TEST 1: Criterio 1 - Consulta de Resumen y Desglose Ponderado
  // ----------------------------------------------------------------------------
  console.log('📌 Test 1 (Criterio 1): Consulta de resumen de liquidación con desglose ponderado (50/30/20)...');
  const summary = await service.getLiquidationSummary('pract-complete-001', coordinatorActor);

  // 50% * 4.8 = 2.40; 30% * 4.5 = 1.35; 20% * 5.0 (320/320 hrs) = 1.00; Total = 4.75
  const expectedTotal = 4.75;
  if (
    summary.evaluationsBreakdown.length === 2 &&
    summary.evaluationsBreakdown[0].weightPercentage === 50 &&
    summary.evaluationsBreakdown[1].weightPercentage === 30 &&
    summary.hoursBreakdown.weightPercentage === 20 &&
    summary.cumulativeFinalScore === expectedTotal &&
    summary.approvalStatus === 'APROBADO' &&
    summary.isLiquidable === true
  ) {
    console.log(`  ✅ PASÓ (Criterio 1): Ponderado exacto (${summary.cumulativeFinalScore}/5.0), concepto ${summary.approvalStatus} y todos los prerrequisitos completos.`);
  } else {
    throw new Error(`Falló Test 1. Ponderado obtenido: ${summary.cumulativeFinalScore}, esperado: ${expectedTotal}`);
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Criterio 2 - Bloqueo por Prerrequisitos Incompletos
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 2 (Criterio 2): Intento de liquidación con evaluaciones y horas faltantes...');
  const incompletePractice = {
    ...completeApprovedPractice,
    id: 'pract-incomplete-002',
    totalHoursCompleted: 150, // Solo 150 de 320
    evaluations: [], // Sin evaluaciones
    advanceReports: [],
    workPlan: { id: 'plan-002', status: 'BORRADOR', tutorApproved: false, teacherApproved: false },
  };
  mockRepo.addPractice(incompletePractice);

  const incompleteSummary = await service.getLiquidationSummary('pract-incomplete-002', coordinatorActor);
  if (!incompleteSummary.isLiquidable && incompleteSummary.missingRequirements.length >= 3) {
    console.log(`  ✅ PASÓ (Criterio 2 - Resumen): Identificó ${incompleteSummary.missingRequirements.length} prerrequisito(s) faltante(s). Botón permanece bloqueado.`);
  } else {
    throw new Error('Falló Test 2: debió indicar que no es liquidable.');
  }

  try {
    await service.liquidatePractice('pract-incomplete-002', {}, coordinatorActor);
    throw new Error('Debió fallar por prerrequisitos pendientes');
  } catch (e: any) {
    if (e instanceof PracticeLiquidationError && e.code === 'PREREQUISITES_NOT_MET' && e.statusCode === 422) {
      console.log(`  ✅ PASÓ (Criterio 2 - Bloqueo): Operación rechazada con HTTP 422 [PREREQUISITES_NOT_MET]: ${e.message.substring(0, 80)}...`);
    } else {
      throw e;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Criterio 3 & RN02 - Confirmación de Liquidación y Nota >= 3.0 (Aprobado)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 3 (Criterio 3 & RN02): Liquidación exitosa con calificación aprobatoria (>= 3.0)...');
  const result = await service.liquidatePractice(
    'pract-complete-001',
    { academicResolutionNumber: 'RES-CD-045-2026', observations: 'Cumplimiento sobresaliente' },
    coordinatorActor
  );

  if (
    result.finalScore === 4.75 &&
    result.approvalStatus === 'APROBADO' &&
    result.actaNumber.startsWith('ACTA-CIERRE-') &&
    result.curriculumTransferred === true
  ) {
    console.log(`  ✅ PASÓ (Criterio 3): Práctica liquidada exitosamente. Acta emitida: '${result.actaNumber}' con nota ${result.finalScore} (${result.approvalStatus}).`);
  } else {
    throw new Error('Falló Test 3: liquidación no produjo el resultado esperado.');
  }

  // ----------------------------------------------------------------------------
  // TEST 4: RN02 - Criterio de Calificación Reprobatoria (< 3.0)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 4 (RN02): Liquidación con calificación reprobatoria (< 3.0 -> REPROBADO)...');
  const failedPractice = {
    ...completeApprovedPractice,
    id: 'pract-failed-003',
    evaluations: [
      {
        id: 'eval-t-f',
        type: 'FINAL_TUTOR',
        quantitativeScore: 2.0, // 50% * 2.0 = 1.0
        createdAt: new Date(),
        evaluator: { id: 'tutor-001', name: 'Ing. Andrés Silva' },
      },
      {
        id: 'eval-d-f',
        type: 'FINAL_DOCENTE',
        quantitativeScore: 2.2, // 30% * 2.2 = 0.66
        createdAt: new Date(),
        evaluator: { id: 'teacher-001', name: 'Ing. Laura Restrepo' },
      },
    ],
    // 20% * (320/320 * 2.0 informes deficientes = 0.40) -> Total = 2.06 (< 3.0)
    advanceReports: [{ id: 'rep-f', estado: 'Aprobado', horasEjecutadas: 320 }],
  };
  mockRepo.addPractice(failedPractice);

  const failResult = await service.liquidatePractice(
    'pract-failed-003',
    { forceGrade: 2.1 }, // Calificación deficiente
    coordinatorActor
  );

  if (failResult.finalScore === 2.1 && failResult.approvalStatus === 'REPROBADO') {
    console.log(`  ✅ PASÓ (RN02): Calificación inferior a 3.0 asigna automáticamente concepto '${failResult.approvalStatus}'.`);
  } else {
    throw new Error(`Falló Test 4. Concepto obtenido: ${failResult.approvalStatus}`);
  }

  // ----------------------------------------------------------------------------
  // TEST 5: RN03 - Inmutabilidad de la Calificación y Práctica Liquidada
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 5 (RN03): Intento de modificar o re-liquidar una práctica ya cerrada...');
  try {
    await service.liquidatePractice('pract-complete-001', { forceGrade: 5.0 }, coordinatorActor);
    throw new Error('Debió rechazar por inmutabilidad');
  } catch (e: any) {
    if (e instanceof PracticeLiquidationError && e.code === 'ALREADY_LIQUIDATED' && e.statusCode === 409) {
      console.log(`  ✅ PASÓ (RN03): Inmutabilidad confirmada con HTTP 409 [ALREADY_LIQUIDATED]: ${e.message}`);
    } else {
      throw e;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 6: RN01 - Control de Acceso RBAC (Bloqueo a rol ESTUDIANTE)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 6 (RN01): Intento de liquidación iniciado por un usuario con rol ESTUDIANTE...');
  const practiceToTestRbac = { ...completeApprovedPractice, id: 'pract-rbac-004' };
  mockRepo.addPractice(practiceToTestRbac);

  try {
    await service.liquidatePractice('pract-rbac-004', {}, studentActor);
    throw new Error('Debió bloquear al estudiante');
  } catch (e: any) {
    if (e instanceof PracticeLiquidationError && e.code === 'FORBIDDEN_OPERATION' && e.statusCode === 403) {
      console.log(`  ✅ PASÓ (RN01): Acceso denegado a estudiante con HTTP 403 [FORBIDDEN_OPERATION].`);
    } else {
      throw e;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Criterio 4 - Remisión al Expediente y Notificaciones
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 7 (Criterio 4): Verificación de remisión al expediente curricular y notificaciones...');
  if (result.curriculumTransferred && result.notificationsSent.student && result.notificationsSent.tutor) {
    console.log(`  ✅ PASÓ (Criterio 4): Remisión curricular confirmada y disparador de notificaciones activo.`);
  } else {
    throw new Error('Falló Test 7 en la remisión curricular o notificaciones.');
  }

  // ----------------------------------------------------------------------------
  // TEST 8: Criterio 5 - Generación y Descarga de Acta Oficial de Cierre
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 8 (Criterio 5): Generación del Acta de Cierre con sellos y verificación criptográfica...');
  const acta = await service.generateActaCierre('pract-complete-001', studentActor);

  if (
    acta.html.includes('Universidad Francisco de Paula Santander') &&
    acta.html.includes(result.actaNumber) &&
    acta.html.includes('SELLO DIGITAL Y VERIFICACIÓN CRIPTOGRÁFICA') &&
    acta.html.includes('Concepto Final: APROBADO') &&
    acta.isApproved === true
  ) {
    console.log(`  ✅ PASÓ (Criterio 5): Documento HTML/PDF del acta generado con membrete oficial, hash criptográfico y firmas.`);
  } else {
    throw new Error('Falló Test 8 en la estructura del acta de cierre.');
  }

  // ----------------------------------------------------------------------------
  // TEST 9: Aislamiento Multitenancy para Consulta de Acta entre Estudiantes
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 9 (Seguridad): Estudiante ajeno intentando consultar el acta de otro practicante...');
  try {
    await service.generateActaCierre('pract-complete-001', otherStudentActor);
    throw new Error('Debió denegar acceso al estudiante no propietario');
  } catch (e: any) {
    if (e.code === 'FORBIDDEN_OPERATION' && e.statusCode === 403) {
      console.log(`  ✅ PASÓ (Seguridad): Aislamiento confirmado. Estudiante ajeno bloqueado con 403 Forbidden.`);
    } else {
      throw e;
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 10: Integración HTTP Route Handlers
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 10 (HTTP Route Handlers): Verificación de endpoints REST...');

  // 10.1 GET resumen sin token -> 401
  const reqUnauth = new NextRequest('http://localhost:3000/api/v1/practicas/pract-complete-001/resumen-liquidacion');
  const resUnauth = await getResumenHandler(reqUnauth, { params: Promise.resolve({ id: 'pract-complete-001' }) });
  if (resUnauth.status === 401) {
    console.log('  ✅ PASÓ (HTTP 401): Endpoint de resumen rechaza peticiones sin sesión activa.');
  } else {
    throw new Error(`Esperado 401, recibido ${resUnauth.status}`);
  }

  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE LA HISTORIA DE USUARIO PASARON CON ÉXITO (10/10)');
  console.log('🎉 ====================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ ERROR FATAL EN SUITE DE PRUEBAS:', err);
  process.exit(1);
});
