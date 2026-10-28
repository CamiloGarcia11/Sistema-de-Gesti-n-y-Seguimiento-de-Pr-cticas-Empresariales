// ==============================================================================
// SIGETRAP - Repositorio de Prácticas y Trazabilidad (Acceso a Datos)
// Capa de Repositorios (RNF11)
// ==============================================================================

import prisma from '@/lib/prisma';
import { PracticeStatus, WorkPlanStatus } from '@/types';
import { Prisma } from '@prisma/client';

export class PracticeRepository {
  /**
   * Obtiene una práctica por su ID con todas sus relaciones e historial de auditoría
   */
  async findById(practiceId: string) {
    return prisma.practice.findUnique({
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
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        tutor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            program: true,
            documentNumber: true,
            documentType: true,
            status: true,
            isActive: true,
          },
        },
        director: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        arlValidator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        workPlan: {
          include: {
            tutorApprovedBy: { select: { id: true, name: true, email: true } },
            teacherApprovedBy: { select: { id: true, name: true, email: true } },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: {
              select: {
                id: true,
                name: true,
                role: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Obtiene la práctica activa de un estudiante
   */
  async findActiveByStudentId(studentId: string) {
    return prisma.practice.findFirst({
      where: {
        studentId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        company: true,
        workPlan: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Transición Transaccional Atómica e Inmutable de Estado (RNF05, RNF15)
   * Actualiza el estado actual de la práctica y genera el registro en la tabla histórica.
   */
  async executeStatusTransition(params: {
    practiceId: string;
    fromStatus: PracticeStatus;
    toStatus: PracticeStatus;
    changedByUserId: string;
    notes?: string;
    metadata?: Record<string, unknown>;
    additionalPracticeData?: Prisma.PracticeUpdateInput;
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Actualizar entidad principal Practice
      const updatedPractice = await tx.practice.update({
        where: { id: params.practiceId },
        data: {
          currentStatus: params.toStatus,
          ...params.additionalPracticeData,
          updatedAt: new Date(),
        },
      });

      // 2. Registrar en la tabla histórica inmutable PracticeStatusHistory
      const historyEntry = await tx.practiceStatusHistory.create({
        data: {
          practiceId: params.practiceId,
          fromStatus: params.fromStatus,
          toStatus: params.toStatus,
          changedByUserId: params.changedByUserId,
          notes: params.notes,
          metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      return {
        practice: updatedPractice,
        historyEntry,
      };
    });
  }

  /**
   * Actualiza o crea el plan de trabajo asociado a una práctica
   */
  async upsertWorkPlan(params: {
    practiceId: string;
    objectives: string;
    methodology: string;
    schedule: Prisma.InputJsonValue;
    documentUrl?: string;
  }) {
    return prisma.workPlan.upsert({
      where: { practiceId: params.practiceId },
      create: {
        practiceId: params.practiceId,
        objectives: params.objectives,
        methodology: params.methodology,
        schedule: params.schedule,
        documentUrl: params.documentUrl,
        status: 'EN_REVISION',
      },
      update: {
        objectives: params.objectives,
        methodology: params.methodology,
        schedule: params.schedule,
        documentUrl: params.documentUrl,
        status: 'EN_REVISION',
        tutorApproved: false,
        tutorApprovedAt: null,
        teacherApproved: false,
        teacherApprovedAt: null,
      },
    });
  }

  /**
   * Registra la aprobación dual concurrente del Plan de Trabajo (RN-07 y RN-08)
   */
  async recordWorkPlanApproval(params: {
    workPlanId: string;
    approverRole: 'TUTOR_EMPRESARIAL' | 'DOCENTE_PRACTICA';
    approverUserId: string;
    approved: boolean;
    feedback?: string;
    newWorkPlanStatus: WorkPlanStatus;
  }) {
    const updateData: Prisma.WorkPlanUpdateInput = {
      status: params.newWorkPlanStatus,
      feedback: params.feedback,
    };

    if (params.approverRole === 'TUTOR_EMPRESARIAL') {
      updateData.tutorApproved = params.approved;
      updateData.tutorApprovedAt = params.approved ? new Date() : null;
      updateData.tutorApprovedBy = { connect: { id: params.approverUserId } };
    } else if (params.approverRole === 'DOCENTE_PRACTICA') {
      updateData.teacherApproved = params.approved;
      updateData.teacherApprovedAt = params.approved ? new Date() : null;
      updateData.teacherApprovedBy = { connect: { id: params.approverUserId } };
    }

    return prisma.workPlan.update({
      where: { id: params.workPlanId },
      data: updateData,
    });
  }

  /**
   * Consulta paginada y filtrada de prácticas para docentes, directores y tutores
   */
  async findMany(params: {
    teacherId?: string;
    tutorId?: string;
    companyId?: string;
    studentId?: string;
    status?: PracticeStatus;
    search?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.PracticeWhereInput = {
      deletedAt: null,
      ...(params.teacherId ? { teacherId: params.teacherId } : {}),
      ...(params.tutorId ? { tutorId: params.tutorId } : {}),
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.studentId ? { studentId: params.studentId } : {}),
      ...(params.status ? { currentStatus: params.status } : {}),
    };

    if (params.search) {
      const search = params.search.trim();
      where.OR = [
        { student: { name: { contains: search, mode: 'insensitive' } } },
        { student: { studentCode: { contains: search, mode: 'insensitive' } } },
        { student: { documentNumber: { contains: search, mode: 'insensitive' } } },
        { company: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.practice.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              studentCode: true,
              documentNumber: true,
              documentType: true,
              phone: true,
              program: true,
              academicAverage: true,
              approvedCredits: true,
              status: true,
            },
          },
          company: {
            select: {
              id: true,
              businessName: true,
              nit: true,
              city: true,
            },
          },
          vacancy: {
            select: {
              id: true,
              title: true,
              academicPeriod: true,
            },
          },
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          tutor: {
            select: {
              id: true,
              name: true,
              email: true,
              program: true,
              documentNumber: true,
              status: true,
            },
          },
          workPlan: {
            select: {
              id: true,
              status: true,
              tutorApproved: true,
              teacherApproved: true,
            },
          },
        },
      }),
      prisma.practice.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Asigna un supervisor inmediato (tutor empresarial) como evaluador directo de una práctica (CU09 - Criterio 3)
   */
  async assignTutorToPractice(params: {
    practiceId: string;
    tutorId: string;
    teacherId?: string;
    changedByUserId?: string;
    notes?: string;
  }) {
    return prisma.practice.update({
      where: { id: params.practiceId },
      data: {
        tutorId: params.tutorId,
        ...(params.teacherId ? { teacherId: params.teacherId } : {}),
        updatedAt: new Date(),
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentCode: true,
          },
        },
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
            isActive: true,
          },
        },
        tutor: {
          select: {
            id: true,
            name: true,
            email: true,
            program: true,
            documentNumber: true,
            documentType: true,
            phone: true,
            status: true,
            isActive: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Busca si el estudiante ya posee una práctica activa en estado "Formalizada" o "En Curso"
   * en el periodo lectivo vigente (HU13 / CU13 - Criterio 3: uq_estudiante_practica_periodo)
   */
  async findActiveFormalizedOrInCourseByStudentAndPeriod(params: {
    studentId: string;
    academicPeriod: string;
    excludePracticeId?: string;
  }) {
    const practices = await prisma.practice.findMany({
      where: {
        studentId: params.studentId,
        isActive: true,
        deletedAt: null,
        ...(params.excludePracticeId ? { id: { not: params.excludePracticeId } } : {}),
        currentStatus: {
          in: [
            'ASIGNADO_FORMALMENTE',
            'PRACTICA_EN_EJECUCION',
            'EVALUACION_PENDIENTE',
          ],
        },
      },
      include: {
        vacancy: {
          select: {
            id: true,
            title: true,
            academicPeriod: true,
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
          take: 5,
        },
      },
    });

    const normalizedPeriod = (params.academicPeriod || '2026-1').trim();

    return (
      practices.find((p: any) => {
        const pPeriod =
          p.academicPeriod ||
          p.periodoLectivo ||
          p.vacancy?.academicPeriod ||
          (p.statusHistory?.[0]?.metadata as any)?.academicPeriod ||
          '2026-1';
        return String(pPeriod).trim() === normalizedPeriod;
      }) || null
    );
  }

  /**
   * Obtiene un plan de trabajo por su ID (planes_trabajo)
   */
  async findWorkPlanById(workPlanId: string) {
    return prisma.workPlan.findUnique({
      where: { id: workPlanId },
    });
  }

  /**
   * Obtiene el plan de trabajo vinculado a una práctica
   */
  async findWorkPlanByPracticeId(practiceId: string) {
    return prisma.workPlan.findUnique({
      where: { practiceId },
    });
  }

  /**
   * Crea o actualiza transaccionalmente el registro de práctica formalizada en practicas_formativas (HU13 / CU13 - Criterio 1)
   */
  async saveFormalizedPractice(params: {
    practiceId?: string;
    studentId: string;
    companyId: string;
    vacancyId?: string | null;
    teacherId: string;
    tutorId: string;
    directorId: string;
    academicPeriod: string;
    targetInternalStatus: PracticeStatus;
    targetDomainStatus: string;
    startDate: Date;
    endDate?: Date | null;
    totalHoursRequired?: number;
    arlSupportUrl?: string | null;
    presentationLetterUrl?: string | null;
    notes?: string;
    workPlanData?: {
      id?: string;
      objectives: string;
      methodology: string;
      schedule: Prisma.InputJsonValue;
      documentUrl?: string | null;
      status: WorkPlanStatus;
      tutorApproved: boolean;
      teacherApproved: boolean;
      feedback?: string | null;
    };
  }) {
    return prisma.$transaction(async (tx) => {
      let practiceRecord: any;
      let previousStatus: PracticeStatus = 'ASPIRANTE';
      let isNew = false;

      if (params.practiceId) {
        const existing = await tx.practice.findUnique({
          where: { id: params.practiceId },
        });

        if (existing) {
          previousStatus = existing.currentStatus as PracticeStatus;
          practiceRecord = await tx.practice.update({
            where: { id: params.practiceId },
            data: {
              teacherId: params.teacherId,
              tutorId: params.tutorId,
              directorId: params.directorId,
              currentStatus: params.targetInternalStatus,
              startDate: params.startDate,
              ...(params.endDate !== undefined ? { endDate: params.endDate } : {}),
              ...(params.totalHoursRequired ? { totalHoursRequired: params.totalHoursRequired } : {}),
              ...(params.arlSupportUrl ? { arlSupportUrl: params.arlSupportUrl } : {}),
              ...(params.presentationLetterUrl
                ? { presentationLetterUrl: params.presentationLetterUrl }
                : {}),
              isActive: true,
              updatedAt: new Date(),
            },
          });
        }
      }

      if (!practiceRecord) {
        isNew = true;
        practiceRecord = await tx.practice.create({
          data: {
            studentId: params.studentId,
            companyId: params.companyId,
            vacancyId: params.vacancyId || null,
            teacherId: params.teacherId,
            tutorId: params.tutorId,
            directorId: params.directorId,
            currentStatus: params.targetInternalStatus,
            startDate: params.startDate,
            endDate: params.endDate || null,
            totalHoursRequired: params.totalHoursRequired || 320,
            arlSupportUrl: params.arlSupportUrl || null,
            presentationLetterUrl: params.presentationLetterUrl || null,
            isActive: true,
          },
        });
      }

      let workPlanRecord = await tx.workPlan.findUnique({
        where: { practiceId: practiceRecord.id },
      });

      if (params.workPlanData) {
        workPlanRecord = await tx.workPlan.upsert({
          where: { practiceId: practiceRecord.id },
          create: {
            practiceId: practiceRecord.id,
            objectives: params.workPlanData.objectives,
            methodology: params.workPlanData.methodology,
            schedule: params.workPlanData.schedule,
            documentUrl: params.workPlanData.documentUrl || null,
            status: params.workPlanData.status,
            tutorApproved: params.workPlanData.tutorApproved,
            tutorApprovedAt: params.workPlanData.tutorApproved ? new Date() : null,
            tutorApprovedById: params.workPlanData.tutorApproved ? params.tutorId : null,
            teacherApproved: params.workPlanData.teacherApproved,
            teacherApprovedAt: params.workPlanData.teacherApproved ? new Date() : null,
            teacherApprovedById: params.workPlanData.teacherApproved ? params.teacherId : null,
            feedback: params.workPlanData.feedback || null,
          },
          update: {
            objectives: params.workPlanData.objectives,
            methodology: params.workPlanData.methodology,
            schedule: params.workPlanData.schedule,
            status: params.workPlanData.status,
            tutorApproved: params.workPlanData.tutorApproved,
            teacherApproved: params.workPlanData.teacherApproved,
            updatedAt: new Date(),
          },
        });
      }

      await tx.practiceStatusHistory.create({
        data: {
          practiceId: practiceRecord.id,
          fromStatus: previousStatus,
          toStatus: params.targetInternalStatus,
          changedByUserId: params.directorId,
          notes:
            params.notes ||
            `Formalización oficial de la práctica empresarial emitida en estado '${params.targetDomainStatus}' (CU13)`,
          metadata: {
            caseOfUse: 'CU13',
            domainStatus: params.targetDomainStatus,
            academicPeriod: params.academicPeriod,
            teacherId: params.teacherId,
            tutorId: params.tutorId,
            workPlanId: workPlanRecord?.id || null,
            officialStartDate: params.startDate.toISOString(),
            formalizedAt: new Date().toISOString(),
          },
        },
      });

      const fullPractice = await tx.practice.findUnique({
        where: { id: practiceRecord.id },
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
              city: true,
            },
          },
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              program: true,
            },
          },
          tutor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              program: true,
              companyId: true,
            },
          },
          workPlan: true,
        },
      });

      return {
        practice: fullPractice || practiceRecord,
        workPlan: workPlanRecord,
        isNew,
      };
    });
  }

  /**
   * Consulta una práctica con todos sus detalles evaluativos, informes y prerrequisitos para liquidación
   */
  async findPracticeForLiquidation(practiceId: string) {
    return prisma.practice.findUnique({
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
            academicAverage: true,
            approvedCredits: true,
          },
        },
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
            address: true,
            city: true,
            contactEmail: true,
          },
        },
        vacancy: {
          select: {
            id: true,
            title: true,
            program: true,
            vacanciesCount: true,
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
          },
        },
        workPlan: true,
        evaluations: {
          include: {
            evaluator: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        advanceReports: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        followUpLogs: {
          where: { deletedAt: null },
          orderBy: { fechaActividad: 'desc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Ejecuta la liquidación de la práctica en una transacción inmutable
   */
  async liquidatePractice(params: {
    practiceId: string;
    finalScore: number;
    actorId: string;
    notes?: string;
    previousStatus: any;
  }) {
    return prisma.$transaction(async (tx) => {
      const updatedPractice = await tx.practice.update({
        where: { id: params.practiceId },
        data: {
          currentStatus: 'FINALIZADA' as any,
          finalScore: params.finalScore,
          isActive: false,
          endDate: new Date(),
        },
        include: {
          student: true,
          company: true,
          teacher: true,
          tutor: true,
        },
      });

      await tx.practiceStatusHistory.create({
        data: {
          practiceId: params.practiceId,
          fromStatus: params.previousStatus,
          toStatus: 'FINALIZADA' as any,
          changedByUserId: params.actorId,
          notes: params.notes || ('Liquidación académica de práctica. Nota definitiva: ' + params.finalScore.toFixed(2)),
        },
      });

      return updatedPractice;
    });
  }

  /**
   * Actualiza el expediente curricular del estudiante al finalizar la práctica
   */
  async updateStudentCurriculum(studentId: string) {
    return prisma.user.update({
      where: { id: studentId },
      data: { updatedAt: new Date() },
    });
  }
}

export const practiceRepository = new PracticeRepository();
