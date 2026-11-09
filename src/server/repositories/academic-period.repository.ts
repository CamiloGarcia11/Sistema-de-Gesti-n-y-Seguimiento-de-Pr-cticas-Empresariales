// ==============================================================================
// SIGETRAP - Repositorio de Periodos Académicos (HU05 / CU02)
// Módulo / Épica: Parametrización de Periodos Académicos
// Caso de Uso Asociado: CU02 - Parametrización y Elegibilidad Académica
// Entidad BD: periodos_academicos
// Restricciones SQL:
//   - chk_fechas_periodo (fecha_fin > fecha_inicio)
//   - uq_codigo_periodo (UNIQUE codigo)
// ==============================================================================

import { prisma } from '@/lib/prisma';

export interface CreateAcademicPeriodRecordInput {
  code: string;
  name: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  vacanciesStartDate?: Date | null;
  vacanciesEndDate?: Date | null;
  reportsStartDate?: Date | null;
  reportsEndDate?: Date | null;
  status?: string;
  isActive?: boolean;
  createdById?: string | null;
}

export interface UpdateAcademicPeriodRecordInput {
  code?: string;
  name?: string;
  description?: string | null;
  startDate?: Date;
  endDate?: Date;
  vacanciesStartDate?: Date | null;
  vacanciesEndDate?: Date | null;
  reportsStartDate?: Date | null;
  reportsEndDate?: Date | null;
  status?: string;
  isActive?: boolean;
}

export interface FindAcademicPeriodsParams {
  search?: string;
  status?: string;
  isActive?: boolean;
  skip?: number;
  take?: number;
}

export class AcademicPeriodRepository {
  /**
   * Busca un periodo académico por su ID único
   */
  async findById(id: string) {
    return prisma.academicPeriod.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Busca un periodo académico por su código único (ej. "2026-1")
   */
  async findByCode(code: string) {
    const normalized = code.trim();
    return prisma.academicPeriod.findFirst({
      where: {
        code: {
          equals: normalized,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Obtiene el periodo lectivo actualmente abierto y activo (vigente)
   */
  async findActivePeriod() {
    return prisma.academicPeriod.findFirst({
      where: {
        isActive: true,
        status: 'Abierto',
        deletedAt: null,
      },
      orderBy: {
        startDate: 'desc',
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Lista los periodos académicos con filtros y paginación
   */
  async findMany(params: FindAcademicPeriodsParams = {}) {
    const { search, status, isActive, skip = 0, take = 50 } = params;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search && search.trim() !== '') {
      const term = search.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [periods, total] = await Promise.all([
      prisma.academicPeriod.findMany({
        where,
        skip,
        take,
        orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.academicPeriod.count({ where }),
    ]);

    return { periods, total };
  }

  /**
   * Registra un nuevo periodo lectivo en la entidad periodos_academicos
   */
  async create(data: CreateAcademicPeriodRecordInput) {
    return prisma.academicPeriod.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        startDate: data.startDate,
        endDate: data.endDate,
        vacanciesStartDate: data.vacanciesStartDate ?? null,
        vacanciesEndDate: data.vacanciesEndDate ?? null,
        reportsStartDate: data.reportsStartDate ?? null,
        reportsEndDate: data.reportsEndDate ?? null,
        status: data.status ?? 'Abierto',
        isActive: data.isActive ?? true,
        createdById: data.createdById ?? null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Actualiza la configuración o estado de un periodo lectivo existente
   */
  async update(id: string, data: UpdateAcademicPeriodRecordInput) {
    return prisma.academicPeriod.update({
      where: { id },
      data,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Desactiva otros periodos activos cuando se establece uno nuevo como vigente
   */
  async deactivateOtherPeriods(excludeId: string) {
    return prisma.academicPeriod.updateMany({
      where: {
        id: { not: excludeId },
        isActive: true,
        deletedAt: null,
      },
      data: {
        isActive: false,
      },
    });
  }
}

export const academicPeriodRepository = new AcademicPeriodRepository();
