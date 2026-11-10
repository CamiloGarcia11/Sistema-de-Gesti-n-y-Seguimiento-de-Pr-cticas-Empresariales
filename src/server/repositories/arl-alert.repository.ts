// ==============================================================================
// SIGETRAP - Repositorio de Monitoreo y Alertas de ARL Estudiante
// Gestiona la persistencia de pólizas ARL, fechas de vigencia, estados de revisión
// y bitácoras de auditoría en practices, practice_status_history y archivos_adjuntos.
// ==============================================================================

import prisma from '@/lib/prisma';
import { ArlStatus } from '@/types';

export interface PracticeArlRecord {
  id: string;
  studentId: string;
  companyId: string;
  currentStatus: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  arlSupportUrl: string | null;
  arlValidatedAt: Date | string | null;
  arlValidatedById: string | null;
  arlExpirationDate?: Date | string | null;
  arlStatus?: ArlStatus | null;
  arlPolicyNumber?: string | null;
  arlEntityName?: string | null;
  arlRejectionReason?: string | null;
  isActive: boolean;
  student: {
    id: string;
    name: string;
    email: string;
    studentCode: string | null;
    documentNumber: string | null;
    program: string | null;
  };
  company: {
    id: string;
    businessName: string;
    nit: string | null;
  };
  statusHistory?: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    notes: string | null;
    metadata: any;
    createdAt: Date | string;
  }>;
}

export class ArlAlertRepository {
  /**
   * Extrae los metadatos extendidos de ARL desde el registro de práctica o desde el historial JSONB
   */
  extractHydratedArlRecord(rawPractice: any): PracticeArlRecord {
    const history: any[] = Array.isArray(rawPractice.statusHistory) ? rawPractice.statusHistory : [];
    const latestArlMetaEntry = history.find(
      (h) => h && h.metadata && typeof h.metadata === 'object' && h.metadata.arlMetadata === true
    );
    const meta = latestArlMetaEntry?.metadata || {};

    const arlExpirationDate =
      rawPractice.arlExpirationDate !== undefined
        ? rawPractice.arlExpirationDate
        : meta.arlExpirationDate !== undefined
        ? meta.arlExpirationDate
        : rawPractice.arlValidatedAt && rawPractice.endDate
        ? rawPractice.endDate
        : null;

    const arlStatus =
      rawPractice.arlStatus !== undefined
        ? rawPractice.arlStatus
        : meta.arlStatus !== undefined
        ? meta.arlStatus
        : null;

    const arlPolicyNumber =
      rawPractice.arlPolicyNumber !== undefined
        ? rawPractice.arlPolicyNumber
        : meta.arlPolicyNumber ?? null;

    const arlEntityName =
      rawPractice.arlEntityName !== undefined
        ? rawPractice.arlEntityName
        : meta.arlEntityName ?? null;

    const arlRejectionReason =
      rawPractice.arlRejectionReason !== undefined
        ? rawPractice.arlRejectionReason
        : meta.arlRejectionReason ?? null;

    return {
      id: rawPractice.id,
      studentId: rawPractice.studentId,
      companyId: rawPractice.companyId,
      currentStatus: rawPractice.currentStatus,
      startDate: rawPractice.startDate ?? null,
      endDate: rawPractice.endDate ?? null,
      arlSupportUrl: rawPractice.arlSupportUrl ?? null,
      arlValidatedAt: rawPractice.arlValidatedAt ?? null,
      arlValidatedById: rawPractice.arlValidatedById ?? null,
      arlExpirationDate,
      arlStatus,
      arlPolicyNumber,
      arlEntityName,
      arlRejectionReason,
      isActive: rawPractice.isActive ?? true,
      student: {
        id: rawPractice.student?.id || rawPractice.studentId,
        name: rawPractice.student?.name || 'Estudiante en Práctica',
        email: rawPractice.student?.email || 'estudiante@ufps.edu.co',
        studentCode: rawPractice.student?.studentCode ?? null,
        documentNumber: rawPractice.student?.documentNumber ?? null,
        program: rawPractice.student?.program || 'Ingeniería de Sistemas',
      },
      company: {
        id: rawPractice.company?.id || rawPractice.companyId,
        businessName: rawPractice.company?.businessName || 'Empresa Receptora',
        nit: rawPractice.company?.nit ?? null,
      },
      statusHistory: history,
    };
  }

  /**
   * Consulta todas las prácticas activas o en alistamiento para evaluación de ARL
   */
  async findAllPracticesForArlEvaluation(params?: {
    studentId?: string;
    practiceId?: string;
  }): Promise<PracticeArlRecord[]> {
    const where: Record<string, any> = {
      deletedAt: null,
    };
    if (params?.studentId) {
      where.studentId = params.studentId;
    }
    if (params?.practiceId) {
      where.id = params.practiceId;
    }

    const practices = await prisma.practice.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentCode: true,
            documentNumber: true,
            program: true,
          },
        },
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return practices.map((p: any) => this.extractHydratedArlRecord(p));
  }

  /**
   * Busca la práctica principal de un estudiante para operaciones de ARL
   */
  async findActivePracticeByStudentId(
    studentId: string,
    practiceId?: string
  ): Promise<PracticeArlRecord | null> {
    const records = await this.findAllPracticesForArlEvaluation({
      studentId,
      practiceId,
    });
    if (records.length === 0) return null;
    const active = records.find(
      (r) => r.currentStatus !== 'FINALIZADA' && r.currentStatus !== 'CERRADA' && r.currentStatus !== 'CANCELADO'
    );
    return active || records[0];
  }

  /**
   * Busca una práctica por su ID primario con datos de ARL hidratados
   */
  async findPracticeById(practiceId: string): Promise<PracticeArlRecord | null> {
    const records = await this.findAllPracticesForArlEvaluation({ practiceId });
    return records[0] || null;
  }

  /**
   * RN02: Registra la subida de un nuevo certificado/póliza de ARL dejando el estado en "Pendiente de revisión"
   */
  async saveArlDocumentUpload(params: {
    practiceId: string;
    studentId: string;
    actorId: string;
    currentPracticeStatus: string;
    arlSupportUrl: string;
    arlExpirationDate: Date;
    arlPolicyNumber?: string | null;
    arlEntityName?: string | null;
    observations?: string | null;
  }): Promise<PracticeArlRecord> {
    await prisma.practice.update({
      where: { id: params.practiceId },
      data: {
        arlSupportUrl: params.arlSupportUrl,
        arlValidatedAt: null,
        arlValidatedById: null,
      },
    });

    await prisma.practiceStatusHistory.create({
      data: {
        practiceId: params.practiceId,
        fromStatus: params.currentPracticeStatus as any,
        toStatus: params.currentPracticeStatus as any,
        changedByUserId: params.actorId,
        notes:
          params.observations ||
          `Soporte de renovación de ARL cargado por el estudiante. Estado ARL: Pendiente de revisión (RN02). Vigencia hasta: ${params.arlExpirationDate.toISOString().split('T')[0]}`,
        metadata: {
          arlMetadata: true,
          action: 'ARL_DOCUMENT_UPLOADED',
          arlStatus: 'PENDIENTE_REVISION',
          arlSupportUrl: params.arlSupportUrl,
          arlExpirationDate: params.arlExpirationDate.toISOString(),
          arlPolicyNumber: params.arlPolicyNumber || null,
          arlEntityName: params.arlEntityName || null,
          arlRejectionReason: null,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    const updated = await this.findPracticeById(params.practiceId);
    return updated!;
  }

  /**
   * RN02: Registra la validación (aprobación o rechazo) de la póliza ARL por el Coordinador
   */
  async saveArlValidationResult(params: {
    practiceId: string;
    actorId: string;
    currentPracticeStatus: string;
    approved: boolean;
    arlSupportUrl: string | null;
    arlExpirationDate: Date | null;
    arlPolicyNumber?: string | null;
    arlEntityName?: string | null;
    rejectionReason?: string | null;
    observations?: string | null;
  }): Promise<PracticeArlRecord> {
    const now = new Date();

    await prisma.practice.update({
      where: { id: params.practiceId },
      data: {
        arlValidatedAt: params.approved ? now : null,
        arlValidatedById: params.approved ? params.actorId : null,
      },
    });

    await prisma.practiceStatusHistory.create({
      data: {
        practiceId: params.practiceId,
        fromStatus: params.currentPracticeStatus as any,
        toStatus: params.currentPracticeStatus as any,
        changedByUserId: params.actorId,
        notes: params.approved
          ? params.observations || 'Certificado de ARL validado y aprobado por la Coordinación de Prácticas.'
          : `Certificado de ARL rechazado por Coordinación: ${params.rejectionReason || 'Documento ilegible o inconsistente'}`,
        metadata: {
          arlMetadata: true,
          action: params.approved ? 'ARL_VALIDATED' : 'ARL_REJECTED',
          approved: params.approved,
          arlStatus: params.approved ? null : 'SIN_AFILIACION',
          arlSupportUrl: params.arlSupportUrl,
          arlExpirationDate: params.arlExpirationDate ? params.arlExpirationDate.toISOString() : null,
          arlPolicyNumber: params.arlPolicyNumber || null,
          arlEntityName: params.arlEntityName || null,
          arlRejectionReason: params.approved ? null : params.rejectionReason || 'Póliza rechazada en revisión',
          validatedAt: params.approved ? now.toISOString() : null,
          validatedById: params.actorId,
        },
      },
    });

    const updated = await this.findPracticeById(params.practiceId);
    return updated!;
  }

  /**
   * RN01 & Criterio 3: Registra en auditoría cuando la revisión periódica marca una ARL como "Vencido"
   */
  async recordExpiredArlFromPeriodicCheck(params: {
    practiceId: string;
    currentPracticeStatus: string;
    arlSupportUrl: string | null;
    arlExpirationDate: string | null;
    arlPolicyNumber?: string | null;
    arlEntityName?: string | null;
    coordinatorId?: string | null;
  }): Promise<void> {
    if (!params.coordinatorId) return;
    await prisma.practiceStatusHistory.create({
      data: {
        practiceId: params.practiceId,
        fromStatus: params.currentPracticeStatus as any,
        toStatus: params.currentPracticeStatus as any,
        changedByUserId: params.coordinatorId,
        notes:
          'Revisión periódica automática (RN01): La fecha de vigencia de la ARL ha expirado. Indicador cambiado a "Vencido" y registro de bitácoras restringido (Criterio 3).',
        metadata: {
          arlMetadata: true,
          action: 'ARL_PERIODIC_CHECK_EXPIRED',
          arlStatus: 'VENCIDO',
          arlSupportUrl: params.arlSupportUrl,
          arlExpirationDate: params.arlExpirationDate,
          arlPolicyNumber: params.arlPolicyNumber || null,
          arlEntityName: params.arlEntityName || null,
          evaluatedAt: new Date().toISOString(),
        },
      },
    });
  }
}

export const arlAlertRepository = new ArlAlertRepository();
