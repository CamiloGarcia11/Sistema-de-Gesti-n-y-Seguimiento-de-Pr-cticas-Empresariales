export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Endpoint de Solicitud de Traslado Empresarial (HU20 - Criterio 1 & RN01)
// POST /api/v1/practicas/[id]/solicitar-traslado
// Apertura de expediente de traslado por falta de tutor empresarial:
// - Marca la causa específica AUSENCIA_TUTOR_EMPRESARIAL
// - Congela la práctica actual (EN_TRASLADO_EMPRESARIAL)
// - Genera informe de corte con las horas acumuladas hasta la fecha (RN01)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeTransferService,
  PracticeTransferError,
} from '@/server/services/practice-transfer.service';
import { ApiResponse, RequestPracticeTransferResultDTO } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<RequestPracticeTransferResultDTO>>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message:
              'Debe iniciar sesión como Director de Programa o Coordinador de Prácticas para solicitar el traslado empresarial.',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const service = getPracticeTransferService();
    const result = await service.requestPracticeTransfer(id, body, actor);

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
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

    console.error('[API_POST_SOLICITAR_TRASLADO_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al abrir el expediente de traslado por ausencia de tutor empresarial.',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
