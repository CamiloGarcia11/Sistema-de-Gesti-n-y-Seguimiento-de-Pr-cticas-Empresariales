// ==============================================================================
// SIGETRAP - Controlador de Catálogo de Vacantes Ofertadas
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - GET /api/v1/vacantes  (Listado de vacantes de empresas con convenio vigente)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  studentApplicationService,
  ApplicationValidationError,
} from '@/server/services/student-application.service';
import { ApiResponse, VacancyFilterDTO } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { searchParams } = new URL(req.url);

    const filter: VacancyFilterDTO = {
      search: searchParams.get('search') || undefined,
      city: searchParams.get('city') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20,
    };

    const result = await studentApplicationService.getAvailableVacancies(filter);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationValidationError) {
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

    console.error('Error al consultar vacantes:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al consultar el catálogo de vacantes',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
