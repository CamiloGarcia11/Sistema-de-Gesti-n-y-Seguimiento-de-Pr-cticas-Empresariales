// ==============================================================================
// SIGETRAP - Controlador de Radicación y Consulta de Empresas (HU07)
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - POST /api/v1/empresas  (Radicación de datos fiscales con validación UNIQUE(nit))
//   - GET  /api/v1/empresas  (Listado paginado de empresas receptoras con filtros)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  companyManagementService,
  CompanyValidationError,
} from '@/server/services/company-management.service';
import { ApiResponse } from '@/types';

// Esquema de validación estricto para radicación de empresa (HU07)
const createCompanySchema = z.object({
  nit: z
    .string({ required_error: 'El NIT es obligatorio' })
    .min(5, 'El NIT debe tener al menos 5 caracteres')
    .max(50, 'El NIT no debe exceder 50 caracteres'),
  businessName: z
    .string({ required_error: 'La razón social es obligatoria' })
    .min(2, 'La razón social debe tener al menos 2 caracteres')
    .max(255, 'La razón social no debe exceder 255 caracteres'),
  legalRepresentative: z
    .string({ required_error: 'El representante legal es obligatorio' })
    .min(3, 'El nombre del representante debe tener al menos 3 caracteres')
    .max(255, 'El nombre no debe exceder 255 caracteres'),
  contactEmail: z
    .string({ required_error: 'El correo de contacto es obligatorio' })
    .email('El formato del correo electrónico es inválido')
    .max(255, 'El correo no debe exceder 255 caracteres'),
  contactPhone: z
    .string({ required_error: 'El teléfono de contacto es obligatorio' })
    .min(7, 'El teléfono debe tener al menos 7 dígitos')
    .max(50, 'El teléfono no debe exceder 50 caracteres'),
  address: z
    .string({ required_error: 'La dirección es obligatoria' })
    .min(4, 'La dirección debe tener al menos 4 caracteres'),
  city: z
    .string({ required_error: 'La ciudad es obligatoria' })
    .min(2, 'La ciudad debe tener al menos 2 caracteres')
    .max(100, 'La ciudad no debe exceder 100 caracteres'),
  isActive: z.boolean().optional().default(true),
});

/**
 * POST /api/v1/empresas
 * Radica los datos fiscales de una nueva empresa receptora.
 * Valida unicidad de NIT interceptando error PostgreSQL 23505 / Prisma P2002.
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);

    // Parsear y validar el cuerpo de la petición
    const body = await req.json();
    const validationResult = createCompanySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los datos fiscales suministrados no cumplen con el formato requerido',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    // Delegar al servicio de gestión de empresas
    const company = await companyManagementService.registerCompany(
      validationResult.data,
      actor || undefined
    );

    return NextResponse.json(
      {
        success: true,
        data: company,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof CompanyValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.field ? { field: error.field } : undefined,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_CREATE_COMPANY_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ocurrió un error inesperado al radicar los datos de la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/empresas
 * Consulta el directorio de empresas radicadas con filtros por búsqueda y ciudad.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const city = searchParams.get('city') || undefined;
    const isActiveParam = searchParams.get('isActive');
    const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await companyManagementService.listCompanies({
      search,
      city,
      isActive,
      page,
      limit,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof CompanyValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_LIST_COMPANIES_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar el directorio de empresas',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
