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
}

export const practiceRepository = new PracticeRepository();
