// ==============================================================================
// SIGETRAP - Servicio de Formalización de la Práctica Empresarial (HU13 / CU13)
// Módulo / Épica: Legalización y Formalización de Prácticas
// Caso de Uso Asociado: CU13 - Formalización de la Práctica Empresarial
// Entidades BD: practicas_formativas, estudiantes, docentes_tutores, tutores_empresariales, planes_trabajo
// Restricciones SQL:
//   - chk_estado_practica (estado IN ('En Trámite', 'Formalizada', 'En Curso', 'Finalizada', 'Cancelada'))
//   - fk_practica_docente
//   - fk_practica_tutor_ext
//   - fk_practica_plan_trabajo
//   - uq_estudiante_practica_periodo
// ==============================================================================

import {
  PracticeRepository,
  practiceRepository,
} from '@/server/repositories/practice.repository';
import {
  UserRepository,
  userRepository,
} from '@/server/repositories/user.repository';
import {
  CompanyRepository,
  companyRepository,
} from '@/server/repositories/company.repository';
import {
  AuthenticatedUser,
  FormalizePracticeDTO,
  FormalizePracticeResponseDTO,
  PracticaFormativaEstadoDomain,
  DOMAIN_PRACTICE_FORMALIZATION_STATUSES,
  PlanTrabajoEstadoDomain,
  PracticeStatus,
  WorkPlanStatus,
} from '@/types';
import { Prisma } from '@prisma/client';

export class PracticeFormalizationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;
  public readonly constraint?: string;

  constructor(
    message: string,
    code: string = 'PRACTICE_FORMALIZATION_ERROR',
    statusCode: number = 400,
    field?: string,
    constraint?: string
  ) {
    super(message);
    this.name = 'PracticeFormalizationError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    this.constraint = constraint;
  }
}

// Mapeo de normalización de estados de práctica hacia chk_estado_practica
const PRACTICE_STATUS_DOMAIN_MAP: Record<string, PracticaFormativaEstadoDomain> = {
  'en trámite': 'En Trámite',
  'en tramite': 'En Trámite',
  'en_tramite': 'En Trámite',
  'formalizada': 'Formalizada',
  'asignado_formalmente': 'Formalizada',
  'en curso': 'En Curso',
  'en_curso': 'En Curso',
  'practica_en_ejecucion': 'En Curso',
  'finalizada': 'Finalizada',
  'cerrada': 'Finalizada',
  'cancelada': 'Cancelada',
};

// Mapeo inverso de dominio HU13 a enum interno Prisma PracticeStatus
const DOMAIN_TO_INTERNAL_PRACTICE_STATUS: Record<PracticaFormativaEstadoDomain, PracticeStatus> = {
  'En Trámite': 'ACEPTADO_ARL_PENDIENTE',
  'Formalizada': 'ASIGNADO_FORMALMENTE',
  'En Curso': 'PRACTICA_EN_EJECUCION',
  'Finalizada': 'FINALIZADA',
  'Cancelada': 'REUBICACION_PENDIENTE',
};

/**
 * Valida que el estado de la práctica cumpla con la restricción SQL chk_estado_practica:
 * estado IN ('En Trámite', 'Formalizada', 'En Curso', 'Finalizada', 'Cancelada')
 */
export function validateAndNormalizePracticeDomainStatus(
  rawStatus?: string | null
): PracticaFormativaEstadoDomain {
  if (!rawStatus || typeof rawStatus !== 'string' || rawStatus.trim() === '') {
    return 'Formalizada';
  }

  const trimmed = rawStatus.trim();
  const mapped = PRACTICE_STATUS_DOMAIN_MAP[trimmed.toLowerCase()];

  if (!mapped) {
    throw new PracticeFormalizationError(
      `Estado de práctica no válido ('${trimmed}'). La restricción chk_estado_practica solo permite: ${DOMAIN_PRACTICE_FORMALIZATION_STATUSES.join(', ')}.`,
      'INVALID_PRACTICE_STATUS',
      400,
      'estado',
      'chk_estado_practica'
    );
  }

  return mapped;
}

/**
 * Determina si un estado o registro de plan de trabajo equivale a "Aprobado"
 */
export function evaluateWorkPlanApprovalStatus(planInput: {
  status?: string | null;
  estado?: string | null;
  tutorApproved?: boolean | null;
  teacherApproved?: boolean | null;
}): { isApproved: boolean; domainStatus: PlanTrabajoEstadoDomain; internalStatus: WorkPlanStatus } {
  const rawStatus = (planInput.estado ?? planInput.status ?? '').trim();
  const lower = rawStatus.toLowerCase();

  // Si explícitamente indica pendiente, borrador, en revisión o rechazado -> NO aprobado
  if (
    lower === 'pendiente' ||
    lower === 'borrador' ||
    lower === 'en revisión' ||
    lower === 'en revision' ||
    lower === 'en_revision' ||
    lower === 'aprobado_tutor' ||
    lower === 'aprobado_docente'
  ) {
    return {
      isApproved: false,
      domainStatus: lower.includes('revis') ? 'En Revisión' : 'Pendiente',
      internalStatus: 'EN_REVISION',
    };
  }

  if (lower === 'rechazado') {
    return {
      isApproved: false,
      domainStatus: 'Rechazado',
      internalStatus: 'RECHAZADO',
    };
  }

  // Si explícitamente es "Aprobado" o "APROBADO_DUAL"
  if (lower === 'aprobado' || lower === 'aprobado_dual') {
    if (planInput.tutorApproved === false || planInput.teacherApproved === false) {
      return {
        isApproved: false,
        domainStatus: 'Pendiente',
        internalStatus: 'EN_REVISION',
      };
    }
    return {
      isApproved: true,
      domainStatus: 'Aprobado',
      internalStatus: 'APROBADO_DUAL',
    };
  }

  // Si no envió string de estado pero ambos tutores aprobaron
  if (planInput.tutorApproved === true && planInput.teacherApproved === true) {
    return {
      isApproved: true,
      domainStatus: 'Aprobado',
      internalStatus: 'APROBADO_DUAL',
    };
  }

  return {
    isApproved: false,
    domainStatus: 'Pendiente',
    internalStatus: 'BORRADOR',
  };
}

export class PracticeFormalizationService {
  constructor(
    private practiceRepo: PracticeRepository = practiceRepository,
    private userRepo: UserRepository = userRepository,
    private companyRepo: CompanyRepository = companyRepository
  ) {}

  /**
   * Emite y legaliza la formalización de la práctica empresarial (HU13 / CU13)
   * Criterios de Aceptación:
   *   - Criterio 1: Con tutor docente asignado, tutor externo vinculado y plan de trabajo en estado "Aprobado",
   *                 actualiza/crea el registro en practicas_formativas con estado "Formalizada",
   *                 genera la fecha oficial de inicio y responde 201 Created (o 200 OK).
   *   - Criterio 2: Si falta alguno de los dos tutores o el plan de trabajo no está "Aprobado",
   *                 falla la validación de negocio/integridad y devuelve 400 Bad Request indicando
   *                 que los tutores y la aprobación del plan son obligatorios para formalizar.
   *   - Criterio 3: Si el estudiante ya posee una práctica en estado "Formalizada" o "En Curso"
   *                 en el periodo lectivo vigente, rechaza la operación por restricción de unicidad
   *                 (uq_estudiante_practica_periodo) y devuelve 409 Conflict.
   */
  async formalizePractice(
    dto: FormalizePracticeDTO,
    actor?: AuthenticatedUser | null,
    options?: { requireExistingPractice?: boolean }
  ): Promise<FormalizePracticeResponseDTO> {
    // 1. Validar sesión activa y rol de Coordinador (DIRECTOR_PROGRAMA o ADMIN)
    if (!actor || !actor.id) {
      throw new PracticeFormalizationError(
        'Debe iniciar sesión como coordinador para emitir la formalización de la práctica empresarial',
        'UNAUTHORIZED',
        401
      );
    }

    if (actor.role !== 'DIRECTOR_PROGRAMA' && actor.role !== 'ADMIN') {
      throw new PracticeFormalizationError(
        'Únicamente el Coordinador de Prácticas (Director de Programa) o Administrador puede legalizar la formalización de la práctica empresarial',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    // 2. Validar restricción chk_estado_practica si se especificó un estado en el payload
    const rawTargetStatus = dto.estado ?? dto.status;
    const targetDomainStatus = validateAndNormalizePracticeDomainStatus(rawTargetStatus);
    const targetInternalStatus = DOMAIN_TO_INTERNAL_PRACTICE_STATUS[targetDomainStatus];

    // 3. Resolver práctica previa si se suministró practiceId / practicaId
    const targetPracticeId = (dto.practiceId ?? dto.practicaId ?? dto.id ?? '').trim() || undefined;
    let existingPractice: any = null;

    if (targetPracticeId) {
      existingPractice = await this.practiceRepo.findById(targetPracticeId);
      if (!existingPractice && options?.requireExistingPractice) {
        throw new PracticeFormalizationError(
          `El registro de práctica '${targetPracticeId}' no existe en el sistema`,
          'PRACTICE_NOT_FOUND',
          404,
          'practiceId'
        );
      }
    }

    // 4. Resolver estudiante (estudiantes)
    const studentId = (
      dto.studentId ??
      dto.estudianteId ??
      existingPractice?.studentId ??
      ''
    ).trim();

    if (!studentId) {
      throw new PracticeFormalizationError(
        'Debe indicar el estudiante para emitir el registro de formalización de práctica',
        'MISSING_STUDENT_ID',
        400,
        'studentId'
      );
    }

    const student = await this.userRepo.findById(studentId);
    if (!student || (student as any).deletedAt || student.role !== 'ESTUDIANTE') {
      throw new PracticeFormalizationError(
        `El estudiante especificado ('${studentId}') no existe o no está registrado en la entidad estudiantes`,
        'STUDENT_NOT_FOUND',
        400,
        'studentId'
      );
    }

    // 5. Resolver periodo lectivo vigente y validar Criterio 3 (uq_estudiante_practica_periodo)
    // Nota: Validamos también si faltan tutores o plan (Criterio 2) antes o según corresponda.
    // Revisemos primero Criterio 2 (Requisitos obligatorios: Tutor Docente, Tutor Externo y Plan de Trabajo Aprobado)
    // y Criterio 3 (Unicidad por estudiante y periodo).
    // Si el estudiante ya tiene una práctica activa ("Formalizada" o "En Curso") en el periodo lectivo
    // y se intenta legalizar un segundo registro, Criterio 3 exige responder 409 Conflict (uq_estudiante_practica_periodo).
    const academicPeriod = (
      dto.academicPeriod ??
      dto.periodoLectivo ??
      dto.periodo ??
      existingPractice?.academicPeriod ??
      existingPractice?.vacancy?.academicPeriod ??
      '2026-1'
    ).trim();

    // Determinar si hay ambos tutores y plan en el request o práctica existente
    const explicitNullTeacher =
      dto.teacherId === null ||
      dto.docenteTutorId === null ||
      dto.tutorDocenteId === null ||
      dto.docenteId === null ||
      dto.teacherId === '' ||
      dto.docenteTutorId === '';

    const explicitNullTutor =
      dto.tutorId === null ||
      dto.tutorExternoId === null ||
      dto.tutorEmpresarialId === null ||
      dto.tutorId === '' ||
      dto.tutorExternoId === '';

    const teacherId = explicitNullTeacher
      ? ''
      : (
          dto.teacherId ??
          dto.docenteTutorId ??
          dto.tutorDocenteId ??
          dto.docenteId ??
          existingPractice?.teacherId ??
          ''
        ).trim();

    const tutorId = explicitNullTutor
      ? ''
      : (
          dto.tutorId ??
          dto.tutorExternoId ??
          dto.tutorEmpresarialId ??
          existingPractice?.tutorId ??
          ''
        ).trim();

    // Resolver Plan de Trabajo (planes_trabajo)
    const workPlanInput = dto.workPlan !== undefined ? dto.workPlan : dto.planTrabajo;
    const explicitNullWorkPlan =
      workPlanInput === null || dto.workPlanId === null || dto.planTrabajoId === null;

    const requestedWorkPlanId = (dto.workPlanId ?? dto.planTrabajoId ?? workPlanInput?.id ?? '').trim();
    let existingWorkPlan = existingPractice?.workPlan || null;

    if (!existingWorkPlan && requestedWorkPlanId) {
      existingWorkPlan = await this.practiceRepo.findWorkPlanById(requestedWorkPlanId);
    }
    if (!existingWorkPlan && existingPractice?.id) {
      existingWorkPlan = await this.practiceRepo.findWorkPlanByPracticeId(existingPractice.id);
    }

    // ------------------------------------------------------------------------
    // CRITERIO 2: Validación de Tutor Docente, Tutor Externo y Plan de Trabajo Aprobado
    // ------------------------------------------------------------------------

    // 2.1 Validar presencia de ambos tutores
    if (!teacherId && !tutorId) {
      throw new PracticeFormalizationError(
        'Los tutores (tutor docente y tutor externo) y la aprobación del plan de trabajo son obligatorios para formalizar la práctica. Faltan ambos tutores (fk_practica_docente, fk_practica_tutor_ext).',
        'MISSING_REQUIRED_TUTORS',
        400,
        'teacherId,tutorId',
        'fk_practica_docente'
      );
    }

    if (!teacherId) {
      throw new PracticeFormalizationError(
        'Los tutores y la aprobación del plan son obligatorios para formalizar la práctica. Debe asignar un tutor docente válido (restricción fk_practica_docente).',
        'MISSING_TEACHER_TUTOR',
        400,
        'teacherId',
        'fk_practica_docente'
      );
    }

    if (!tutorId) {
      throw new PracticeFormalizationError(
        'Los tutores y la aprobación del plan son obligatorios para formalizar la práctica. Debe vincular un tutor externo empresarial válido (restricción fk_practica_tutor_ext).',
        'MISSING_EXTERNAL_TUTOR',
        400,
        'tutorId',
        'fk_practica_tutor_ext'
      );
    }

    // 2.2 Validar integridad referencial de Tutor Docente en docentes_tutores (fk_practica_docente)
    const teacherUser = await this.userRepo.findById(teacherId);
    if (
      !teacherUser ||
      (teacherUser as any).deletedAt ||
      teacherUser.role !== 'DOCENTE_PRACTICA' ||
      teacherUser.status !== 'ACTIVO' ||
      !teacherUser.isActive
    ) {
      throw new PracticeFormalizationError(
        `Los tutores y la aprobación del plan son obligatorios para formalizar. El tutor docente especificado ('${teacherId}') no existe o no se encuentra activo en docentes_tutores (violación de fk_practica_docente).`,
        'INVALID_TEACHER_TUTOR',
        400,
        'teacherId',
        'fk_practica_docente'
      );
    }

    // 2.3 Validar integridad referencial de Tutor Externo en tutores_empresariales (fk_practica_tutor_ext)
    const externalTutorUser = await this.userRepo.findById(tutorId);
    if (
      !externalTutorUser ||
      (externalTutorUser as any).deletedAt ||
      externalTutorUser.role !== 'TUTOR_EMPRESARIAL' ||
      externalTutorUser.status !== 'ACTIVO' ||
      !externalTutorUser.isActive
    ) {
      throw new PracticeFormalizationError(
        `Los tutores y la aprobación del plan son obligatorios para formalizar. El tutor externo especificado ('${tutorId}') no existe o no se encuentra activo en tutores_empresariales (violación de fk_practica_tutor_ext).`,
        'INVALID_EXTERNAL_TUTOR',
        400,
        'tutorId',
        'fk_practica_tutor_ext'
      );
    }

    // 2.4 Validar existencia y estado "Aprobado" del Plan de Trabajo (fk_practica_plan_trabajo)
    const hasWorkPlanSource =
      !explicitNullWorkPlan &&
      (Boolean(workPlanInput) ||
        Boolean(existingWorkPlan) ||
        Boolean(dto.workPlanStatus) ||
        Boolean(dto.estadoPlanTrabajo));

    if (!hasWorkPlanSource) {
      throw new PracticeFormalizationError(
        'Los tutores y la aprobación del plan son obligatorios para formalizar la práctica. El estudiante no cuenta con un plan de trabajo asociado (restricción fk_practica_plan_trabajo).',
        'MISSING_WORK_PLAN',
        400,
        'workPlanId',
        'fk_practica_plan_trabajo'
      );
    }

    const effectivePlanStatusRaw =
      dto.estadoPlanTrabajo ??
      dto.workPlanStatus ??
      workPlanInput?.estado ??
      workPlanInput?.status ??
      (existingWorkPlan as any)?.estado ??
      existingWorkPlan?.status ??
      null;

    const effectiveTutorApproved =
      workPlanInput?.aprobadoTutorExterno ??
      workPlanInput?.tutorApproved ??
      existingWorkPlan?.tutorApproved ??
      undefined;

    const effectiveTeacherApproved =
      workPlanInput?.aprobadoTutorDocente ??
      workPlanInput?.teacherApproved ??
      existingWorkPlan?.teacherApproved ??
      undefined;

    const workPlanEvaluation = evaluateWorkPlanApprovalStatus({
      status: effectivePlanStatusRaw,
      tutorApproved: effectiveTutorApproved,
      teacherApproved: effectiveTeacherApproved,
    });

    if (!workPlanEvaluation.isApproved) {
      throw new PracticeFormalizationError(
        `Los tutores y la aprobación del plan son obligatorios para formalizar la práctica. El plan de trabajo se encuentra pendiente de aprobación o no ha sido aprobado (estado actual: '${
          effectivePlanStatusRaw || workPlanEvaluation.domainStatus
        }'). Violación de restricción fk_practica_plan_trabajo.`,
        'WORK_PLAN_NOT_APPROVED',
        400,
        'workPlanStatus',
        'fk_practica_plan_trabajo'
      );
    }

    // ------------------------------------------------------------------------
    // CRITERIO 3: Unicidad de práctica activa por estudiante y periodo (uq_estudiante_practica_periodo)
    // ------------------------------------------------------------------------
    // Si se intenta crear un segundo registro (sin practiceId o con un practiceId distinto al ya formalizado/en curso),
    // o si el estudiante ya posee una práctica en estado "Formalizada" o "En Curso" en el mismo periodo lectivo vigente:
    const activePracticeInPeriod =
      await this.practiceRepo.findActiveFormalizedOrInCourseByStudentAndPeriod({
        studentId,
        academicPeriod,
        excludePracticeId: existingPractice?.id,
      });

    // También si no se envió practiceId (intento de crear un segundo registro de práctica para el mismo estudiante)
    // o si la práctica encontrada es distinta:
    if (activePracticeInPeriod) {
      throw new PracticeFormalizationError(
        `El estudiante ya posee una práctica activa en estado 'Formalizada' o 'En Curso' en el periodo lectivo vigente ('${academicPeriod}'). Operación rechazada por restricción de unicidad uq_estudiante_practica_periodo.`,
        'DUPLICATE_ACTIVE_PRACTICE_IN_PERIOD',
        409,
        'studentId',
        'uq_estudiante_practica_periodo'
      );
    }

    // Si existingPractice ya estaba Formalizada o En Curso y se intenta emitir un segundo registro sin ID específico
    if (
      !targetPracticeId &&
      existingPractice &&
      (existingPractice.currentStatus === 'ASIGNADO_FORMALMENTE' ||
        existingPractice.currentStatus === 'PRACTICA_EN_EJECUCION' ||
        existingPractice.estado === 'Formalizada' ||
        existingPractice.estado === 'En Curso')
    ) {
      throw new PracticeFormalizationError(
        `El estudiante ya posee una práctica activa en estado 'Formalizada' o 'En Curso' en el periodo lectivo vigente ('${academicPeriod}'). Operación rechazada por restricción de unicidad uq_estudiante_practica_periodo.`,
        'DUPLICATE_ACTIVE_PRACTICE_IN_PERIOD',
        409,
        'studentId',
        'uq_estudiante_practica_periodo'
      );
    }

    // 6. Resolver empresa receptora
    const companyId = (
      dto.companyId ??
      dto.empresaId ??
      existingPractice?.companyId ??
      externalTutorUser.companyId ??
      ''
    ).trim();

    if (!companyId) {
      throw new PracticeFormalizationError(
        'Debe especificar la empresa receptora vinculada al tutor externo para formalizar la práctica',
        'MISSING_COMPANY_ID',
        400,
        'companyId'
      );
    }

    // Validar que el tutor externo pertenezca a la empresa si tiene companyId asignado
    if (externalTutorUser.companyId && externalTutorUser.companyId !== companyId) {
      throw new PracticeFormalizationError(
        'El tutor externo seleccionado no pertenece a la empresa receptora de la práctica (fk_practica_tutor_ext).',
        'EXTERNAL_TUTOR_COMPANY_MISMATCH',
        400,
        'tutorId',
        'fk_practica_tutor_ext'
      );
    }

    // 7. Generar la fecha oficial de inicio (Criterio 1)
    const rawStartDate = dto.startDate ?? dto.fechaInicio;
    const officialStartDate = rawStartDate ? new Date(rawStartDate) : new Date();
    if (isNaN(officialStartDate.getTime())) {
      throw new PracticeFormalizationError(
        'La fecha de inicio suministrada no tiene un formato válido',
        'INVALID_START_DATE',
        400,
        'startDate'
      );
    }

    const rawEndDate = dto.endDate ?? dto.fechaFin;
    const officialEndDate = rawEndDate ? new Date(rawEndDate) : existingPractice?.endDate || null;

    // 8. Preparar datos del Plan de Trabajo aprobado
    const workPlanObjectives =
      workPlanInput?.objetivos ??
      workPlanInput?.objectives ??
      existingWorkPlan?.objectives ??
      'Desarrollar las actividades del plan de formación práctica empresarial aprobado por el tutor docente y tutor externo.';

    const workPlanMethodology =
      workPlanInput?.metodologia ??
      workPlanInput?.methodology ??
      existingWorkPlan?.methodology ??
      'Seguimiento continuo conjunto entre supervisión académica y empresarial con entregas periódicas.';

    const workPlanSchedule = (workPlanInput?.cronograma ??
      workPlanInput?.schedule ??
      existingWorkPlan?.schedule ?? [
        { fase: 1, actividad: 'Inducción y empalme técnico', semanas: '1-2' },
        { fase: 2, actividad: 'Ejecución del plan de trabajo aprobado', semanas: '3-14' },
        { fase: 3, actividad: 'Evaluación final y sustentación', semanas: '15-16' },
      ]) as Prisma.InputJsonValue;

    try {
      // 9. Criterio 1: Crear o actualizar el registro en practicas_formativas con estado "Formalizada" y fecha oficial de inicio
      const saved = await this.practiceRepo.saveFormalizedPractice({
        practiceId: existingPractice?.id,
        studentId,
        companyId,
        vacancyId: dto.vacancyId ?? dto.plazaId ?? existingPractice?.vacancyId ?? null,
        teacherId: teacherUser.id,
        tutorId: externalTutorUser.id,
        directorId: actor.id,
        academicPeriod,
        targetInternalStatus,
        targetDomainStatus,
        startDate: officialStartDate,
        endDate: officialEndDate,
        totalHoursRequired:
          dto.totalHoursRequired ??
          dto.horasRequeridas ??
          existingPractice?.totalHoursRequired ??
          320,
        arlSupportUrl: dto.arlSupportUrl ?? existingPractice?.arlSupportUrl ?? null,
        presentationLetterUrl:
          dto.presentationLetterUrl ?? existingPractice?.presentationLetterUrl ?? null,
        notes: dto.notes ?? dto.observaciones,
        workPlanData: {
          id: existingWorkPlan?.id || requestedWorkPlanId || undefined,
          objectives: workPlanObjectives,
          methodology: workPlanMethodology,
          schedule: workPlanSchedule,
          documentUrl:
            workPlanInput?.documentoUrl ??
            workPlanInput?.documentUrl ??
            existingWorkPlan?.documentUrl ??
            null,
          status: 'APROBADO_DUAL',
          tutorApproved: true,
          teacherApproved: true,
          feedback: workPlanInput?.feedback ?? existingWorkPlan?.feedback ?? 'Plan de trabajo aprobado',
        },
      });

      const p = saved.practice;
      const wp = saved.workPlan || p.workPlan;
      const finalizedStartDate = p.startDate ? new Date(p.startDate) : officialStartDate;
      const formalizedTimestamp = new Date();

      return {
        id: p.id,
        practiceId: p.id,
        estudianteId: studentId,
        studentId,
        empresaId: companyId,
        companyId,
        docenteTutorId: teacherUser.id,
        teacherId: teacherUser.id,
        tutorExternoId: externalTutorUser.id,
        tutorId: externalTutorUser.id,
        planTrabajoId: wp?.id || requestedWorkPlanId || `wp_${p.id}`,
        workPlanId: wp?.id || requestedWorkPlanId || `wp_${p.id}`,
        coordinadorId: actor.id,
        directorId: actor.id,
        periodoLectivo: academicPeriod,
        academicPeriod,
        estado: targetDomainStatus,
        status: targetDomainStatus,
        currentStatus: targetInternalStatus,
        fechaInicio: finalizedStartDate,
        startDate: finalizedStartDate,
        fechaFin: p.endDate ? new Date(p.endDate) : null,
        endDate: p.endDate ? new Date(p.endDate) : null,
        fechaFormalizacion: formalizedTimestamp,
        formalizedAt: formalizedTimestamp,
        horasRequeridas: p.totalHoursRequired || 320,
        totalHoursRequired: p.totalHoursRequired || 320,
        student: {
          id: student.id,
          name: student.name,
          nombre: student.name,
          email: student.email,
          studentCode: student.studentCode,
          documentNumber: student.documentNumber,
          program: student.program,
        },
        teacher: {
          id: teacherUser.id,
          name: teacherUser.name,
          nombre: teacherUser.name,
          email: teacherUser.email,
          correo: teacherUser.email,
        },
        tutor: {
          id: externalTutorUser.id,
          name: externalTutorUser.name,
          nombre: externalTutorUser.name,
          email: externalTutorUser.email,
          correo: externalTutorUser.email,
          cargo:
            externalTutorUser.program && externalTutorUser.program !== 'Ingeniería de Sistemas'
              ? externalTutorUser.program
              : 'Tutor Empresarial',
        },
        workPlan: {
          id: wp?.id || requestedWorkPlanId || `wp_${p.id}`,
          estado: 'Aprobado',
          status: 'APROBADO_DUAL',
          objectives: wp?.objectives || workPlanObjectives,
          methodology: wp?.methodology || workPlanMethodology,
          tutorApproved: true,
          teacherApproved: true,
        },
        company: p.company
          ? {
              id: p.company.id,
              businessName: p.company.businessName,
              razonSocial: p.company.businessName,
              nit: p.company.nit,
            }
          : undefined,
        isNew: saved.isNew,
        message: `Práctica empresarial formalizada exitosamente con estado '${targetDomainStatus}' y fecha oficial de inicio ${finalizedStartDate.toISOString()}.`,
        createdAt: p.createdAt || formalizedTimestamp,
        updatedAt: p.updatedAt || formalizedTimestamp,
      };
    } catch (error: unknown) {
      if (error instanceof PracticeFormalizationError) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new PracticeFormalizationError(
            `El estudiante ya posee una práctica activa en estado 'Formalizada' o 'En Curso' en el periodo lectivo vigente ('${academicPeriod}'). Rechazado por restricción uq_estudiante_practica_periodo.`,
            'DUPLICATE_ACTIVE_PRACTICE_IN_PERIOD',
            409,
            'studentId',
            'uq_estudiante_practica_periodo'
          );
        }
        if (error.code === 'P2003') {
          const fieldName = String(error.meta?.field_name || '');
          if (fieldName.includes('teacher')) {
            throw new PracticeFormalizationError(
              'Los tutores y la aprobación del plan son obligatorios para formalizar. Violación de fk_practica_docente.',
              'INVALID_TEACHER_TUTOR',
              400,
              'teacherId',
              'fk_practica_docente'
            );
          }
          if (fieldName.includes('tutor')) {
            throw new PracticeFormalizationError(
              'Los tutores y la aprobación del plan son obligatorios para formalizar. Violación de fk_practica_tutor_ext.',
              'INVALID_EXTERNAL_TUTOR',
              400,
              'tutorId',
              'fk_practica_tutor_ext'
            );
          }
        }
      }

      const err = error as { code?: string; constraint?: string; message?: string };

      if (
        err.constraint === 'uq_estudiante_practica_periodo' ||
        err.code === '23505' ||
        err.message?.includes('uq_estudiante_practica_periodo')
      ) {
        throw new PracticeFormalizationError(
          `El estudiante ya posee una práctica en estado 'Formalizada' o 'En Curso' en el periodo lectivo vigente ('${academicPeriod}'). Operación rechazada por restricción de unicidad uq_estudiante_practica_periodo.`,
          'DUPLICATE_ACTIVE_PRACTICE_IN_PERIOD',
          409,
          'studentId',
          'uq_estudiante_practica_periodo'
        );
      }

      if (
        err.constraint === 'chk_estado_practica' ||
        err.code === '23514' ||
        err.message?.includes('chk_estado_practica')
      ) {
        throw new PracticeFormalizationError(
          'El estado suministrado incumple la restricción chk_estado_practica.',
          'INVALID_PRACTICE_STATUS',
          400,
          'estado',
          'chk_estado_practica'
        );
      }

      if (
        err.constraint === 'fk_practica_docente' ||
        err.constraint === 'fk_practica_tutor_ext' ||
        err.constraint === 'fk_practica_plan_trabajo' ||
        err.code === '23503'
      ) {
        throw new PracticeFormalizationError(
          `Los tutores y la aprobación del plan son obligatorios para formalizar (${err.constraint || 'fk_integrity_violation'}).`,
          'FOREIGN_KEY_CONSTRAINT_VIOLATION',
          400,
          undefined,
          err.constraint || 'fk_practica_plan_trabajo'
        );
      }

      throw error;
    }
  }

  /**
   * Obtiene el resumen de requisitos de formalización para una práctica específica (UI / Coordinador)
   */
  async getFormalizationDetails(practiceId: string, actor?: AuthenticatedUser | null) {
    if (!actor || !actor.id) {
      throw new PracticeFormalizationError(
        'Debe iniciar sesión para consultar el expediente de formalización',
        'UNAUTHORIZED',
        401
      );
    }

    const practice = await this.practiceRepo.findById(practiceId);
    if (!practice) {
      throw new PracticeFormalizationError(
        'La práctica especificada no fue encontrada',
        'PRACTICE_NOT_FOUND',
        404
      );
    }

    const teachersResult = await this.userRepo.findMany({
      role: 'DOCENTE_PRACTICA',
      status: 'ACTIVO',
      take: 100,
    });

    const companyTutorsResult = await this.userRepo.findMany({
      role: 'TUTOR_EMPRESARIAL',
      status: 'ACTIVO',
      take: 100,
    });

    const companyTutors = companyTutorsResult.users.filter(
      (t) => !practice.companyId || t.companyId === practice.companyId
    );

    const wpEval = evaluateWorkPlanApprovalStatus({
      status: practice.workPlan?.status,
      tutorApproved: practice.workPlan?.tutorApproved,
      teacherApproved: practice.workPlan?.teacherApproved,
    });

    let domainStatus: PracticaFormativaEstadoDomain = 'En Trámite';
    if (practice.currentStatus === 'ASIGNADO_FORMALMENTE') domainStatus = 'Formalizada';
    else if (
      practice.currentStatus === 'PRACTICA_EN_EJECUCION' ||
      practice.currentStatus === 'EVALUACION_PENDIENTE'
    ) {
      domainStatus = 'En Curso';
    } else if (practice.currentStatus === 'FINALIZADA' || practice.currentStatus === 'CERRADA') {
      domainStatus = 'Finalizada';
    } else if (practice.currentStatus === 'REUBICACION_PENDIENTE' || !practice.isActive) {
      domainStatus = 'Cancelada';
    }

    return {
      practiceId: practice.id,
      student: practice.student,
      company: practice.company,
      currentStatus: practice.currentStatus,
      estado: domainStatus,
      academicPeriod: (practice as any).academicPeriod || '2026-1',
      startDate: practice.startDate,
      endDate: practice.endDate,
      teacherId: practice.teacherId,
      teacher: practice.teacher,
      tutorId: practice.tutorId,
      tutor: practice.tutor,
      workPlan: practice.workPlan
        ? {
            id: practice.workPlan.id,
            status: practice.workPlan.status,
            estado: wpEval.domainStatus,
            isApproved: wpEval.isApproved,
            objectives: practice.workPlan.objectives,
            methodology: practice.workPlan.methodology,
            tutorApproved: practice.workPlan.tutorApproved,
            teacherApproved: practice.workPlan.teacherApproved,
          }
        : null,
      requirementsChecklist: {
        hasTeacherTutor: Boolean(practice.teacherId),
        hasExternalTutor: Boolean(practice.tutorId),
        hasApprovedWorkPlan: wpEval.isApproved,
        canFormalize:
          Boolean(practice.teacherId) && Boolean(practice.tutorId) && wpEval.isApproved,
      },
      availableTeachers: teachersResult.users.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        documentNumber: t.documentNumber,
        program: t.program,
      })),
      availableExternalTutors: companyTutors.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        documentNumber: t.documentNumber,
        cargo:
          t.program && t.program !== 'Ingeniería de Sistemas'
            ? t.program
            : 'Supervisor Empresarial',
        companyId: t.companyId,
      })),
    };
  }
}

export const practiceFormalizationService = new PracticeFormalizationService();

let activeFormalizationServiceInstance: PracticeFormalizationService | null = null;

export function getPracticeFormalizationService(): PracticeFormalizationService {
  return activeFormalizationServiceInstance || practiceFormalizationService;
}

export function setPracticeFormalizationServiceInstance(
  service: PracticeFormalizationService | null
): void {
  activeFormalizationServiceInstance = service;
}
