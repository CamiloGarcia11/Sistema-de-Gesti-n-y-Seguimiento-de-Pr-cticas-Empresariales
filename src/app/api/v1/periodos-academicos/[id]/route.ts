export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Configuración e Inspección de Periodo Lectivo por ID (HU05 / CU02)
// Endpoints:
//   - GET   /api/v1/periodos-academicos/[id] (Obtiene el detalle de un periodo lectivo)
//   - PATCH /api/v1/periodos-academicos/[id] (Actualiza fechas de vigencia, ventanas o estado)
//   - PUT   /api/v1/periodos-academicos/[id] (Alias de actualización de configuración)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getAcademicPeriodService,
  AcademicPeriodValidationError,
} from '@/server/services/academic-period.service';
import { ApiResponse } from '@/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/periodos-academicos/[id]
 */
export async function GET(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await context.params;
    const service = getAcademicPeriodService();
    const period = await service.getPeriodByIdOrCode(id);

    return NextResponse.json(
      {
        success: true,
        data: period,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof AcademicPeriodValidationError) {
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

    console.error('[API_GET_PERIODO_BY_ID_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar el periodo académico.',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/periodos-academicos/[id]
 * Actualiza fechas de vigencia, ventanas de convocatorias/informes o estado de un periodo lectivo.
 * Si fecha_inicio >= fecha_fin, falla por chk_fechas_periodo con 400 Bad Request (fecha_fin > fecha_inicio).
 */
export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión como coordinador para configurar periodos lectivos.',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const service = getAcademicPeriodService();
    const updated = await service.updatePeriodConfiguration(id, body, actor);

    return NextResponse.json(
      {
        success: true,
        message: updated.message,
        data: updated,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof AcademicPeriodValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: {
              field: error.field,
              constraint: error.constraint,
              ...(error.constraint === 'chk_fechas_periodo'
                ? { rule: 'fecha_fin > fecha_inicio' }
                : {}),
            },
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_PATCH_PERIODO_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al actualizar la configuración del periodo académico.',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse<ApiResponse>> {
  return PATCH(req, context);
}
