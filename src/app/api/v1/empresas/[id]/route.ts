export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Detalle y Actualización de Empresa (HU07)
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - GET /api/v1/empresas/[id]  (Consulta de datos fiscales de una empresa)
//   - PUT /api/v1/empresas/[id]  (Actualización de datos fiscales)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  companyManagementService,
  CompanyValidationError,
} from '@/server/services/company-management.service';
import { ApiResponse } from '@/types';

const updateCompanySchema = z.object({
  businessName: z.string().min(2).max(255).optional(),
  legalRepresentative: z.string().min(3).max(255).optional(),
  contactEmail: z.string().email().max(255).optional(),
  contactPhone: z.string().min(7).max(50).optional(),
  address: z.string().min(4).optional(),
  city: z.string().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/v1/empresas/[id]
 * Consulta los datos fiscales y convenios de una empresa por ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
    const company = await companyManagementService.getCompanyById(id);

    return NextResponse.json(
      {
        success: true,
        data: company,
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

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar los datos de la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/empresas/[id]
 * Actualiza los datos fiscales de una empresa
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
    const actor = getAuthenticatedUser(req);
    const body = await req.json();

    const validationResult = updateCompanySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos de actualización inválidos',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    const updatedCompany = await companyManagementService.updateCompany(
      id,
      validationResult.data,
      actor || undefined
    );

    return NextResponse.json(
      {
        success: true,
        data: updatedCompany,
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

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al actualizar los datos de la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
