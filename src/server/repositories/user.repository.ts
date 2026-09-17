// ==============================================================================
// SIGETRAP - Repositorio de Usuarios y Gestión de Cuentas (HU01)
// Capa de Repositorios (RNF11)
// ==============================================================================

import prisma from '@/lib/prisma';
import { Role, UserStatus } from '@/types';
import { Prisma } from '@prisma/client';

export class UserRepository {
  /**
   * Busca un usuario por su correo electrónico (respetando constraint UNIQUE)
   */
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
          },
        },
      },
    });
  }

  /**
   * Busca un usuario por su número de documento (respetando constraint UNIQUE)
   */
  async findByDocumentNumber(documentNumber: string) {
    return prisma.user.findUnique({
      where: { documentNumber: documentNumber.trim() },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
          },
        },
      },
    });
  }

  /**
   * Busca un usuario por su identificador primario
   */
  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
          },
        },
      },
    });
  }

  /**
   * Persiste un nuevo usuario en la base de datos
   */
  async create(data: Prisma.UserCreateInput) {
    return prisma.user.create({
      data: {
        ...data,
        email: data.email.trim().toLowerCase(),
        documentNumber: data.documentNumber.trim(),
      },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
          },
        },
      },
    });
  }

  /**
   * Desactiva una cuenta y revoca los tokens de sesión vigentes (HU01 - Criterio 2)
   * Incrementa tokenVersion para invalidar cualquier JWT emitido previamente.
   */
  async deactivateUser(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        status: 'INACTIVO',
        isActive: false,
        tokenVersion: { increment: 1 },
        updatedAt: new Date(),
      },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
          },
        },
      },
    });
  }

  /**
   * Habilita/Activa una cuenta de usuario
   */
  async activateUser(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVO',
        isActive: true,
        updatedAt: new Date(),
      },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
          },
        },
      },
    });
  }

  /**
   * Consulta paginada y filtrada de usuarios
   */
  async findMany(params: {
    role?: Role;
    status?: UserStatus;
    search?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (params.role) {
      where.role = params.role;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      const search = params.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { studentCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          company: {
            select: {
              id: true,
              businessName: true,
              nit: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }
}

export const userRepository = new UserRepository();
