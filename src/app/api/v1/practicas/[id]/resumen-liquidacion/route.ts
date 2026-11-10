export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Endpoint de Resumen de Liquidación Académica (Criterio 1)
// Consulta el ponderado evaluativo, horas completadas y estatus de prerrequisitos
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeLiquidationService,
  PracticeLiquidationError,
} from '@/server/services/practice-liquidation.service';
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
            message: 'Debe iniciar sesión para consultar el resumen de liquidación de la práctica',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const service = getPracticeLiquidationService();
    const summary = await service.getLiquidationSummary(id, actor);

    return NextResponse.json(
      {
        success: true,
        data: summary,
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

    console.error('[API_GET_RESUMEN_LIQUIDACION_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar el resumen de liquidación académica de la práctica',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
