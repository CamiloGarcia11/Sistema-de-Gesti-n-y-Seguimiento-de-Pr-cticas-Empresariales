export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Formalización de Práctica por ID (HU13 / CU13)
// Endpoints:
//   - GET   /api/v1/practicas/[id]/formalizar (Consulta requisitos y estado de formalización)
//   - POST  /api/v1/practicas/[id]/formalizar (Confirma y emite formalización -> 201 Created)
//   - PATCH /api/v1/practicas/[id]/formalizar (Actualiza y confirma formalización -> 200 OK)
//   - PUT   /api/v1/practicas/[id]/formalizar (Alias de actualización -> 200 OK)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeFormalizationService,
  PracticeFormalizationError,
} from '@/server/services/practice-formalization.service';
import { ApiResponse } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/practicas/[id]/formalizar
 * Consulta el checklist de formalización (Tutor Docente, Tutor Externo, Plan de Trabajo Aprobado)
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
            message: 'Debe iniciar sesión para consultar el expediente de formalización',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: practiceId } = await params;
    const service = getPracticeFormalizationService();
    const details = await service.getFormalizationDetails(practiceId, actor);

    return NextResponse.json(
      {
        success: true,
        data: details,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof PracticeFormalizationError) {
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

    console.error('[API_GET_PRACTICA_FORMALIZAR_DETAILS_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar los requisitos de formalización de la práctica',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/practicas/[id]/formalizar
 * Emite y confirma la formalización de la práctica empresarial (Criterio 1 -> 201 Created)
 */
export async function POST(
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
            message: 'Debe iniciar sesión como coordinador para formalizar la práctica empresarial',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: practiceId } = await params;
    const body = await req.json().catch(() => ({}));

    const service = getPracticeFormalizationService();
    const result = await service.formalizePractice(
      {
        ...body,
        practiceId,
      },
      actor
    );

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof PracticeFormalizationError) {
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

    console.error('[API_POST_PRACTICA_ID_FORMALIZAR_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al formalizar la práctica empresarial',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/practicas/[id]/formalizar
 * Actualiza y confirma la formalización de la práctica empresarial (Criterio 1 -> 200 OK)
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
            message: 'Debe iniciar sesión como coordinador para formalizar la práctica empresarial',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: practiceId } = await params;
    const body = await req.json().catch(() => ({}));

    const service = getPracticeFormalizationService();
    const result = await service.formalizePractice(
      {
        ...body,
        practiceId,
      },
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
    if (error instanceof PracticeFormalizationError) {
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

    console.error('[API_PATCH_PRACTICA_ID_FORMALIZAR_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al actualizar la formalización de la práctica empresarial',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  return PATCH(req, context);
}
