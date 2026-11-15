// ==============================================================================
// SIGETRAP - Servicio de Protocolo de Traslado y Reubicación de Practicante (HU20)
// Historia de Usuario:
//   HU20 - Protocolo de Traslado y Reubicación de Practicante por Ausencia de Tutor Empresarial
// Criterios de Aceptación:
//   - Criterio 1: Declaración de causa AUSENCIA_TUTOR_EMPRESARIAL, congelamiento y generación de informe de corte.
//   - Criterio 2: Búsqueda y compatibilidad de empresas receptoras disponibles con UFPS al final como última instancia.
//   - Criterio 3: Asignación a nueva entidad, preservación del histórico formativo y notificación a las partes.
// Reglas de Negocio:
//   - RN01 (Preservación de horas): Horas radicadas y aprobadas en origen se consolidan como saldo a favor.
//   - RN02 (UFPS como último recurso): Advertencia de confirmación y justificación obligatoria de agotamiento de plazas externas.
//   - RN03 (Nueva ARL / Notificación): Reevaluación de cobertura ARL para nuevas instalaciones físicas (o amparo sede UFPS).
// ==============================================================================

import crypto from 'crypto';
import {
  PracticeTransferRepository,
  practiceTransferRepository,
  isUfpsCompany,
} from '@/server/repositories/practice-transfer.repository';
import {
  AuthenticatedUser,
  CompatibleTransferCompaniesResultDTO,
  CompatibleTransferCompanyItemDTO,
  CompatibleTransferVacancyItemDTO,
  ConfirmPracticeTransferDTO,
  ConfirmPracticeTransferResultDTO,
  PracticeCutoffReportDTO,
  PracticeStatus,
  PracticeTransferReasonCode,
  RequestPracticeTransferDTO,
  RequestPracticeTransferResultDTO,
  TransferNotificationItemDTO,
} from '@/types';

export const UFPS_LAST_RESORT_WARNING_MESSAGE =
  'ADVERTENCIA INSTITUCIONAL (RN02): Ha seleccionado a la Universidad Francisco de Paula Santander (UFPS - Dependencias Internas) como entidad destino. Esta opción corresponde a una contingencia de última instancia y requiere justificar formalmente que se agotaron las plazas externas afines en el sector productivo.';

export class PracticeTransferError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'PRACTICE_TRANSFER_ERROR',
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PracticeTransferError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class PracticeTransferService {
  constructor(
    private readonly repo: PracticeTransferRepository = practiceTransferRepository
  ) {}

  /**
   * Calcula las horas válidas y aprobadas acumuladas en la práctica hasta el momento del corte (RN01)
   */
  public calculateAccumulatedValidHours(practice: any, overrideHours?: number): number {
    if (typeof overrideHours === 'number' && !isNaN(overrideHours) && overrideHours >= 0) {
      return Math.round(overrideHours);
    }

    let hoursFromAdvanceReports = 0;
    if (Array.isArray(practice.advanceReports) && practice.advanceReports.length > 0) {
      hoursFromAdvanceReports = practice.advanceReports
        .filter(
          (r: any) =>
            r.tipo !== 'CORTE_TRASLADO' &&
            (r.estado === 'Aprobado' || r.estado === 'Radicado' || r.estado === 'En Revisión')
        )
        .reduce((acc: number, curr: any) => acc + (Number(curr.horasEjecutadas) || 0), 0);
    }

    let hoursFromReports = 0;
    if (Array.isArray(practice.reports) && practice.reports.length > 0) {
      hoursFromReports = practice.reports
        .filter((r: any) => r.status === 'APROBADO' || r.status === 'ENTREGADO')
        .reduce((acc: number, curr: any) => acc + (Number(curr.hoursReported) || 0), 0);
    }

    let hoursFromLogs = 0;
    if (Array.isArray(practice.followUpLogs) && practice.followUpLogs.length > 0) {
      hoursFromLogs = practice.followUpLogs.reduce(
        (acc: number, curr: any) => acc + (Number(curr.horasEjecutadas) || 0),
        0
      );
    }

    const storedCompleted = Number(practice.totalHoursCompleted) || 0;
    return Math.max(storedCompleted, hoursFromAdvanceReports, hoursFromReports, hoursFromLogs);
  }

  /**
   * Extrae las competencias técnicas (skills) del perfil del estudiante y su práctica
   */
  public extractStudentSkills(practice: any, explicitSkillsInput?: string | string[]): string[] {
    const rawTokens: string[] = [];

    if (Array.isArray(explicitSkillsInput)) {
      rawTokens.push(...explicitSkillsInput);
    } else if (typeof explicitSkillsInput === 'string' && explicitSkillsInput.trim()) {
      rawTokens.push(...explicitSkillsInput.split(/[,;|]+/));
    }

    if (practice.student?.specialty) {
      rawTokens.push(...String(practice.student.specialty).split(/[,;|/]+/));
    }

    const referenceText = [
      practice.vacancy?.requirements || '',
      practice.vacancy?.description || '',
      practice.vacancy?.title || '',
      practice.workPlan?.objectives || '',
      practice.workPlan?.methodology || '',
      practice.student?.program || '',
    ].join(' ');

    const knownTechSkills = [
      'TypeScript',
      'JavaScript',
      'React',
      'Next.js',
      'Node.js',
      'SQL',
      'PostgreSQL',
      'Python',
      'Java',
      'Docker',
      'Git',
      'API REST',
      'Microservicios',
      'Desarrollo de Software',
      'Bases de Datos',
      'Redes',
      'Seguridad',
      'Cloud',
      'Fullstack',
      'Frontend',
      'Backend',
      'Ingeniería de Sistemas',
    ];

    for (const skill of knownTechSkills) {
      if (referenceText.toLowerCase().includes(skill.toLowerCase())) {
        rawTokens.push(skill);
      }
    }

    const cleaned = Array.from(
      new Set(
        rawTokens
          .map((s) => s.trim())
          .filter((s) => s.length >= 2)
      )
    );

    if (cleaned.length === 0) {
      return ['TypeScript', 'React', 'Node.js', 'SQL', 'Desarrollo de Software', 'Ingeniería de Sistemas'];
    }

    return cleaned;
  }

  /**
   * Criterio 1 & RN01:
   * POST /api/v1/practicas/[id]/solicitar-traslado
   * Apertura de expediente de traslado por falta de tutor empresarial:
   * - Marca la causa específica AUSENCIA_TUTOR_EMPRESARIAL
   * - Congela la práctica actual (EN_TRASLADO_EMPRESARIAL)
   * - Genera un informe de corte con las horas acumuladas hasta la fecha
   */
  async requestPracticeTransfer(
    practiceId: string,
    dto: RequestPracticeTransferDTO = {},
    actor: AuthenticatedUser
  ): Promise<RequestPracticeTransferResultDTO> {
    if (!practiceId || !practiceId.trim()) {
      throw new PracticeTransferError(
        'El identificador de la práctica es obligatorio',
        'INVALID_PRACTICE_ID',
        400
      );
    }

    // RBAC: Solo Director de Programa / Coordinador de Prácticas o Administrador
    if (actor.role !== 'DIRECTOR_PROGRAMA' && actor.role !== 'ADMIN') {
      throw new PracticeTransferError(
        'Acceso denegado: Únicamente el Director de Programa o Coordinador de Prácticas está autorizado para iniciar el protocolo de traslado empresarial (HU20).',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const practice = await this.repo.findPracticeWithTransferContext(practiceId.trim());
    if (!practice) {
      throw new PracticeTransferError(
        `No se encontró ninguna práctica registrada con el identificador '${practiceId}'`,
        'PRACTICE_NOT_FOUND',
        404
      );
    }

    if (practice.currentStatus === 'FINALIZADA' || practice.currentStatus === 'CERRADA') {
      throw new PracticeTransferError(
        'No es posible iniciar un protocolo de traslado sobre una práctica que ya ha sido finalizada o cerrada.',
        'PRACTICE_ALREADY_CLOSED',
        409
      );
    }

    // Validar causa específica: AUSENCIA_TUTOR_EMPRESARIAL (Criterio 1)
    const rawReason = (
      dto.reasonCode ||
      dto.causa ||
      dto.motivo ||
      'AUSENCIA_TUTOR_EMPRESARIAL'
    )
      .toString()
      .trim()
      .toUpperCase();

    if (rawReason !== 'AUSENCIA_TUTOR_EMPRESARIAL') {
      throw new PracticeTransferError(
        `Causa de traslado inválida ('${rawReason}'). Para este protocolo de contingencia debe marcarse la causa específica 'AUSENCIA_TUTOR_EMPRESARIAL'.`,
        'INVALID_TRANSFER_REASON',
        400
      );
    }

    const reasonCode: PracticeTransferReasonCode = 'AUSENCIA_TUTOR_EMPRESARIAL';
    const justification =
      (dto.justification || dto.justificacion || dto.observaciones || '').trim() ||
      'La empresa receptora carece de tutor empresarial disponible o notificó incapacidad de suministrar evaluador directo para el seguimiento formativo.';

    // RN01: Consolidar las horas debidamente radicadas y aprobadas hasta la fecha
    const hoursAccumulated = this.calculateAccumulatedValidHours(
      practice,
      dto.cutoffHoursOverride
    );
    const requiredHours = Number(practice.totalHoursRequired) || 320;
    const remainingHours = Math.max(0, requiredHours - hoursAccumulated);
    const previousReportsCount = Array.isArray(practice.advanceReports)
      ? practice.advanceReports.filter((r: any) => r.tipo !== 'CORTE_TRASLADO').length
      : 0;

    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const cutoffCode = `CORTE-TRAS-${year}-${practice.id.substring(0, 6).toUpperCase()}`;
    const cutoffId = crypto.randomUUID();
    const sourceCompanyName = practice.company?.businessName || 'Empresa de Origen';
    const sourceCompanyNit = practice.company?.nit || 'N/A';

    const cutoffSummary = `Informe oficial de corte formativo (${cutoffCode}) emitido por activación del Protocolo de Traslado por Ausencia de Tutor Empresarial (Causa: ${reasonCode}). Se congelan las actividades en la entidad de origen '${sourceCompanyName}' (NIT: ${sourceCompanyNit}) reconociendo y salvaguardando un acumulado de ${hoursAccumulated} de ${requiredHours} horas válidas a favor del estudiante ${practice.student?.name || ''} (RN01). Restan ${remainingHours} horas por ejecutar en la entidad de destino.`;

    const cutoffReport: PracticeCutoffReportDTO = {
      id: cutoffId,
      code: cutoffCode,
      practiceId: practice.id,
      studentId: practice.studentId,
      studentName: practice.student?.name || 'Estudiante Practicante',
      studentCode: practice.student?.studentCode || null,
      sourceCompanyId: practice.companyId,
      sourceCompanyName,
      sourceCompanyNit,
      reasonCode,
      justification,
      hoursAccumulated,
      requiredHours,
      remainingHours,
      previousReportsCount,
      generatedAt: nowIso,
      generatedBy: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
      },
      summary: cutoffSummary,
    };

    const previousStatus = (practice.currentStatus || 'PRACTICA_EN_EJECUCION') as PracticeStatus;

    const { transfer } = await this.repo.createTransferRequestAndFreezePractice({
      practiceId: practice.id,
      studentId: practice.studentId,
      sourceCompanyId: practice.companyId,
      previousStatus,
      reasonCode,
      justification,
      hoursTransferred: hoursAccumulated,
      approvedById: actor.id,
      cutoffReportData: {
        id: cutoffId,
        code: cutoffCode,
        summary: cutoffSummary,
        generatedAt: nowIso,
      },
    });

    return {
      transfer: {
        id: transfer.id,
        practiceId: practice.id,
        sourceCompanyId: practice.companyId,
        targetCompanyId: null,
        reasonCode,
        justification,
        hoursTransferred: hoursAccumulated,
        approvedById: actor.id,
        createdAt: transfer.createdAt || nowIso,
        sourceCompany: {
          id: practice.companyId,
          businessName: sourceCompanyName,
          nit: sourceCompanyNit,
        },
        targetCompany: null,
        approvedBy: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          role: actor.role,
        },
      },
      practiceId: practice.id,
      studentId: practice.studentId,
      studentName: practice.student?.name || 'Estudiante Practicante',
      previousStatus,
      currentStatus: 'EN_TRASLADO_EMPRESARIAL',
      transferStatus: 'EN_TRASLADO_EMPRESARIAL',
      isFrozen: true,
      reasonCode,
      hoursAccumulatedAtCutoff: hoursAccumulated,
      cutoffReport,
      message: `Expediente de traslado abierto exitosamente con causa '${reasonCode}'. La práctica ha sido congelada en estado 'EN_TRASLADO_EMPRESARIAL' y se generó el informe de corte ${cutoffCode} preservando ${hoursAccumulated} hora(s) acumuladas (RN01).`,
    };
  }

  /**
   * Criterio 2 & RN02:
   * GET /api/v1/practicas/[id]/empresas-compatibles-traslado
   * Lista las empresas con vacantes disponibles y convenio activo que coincidan
   * con los skills del estudiante, ordenando a la UFPS al final como contingencia de última instancia.
   */
  async getCompatibleTransferCompanies(
    practiceId: string,
    queryParams: {
      skills?: string | string[];
      search?: string;
      allowPreview?: boolean;
    } = {},
    actor: AuthenticatedUser
  ): Promise<CompatibleTransferCompaniesResultDTO> {
    if (!practiceId || !practiceId.trim()) {
      throw new PracticeTransferError(
        'El identificador de la práctica es obligatorio',
        'INVALID_PRACTICE_ID',
        400
      );
    }

    if (
      actor.role !== 'DIRECTOR_PROGRAMA' &&
      actor.role !== 'ADMIN' &&
      actor.role !== 'DOCENTE_PRACTICA'
    ) {
      throw new PracticeTransferError(
        'No tiene permisos para consultar las empresas receptoras compatibles para traslado.',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const practice = await this.repo.findPracticeWithTransferContext(practiceId.trim());
    if (!practice) {
      throw new PracticeTransferError(
        `No se encontró ninguna práctica registrada con el identificador '${practiceId}'`,
        'PRACTICE_NOT_FOUND',
        404
      );
    }

    const isInTransferState =
      practice.currentStatus === 'EN_TRASLADO_EMPRESARIAL' ||
      practice.transferStatus === 'EN_TRASLADO_EMPRESARIAL' ||
      practice.currentStatus === 'REUBICACION_PENDIENTE' ||
      (Array.isArray(practice.transfers) && practice.transfers.length > 0);

    if (!isInTransferState && !queryParams.allowPreview) {
      throw new PracticeTransferError(
        'El practicante debe encontrarse en estado EN_TRASLADO_EMPRESARIAL para buscar y asignar una nueva entidad receptora de traslado (Criterio 2). Inicie primero la solicitud de traslado.',
        'PRACTICE_NOT_IN_TRANSFER_STATE',
        400
      );
    }

    const studentSkills = this.extractStudentSkills(practice, queryParams.skills);
    const studentProgram = practice.student?.program || 'Ingeniería de Sistemas';
    const hoursToTransfer = this.calculateAccumulatedValidHours(practice);

    const candidateCompanies = await this.repo.findCandidateCompaniesForTransfer(practice.companyId);
    const now = new Date();
    const compatibleItems: CompatibleTransferCompanyItemDTO[] = [];

    for (const company of candidateCompanies) {
      const isUfps = isUfpsCompany(company);

      // Verificar convenio VIGENTE
      const agreements: any[] = Array.isArray(company.agreements) ? company.agreements : [];
      const activeAgreement = agreements.find((ag) => {
        if (ag.status !== 'VIGENTE') return false;
        const end = ag.endDate ? new Date(ag.endDate) : null;
        return !end || end.getTime() >= now.getTime();
      });

      if (!activeAgreement && !isUfps) {
        continue; // Solo empresas con convenio activo (o UFPS institucional)
      }

      // Verificar vacantes disponibles y compatibilidad con skills del estudiante
      const rawVacancies: any[] = Array.isArray(company.vacancies) ? company.vacancies : [];
      const compatibleVacancies: CompatibleTransferVacancyItemDTO[] = [];
      const companyMatchedSkillsSet = new Set<string>();

      for (const vac of rawVacancies) {
        const totalSlots = Number(vac.vacanciesCount) || 1;
        const occupied = Number(vac._count?.practices) || 0;
        const availableSlots = Math.max(1, totalSlots - occupied);

        const vacText = [
          vac.title || '',
          vac.description || '',
          vac.requirements || '',
          vac.program || '',
        ]
          .join(' ')
          .toLowerCase();

        const matchedSkills = studentSkills.filter((skill) =>
          vacText.includes(skill.toLowerCase())
        );

        // Si coincide en programa de Ingeniería de Sistemas y no hubo match literal de token, reconocer competencia base del programa
        if (
          matchedSkills.length === 0 &&
          (vacText.includes('sistemas') ||
            vacText.includes('software') ||
            vacText.includes('desarroll') ||
            vacText.includes('ingenier') ||
            isUfps)
        ) {
          matchedSkills.push(studentSkills[0] || 'Ingeniería de Sistemas');
        }

        if (matchedSkills.length > 0 || isUfps) {
          for (const ms of matchedSkills) companyMatchedSkillsSet.add(ms);
          const score = Math.min(
            100,
            Math.max(
              isUfps ? 75 : 60,
              Math.round((matchedSkills.length / Math.max(1, Math.min(studentSkills.length, 4))) * 100)
            )
          );

          compatibleVacancies.push({
            id: vac.id,
            title: vac.title,
            description: vac.description || '',
            requirements: vac.requirements || '',
            program: vac.program || studentProgram,
            vacanciesCount: totalSlots,
            availableSlots,
            matchedSkills,
            compatibilityScore: score,
          });
        }
      }

      if (compatibleVacancies.length === 0 && !isUfps) {
        continue; // Requiere al menos una vacante disponible y compatible
      }

      // Filtro de búsqueda textual opcional
      if (queryParams.search && queryParams.search.trim()) {
        const q = queryParams.search.trim().toLowerCase();
        const matchesSearch =
          String(company.businessName || '').toLowerCase().includes(q) ||
          String(company.nit || '').toLowerCase().includes(q) ||
          String(company.city || '').toLowerCase().includes(q) ||
          compatibleVacancies.some(
            (v) =>
              v.title.toLowerCase().includes(q) ||
              v.requirements.toLowerCase().includes(q)
          );
        if (!matchesSearch && !isUfps) continue;
      }

      const matchedSkillsList = Array.from(companyMatchedSkillsSet);
      const maxVacancyScore =
        compatibleVacancies.length > 0
          ? Math.max(...compatibleVacancies.map((v) => v.compatibilityScore))
          : 75;
      const availableSlotsTotal = compatibleVacancies.reduce(
        (acc, v) => acc + v.availableSlots,
        0
      );

      const tutorsList = Array.isArray(company.tutors)
        ? company.tutors.map((t: any) => ({
            id: t.id,
            name: t.name,
            email: t.email,
            cargo:
              t.program && t.program !== 'Ingeniería de Sistemas'
                ? t.program
                : isUfps
                ? 'Supervisor Institucional UFPS'
                : 'Supervisor / Tutor Empresarial',
          }))
        : [];

      compatibleItems.push({
        companyId: company.id,
        businessName: company.businessName,
        nit: company.nit,
        city: company.city || 'Cúcuta',
        address: company.address || 'Dirección registrada',
        contactEmail: company.contactEmail || 'contacto@empresa.co',
        contactPhone: company.contactPhone || '+57 300 000 0000',
        hasActiveAgreement: true,
        agreementNumber: activeAgreement?.agreementNumber || 'CONV-UFPS-INTERNO-2026',
        agreementEndDate: activeAgreement?.endDate
          ? new Date(activeAgreement.endDate).toISOString().split('T')[0]
          : '2030-12-31',
        isUfpsContingency: isUfps,
        priorityLevel: isUfps ? 'ULTIMA_INSTANCIA_UFPS' : 'PRIORIDAD_SECTOR_PRODUCTIVO',
        priorityRank: 0, // Asignado tras ordenar
        matchedSkills:
          matchedSkillsList.length > 0 ? matchedSkillsList : [studentSkills[0] || 'Ingeniería de Sistemas'],
        compatibilityScore: maxVacancyScore,
        availableSlotsTotal: Math.max(1, availableSlotsTotal),
        vacancies: compatibleVacancies,
        availableTutors: tutorsList,
        requiresUfpsJustificationWarning: isUfps,
        ufpsWarningMessage: isUfps ? UFPS_LAST_RESORT_WARNING_MESSAGE : null,
      });
    }

    // Criterio 2 & RN02: Ordenar empresas del sector productivo primero (por mayor compatibilidad y cupos)
    // y dejar SIEMPRE a la UFPS al final de las opciones disponibles como contingencia de última instancia.
    compatibleItems.sort((a, b) => {
      if (a.isUfpsContingency !== b.isUfpsContingency) {
        return a.isUfpsContingency ? 1 : -1; // UFPS siempre al final
      }
      if (b.compatibilityScore !== a.compatibilityScore) {
        return b.compatibilityScore - a.compatibilityScore;
      }
      return b.availableSlotsTotal - a.availableSlotsTotal;
    });

    compatibleItems.forEach((item, idx) => {
      item.priorityRank = idx + 1;
    });

    const externalOptionsCount = compatibleItems.filter((i) => !i.isUfpsContingency).length;
    const hasUfpsFallbackOption = compatibleItems.some((i) => i.isUfpsContingency);

    return {
      practiceId: practice.id,
      studentId: practice.studentId,
      studentName: practice.student?.name || 'Estudiante Practicante',
      studentProgram,
      studentSkills,
      currentStatus: (practice.currentStatus || 'EN_TRASLADO_EMPRESARIAL') as PracticeStatus,
      transferStatus: practice.transferStatus || 'EN_TRASLADO_EMPRESARIAL',
      hoursToTransfer,
      sourceCompany: {
        id: practice.companyId,
        businessName: practice.company?.businessName || 'Empresa de Origen',
        nit: practice.company?.nit || 'N/A',
      },
      items: compatibleItems,
      total: compatibleItems.length,
      externalOptionsCount,
      hasUfpsFallbackOption,
    };
  }

  /**
   * Criterio 3, RN01, RN02 & RN03:
   * POST /api/v1/practicas/[id]/confirmar-traslado
   * Confirma el traslado formal hacia la nueva entidad receptora:
   * a) Actualiza la vinculación a la nueva entidad receptora y nuevo tutor empresarial.
   * b) Preserva el historial de informes y horas válidas del periodo anterior en la práctica (RN01).
   * c) Valida advertencia y justificación obligatoria si el destino es la UFPS (RN02).
   * d) Reevalúa el estado de ARL para las nuevas instalaciones físicas o amparo sede UFPS (RN03).
   * e) Notifica al estudiante, a la nueva empresa y al docente tutor del cambio efectuado.
   */
  async confirmPracticeTransfer(
    practiceId: string,
    dto: ConfirmPracticeTransferDTO,
    actor: AuthenticatedUser
  ): Promise<ConfirmPracticeTransferResultDTO> {
    if (!practiceId || !practiceId.trim()) {
      throw new PracticeTransferError(
        'El identificador de la práctica es obligatorio',
        'INVALID_PRACTICE_ID',
        400
      );
    }

    // RBAC: Solo Director de Programa / Coordinador de Prácticas o Administrador
    if (actor.role !== 'DIRECTOR_PROGRAMA' && actor.role !== 'ADMIN') {
      throw new PracticeTransferError(
        'Acceso denegado: Únicamente el Director de Programa o Coordinador de Prácticas puede confirmar la reubicación empresarial (HU20).',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const practice = await this.repo.findPracticeWithTransferContext(practiceId.trim());
    if (!practice) {
      throw new PracticeTransferError(
        `No se encontró ninguna práctica registrada con el identificador '${practiceId}'`,
        'PRACTICE_NOT_FOUND',
        404
      );
    }

    const isInTransferState =
      practice.currentStatus === 'EN_TRASLADO_EMPRESARIAL' ||
      practice.transferStatus === 'EN_TRASLADO_EMPRESARIAL' ||
      practice.currentStatus === 'REUBICACION_PENDIENTE' ||
      (Array.isArray(practice.transfers) && practice.transfers.length > 0);

    if (!isInTransferState) {
      throw new PracticeTransferError(
        'La práctica no se encuentra en un trámite activo de traslado empresarial (EN_TRASLADO_EMPRESARIAL). Debe solicitar el traslado antes de confirmarlo.',
        'PRACTICE_NOT_IN_TRANSFER_STATE',
        400
      );
    }

    const targetCompanyId = (
      dto.targetCompanyId ||
      dto.empresaDestinoId ||
      dto.companyId ||
      ''
    ).trim();

    if (!targetCompanyId) {
      throw new PracticeTransferError(
        'Debe seleccionar e indicar la nueva entidad receptora de destino (targetCompanyId).',
        'TARGET_COMPANY_REQUIRED',
        400
      );
    }

    if (targetCompanyId === practice.companyId) {
      throw new PracticeTransferError(
        'La nueva entidad receptora de destino no puede ser la misma empresa de origen de la cual se desvincula al estudiante.',
        'SAME_SOURCE_AND_TARGET_COMPANY',
        400
      );
    }

    const targetCompany = await this.repo.findTargetCompanyById(targetCompanyId);
    if (!targetCompany || !targetCompany.isActive) {
      throw new PracticeTransferError(
        `La empresa receptora de destino especificada ('${targetCompanyId}') no existe o no se encuentra activa.`,
        'TARGET_COMPANY_NOT_FOUND',
        404
      );
    }

    const isUfpsTarget = isUfpsCompany(targetCompany);

    // Verificar convenio vigente en empresa destino
    const now = new Date();
    const agreements: any[] = Array.isArray(targetCompany.agreements) ? targetCompany.agreements : [];
    const activeAgreement = agreements.find((ag) => {
      if (ag.status !== 'VIGENTE') return false;
      const end = ag.endDate ? new Date(ag.endDate) : null;
      return !end || end.getTime() >= now.getTime();
    });

    if (!activeAgreement && !isUfpsTarget) {
      throw new PracticeTransferError(
        `La empresa destino '${targetCompany.businessName}' no cuenta con un convenio activo vigente para recibir al practicante.`,
        'TARGET_COMPANY_NO_ACTIVE_AGREEMENT',
        400
      );
    }

    // RN02 - UFPS como último recurso: Advertencia de confirmación y justificación obligatoria
    const providedJustification = (
      dto.ufpsJustification ||
      dto.justification ||
      dto.justificacion ||
      dto.observations ||
      dto.observaciones ||
      ''
    ).trim();

    if (isUfpsTarget) {
      if (
        dto.confirmUfpsLastResort === false ||
        dto.confirmarUltimaInstanciaUfps === false
      ) {
        throw new PracticeTransferError(
          UFPS_LAST_RESORT_WARNING_MESSAGE,
          'UFPS_WARNING_CONFIRMATION_REQUIRED',
          422,
          {
            requiresUfpsConfirmation: true,
            warningMessage: UFPS_LAST_RESORT_WARNING_MESSAGE,
          }
        );
      }

      if (!providedJustification || providedJustification.length < 10) {
        throw new PracticeTransferError(
          'RN02: Al seleccionar a la UFPS como empresa destino de última instancia, es obligatorio emitir confirmación y registrar una justificación detallada (mínimo 10 caracteres) certificando que se agotaron las plazas externas afines.',
          'UFPS_JUSTIFICATION_REQUIRED',
          422,
          {
            requiresUfpsJustification: true,
            warningMessage: UFPS_LAST_RESORT_WARNING_MESSAGE,
          }
        );
      }
    }

    // Resolver nuevo tutor empresarial de la entidad receptora (Criterio 3a)
    const requestedTutorId = (
      dto.targetTutorId ||
      dto.tutorId ||
      dto.nuevoTutorId ||
      dto.tutorEmpresarialId ||
      ''
    ).trim();

    const companyTutors: any[] = Array.isArray(targetCompany.tutors) ? targetCompany.tutors : [];
    let resolvedTutor: { id: string; name: string; email: string; cargo: string } | null = null;

    if (requestedTutorId) {
      const matchedTutor = companyTutors.find((t) => t.id === requestedTutorId);
      if (matchedTutor) {
        resolvedTutor = {
          id: matchedTutor.id,
          name: matchedTutor.name,
          email: matchedTutor.email,
          cargo:
            matchedTutor.program && matchedTutor.program !== 'Ingeniería de Sistemas'
              ? matchedTutor.program
              : 'Supervisor Empresarial Asignado',
        };
      } else {
        throw new PracticeTransferError(
          `El tutor empresarial especificado ('${requestedTutorId}') no está vinculado ni activo en la empresa destino '${targetCompany.businessName}'.`,
          'INVALID_TARGET_TUTOR',
          400
        );
      }
    } else if (companyTutors.length > 0) {
      const firstTutor = companyTutors[0];
      resolvedTutor = {
        id: firstTutor.id,
        name: firstTutor.name,
        email: firstTutor.email,
        cargo:
          firstTutor.program && firstTutor.program !== 'Ingeniería de Sistemas'
            ? firstTutor.program
            : isUfpsTarget
            ? 'Supervisor Institucional UFPS'
            : 'Supervisor Empresarial Asignado',
      };
    } else {
      // Fallback: asignar al coordinador/director como supervisor institucional temporal si la entidad no tenía usuario tutor listado
      resolvedTutor = {
        id: actor.id,
        name: isUfpsTarget
          ? `${actor.name} (Supervisor Institucional UFPS)`
          : `Supervisor Designado - ${targetCompany.businessName}`,
        email: targetCompany.contactEmail || actor.email,
        cargo: isUfpsTarget ? 'Supervisor Institucional UFPS' : 'Tutor Empresarial Designado',
      };
    }

    // Resolver vacante destino
    const requestedVacancyId = (
      dto.targetVacancyId ||
      dto.vacancyId ||
      dto.plazaId ||
      ''
    ).trim();
    const companyVacancies: any[] = Array.isArray(targetCompany.vacancies)
      ? targetCompany.vacancies
      : [];
    const resolvedVacancyId =
      requestedVacancyId ||
      (companyVacancies.length > 0 ? companyVacancies[0].id : practice.vacancyId || null);

    // RN01 & Criterio 3b: Preservar las horas válidas transferidas y los informes previos
    const openTransfer = Array.isArray(practice.transfers) ? practice.transfers[0] : null;
    const hoursTransferred =
      openTransfer &&
      typeof openTransfer.hoursTransferred === 'number' &&
      openTransfer.hoursTransferred > 0
        ? Number(openTransfer.hoursTransferred)
        : this.calculateAccumulatedValidHours(practice);
    const totalHoursRequired = Number(practice.totalHoursRequired) || 320;
    const remainingHoursToComplete = Math.max(0, totalHoursRequired - hoursTransferred);

    const previousReportsPreservedCount = Array.isArray(practice.advanceReports)
      ? practice.advanceReports.length
      : 0;
    const previousLogsPreservedCount = Array.isArray(practice.followUpLogs)
      ? practice.followUpLogs.length
      : 0;

    // RN03: Reevaluar el estado de ARL para las nuevas instalaciones físicas (o amparo sede UFPS)
    const arlCoverageNote = isUfpsTarget
      ? 'RN03: Reevaluación ARL activada bajo modalidad de Amparo Sede Institucional UFPS. La cobertura de Riesgos Laborales queda en estado "Pendiente de revisión" para verificar el amparo en dependencias internas de la UFPS.'
      : `RN03: Reevaluación ARL activada por cambio de empresa receptora. La cobertura de Riesgos Laborales pasa a estado "Pendiente de revisión" para verificar que la póliza ampare las nuevas instalaciones físicas de '${targetCompany.businessName}'.`;

    // Criterio 3c: Construir y disparar notificaciones al estudiante, nueva empresa y docente tutor
    const nowIso = new Date().toISOString();
    const studentName = practice.student?.name || 'Estudiante Practicante';
    const studentEmail = practice.student?.email || 'estudiante@ufps.edu.co';
    const sourceCompanyName = practice.company?.businessName || 'Empresa Anterior';

    const notificationItems: TransferNotificationItemDTO[] = [
      {
        recipientType: 'ESTUDIANTE',
        recipientName: studentName,
        recipientEmail: studentEmail,
        subject: `[SIGETRAP UFPS] Confirmación de Reubicación de Práctica y Preservación de ${hoursTransferred} Horas (HU20)`,
        message: `Estimado(a) ${studentName}: Se ha confirmado su traslado formal desde '${sourceCompanyName}' hacia la nueva entidad receptora '${targetCompany.businessName}' bajo la supervisión de ${resolvedTutor.name}. Sus ${hoursTransferred} horas previamente validadas han sido preservadas como saldo a favor (RN01), restando ${remainingHoursToComplete} horas para culminar su práctica. ${arlCoverageNote}`,
        sentAt: nowIso,
      },
      {
        recipientType: 'NUEVA_EMPRESA',
        recipientName: `${targetCompany.businessName} (${resolvedTutor.name})`,
        recipientEmail: resolvedTutor.email || targetCompany.contactEmail || 'empresa@destino.co',
        subject: `[SIGETRAP UFPS] Vinculación de Practicante por Reubicación Institucional - ${studentName}`,
        message: `Se notifica a '${targetCompany.businessName}' y al supervisor designado ${resolvedTutor.name} la vinculación oficial del estudiante ${studentName}, quien cuenta con un saldo previo avalado de ${hoursTransferred} horas y ejecutará las ${remainingHoursToComplete} horas restantes en sus instalaciones.`,
        sentAt: nowIso,
      },
      {
        recipientType: 'DOCENTE_TUTOR',
        recipientName: practice.teacher?.name || 'Docente Tutor de Práctica',
        recipientEmail: practice.teacher?.email || 'docente.practica@ufps.edu.co',
        subject: `[SIGETRAP UFPS] Cambio de Entidad Receptora y Nuevo Tutor Empresarial - ${studentName}`,
        message: `Se informa al docente supervisor que el estudiante ${studentName} ha sido trasladado de '${sourceCompanyName}' a '${targetCompany.businessName}' por causal AUSENCIA_TUTOR_EMPRESARIAL. Nuevo tutor empresarial: ${resolvedTutor.name}. Se preservan ${hoursTransferred} horas e informes previos en el expediente.`,
        sentAt: nowIso,
      },
    ];

    const finalJustification =
      providedJustification ||
      openTransfer?.justification ||
      `Reubicación confirmada hacia '${targetCompany.businessName}' por ausencia de tutor empresarial en '${sourceCompanyName}'.`;

    const previousStatus = (practice.currentStatus || 'EN_TRASLADO_EMPRESARIAL') as PracticeStatus;
    const newStatus: PracticeStatus = 'PRACTICA_EN_EJECUCION';
    const transferStatus = 'TRASLADO_COMPLETADO';

    const { transfer } = await this.repo.confirmPracticeTransfer({
      practiceId: practice.id,
      sourceCompanyId: practice.companyId,
      targetCompanyId: targetCompany.id,
      targetCompanyData: targetCompany,
      targetTutorId: resolvedTutor.id,
      targetVacancyId: resolvedVacancyId,
      previousStatus,
      newStatus,
      transferStatus,
      hoursTransferred,
      justification: finalJustification,
      approvedById: actor.id,
      isUfpsContingency: isUfpsTarget,
      arlSupportUrl: dto.arlSupportUrl || null,
      arlCoverageNote,
      notificationsMetadata: notificationItems,
    });

    return {
      transfer: {
        id: transfer.id,
        practiceId: practice.id,
        sourceCompanyId: practice.companyId,
        targetCompanyId: targetCompany.id,
        reasonCode: transfer.reasonCode || 'AUSENCIA_TUTOR_EMPRESARIAL',
        justification: finalJustification,
        hoursTransferred,
        approvedById: actor.id,
        createdAt: transfer.createdAt || nowIso,
        sourceCompany: {
          id: practice.companyId,
          businessName: sourceCompanyName,
          nit: practice.company?.nit || 'N/A',
        },
        targetCompany: {
          id: targetCompany.id,
          businessName: targetCompany.businessName,
          nit: targetCompany.nit,
          isUfpsContingency: isUfpsTarget,
        },
        approvedBy: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          role: actor.role,
        },
      },
      practiceId: practice.id,
      student: {
        id: practice.studentId,
        name: studentName,
        email: studentEmail,
        studentCode: practice.student?.studentCode || null,
      },
      sourceCompany: {
        id: practice.companyId,
        businessName: sourceCompanyName,
        nit: practice.company?.nit || 'N/A',
      },
      targetCompany: {
        id: targetCompany.id,
        businessName: targetCompany.businessName,
        nit: targetCompany.nit,
        isUfpsContingency: isUfpsTarget,
      },
      newTutor: resolvedTutor,
      teacher: practice.teacher
        ? {
            id: practice.teacher.id,
            name: practice.teacher.name,
            email: practice.teacher.email,
          }
        : null,
      previousStatus,
      currentStatus: newStatus,
      transferStatus,
      hoursPreserved: {
        hoursTransferredFromOrigin: hoursTransferred,
        totalHoursCompleted: hoursTransferred,
        totalHoursRequired,
        remainingHoursToComplete,
        previousReportsPreservedCount,
        previousLogsPreservedCount,
      },
      arlReevaluation: {
        previousArlValidatedAt: practice.arlValidatedAt
          ? new Date(practice.arlValidatedAt).toISOString()
          : null,
        newArlStatus: 'PENDIENTE_REVISION',
        arlSemaphoreLabel: 'Pendiente de revisión',
        requiresNewFacilityCoverageValidation: true,
        isUfpsCampusCoverage: isUfpsTarget,
        coverageNote: arlCoverageNote,
      },
      ufpsContingencyApplied: isUfpsTarget,
      ufpsWarningConfirmed: isUfpsTarget,
      ufpsJustification: isUfpsTarget ? finalJustification : null,
      notificationsSent: {
        student: true,
        newCompany: true,
        teacher: true,
        items: notificationItems,
      },
      message: `Traslado empresarial confirmado exitosamente hacia '${targetCompany.businessName}' con nuevo tutor '${resolvedTutor.name}'. Se preservaron ${hoursTransferred} hora(s) como saldo a favor (RN01), se activó la reevaluación de cobertura ARL para las nuevas instalaciones (RN03) y se notificó al estudiante, a la nueva empresa y al docente tutor.`,
    };
  }
}

let practiceTransferServiceInstance: PracticeTransferService | null = null;

export function getPracticeTransferService(): PracticeTransferService {
  if (!practiceTransferServiceInstance) {
    practiceTransferServiceInstance = new PracticeTransferService();
  }
  return practiceTransferServiceInstance;
}

export function setPracticeTransferServiceInstance(
  instance: PracticeTransferService | null
): void {
  practiceTransferServiceInstance = instance;
}

export const practiceTransferService = getPracticeTransferService();
