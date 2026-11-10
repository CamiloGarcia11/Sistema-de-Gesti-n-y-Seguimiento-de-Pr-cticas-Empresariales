// ==============================================================================
// SIGETRAP - Servicio de Monitoreo y Alertas Automáticas de ARL Estudiante
// Implementa:
//   - Criterio 1: Alerta preventiva por falta de afiliación antes del inicio (<= 5 días hábiles)
//   - Criterio 2: Alertas automáticas de próximo vencimiento (umbrales de 15 y 5 días) + banner estudiantil
//   - Criterio 3: Cambio a estado "Vencido", alerta crítica al coordinador y bloqueo de bitácoras/avances
//   - Criterio 4: Semáforo de ARL (Vigente, Próximo a vencer, Vencido, Sin Afiliación, Pendiente de revisión) y filtrado
//   - RN01: Evaluación periódica diaria (Job programado 00:00 hrs -> '0 0 * * *')
//   - RN02: Subida de soporte deja estado en "Pendiente de revisión" hasta validación del coordinador
//   - RN03: Inactividad presencial (enabledForInPersonWork = false) para ARL "Vencido" o "Sin Afiliación"
// ==============================================================================

import {
  ArlAlertRepository,
  PracticeArlRecord,
  arlAlertRepository,
} from '@/server/repositories/arl-alert.repository';
import {
  buildPreventiveRenewalNotification,
  buildCriticalArlAlertNotification,
} from '@/server/templates/arl-notification.templates';
import {
  ArlAlertSeverity,
  ArlAlertType,
  ArlAlertsFilterDTO,
  ArlAlertsQueryResultDTO,
  ArlDailyCheckSummaryDTO,
  ArlNotificationPayload,
  ArlSemaphoreLabel,
  ArlStatus,
  ArlStudentAlertItemDTO,
  AuthenticatedUser,
  UploadArlDocumentDTO,
  UploadArlDocumentResultDTO,
  ValidateArlDocumentDTO,
  ValidateArlDocumentResultDTO,
} from '@/types';

export const DEFAULT_PRE_START_BUSINESS_DAYS = 5;
export const DEFAULT_EXPIRATION_THRESHOLD_15_DAYS = 15;
export const DEFAULT_EXPIRATION_THRESHOLD_5_DAYS = 5;
export const ARL_DAILY_CRON_EXPRESSION = '0 0 * * *'; // RN01: Medianoche (00:00 hrs)
export const COORDINATOR_NOTIFICATION_EMAIL = 'director.sistemas@ufps.edu.co';

export class ArlAlertError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;
  public readonly constraint?: string;

  constructor(
    message: string,
    code: string = 'ARL_ALERT_ERROR',
    statusCode: number = 400,
    field?: string,
    constraint?: string
  ) {
    super(message);
    this.name = 'ArlAlertError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    this.constraint = constraint;
  }
}

/**
 * Normaliza una fecha a medianoche UTC para cálculos exactos de días
 */
export function normalizeToUtcMidnight(dateInput: Date | string): Date {
  const d = new Date(dateInput);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Calcula los días calendario entre dos fechas (positivo si targetDate es futuro, negativo si ya pasó)
 */
export function calculateCalendarDaysUntil(
  fromDateInput: Date | string,
  targetDateInput: Date | string
): number {
  const fromUtc = normalizeToUtcMidnight(fromDateInput).getTime();
  const targetUtc = normalizeToUtcMidnight(targetDateInput).getTime();
  return Math.round((targetUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Calcula los días hábiles (Lunes a Viernes) entre fromDate y targetDate
 */
export function calculateBusinessDaysUntil(
  fromDateInput: Date | string,
  targetDateInput: Date | string
): number {
  const start = normalizeToUtcMidnight(fromDateInput);
  const end = normalizeToUtcMidnight(targetDateInput);

  if (end.getTime() === start.getTime()) return 0;

  const isForward = end.getTime() > start.getTime();
  const cursor = new Date(start.getTime());
  let businessDays = 0;

  while (isForward ? cursor.getTime() < end.getTime() : cursor.getTime() > end.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + (isForward ? 1 : -1));
    const dayOfWeek = cursor.getUTCDay(); // 0 = Domingo, 6 = Sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays += isForward ? 1 : -1;
    }
  }

  return businessDays;
}

/**
 * Mapea el código de estado ARL a su etiqueta de semáforo oficial (Criterio 4 y RN02)
 */
export function mapArlStatusToLabel(status: ArlStatus): ArlSemaphoreLabel {
  switch (status) {
    case 'VIGENTE':
      return 'Vigente';
    case 'PROXIMO_A_VENCER':
      return 'Próximo a vencer';
    case 'VENCIDO':
      return 'Vencido';
    case 'PENDIENTE_REVISION':
      return 'Pendiente de revisión';
    case 'SIN_AFILIACION':
    default:
      return 'Sin Afiliación';
  }
}

/**
 * Normaliza un filtro textual o enum al código ArlStatus
 */
export function normalizeArlStatusFilter(raw?: string | null): ArlStatus | null {
  if (!raw) return null;
  const clean = raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (clean === 'VIGENTE') return 'VIGENTE';
  if (clean === 'PROXIMO_A_VENCER' || clean === 'PROXIMO A VENCER') return 'PROXIMO_A_VENCER';
  if (clean === 'VENCIDO' || clean === 'VENCIDA') return 'VENCIDO';
  if (clean === 'SIN_AFILIACION' || clean === 'SIN AFILIACION') return 'SIN_AFILIACION';
  if (
    clean === 'PENDIENTE_REVISION' ||
    clean === 'PENDIENTE DE REVISION' ||
    clean === 'PENDIENTE'
  ) {
    return 'PENDIENTE_REVISION';
  }
  return null;
}

export class ArlAlertService {
  constructor(
    private repo: ArlAlertRepository = arlAlertRepository,
    private config = {
      preStartBusinessDaysThreshold: DEFAULT_PRE_START_BUSINESS_DAYS,
      warningThreshold15Days: DEFAULT_EXPIRATION_THRESHOLD_15_DAYS,
      urgentThreshold5Days: DEFAULT_EXPIRATION_THRESHOLD_5_DAYS,
      coordinatorEmail: COORDINATOR_NOTIFICATION_EMAIL,
    }
  ) {}

  /**
   * Evalúa integralmente el estado de ARL de un registro de práctica según los Criterios 1, 2, 3, 4 y RN01-RN03
   */
  evaluatePracticeArlState(
    record: PracticeArlRecord,
    referenceDate: Date = new Date()
  ): ArlStudentAlertItemDTO {
    const hasSupportUrl = Boolean(record.arlSupportUrl && record.arlSupportUrl.trim() !== '');
    const isValidated = Boolean(record.arlValidatedAt);
    const isExplicitlyPending = record.arlStatus === 'PENDIENTE_REVISION';
    const isExplicitlyRejected =
      record.arlStatus === 'SIN_AFILIACION' && Boolean(record.arlRejectionReason);

    const daysUntilExpiration = record.arlExpirationDate
      ? calculateCalendarDaysUntil(referenceDate, record.arlExpirationDate)
      : null;

    const businessDaysUntilStart = record.startDate
      ? calculateBusinessDaysUntil(referenceDate, record.startDate)
      : null;

    const startDateFormatted = record.startDate
      ? new Date(record.startDate).toISOString().split('T')[0]
      : null;
    const expirationDateFormatted = record.arlExpirationDate
      ? new Date(record.arlExpirationDate).toISOString().split('T')[0]
      : null;

    let arlStatus: ArlStatus = 'SIN_AFILIACION';
    let hasActiveAlert = false;
    let alertType: ArlAlertType = 'SIN_ALERTA';
    let alertSeverity: ArlAlertSeverity = 'NINGUNA';
    let alertTitle = 'Cobertura de ARL al día';
    let alertMessage = 'El estudiante cuenta con afiliación a Riesgos Laborales vigente y validada.';
    let studentBannerMessage: string | null = null;
    let coordinatorAlertMessage: string | null = null;
    let isBlockedFromReports = false;
    let enabledForInPersonWork = false;
    const notificationsTriggered: ArlNotificationPayload[] = [];

    // 1. Caso RN02: Se subió nuevo soporte y está pendiente de revisión por el coordinador
    if (hasSupportUrl && (!isValidated || isExplicitlyPending) && !isExplicitlyRejected) {
      arlStatus = 'PENDIENTE_REVISION';
      enabledForInPersonWork = false;
      isBlockedFromReports = false;
      hasActiveAlert = true;

      // Criterio 1: Si además faltan <= X días hábiles para iniciar y aún no está validado
      if (businessDaysUntilStart !== null && businessDaysUntilStart <= this.config.preStartBusinessDaysThreshold) {
        alertType = 'FALTA_AFILIACION_PRE_INICIO';
        alertSeverity = 'PREVENTIVA';
        alertTitle = 'Alerta Preventiva: Práctica próxima a iniciar con ARL pendiente de validación';
        alertMessage = `Faltan ${businessDaysUntilStart} día(s) hábil(es) para el inicio programado (${startDateFormatted}) y el soporte de ARL aún no ha sido validado. La práctica no puede iniciar sin cobertura de ARL validada.`;
        studentBannerMessage = `Su soporte de ARL fue cargado y se encuentra "Pendiente de revisión" (RN02). La práctica programada para el ${startDateFormatted} requiere validación del coordinador antes del inicio.`;
        coordinatorAlertMessage = `El estudiante ${record.student.name} inicia práctica en ${businessDaysUntilStart} día(s) hábil(es) y tiene un certificado ARL pendiente de revisión.`;

        notificationsTriggered.push(
          buildCriticalArlAlertNotification({
            recipientEmail: record.student.email,
            recipientRole: 'ESTUDIANTE',
            studentName: record.student.name,
            studentCode: record.student.studentCode,
            companyName: record.company.businessName,
            reason: 'AUSENCIA_AFILIACION_PRE_INICIO',
            startDate: startDateFormatted,
            businessDaysUntilStart,
          }),
          buildCriticalArlAlertNotification({
            recipientEmail: this.config.coordinatorEmail,
            recipientRole: 'DIRECTOR_PROGRAMA',
            studentName: record.student.name,
            studentCode: record.student.studentCode,
            companyName: record.company.businessName,
            reason: 'AUSENCIA_AFILIACION_PRE_INICIO',
            startDate: startDateFormatted,
            businessDaysUntilStart,
          })
        );
      } else {
        alertType = 'PENDIENTE_VALIDACION';
        alertSeverity = 'INFORMATIVA';
        alertTitle = 'Póliza ARL Pendiente de Revisión (RN02)';
        alertMessage =
          'El estudiante cargó un nuevo certificado de ARL. Requiere validación de autenticidad por parte de la Coordinación de Prácticas.';
        studentBannerMessage =
          'Su soporte de ARL se encuentra "Pendiente de revisión" por parte de la Coordinación de Prácticas (RN02).';
        coordinatorAlertMessage = `Póliza ARL cargada por ${record.student.name} pendiente de validación documental.`;
      }
    }
    // 2. Caso Criterio 1 & RN03: Sin certificado de ARL cargado (o rechazado)
    else if (!hasSupportUrl || isExplicitlyRejected) {
      arlStatus = 'SIN_AFILIACION';
      enabledForInPersonWork = false; // RN03: Inactividad por falta de cobertura
      isBlockedFromReports = true;
      hasActiveAlert = true;

      const isPreStartWindow =
        businessDaysUntilStart === null ||
        businessDaysUntilStart <= this.config.preStartBusinessDaysThreshold;

      alertType = 'FALTA_AFILIACION_PRE_INICIO';
      alertSeverity = isPreStartWindow ? 'PREVENTIVA' : 'INFORMATIVA';
      alertTitle = 'Alerta Preventiva: Falta de afiliación a ARL antes del inicio de práctica';
      alertMessage =
        businessDaysUntilStart !== null
          ? `Faltan ${businessDaysUntilStart} día(s) hábil(es) para la fecha de inicio programada (${startDateFormatted}) y no existe certificado de ARL cargado y validado. La práctica no puede iniciar sin cobertura de ARL.`
          : 'El estudiante no cuenta con certificado de ARL cargado y validado. La práctica no puede iniciar sin cobertura de ARL.';

      studentBannerMessage = record.arlRejectionReason
        ? `Su soporte de ARL fue observado/rechazado (${record.arlRejectionReason}). La práctica no puede iniciar ni ejecutarse sin cobertura de ARL vigente.`
        : 'Alerta preventiva: No registra certificado de ARL cargado y validado. La práctica empresarial no puede iniciar sin cobertura de riesgos laborales.';
      coordinatorAlertMessage = alertMessage;

      if (isPreStartWindow) {
        notificationsTriggered.push(
          buildCriticalArlAlertNotification({
            recipientEmail: record.student.email,
            recipientRole: 'ESTUDIANTE',
            studentName: record.student.name,
            studentCode: record.student.studentCode,
            companyName: record.company.businessName,
            reason: 'AUSENCIA_AFILIACION_PRE_INICIO',
            startDate: startDateFormatted,
            businessDaysUntilStart: businessDaysUntilStart ?? 0,
          }),
          buildCriticalArlAlertNotification({
            recipientEmail: this.config.coordinatorEmail,
            recipientRole: 'DIRECTOR_PROGRAMA',
            studentName: record.student.name,
            studentCode: record.student.studentCode,
            companyName: record.company.businessName,
            reason: 'AUSENCIA_AFILIACION_PRE_INICIO',
            startDate: startDateFormatted,
            businessDaysUntilStart: businessDaysUntilStart ?? 0,
          })
        );
      }
    }
    // 3. Caso Criterio 3 & RN03: Fecha de vigencia de ARL expirada ("Vencido")
    else if (
      (daysUntilExpiration !== null && daysUntilExpiration < 0) ||
      record.arlStatus === 'VENCIDO'
    ) {
      arlStatus = 'VENCIDO';
      enabledForInPersonWork = false; // RN03: Inactividad por falta de cobertura
      isBlockedFromReports = true; // Criterio 3: Restringe el registro de bitácoras o avances
      hasActiveAlert = true;
      alertType = 'ARL_VENCIDA';
      alertSeverity = 'CRITICA';
      alertTitle = 'Alerta Crítica: Afiliación a ARL Vencida — Registro de bitácoras restringido';
      alertMessage = `La vigencia de la afiliación a ARL expiró el ${expirationDateFormatted || 'fecha anterior'}. Se ha restringido el registro de bitácoras e informes de avance hasta cargar la nueva constancia de renovación.`;
      studentBannerMessage = `¡Atención! Su afiliación a la ARL se encuentra VENCIDA (expiró el ${expirationDateFormatted || 'fecha anterior'}). El registro de bitácoras e informes de avance está restringido hasta que cargue el soporte de renovación.`;
      coordinatorAlertMessage = `ALERTA CRÍTICA: La póliza ARL del estudiante ${record.student.name} en ${record.company.businessName} se encuentra VENCIDA. Actividades presenciales y bitácoras bloqueadas.`;

      notificationsTriggered.push(
        buildCriticalArlAlertNotification({
          recipientEmail: this.config.coordinatorEmail,
          recipientRole: 'DIRECTOR_PROGRAMA',
          studentName: record.student.name,
          studentCode: record.student.studentCode,
          companyName: record.company.businessName,
          reason: 'CADUCIDAD_VIGENCIA',
          expirationDate: expirationDateFormatted,
        }),
        buildCriticalArlAlertNotification({
          recipientEmail: record.student.email,
          recipientRole: 'ESTUDIANTE',
          studentName: record.student.name,
          studentCode: record.student.studentCode,
          companyName: record.company.businessName,
          reason: 'CADUCIDAD_VIGENCIA',
          expirationDate: expirationDateFormatted,
        })
      );
    }
    // 4. Caso Criterio 2: Próximo vencimiento de vigencia (umbrales de 15 días y 5 días)
    else if (
      daysUntilExpiration !== null &&
      daysUntilExpiration >= 0 &&
      daysUntilExpiration <= this.config.warningThreshold15Days
    ) {
      arlStatus = 'PROXIMO_A_VENCER';
      enabledForInPersonWork = true;
      isBlockedFromReports = false;
      hasActiveAlert = true;

      const isUrgent5Days = daysUntilExpiration <= this.config.urgentThreshold5Days;
      alertType = isUrgent5Days ? 'PROXIMO_VENCIMIENTO_5_DIAS' : 'PROXIMO_VENCIMIENTO_15_DIAS';
      alertSeverity = isUrgent5Days ? 'ALTA' : 'PREVENTIVA';
      alertTitle = isUrgent5Days
        ? `Alerta Urgente: Póliza ARL vence en ${daysUntilExpiration} día(s) (Umbral 5 días)`
        : `Aviso Preventivo: Póliza ARL próxima a vencer en ${daysUntilExpiration} día(s) (Umbral 15 días)`;
      alertMessage = `El certificado de ARL vence el ${expirationDateFormatted} (${daysUntilExpiration} día(s) restantes). Se requiere cargar el soporte de renovación antes del vencimiento.`;
      studentBannerMessage = `Aviso de Renovación ARL: Su certificado de ARL vence en ${daysUntilExpiration} día(s) (${expirationDateFormatted}). Por favor cargue el soporte de renovación para evitar el bloqueo de sus bitácoras.`;
      coordinatorAlertMessage = `El certificado ARL de ${record.student.name} vence en ${daysUntilExpiration} día(s) (${expirationDateFormatted}).`;

      notificationsTriggered.push(
        buildPreventiveRenewalNotification({
          recipientEmail: record.student.email,
          recipientRole: 'ESTUDIANTE',
          studentName: record.student.name,
          studentCode: record.student.studentCode,
          companyName: record.company.businessName,
          expirationDate: expirationDateFormatted || '',
          daysUntilExpiration,
          thresholdMilestone: isUrgent5Days ? 5 : 15,
          policyNumber: record.arlPolicyNumber,
          arlEntityName: record.arlEntityName,
        }),
        buildPreventiveRenewalNotification({
          recipientEmail: this.config.coordinatorEmail,
          recipientRole: 'DIRECTOR_PROGRAMA',
          studentName: record.student.name,
          studentCode: record.student.studentCode,
          companyName: record.company.businessName,
          expirationDate: expirationDateFormatted || '',
          daysUntilExpiration,
          thresholdMilestone: isUrgent5Days ? 5 : 15,
          policyNumber: record.arlPolicyNumber,
          arlEntityName: record.arlEntityName,
        })
      );
    }
    // 5. Caso Vigente: Certificado cargado, validado y con vigencia superior al umbral de 15 días
    else {
      arlStatus = 'VIGENTE';
      enabledForInPersonWork = true; // RN03: Habilitado para labores presenciales
      isBlockedFromReports = false;
      hasActiveAlert = false;
      alertType = 'SIN_ALERTA';
      alertSeverity = 'NINGUNA';
      alertTitle = 'Cobertura ARL Vigente';
      alertMessage = expirationDateFormatted
        ? `Certificado de ARL validado y vigente hasta el ${expirationDateFormatted} (${daysUntilExpiration} días restantes).`
        : 'Certificado de ARL validado y vigente para el periodo académico activo.';
    }

    return {
      practiceId: record.id,
      studentId: record.studentId,
      studentName: record.student.name,
      studentEmail: record.student.email,
      studentCode: record.student.studentCode,
      documentNumber: record.student.documentNumber,
      program: record.student.program || 'Ingeniería de Sistemas',
      companyId: record.companyId,
      companyName: record.company.businessName,
      companyNit: record.company.nit,
      practiceStatus: record.currentStatus,
      startDate: startDateFormatted,
      arlStatus,
      arlSemaphoreLabel: mapArlStatusToLabel(arlStatus),
      arlSupportUrl: record.arlSupportUrl,
      arlExpirationDate: expirationDateFormatted,
      arlValidatedAt: record.arlValidatedAt ? new Date(record.arlValidatedAt).toISOString() : null,
      arlValidatedById: record.arlValidatedById,
      arlPolicyNumber: record.arlPolicyNumber ?? null,
      arlEntityName: record.arlEntityName ?? null,
      arlRejectionReason: record.arlRejectionReason ?? null,
      daysUntilExpiration,
      businessDaysUntilStart,
      hasActiveAlert,
      alertType,
      alertSeverity,
      alertTitle,
      alertMessage,
      studentBannerMessage,
      coordinatorAlertMessage,
      isBlockedFromReports,
      enabledForInPersonWork,
      notificationsTriggered,
    };
  }

  /**
   * GET /api/v1/practicas/alertas/arl
   * Consulta el listado de practicantes con su semáforo de ARL y alertas activas (Criterio 4)
   */
  async getArlAlerts(
    filters: ArlAlertsFilterDTO = {},
    actor?: AuthenticatedUser | null,
    referenceDate: Date = new Date()
  ): Promise<ArlAlertsQueryResultDTO> {
    if (!actor) {
      throw new ArlAlertError(
        'Debe iniciar sesión para consultar el monitoreo y alertas de ARL',
        'UNAUTHORIZED',
        401
      );
    }

    const effectiveStudentId =
      actor.role === 'ESTUDIANTE' ? actor.id : filters.studentId || undefined;

    const records = await this.repo.findAllPracticesForArlEvaluation({
      studentId: effectiveStudentId,
    });

    const allEvaluated = records.map((r) => this.evaluatePracticeArlState(r, referenceDate));

    // Resumen global (para los contadores del semáforo en el panel de coordinación - Criterio 4)
    const summary = {
      totalEvaluated: allEvaluated.length,
      vigente: allEvaluated.filter((i) => i.arlStatus === 'VIGENTE').length,
      proximoAVencer: allEvaluated.filter((i) => i.arlStatus === 'PROXIMO_A_VENCER').length,
      vencido: allEvaluated.filter((i) => i.arlStatus === 'VENCIDO').length,
      sinAfiliacion: allEvaluated.filter((i) => i.arlStatus === 'SIN_AFILIACION').length,
      pendienteRevision: allEvaluated.filter((i) => i.arlStatus === 'PENDIENTE_REVISION').length,
      activeAlertsCount: allEvaluated.filter((i) => i.hasActiveAlert).length,
      blockedStudentsCount: allEvaluated.filter((i) => i.isBlockedFromReports).length,
      enabledForInPersonCount: allEvaluated.filter((i) => i.enabledForInPersonWork).length,
    };

    // Aplicar filtros de consulta
    let filtered = [...allEvaluated];

    if (filters.onlyActiveAlerts) {
      filtered = filtered.filter((item) => item.hasActiveAlert);
    }

    const normalizedStatus = normalizeArlStatusFilter(filters.status);
    if (normalizedStatus) {
      filtered = filtered.filter((item) => item.arlStatus === normalizedStatus);
    }

    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.studentName.toLowerCase().includes(q) ||
          item.studentEmail.toLowerCase().includes(q) ||
          (item.studentCode && item.studentCode.toLowerCase().includes(q)) ||
          (item.documentNumber && item.documentNumber.toLowerCase().includes(q)) ||
          item.companyName.toLowerCase().includes(q)
      );
    }

    return {
      items: filtered,
      total: filtered.length,
      summary,
      evaluatedAt: referenceDate.toISOString(),
      cronSchedule: ARL_DAILY_CRON_EXPRESSION,
    };
  }

  /**
   * POST /api/v1/estudiantes/[id]/arl/documento
   * Permite la subida del soporte de renovación o afiliación de ARL.
   * RN02: Deja la alerta/estado en "Pendiente de revisión" hasta que el coordinador valide el documento.
   */
  async uploadStudentArlDocument(
    studentId: string,
    dto: UploadArlDocumentDTO,
    actor?: AuthenticatedUser | null,
    referenceDate: Date = new Date()
  ): Promise<UploadArlDocumentResultDTO> {
    if (!actor) {
      throw new ArlAlertError(
        'Debe iniciar sesión para cargar el certificado de afiliación a la ARL',
        'UNAUTHORIZED',
        401
      );
    }

    // Solo el propio estudiante, el coordinador o el administrador pueden subir su ARL
    if (
      actor.role === 'ESTUDIANTE' &&
      actor.id !== studentId
    ) {
      throw new ArlAlertError(
        'No tiene permisos para cargar documentos ARL de otro estudiante',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    if (actor.role === 'TUTOR_EMPRESARIAL' || actor.role === 'DOCENTE_PRACTICA') {
      throw new ArlAlertError(
        'Únicamente el estudiante o la coordinación pueden radicar el soporte de póliza ARL',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const rawUrl = dto.arlSupportUrl || dto.documentUrl;
    const arlSupportUrl = rawUrl ? String(rawUrl).trim() : '';
    if (!arlSupportUrl) {
      throw new ArlAlertError(
        'Debe adjuntar el archivo o URL del certificado de afiliación a la ARL',
        'MISSING_ARL_DOCUMENT',
        400,
        'arlSupportUrl'
      );
    }

    if (!dto.expirationDate) {
      throw new ArlAlertError(
        'La fecha de vencimiento de vigencia de la póliza ARL es obligatoria',
        'MISSING_EXPIRATION_DATE',
        400,
        'expirationDate'
      );
    }

    const parsedExpiration = new Date(dto.expirationDate);
    if (isNaN(parsedExpiration.getTime())) {
      throw new ArlAlertError(
        'La fecha de vigencia proporcionada no tiene un formato válido',
        'INVALID_EXPIRATION_DATE',
        400,
        'expirationDate'
      );
    }

    const practice = await this.repo.findActivePracticeByStudentId(studentId, dto.practiceId);
    if (!practice) {
      throw new ArlAlertError(
        'No se encontró una práctica formativa asociada al estudiante para vincular la póliza ARL',
        'PRACTICE_NOT_FOUND',
        404
      );
    }

    const updatedRecord = await this.repo.saveArlDocumentUpload({
      practiceId: practice.id,
      studentId,
      actorId: actor.id,
      currentPracticeStatus: practice.currentStatus,
      arlSupportUrl,
      arlExpirationDate: parsedExpiration,
      arlPolicyNumber: dto.policyNumber || null,
      arlEntityName: dto.arlEntityName || null,
      observations: dto.observations || null,
    });

    const evaluated = this.evaluatePracticeArlState(updatedRecord, referenceDate);

    return {
      studentId,
      practiceId: practice.id,
      arlStatus: evaluated.arlStatus, // 'PENDIENTE_REVISION' (RN02)
      arlSemaphoreLabel: evaluated.arlSemaphoreLabel, // 'Pendiente de revisión'
      arlSupportUrl: evaluated.arlSupportUrl || arlSupportUrl,
      arlExpirationDate: evaluated.arlExpirationDate || parsedExpiration.toISOString().split('T')[0],
      arlPolicyNumber: evaluated.arlPolicyNumber,
      arlEntityName: evaluated.arlEntityName,
      enabledForInPersonWork: evaluated.enabledForInPersonWork,
      isBlockedFromReports: evaluated.isBlockedFromReports,
      message:
        'Certificado de ARL cargado exitosamente. El estado de la alerta ha quedado en "Pendiente de revisión" hasta que el coordinador valide la autenticidad del documento (RN02).',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * PATCH /api/v1/estudiantes/[id]/arl/validar
   * Permite al coordinador aprobar o rechazar la póliza subida (RN02)
   */
  async validateStudentArlDocument(
    studentId: string,
    dto: ValidateArlDocumentDTO,
    actor?: AuthenticatedUser | null,
    referenceDate: Date = new Date()
  ): Promise<ValidateArlDocumentResultDTO> {
    if (!actor) {
      throw new ArlAlertError(
        'Debe iniciar sesión para validar certificados de ARL',
        'UNAUTHORIZED',
        401
      );
    }

    if (actor.role !== 'DIRECTOR_PROGRAMA' && actor.role !== 'ADMIN') {
      throw new ArlAlertError(
        'Acceso restringido: Solo el Coordinador de Prácticas o Administrador puede aprobar o rechazar pólizas de ARL (RN02)',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    if (typeof dto.approved !== 'boolean') {
      throw new ArlAlertError(
        'Debe indicar explícitamente si aprueba (approved: true) o rechaza (approved: false) la póliza ARL',
        'INVALID_VALIDATION_DECISION',
        400,
        'approved'
      );
    }

    if (!dto.approved && (!dto.rejectionReason || dto.rejectionReason.trim().length < 5)) {
      throw new ArlAlertError(
        'Al rechazar la póliza ARL debe especificar el motivo de rechazo (mínimo 5 caracteres)',
        'MISSING_REJECTION_REASON',
        400,
        'rejectionReason'
      );
    }

    const practice = await this.repo.findActivePracticeByStudentId(studentId, dto.practiceId);
    if (!practice) {
      throw new ArlAlertError(
        'No se encontró una práctica formativa asociada al estudiante',
        'PRACTICE_NOT_FOUND',
        404
      );
    }

    if (dto.approved && !practice.arlSupportUrl) {
      throw new ArlAlertError(
        'No es posible aprobar la cobertura ARL porque el estudiante no ha cargado ningún documento soporte',
        'NO_ARL_DOCUMENT_TO_VALIDATE',
        422
      );
    }

    const targetExpiration = dto.expirationDate
      ? new Date(dto.expirationDate)
      : practice.arlExpirationDate
      ? new Date(practice.arlExpirationDate)
      : new Date(referenceDate.getTime() + 180 * 24 * 60 * 60 * 1000);

    const updatedRecord = await this.repo.saveArlValidationResult({
      practiceId: practice.id,
      actorId: actor.id,
      currentPracticeStatus: practice.currentStatus,
      approved: dto.approved,
      arlSupportUrl: practice.arlSupportUrl,
      arlExpirationDate: targetExpiration,
      arlPolicyNumber: practice.arlPolicyNumber,
      arlEntityName: practice.arlEntityName,
      rejectionReason: dto.approved ? null : dto.rejectionReason?.trim() || null,
      observations: dto.observations || null,
    });

    const evaluated = this.evaluatePracticeArlState(updatedRecord, referenceDate);

    return {
      studentId,
      practiceId: practice.id,
      approved: dto.approved,
      arlStatus: evaluated.arlStatus,
      arlSemaphoreLabel: evaluated.arlSemaphoreLabel,
      arlSupportUrl: evaluated.arlSupportUrl,
      arlExpirationDate: evaluated.arlExpirationDate,
      arlValidatedAt: evaluated.arlValidatedAt,
      arlValidatedById: evaluated.arlValidatedById,
      arlRejectionReason: evaluated.arlRejectionReason,
      enabledForInPersonWork: evaluated.enabledForInPersonWork,
      isBlockedFromReports: evaluated.isBlockedFromReports,
      message: dto.approved
        ? `Póliza ARL validada y aprobada exitosamente. Estado actual: "${evaluated.arlSemaphoreLabel}".`
        : `Póliza ARL rechazada. El estudiante ha sido notificado para cargar un nuevo certificado válido.`,
    };
  }

  /**
   * RN01 & Criterio 3: Proceso Batch / Job Programado de Evaluación Diaria (00:00 hrs)
   * Revisa todas las prácticas, actualiza a "Vencido" las pólizas caducadas,
   * bloquea el registro de bitácoras y genera las notificaciones por correo electrónico.
   */
  async runDailyArlAlertsBatchJob(
    referenceDate: Date = new Date(),
    actorId?: string | null
  ): Promise<ArlDailyCheckSummaryDTO> {
    const records = await this.repo.findAllPracticesForArlEvaluation();
    const evaluatedItems: ArlStudentAlertItemDTO[] = [];
    const allNotifications: ArlNotificationPayload[] = [];

    let expiredBlockedCount = 0;
    let preventivePreStartCount = 0;
    let upcomingExpirationCount = 0;
    let pendingReviewCount = 0;

    for (const record of records) {
      const evaluated = this.evaluatePracticeArlState(record, referenceDate);
      evaluatedItems.push(evaluated);

      if (evaluated.arlStatus === 'VENCIDO') {
        expiredBlockedCount++;
        // Persistir cambio a estado "Vencido" si no estaba marcado previamente
        if (record.arlStatus !== 'VENCIDO') {
          await this.repo.recordExpiredArlFromPeriodicCheck({
            practiceId: record.id,
            currentPracticeStatus: record.currentStatus,
            arlSupportUrl: record.arlSupportUrl,
            arlExpirationDate: evaluated.arlExpirationDate,
            arlPolicyNumber: record.arlPolicyNumber,
            arlEntityName: record.arlEntityName,
            coordinatorId: actorId || record.arlValidatedById || record.studentId,
          });
        }
      } else if (evaluated.alertType === 'FALTA_AFILIACION_PRE_INICIO') {
        preventivePreStartCount++;
      } else if (
        evaluated.alertType === 'PROXIMO_VENCIMIENTO_15_DIAS' ||
        evaluated.alertType === 'PROXIMO_VENCIMIENTO_5_DIAS'
      ) {
        upcomingExpirationCount++;
      } else if (evaluated.arlStatus === 'PENDIENTE_REVISION') {
        pendingReviewCount++;
      }

      if (evaluated.notificationsTriggered.length > 0) {
        allNotifications.push(...evaluated.notificationsTriggered);
      }
    }

    return {
      jobName: 'SIGETRAP_DAILY_ARL_MONITOR_JOB',
      cronExpression: ARL_DAILY_CRON_EXPRESSION,
      executedAt: referenceDate.toISOString(),
      totalPracticesEvaluated: evaluatedItems.length,
      alertsGenerated: evaluatedItems.filter((i) => i.hasActiveAlert).length,
      expiredBlockedCount,
      preventivePreStartCount,
      upcomingExpirationCount,
      pendingReviewCount,
      emailsSentCount: allNotifications.length,
      notifications: allNotifications,
      items: evaluatedItems,
    };
  }

  /**
   * Criterio 3: Verifica si una práctica tiene restricción para radicar bitácoras o informes de avance por ARL vencida
   */
  async assertPracticeArlAllowsReports(
    practiceOrId: string | any,
    referenceDate: Date = new Date()
  ): Promise<void> {
    let record: PracticeArlRecord | null = null;

    if (typeof practiceOrId === 'string') {
      record = await this.repo.findPracticeById(practiceOrId);
    } else if (practiceOrId && typeof practiceOrId === 'object') {
      // Si el objeto ya incluye metadatos explícitos de ARL (por ejemplo en pruebas unitarias o entidad hidratada)
      if (
        practiceOrId.arlExpirationDate !== undefined ||
        practiceOrId.arlStatus !== undefined ||
        Array.isArray(practiceOrId.statusHistory)
      ) {
        record = this.repo.extractHydratedArlRecord(practiceOrId);
      } else if (practiceOrId.id) {
        record = await this.repo.findPracticeById(practiceOrId.id);
      }
    }

    if (!record) return;

    // Evaluar si la ARL tenía una fecha de vigencia que ya expiró o fue marcada como VENCIDO (Criterio 3)
    const daysUntilExpiration = record.arlExpirationDate
      ? calculateCalendarDaysUntil(referenceDate, record.arlExpirationDate)
      : null;

    const isExpired =
      record.arlStatus === 'VENCIDO' ||
      (daysUntilExpiration !== null && daysUntilExpiration < 0 && record.arlStatus !== 'PENDIENTE_REVISION');

    if (isExpired) {
      throw new ArlAlertError(
        'Registro restringido (Criterio 3): La vigencia de su afiliación a la ARL se encuentra VENCIDA. No es posible registrar bitácoras ni informes de avance hasta cargar la nueva constancia de renovación.',
        'ARL_EXPIRED_BLOCK',
        403,
        'arlExpirationDate'
      );
    }
  }
}

let arlAlertServiceInstance: ArlAlertService | null = null;

export function getArlAlertService(): ArlAlertService {
  if (!arlAlertServiceInstance) {
    arlAlertServiceInstance = new ArlAlertService();
  }
  return arlAlertServiceInstance;
}

export function setArlAlertServiceInstance(instance: ArlAlertService | null): void {
  arlAlertServiceInstance = instance;
}
