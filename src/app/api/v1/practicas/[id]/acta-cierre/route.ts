export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Endpoint de Generación y Descarga de Acta de Cierre (Criterio 5)
// Emite el documento oficial de liquidación con firmas y sellos digitales
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeLiquidationService,
  PracticeLiquidationError,
} from '@/server/services/practice-liquidation.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para descargar el acta de liquidación',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'html';

    const service = getPracticeLiquidationService();
    const acta = await service.generateActaCierre(id, actor);

    if (format === 'json') {
      return NextResponse.json(
        {
          success: true,
          data: acta,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    // Retornar HTML visualizable y descargable con soporte de impresión PDF
    return new NextResponse(acta.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${acta.filename}"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof PracticeLiquidationError) {
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

    console.error('[API_GET_ACTA_CIERRE_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al generar el acta oficial de cierre de práctica',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
