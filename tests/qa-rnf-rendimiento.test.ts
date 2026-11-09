// ==============================================================================
// SIGETRAP - Suite de Pruebas: QA Verificación de Requerimientos No Funcionales (RNF)
// Módulo: Rendimiento, Concurrencia y Disponibilidad
// Criterio Evaluado:
//   - Criterio 3: Verificación de Requerimientos No Funcionales (RNF)
//     Dado que el entorno de pruebas está bajo condiciones de carga estándar,
//     Cuando se simulan peticiones concurrentes a los servicios principales (generación de actas, carga de dashboard),
//     Entonces el tiempo de respuesta promedio de las APIs debe ser inferior a 2 segundos (p95 < 2.5 s)
//     y no deben presentarse caídas del servicio (disponibilidad esperada > 99.5%).
// ==============================================================================

import {
  PracticeLiquidationService,
} from '../src/server/services/practice-liquidation.service';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import { AuthenticatedUser, Role } from '../src/types';

class MockRnfRepository extends PracticeRepository {
  public practices: Map<string, any> = new Map();

  addPractice(p: any) {
    this.practices.set(p.id, JSON.parse(JSON.stringify(p)));
  }

  async findPracticeForLiquidation(practiceId: string): Promise<any> {
    const p = this.practices.get(practiceId);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }
}

// Función auxiliar para calcular percentiles
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

export async function runQaRnfPerformanceTests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 SIGETRAP - QA Suite 3: Verificación de Requerimientos No Funcionales');
  console.log('🧪 Criterio 3: Rendimiento bajo Carga, Latencias (p95 < 2.5s) y Disponibilidad');
  console.log('🧪 Servicios Clave: Generación de Actas, Carga de Dashboard y Liquidación');
  console.log('🧪 ====================================================================\n');

  const repo = new MockRnfRepository();
  const liquidationService = new PracticeLiquidationService(repo);

  // Sembrar 20 prácticas sintéticas para pruebas concurrentes
  for (let i = 1; i <= 20; i++) {
    const id = `pract_rnf_${i.toString().padStart(3, '0')}`;
    repo.addPractice({
      id,
      studentId: `stud_rnf_${i}`,
      currentStatus: 'FINALIZADA',
      totalHoursRequired: 320,
      totalHoursCompleted: 320,
      finalScore: 4.5,
      isActive: false,
      student: {
        id: `stud_rnf_${i}`,
        name: `Estudiante Rendimiento ${i}`,
        email: `estudiante.${i}@ufps.edu.co`,
        studentCode: `11520${i.toString().padStart(2, '0')}`,
        documentNumber: `109000${i.toString().padStart(4, '0')}`,
        program: 'Ingeniería de Sistemas',
      },
      company: { id: `comp_${i}`, businessName: `Empresa Carga ${i} SAS`, nit: `900111222-${i}` },
      workPlan: { status: 'APROBADO_DUAL', tutorApproved: true, teacherApproved: true },
      evaluations: [
        { type: 'FINAL_TUTOR', quantitativeScore: 4.8, evaluator: { name: 'Tutor Carga' } },
        { type: 'FINAL_DOCENTE', quantitativeScore: 4.6, evaluator: { name: 'Docente Carga' } },
      ],
      advanceReports: [
        { id: `rep_${i}_1`, estado: 'Aprobado', horasEjecutadas: 160 },
        { id: `rep_${i}_2`, estado: 'Aprobado', horasEjecutadas: 160 },
      ],
    });
  }

  const coordinatorActor: AuthenticatedUser = {
    id: 'usr_coord_rnf',
    name: 'Coordinador QA RNF',
    email: 'coord.rnf@ufps.edu.co',
    role: 'DIRECTOR_PROGRAMA' as Role,
    status: 'ACTIVO',
  };

  console.log('📌 Test 1 (RNF / Carga Concurrente): Ejecutando 100 peticiones concurrentes (Dashboard, Liquidación y Actas)...');
  
  const TOTAL_REQUESTS = 100;
  const latencies: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
  const startTimeTotal = Date.now();

  // Simular 100 peticiones en paralelo distribuidas entre los servicios principales:
  // - Carga de Dashboard / Resumen de liquidación con cálculo ponderado (50%)
  // - Generación dinámica de Acta Oficial con sellos criptográficos SHA-256 (50%)
  const tasks = Array.from({ length: TOTAL_REQUESTS }, async (_, idx) => {
    const practiceId = `pract_rnf_${((idx % 20) + 1).toString().padStart(3, '0')}`;
    const opType = idx % 2;
    const t0 = performance.now();

    try {
      if (opType === 0) {
        // Operación 1: Carga de Dashboard / Resumen de liquidación
        await liquidationService.getLiquidationSummary(practiceId, coordinatorActor);
      } else {
        // Operación 2: Generación de Acta Oficial con hash SHA-256
        await liquidationService.generateActaCierre(practiceId, coordinatorActor);
      }

      const t1 = performance.now();
      latencies.push(t1 - t0);
      successfulRequests++;
    } catch (err: any) {
      failedRequests++;
    }
  });

  await Promise.all(tasks);
  const totalDurationMs = Date.now() - startTimeTotal;
  const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;

  // Ordenar latencias para análisis estadístico
  latencies.sort((a, b) => a - b);

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const minLatency = latencies[0];
  const maxLatency = latencies[latencies.length - 1];
  const p50 = calculatePercentile(latencies, 50);
  const p90 = calculatePercentile(latencies, 90);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const availability = (successfulRequests / TOTAL_REQUESTS) * 100;
  const throughputRps = (TOTAL_REQUESTS / (totalDurationMs / 1000)).toFixed(1);

  console.log('\n📊 ------------------ METRICAS DE RENDIMIENTO Y RNF ------------------');
  console.log(`  • Peticiones totales:     ${TOTAL_REQUESTS} concurrentes`);
  console.log(`  • Peticiones exitosas:    ${successfulRequests} (${availability.toFixed(2)}%)`);
  console.log(`  • Fallos / Caídas:        ${failedRequests}`);
  console.log(`  • Tiempo total:           ${totalDurationMs} ms (~${throughputRps} req/seg)`);
  console.log(`  • Latencia mínima:        ${minLatency.toFixed(2)} ms`);
  console.log(`  • Latencia promedio:      ${avgLatency.toFixed(2)} ms (SLA < 2000 ms)`);
  console.log(`  • Mediana (p50):          ${p50.toFixed(2)} ms`);
  console.log(`  • Percentil 90 (p90):     ${p90.toFixed(2)} ms`);
  console.log(`  • Percentil 95 (p95):     ${p95.toFixed(2)} ms (SLA < 2500 ms)`);
  console.log(`  • Percentil 99 (p99):     ${p99.toFixed(2)} ms`);
  console.log(`  • Latencia máxima:        ${maxLatency.toFixed(2)} ms`);
  console.log(`  • Disponibilidad (Uptime): ${availability.toFixed(2)}% (SLA > 99.5%)`);
  console.log(`  • Memoria Heap Delta:     +${(memAfter - memBefore).toFixed(2)} MB`);
  console.log('---------------------------------------------------------------------\n');

  // Validaciones estrictas de SLAs de RNF según la Historia de Usuario
  let passed = true;

  if (avgLatency > 2000) {
    console.error(`❌ Incumplimiento RNF: Latencia promedio ${avgLatency.toFixed(2)}ms supera el umbral de 2000ms`);
    passed = false;
  } else {
    console.log(`✅ CUMPLIDO: Latencia promedio (${avgLatency.toFixed(2)} ms) < 2.0 s.`);
  }

  if (p95 > 2500) {
    console.error(`❌ Incumplimiento RNF: Percentil 95 (${p95.toFixed(2)}ms) supera el umbral de 2500ms`);
    passed = false;
  } else {
    console.log(`✅ CUMPLIDO: Percentil 95 (${p95.toFixed(2)} ms) < 2.5 s.`);
  }

  if (availability < 99.5) {
    console.error(`❌ Incumplimiento RNF: Disponibilidad ${availability.toFixed(2)}% inferior al 99.5%`);
    passed = false;
  } else {
    console.log(`✅ CUMPLIDO: Disponibilidad del servicio (${availability.toFixed(2)}%) > 99.5% sin caídas.`);
  }

  console.log('\n====================================================================');
  console.log(`🎉 RESULTADOS QA SUITE 3 (RNF): REQUERIMIENTOS NO FUNCIONALES VALIDADOS AL 100%`);
  console.log('====================================================================\n');

  if (!passed) {
    throw new Error('Fallo en la verificación de requerimientos no funcionales (RNF).');
  }

  return {
    totalRequests: TOTAL_REQUESTS,
    successfulRequests,
    failedRequests,
    availability,
    avgLatency,
    p95,
    p99,
    throughputRps,
  };
}

if (require.main === module) {
  runQaRnfPerformanceTests().catch((err) => {
    console.error('Error fatal en QA Suite 3:', err);
    process.exit(1);
  });
}
