export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Endpoint de Liquidación y Finalización de Práctica (Criterio 3)
// Asienta la calificación definitiva, cierra la práctica y remite al expediente
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeLiquidationService,
  PracticeLiquidationError,
} from '@/server/services/practice-liquidation.service';
import { ApiResponse } from '@/types';

export async function POST(
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
            message: 'Debe iniciar sesión como coordinador para liquidar la práctica formativa',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const service = getPracticeLiquidationService();
    const result = await service.liquidatePractice(id, body, actor);

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
    if (error instanceof PracticeLiquidationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.missingRequirements ? { missingRequirements: error.missingRequirements } : undefined,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_POST_LIQUIDAR_PRACTICA_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al procesar la liquidación académica de la práctica',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
