// ==============================================================================
// SIGETRAP - Servicio de Selección y Admisión de Practicantes
// Módulo / Épica: Selección y Admisión de Practicantes
// Caso de Uso Asociado: CU12 - Preselección y Aceptación de Candidatos
// ==============================================================================

import {
  ApplicationRepository,
  applicationRepository,
} from '@/server/repositories/application.repository';
import {
  VacancyRepository,
  vacancyRepository,
} from '@/server/repositories/vacancy.repository';
import {
  PracticeRepository,
  practiceRepository,
} from '@/server/repositories/practice.repository';
import {
  AuthenticatedUser,
  UpdateApplicationStatusDTO,
  ApplicationStatusUpdateResultDTO,
  ApplicationResponseDTO,
  PostulacionEstadoDomain,
  DOMAIN_APPLICATION_STATUSES,
} from '@/types';

export class CandidateSelectionError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;
  public readonly constraint?: string;

  constructor(
    message: string,
    code: string = 'CANDIDATE_SELECTION_ERROR',
    statusCode: number = 400,
    field?: string,
    constraint?: string
  ) {
    super(message);
    this.name = 'CandidateSelectionError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    this.constraint = constraint;
  }
}

// Mapeo canónico de normalización de estados al dominio permitido por chk_estado_postulacion
const STATUS_CANONICAL_MAP: Record<string, PostulacionEstadoDomain> = {
  // Dominio oficial CU12
  'pendiente': 'Pendiente',
  'en revisión': 'En Revisión',
  'en revision': 'En Revisión',
  'preseleccionado': 'Preseleccionado',
  'aceptado': 'Aceptado',
  'rechazado': 'Rechazado',

  // Variantes mayúsculas o enums del sistema
  'postulado': 'Pendiente',
  'presentado': 'En Revisión',
  'en_revision': 'En Revisión',
  'preseleccionado_enum': 'Preseleccionado',
};

/**
 * Normaliza y valida si un estado pertenece al dominio de chk_estado_postulacion
 */
export function normalizeAndValidateStatus(rawStatus?: string | null): PostulacionEstadoDomain {
  if (!rawStatus || typeof rawStatus !== 'string' || rawStatus.trim() === '') {
    throw new CandidateSelectionError(
      'Estado de postulación no válido. Debe suministrar un estado permitido por la restricción chk_estado_postulacion.',
      'INVALID_APPLICATION_STATUS',
      400,
      'status',
      'chk_estado_postulacion'
    );
  }

  const trimmed = rawStatus.trim();
  const lower = trimmed.toLowerCase();

  const mapped = STATUS_CANONICAL_MAP[lower];
  if (!mapped) {
    throw new CandidateSelectionError(
      `Estado de postulación no válido ('${trimmed}'). El estado debe cumplir con la restricción chk_estado_postulacion: ${DOMAIN_APPLICATION_STATUSES.join(', ')}.`,
      'INVALID_APPLICATION_STATUS',
      400,
      'status',
      'chk_estado_postulacion'
    );
  }

  return mapped;
}

export class CandidateSelectionService {
  constructor(
    private appRepo: ApplicationRepository = applicationRepository,
    private vacancyRepo: VacancyRepository = vacancyRepository,
    private practiceRepo: PracticeRepository = practiceRepository
  ) {}

  /**
   * Actualiza el estado de una postulación por parte del reclutador empresarial (CU12)
   * Criterios de Aceptación:
   *   - Criterio 1: Transición válida a "Preseleccionado" o "Aceptado", registrando fecha y usuario (200 OK)
   *   - Criterio 2: Validación de estado no contemplado disparando fallo por chk_estado_postulacion (400 Bad Request)
   *   - Criterio 3: Bloqueo de admisión si se supera el cupo de vacantes de la plaza (422 Unprocessable Entity)
   */
  async updateApplicationStatus(
    applicationId: string,
    dto: UpdateApplicationStatusDTO,
    actor: AuthenticatedUser
  ): Promise<ApplicationStatusUpdateResultDTO> {
    // 1. Validar autenticación y permisos de rol (RBAC)
    if (!actor || !actor.id) {
      throw new CandidateSelectionError(
        'Debe autenticarse para actualizar el estado de las postulaciones',
        'UNAUTHORIZED',
        401
      );
    }

    if (actor.role !== 'TUTOR_EMPRESARIAL' && actor.role !== 'ADMIN') {
      throw new CandidateSelectionError(
        'Únicamente los reclutadores empresariales (tutores) o administradores pueden evaluar hojas de vida y actualizar estados',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    // 2. Criterio 2: Validar restricción SQL chk_estado_postulacion
    // Si el estado enviado no está en el dominio permitido, falla con 400 Bad Request
    const rawStatus = dto.estado ?? dto.status;
    const targetStatus: PostulacionEstadoDomain = normalizeAndValidateStatus(rawStatus);

    // 3. Buscar la postulación y verificar existencia
    const application = await this.appRepo.findById(applicationId);
    if (!application || application.deletedAt) {
      throw new CandidateSelectionError(
        'La postulación especificada no existe en el sistema',
        'APPLICATION_NOT_FOUND',
        404,
        'applicationId'
      );
    }

    // 4. Tenancy: Reclutador solo puede gestionar vacantes de su empresa
    if (actor.role === 'TUTOR_EMPRESARIAL') {
      if (!actor.companyId) {
        throw new CandidateSelectionError(
          'El reclutador no tiene una entidad empleadora asignada en su perfil',
          'TUTOR_WITHOUT_COMPANY',
          403
        );
      }
      if (application.vacancy.companyId !== actor.companyId) {
        throw new CandidateSelectionError(
          'No tiene permisos para evaluar candidatos de convocatorias pertenecientes a otra empresa',
          'FORBIDDEN_OPERATION',
          403
        );
      }
    }

    const previousStatus = application.status;

    // 5. Criterio 3: Bloqueo de admisión si se supera el cupo de la plaza
    // Si intenta marcar como "Aceptado", verificar el límite de vacantes
    if (targetStatus === 'Aceptado') {
      const isAlreadyAccepted =
        (previousStatus as string) === 'Aceptado' ||
        previousStatus === 'ACEPTADO';

      if (!isAlreadyAccepted) {
        const vacancy = await this.vacancyRepo.findById(application.vacancyId);
        if (!vacancy) {
          throw new CandidateSelectionError(
            'La plaza de práctica asociada a la postulación no fue encontrada',
            'VACANCY_NOT_FOUND',
            404
          );
        }

        const acceptedCount = await this.appRepo.countAcceptedByVacancyId(vacancy.id);
        const maxCapacity = vacancy.vacanciesCount;

        if (acceptedCount >= maxCapacity) {
          throw new CandidateSelectionError(
            `El cupo de vacantes para dicha plaza ha sido completado. La plaza '${vacancy.title}' tiene un límite máximo de ${maxCapacity} estudiante(s) admitido(s) y ya cuenta con ${acceptedCount} aceptado(s).`,
            'VACANCY_CAPACITY_EXCEEDED',
            422,
            'status',
            'vacancies_count_limit'
          );
        }
      }
    }

    // 6. Criterio 1: Ejecutar la actualización en base de datos
    // Se actualiza la tabla postulaciones con el nuevo estado, usuario y fecha de modificación
    const updatedApplication = await this.appRepo.updateApplicationStatus({
      applicationId: application.id,
      status: targetStatus,
      updatedById: actor.id,
      rejectionReason: targetStatus === 'Rechazado' ? dto.rejectionReason || 'No seleccionado en el proceso' : null,
    });

    // 7. Sincronización con el ciclo de vida de la práctica (CU12 Formalización de Admisión)
    let practiceId: string | null = null;
    let practiceStatus: any = null;

    if (application.practice) {
      practiceId = application.practice.id;

      if (targetStatus === 'Aceptado') {
        // Transición de práctica a ACEPTADO_ARL_PENDIENTE para formalizar admisión del estudiante
        const updatedPractice = await this.practiceRepo.executeStatusTransition({
          practiceId: application.practice.id,
          fromStatus: application.practice.currentStatus as any,
          toStatus: 'ACEPTADO_ARL_PENDIENTE',
          changedByUserId: actor.id,
          notes: dto.notes || 'Estudiante seleccionado y admitido por el reclutador empresarial tras evaluación de hoja de vida',
          metadata: {
            applicationId: application.id,
            vacancyId: application.vacancyId,
            studentId: application.studentId,
            admittedByUserId: actor.id,
            timestamp: new Date().toISOString(),
          },
        });
        practiceStatus = updatedPractice.practice.currentStatus;

        // Verificar si la plaza completó sus cupos para actualizar estado de la vacante a CUBIERTA
        const updatedAcceptedCount = await this.appRepo.countAcceptedByVacancyId(application.vacancyId);
        const vacancy = await this.vacancyRepo.findById(application.vacancyId);
        if (vacancy && updatedAcceptedCount >= vacancy.vacanciesCount) {
          await this.vacancyRepo.updateStatus(vacancy.id, 'CUBIERTA');
        }
      } else if (targetStatus === 'Rechazado') {
        practiceStatus = 'REUBICACION_PENDIENTE';
        await this.practiceRepo.executeStatusTransition({
          practiceId: application.practice.id,
          fromStatus: application.practice.currentStatus as any,
          toStatus: 'REUBICACION_PENDIENTE',
          changedByUserId: actor.id,
          notes: dto.rejectionReason || dto.notes || 'Candidato no admitido por la empresa receptora',
          metadata: {
            applicationId: application.id,
            rejectionReason: dto.rejectionReason,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    return {
      id: updatedApplication.id,
      vacancyId: updatedApplication.vacancyId,
      studentId: updatedApplication.studentId,
      previousStatus: String(previousStatus),
      newStatus: targetStatus,
      status: targetStatus,
      updatedAt: updatedApplication.updatedAt,
      updatedById: actor.id,
      updatedByName: actor.name,
      rejectionReason: updatedApplication.rejectionReason,
      practiceId,
      practiceStatus,
      message: `El estado de la postulación se actualizó exitosamente a '${targetStatus}'`,
    };
  }

  /**
   * Consulta una postulación por ID con verificación de permisos y hoja de vida
   */
  async getApplicationById(
    applicationId: string,
    actor: AuthenticatedUser
  ): Promise<ApplicationResponseDTO> {
    if (!actor) {
      throw new CandidateSelectionError('Debe autenticarse para consultar la postulación', 'UNAUTHORIZED', 401);
    }

    const application = await this.appRepo.findById(applicationId);
    if (!application || application.deletedAt) {
      throw new CandidateSelectionError('La postulación no fue encontrada', 'APPLICATION_NOT_FOUND', 404);
    }

    // RBAC y Tenancy
    if (actor.role === 'TUTOR_EMPRESARIAL') {
      if (application.vacancy.companyId !== actor.companyId) {
        throw new CandidateSelectionError('No tiene autorización para consultar esta postulación', 'FORBIDDEN_OPERATION', 403);
      }
    } else if (actor.role === 'ESTUDIANTE') {
      if (application.studentId !== actor.id) {
        throw new CandidateSelectionError('No tiene autorización para consultar esta postulación', 'FORBIDDEN_OPERATION', 403);
      }
    }

    return {
      id: application.id,
      vacancyId: application.vacancyId,
      studentId: application.studentId,
      status: application.status as any,
      cvUrl: application.cvUrl,
      presentationLetterUrl: application.presentationLetterUrl,
      rejectionReason: application.rejectionReason,
      updatedById: (application as any).updatedById,
      updatedBy: (application as any).updatedBy,
      practiceId: application.practice?.id,
      practiceStatus: application.practice?.currentStatus as any,
      vacancy: {
        id: application.vacancy.id,
        title: application.vacancy.title,
        description: application.vacancy.description,
        requirements: application.vacancy.requirements,
        company: {
          id: application.vacancy.company.id,
          businessName: application.vacancy.company.businessName,
          city: application.vacancy.company.city,
        },
      },
      student: application.student ? {
        id: application.student.id,
        name: application.student.name,
        email: application.student.email,
        studentCode: application.student.studentCode,
      } : undefined,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }
}

export const candidateSelectionService = new CandidateSelectionService();

let activeServiceInstance: CandidateSelectionService | null = null;

export function getCandidateSelectionService(): CandidateSelectionService {
  return activeServiceInstance || candidateSelectionService;
}

export function setCandidateSelectionServiceInstance(
  service: CandidateSelectionService | null
): void {
  activeServiceInstance = service;
}
