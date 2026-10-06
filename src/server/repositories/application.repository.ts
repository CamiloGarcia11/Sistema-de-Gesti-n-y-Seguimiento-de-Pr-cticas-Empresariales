// ==============================================================================
// SIGETRAP - Repositorio de Postulaciones y Vinculación a Prácticas
// Capa de Repositorios (RNF11)
// ==============================================================================

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export class ApplicationRepository {
  /**
   * Busca si existe una postulación activa de un estudiante a una vacante específica
   */
  async findByStudentAndVacancy(studentId: string, vacancyId: string) {
    return prisma.application.findFirst({
      where: {
        studentId,
        vacancyId,
        deletedAt: null,
      },
      include: {
        practice: true,
      },
    });
  }

  /**
   * Busca una postulación por su ID con relaciones completas
   */
  async findById(id: string) {
    return prisma.application.findUnique({
      where: { id },
      include: {
        vacancy: {
          include: {
            company: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentCode: true,
            program: true,
          },
        },
        practice: {
          include: {
            statusHistory: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });
  }

  /**
   * Obtiene todas las postulaciones de un estudiante ordenadas por fecha reciente
   */
  async findManyByStudentId(studentId: string) {
    return prisma.application.findMany({
      where: {
        studentId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        vacancy: {
          include: {
            company: {
              select: {
                id: true,
                businessName: true,
                city: true,
              },
            },
          },
        },
        practice: {
          select: {
            id: true,
            currentStatus: true,
          },
        },
      },
    });
  }

  /**
   * Ejecuta la postulación atómica e inmutable dentro de una transacción de Prisma.
   * Crea la postulación, formaliza el registro de práctica en estado POSTULADO
   * y guarda el evento de auditoría inicial (ASPIRANTE -> POSTULADO).
   */
  async createApplicationWithPractice(params: {
    vacancyId: string;
    studentId: string;
    companyId: string;
    cvUrl: string;
    notes?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Crear el registro Application
      const application = await tx.application.create({
        data: {
          vacancyId: params.vacancyId,
          studentId: params.studentId,
          status: 'POSTULADO',
          cvUrl: params.cvUrl,
        },
      });

      // 2. Crear la entidad Practice vinculada en estado inicial POSTULADO
      const practice = await tx.practice.create({
        data: {
          applicationId: application.id,
          studentId: params.studentId,
          companyId: params.companyId,
          vacancyId: params.vacancyId,
          currentStatus: 'POSTULADO',
          isActive: true,
        },
      });

      // 3. Registrar en la tabla histórica inmutable de auditoría (RNF05, RNF15)
      const historyEntry = await tx.practiceStatusHistory.create({
        data: {
          practiceId: practice.id,
          fromStatus: 'ASPIRANTE',
          toStatus: 'POSTULADO',
          changedByUserId: params.studentId,
          notes:
            params.notes ||
            'Postulación inicial del estudiante a la vacante con hoja de vida adjunta para preselección empresarial',
          metadata: {
            applicationId: application.id,
            vacancyId: params.vacancyId,
            cvUrl: params.cvUrl,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return {
        application,
        practice,
        historyEntry,
      };
    });
  }
}

export const applicationRepository = new ApplicationRepository();
