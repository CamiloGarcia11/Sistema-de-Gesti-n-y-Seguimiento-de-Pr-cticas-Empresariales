// ==============================================================================
// SIGETRAP - Servicio de Lógica de Negocio y Máquina de Estados
// Capa de Servicios (RNF11)
// ==============================================================================

import {
  PracticeRepository,
  practiceRepository,
} from '@/server/repositories/practice.repository';
import {
  AgreementRepository,
  agreementRepository,
} from '@/server/repositories/agreement.repository';
import {
  PracticeStatus,
  AuthenticatedUser,
  TransitionPracticeRequestDTO,
  TransitionResult,
  Role,
} from '@/types';
import { Prisma } from '@prisma/client';

export class BusinessRuleError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = 'BUSINESS_RULE_VIOLATION', statusCode: number = 400) {
    super(message);
    this.name = 'BusinessRuleError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class PracticeWorkflowService {
  constructor(
    private practiceRepo: PracticeRepository = practiceRepository,
    private agreementRepo: AgreementRepository = agreementRepository
  ) {}

  /**
   * Matriz de Transiciones Permitidas y Roles Autorizados
   */
  private readonly allowedTransitions: Record<
    PracticeStatus,
    { target: PracticeStatus; allowedRoles: Role[] }[]
  > = {
    ASPIRANTE: [
      { target: 'POSTULADO', allowedRoles: ['ESTUDIANTE', 'DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    POSTULADO: [
      { target: 'PRESENTADO_A_EMPRESA', allowedRoles: ['DIRECTOR_PROGRAMA', 'ADMIN'] }, // RN-02: Solo Director emite oficio
      { target: 'REUBICACION_PENDIENTE', allowedRoles: ['DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    PRESENTADO_A_EMPRESA: [
      { target: 'ACEPTADO_ARL_PENDIENTE', allowedRoles: ['TUTOR_EMPRESARIAL', 'DIRECTOR_PROGRAMA', 'ADMIN'] }, // RN-06
      { target: 'REUBICACION_PENDIENTE', allowedRoles: ['TUTOR_EMPRESARIAL', 'DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    REUBICACION_PENDIENTE: [
      { target: 'POSTULADO', allowedRoles: ['ESTUDIANTE', 'DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    ACEPTADO_ARL_PENDIENTE: [
      { target: 'ASIGNADO_FORMALMENTE', allowedRoles: ['DIRECTOR_PROGRAMA', 'ADMIN'] }, // RN-06: Validación de ARL
      { target: 'REUBICACION_PENDIENTE', allowedRoles: ['DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    ASIGNADO_FORMALMENTE: [
      { target: 'PLAN_EN_REVISION', allowedRoles: ['ESTUDIANTE', 'DOCENTE_PRACTICA', 'TUTOR_EMPRESARIAL', 'DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    PLAN_EN_REVISION: [
      { target: 'PRACTICA_EN_EJECUCION', allowedRoles: ['DIRECTOR_PROGRAMA', 'DOCENTE_PRACTICA', 'ADMIN'] }, // RN-07, RN-08
      { target: 'REUBICACION_PENDIENTE', allowedRoles: ['DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    PRACTICA_EN_EJECUCION: [
      { target: 'EVALUACION_PENDIENTE', allowedRoles: ['DOCENTE_PRACTICA', 'DIRECTOR_PROGRAMA', 'ADMIN'] },
      { target: 'REUBICACION_PENDIENTE', allowedRoles: ['DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    EVALUACION_PENDIENTE: [
      { target: 'FINALIZADA', allowedRoles: ['DOCENTE_PRACTICA', 'DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    FINALIZADA: [
      { target: 'CERRADA', allowedRoles: ['DIRECTOR_PROGRAMA', 'ADMIN'] },
    ],
    CERRADA: [],
  };

  /**
   * Ejecuta la transición de estado en el ciclo de vida de la práctica aplicando
   * de forma estricta las reglas RN-01, RN-02, RN-06, RN-07, RN-08 y auditoría.
   */
  async transitionPracticeStatus(
    practiceId: string,
    dto: TransitionPracticeRequestDTO,
    actor: AuthenticatedUser
  ): Promise<TransitionResult> {
    // 1. Obtener la práctica con sus relaciones
    const practice = await this.practiceRepo.findById(practiceId);
    if (!practice) {
      throw new BusinessRuleError('La práctica especificada no existe', 'PRACTICE_NOT_FOUND', 404);
    }

    const currentStatus = practice.currentStatus as PracticeStatus;
    const targetStatus = dto.toStatus;

    // 2. Validar que la transición esté en la matriz de la máquina de estados
    const possibleTransitions = this.allowedTransitions[currentStatus] || [];
    const transitionConfig = possibleTransitions.find((t) => t.target === targetStatus);

    if (!transitionConfig) {
      throw new BusinessRuleError(
        `Transición de estado inválida: no se permite avanzar de '${currentStatus}' a '${targetStatus}'`,
        'INVALID_STATE_TRANSITION',
        400
      );
    }

    // 3. Validar permisos de rol (RBAC) para esta transición específica
    const hasRolePermission =
      actor.role === 'ADMIN' || transitionConfig.allowedRoles.includes(actor.role);

    if (!hasRolePermission) {
      throw new BusinessRuleError(
        `El rol '${actor.role}' no tiene autorización para ejecutar la transición de '${currentStatus}' a '${targetStatus}'`,
        'FORBIDDEN_TRANSITION',
        403
      );
    }

    // 4. Validar Regla RN-01 (Convenio Obligatorio Vigente)
    await this.validateAgreementIsActive(practice.companyId);

    // 5. Aplicar Reglas Específicas según Estado Destino
    const additionalData: Prisma.PracticeUpdateInput = {};
    const auditMetadata: Record<string, unknown> = {
      ...dto.metadata,
      triggeredByRole: actor.role,
      triggeredByEmail: actor.email,
      timestamp: new Date().toISOString(),
    };

    switch (targetStatus) {
      // ------------------------------------------------------------------------
      // RN-02: Oficio de Presentación emitido por el Director
      // ------------------------------------------------------------------------
      case 'PRESENTADO_A_EMPRESA':
        if (actor.role !== 'DIRECTOR_PROGRAMA' && actor.role !== 'ADMIN') {
          throw new BusinessRuleError(
            'RN-02: Únicamente el Director de Programa o Admin puede emitir la presentación a la empresa',
            'RN02_DIRECTOR_REQUIRED',
            403
          );
        }
        if (dto.presentationLetterUrl) {
          additionalData.presentationLetterUrl = dto.presentationLetterUrl;
          auditMetadata.presentationLetterUrl = dto.presentationLetterUrl;
        }
        break;

      // ------------------------------------------------------------------------
      // RN-06: Validación Obligatoria de ARL antes de formalizar asignación
      // ------------------------------------------------------------------------
      case 'ASIGNADO_FORMALMENTE':
        if (currentStatus !== 'ACEPTADO_ARL_PENDIENTE') {
          throw new BusinessRuleError(
            'RN-06: Para asignar formalmente, la práctica debe estar en estado ACEPTADO_ARL_PENDIENTE',
            'RN06_INVALID_ORIGIN_STATUS',
            400
          );
        }

        const arlUrl = dto.arlSupportUrl || practice.arlSupportUrl;
        if (!arlUrl) {
          throw new BusinessRuleError(
            'RN-06: No se puede formalizar la asignación sin el soporte y validación del documento de ARL',
            'RN06_ARL_SUPPORT_REQUIRED',
            400
          );
        }

        additionalData.arlSupportUrl = arlUrl;
        additionalData.arlValidatedAt = new Date();
        additionalData.arlValidator = { connect: { id: actor.id } };
        auditMetadata.arlValidatedBy = actor.id;
        auditMetadata.arlSupportUrl = arlUrl;
        break;

      // ------------------------------------------------------------------------
      // RN-07 y RN-08: Aprobación Dual Concurrente del Plan de Trabajo
      // ------------------------------------------------------------------------
      case 'PRACTICA_EN_EJECUCION':
        if (currentStatus !== 'PLAN_EN_REVISION') {
          throw new BusinessRuleError(
            'Para iniciar ejecución, la práctica debe estar previamente en PLAN_EN_REVISION',
            'INVALID_ORIGIN_FOR_EXECUTION',
            400
          );
        }

        if (!practice.workPlan) {
          throw new BusinessRuleError(
            'RN-07: No existe un plan de trabajo registrado para esta práctica',
            'WORK_PLAN_NOT_FOUND',
            400
          );
        }

        // Verificar aprobación concurrente de Tutor Empresarial y Docente
        const isTutorApproved = practice.workPlan.tutorApproved;
        const isTeacherApproved = practice.workPlan.teacherApproved;

        if (!isTutorApproved || !isTeacherApproved) {
          const pendingApprovers: string[] = [];
          if (!isTutorApproved) pendingApprovers.push('TUTOR_EMPRESARIAL');
          if (!isTeacherApproved) pendingApprovers.push('DOCENTE_PRACTICA');

          throw new BusinessRuleError(
            `RN-07/RN-08: Aprobación dual incompleta. Falta la aprobación de: ${pendingApprovers.join(', ')}`,
            'DUAL_APPROVAL_INCOMPLETE',
            400
          );
        }

        auditMetadata.workPlanId = practice.workPlan.id;
        auditMetadata.dualApprovalConfirmed = true;
        break;

      case 'REUBICACION_PENDIENTE':
        auditMetadata.rejectionReason = dto.rejectionReason || dto.notes || 'Reubicación solicitada';
        break;

      default:
        break;
    }

    // 6. Ejecutar Transición Transaccional Atómica (Auditoría RNF05, RNF15)
    const result = await this.practiceRepo.executeStatusTransition({
      practiceId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      changedByUserId: actor.id,
      notes: dto.notes,
      metadata: auditMetadata,
      additionalPracticeData: additionalData,
    });

    return {
      success: true,
      practiceId: result.practice.id,
      previousStatus: currentStatus,
      currentStatus: targetStatus,
      transitionTimestamp: result.historyEntry.createdAt,
      message: `Transición completada exitosamente de '${currentStatus}' a '${targetStatus}'`,
    };
  }

  /**
   * Valida que la empresa asociada tenga un convenio vigente no vencido (RN-01)
   */
  private async validateAgreementIsActive(companyId: string): Promise<void> {
    const activeAgreement = await this.agreementRepo.findActiveAgreementByCompanyId(companyId);
    if (!activeAgreement) {
      throw new BusinessRuleError(
        'RN-01: La empresa no cuenta con un convenio VIGENTE activo. Operación bloqueada.',
        'RN01_AGREEMENT_NOT_ACTIVE',
        400
      );
    }
  }

  /**
   * Procesa la aprobación individual del Plan de Trabajo (Tutor Empresarial o Docente)
   */
  async approveWorkPlan(
    practiceId: string,
    actor: AuthenticatedUser,
    approved: boolean,
    feedback?: string
  ) {
    const practice = await this.practiceRepo.findById(practiceId);
    if (!practice || !practice.workPlan) {
      throw new BusinessRuleError('Plan de trabajo no encontrado', 'WORK_PLAN_NOT_FOUND', 404);
    }

    if (practice.currentStatus !== 'PLAN_EN_REVISION') {
      throw new BusinessRuleError(
        'El plan de trabajo solo puede aprobarse cuando la práctica está en estado PLAN_EN_REVISION',
        'INVALID_STATUS_FOR_APPROVAL',
        400
      );
    }

    let approverRole: 'TUTOR_EMPRESARIAL' | 'DOCENTE_PRACTICA';

    if (actor.role === 'TUTOR_EMPRESARIAL') {
      approverRole = 'TUTOR_EMPRESARIAL';
    } else if (actor.role === 'DOCENTE_PRACTICA') {
      approverRole = 'DOCENTE_PRACTICA';
    } else if (actor.role === 'ADMIN') {
      approverRole = 'DOCENTE_PRACTICA'; // Admin puede actuar como supervisor docente
    } else {
      throw new BusinessRuleError(
        'Solo el Tutor Empresarial o el Docente de Práctica pueden emitir aprobaciones al plan',
        'UNAUTHORIZED_APPROVER',
        403
      );
    }

    // Determinar nuevo estado del plan
    let newStatus = practice.workPlan.status;
    if (!approved) {
      newStatus = 'RECHAZADO';
    } else {
      const willBeTutorApproved =
        approverRole === 'TUTOR_EMPRESARIAL' ? true : practice.workPlan.tutorApproved;
      const willBeTeacherApproved =
        approverRole === 'DOCENTE_PRACTICA' ? true : practice.workPlan.teacherApproved;

      if (willBeTutorApproved && willBeTeacherApproved) {
        newStatus = 'APROBADO_DUAL';
      } else if (willBeTutorApproved) {
        newStatus = 'APROBADO_TUTOR';
      } else if (willBeTeacherApproved) {
        newStatus = 'APROBADO_DOCENTE';
      }
    }

    return this.practiceRepo.recordWorkPlanApproval({
      workPlanId: practice.workPlan.id,
      approverRole,
      approverUserId: actor.id,
      approved,
      feedback,
      newWorkPlanStatus: newStatus,
    });
  }
}

export const practiceWorkflowService = new PracticeWorkflowService();
