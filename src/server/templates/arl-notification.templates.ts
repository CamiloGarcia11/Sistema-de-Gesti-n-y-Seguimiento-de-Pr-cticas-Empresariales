// ==============================================================================
// SIGETRAP - Plantillas Oficiales de Notificación de Alertas Automáticas de ARL
// Módulo: Monitoreo y Seguimiento de Cobertura de Riesgos Laborales (ARL)
// Plantillas Requeridas:
//   1. Plantilla para recordatorio de renovación preventiva (Próximo Vencimiento 15 / 5 días)
//   2. Plantilla para notificación crítica por caducidad (Vencido) o ausencia de documento (Pre-inicio)
// ==============================================================================

import { ArlNotificationPayload } from '@/types';

export interface PreventiveRenewalTemplateInput {
  recipientEmail: string;
  recipientRole: 'ESTUDIANTE' | 'DIRECTOR_PROGRAMA';
  studentName: string;
  studentCode?: string | null;
  companyName: string;
  expirationDate: string;
  daysUntilExpiration: number;
  thresholdMilestone: 15 | 5 | number;
  policyNumber?: string | null;
  arlEntityName?: string | null;
}

export interface CriticalArlAlertTemplateInput {
  recipientEmail: string;
  recipientRole: 'ESTUDIANTE' | 'DIRECTOR_PROGRAMA';
  studentName: string;
  studentCode?: string | null;
  companyName: string;
  reason: 'CADUCIDAD_VIGENCIA' | 'AUSENCIA_AFILIACION_PRE_INICIO';
  expirationDate?: string | null;
  startDate?: string | null;
  businessDaysUntilStart?: number | null;
}

/**
 * 1. Plantilla para recordatorio de renovación preventiva (Criterio 2)
 * Se dispara automáticamente cuando el tiempo restante de vigencia alcanza los umbrales (ej. 15 días y 5 días antes de vencer).
 */
export function buildPreventiveRenewalNotification(
  input: PreventiveRenewalTemplateInput
): ArlNotificationPayload {
  const urgencyLabel = input.daysUntilExpiration <= 5 ? 'URGENTE (Umbral 5 días)' : 'PREVENTIVO (Umbral 15 días)';
  const subject = `[SIGETRAP - ARL ${urgencyLabel}] Recordatorio de Renovación de Póliza ARL (${input.daysUntilExpiration} día(s) restantes) - ${input.studentName}`;

  const textBody = [
    `UNIVERSIDAD FRANCISCO DE PAULA SANTANDER - SIGETRAP`,
    `ALERTA AUTOMÁTICA DE PRÓXIMO VENCIMIENTO DE VIGENCIA ARL (${urgencyLabel})`,
    ``,
    `Estudiante: ${input.studentName} (${input.studentCode || 'Sin código'})`,
    `Empresa Receptora: ${input.companyName}`,
    `Entidad ARL / Póliza: ${input.arlEntityName || 'ARL Registrada'} ${input.policyNumber ? `- N° ${input.policyNumber}` : ''}`,
    `Fecha de Vencimiento de Cobertura: ${input.expirationDate}`,
    `Tiempo Restante de Vigencia: ${input.daysUntilExpiration} día(s)`,
    ``,
    `Acción Requerida:`,
    `El certificado de afiliación a Riesgos Laborales (ARL) se encuentra próximo a vencer.`,
    `Solicitamos cargar oportunamente el nuevo soporte de renovación en el panel del estudiante de SIGETRAP para validación de la Coordinación de Prácticas y evitar la suspensión del registro de bitácoras e informes de avance.`,
  ].join('\n');

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #f59e0b; overflow: hidden;">
    <div style="background-color: #d97706; color: #ffffff; padding: 16px 24px;">
      <p style="margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
        SIGETRAP • Monitoreo Automático de Cobertura ARL
      </p>
      <h2 style="margin: 6px 0 0; font-size: 18px;">
        Recordatorio Preventivo de Renovación de ARL (${input.daysUntilExpiration} día(s) restantes)
      </h2>
    </div>
    <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
      <p>Estimado(a) <strong>${input.recipientRole === 'ESTUDIANTE' ? input.studentName : 'Coordinador(a) de Prácticas'}</strong>,</p>
      <p>
        El sistema de monitoreo automático de SIGETRAP ha detectado que la afiliación a Riesgos Laborales (ARL) alcanzó el umbral de alerta preventiva (<strong>${urgencyLabel}</strong>):
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #fffbeb; border-radius: 8px; padding: 12px;">
        <tr>
          <td style="padding: 8px 12px; font-weight: bold;">Estudiante:</td>
          <td style="padding: 8px 12px;">${input.studentName} (${input.studentCode || 'N/A'})</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold;">Empresa Receptora:</td>
          <td style="padding: 8px 12px;">${input.companyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold;">Fecha de Vencimiento:</td>
          <td style="padding: 8px 12px; color: #b45309; font-weight: bold;">${input.expirationDate} (${input.daysUntilExpiration} día(s) restantes)</td>
        </tr>
      </table>
      <p>
        Por favor radique el soporte de renovación en el módulo de prácticas antes de la fecha de expiración. Una vez cargado, quedará en estado <strong>Pendiente de revisión</strong> hasta la validación de Coordinación (RN02).
      </p>
    </div>
  </div>
</body>
</html>`.trim();

  return {
    recipientEmail: input.recipientEmail,
    recipientRole: input.recipientRole,
    subject,
    templateType: 'PREVENTIVE_RENEWAL',
    htmlBody,
    textBody,
    sentAt: new Date().toISOString(),
  };
}

/**
 * 2. Plantilla para notificación crítica por caducidad o ausencia de documento (Criterio 1 y Criterio 3)
 * Se dispara cuando la póliza ARL ha expirado ("Vencido") o cuando faltan <= X días hábiles para el inicio sin ARL validada.
 */
export function buildCriticalArlAlertNotification(
  input: CriticalArlAlertTemplateInput
): ArlNotificationPayload {
  const isExpired = input.reason === 'CADUCIDAD_VIGENCIA';
  const subject = isExpired
    ? `[SIGETRAP - ALERTA CRÍTICA ARL VENCIDA] Suspensión de Actividades y Bitácoras - ${input.studentName}`
    : `[SIGETRAP - ALERTA PREVENTIVA SIN ARL] Práctica próxima a iniciar sin cobertura ARL - ${input.studentName}`;

  const actionDetail = isExpired
    ? `La vigencia de la afiliación a ARL expiró el ${input.expirationDate || 'N/A'}. El indicador de ARL ha cambiado a estado "Vencido", el estudiante NO figura habilitado para labores presenciales (RN03) y se ha restringido el registro de bitácoras e informes de avance hasta cargar y validar la nueva constancia.`
    : `Faltan ${input.businessDaysUntilStart ?? 0} día(s) hábil(es) para la fecha de inicio programada (${input.startDate || 'Próxima'}) y no existe certificado de ARL cargado y validado. La práctica empresarial NO puede iniciar sin cobertura legal de riesgos laborales.`;

  const textBody = [
    `UNIVERSIDAD FRANCISCO DE PAULA SANTANDER - SIGETRAP`,
    isExpired
      ? `NOTIFICACIÓN CRÍTICA POR CADUCIDAD DE PÓLIZA ARL (ESTADO: VENCIDO)`
      : `ALERTA POR AUSENCIA DE AFILIACIÓN ARL ANTES DEL INICIO DE PRÁCTICA`,
    ``,
    `Estudiante: ${input.studentName} (${input.studentCode || 'Sin código'})`,
    `Empresa Receptora: ${input.companyName}`,
    `Estado ARL: ${isExpired ? 'Vencido' : 'Sin Afiliación / No Validado'}`,
    `Habilitado para Labores Presenciales (RN03): NO`,
    ``,
    `Detalle de la Restricción Legal:`,
    actionDetail,
  ].join('\n');

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #dc2626; overflow: hidden;">
    <div style="background-color: #b91c1c; color: #ffffff; padding: 16px 24px;">
      <p style="margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
        SIGETRAP • Alerta Legal de Riesgos Laborales (ARL)
      </p>
      <h2 style="margin: 6px 0 0; font-size: 18px;">
        ${isExpired ? 'Alerta Crítica: Afiliación ARL Vencida' : 'Alerta Preventiva: Falta de Afiliación ARL antes del Inicio'}
      </h2>
    </div>
    <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
      <p>Estimado(a) <strong>${input.recipientRole === 'ESTUDIANTE' ? input.studentName : 'Coordinador(a) de Prácticas'}</strong>,</p>
      <p>${actionDetail}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #fef2f2; border-radius: 8px; padding: 12px;">
        <tr>
          <td style="padding: 8px 12px; font-weight: bold;">Estudiante:</td>
          <td style="padding: 8px 12px;">${input.studentName} (${input.studentCode || 'N/A'})</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold;">Empresa Receptora:</td>
          <td style="padding: 8px 12px;">${input.companyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold;">Indicador ARL:</td>
          <td style="padding: 8px 12px; color: #b91c1c; font-weight: bold;">${isExpired ? 'Vencido (Bitácoras restringidas)' : 'Sin Afiliación Validada'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold;">Habilitación Presencial (RN03):</td>
          <td style="padding: 8px 12px; color: #b91c1c; font-weight: bold;">NO HABILITADO</td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`.trim();

  return {
    recipientEmail: input.recipientEmail,
    recipientRole: input.recipientRole,
    subject,
    templateType: 'CRITICAL_EXPIRATION_OR_MISSING',
    htmlBody,
    textBody,
    sentAt: new Date().toISOString(),
  };
}
