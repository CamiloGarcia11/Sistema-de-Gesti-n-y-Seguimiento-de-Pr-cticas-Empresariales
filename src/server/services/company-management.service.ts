// ==============================================================================
// SIGETRAP - Servicio de Gestión y Radicación de Empresas (HU07)
// Capa de Servicios (RNF11)
// ==============================================================================

import {
  CompanyRepository,
  companyRepository,
} from '@/server/repositories/company.repository';
import {
  CreateCompanyDTO,
  UpdateCompanyDTO,
  CompanyFilterDTO,
  CompanyResponseDTO,
  AuthenticatedUser,
} from '@/types';
import { Prisma } from '@prisma/client';

export class CompanyValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;

  constructor(
    message: string,
    code: string = 'COMPANY_VALIDATION_ERROR',
    statusCode: number = 422,
    field?: string
  ) {
    super(message);
    this.name = 'CompanyValidationError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
  }
}

export class CompanyManagementService {
  constructor(private companyRepo: CompanyRepository = companyRepository) {}

  /**
   * Normaliza el formato de un NIT eliminando espacios, puntos o guiones
   * para validaciones comparativas homogéneas.
   */
  public normalizeNit(nit: string): string {
    return nit.trim();
  }

  /**
   * Radica y registra los datos fiscales de una nueva empresa receptora (HU07)
   * Valida unicidad estricta sobre UNIQUE(nit) y captura errores 23505 / P2002.
   */
  async registerCompany(
    dto: CreateCompanyDTO,
    actor?: AuthenticatedUser
  ): Promise<CompanyResponseDTO> {
    // 1. Validar permisos de actor (si aplica)
    if (actor && actor.role === 'ESTUDIANTE') {
      throw new CompanyValidationError(
        'Los estudiantes no tienen permisos para radicar datos fiscales de empresas',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    // 2. Normalización de campos
    const normalizedNit = this.normalizeNit(dto.nit);
    const normalizedEmail = dto.contactEmail.trim().toLowerCase();
    const normalizedBusinessName = dto.businessName.trim();
    const normalizedLegalRep = dto.legalRepresentative.trim();
    const normalizedPhone = dto.contactPhone.trim();
    const normalizedAddress = dto.address.trim();
    const normalizedCity = dto.city.trim();

    // 3. Validaciones de dominio
    if (!normalizedNit) {
      throw new CompanyValidationError(
        'El NIT es obligatorio',
        'MISSING_NIT',
        422,
        'nit'
      );
    }

    if (!normalizedBusinessName) {
      throw new CompanyValidationError(
        'La razón social de la empresa es obligatoria',
        'MISSING_BUSINESS_NAME',
        422,
        'businessName'
      );
    }

    if (!normalizedLegalRep) {
      throw new CompanyValidationError(
        'El nombre del representante legal es obligatorio',
        'MISSING_LEGAL_REPRESENTATIVE',
        422,
        'legalRepresentative'
      );
    }

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new CompanyValidationError(
        'El correo de contacto fiscal es inválido o no fue suministrado',
        'INVALID_EMAIL',
        422,
        'contactEmail'
      );
    }

    if (!normalizedPhone) {
      throw new CompanyValidationError(
        'El teléfono de contacto es obligatorio',
        'MISSING_PHONE',
        422,
        'contactPhone'
      );
    }

    if (!normalizedAddress) {
      throw new CompanyValidationError(
        'La dirección de la empresa es obligatoria',
        'MISSING_ADDRESS',
        422,
        'address'
      );
    }

    if (!normalizedCity) {
      throw new CompanyValidationError(
        'La ciudad o municipio de ubicación es obligatoria',
        'MISSING_CITY',
        422,
        'city'
      );
    }

    // 4. Pre-validación de unicidad en base de datos (UNIQUE(nit))
    const existingCompany = await this.companyRepo.findByNit(normalizedNit);
    if (existingCompany) {
      throw new CompanyValidationError(
        `Ya existe una empresa registrada con este NIT (${normalizedNit})`,
        'NIT_ALREADY_EXISTS',
        409,
        'nit'
      );
    }

    try {
      // 5. Inserción en la base de datos Supabase / PostgreSQL
      const createdCompany = await this.companyRepo.create({
        nit: normalizedNit,
        businessName: normalizedBusinessName,
        legalRepresentative: normalizedLegalRep,
        contactEmail: normalizedEmail,
        contactPhone: normalizedPhone,
        address: normalizedAddress,
        city: normalizedCity,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      });

      return this.mapToResponseDTO(createdCompany);
    } catch (error: unknown) {
      // 6. Intercepción de restricción de unicidad PostgreSQL (código 23505) o Prisma (P2002)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[]) || [];
        if (target.includes('nit') || target.includes('companies_nit_key')) {
          throw new CompanyValidationError(
            `Ya existe una empresa registrada con este NIT (${normalizedNit})`,
            'NIT_ALREADY_EXISTS',
            409,
            'nit'
          );
        }
      }

      // Intercepción genérica de código Postgres 23505
      const err = error as { code?: string; message?: string };
      if (err.code === '23505' || err.message?.includes('23505') || err.message?.includes('companies_nit_key')) {
        throw new CompanyValidationError(
          `Ya existe una empresa registrada con este NIT (${normalizedNit})`,
          'NIT_ALREADY_EXISTS',
          409,
          'nit'
        );
      }

      throw error;
    }
  }

  /**
   * Consulta en tiempo real si un NIT ya se encuentra registrado
   */
  async verifyNit(nit: string): Promise<{ exists: boolean; company: CompanyResponseDTO | null }> {
    const normalizedNit = this.normalizeNit(nit);
    if (!normalizedNit) {
      return { exists: false, company: null };
    }

    const company = await this.companyRepo.findByNit(normalizedNit);
    return {
      exists: !!company,
      company: company ? this.mapToResponseDTO(company) : null,
    };
  }

  /**
   * Obtiene los datos fiscales de una empresa por ID
   */
  async getCompanyById(id: string): Promise<CompanyResponseDTO> {
    const company = await this.companyRepo.findById(id);
    if (!company) {
      throw new CompanyValidationError(
        'La empresa solicitada no se encuentra registrada en el sistema',
        'COMPANY_NOT_FOUND',
        404
      );
    }
    return this.mapToResponseDTO(company);
  }

  /**
   * Actualiza datos fiscales de una empresa
   */
  async updateCompany(
    id: string,
    dto: UpdateCompanyDTO,
    actor?: AuthenticatedUser
  ): Promise<CompanyResponseDTO> {
    if (actor && actor.role === 'ESTUDIANTE') {
      throw new CompanyValidationError(
        'Los estudiantes no tienen permisos para modificar datos fiscales de empresas',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const company = await this.companyRepo.findById(id);
    if (!company) {
      throw new CompanyValidationError(
        'La empresa a actualizar no existe en el sistema',
        'COMPANY_NOT_FOUND',
        404
      );
    }

    const updateData: Prisma.CompanyUpdateInput = {};

    if (dto.businessName !== undefined) updateData.businessName = dto.businessName.trim();
    if (dto.legalRepresentative !== undefined) updateData.legalRepresentative = dto.legalRepresentative.trim();
    if (dto.contactEmail !== undefined) {
      const email = dto.contactEmail.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        throw new CompanyValidationError('Correo electrónico inválido', 'INVALID_EMAIL', 422, 'contactEmail');
      }
      updateData.contactEmail = email;
    }
    if (dto.contactPhone !== undefined) updateData.contactPhone = dto.contactPhone.trim();
    if (dto.address !== undefined) updateData.address = dto.address.trim();
    if (dto.city !== undefined) updateData.city = dto.city.trim();
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.companyRepo.update(id, updateData);
    return this.mapToResponseDTO(updated);
  }

  /**
   * Lista empresas radicadas con filtros y paginación
   */
  async listCompanies(filter: CompanyFilterDTO) {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const skip = (page - 1) * limit;

    const { companies, total } = await this.companyRepo.findMany({
      search: filter.search,
      city: filter.city,
      isActive: filter.isActive,
      skip,
      take: limit,
    });

    return {
      items: companies.map((c) => this.mapToResponseDTO(c)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mapea el modelo de persistencia a DTO de respuesta
   */
  public mapToResponseDTO(company: any): CompanyResponseDTO {
    const now = new Date();
    const activeAgreement = company.agreements?.find(
      (a: any) =>
        a.status === 'VIGENTE' &&
        new Date(a.startDate) <= now &&
        new Date(a.endDate) >= now
    );

    return {
      id: company.id,
      nit: company.nit,
      businessName: company.businessName,
      legalRepresentative: company.legalRepresentative,
      contactEmail: company.contactEmail,
      contactPhone: company.contactPhone,
      address: company.address,
      city: company.city,
      isActive: company.isActive,
      agreementsCount: company._count?.agreements ?? company.agreements?.length ?? 0,
      activeAgreement: activeAgreement
        ? {
            id: activeAgreement.id,
            agreementNumber: activeAgreement.agreementNumber,
            status: activeAgreement.status,
            startDate: activeAgreement.startDate,
            endDate: activeAgreement.endDate,
          }
        : null,
      tutorsCount: company._count?.tutors ?? 0,
      practicesCount: company._count?.practices ?? 0,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}

export const companyManagementService = new CompanyManagementService();
