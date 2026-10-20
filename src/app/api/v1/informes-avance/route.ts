export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Informes de Avance y Bitácoras (CU14)
// Módulo: Seguimiento y Control de Prácticas
// Caso de Uso: CU14 - Entrega de Informes de Avance
// Endpoints:
//   - POST /api/v1/informes-avance (Radicación de informe y bitácora de seguimiento)
//   - GET /api/v1/informes-avance (Consulta de informes radicados)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeFollowUpService,
  PracticeFollowUpError,
} from '@/server/services/practice-followup.service';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/informes-avance
 * Radica un informe de seguimiento y bitácora con horas ejecutadas
 *
 * Criterios de Aceptación:
 *   - 201 Created: Radicación exitosa, registro en informes_avance con estado "Radicado", fecha actualizada.
 *   - 400 Bad Request: Horas <= 0 (chk_horas_ejecutadas_positivas) o estado inválido (chk_estado_informe).
 *   - 403 Forbidden: Práctica no activa ("Finalizada", "Cancelada", "En Trámite") o usuario no autorizado.
 *   - 401 Unauthorized: Solicitud sin token de autenticación.
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para radicar informes de seguimiento',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const service = getPracticeFollowUpService();
    const result = await service.radicarInforme(body, actor);

    return NextResponse.json(
      {
        success: true,
        message: result.mensaje,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof PracticeFollowUpError) {
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

    console.error('[API_RADICAR_INFORME_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al radicar el informe de avance',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/informes-avance
 * Lista los informes de avance radicados para una práctica dada (query param ?practicaId=...)
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar informes',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const practicaId = searchParams.get('practicaId') || searchParams.get('practiceId');

    if (!practicaId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_PRACTICE_ID',
            message: 'El parámetro practicaId es obligatorio en la consulta',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const service = getPracticeFollowUpService();
    const informes = await service.getInformesByPractice(practicaId, actor);

    return NextResponse.json(
      {
        success: true,
        data: informes,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof PracticeFollowUpError) {
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

    console.error('[API_GET_INFORMES_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al consultar los informes',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
