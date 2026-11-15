// ==============================================================================
// SIGETRAP - Repositorio de Traslado y Reubicación de Practicante (HU20)
// Gestiona la tabla practice_transfers, el campo transfer_status en practices,
// la generación del informe de corte, la consulta de empresas compatibles
// (con UFPS como contingencia de última instancia) y la preservación del histórico.
// ==============================================================================

import prisma from '@/lib/prisma';
import crypto from 'crypto';
import {
  PracticeStatus,
  PracticeTransferReasonCode,
  PracticeTransferStatus,
} from '@/types';

export const UFPS_CONTINGENCY_COMPANY_ID = 'a9999999-9999-9999-9999-999999999999';
export const UFPS_INSTITUTIONAL_NIT = '890500622-6';

export function isUfpsCompany(company?: {
  id?: string | null;
  nit?: string | null;
  businessName?: string | null;
} | null): boolean {
  if (!company) return false;
  if (company.id === UFPS_CONTINGENCY_COMPANY_ID) return true;
  const nit = (company.nit || '').trim();
  if (nit.startsWith('890500622') || nit.startsWith('890.500.622')) return true;
  const name = (company.businessName || '').toUpperCase();
  return (
    name.includes('UFPS') ||
    name.includes('UNIVERSIDAD FRANCISCO DE PAULA SANTANDER')
  );
}

export class PracticeTransferRepository {
  /**
   * Obtiene una práctica con todo su contexto académico, informes previos,
   * empresa actual, tutor, docente y expedientes de traslado (practice_transfers).
   */
  async findPracticeWithTransferContext(practiceId: string): Promise<any | null> {
    const practice = await (prisma.practice as any).findUnique({
      where: { id: practiceId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentCode: true,
            documentNumber: true,
            program: true,
            specialty: true,
            academicAverage: true,
            approvedCredits: true,
          },
        },
        company: {
          include: {
            agreements: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        vacancy: {
          select: {
            id: true,
            title: true,
            description: true,
            requirements: true,
            program: true,
            academicPeriod: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            specialty: true,
          },
        },
        tutor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            program: true,
            status: true,
            isActive: true,
          },
        },
        workPlan: true,
        advanceReports: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        reports: {
          orderBy: { createdAt: 'desc' },
        },
        followUpLogs: {
          where: { deletedAt: null },
          orderBy: { fechaActividad: 'desc' },
        },
        transfers: {
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!practice) return null;

    // Hidratar estado de traslado desde historial si la BD subyacente usó fallback
    const history: any[] = Array.isArray(practice.statusHistory) ? practice.statusHistory : [];
    const latestTransferHistory = history.find(
      (h) => h?.metadata && typeof h.metadata === 'object' && h.metadata.caseOfUse === 'HU20'
    );

    if (latestTransferHistory?.metadata) {
      const meta = latestTransferHistory.metadata;
      if (!practice.transferStatus && meta.transferStatus) {
        practice.transferStatus = meta.transferStatus;
      }
      if (
        meta.action === 'TRANSFER_REQUESTED' &&
        (practice.currentStatus === 'REUBICACION_PENDIENTE' ||
          practice.transferStatus === 'EN_TRASLADO_EMPRESARIAL')
      ) {
        practice.currentStatus = 'EN_TRASLADO_EMPRESARIAL';
        practice.transferStatus = 'EN_TRASLADO_EMPRESARIAL';
      }
    }

    return practice;
  }

  /**
   * Criterio 1 & RN01: Congela la práctica actual, marca la causa AUSENCIA_TUTOR_EMPRESARIAL,
   * genera el informe de corte con las horas acumuladas y registra el expediente en practice_transfers.
   */
  async createTransferRequestAndFreezePractice(params: {
    practiceId: string;
    studentId: string;
    sourceCompanyId: string;
    previousStatus: PracticeStatus;
    reasonCode: PracticeTransferReasonCode;
    justification: string;
    hoursTransferred: number;
    approvedById: string;
    cutoffReportData: {
      id: string;
      code: string;
      summary: string;
      generatedAt: string;
    };
  }) {
    // 1. Actualizar la práctica: congelar y pasar a EN_TRASLADO_EMPRESARIAL, preservando totalHoursCompleted
    const updatedPractice = await (prisma.practice as any).update({
      where: { id: params.practiceId },
      data: {
        currentStatus: 'EN_TRASLADO_EMPRESARIAL',
        transferStatus: 'EN_TRASLADO_EMPRESARIAL',
        tutorId: null,
        totalHoursCompleted: params.hoursTransferred,
        updatedAt: new Date(),
      },
    });

    // 2. Si hay horas acumuladas (> 0), asentar también el registro formal de informe de corte en informes_avance
    if (params.hoursTransferred > 0) {
      try {
        await prisma.advanceReport.create({
          data: {
            id: params.cutoffReportData.id,
            practicaId: params.practiceId,
            estudianteId: params.studentId,
            tipo: 'CORTE_TRASLADO',
            estado: 'Aprobado',
            horasEjecutadas: params.hoursTransferred,
            descripcionActividades: params.cutoffReportData.summary,
            fechaEntrega: new Date(params.cutoffReportData.generatedAt),
            revisadoPorId: params.approvedById,
            revisadoAt: new Date(params.cutoffReportData.generatedAt),
            observaciones: `Informe oficial de corte por traslado empresarial (${params.cutoffReportData.code}). Causa: ${params.reasonCode}. ${params.justification}`,
          },
        });
      } catch {
        // Ignorar si el ID ya existe o si hay restricción en entorno mock
      }
    }

    // 3. Crear el expediente en la tabla practice_transfers
    const transferRecord = await (prisma as any).practiceTransfer.create({
      data: {
        id: crypto.randomUUID(),
        practiceId: params.practiceId,
        sourceCompanyId: params.sourceCompanyId,
        targetCompanyId: null,
        reasonCode: params.reasonCode,
        justification: params.justification,
        hoursTransferred: params.hoursTransferred,
        approvedById: params.approvedById,
        createdAt: new Date(),
      },
    });

    // 4. Registrar auditoría inmutable en practice_status_history
    await prisma.practiceStatusHistory.create({
      data: {
        practiceId: params.practiceId,
        fromStatus: params.previousStatus as any,
        toStatus: 'EN_TRASLADO_EMPRESARIAL' as any,
        changedByUserId: params.approvedById,
        notes: `Protocolo de traslado iniciado (HU20). Causa: ${params.reasonCode}. Práctica congelada con ${params.hoursTransferred} hora(s) avaladas en informe de corte ${params.cutoffReportData.code}.`,
        metadata: {
          caseOfUse: 'HU20',
          action: 'TRANSFER_REQUESTED',
          transferId: transferRecord.id,
          transferStatus: 'EN_TRASLADO_EMPRESARIAL',
          isFrozen: true,
          reasonCode: params.reasonCode,
          justification: params.justification,
          sourceCompanyId: params.sourceCompanyId,
          hoursTransferred: params.hoursTransferred,
          cutoffReport: params.cutoffReportData,
          requestedAt: params.cutoffReportData.generatedAt,
        },
      },
    });

    return {
      practice: updatedPractice,
      transfer: transferRecord,
    };
  }

  /**
   * Construye la opción institucional de contingencia UFPS (Centro de Cómputo / División de Sistemas)
   * para garantizar que siempre esté disponible como última instancia (Criterio 2 & RN02).
   */
  getFallbackUfpsCompanyRecord(coordinatorId?: string) {
    const now = new Date();
    const futureDate = new Date(now.getFullYear() + 4, 11, 31);
    return {
      id: UFPS_CONTINGENCY_COMPANY_ID,
      nit: UFPS_INSTITUTIONAL_NIT,
      businessName: 'Universidad Francisco de Paula Santander (UFPS - Dependencias Internas)',
      legalRepresentative: 'Rectoría / División de Sistemas y Centro de Cómputo UFPS',
      contactEmail: 'division.sistemas@ufps.edu.co',
      contactPhone: '+57 607 5776655',
      address: 'Av. Gran Colombia No. 12E-96 Barrio Colsag',
      city: 'Cúcuta',
      isActive: true,
      agreements: [
        {
          id: 'b9999999-9999-9999-9999-999999999999',
          companyId: UFPS_CONTINGENCY_COMPANY_ID,
          agreementNumber: 'CONV-UFPS-INTERNO-2026',
          status: 'VIGENTE',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: futureDate,
          signedByDirector: true,
        },
      ],
      vacancies: [
        {
          id: 'd9999999-9999-9999-9999-999999999999',
          companyId: UFPS_CONTINGENCY_COMPANY_ID,
          createdById: coordinatorId || 'c2222222-2222-2222-2222-222222222222',
          title: 'Practicante de Ingeniería - Centro de Cómputo y División de Sistemas UFPS',
          description:
            'Dependencia interna institucional de última instancia para continuidad formativa en desarrollo de software, infraestructura y sistemas académicos.',
          requirements:
            'TypeScript, React, Node.js, SQL, Desarrollo de Software, Bases de Datos, Ingeniería de Sistemas',
          program: 'Ingeniería de Sistemas',
          vacanciesCount: 5,
          status: 'PUBLICADA',
          _count: { applications: 0, practices: 0 },
        },
      ],
      tutors: [
        {
          id: 'c2222222-2222-2222-2222-222222222222',
          name: 'Dr. Roberto Gómez (Jefe División de Sistemas / Tutor Institucional UFPS)',
          email: 'director.sistemas@ufps.edu.co',
          program: 'Jefe División de Sistemas - Supervisor Institucional UFPS',
          role: 'TUTOR_EMPRESARIAL',
          status: 'ACTIVO',
          isActive: true,
        },
      ],
    };
  }

  /**
   * Criterio 2: Consulta todas las empresas activas (excluyendo la empresa de origen)
   * con sus convenios, vacantes disponibles y tutores activos para evaluar compatibilidad.
   */
  async findCandidateCompaniesForTransfer(excludeCompanyId: string): Promise<any[]> {
    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        id: { not: excludeCompanyId },
      },
      include: {
        agreements: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        vacancies: {
          where: {
            deletedAt: null,
            status: { in: ['PUBLICADA', 'EN_SELECCION'] as any },
          },
          include: {
            _count: {
              select: {
                applications: true,
                practices: true,
              },
            },
          },
        },
        tutors: {
          where: {
            deletedAt: null,
            isActive: true,
            status: 'ACTIVO',
          },
          select: {
            id: true,
            name: true,
            email: true,
            program: true,
            role: true,
            status: true,
            isActive: true,
          },
        },
      },
    });

    const hasUfpsInDb = companies.some((c: any) => isUfpsCompany(c));
    if (!hasUfpsInDb && excludeCompanyId !== UFPS_CONTINGENCY_COMPANY_ID) {
      companies.push(this.getFallbackUfpsCompanyRecord() as any);
    }

    return companies;
  }

  /**
   * Obtiene el detalle de una empresa destino por su ID (incluyendo soporte para contingencia UFPS).
   */
  async findTargetCompanyById(companyId: string): Promise<any | null> {
    const found = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        agreements: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        vacancies: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        tutors: {
          where: {
            deletedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
            program: true,
            role: true,
            status: true,
            isActive: true,
          },
        },
      },
    });

    if (found) return found;

    if (companyId === UFPS_CONTINGENCY_COMPANY_ID) {
      return this.getFallbackUfpsCompanyRecord();
    }

    return null;
  }

  /**
   * Criterio 3, RN01, RN02, RN03:
   * Ejecuta la confirmación formal del traslado hacia la nueva empresa receptora:
   * - Actualiza empresa, nuevo tutor empresarial y vacante en la práctica
   * - Preserva las horas acumuladas e historial de informes del periodo anterior
   * - Actualiza el expediente en practice_transfers
   * - Reevalúa el estado de ARL para las nuevas instalaciones físicas (o amparo sede UFPS)
   */
  async confirmPracticeTransfer(params: {
    practiceId: string;
    sourceCompanyId: string;
    targetCompanyId: string;
    targetCompanyData: any;
    targetTutorId: string;
    targetVacancyId: string | null;
    previousStatus: PracticeStatus;
    newStatus: PracticeStatus;
    transferStatus: PracticeTransferStatus;
    hoursTransferred: number;
    justification: string;
    approvedById: string;
    isUfpsContingency: boolean;
    arlSupportUrl?: string | null;
    arlCoverageNote: string;
    notificationsMetadata: any[];
  }) {
    // Si la empresa destino es la UFPS de contingencia y aún no existe físicamente en companies, asegurar su registro
    if (params.targetCompanyId === UFPS_CONTINGENCY_COMPANY_ID) {
      try {
        const existingUfps = await prisma.company.findUnique({
          where: { id: UFPS_CONTINGENCY_COMPANY_ID },
        });
        if (!existingUfps) {
          const byNit = await prisma.company.findUnique({
            where: { nit: UFPS_INSTITUTIONAL_NIT },
          });
          if (!byNit) {
            await prisma.company.create({
              data: {
                id: UFPS_CONTINGENCY_COMPANY_ID,
                nit: UFPS_INSTITUTIONAL_NIT,
                businessName: params.targetCompanyData.businessName,
                legalRepresentative: params.targetCompanyData.legalRepresentative,
                contactEmail: params.targetCompanyData.contactEmail,
                contactPhone: params.targetCompanyData.contactPhone,
                address: params.targetCompanyData.address,
                city: params.targetCompanyData.city,
                isActive: true,
              },
            });
          }
        }
      } catch {
        // Ignorar si ya existe
      }
    }

    // 1. Actualizar la práctica con la nueva empresa, nuevo tutor, horas preservadas (RN01) y reevaluación de ARL (RN03)
    const updatedPractice = await (prisma.practice as any).update({
      where: { id: params.practiceId },
      data: {
        companyId: params.targetCompanyId,
        tutorId: params.targetTutorId,
        ...(params.targetVacancyId ? { vacancyId: params.targetVacancyId } : {}),
        currentStatus: params.newStatus,
        transferStatus: params.transferStatus,
        totalHoursCompleted: params.hoursTransferred,
        // RN03: Al cambiar de instalaciones físicas, se requiere reevaluación de cobertura ARL
        arlValidatedAt: null,
        arlValidatedById: null,
        ...(params.arlSupportUrl ? { arlSupportUrl: params.arlSupportUrl } : {}),
        updatedAt: new Date(),
      },
    });

    // 2. Actualizar el expediente abierto en practice_transfers o crear uno consolidado
    const existingTransfers = await (prisma as any).practiceTransfer.findMany({
      where: { practiceId: params.practiceId },
      orderBy: { createdAt: 'desc' },
    });

    const openTransfer = existingTransfers.find((t: any) => !t.targetCompanyId) || existingTransfers[0];
    let transferRecord: any;

    if (openTransfer) {
      transferRecord = await (prisma as any).practiceTransfer.update({
        where: { id: openTransfer.id },
        data: {
          targetCompanyId: params.targetCompanyId,
          justification: params.justification,
          hoursTransferred: params.hoursTransferred,
          approvedById: params.approvedById,
        },
      });
    } else {
      transferRecord = await (prisma as any).practiceTransfer.create({
        data: {
          id: crypto.randomUUID(),
          practiceId: params.practiceId,
          sourceCompanyId: params.sourceCompanyId,
          targetCompanyId: params.targetCompanyId,
          reasonCode: 'AUSENCIA_TUTOR_EMPRESARIAL',
          justification: params.justification,
          hoursTransferred: params.hoursTransferred,
          approvedById: params.approvedById,
          createdAt: new Date(),
        },
      });
    }

    // 3. Registrar trazabilidad histórica y disparar reevaluación ARL (RN03)
    await prisma.practiceStatusHistory.create({
      data: {
        practiceId: params.practiceId,
        fromStatus: params.previousStatus as any,
        toStatus: params.newStatus as any,
        changedByUserId: params.approvedById,
        notes: `Traslado empresarial confirmado (HU20). Nueva entidad receptora: ${params.targetCompanyData.businessName}. Horas preservadas a favor (RN01): ${params.hoursTransferred}. ${params.arlCoverageNote}`,
        metadata: {
          caseOfUse: 'HU20',
          action: 'TRANSFER_CONFIRMED',
          transferId: transferRecord.id,
          transferStatus: params.transferStatus,
          sourceCompanyId: params.sourceCompanyId,
          targetCompanyId: params.targetCompanyId,
          targetTutorId: params.targetTutorId,
          hoursTransferred: params.hoursTransferred,
          isUfpsContingency: params.isUfpsContingency,
          justification: params.justification,
          // Metadatos ARL para integración con ArlAlertService (RN03)
          arlMetadata: true,
          arlStatus: 'PENDIENTE_REVISION',
          arlSupportUrl: params.arlSupportUrl || updatedPractice.arlSupportUrl || '/uploads/arl/pendiente-endoso-traslado.pdf',
          requiresNewFacilityCoverageValidation: true,
          isUfpsCampusCoverage: params.isUfpsContingency,
          arlCoverageNote: params.arlCoverageNote,
          notificationsSent: params.notificationsMetadata,
          confirmedAt: new Date().toISOString(),
        },
      },
    });

    return {
      practice: updatedPractice,
      transfer: transferRecord,
    };
  }
}

export const practiceTransferRepository = new PracticeTransferRepository();
