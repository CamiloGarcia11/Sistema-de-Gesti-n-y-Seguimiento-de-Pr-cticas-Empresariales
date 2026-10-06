// ==============================================================================
// SIGETRAP - Controlador de Convocatorias por Empresa Empleadora
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - GET /api/v1/empresas/[id]/vacantes
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  vacancyManagementService,
  VacancyValidationError,
} from '@/server/services/vacancy-management.service';
import { ApiResponse } from '@/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión para consultar las convocatorias de la empresa' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: companyId } = await params;
    const vacancies = await vacancyManagementService.getCompanyVacancies(companyId, actor);

    return NextResponse.json({
      success: true,
      data: vacancies,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof VacancyValidationError) {
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

    console.error('Error al consultar convocatorias de la empresa:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al consultar convocatorias de la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
