// ==============================================================================
// SIGETRAP - Servicio de Seguimiento y Control de Prácticas
// Módulo / Épica: Seguimiento y Control de Prácticas
// Caso de Uso Asociado: CU14 - Entrega de Informes de Avance
// Restricciones SQL: chk_horas_ejecutadas_positivas, chk_estado_informe, fk_informe_practica
// ==============================================================================

import {
  AdvanceReportRepository,
  advanceReportRepository,
} from '@/server/repositories/advance-report.repository';
import {
  PracticeRepository,
  practiceRepository,
} from '@/server/repositories/practice.repository';
import {
  AuthenticatedUser,
  RadicarInformeDTO,
  RadicarInformeResultDTO,
  AdvanceReportResponseDTO,
  FollowUpLogDTO,
  InformeEstadoDomain,
  DOMAIN_INFORME_STATUSES,
} from '@/types';

export class PracticeFollowUpError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;
  public readonly constraint?: string;

  constructor(
    message: string,
    code: string = 'PRACTICE_FOLLOWUP_ERROR',
    statusCode: number = 400,
    field?: string,
    constraint?: string
  ) {
    super(message);
    this.name = 'PracticeFollowUpError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    this.constraint = constraint;
  }
}

/**
 * Normaliza y valida si el estado del informe cumple con la restricción chk_estado_informe
 */
export function validateInformeStatus(rawStatus?: string | null): InformeEstadoDomain {
  if (!rawStatus || typeof rawStatus !== 'string' || rawStatus.trim() === '') {
    return 'Radicado'; // Estado canónico por defecto al radicar informe de seguimiento
  }

  const trimmed = rawStatus.trim();
  const lower = trimmed.toLowerCase();

  const map: Record<string, InformeEstadoDomain> = {
    'borrador': 'Borrador',
    'radicado': 'Radicado',
    'en revisión': 'En Revisión',
    'en revision': 'En Revisión',
    'aprobado': 'Aprobado',
    'rechazado': 'Rechazado',
  };

  const matched = map[lower];
  if (!matched) {
    throw new PracticeFollowUpError(
      `Estado de informe no válido ('${trimmed}'). El estado debe cumplir con la restricción chk_estado_informe: ${DOMAIN_INFORME_STATUSES.join(', ')}.`,
      'INVALID_REPORT_STATUS',
      400,
      'estado',
      'chk_estado_informe'
    );
  }

  return matched;
}

/**
 * Evalúa si el estado de una práctica formativa corresponde a una práctica activa en curso
 * Estados activos válidos: 'Formalizada' (ASIGNADO_FORMALMENTE), 'En Curso' (PRACTICA_EN_EJECUCION)
 * Estados no activos: 'Finalizada', 'Cancelada', 'En Trámite', etc.
 */
export function isPracticeActive(status?: string | null): boolean {
  if (!status) return false;
  const s = status.trim().toUpperCase();

  // Estados activos en el dominio y en la máquina de estados
  const activeStatuses = [
    'ASIGNADO_FORMALMENTE',
    'PRACTICA_EN_EJECUCION',
    'FORMALIZADA',
    'EN CURSO',
    'EN_CURSO',
  ];

  return activeStatuses.includes(s);
}

export class PracticeFollowUpService {
  constructor(
    private reportRepo: AdvanceReportRepository = advanceReportRepository,
    private practiceRepo: PracticeRepository = practiceRepository
  ) {}

  /**
   * Radica un informe de seguimiento y bitácora con horas ejecutadas (CU14)
   *
   * Criterios de Aceptación:
   *   - Criterio 1: Radicación exitosa con práctica activa e horas > 0 -> Estado "Radicado", fecha actualizada, 201 Created
   *   - Criterio 2: Horas <= 0 falla por restricción chk_horas_ejecutadas_positivas -> 400 Bad Request
   *   - Criterio 3: Práctica no activa ("Finalizada", "Cancelada", "En Trámite") -> 403 Forbidden / 422 Unprocessable Entity
   */
  async radicarInforme(
    dto: RadicarInformeDTO,
    actor: AuthenticatedUser
  ): Promise<RadicarInformeResultDTO> {
    // 1. Validar autenticación
    if (!actor || !actor.id) {
      throw new PracticeFollowUpError(
        'Debe autenticarse como practicante para radicar informes de seguimiento',
        'UNAUTHORIZED',
        401
      );
    }

    // 2. Extraer parámetros con compatibilidad de nombres (CamelCase y snake_case)
    const practicaId = dto.practicaId || dto.practiceId;
    if (!practicaId) {
      throw new PracticeFollowUpError(
        'El identificador de la práctica formativa es obligatorio',
        'MISSING_PRACTICE_ID',
        400,
        'practicaId',
        'fk_informe_practica'
      );
    }

    const rawHoras =
      dto.horasEjecutadas !== undefined
        ? dto.horasEjecutadas
        : dto.horas_ejecutadas !== undefined
        ? dto.horas_ejecutadas
        : dto.horas;

    // 3. Criterio 2: Validación de horas ejecutadas inválidas (horas <= 0)
    // Dispara falla por restricción chk_horas_ejecutadas_positivas
    if (rawHoras === undefined || rawHoras === null || typeof rawHoras !== 'number') {
      throw new PracticeFollowUpError(
        'Las horas reportadas deben ser un número válido mayor a cero',
        'INVALID_HOURS',
        400,
        'horas_ejecutadas',
        'chk_horas_ejecutadas_positivas'
      );
    }

    if (rawHoras <= 0) {
      throw new PracticeFollowUpError(
        'Las horas reportadas deben ser mayores a cero',
        'INVALID_HOURS',
        400,
        'horas_ejecutadas',
        'chk_horas_ejecutadas_positivas'
      );
    }

    const descripcion =
      dto.descripcionActividades || dto.descripcion_actividades || dto.actividades;

    if (!descripcion || typeof descripcion !== 'string' || descripcion.trim() === '') {
      throw new PracticeFollowUpError(
        'La descripción de actividades ejecutadas es obligatoria para radicar el informe de seguimiento',
        'MISSING_ACTIVITIES_DESCRIPTION',
        400,
        'descripcion_actividades'
      );
    }

    // 4. Validar restricción chk_estado_informe
    const targetStatus = validateInformeStatus(dto.estado);

    // 5. Buscar la práctica formativa
    const practice = await this.practiceRepo.findById(practicaId);
    if (!practice || (practice as any).deletedAt) {
      throw new PracticeFollowUpError(
        'La práctica formativa especificada no existe en el sistema',
        'PRACTICE_NOT_FOUND',
        404,
        'practicaId',
        'fk_informe_practica'
      );
    }

    // 6. Validar que el estudiante autenticado sea el titular de la práctica (RBAC y Aislamiento)
    if (actor.role === 'ESTUDIANTE' && practice.studentId !== actor.id) {
      throw new PracticeFollowUpError(
        'No tiene permisos para radicar informes en una práctica que no le pertenece',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    // 7. Criterio 3: Bloqueo de radicación para prácticas no activas
    // Si la práctica se encuentra en estado "Finalizada", "Cancelada" o "En Trámite"
    const currentStatus = (practice as any).currentStatus || (practice as any).estado;
    if (!isPracticeActive(currentStatus)) {
      throw new PracticeFollowUpError(
        'Solo se permiten radicaciones sobre prácticas activas en curso',
        'PRACTICE_NOT_ACTIVE',
        403,
        'currentStatus'
      );
    }

    // 8. Criterio 1: Radicación exitosa en informes_avance y bitacoras_seguimiento
    const submissionDate = new Date();

    // Preparar soporte de archivo adjunto si se envía URL directa o lista
    const archivos: Array<{
      nombreArchivo: string;
      urlArchivo: string;
      tipoMime?: string;
      tamanoBytes?: number;
    }> = [];

    if (dto.archivosAdjuntos && Array.isArray(dto.archivosAdjuntos)) {
      archivos.push(...dto.archivosAdjuntos);
    } else if (dto.documentUrl || dto.documento_url) {
      archivos.push({
        nombreArchivo: 'Evidencia_Seguimiento.pdf',
        urlArchivo: (dto.documentUrl || dto.documento_url)!,
        tipoMime: 'application/pdf',
      });
    }

    try {
      const { report, log, updatedPractice } =
        await this.reportRepo.createAdvanceReportWithLog({
          practicaId: practice.id,
          estudianteId: practice.studentId,
          tipo: dto.tipo || 'SEGUIMIENTO',
          estado: targetStatus,
          horasEjecutadas: rawHoras,
          descripcionActividades: descripcion.trim(),
          periodoInicio: dto.periodoInicio ? new Date(dto.periodoInicio) : null,
          periodoFin: dto.periodoFin ? new Date(dto.periodoFin) : null,
          fechaEntrega: submissionDate,
          observaciones: dto.observaciones || null,
          archivos: archivos.length > 0 ? archivos : undefined,
        });

      const responseReport: AdvanceReportResponseDTO = {
        id: report.id,
        practicaId: report.practicaId,
        estudianteId: report.estudianteId,
        tipo: report.tipo,
        estado: report.estado as InformeEstadoDomain,
        horasEjecutadas: report.horasEjecutadas,
        descripcionActividades: report.descripcionActividades,
        periodoInicio: report.periodoInicio,
        periodoFin: report.periodoFin,
        fechaEntrega: report.fechaEntrega || submissionDate,
        revisadoPorId: report.revisadoPorId,
        observaciones: report.observaciones,
        revisadoAt: report.revisadoAt,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        practice: {
          id: practice.id,
          currentStatus: updatedPractice.currentStatus,
          totalHoursRequired: updatedPractice.totalHoursRequired,
          totalHoursCompleted: updatedPractice.totalHoursCompleted,
        },
      };

      const responseLog: FollowUpLogDTO = {
        id: log.id,
        informeId: log.informeId,
        practicaId: log.practicaId,
        estudianteId: log.estudianteId,
        fechaActividad: log.fechaActividad,
        descripcionActividades: log.descripcionActividades,
        horasEjecutadas: log.horasEjecutadas,
        observaciones: log.observaciones,
        createdAt: log.createdAt,
      };

      return {
        informe: responseReport,
        bitacora: responseLog,
        horasReportadas: rawHoras,
        totalHorasAcumuladas: updatedPractice.totalHoursCompleted,
        fechaEntrega: submissionDate,
        mensaje: 'Informe de avance y bitácora de seguimiento radicados exitosamente.',
      };
    } catch (err: any) {
      if (err instanceof PracticeFollowUpError) {
        throw err;
      }

      // Si el repositorio lanzó una violación de restricción SQL
      if (err.constraint === 'chk_horas_ejecutadas_positivas' || err.code === '23514') {
        throw new PracticeFollowUpError(
          'Las horas reportadas deben ser mayores a cero',
          'INVALID_HOURS',
          400,
          'horas_ejecutadas',
          'chk_horas_ejecutadas_positivas'
        );
      }

      if (err.constraint === 'chk_estado_informe') {
        throw new PracticeFollowUpError(
          `Estado de informe no válido. Debe cumplir con la restricción chk_estado_informe: ${DOMAIN_INFORME_STATUSES.join(', ')}.`,
          'INVALID_REPORT_STATUS',
          400,
          'estado',
          'chk_estado_informe'
        );
      }

      if (err.constraint === 'fk_informe_practica' || err.code === '23503') {
        throw new PracticeFollowUpError(
          'La práctica formativa asociada no existe',
          'PRACTICE_NOT_FOUND',
          404,
          'practicaId',
          'fk_informe_practica'
        );
      }

      throw err;
    }
  }

  /**
   * Obtiene el listado de informes de seguimiento para una práctica
   */
  async getInformesByPractice(practicaId: string, actor: AuthenticatedUser) {
    if (!actor || !actor.id) {
      throw new PracticeFollowUpError('Debe autenticarse', 'UNAUTHORIZED', 401);
    }

    const practice = await this.practiceRepo.findById(practicaId);
    if (!practice) {
      throw new PracticeFollowUpError('Práctica no encontrada', 'PRACTICE_NOT_FOUND', 404);
    }

    if (actor.role === 'ESTUDIANTE' && practice.studentId !== actor.id) {
      throw new PracticeFollowUpError('Acceso denegado', 'FORBIDDEN_OPERATION', 403);
    }

    const informes = await this.reportRepo.findByPracticeId(practicaId);
    return informes;
  }
}

export const practiceFollowUpService = new PracticeFollowUpService();

let activeServiceInstance: PracticeFollowUpService | null = null;

export function getPracticeFollowUpService(): PracticeFollowUpService {
  return activeServiceInstance || practiceFollowUpService;
}

export function setPracticeFollowUpServiceInstance(
  service: PracticeFollowUpService | null
): void {
  activeServiceInstance = service;
}
