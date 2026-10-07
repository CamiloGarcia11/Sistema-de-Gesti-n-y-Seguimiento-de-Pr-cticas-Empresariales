export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Detalle y Edición de Convocatoria
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - GET /api/v1/vacantes/[id]  (Detalle de la vacante)
//   - PUT /api/v1/vacantes/[id]  (Actualización de la convocatoria)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  studentApplicationService,
  ApplicationValidationError,
} from '@/server/services/student-application.service';
import {
  vacancyManagementService,
  VacancyValidationError,
} from '@/server/services/vacancy-management.service';
import { ApiResponse } from '@/types';
import { z } from 'zod';

const updateVacancySchema = z.object({
  title: z.string().min(5).max(255).optional(),
  description: z.string().min(10).optional(),
  requirements: z.string().min(5).optional(),
  program: z.string().optional(),
  academicPeriod: z.string().min(4).optional(),
  vacanciesCount: z.coerce.number().int().min(1).optional(),
  status: z.enum(['BORRADOR', 'PUBLICADA', 'EN_SELECCION', 'CUBIERTA', 'CANCELADA']).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

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
    if (error instanceof ApplicationValidationError || error instanceof VacancyValidationError) {
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión para modificar la convocatoria' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validationResult = updateVacancySchema.safeParse(body);

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

    const updated = await vacancyManagementService.updateVacancy(id, validationResult.data, actor);

    return NextResponse.json({
      success: true,
      message: 'Convocatoria actualizada exitosamente',
      data: updated,
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

    console.error('Error al actualizar convocatoria:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al actualizar la convocatoria',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
