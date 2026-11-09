// ==============================================================================
// SIGETRAP - Test de Verificación CU14: Entrega de Informes de Avance y Bitácoras
// Módulo / Épica: Seguimiento y Control de Prácticas
// Caso de Uso: CU14 - Entrega de Informes de Avance
// Entidades BD: informes_avance, practicas_formativas, bitacoras_seguimiento, archivos_adjuntos
// Restricciones SQL: chk_horas_ejecutadas_positivas, chk_estado_informe, fk_informe_practica
//
// Criterios de Aceptación Evaluados:
//   - Criterio 1: Radicación exitosa de informe y bitácora (PU/Integración)
//                 Dado que un practicante tiene una práctica en estado "Formalizada" o "En Curso"
//                 e ingresa la descripción de actividades junto a un número de horas válido (> 0),
//                 cuando confirma el envío de su informe de seguimiento,
//                 entonces el registro se inserta en informes_avance con estado "Radicado",
//                 se actualiza la fecha de entrega y el API devuelve 201 Created.
//   - Criterio 2: Validación de horas ejecutadas inválidas (PU)
//                 Dado que el practicante intenta radicar un informe ingresando un valor de horas
//                 menor o igual a cero (0), cuando se envía la solicitud para almacenar el registro
//                 en la base de datos, entonces la validación falla por la restricción
//                 chk_horas_ejecutadas_positivas y el API responde 400 Bad Request indicando que
//                 las horas reportadas deben ser mayores a cero.
//   - Criterio 3: Bloqueo de radicación para prácticas no activas (Integración)
//                 Dado que el estudiante se encuentra asociado a una práctica en estado
//                 "Finalizada", "Cancelada" o "En Trámite", cuando intenta enviar o radicar una
//                 bitácora de seguimiento, entonces el sistema restringe la acción y el API
//                 responde 403 Forbidden (o 422 Unprocessable Entity) señalando que solo se
//                 permiten radicaciones sobre prácticas activas en curso.
//   - Criterios Complementarios:
//                 Restricción chk_estado_informe, restricción fk_informe_practica,
//                 descripción de actividades requerida, RBAC y aislamiento de estudiantes,
//                 y verificación completa de endpoints HTTP Route Handler (POST 201, 400, 403, 401).
// ==============================================================================

import { NextRequest } from 'next/server';
import {
  PracticeFollowUpService,
  PracticeFollowUpError,
  setPracticeFollowUpServiceInstance,
} from '../src/server/services/practice-followup.service';
import {
  AdvanceReportRepository,
  CreateAdvanceReportParams,
} from '../src/server/repositories/advance-report.repository';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import {
  AuthenticatedUser,
  Role,
  UserStatus,
  PracticeStatus,
} from '../src/types';
import { POST as informesRouteHandler, GET as getInformesRouteHandler } from '../src/app/api/v1/informes-avance/route';
import { POST as practicaInformesRouteHandler } from '../src/app/api/v1/practicas/[id]/informes/route';
import { POST as bitacorasRouteHandler } from '../src/app/api/v1/bitacoras/route';
import { generateToken } from '../src/lib/auth';

// ------------------------------------------------------------------------------
// MOCKS EN MEMORIA CON SIMULACIÓN DE CONSTRAINTS SQL
// ------------------------------------------------------------------------------

class MockAdvanceReportRepository extends AdvanceReportRepository {
  public reports: any[] = [];
  public logs: any[] = [];
  public attachments: any[] = [];
  public practices: any[] = [];

  constructor(initialPractices: any[] = []) {
    super();
    this.practices = initialPractices.map((p) => ({ ...p }));
  }

  async createAdvanceReportWithLog(params: CreateAdvanceReportParams) {
    // 1. Simulación de restricción SQL: fk_informe_practica
    const practice = this.practices.find((p) => p.id === params.practicaId && !p.deletedAt);
    if (!practice) {
      const err: any = new Error(
        'insert or update on table "informes_avance" violates foreign key constraint "fk_informe_practica"'
      );
      err.code = '23503';
      err.constraint = 'fk_informe_practica';
      throw err;
    }

    // 2. Simulación de restricción SQL: chk_horas_ejecutadas_positivas
    if (params.horasEjecutadas <= 0) {
      const err: any = new Error(
        'new row for relation "informes_avance" violates check constraint "chk_horas_ejecutadas_positivas"'
      );
      err.code = '23514';
      err.constraint = 'chk_horas_ejecutadas_positivas';
      throw err;
    }

    // 3. Simulación de restricción SQL: chk_estado_informe
    const allowedEstados = ['Borrador', 'Radicado', 'En Revisión', 'Aprobado', 'Rechazado'];
    const estado = params.estado || 'Radicado';
    if (!allowedEstados.includes(estado)) {
      const err: any = new Error(
        'new row for relation "informes_avance" violates check constraint "chk_estado_informe"'
      );
      err.code = '23514';
      err.constraint = 'chk_estado_informe';
      throw err;
    }

    // Crear informe en memoria
    const report = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      practicaId: params.practicaId,
      estudianteId: params.estudianteId,
      tipo: params.tipo || 'SEGUIMIENTO',
      estado,
      horasEjecutadas: params.horasEjecutadas,
      descripcionActividades: params.descripcionActividades,
      periodoInicio: params.periodoInicio || null,
      periodoFin: params.periodoFin || null,
      fechaEntrega: params.fechaEntrega || new Date(),
      observaciones: params.observaciones || null,
      revisadoPorId: null,
      revisadoAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.reports.push(report);

    // Crear bitácora en memoria
    const log = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      informeId: report.id,
      practicaId: params.practicaId,
      estudianteId: params.estudianteId,
      fechaActividad: report.fechaEntrega,
      descripcionActividades: params.descripcionActividades,
      horasEjecutadas: params.horasEjecutadas,
      observaciones: params.observaciones || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.logs.push(log);

    // Registrar archivos adjuntos
    if (params.archivos && params.archivos.length > 0) {
      for (const a of params.archivos) {
        this.attachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          entidadTipo: 'INFORME_AVANCE',
          entidadId: report.id,
          nombreArchivo: a.nombreArchivo,
          urlArchivo: a.urlArchivo,
          tipoMime: a.tipoMime || 'application/pdf',
          tamanoBytes: a.tamanoBytes || null,
          subidoPorId: params.estudianteId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Actualizar total de horas acumuladas de la práctica
    practice.totalHoursCompleted = (practice.totalHoursCompleted || 0) + params.horasEjecutadas;
    practice.updatedAt = new Date();

    return {
      report,
      log,
      updatedPractice: practice,
    };
  }

  async findById(id: string) {
    const report = this.reports.find((r) => r.id === id && !r.deletedAt);
    if (!report) return null;
    const practice = this.practices.find((p) => p.id === report.practicaId);
    const bitacoras = this.logs.filter((l) => l.informeId === report.id);
    return {
      ...report,
      practice,
      bitacoras,
    };
  }

  async findByPracticeId(practicaId: string) {
    return this.reports.filter((r) => r.practicaId === practicaId && !r.deletedAt);
  }

  async findLogsByPracticeId(practicaId: string) {
    return this.logs.filter((l) => l.practicaId === practicaId && !l.deletedAt);
  }
}

class MockPracticeRepository extends PracticeRepository {
  public practices: any[] = [];

  constructor(initialPractices: any[] = []) {
    super();
    this.practices = initialPractices.map((p) => ({ ...p }));
  }

  async findById(practiceId: string) {
    const p = this.practices.find((item) => item.id === practiceId && !item.deletedAt);
    if (!p) return null;
    return {
      ...p,
      student: p.student || {
        id: p.studentId,
        name: 'Estudiante Practicante',
        email: 'estudiante@ufps.edu.co',
        studentCode: '1152001',
      },
    };
  }
}

// ------------------------------------------------------------------------------
// SUITE DE PRUEBAS AUTOMATIZADA
// ------------------------------------------------------------------------------

async function runCU14Tests() {
  console.log('\n======================================================================');
  console.log('🧪 SIGETRAP - Suite de Pruebas: Seguimiento y Control de Prácticas');
  console.log('🧪 Caso de Uso: CU14 - Entrega de Informes de Avance y Bitácoras');
  console.log('======================================================================\n');

  // Datos de prueba: Practicante Activo (Estudiante 1)
  const studentUser: AuthenticatedUser = {
    id: 'student-uuid-001',
    email: 'practicante.activo@ufps.edu.co',
    name: 'Juan Pérez (Practicante)',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    tokenVersion: 1,
    studentCode: '1152001',
  };

  // Estudiante 2 (Otro practicante para probar aislamiento)
  const otherStudentUser: AuthenticatedUser = {
    id: 'student-uuid-002',
    email: 'otro.estudiante@ufps.edu.co',
    name: 'María Gómez',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    tokenVersion: 1,
    studentCode: '1152002',
  };

  // Tokens JWT para pruebas de Route Handlers
  const studentToken = generateToken({
    userId: studentUser.id,
    email: studentUser.email,
    name: studentUser.name,
    role: studentUser.role,
    status: studentUser.status,
    tokenVersion: studentUser.tokenVersion,
    studentCode: studentUser.studentCode,
  });

  const otherStudentToken = generateToken({
    userId: otherStudentUser.id,
    email: otherStudentUser.email,
    name: otherStudentUser.name,
    role: otherStudentUser.role,
    status: otherStudentUser.status,
    tokenVersion: otherStudentUser.tokenVersion,
    studentCode: otherStudentUser.studentCode,
  });

  // Prácticas en diferentes estados:
  // 1. Práctica en estado "Formalizada" (ASIGNADO_FORMALMENTE)
  const practiceFormalizada = {
    id: 'practice-formalizada-001',
    studentId: studentUser.id,
    companyId: 'company-001',
    currentStatus: 'ASIGNADO_FORMALMENTE' as PracticeStatus,
    totalHoursRequired: 320,
    totalHoursCompleted: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // 2. Práctica en estado "En Curso" (PRACTICA_EN_EJECUCION)
  const practiceEnCurso = {
    id: 'practice-encurso-002',
    studentId: studentUser.id,
    companyId: 'company-001',
    currentStatus: 'PRACTICA_EN_EJECUCION' as PracticeStatus,
    totalHoursRequired: 320,
    totalHoursCompleted: 40,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // 3. Práctica en estado "Finalizada" (FINALIZADA)
  const practiceFinalizada = {
    id: 'practice-finalizada-003',
    studentId: studentUser.id,
    companyId: 'company-001',
    currentStatus: 'FINALIZADA' as PracticeStatus,
    totalHoursRequired: 320,
    totalHoursCompleted: 320,
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // 4. Práctica en estado "Cancelada" (CANCELADO / CERRADA)
  const practiceCancelada = {
    id: 'practice-cancelada-004',
    studentId: studentUser.id,
    companyId: 'company-001',
    currentStatus: 'CERRADA' as PracticeStatus,
    totalHoursRequired: 320,
    totalHoursCompleted: 50,
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // 5. Práctica en estado "En Trámite" (ASPIRANTE / POSTULADO)
  const practiceEnTramite = {
    id: 'practice-entramite-005',
    studentId: studentUser.id,
    companyId: 'company-001',
    currentStatus: 'ASPIRANTE' as PracticeStatus,
    totalHoursRequired: 320,
    totalHoursCompleted: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const initialPractices = [
    practiceFormalizada,
    practiceEnCurso,
    practiceFinalizada,
    practiceCancelada,
    practiceEnTramite,
  ];

  // Instanciar repositorios y servicio
  const mockReportRepo = new MockAdvanceReportRepository(initialPractices);
  const mockPracticeRepo = new MockPracticeRepository(initialPractices);

  const service = new PracticeFollowUpService(mockReportRepo, mockPracticeRepo);

  // Registrar singleton para que los Route Handlers HTTP compartan el estado mock
  setPracticeFollowUpServiceInstance(service);

  // ----------------------------------------------------------------------------
  // TEST 1: Criterio 1 - Radicación exitosa de informe y bitácora con práctica Formalizada
  // ----------------------------------------------------------------------------
  console.log('📌 Test 1 (Criterio 1): Radicación exitosa con práctica en estado "Formalizada"...');
  const result1 = await service.radicarInforme(
    {
      practicaId: practiceFormalizada.id,
      horasEjecutadas: 20,
      descripcionActividades: 'Configuración del entorno de desarrollo, integración con base de datos PostgreSQL e implementación de servicios REST.',
      documentUrl: 'https://sigetrap.ufps.edu.co/expedientes/evidencia-semana-1.pdf',
    },
    studentUser
  );

  if (
    result1.informe.estado === 'Radicado' &&
    result1.informe.horasEjecutadas === 20 &&
    result1.informe.fechaEntrega instanceof Date &&
    result1.bitacora.horasEjecutadas === 20 &&
    result1.totalHorasAcumuladas === 20 &&
    mockReportRepo.reports.length === 1 &&
    mockReportRepo.logs.length === 1
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1): Registro insertado en informes_avance con estado 'Radicado', fecha de entrega '${result1.fechaEntrega.toISOString()}' y bitácora creada con 20 horas.`
    );
  } else {
    throw new Error('❌ FALLÓ Test 1: Los datos del informe radicado no coinciden con lo esperado');
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Criterio 1 - Radicación exitosa con práctica en estado "En Curso" (Acumulación)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 2 (Criterio 1): Radicación exitosa con práctica en estado "En Curso"...');
  const result2 = await service.radicarInforme(
    {
      practicaId: practiceEnCurso.id,
      horasEjecutadas: 15,
      descripcionActividades: 'Desarrollo de componentes React y conexión con API de seguimiento.',
    },
    studentUser
  );

  if (
    result2.informe.estado === 'Radicado' &&
    result2.informe.horasEjecutadas === 15 &&
    result2.totalHorasAcumuladas === 55 // 40 previas + 15 nuevas
  ) {
    console.log(
      `  ✅ PASÓ (Criterio 1): Informe radicado correctamente en estado 'Radicado'. Total de horas acumuladas incrementó a 55h.`
    );
  } else {
    throw new Error('❌ FALLÓ Test 2: Inconsistencia en horas acumuladas o estado');
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Criterio 2 - Validación de horas ejecutadas inválidas (horas = 0) -> chk_horas_ejecutadas_positivas
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 3 (Criterio 2): Intento de radicación con horas igual a cero (0)...');
  try {
    await service.radicarInforme(
      {
        practicaId: practiceEnCurso.id,
        horasEjecutadas: 0, // Invalido
        descripcionActividades: 'Actividades sin horas reportadas',
      },
      studentUser
    );
    throw new Error('Se esperaba fallo por horas <= 0');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 400 &&
      err.constraint === 'chk_horas_ejecutadas_positivas' &&
      err.message.includes('mayores a cero')
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 2): Validación rechazada por restricción chk_horas_ejecutadas_positivas -> [HTTP 400] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 3: Se esperaba 400 Bad Request por chk_horas_ejecutadas_positivas pero ocurrió: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 4: Criterio 2 - Validación de horas ejecutadas inválidas (horas negativas: -5)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 4 (Criterio 2): Intento de radicación con horas negativas (-5)...');
  try {
    await service.radicarInforme(
      {
        practicaId: practiceEnCurso.id,
        horasEjecutadas: -5, // Invalido
        descripcionActividades: 'Horas negativas',
      },
      studentUser
    );
    throw new Error('Se esperaba fallo por horas negativas');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 400 &&
      err.constraint === 'chk_horas_ejecutadas_positivas'
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 2): Validación rechazada correctamente ante horas negativas -> [HTTP 400] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 4: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 5: Criterio 3 - Bloqueo de radicación para práctica no activa: "Finalizada"
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 5 (Criterio 3): Bloqueo de radicación sobre práctica en estado "Finalizada"...');
  try {
    await service.radicarInforme(
      {
        practicaId: practiceFinalizada.id,
        horasEjecutadas: 10,
        descripcionActividades: 'Intento de radicación extemporánea en práctica finalizada',
      },
      studentUser
    );
    throw new Error('Se esperaba bloqueo para práctica finalizada');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 403 &&
      err.code === 'PRACTICE_NOT_ACTIVE' &&
      err.message.includes('prácticas activas en curso')
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 3): Acción restringida exitosamente -> [HTTP 403] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 5: Se esperaba 403 Forbidden pero ocurrió: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 6: Criterio 3 - Bloqueo de radicación para práctica no activa: "Cancelada"
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 6 (Criterio 3): Bloqueo de radicación sobre práctica en estado "Cancelada"...');
  try {
    await service.radicarInforme(
      {
        practicaId: practiceCancelada.id,
        horasEjecutadas: 10,
        descripcionActividades: 'Intento de radicación en práctica cancelada',
      },
      studentUser
    );
    throw new Error('Se esperaba bloqueo para práctica cancelada');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 403 &&
      err.code === 'PRACTICE_NOT_ACTIVE'
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 3): Práctica cancelada bloqueada correctamente -> [HTTP 403] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 6: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Criterio 3 - Bloqueo de radicación para práctica no activa: "En Trámite"
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 7 (Criterio 3): Bloqueo de radicación sobre práctica en estado "En Trámite"...');
  try {
    await service.radicarInforme(
      {
        practicaId: practiceEnTramite.id,
        horasEjecutadas: 8,
        descripcionActividades: 'Intento de radicar informe antes de legalizar o formalizar la práctica',
      },
      studentUser
    );
    throw new Error('Se esperaba bloqueo para práctica en trámite');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 403 &&
      err.code === 'PRACTICE_NOT_ACTIVE'
    ) {
      console.log(
        `  ✅ PASÓ (Criterio 3): Práctica en trámite bloqueada para radicación -> [HTTP 403] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 7: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 8: Restricción SQL chk_estado_informe
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 8: Validación de restricción SQL chk_estado_informe con valor no permitido...');
  try {
    await service.radicarInforme(
      {
        practicaId: practiceEnCurso.id,
        horasEjecutadas: 10,
        descripcionActividades: 'Actividades varias',
        estado: 'Estado_Invalido_Arbitrario',
      },
      studentUser
    );
    throw new Error('Se esperaba fallo por chk_estado_informe');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 400 &&
      err.constraint === 'chk_estado_informe'
    ) {
      console.log(
        `  ✅ PASÓ: Restricción chk_estado_informe interceptada -> [HTTP 400] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 8: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 9: Restricción SQL fk_informe_practica (Práctica inexistente)
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 9: Validación de restricción SQL fk_informe_practica con ID inexistente...');
  try {
    await service.radicarInforme(
      {
        practicaId: 'practica-inexistente-999',
        horasEjecutadas: 10,
        descripcionActividades: 'Actividades sobre práctica inexistente',
      },
      studentUser
    );
    throw new Error('Se esperaba error 404 por práctica inexistente');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 404 &&
      err.code === 'PRACTICE_NOT_FOUND'
    ) {
      console.log(
        `  ✅ PASÓ: Falla de llave foránea fk_informe_practica detectada -> [HTTP 404] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 9: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 10: Validación de descripción de actividades obligatoria
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 10: Validación de descripción de actividades obligatoria...');
  try {
    await service.radicarInforme(
      {
        practicaId: practiceEnCurso.id,
        horasEjecutadas: 10,
        descripcionActividades: '   ', // En blanco
      },
      studentUser
    );
    throw new Error('Se esperaba error por descripción vacía');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 400 &&
      err.code === 'MISSING_ACTIVITIES_DESCRIPTION'
    ) {
      console.log(
        `  ✅ PASÓ: Descripción vacía rechazada -> [HTTP 400] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 10: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 11: Seguridad RBAC y aislamiento entre estudiantes
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 11 (Seguridad RBAC): Intento de radicación en práctica ajena...');
  try {
    await service.radicarInforme(
      {
        practicaId: practiceFormalizada.id, // Pertenece al studentUser
        horasEjecutadas: 10,
        descripcionActividades: 'Intento de radicar informe en práctica de otro estudiante',
      },
      otherStudentUser // Actor diferente
    );
    throw new Error('Se esperaba rechazo por permisos');
  } catch (err: any) {
    if (
      err instanceof PracticeFollowUpError &&
      err.statusCode === 403 &&
      err.code === 'FORBIDDEN_OPERATION'
    ) {
      console.log(
        `  ✅ PASÓ (RBAC): Aislamiento validado, acceso denegado a estudiante ajeno -> [HTTP 403] ${err.message}`
      );
    } else {
      throw new Error(`❌ FALLÓ Test 11: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // TEST 12: Integración HTTP Route Handler POST /api/v1/informes-avance
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 12 (HTTP Integration): Verificación de Route Handler POST /api/v1/informes-avance...');

  // 12.1 Rechazo sin autenticación -> 401 Unauthorized
  const reqUnauth = new NextRequest('http://localhost:3000/api/v1/informes-avance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ practicaId: practiceEnCurso.id, horasEjecutadas: 10 }),
  });
  const resUnauth = await informesRouteHandler(reqUnauth);
  if (resUnauth.status === 401) {
    console.log('  ✅ PASÓ (HTTP - 401): Endpoint rechaza solicitudes no autenticadas');
  } else {
    throw new Error(`Se esperaba 401 pero se obtuvo ${resUnauth.status}`);
  }

  // 12.2 Validación de horas <= 0 (Criterio 2) -> 400 Bad Request
  const reqInvalidHours = new NextRequest('http://localhost:3000/api/v1/informes-avance', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      practicaId: practiceEnCurso.id,
      horasEjecutadas: 0,
      descripcionActividades: 'Actividades de prueba',
    }),
  });
  const resInvalidHours = await informesRouteHandler(reqInvalidHours);
  const jsonInvalidHours = await resInvalidHours.json();
  if (
    resInvalidHours.status === 400 &&
    jsonInvalidHours.error?.code === 'INVALID_HOURS' &&
    jsonInvalidHours.error?.details?.constraint === 'chk_horas_ejecutadas_positivas'
  ) {
    console.log('  ✅ PASÓ (HTTP - Criterio 2): Endpoint retorna 400 Bad Request ante horas <= 0 por chk_horas_ejecutadas_positivas');
  } else {
    throw new Error(`Se esperaba 400 pero se obtuvo ${resInvalidHours.status}`);
  }

  // 12.3 Bloqueo para práctica no activa (Criterio 3) -> 403 Forbidden
  const reqInactive = new NextRequest('http://localhost:3000/api/v1/informes-avance', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      practicaId: practiceFinalizada.id,
      horasEjecutadas: 12,
      descripcionActividades: 'Actividades sobre práctica finalizada',
    }),
  });
  const resInactive = await informesRouteHandler(reqInactive);
  const jsonInactive = await resInactive.json();
  if (
    resInactive.status === 403 &&
    jsonInactive.error?.code === 'PRACTICE_NOT_ACTIVE'
  ) {
    console.log('  ✅ PASÓ (HTTP - Criterio 3): Endpoint retorna 403 Forbidden ante práctica no activa');
  } else {
    throw new Error(`Se esperaba 403 pero se obtuvo ${resInactive.status}`);
  }

  // 12.4 Radicación exitosa (Criterio 1) -> 201 Created
  const reqSuccess = new NextRequest('http://localhost:3000/api/v1/informes-avance', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      practicaId: practiceEnCurso.id,
      horasEjecutadas: 18,
      descripcionActividades: 'Implementación de endpoints y ejecución de pruebas de integración con Jest/Tsx.',
      documentUrl: 'https://sigetrap.ufps.edu.co/soportes/bitacora-semana-3.pdf',
    }),
  });
  const resSuccess = await informesRouteHandler(reqSuccess);
  const jsonSuccess = await resSuccess.json();
  if (
    resSuccess.status === 201 &&
    jsonSuccess.success === true &&
    jsonSuccess.data?.informe?.estado === 'Radicado' &&
    jsonSuccess.data?.bitacora?.horasEjecutadas === 18
  ) {
    console.log('  ✅ PASÓ (HTTP - Criterio 1): Endpoint retorna 201 Created con registro en informes_avance en estado Radicado y fecha de entrega actualizada');
  } else {
    throw new Error(`Se esperaba 201 pero se obtuvo ${resSuccess.status}`);
  }

  // ----------------------------------------------------------------------------
  // TEST 13: Integración HTTP Route Handler POST /api/v1/practicas/[id]/informes
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 13 (HTTP Integration): Verificación de Route Handler POST /api/v1/practicas/[id]/informes...');
  const reqPracticaDirect = new NextRequest(`http://localhost:3000/api/v1/practicas/${practiceEnCurso.id}/informes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      horasEjecutadas: 10,
      descripcionActividades: 'Módulo de autenticación y validación de sesiones JWT.',
    }),
  });
  const resPracticaDirect = await practicaInformesRouteHandler(reqPracticaDirect, {
    params: Promise.resolve({ id: practiceEnCurso.id }),
  });
  const jsonPracticaDirect = await resPracticaDirect.json();
  if (
    resPracticaDirect.status === 201 &&
    jsonPracticaDirect.success === true &&
    jsonPracticaDirect.data?.informe?.estado === 'Radicado'
  ) {
    console.log('  ✅ PASÓ (HTTP Directo): Endpoint anidado /practicas/[id]/informes retorna 201 Created.');
  } else {
    throw new Error(`Se esperaba 201 pero se obtuvo ${resPracticaDirect.status}`);
  }

  // ----------------------------------------------------------------------------
  // TEST 14: Integración HTTP Route Handler POST /api/v1/bitacoras
  // ----------------------------------------------------------------------------
  console.log('\n📌 Test 14 (HTTP Integration): Verificación de Route Handler POST /api/v1/bitacoras...');
  const reqBitacora = new NextRequest('http://localhost:3000/api/v1/bitacoras', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      practicaId: practiceEnCurso.id,
      horasEjecutadas: 8,
      descripcionActividades: 'Refactorización de consultas y optimización de índices de BD.',
    }),
  });
  const resBitacora = await bitacorasRouteHandler(reqBitacora);
  const jsonBitacora = await resBitacora.json();
  if (resBitacora.status === 201 && jsonBitacora.success === true) {
    console.log('  ✅ PASÓ (HTTP Bitácoras): Endpoint alias /api/v1/bitacoras retorna 201 Created.');
  } else {
    throw new Error(`Se esperaba 201 pero se obtuvo ${resBitacora.status}`);
  }

  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE CU14 (ENTREGA DE INFORMES DE AVANCE) PASARON');
  console.log('🎉 ====================================================================\n');
}

runCU14Tests().catch((err) => {
  console.error('\n❌ ERROR FATAL EN PRUEBAS CU14:', err);
  process.exit(1);
});
