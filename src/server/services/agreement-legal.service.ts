// ==============================================================================
// SIGETRAP - Servicio de Prerrequisitos Documentales y Revisión Jurídica UFPS
// Capa de Servicios (RNF11)
// Criterios de Aceptación:
//   - Criterio 1: Carga y validación de 3 paquetes documentales obligatorios
//   - Criterio 2: Transición a estado PENDIENTE_JURIDICA_UFPS
//   - Criterio 3: Emisión de visto bueno (APROBADO_JURIDICA / VIGENTE) o devolución (OBSERVADO_JURIDICA)
// Reglas de Negocio:
//   - RN01: Bloqueo de formalización anticipada de prácticas sin visto bueno final de Jurídica
//   - RN02: Vigencia de antecedentes legales y fiscales <= 30 días calendario al momento de radicación
//   - RN03: Trazabilidad de conceptos (fecha, radicado interno y observaciones obligatorias)
// ==============================================================================

import crypto from 'crypto';
import {
  AgreementRepository,
  agreementRepository,
} from '@/server/repositories/agreement.repository';
import {
  CompanyRepository,
  companyRepository,
} from '@/server/repositories/company.repository';
import {
  AgreementPrerequisiteDocumentType,
  AgreementPrerequisiteItemDTO,
  AgreementResponseDTO,
  AgreementStatus,
  AuthenticatedUser,
  CreateAgreementDTO,
  JuridicaDecisionType,
  JuridicaDictamenDTO,
  JuridicaHistoryEntryDTO,
  REQUIRED_AGREEMENT_PREREQUISITES,
  SendToJuridicaDTO,
  UploadPrerequisiteInputDTO,
} from '@/types';

export const ANTECEDENTES_MAX_AGE_DAYS = 30;

export class AgreementLegalError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'AGREEMENT_LEGAL_ERROR',
    statusCode: number = 422,
    field?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgreementLegalError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    this.details = details;
  }
}

const DOCUMENT_TYPE_ALIASES: Record<string, AgreementPrerequisiteDocumentType> = {
  BORRADOR_MINUTA: 'BORRADOR_MINUTA',
  MINUTA: 'BORRADOR_MINUTA',
  BORRADOR: 'BORRADOR_MINUTA',
  BORRADOR_DE_MINUTA: 'BORRADOR_MINUTA',
  MINUTA_CONVENIO: 'BORRADOR_MINUTA',
  REPRESENTANTE_DIRECTIVA: 'REPRESENTANTE_DIRECTIVA',
  REPRESENTANTE_LEGAL: 'REPRESENTANTE_DIRECTIVA',
  REPRESENTANTE_Y_DIRECTIVA: 'REPRESENTANTE_DIRECTIVA',
  DOCUMENTOS_REPRESENTANTE: 'REPRESENTANTE_DIRECTIVA',
  EXISTENCIA_REPRESENTACION: 'REPRESENTANTE_DIRECTIVA',
  CAMARA_COMERCIO: 'REPRESENTANTE_DIRECTIVA',
  ANTECEDENTES_LEGALES: 'ANTECEDENTES_LEGALES',
  ANTECEDENTES: 'ANTECEDENTES_LEGALES',
  ANTECEDENTES_LEGALES_FISCALES: 'ANTECEDENTES_LEGALES',
  ANTECEDENTES_DISCIPLINARIOS: 'ANTECEDENTES_LEGALES',
  CERTIFICADOS_ANTECEDENTES: 'ANTECEDENTES_LEGALES',
};

const WORD_AND_PDF_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const GENERAL_ALLOWED_MIME_TYPES = [
  ...WORD_AND_PDF_MIME_TYPES,
  'image/png',
  'image/jpeg',
  'image/webp',
];

const WORD_AND_PDF_EXTS = ['.pdf', '.doc', '.docx'];
const GENERAL_ALLOWED_EXTS = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp'];

export function normalizePrerequisiteDocumentType(
  raw: string
): AgreementPrerequisiteDocumentType | null {
  const key = (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return DOCUMENT_TYPE_ALIASES[key] || null;
}

export function calculateCalendarDaysElapsed(
  issuedAt: Date,
  referenceDate: Date = new Date()
): number {
  const issuedDayUtc = Date.UTC(
    issuedAt.getUTCFullYear(),
    issuedAt.getUTCMonth(),
    issuedAt.getUTCDate()
  );
  const refDayUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  );
  return Math.floor((refDayUtc - issuedDayUtc) / (1000 * 60 * 60 * 24));
}

function extractExtensionFromUrlOrName(fileUrl?: string | null, fileName?: string | null): string | null {
  const candidate = (fileName || fileUrl || '').split('?')[0].split('#')[0].trim().toLowerCase();
  const lastDot = candidate.lastIndexOf('.');
  if (lastDot === -1) return null;
  const ext = candidate.slice(lastDot);
  if (ext.length > 6 || ext.includes('/')) return null;
  return ext;
}

function isValidDocumentUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    /^https?:\/\/.+/i.test(trimmed) ||
    /^\/uploads\/.+/i.test(trimmed) ||
    /^blob:.+/i.test(trimmed) ||
    /^data:(application|image)\/.+/i.test(trimmed)
  );
}

export class AgreementLegalService {
  constructor(
    private agreementRepo: AgreementRepository = agreementRepository,
    private companyRepo: CompanyRepository = companyRepository
  ) {}

  private assertCoordinatorOrAdmin(actor?: AuthenticatedUser | null, actionDesc: string = 'ejecutar esta operación'): AuthenticatedUser {
    if (!actor || !actor.id) {
      throw new AgreementLegalError(
        `Debe iniciar sesión para ${actionDesc}`,
        'UNAUTHORIZED',
        401
      );
    }

    if (actor.role !== 'DIRECTOR_PROGRAMA' && actor.role !== 'ADMIN') {
      throw new AgreementLegalError(
        `Únicamente el Coordinador de Prácticas / Encargado de Convenios o Administrador puede ${actionDesc}`,
        'FORBIDDEN_OPERATION',
        403
      );
    }

    return actor;
  }

  private assertCanUploadPrerequisites(
    actor: AuthenticatedUser | null | undefined,
    agreementCompanyId: string
  ): AuthenticatedUser {
    if (!actor || !actor.id) {
      throw new AgreementLegalError(
        'Debe iniciar sesión para cargar prerrequisitos documentales del convenio',
        'UNAUTHORIZED',
        401
      );
    }

    if (actor.role === 'DIRECTOR_PROGRAMA' || actor.role === 'ADMIN') {
      return actor;
    }

    if (actor.role === 'TUTOR_EMPRESARIAL' && actor.companyId === agreementCompanyId) {
      return actor;
    }

    throw new AgreementLegalError(
      'No tiene autorización para cargar documentos de soporte en este convenio',
      'FORBIDDEN_OPERATION',
      403
    );
  }

  /**
   * Lista los convenios registrados con su expediente jurídico y checklist
   */
  async listAgreements(
    params: { companyId?: string; status?: string; search?: string } = {},
    actor?: AuthenticatedUser | null
  ): Promise<AgreementResponseDTO[]> {
    if (!actor || !actor.id) {
      throw new AgreementLegalError(
        'Debe iniciar sesión para consultar el panel de convenios',
        'UNAUTHORIZED',
        401
      );
    }

    const effectiveCompanyId =
      actor.role === 'TUTOR_EMPRESARIAL' && actor.companyId
        ? actor.companyId
        : params.companyId;

    const agreements = await this.agreementRepo.findMany({
      companyId: effectiveCompanyId,
      status: params.status,
      search: params.search,
    });

    return agreements.map((ag: any) => this.mapAgreementToDTO(ag));
  }

  /**
   * Crea una postulación inicial de convenio en estado BORRADOR
   */
  async createAgreementDraft(
    dto: CreateAgreementDTO,
    actor?: AuthenticatedUser | null
  ): Promise<AgreementResponseDTO> {
    if (!actor || !actor.id) {
      throw new AgreementLegalError(
        'Debe iniciar sesión para radicar una solicitud de convenio',
        'UNAUTHORIZED',
        401
      );
    }

    if (
      actor.role !== 'DIRECTOR_PROGRAMA' &&
      actor.role !== 'ADMIN' &&
      actor.role !== 'TUTOR_EMPRESARIAL'
    ) {
      throw new AgreementLegalError(
        'No tiene permisos para iniciar solicitudes de convenio empresarial',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const companyId =
      actor.role === 'TUTOR_EMPRESARIAL' && actor.companyId
        ? actor.companyId
        : (dto.companyId || '').trim();

    if (!companyId) {
      throw new AgreementLegalError(
        'Debe especificar la empresa receptora para iniciar el trámite de convenio',
        'MISSING_COMPANY_ID',
        422,
        'companyId'
      );
    }

    const company = await this.companyRepo.findById(companyId);
    if (!company || (company as any).deletedAt) {
      throw new AgreementLegalError(
        'La empresa receptora especificada no existe en el sistema',
        'COMPANY_NOT_FOUND',
        404,
        'companyId'
      );
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = dto.endDate
      ? new Date(dto.endDate)
      : new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      throw new AgreementLegalError(
        'Las fechas de vigencia del convenio son inválidas (la fecha fin debe ser posterior a la fecha inicio)',
        'INVALID_DATE_RANGE',
        422,
        'endDate'
      );
    }

    const cleanNit = (company.nit || 'EMP').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
    const suffix = Date.now().toString().slice(-4);
    const agreementNumber =
      dto.agreementNumber?.trim() ||
      `CONV-UFPS-${new Date().getFullYear()}-${cleanNit}-${suffix}`;

    const created = await this.agreementRepo.create({
      companyId,
      agreementNumber,
      status: 'BORRADOR',
      startDate,
      endDate,
      documentUrl: dto.documentUrl ?? null,
      signedByDirector: false,
      notes:
        dto.notes?.trim() ||
        'Solicitud de convenio radicada en borrador pendiente de carga de prerrequisitos y revisión de Jurídica UFPS.',
    });

    return this.mapAgreementToDTO(created);
  }

  /**
   * Consulta el detalle completo de un convenio con su expediente de prerrequisitos
   */
  async getAgreementDetails(
    agreementId: string,
    actor?: AuthenticatedUser | null
  ): Promise<AgreementResponseDTO> {
    if (!actor || !actor.id) {
      throw new AgreementLegalError(
        'Debe iniciar sesión para consultar el expediente del convenio',
        'UNAUTHORIZED',
        401
      );
    }

    const agreement = await this.agreementRepo.findById(agreementId);
    if (!agreement || (agreement as any).deletedAt) {
      throw new AgreementLegalError(
        'El convenio especificado no fue encontrado',
        'AGREEMENT_NOT_FOUND',
        404
      );
    }

    return this.mapAgreementToDTO(agreement);
  }

  /**
   * Criterio 1 & RN02: Carga y valida uno o varios prerrequisitos documentales de un convenio
   */
  async uploadPrerequisites(
    agreementId: string,
    inputs: UploadPrerequisiteInputDTO[],
    actor?: AuthenticatedUser | null,
    referenceDate: Date = new Date()
  ): Promise<{
    agreement: AgreementResponseDTO;
    uploaded: AgreementPrerequisiteItemDTO[];
    message: string;
  }> {
    const agreement = await this.agreementRepo.findById(agreementId);
    if (!agreement || (agreement as any).deletedAt) {
      throw new AgreementLegalError(
        'El convenio especificado no existe en el sistema',
        'AGREEMENT_NOT_FOUND',
        404
      );
    }

    const validActor = this.assertCanUploadPrerequisites(actor, agreement.companyId);

    const editableStatuses: AgreementStatus[] = [
      'BORRADOR',
      'EN_TRAMITE',
      'OBSERVADO_JURIDICA',
    ];
    if (!editableStatuses.includes(agreement.status as AgreementStatus)) {
      throw new AgreementLegalError(
        `No es posible cargar o modificar prerrequisitos cuando el convenio se encuentra en estado '${agreement.status}'.`,
        'INVALID_STATUS_FOR_UPLOAD',
        409
      );
    }

    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new AgreementLegalError(
        'Debe proporcionar al menos un documento prerrequisito para cargar al expediente del convenio',
        'EMPTY_PREREQUISITES_PAYLOAD',
        422
      );
    }

    const uploadedItems: any[] = [];

    for (const item of inputs) {
      const normalizedType = normalizePrerequisiteDocumentType(item.documentType);
      if (!normalizedType) {
        throw new AgreementLegalError(
          `Tipo de documento prerrequisito no reconocido ('${item.documentType}'). Valores permitidos: BORRADOR_MINUTA, REPRESENTANTE_DIRECTIVA, ANTECEDENTES_LEGALES.`,
          'INVALID_DOCUMENT_TYPE',
          422,
          'documentType'
        );
      }

      const fileUrl = (item.fileUrl || '').trim();
      if (!fileUrl || !isValidDocumentUrl(fileUrl)) {
        throw new AgreementLegalError(
          `La URL o ruta del archivo para '${normalizedType}' es obligatoria y debe tener un formato válido`,
          'INVALID_FILE_URL',
          422,
          'fileUrl'
        );
      }

      const ext = extractExtensionFromUrlOrName(fileUrl, item.fileName);
      const mime = (item.mimeType || '').trim().toLowerCase();

      if (normalizedType === 'BORRADOR_MINUTA') {
        const invalidMime = mime && !WORD_AND_PDF_MIME_TYPES.includes(mime);
        const invalidExt = ext && !WORD_AND_PDF_EXTS.includes(ext);
        if (invalidMime || invalidExt) {
          throw new AgreementLegalError(
            'Criterio 1: El borrador diligenciado de la minuta del convenio debe estar en formato PDF o Word (.pdf, .doc, .docx).',
            'INVALID_FILE_FORMAT',
            422,
            'fileUrl'
          );
        }
      } else {
        const invalidMime = mime && !GENERAL_ALLOWED_MIME_TYPES.includes(mime);
        const invalidExt = ext && !GENERAL_ALLOWED_EXTS.includes(ext);
        if (invalidMime || invalidExt) {
          throw new AgreementLegalError(
            `Formato de archivo no permitido para '${normalizedType}'. Solo se aceptan documentos PDF, Word o imágenes (PNG/JPG).`,
            'INVALID_FILE_FORMAT',
            422,
            'fileUrl'
          );
        }
      }

      let issuedAtDate: Date | null = null;
      if (item.issuedAt) {
        issuedAtDate = new Date(item.issuedAt);
        if (isNaN(issuedAtDate.getTime())) {
          throw new AgreementLegalError(
            `La fecha de expedición suministrada para '${normalizedType}' no es válida`,
            'INVALID_ISSUED_DATE',
            422,
            'issuedAt'
          );
        }
      }

      // RN02: Vigencia <= 30 días calendario para certificados de antecedentes legales y fiscales
      if (normalizedType === 'ANTECEDENTES_LEGALES') {
        if (!issuedAtDate) {
          throw new AgreementLegalError(
            'RN02: Debe registrar la fecha de expedición de los certificados de antecedentes legales y fiscales para validar su vigencia máxima de 30 días calendario.',
            'MISSING_ISSUED_DATE',
            422,
            'issuedAt'
          );
        }

        const elapsedDays = calculateCalendarDaysElapsed(issuedAtDate, referenceDate);
        if (elapsedDays < -1) {
          throw new AgreementLegalError(
            'RN02: La fecha de expedición de los antecedentes legales no puede ser una fecha futura.',
            'FUTURE_ISSUED_DATE',
            422,
            'issuedAt'
          );
        }

        if (elapsedDays > ANTECEDENTES_MAX_AGE_DAYS) {
          throw new AgreementLegalError(
            `RN02: Los certificados de antecedentes legales, disciplinarios y fiscales tienen ${elapsedDays} días calendario desde su expedición, superando el límite permitido de ${ANTECEDENTES_MAX_AGE_DAYS} días calendario al momento de su radicación.`,
            'RN02_ANTECEDENTES_VENCIDOS',
            422,
            'issuedAt',
            { elapsedDays, maxAllowedDays: ANTECEDENTES_MAX_AGE_DAYS }
          );
        }
      }

      const saved = await this.agreementRepo.upsertPrerequisite({
        agreementId,
        documentType: normalizedType,
        fileUrl,
        fileName: item.fileName ?? null,
        mimeType: item.mimeType ?? null,
        issuedAt: issuedAtDate,
        verificationStatus: 'PENDIENTE',
        observations: item.observations ?? null,
        uploadedById: validActor.id,
      });

      uploadedItems.push(saved);

      // Si es el borrador de minuta, actualizar también documentUrl de referencia si no existe
      if (normalizedType === 'BORRADOR_MINUTA') {
        await this.agreementRepo.update(agreementId, {
          documentUrl: fileUrl,
        });
      }
    }

    const updatedAgreement = await this.agreementRepo.findById(agreementId);
    const mapped = this.mapAgreementToDTO(updatedAgreement, referenceDate);

    return {
      agreement: mapped,
      uploaded: mapped.prerequisites.filter((p) =>
        uploadedItems.some((u) => u.documentType === p.documentType)
      ),
      message: `Se cargaron ${uploadedItems.length} documento(s) prerrequisito al expediente del convenio.`,
    };
  }

  /**
   * Criterio 2: Transición del convenio al estado PENDIENTE_JURIDICA_UFPS
   * Exige los 3 paquetes documentales obligatorios cargados y antecedentes <= 30 días (RN02).
   */
  async sendToJuridica(
    agreementId: string,
    dto: SendToJuridicaDTO = {},
    actor?: AuthenticatedUser | null,
    referenceDate: Date = new Date()
  ): Promise<{
    agreement: AgreementResponseDTO;
    previousStatus: AgreementStatus;
    currentStatus: AgreementStatus;
    message: string;
  }> {
    const validActor = this.assertCoordinatorOrAdmin(
      actor,
      'remitir el expediente del convenio a Jurídica UFPS'
    );

    const agreement = await this.agreementRepo.findById(agreementId);
    if (!agreement || (agreement as any).deletedAt) {
      throw new AgreementLegalError(
        'El convenio especificado no fue encontrado',
        'AGREEMENT_NOT_FOUND',
        404
      );
    }

    const previousStatus = agreement.status as AgreementStatus;
    const allowedOriginStatuses: AgreementStatus[] = [
      'BORRADOR',
      'EN_TRAMITE',
      'OBSERVADO_JURIDICA',
    ];

    if (!allowedOriginStatuses.includes(previousStatus)) {
      throw new AgreementLegalError(
        `El convenio en estado '${previousStatus}' no puede remitirse a Jurídica UFPS. Solo se permite desde BORRADOR, EN_TRAMITE u OBSERVADO_JURIDICA.`,
        'INVALID_STATE_TRANSITION',
        400
      );
    }

    const dtoBeforeSend = this.mapAgreementToDTO(agreement, referenceDate);

    // Criterio 1 & 2: Validar que los 3 paquetes documentales estén completos
    if (!dtoBeforeSend.checklist.allRequiredUploaded) {
      const labels: Record<AgreementPrerequisiteDocumentType, string> = {
        BORRADOR_MINUTA: 'Borrador diligenciado de la minuta del convenio (PDF/Word)',
        REPRESENTANTE_DIRECTIVA: 'Cédula y nombramiento del representante legal / composición directiva',
        ANTECEDENTES_LEGALES: 'Certificados de antecedentes legales, judiciales y fiscales vigentes',
      };
      const missingText = dtoBeforeSend.checklist.missingDocuments
        .map((m) => labels[m])
        .join('; ');

      throw new AgreementLegalError(
        `No se puede remitir el expediente a Jurídica UFPS porque faltan prerrequisitos documentales obligatorios: ${missingText}.`,
        'MISSING_PREREQUISITES',
        422,
        'prerequisites',
        { missingDocuments: dtoBeforeSend.checklist.missingDocuments }
      );
    }

    // RN02: Validar vigencia de antecedentes al momento de radicación ante Jurídica
    if (!dtoBeforeSend.checklist.antecedentesWithin30Days) {
      throw new AgreementLegalError(
        `RN02: Los certificados de antecedentes legales y fiscales superan los ${ANTECEDENTES_MAX_AGE_DAYS} días calendario de expedición al momento de su radicación. Debe cargar certificados actualizados.`,
        'RN02_ANTECEDENTES_VENCIDOS',
        422,
        'ANTECEDENTES_LEGALES'
      );
    }

    const now = referenceDate;
    await this.agreementRepo.updatePrerequisitesVerification({
      agreementId,
      verificationStatus: 'PENDIENTE',
      reviewedById: validActor.id,
      reviewedAt: null,
    });

    const updated = await this.agreementRepo.update(agreementId, {
      status: 'PENDIENTE_JURIDICA_UFPS',
      sentToJuridicaAt: now,
      sentToJuridicaById: validActor.id,
      notes: dto.notes?.trim() || agreement.notes,
    });

    const mapped = this.mapAgreementToDTO(updated, referenceDate);

    return {
      agreement: mapped,
      previousStatus,
      currentStatus: 'PENDIENTE_JURIDICA_UFPS',
      message: `Expediente del convenio ${mapped.agreementNumber} remitido exitosamente a la Oficina de Asesoría Jurídica UFPS (PENDIENTE_JURIDICA_UFPS).`,
    };
  }

  /**
   * Criterio 3 & RN03: Registro del dictamen emitido por la Oficina de Jurídica UFPS
   * - APROBADO -> APROBADO_JURIDICA (o VIGENTE si activateImmediately/targetStatus === 'VIGENTE')
   * - DEVUELTO -> OBSERVADO_JURIDICA con radicado, fecha, observaciones obligatorias y notificación a la empresa
   */
  async registerJuridicaDictamen(
    agreementId: string,
    dto: JuridicaDictamenDTO,
    actor?: AuthenticatedUser | null,
    referenceDate: Date = new Date()
  ): Promise<{
    agreement: AgreementResponseDTO;
    decision: JuridicaDecisionType;
    previousStatus: AgreementStatus;
    currentStatus: AgreementStatus;
    historyEntry: JuridicaHistoryEntryDTO;
    notification: {
      sent: boolean;
      recipientEmail: string | null;
      recipientName: string | null;
      subject: string;
      message: string;
      sentAt: string;
    } | null;
    message: string;
  }> {
    const validActor = this.assertCoordinatorOrAdmin(
      actor,
      'registrar el dictamen emitido por la Oficina de Jurídica UFPS'
    );

    const agreement = await this.agreementRepo.findById(agreementId);
    if (!agreement || (agreement as any).deletedAt) {
      throw new AgreementLegalError(
        'El convenio especificado no fue encontrado',
        'AGREEMENT_NOT_FOUND',
        404
      );
    }

    const previousStatus = agreement.status as AgreementStatus;
    if (previousStatus !== 'PENDIENTE_JURIDICA_UFPS') {
      throw new AgreementLegalError(
        `El dictamen jurídico solo puede registrarse cuando el convenio está en estado PENDIENTE_JURIDICA_UFPS (estado actual: '${previousStatus}').`,
        'INVALID_AGREEMENT_STATUS',
        400
      );
    }

    // Normalizar decisión
    const rawDecision = (dto.decision || '').trim().toUpperCase();
    let normalizedDecision: JuridicaDecisionType;
    if (
      rawDecision === 'APROBADO' ||
      rawDecision === 'APROBADO_JURIDICA' ||
      rawDecision === 'VIGENTE' ||
      rawDecision === 'FAVORABLE'
    ) {
      normalizedDecision = 'APROBADO';
    } else if (
      rawDecision === 'DEVUELTO' ||
      rawDecision === 'OBSERVADO' ||
      rawDecision === 'OBSERVADO_JURIDICA' ||
      rawDecision === 'DEVUELTO_OBSERVACIONES' ||
      rawDecision === 'DEVUELTO_CON_OBSERVACIONES'
    ) {
      normalizedDecision = 'DEVUELTO';
    } else {
      throw new AgreementLegalError(
        `Decisión jurídica inválida ('${dto.decision}'). Use 'APROBADO' o 'DEVUELTO'.`,
        'INVALID_DECISION',
        422,
        'decision'
      );
    }

    // RN03: Número de radicado interno obligatorio
    const radicadoNumber = (dto.radicadoNumber ?? dto.juridicaRadicadoNumber ?? '').trim();
    if (!radicadoNumber || radicadoNumber.length < 3) {
      throw new AgreementLegalError(
        'RN03: El número de radicado interno de la Oficina de Jurídica UFPS es obligatorio para registrar el concepto.',
        'MISSING_RADICADO_NUMBER',
        422,
        'radicadoNumber'
      );
    }

    const rawApprovalDate = dto.approvalDate ?? dto.juridicaApprovalDate;
    const reviewDate = rawApprovalDate ? new Date(rawApprovalDate) : referenceDate;
    if (isNaN(reviewDate.getTime())) {
      throw new AgreementLegalError(
        'La fecha de revisión o aprobación jurídica suministrada no es válida',
        'INVALID_REVIEW_DATE',
        422,
        'approvalDate'
      );
    }

    const observations = (dto.observations ?? dto.juridicaObservations ?? '').trim();
    const conceptUrl = (dto.conceptUrl ?? dto.juridicaConceptUrl ?? '').trim();
    const existingHistory: JuridicaHistoryEntryDTO[] = Array.isArray((agreement as any).juridicaHistory)
      ? (agreement as any).juridicaHistory
      : [];

    if (normalizedDecision === 'DEVUELTO') {
      // RN03: Observaciones obligatorias en devolución/objeción
      if (!observations || observations.length < 5) {
        throw new AgreementLegalError(
          'RN03: Toda devolución u objeción de Jurídica UFPS requiere observaciones obligatorias detallando los ajustes requeridos (mínimo 5 caracteres).',
          'MISSING_OBSERVATIONS',
          422,
          'observations'
        );
      }

      const observedDocsRaw = Array.isArray(dto.observedDocuments) ? dto.observedDocuments : [];
      const observedDocs = observedDocsRaw
        .map((d) => normalizePrerequisiteDocumentType(String(d)))
        .filter((d): d is AgreementPrerequisiteDocumentType => d !== null);

      await this.agreementRepo.updatePrerequisitesVerification({
        agreementId,
        verificationStatus: 'OBSERVADO',
        reviewedById: validActor.id,
        reviewedAt: reviewDate,
        observations,
        documentTypes: observedDocs.length > 0 ? observedDocs : undefined,
      });

      const historyEntry: JuridicaHistoryEntryDTO = {
        id: crypto.randomUUID(),
        decision: 'DEVUELTO',
        radicadoNumber,
        reviewedAt: reviewDate.toISOString(),
        observations,
        observedDocuments: observedDocs.length > 0 ? observedDocs : undefined,
        reviewerId: validActor.id,
        reviewerName: validActor.name,
        reviewerEmail: validActor.email,
        previousStatus,
        newStatus: 'OBSERVADO_JURIDICA',
        companyNotified: true,
      };

      const updated = await this.agreementRepo.update(agreementId, {
        status: 'OBSERVADO_JURIDICA',
        juridicaRadicadoNumber: radicadoNumber,
        juridicaReviewedAt: reviewDate,
        juridicaReviewedById: validActor.id,
        juridicaObservations: observations,
        juridicaHistory: [historyEntry, ...existingHistory],
      });

      const mapped = this.mapAgreementToDTO(updated, referenceDate);
      const companyEmail = (agreement as any).company?.contactEmail || null;
      const companyName = (agreement as any).company?.businessName || 'Empresa Receptora';

      const notification = {
        sent: true,
        recipientEmail: companyEmail,
        recipientName: companyName,
        subject: `[UFPS SIGETRAP] Devolución con observaciones de Jurídica - Convenio ${agreement.agreementNumber} (Rad. ${radicadoNumber})`,
        message: `Estimada entidad ${companyName}, la Oficina de Asesoría Jurídica de la UFPS devolvió el expediente bajo el radicado ${radicadoNumber} con las siguientes observaciones: ${observations}. Por favor subsane los soportes correspondientes.`,
        sentAt: reviewDate.toISOString(),
      };

      return {
        agreement: mapped,
        decision: 'DEVUELTO',
        previousStatus,
        currentStatus: 'OBSERVADO_JURIDICA',
        historyEntry,
        notification,
        message: `Convenio devuelto con observaciones (Radicado ${radicadoNumber}). Se notificó a ${companyName} para subsanar los soportes.`,
      };
    }

    // Decisión: APROBADO
    if (!conceptUrl || !isValidDocumentUrl(conceptUrl)) {
      throw new AgreementLegalError(
        'Criterio 3: Debe adjuntar el concepto favorable o resolución emitida por la Oficina de Jurídica UFPS (URL o archivo válido).',
        'MISSING_CONCEPT_URL',
        422,
        'conceptUrl'
      );
    }

    const activateImmediately =
      Boolean(dto.activateImmediately) ||
      dto.targetStatus === 'VIGENTE' ||
      rawDecision === 'VIGENTE';
    const nextStatus: AgreementStatus = activateImmediately ? 'VIGENTE' : 'APROBADO_JURIDICA';

    await this.agreementRepo.updatePrerequisitesVerification({
      agreementId,
      verificationStatus: 'VERIFICADO',
      reviewedById: validActor.id,
      reviewedAt: reviewDate,
      observations: observations || 'Verificado y aprobado por Oficina de Asesoría Jurídica UFPS',
    });

    const historyEntry: JuridicaHistoryEntryDTO = {
      id: crypto.randomUUID(),
      decision: 'APROBADO',
      radicadoNumber,
      reviewedAt: reviewDate.toISOString(),
      approvalDate: reviewDate.toISOString(),
      conceptUrl,
      observations: observations || null,
      reviewerId: validActor.id,
      reviewerName: validActor.name,
      reviewerEmail: validActor.email,
      previousStatus,
      newStatus: nextStatus,
    };

    const updated = await this.agreementRepo.update(agreementId, {
      status: nextStatus,
      signedByDirector: activateImmediately ? true : agreement.signedByDirector,
      juridicaRadicadoNumber: radicadoNumber,
      juridicaApprovalDate: reviewDate,
      juridicaConceptUrl: conceptUrl,
      juridicaReviewedAt: reviewDate,
      juridicaReviewedById: validActor.id,
      juridicaObservations: observations || null,
      juridicaHistory: [historyEntry, ...existingHistory],
    });

    const mapped = this.mapAgreementToDTO(updated, referenceDate);

    return {
      agreement: mapped,
      decision: 'APROBADO',
      previousStatus,
      currentStatus: nextStatus,
      historyEntry,
      notification: null,
      message:
        nextStatus === 'VIGENTE'
          ? `Visto bueno de Jurídica registrado (Radicado ${radicadoNumber}) y convenio suscrito en estado VIGENTE.`
          : `Visto bueno favorable de Jurídica UFPS registrado (Radicado ${radicadoNumber}). Firma final habilitada (APROBADO_JURIDICA).`,
    };
  }

  /**
   * Firma final y activación de un convenio previamente aprobado por Jurídica UFPS (APROBADO_JURIDICA -> VIGENTE)
   */
  async subscribeApprovedAgreement(
    agreementId: string,
    actor?: AuthenticatedUser | null,
    notes?: string
  ): Promise<AgreementResponseDTO> {
    this.assertCoordinatorOrAdmin(actor, 'suscribir y activar formalmente un convenio');

    const agreement = await this.agreementRepo.findById(agreementId);
    if (!agreement || (agreement as any).deletedAt) {
      throw new AgreementLegalError(
        'El convenio especificado no fue encontrado',
        'AGREEMENT_NOT_FOUND',
        404
      );
    }

    if (agreement.status !== 'APROBADO_JURIDICA' && agreement.status !== 'VIGENTE') {
      throw new AgreementLegalError(
        `Ningún convenio puede formalizarse en estado VIGENTE sin contar primero con el visto bueno de la Oficina de Jurídica UFPS (estado actual: '${agreement.status}').`,
        'JURIDICA_APPROVAL_REQUIRED',
        422
      );
    }

    const updated = await this.agreementRepo.update(agreementId, {
      status: 'VIGENTE',
      signedByDirector: true,
      notes: notes?.trim() || agreement.notes,
    });

    return this.mapAgreementToDTO(updated);
  }

  /**
   * Mapea el modelo Agreement con sus prerrequisitos y checklist calculado
   */
  public mapAgreementToDTO(
    agreement: any,
    referenceDate: Date = new Date()
  ): AgreementResponseDTO {
    const rawPrereqs = Array.isArray(agreement.prerequisites) ? agreement.prerequisites : [];

    const prerequisites: AgreementPrerequisiteItemDTO[] = rawPrereqs.map((p: any) => {
      const issuedDate = p.issuedAt ? new Date(p.issuedAt) : null;
      const daysSinceIssued = issuedDate
        ? calculateCalendarDaysElapsed(issuedDate, referenceDate)
        : null;
      const isWithin30 =
        p.documentType === 'ANTECEDENTES_LEGALES'
          ? daysSinceIssued !== null && daysSinceIssued >= -1 && daysSinceIssued <= ANTECEDENTES_MAX_AGE_DAYS
          : null;

      return {
        id: p.id,
        agreementId: p.agreementId,
        documentType: p.documentType as AgreementPrerequisiteDocumentType,
        fileUrl: p.fileUrl,
        fileName: p.fileName ?? null,
        mimeType: p.mimeType ?? null,
        issuedAt: issuedDate ? issuedDate.toISOString() : null,
        daysSinceIssued,
        isWithin30DaysValidity: isWithin30,
        verificationStatus: (p.verificationStatus || 'PENDIENTE') as any,
        observations: p.observations ?? null,
        uploadedById: p.uploadedById ?? null,
        reviewedById: p.reviewedById ?? null,
        reviewedAt: p.reviewedAt ? new Date(p.reviewedAt).toISOString() : null,
        createdAt: new Date(p.createdAt || Date.now()).toISOString(),
        updatedAt: new Date(p.updatedAt || Date.now()).toISOString(),
      };
    });

    const byType = new Map(prerequisites.map((p) => [p.documentType, p]));
    const hasBorradorMinuta = byType.has('BORRADOR_MINUTA');
    const hasRepresentanteDirectiva = byType.has('REPRESENTANTE_DIRECTIVA');
    const antecedentesItem = byType.get('ANTECEDENTES_LEGALES');
    const hasAntecedentesLegales = Boolean(antecedentesItem);
    const antecedentesWithin30Days = Boolean(antecedentesItem?.isWithin30DaysValidity);

    const missingDocuments = REQUIRED_AGREEMENT_PREREQUISITES.filter(
      (docType) => !byType.has(docType)
    );
    const allRequiredUploaded = missingDocuments.length === 0;
    const status = agreement.status as AgreementStatus;

    const canSendToJuridica =
      allRequiredUploaded &&
      antecedentesWithin30Days &&
      (status === 'BORRADOR' || status === 'EN_TRAMITE' || status === 'OBSERVADO_JURIDICA');

    const isFormalizableForPractices =
      (status === 'APROBADO_JURIDICA' || status === 'VIGENTE') &&
      new Date(agreement.endDate) >= referenceDate;

    return {
      id: agreement.id,
      companyId: agreement.companyId,
      agreementNumber: agreement.agreementNumber,
      status,
      startDate: new Date(agreement.startDate).toISOString(),
      endDate: new Date(agreement.endDate).toISOString(),
      documentUrl: agreement.documentUrl ?? null,
      signedByDirector: Boolean(agreement.signedByDirector),
      notes: agreement.notes ?? null,
      juridicaRadicadoNumber: agreement.juridicaRadicadoNumber ?? null,
      juridicaApprovalDate: agreement.juridicaApprovalDate
        ? new Date(agreement.juridicaApprovalDate).toISOString()
        : null,
      juridicaConceptUrl: agreement.juridicaConceptUrl ?? null,
      juridicaObservations: agreement.juridicaObservations ?? null,
      juridicaReviewedAt: agreement.juridicaReviewedAt
        ? new Date(agreement.juridicaReviewedAt).toISOString()
        : null,
      juridicaReviewedById: agreement.juridicaReviewedById ?? null,
      sentToJuridicaAt: agreement.sentToJuridicaAt
        ? new Date(agreement.sentToJuridicaAt).toISOString()
        : null,
      sentToJuridicaById: agreement.sentToJuridicaById ?? null,
      juridicaHistory: Array.isArray(agreement.juridicaHistory)
        ? agreement.juridicaHistory
        : [],
      company: agreement.company
        ? {
            id: agreement.company.id,
            nit: agreement.company.nit,
            businessName: agreement.company.businessName,
            legalRepresentative: agreement.company.legalRepresentative,
            contactEmail: agreement.company.contactEmail,
            contactPhone: agreement.company.contactPhone,
            city: agreement.company.city,
          }
        : null,
      prerequisites,
      checklist: {
        hasBorradorMinuta,
        hasRepresentanteDirectiva,
        hasAntecedentesLegales,
        antecedentesWithin30Days,
        allRequiredUploaded,
        canSendToJuridica,
        missingDocuments,
        isFormalizableForPractices,
      },
      createdAt: new Date(agreement.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(agreement.updatedAt || Date.now()).toISOString(),
    };
  }
}

export const agreementLegalService = new AgreementLegalService();

let activeAgreementLegalServiceInstance: AgreementLegalService | null = null;

export function getAgreementLegalService(): AgreementLegalService {
  return activeAgreementLegalServiceInstance || agreementLegalService;
}

export function setAgreementLegalServiceInstance(
  service: AgreementLegalService | null
): void {
  activeAgreementLegalServiceInstance = service;
}
