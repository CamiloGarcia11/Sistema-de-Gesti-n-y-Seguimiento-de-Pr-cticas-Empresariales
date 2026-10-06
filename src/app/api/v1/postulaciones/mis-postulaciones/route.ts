// ==============================================================================
// SIGETRAP - Controlador de Consulta de Postulaciones del Estudiante
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - GET /api/v1/postulaciones/mis-postulaciones
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
            message: 'Debe iniciar sesión para consultar sus postulaciones',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const targetStudentId =
      actor.role === 'ESTUDIANTE' ? actor.id : searchParams.get('studentId') || actor.id;

    const applications = await studentApplicationService.getStudentApplications(
      targetStudentId,
      actor
    );

    return NextResponse.json({
      success: true,
      data: applications,
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

    console.error('Error al consultar postulaciones del estudiante:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al consultar las postulaciones del estudiante',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
