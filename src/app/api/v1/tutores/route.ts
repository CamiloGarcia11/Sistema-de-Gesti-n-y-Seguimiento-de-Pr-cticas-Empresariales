export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Vinculación y Consulta de Tutores Empresariales (HU09 / CU09)
// Módulo / Épica: Gestión Empresarial y Evaluación de Prácticas
// Caso de Uso: CU09 - Vinculación de Tutores Empresariales
// Endpoints:
//   - POST /api/v1/tutores (Registra y vincula un supervisor inmediato con estado "Activo" -> 201 Created)
//   - GET  /api/v1/tutores (Lista supervisores vinculados por empresa para selector de evaluadores -> 200 OK)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getTutorLinkingService,
  TutorLinkingError,
} from '@/server/services/tutor-linking.service';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/tutores
 * Criterio 1: Crea/asocia el registro en tutores_empresariales vinculado a la empresa con estado "Activo" -> 201 Created
 * Criterio 2: Si el correo tiene formato inválido o ya existe, falla por chk_correo_tutor_valido / uq_tutor_email -> 400 Bad Request
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
            message: 'Debe iniciar sesión para registrar y vincular supervisores empresariales',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const service = getTutorLinkingService();
    const createdTutor = await service.registerCompanyTutor(body, actor);

    return NextResponse.json(
      {
        success: true,
        message: `Supervisor '${createdTutor.nombre}' vinculado exitosamente a la empresa con estado '${createdTutor.estado}'`,
        data: createdTutor,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
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

    console.error('[API_POST_TUTORES_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ocurrió un error inesperado al vincular el tutor empresarial',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/tutores
 * Criterio 3: Lista los supervisores activos vinculados a una empresa para el directorio
 * y el selector de evaluadores directos del formulario de formalización/seguimiento de práctica.
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
            message: 'Debe iniciar sesión para consultar los tutores empresariales',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId') || searchParams.get('empresaId') || undefined;
    const search = searchParams.get('search') || undefined;
    const onlyActiveParam = searchParams.get('onlyActive');
    const onlyActive = onlyActiveParam !== null ? onlyActiveParam !== 'false' : true;

    const service = getTutorLinkingService();
    const result = await service.listCompanyTutors(
      {
        companyId,
        onlyActive,
        search,
      },
      actor
    );

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

    console.error('[API_GET_TUTORES_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar el listado de tutores empresariales',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
