export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador para Publicar Convocatoria en Borrador
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - PATCH /api/v1/vacantes/[id]/publicar
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  vacancyManagementService,
  VacancyValidationError,
} from '@/server/services/vacancy-management.service';
import { ApiResponse } from '@/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión para publicar la convocatoria' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const published = await vacancyManagementService.publishVacancy(id, actor);

    return NextResponse.json({
      success: true,
      message: 'Convocatoria publicada exitosamente. Ahora está disponible para postulaciones de practicantes.',
      data: published,
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

    console.error('Error al publicar convocatoria:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al publicar la convocatoria',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
