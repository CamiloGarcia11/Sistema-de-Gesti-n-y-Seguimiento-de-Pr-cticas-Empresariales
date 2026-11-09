export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Asignación y Selector de Evaluadores Directos (HU09 / CU09 - Criterio 3)
// Endpoints:
//   - GET   /api/v1/practicas/[id]/evaluador (Obtiene los supervisores activos de la empresa para el selector)
//   - PATCH /api/v1/practicas/[id]/evaluador (Asigna un supervisor vinculado como evaluador directo de la práctica)
//   - POST  /api/v1/practicas/[id]/evaluador (Alias para asignación de evaluador)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getTutorLinkingService,
  TutorLinkingError,
} from '@/server/services/tutor-linking.service';
import { ApiResponse } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/practicas/[id]/evaluador
 * Criterio 3: Cuando el usuario ingresa al formulario de formalización/seguimiento de práctica
 * de un estudiante asignado a dicha organización, devuelve los supervisores activos de la empresa
 * para el selector de evaluadores directos.
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
            message: 'Debe iniciar sesión para consultar el selector de evaluadores directos',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: practiceId } = await params;
    const service = getTutorLinkingService();
    const result = await service.getAvailableEvaluatorsForPractice(practiceId, actor);

    return NextResponse.json(
      {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof TutorLinkingError) {
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

    console.error('[API_GET_PRACTICE_EVALUATORS_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar los evaluadores disponibles para la práctica',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/practicas/[id]/evaluador
 * Asigna el supervisor seleccionado al plan/asignación de práctica como evaluador directo
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
            message: 'Debe iniciar sesión para asignar un evaluador directo',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: practiceId } = await params;
    const body = await req.json().catch(() => ({}));

    const service = getTutorLinkingService();
    const result = await service.assignEvaluatorToPractice(practiceId, body, actor);

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
    if (error instanceof TutorLinkingError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: {
              field: error.field,
              constraint: error.constraint,
            },
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_PATCH_PRACTICE_EVALUATOR_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al asignar el evaluador directo a la práctica',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  return PATCH(req, context);
}

export async function PUT(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  return PATCH(req, context);
}
