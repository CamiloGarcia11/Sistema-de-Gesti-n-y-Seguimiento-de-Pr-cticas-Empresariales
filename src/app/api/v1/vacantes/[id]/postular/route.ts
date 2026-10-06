// ==============================================================================
// SIGETRAP - Controlador de Postulación de Estudiante a Vacante
// Capa de Controladores (Route Handler RNF11)
// Historia de Usuario:
// "Como estudiante elegible, quiero postularme a una vacante adjuntando mi
//  hoja de vida, para participar en el proceso de preselección empresarial."
// Endpoint:
//   - POST /api/v1/vacantes/[id]/postular
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  studentApplicationService,
  ApplicationValidationError,
} from '@/server/services/student-application.service';
import { ApiResponse } from '@/types';

// Esquema de validación para la postulación
const applyVacancySchema = z.object({
  cvUrl: z
    .string({ required_error: 'Es obligatorio adjuntar la hoja de vida' })
    .min(5, 'El enlace o documento de la hoja de vida es obligatorio'),
  notes: z.string().max(1000, 'Las observaciones no deben exceder 1000 caracteres').optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);

    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para postularse a una vacante empresarial',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: vacancyId } = await params;
    const body = await req.json().catch(() => ({}));

    const validationResult = applyVacancySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los datos de la postulación no cumplen con el formato requerido',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    const application = await studentApplicationService.applyToVacancy(
      {
        vacancyId,
        cvUrl: validationResult.data.cvUrl,
        notes: validationResult.data.notes,
      },
      actor
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Postulación radicada exitosamente. Has sido preseleccionado preliminarmente para la vacante.',
        data: application,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
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

    console.error('Error al procesar la postulación a la vacante:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al procesar la postulación a la vacante',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
