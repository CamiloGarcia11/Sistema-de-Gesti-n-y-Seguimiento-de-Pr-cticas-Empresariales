// ==============================================================================
// SIGETRAP - Controlador de Detalle de Vacante Ofertada
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - GET /api/v1/vacantes/[id]  (Detalle de la vacante seleccionada)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  studentApplicationService,
  ApplicationValidationError,
} from '@/server/services/student-application.service';
import { ApiResponse } from '@/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
    const vacancy = await studentApplicationService.getVacancyById(id);

    return NextResponse.json({
      success: true,
      data: vacancy,
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

    console.error('Error al consultar detalle de vacante:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al consultar el detalle de la vacante',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
