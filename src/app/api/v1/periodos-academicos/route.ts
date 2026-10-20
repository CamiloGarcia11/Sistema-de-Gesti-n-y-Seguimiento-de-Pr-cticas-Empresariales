export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Apertura y Configuración de Periodos Lectivos (HU05 / CU02)
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - POST /api/v1/periodos-academicos (Apertura y configuración de periodo lectivo -> 201 Created / 400 Bad Request por chk_fechas_periodo)
//   - GET  /api/v1/periodos-academicos (Listado de periodos lectivos y periodo vigente -> 200 OK)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getAcademicPeriodService,
  AcademicPeriodValidationError,
} from '@/server/services/academic-period.service';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/periodos-academicos
 * Permite al Coordinador (DIRECTOR_PROGRAMA) o Administrador (ADMIN) aperturar y
 * configurar un nuevo periodo lectivo con fechas estrictas de vigencia.
 * Criterio 1: Si fecha_inicio >= fecha_fin, falla por la restricción chk_fechas_periodo
 * y devuelve 400 Bad Request indicando fecha_fin > fecha_inicio.
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
            message: 'Debe iniciar sesión como coordinador para aperturar y configurar periodos lectivos.',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const service = getAcademicPeriodService();
    const createdPeriod = await service.openAndConfigurePeriod(body, actor);

    return NextResponse.json(
      {
        success: true,
        message: createdPeriod.message,
        data: createdPeriod,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
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

    console.error('[API_POST_PERIODOS_ACADEMICOS_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ocurrió un error interno al aperturar el periodo académico.',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/periodos-academicos
 * Consulta los periodos lectivos configurados y el periodo vigente actual.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const estado = searchParams.get('estado') || searchParams.get('status') || undefined;
    const activoParam = searchParams.get('activo') ?? searchParams.get('isActive');
    const activo = activoParam !== null ? activoParam === 'true' : undefined;
    const onlyVigente = searchParams.get('vigente') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const service = getAcademicPeriodService();
    const result = await service.listPeriods({
      search,
      estado,
      activo,
      onlyVigente,
      page,
      limit,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
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

    console.error('[API_GET_PERIODOS_ACADEMICOS_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar los periodos académicos.',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
