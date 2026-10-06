// ==============================================================================
// SIGETRAP - Repositorio de Vacantes de Práctica Empresarial
// Capa de Repositorios (RNF11)
// ==============================================================================

import prisma from '@/lib/prisma';
import { VacancyStatus } from '@/types';
import { Prisma } from '@prisma/client';

export class VacancyRepository {
  /**
   * Busca una vacante por su ID primario con su empresa y convenios
   */
  async findById(id: string) {
    return prisma.vacancy.findUnique({
      where: { id },
      include: {
        company: {
          include: {
            agreements: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        applications: {
          where: { deletedAt: null },
          select: {
            id: true,
            studentId: true,
            status: true,
          },
        },
        _count: {
          select: {
            applications: true,
            practices: true,
          },
        },
      },
    });
  }

  /**
   * Lista vacantes disponibles ofertadas por empresas con convenios vigentes
   */
  async findAvailableVacancies(params: {
    search?: string;
    city?: string;
    status?: VacancyStatus;
    skip?: number;
    take?: number;
  }) {
    const now = new Date();

    const where: Prisma.VacancyWhereInput = {
      deletedAt: null,
      status: params.status || { in: ['PUBLICADA', 'EN_SELECCION'] },
      // RN-01: La empresa debe tener convenio VIGENTE
      company: {
        deletedAt: null,
        isActive: true,
        agreements: {
          some: {
            status: 'VIGENTE',
            startDate: { lte: now },
            endDate: { gte: now },
            deletedAt: null,
          },
        },
        ...(params.city ? { city: { contains: params.city.trim(), mode: 'insensitive' } } : {}),
      },
    };

    if (params.search) {
      const search = params.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { requirements: { contains: search, mode: 'insensitive' } },
        { company: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [vacancies, total] = await Promise.all([
      prisma.vacancy.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          company: {
            include: {
              agreements: {
                where: {
                  status: 'VIGENTE',
                  startDate: { lte: now },
                  endDate: { gte: now },
                  deletedAt: null,
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
      prisma.vacancy.count({ where }),
    ]);

    return { vacancies, total };
  }

  /**
   * Crea una nueva vacante
   */
  async create(data: Prisma.VacancyCreateInput) {
    return prisma.vacancy.create({
      data,
      include: {
        company: {
          include: {
            agreements: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });
  }

  /**
   * Actualiza el estado de una vacante
   */
  async updateStatus(id: string, status: VacancyStatus) {
    return prisma.vacancy.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });
  }

  /**
   * Cuenta postulaciones activas para una vacante
   */
  async countActiveApplications(vacancyId: string) {
    return prisma.application.count({
      where: {
        vacancyId,
        status: { in: ['POSTULADO', 'PRESENTADO', 'ACEPTADO'] },
        deletedAt: null,
      },
    });
  }
}

export const vacancyRepository = new VacancyRepository();
