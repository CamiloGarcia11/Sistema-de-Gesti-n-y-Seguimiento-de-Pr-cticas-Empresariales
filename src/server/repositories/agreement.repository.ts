// ==============================================================================
// SIGETRAP - Repositorio de Convenios Empresariales y Prerrequisitos Jurídicos
// Capa de Repositorios (RNF11)
// ==============================================================================

import prisma from '@/lib/prisma';
import { AgreementStatus } from '@/types';

export class AgreementRepository {
  /**
   * Verifica si una empresa tiene al menos un convenio VIGENTE no vencido (RN-01)
   */
  async findActiveAgreementByCompanyId(companyId: string) {
    const now = new Date();
    return prisma.agreement.findFirst({
      where: {
        companyId,
        status: 'VIGENTE',
        startDate: { lte: now },
        endDate: { gte: now },
        deletedAt: null,
      },
    });
  }

  /**
   * RN01 (Flujo Jurídica UFPS): Verifica si la empresa cuenta con al menos un convenio
   * con visto bueno final de Jurídica UFPS (APROBADO_JURIDICA o VIGENTE) y no vencido.
   */
  async findApprovedOrActiveAgreementByCompanyId(companyId: string) {
    const now = new Date();
    return prisma.agreement.findFirst({
      where: {
        companyId,
        status: { in: ['APROBADO_JURIDICA', 'VIGENTE'] as AgreementStatus[] },
        endDate: { gte: now },
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Obtiene todos los convenios registrados para una empresa
   */
  async findByCompanyId(companyId: string) {
    return prisma.agreement.findMany({
      where: { companyId, deletedAt: null },
      include: {
        company: true,
        prerequisites: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtiene un convenio por ID con empresa y prerrequisitos documentales
   */
  async findById(agreementId: string) {
    return prisma.agreement.findUnique({
      where: { id: agreementId },
      include: {
        company: true,
        prerequisites: true,
      },
    });
  }

  /**
   * Lista convenios con filtros opcionales por empresa, estado y búsqueda
   */
  async findMany(params: {
    companyId?: string;
    status?: string;
    search?: string;
  } = {}) {
    const where: Record<string, any> = {
      deletedAt: null,
    };

    if (params.companyId) {
      where.companyId = params.companyId;
    }

    if (params.status) {
      where.status = params.status;
    }

    const list = await prisma.agreement.findMany({
      where,
      include: {
        company: true,
        prerequisites: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      return list.filter(
        (ag: any) =>
          ag.agreementNumber?.toLowerCase().includes(q) ||
          ag.juridicaRadicadoNumber?.toLowerCase().includes(q) ||
          ag.company?.businessName?.toLowerCase().includes(q) ||
          ag.company?.nit?.toLowerCase().includes(q)
      );
    }

    return list;
  }

  /**
   * Crea un nuevo convenio
   */
  async create(data: {
    companyId: string;
    agreementNumber: string;
    status?: AgreementStatus;
    startDate: Date;
    endDate: Date;
    documentUrl?: string | null;
    signedByDirector?: boolean;
    notes?: string | null;
  }) {
    return prisma.agreement.create({
      data: {
        companyId: data.companyId,
        agreementNumber: data.agreementNumber,
        status: (data.status || 'BORRADOR') as any,
        startDate: data.startDate,
        endDate: data.endDate,
        documentUrl: data.documentUrl ?? null,
        signedByDirector: data.signedByDirector ?? false,
        notes: data.notes ?? null,
      },
      include: {
        company: true,
        prerequisites: true,
      },
    });
  }

  /**
   * Actualiza un convenio existente
   */
  async update(agreementId: string, data: Record<string, any>) {
    return prisma.agreement.update({
      where: { id: agreementId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        company: true,
        prerequisites: true,
      },
    });
  }

  /**
   * Lista los prerrequisitos cargados de un convenio
   */
  async findPrerequisitesByAgreementId(agreementId: string) {
    return prisma.agreementPrerequisite.findMany({
      where: { agreementId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Crea o actualiza un prerrequisito documental por (agreementId, documentType)
   */
  async upsertPrerequisite(data: {
    agreementId: string;
    documentType: string;
    fileUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
    issuedAt?: Date | null;
    verificationStatus?: string;
    observations?: string | null;
    uploadedById?: string | null;
  }) {
    const existing = await prisma.agreementPrerequisite.findFirst({
      where: {
        agreementId: data.agreementId,
        documentType: data.documentType,
      },
    });

    if (existing) {
      return prisma.agreementPrerequisite.update({
        where: { id: existing.id },
        data: {
          fileUrl: data.fileUrl,
          fileName: data.fileName ?? existing.fileName,
          mimeType: data.mimeType ?? existing.mimeType,
          issuedAt: data.issuedAt !== undefined ? data.issuedAt : existing.issuedAt,
          verificationStatus: data.verificationStatus || 'PENDIENTE',
          observations: data.observations !== undefined ? data.observations : null,
          uploadedById: data.uploadedById ?? existing.uploadedById,
          reviewedAt: null,
          reviewedById: null,
          updatedAt: new Date(),
        },
      });
    }

    return prisma.agreementPrerequisite.create({
      data: {
        agreementId: data.agreementId,
        documentType: data.documentType,
        fileUrl: data.fileUrl,
        fileName: data.fileName ?? null,
        mimeType: data.mimeType ?? null,
        issuedAt: data.issuedAt ?? null,
        verificationStatus: data.verificationStatus || 'PENDIENTE',
        observations: data.observations ?? null,
        uploadedById: data.uploadedById ?? null,
      },
    });
  }

  /**
   * Actualiza el estado de verificación de los prerrequisitos de un convenio
   */
  async updatePrerequisitesVerification(params: {
    agreementId: string;
    verificationStatus: string;
    reviewedById?: string | null;
    reviewedAt?: Date | null;
    observations?: string | null;
    documentTypes?: string[];
  }) {
    const all = await this.findPrerequisitesByAgreementId(params.agreementId);
    const updated = [];
    for (const item of all) {
      if (params.documentTypes && params.documentTypes.length > 0 && !params.documentTypes.includes(item.documentType)) {
        continue;
      }
      const res = await prisma.agreementPrerequisite.update({
        where: { id: item.id },
        data: {
          verificationStatus: params.verificationStatus,
          reviewedById: params.reviewedById ?? null,
          reviewedAt: params.reviewedAt ?? new Date(),
          observations: params.observations !== undefined ? params.observations : item.observations,
          updatedAt: new Date(),
        },
      });
      updated.push(res);
    }
    return updated;
  }
}

export const agreementRepository = new AgreementRepository();
