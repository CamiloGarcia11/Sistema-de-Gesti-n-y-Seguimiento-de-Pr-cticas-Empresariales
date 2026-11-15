export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Endpoint de Confirmación de Traslado y Reubicación (HU20 - Criterio 3, RN01, RN02, RN03)
// POST /api/v1/practicas/[id]/confirmar-traslado
// Aplicación de reubicación y traspaso de horas:
// - Actualiza la vinculación a la nueva entidad receptora y nuevo tutor empresarial
// - Preserva el historial de informes y horas válidas del periodo anterior (RN01)
// - Valida advertencia y justificación obligatoria si el destino es la UFPS (RN02)
// - Reevalúa el estado de ARL para amparar las nuevas instalaciones físicas (RN03)
// - Notifica al estudiante, a la nueva empresa y al docente tutor del cambio
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getPracticeTransferService,
  PracticeTransferError,
} from '@/server/services/practice-transfer.service';
import { ApiResponse, ConfirmPracticeTransferResultDTO } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<ConfirmPracticeTransferResultDTO>>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message:
              'Debe iniciar sesión como Director de Programa o Coordinador de Prácticas para confirmar la reubicación empresarial.',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const service = getPracticeTransferService();
    const result = await service.confirmPracticeTransfer(id, body, actor);

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

    console.error('[API_POST_CONFIRMAR_TRASLADO_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al confirmar el traslado y reubicación del practicante.',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
