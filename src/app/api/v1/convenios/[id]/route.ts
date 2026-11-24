export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Detalle de Convenio
// Endpoint: GET /api/v1/convenios/[id]
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getAgreementLegalService,
  AgreementLegalError,
} from '@/server/services/agreement-legal.service';
import { ApiResponse } from '@/types';

export async function GET(
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
            message: 'Debe iniciar sesión para consultar el detalle del convenio',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const service = getAgreementLegalService();
    const agreement = await service.getAgreementDetails(id, actor);

    return NextResponse.json(
      {
        success: true,
        data: agreement,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof AgreementLegalError) {
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

    console.error('[GET /api/v1/convenios/[id]] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al consultar el convenio',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
