// ==============================================================================
// SIGETRAP - Repositorio de Convenios Empresariales
// Capa de Repositorios (RNF11)
// ==============================================================================

import prisma from '@/lib/prisma';

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
   * Obtiene todos los convenios registrados para una empresa
   */
  async findByCompanyId(companyId: string) {
    return prisma.agreement.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const agreementRepository = new AgreementRepository();
