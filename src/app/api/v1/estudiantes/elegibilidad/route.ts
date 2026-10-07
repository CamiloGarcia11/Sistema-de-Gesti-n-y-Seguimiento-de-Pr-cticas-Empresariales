export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Consulta de Elegibilidad del Estudiante
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - GET /api/v1/estudiantes/elegibilidad  (Verificación en tiempo real)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  studentApplicationService,
  ApplicationValidationError,
} from '@/server/services/student-application.service';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);

    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar el estado de elegibilidad',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    // Si es estudiante, consulta su propia elegibilidad; si es admin o director, puede pasar ?studentId=xxx
    const { searchParams } = new URL(req.url);
    const targetStudentId =
      actor.role === 'ESTUDIANTE' ? actor.id : searchParams.get('studentId') || actor.id;

    const eligibility = await studentApplicationService.checkStudentEligibility(targetStudentId);

    return NextResponse.json({
      success: true,
      data: eligibility,
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

    console.error('Error al consultar elegibilidad:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al consultar la elegibilidad del estudiante',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
