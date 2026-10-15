export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Evaluación y Actualización de Postulaciones (CU12)
// Caso de Uso: CU12 - Preselección y Aceptación de Candidatos
// Endpoints:
//   - GET /api/v1/postulaciones/[id] (Detalle de postulación y hoja de vida)
//   - PATCH /api/v1/postulaciones/[id] (Actualización de estado por reclutador)
//   - PUT /api/v1/postulaciones/[id] (Alias de actualización de estado)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getCandidateSelectionService,
  CandidateSelectionError,
} from '@/server/services/candidate-selection.service';
import { ApiResponse } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/postulaciones/[id]
 * Actualiza el estado de una postulación (Preseleccionado, Aceptado, En Revisión, Rechazado)
 * Validaciones:
 *   - 200 OK: Actualización válida con nuevo estado, fecha y usuario
 *   - 400 Bad Request: Estado no contemplado o violación de chk_estado_postulacion
 *   - 422 Unprocessable Entity: Límite de cupo de la plaza superado al intentar marcar como Aceptado
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para evaluar y actualizar postulaciones',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const service = getCandidateSelectionService();
    const result = await service.updateApplicationStatus(
      id,
      body,
      actor
    );

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof CandidateSelectionError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.constraint
              ? { constraint: error.constraint, field: error.field }
              : undefined,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_PATCH_POSTULACION_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al actualizar el estado de la postulación',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/postulaciones/[id]
 * Alias de PATCH para compatibilidad REST
 */
export async function PUT(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  return PATCH(req, context);
}

/**
 * GET /api/v1/postulaciones/[id]
 * Consulta individual de postulación para evaluación de hoja de vida
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar los detalles de la postulación',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const application = await getCandidateSelectionService().getApplicationById(id, actor);

    return NextResponse.json(
      {
        success: true,
        data: application,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof CandidateSelectionError) {
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

    console.error('[API_GET_POSTULACION_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar la postulación',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
