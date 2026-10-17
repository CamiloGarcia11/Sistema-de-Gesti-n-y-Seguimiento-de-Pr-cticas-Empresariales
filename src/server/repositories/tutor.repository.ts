// ==============================================================================
// SIGETRAP - Repositorio de Tutores Empresariales (HU09 / CU09)
// Módulo / Épica: Gestión Empresarial y Evaluación de Prácticas
// Caso de Uso Asociado: CU09 - Vinculación de Tutores Empresariales
// Entidades BD: empresas, tutores_empresariales, usuarios, asignaciones_practica
// Restricciones SQL: fk_tutor_empresa, chk_correo_tutor_valido, uq_tutor_documento_empresa, uq_tutor_email
// ==============================================================================

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export class CompanyTutorRepository {
  /**
   * Busca un usuario o tutor empresarial por correo electrónico (uq_tutor_email)
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
            city: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            practicesAsTutor: true,
          },
        },
      },
    });
  }

  /**
   * Busca un usuario o tutor empresarial por documento de identidad (uq_tutor_documento_empresa)
   */
  async findByDocumentNumber(documentNumber: string, companyId?: string) {
    const cleanDoc = documentNumber.trim();
    if (companyId) {
      return prisma.user.findFirst({
        where: {
          OR: [
            { documentNumber: cleanDoc },
            { documentNumber: cleanDoc, companyId },
          ],
        },
        include: {
          company: {
            select: {
              id: true,
              businessName: true,
              nit: true,
              city: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              practicesAsTutor: true,
            },
          },
        },
      });
    }

    return prisma.user.findUnique({
      where: { documentNumber: cleanDoc },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
            city: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            practicesAsTutor: true,
          },
        },
      },
    });
  }

  /**
   * Busca un tutor empresarial por su ID primario
   */
  async findById(id: string) {
    return prisma.user.findFirst({
      where: {
        id,
        role: 'TUTOR_EMPRESARIAL',
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
            city: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            practicesAsTutor: true,
          },
        },
      },
    });
  }

  /**
   * Crea y vincula un nuevo supervisor inmediato en tutores_empresariales (users con rol TUTOR_EMPRESARIAL)
   * asociado a la empresa correspondiente con estado "Activo" (ACTIVO)
   */
  async createTutor(params: {
    name: string;
    cargo: string;
    email: string;
    documentType: string;
    documentNumber: string;
    phone?: string | null;
    companyId: string;
    passwordHash: string;
  }) {
    return prisma.user.create({
      data: {
        name: params.name.trim(),
        email: params.email.trim().toLowerCase(),
        passwordHash: params.passwordHash,
        documentType: params.documentType.trim() || 'CC',
        documentNumber: params.documentNumber.trim(),
        phone: params.phone ? params.phone.trim() : null,
        role: 'TUTOR_EMPRESARIAL',
        status: 'ACTIVO',
        isActive: true,
        program: params.cargo.trim(), // Almacena el cargo del supervisor empresarial
        company: {
          connect: { id: params.companyId },
        },
      },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
            city: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            practicesAsTutor: true,
          },
        },
      },
    });
  }

  /**
   * Asocia un usuario existente como tutor empresarial activo de una empresa
   */
  async linkExistingTutorToCompany(params: {
    userId: string;
    companyId: string;
    cargo: string;
    name?: string;
    phone?: string | null;
  }) {
    return prisma.user.update({
      where: { id: params.userId },
      data: {
        company: { connect: { id: params.companyId } },
        role: 'TUTOR_EMPRESARIAL',
        status: 'ACTIVO',
        isActive: true,
        program: params.cargo.trim(),
        ...(params.name ? { name: params.name.trim() } : {}),
        ...(params.phone !== undefined ? { phone: params.phone } : {}),
        updatedAt: new Date(),
      },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
            city: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            practicesAsTutor: true,
          },
        },
      },
    });
  }

  /**
   * Lista los tutores empresariales (supervisores inmediatos) vinculados a una empresa
   * para el selector de evaluadores directos (CU09 - Criterio 3)
   */
  async findByCompanyId(params: {
    companyId?: string;
    onlyActive?: boolean;
    search?: string;
  }) {
    const where: Prisma.UserWhereInput = {
      role: 'TUTOR_EMPRESARIAL',
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
    };

    if (params.onlyActive) {
      where.status = 'ACTIVO';
      where.isActive = true;
      where.company = {
        isActive: true,
        deletedAt: null,
      };
    }

    if (params.search && params.search.trim()) {
      const s = params.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { documentNumber: { contains: s, mode: 'insensitive' } },
        { program: { contains: s, mode: 'insensitive' } },
      ];
    }

    return prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
            city: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            practicesAsTutor: true,
          },
        },
      },
    });
  }
}

export const companyTutorRepository = new CompanyTutorRepository();
