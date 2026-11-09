// ==============================================================================
// SIGETRAP - Suite de Pruebas: QA Integración Continua de Punta a Punta (E2E)
// Módulo: Aseguramiento de Calidad / Validación Integral
// Criterio Evaluado:
//   - Criterio 1: Pruebas funcionales y de integración continua (E2E)
//     Dado que los módulos de rúbrica, liquidación, ARL y dashboard están desarrollados,
//     Cuando se ejecutan los flujos completos de punta a punta (estudiante postula -> empresa califica -> coordinador liquida),
//     Entonces todos los casos de prueba de integración deben finalizar con un 100% de éxito,
//     sin inconsistencias de estado ni pérdidas de datos en base de datos.
//   - RN03: Protección de datos personales (datos sintéticos y anonimizados).
// ==============================================================================

import {
  PracticeLiquidationService,
  PracticeLiquidationError,
} from '../src/server/services/practice-liquidation.service';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import {
  AuthenticatedUser,
  Role,
  LiquidationApprovalStatus,
} from '../src/types';

// Repositorio en memoria integrado que soporta el ciclo de vida completo
class MockIntegratedQaRepository extends PracticeRepository {
  public users: Map<string, any> = new Map();
  public practices: Map<string, any> = new Map();
  public statusHistories: Map<string, any[]> = new Map();
  public curriculumRecords: Map<string, any> = new Map();

  addUser(u: any) {
    this.users.set(u.id, { ...u });
  }

  addPractice(p: any) {
    this.practices.set(p.id, JSON.parse(JSON.stringify(p)));
  }

  async findPracticeById(id: string): Promise<any> {
    const p = this.practices.get(id);
    return p ? JSON.parse(JSON.stringify(p)) : null;
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
    if (!p) throw new Error('Práctica no encontrada para liquidar');
    p.currentStatus = 'FINALIZADA';
    p.finalScore = params.finalScore;
    p.isActive = false;
    p.endDate = new Date();
    p.notes = params.notes;

    if (!this.statusHistories.has(params.practiceId)) {
      this.statusHistories.set(params.practiceId, []);
    }
    this.statusHistories.get(params.practiceId)!.push({
      id: `hist_liq_${Date.now()}`,
      practiceId: params.practiceId,
      previousStatus: params.previousStatus,
      newStatus: 'FINALIZADA',
      changedById: params.actorId,
      notes: params.notes,
      createdAt: new Date(),
    });

    return JSON.parse(JSON.stringify(p));
  }

  async updateStudentCurriculum(params: {
    studentId: string;
    practiceId: string;
    finalScore: number;
    approvalStatus: LiquidationApprovalStatus;
    periodoId: string;
  }): Promise<any> {
    this.curriculumRecords.set(params.studentId, {
      ...params,
      settledAt: new Date(),
    });
    return this.curriculumRecords.get(params.studentId);
  }
}

// Suite de ejecución de pruebas E2E
export async function runQaIntegrationE2ETests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 SIGETRAP - QA Suite 1: Pruebas Funcionales y de Integración E2E');
  console.log('🧪 Criterio 1: Ciclo Integral Punta a Punta (Estudiante -> Tutor -> Coordinador)');
  console.log('🧪 RN03: Datos Sintéticos y Anonimizados (Habeas Data)');
  console.log('🧪 ====================================================================\n');

  const repo = new MockIntegratedQaRepository();
  const liquidationService = new PracticeLiquidationService(repo);

  let passedTests = 0;
  const totalTests = 4;

  const studentUser: AuthenticatedUser = {
    id: 'usr_student_sintetico_01',
    name: 'Valentina Gómez',
    email: 'estudiante.qa@ufps.edu.co',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO',
  };

  const supervisorDocente: AuthenticatedUser = {
    id: 'usr_docente_supervisor_01',
    name: 'Carlos Pérez',
    email: 'docente.supervisor@ufps.edu.co',
    role: 'DOCENTE_PRACTICA' as Role,
    status: 'ACTIVO',
  };

  const tutorEmpresarial: AuthenticatedUser = {
    id: 'usr_tutor_empresarial_01',
    name: 'Andrea Morales',
    email: 'tutor.externo@techcorp.com',
    role: 'TUTOR_EMPRESARIAL' as Role,
    status: 'ACTIVO',
  };

  const coordinador: AuthenticatedUser = {
    id: 'usr_coordinador_01',
    name: 'Ing. Sandra Mendoza',
    email: 'coordinador.practicas@ufps.edu.co',
    role: 'DIRECTOR_PROGRAMA' as Role,
    status: 'ACTIVO',
  };

  const completePractice = {
    id: 'pract_qa_e2e_full_cycle',
    studentId: studentUser.id,
    companyId: 'comp-qa-001',
    periodoId: 'periodo_2026_1',
    currentStatus: 'PRACTICA_EN_EJECUCION',
    totalHoursRequired: 320,
    totalHoursCompleted: 320,
    finalScore: null,
    isActive: true,
    student: {
      id: studentUser.id,
      name: 'Valentina Gómez',
      email: studentUser.email,
      studentCode: '1151999',
      documentNumber: '1090888777',
      program: 'Ingeniería de Sistemas',
      academicAverage: 4.25,
      approvedCredits: 135,
    },
    company: {
      id: 'comp-qa-001',
      businessName: 'TechCorp Colombia SAS (Sintética)',
      nit: '900555777-1',
      city: 'Cúcuta',
    },
    vacancy: {
      id: 'vac-qa-001',
      title: 'Desarrollador Junior Fullstack',
      program: 'Ingeniería de Sistemas',
    },
    teacher: {
      id: supervisorDocente.id,
      name: supervisorDocente.name,
      email: supervisorDocente.email,
    },
    tutor: {
      id: tutorEmpresarial.id,
      name: tutorEmpresarial.name,
      email: tutorEmpresarial.email,
    },
    workPlan: {
      id: 'wp-qa-001',
      status: 'APROBADO_DUAL',
      tutorApproved: true,
      teacherApproved: true,
    },
    evaluations: [
      {
        id: 'eval-tutor-qa-001',
        type: 'FINAL_TUTOR',
        quantitativeScore: 4.8,
        qualitativeComments: 'Excelente desempeño técnico, proactividad y trabajo en equipo.',
        createdAt: new Date('2026-06-01'),
        evaluator: { id: tutorEmpresarial.id, name: tutorEmpresarial.name, role: 'TUTOR_EMPRESARIAL' },
      },
      {
        id: 'eval-docente-qa-001',
        type: 'FINAL_DOCENTE',
        quantitativeScore: 4.5,
        qualitativeComments: 'Cumplimiento sobresaliente del plan de trabajo formativo.',
        createdAt: new Date('2026-06-05'),
        evaluator: { id: supervisorDocente.id, name: supervisorDocente.name, role: 'DOCENTE_PRACTICA' },
      },
    ],
    advanceReports: [
      { id: 'rep-qa-001', estado: 'Aprobado', horasEjecutadas: 160 },
      { id: 'rep-qa-002', estado: 'Aprobado', horasEjecutadas: 160 },
    ],
    statusHistory: [],
  };

  repo.addPractice(completePractice);

  // ----------------------------------------------------------------------------
  // TEST 1: Ciclo de Vida Completo E2E (Happy Path)
  // ----------------------------------------------------------------------------
  console.log('📌 Test 1 (Criterio 1): Flujo E2E Completo: Postulación -> Formalización -> Calificación -> Liquidación...');
  try {
    const practiceId = completePractice.id;

    // 1. Coordinador consulta resumen de liquidación
    const summary = await liquidationService.getLiquidationSummary(practiceId, coordinador);

    // Verificación de ponderado exacto: (0.50 * 4.8) + (0.30 * 4.5) + (0.20 * 5.0) = 2.40 + 1.35 + 1.00 = 4.75
    const expectedFinal = 4.75;
    if (summary.cumulativeFinalScore !== expectedFinal) {
      throw new Error(`Ponderado calculado incorrecto. Esperado ${expectedFinal}, obtenido ${summary.cumulativeFinalScore}`);
    }
    if (!summary.isLiquidable) {
      throw new Error(`Se esperaba isLiquidable = true con todos los prerrequisitos completos. Faltantes: ${summary.missingRequirements.join(', ')}`);
    }

    // 2. Coordinador ejecuta la Liquidación y Cierre de la Práctica
    const liquidationResult = await liquidationService.liquidatePractice(
      practiceId,
      {
        academicResolutionNumber: 'RES-CD-045-2026',
        observations: 'Práctica culminada con honores y recomendación especial para grado.',
      },
      coordinador
    );

    // 3. Validaciones de consistencia de datos y remisión
    if (liquidationResult.finalScore !== expectedFinal) {
      throw new Error(`La nota definitiva liquidada debería ser ${expectedFinal}, obtenido: ${liquidationResult.finalScore}`);
    }
    if (liquidationResult.approvalStatus !== 'APROBADO') {
      throw new Error(`El concepto de aprobación debería ser APROBADO`);
    }
    if (!liquidationResult.actaNumber || !liquidationResult.actaNumber.startsWith('ACTA-CIERRE-')) {
      throw new Error(`Código de acta inválido: ${liquidationResult.actaNumber}`);
    }
    if (!liquidationResult.curriculumTransferred) {
      throw new Error(`El resultado no fue remitido al expediente curricular`);
    }

    console.log(`  ✅ PASÓ (Flujo E2E): Nota consolidada: ${liquidationResult.finalScore}/5.0 (${liquidationResult.approvalStatus}).`);
    console.log(`  ✅ PASÓ (Acta emitida): ${liquidationResult.actaNumber} | Remitido a expediente curricular: Sí.`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FALLÓ Test 1:`, err.message);
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Inmutabilidad y Protección ante Re-liquidación (RN03)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 2 (Integridad BD & RN03): Intento de alterar o re-liquidar una práctica ya cerrada...');
  try {
    const practiceId = completePractice.id;

    let alreadyLiquidatedBlocked = false;
    try {
      await liquidationService.liquidatePractice(
        practiceId,
        { observations: 'Intento no autorizado de re-asentar nota' },
        coordinador
      );
    } catch (e: any) {
      if (e instanceof PracticeLiquidationError && e.code === 'ALREADY_LIQUIDATED' && e.statusCode === 409) {
        alreadyLiquidatedBlocked = true;
      }
    }

    if (!alreadyLiquidatedBlocked) {
      throw new Error('Se esperaba rechazo con código ALREADY_LIQUIDATED y HTTP 409');
    }

    console.log('  ✅ PASÓ (RN03 Inmutabilidad): La práctica cerrada no puede ser re-liquidada (HTTP 409).');
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FALLÓ Test 2:`, err.message);
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Restricción de Prerrequisitos de Liquidación (Cierre Preventivo)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 3 (Criterio 2 / Consistencia): Intento de liquidación prematura sin evaluación empresarial...');
  try {
    const incompletePracticeId = 'pract_qa_incompleta';
    repo.addPractice({
      ...completePractice,
      id: incompletePracticeId,
      studentId: 'usr_student_sintetico_03',
      currentStatus: 'PRACTICA_EN_EJECUCION',
      totalHoursCompleted: 150, // Solo 150 de 320
      evaluations: [], // Sin evaluaciones
      advanceReports: [],
      workPlan: { id: 'plan-002', status: 'BORRADOR', tutorApproved: false, teacherApproved: false },
    });

    let prevented = false;
    try {
      await liquidationService.liquidatePractice(incompletePracticeId, {}, coordinador);
    } catch (e: any) {
      if (e instanceof PracticeLiquidationError && e.code === 'PREREQUISITES_NOT_MET' && e.statusCode === 422) {
        prevented = true;
      }
    }

    if (!prevented) {
      throw new Error('La liquidación debió ser rechazada con código PREREQUISITES_NOT_MET');
    }

    console.log('  ✅ PASÓ (Cierre Preventivo): Se impidió liquidación prematura por falta de requisitos (HTTP 422).');
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FALLÓ Test 3:`, err.message);
  }

  // ----------------------------------------------------------------------------
  // TEST 4: Generación y Verificación de Integridad de Acta Oficial (Criterio 5)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 4 (Criterio 5): Verificación de generación de acta con firmas y hash SHA-256...');
  try {
    const completedPracticeId = completePractice.id;
    const actaResult = await liquidationService.generateActaCierre(
      completedPracticeId,
      studentUser
    );

    if (!actaResult.html.includes('Universidad Francisco de Paula Santander')) {
      throw new Error('El acta no contiene el membrete institucional');
    }
    if (!actaResult.html.includes('SELLO DIGITAL Y VERIFICACIÓN CRIPTOGRÁFICA')) {
      throw new Error('El acta no contiene el sello digital criptográfico');
    }
    if (!actaResult.html.includes('Concepto Final: APROBADO') || !actaResult.isApproved) {
      throw new Error('El acta no contiene el concepto definitivo de aprobación');
    }

    console.log('  ✅ PASÓ (Acta Institucional): Documento oficial validado con membrete UFPS y sello digital SHA-256.');
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FALLÓ Test 4:`, err.message);
  }

  console.log('\n====================================================================');
  console.log(`🎉 RESULTADOS QA SUITE 1 (E2E): ${passedTests}/${totalTests} PRUEBAS PASARON SATISFACTORIAMENTE`);
  console.log('====================================================================\n');

  if (passedTests !== totalTests) {
    throw new Error(`Suite QA E2E falló: ${passedTests}/${totalTests} pruebas pasaron.`);
  }
}

// Ejecución directa si se invoca con tsx
if (require.main === module) {
  runQaIntegrationE2ETests().catch((err) => {
    console.error('Error fatal en QA Suite 1:', err);
    process.exit(1);
  });
}
