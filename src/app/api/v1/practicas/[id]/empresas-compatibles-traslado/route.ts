export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Endpoint de Búsqueda y Compatibilidad de Empresas Receptoras (HU20 - Criterio 2 & RN02)
// GET /api/v1/practicas/[id]/empresas-compatibles-traslado
// Lista empresas con vacantes disponibles y convenio activo que coincidan con
// los skills del estudiante, ordenando a la UFPS en última prioridad como contingencia.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeTransferService,
  PracticeTransferError,
} from '@/server/services/practice-transfer.service';
import { ApiResponse, CompatibleTransferCompaniesResultDTO } from '@/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<CompatibleTransferCompaniesResultDTO>>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message:
              'Debe iniciar sesión para consultar las empresas receptoras compatibles para traslado.',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const skillsParam = searchParams.get('skills') || undefined;
    const search = searchParams.get('search') || undefined;
    const allowPreview =
      searchParams.get('allowPreview') === 'true' ||
      searchParams.get('preview') === 'true';

    const service = getPracticeTransferService();
    const result = await service.getCompatibleTransferCompanies(
      id,
      {
        skills: skillsParam,
        search,
        allowPreview,
      },
      actor
    );

    return NextResponse.json(
      {
        success: true,
        message: `Se encontraron ${result.total} entidad(es) receptora(s) compatible(s) con el perfil del estudiante (${result.externalOptionsCount} del sector productivo y UFPS en última prioridad).`,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof PracticeTransferError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_GET_EMPRESAS_COMPATIBLES_TRASLADO_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Error interno al consultar las empresas receptoras compatibles para traslado.',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
