export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Tutores Empresariales por Empresa (HU09 / CU09)
// Endpoints:
//   - GET  /api/v1/empresas/[id]/tutores (Lista supervisores activos de la empresa)
//   - POST /api/v1/empresas/[id]/tutores (Registra y vincula un supervisor a la empresa -> 201 Created)
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
 * GET /api/v1/empresas/[id]/tutores
 * Consulta los supervisores inmediatos vinculados a una empresa específica
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
            message: 'Debe iniciar sesión para consultar los supervisores de la empresa',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: companyId } = await params;
    const { searchParams } = new URL(req.url);
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

    console.error('[API_GET_COMPANY_TUTORS_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar los tutores de la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/empresas/[id]/tutores
 * Registra y vincula un supervisor inmediato a la empresa con ID [id] -> 201 Created
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
            message: 'Debe iniciar sesión para vincular supervisores a la empresa',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: companyId } = await params;
    const body = await req.json().catch(() => ({}));

    const service = getTutorLinkingService();
    const createdTutor = await service.registerCompanyTutor(
      {
        ...body,
        companyId,
      },
      actor
    );

    return NextResponse.json(
      {
        success: true,
        message: `Supervisor '${createdTutor.nombre}' vinculado exitosamente con estado '${createdTutor.estado}'`,
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

    console.error('[API_POST_COMPANY_TUTOR_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al vincular el supervisor a la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
