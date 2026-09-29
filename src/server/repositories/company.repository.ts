// ==============================================================================
// SIGETRAP - Repositorio de Empresas Receptoras (HU07)
// Capa de Repositorios (RNF11)
// ==============================================================================

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export class CompanyRepository {
  /**
   * Busca una empresa por su NIT (respetando constraint UNIQUE(nit))
   */
  async findByNit(nit: string) {
    return prisma.company.findUnique({
      where: { nit: nit.trim() },
      include: {
        agreements: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            agreements: true,
            tutors: true,
            practices: true,
            vacancies: true,
          },
        },
      },
    });
  }

  /**
   * Busca una empresa por su ID primario
   */
  async findById(id: string) {
    return prisma.company.findUnique({
      where: { id },
      include: {
        agreements: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            agreements: true,
            tutors: true,
            practices: true,
            vacancies: true,
          },
        },
      },
    });
  }

  /**
   * Persiste una nueva empresa en la base de datos
   */
  async create(data: Prisma.CompanyCreateInput) {
    return prisma.company.create({
      data: {
        ...data,
        nit: data.nit.trim(),
        businessName: data.businessName.trim(),
        legalRepresentative: data.legalRepresentative.trim(),
        contactEmail: data.contactEmail.trim().toLowerCase(),
        contactPhone: data.contactPhone.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
      },
      include: {
        agreements: true,
        _count: {
          select: {
            agreements: true,
            tutors: true,
            practices: true,
            vacancies: true,
          },
        },
      },
    });
  }

  /**
   * Actualiza los datos de una empresa existente
   */
  async update(id: string, data: Prisma.CompanyUpdateInput) {
    return prisma.company.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        agreements: true,
        _count: {
          select: {
            agreements: true,
            tutors: true,
            practices: true,
            vacancies: true,
          },
        },
      },
    });
  }

  /**
   * Consulta paginada y filtrada de empresas
   */
  async findMany(params: {
    search?: string;
    city?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.CompanyWhereInput = {
      deletedAt: null,
    };

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params.city) {
      where.city = { contains: params.city.trim(), mode: 'insensitive' };
    }

    if (params.search) {
      const search = params.search.trim();
      where.OR = [
        { nit: { contains: search, mode: 'insensitive' } },
        { businessName: { contains: search, mode: 'insensitive' } },
        { legalRepresentative: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          agreements: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              agreements: true,
              tutors: true,
              practices: true,
              vacancies: true,
            },
          },
        },
      }),
      prisma.company.count({ where }),
    ]);

    return { companies, total };
  }

  /**
   * Soft delete para empresas
   */
  async softDelete(id: string) {
    return prisma.company.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
  }
}

export const companyRepository = new CompanyRepository();
