export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Bitácoras de Seguimiento (CU14)
// Endpoint: /api/v1/bitacoras
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeFollowUpService,
  PracticeFollowUpError,
} from '@/server/services/practice-followup.service';
import { ApiResponse } from '@/types';

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para radicar bitácoras de seguimiento',
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
        message: 'Bitácora de seguimiento radicada exitosamente',
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

    console.error('[API_BITACORAS_POST_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al radicar la bitácora',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
