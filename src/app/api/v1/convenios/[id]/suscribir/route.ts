export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Firma Final / Suscripción de Convenio Aprobado
// Endpoint: PATCH /api/v1/convenios/[id]/suscribir
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getAgreementLegalService,
  AgreementLegalError,
} from '@/server/services/agreement-legal.service';
import { ApiResponse } from '@/types';

export async function PATCH(
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
            message: 'Debe iniciar sesión como coordinador para suscribir el convenio',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const service = getAgreementLegalService();
    const updated = await service.subscribeApprovedAgreement(id, actor, body?.notes);

    return NextResponse.json(
      {
        success: true,
        message: `Convenio '${updated.agreementNumber}' suscrito formalmente en estado VIGENTE.`,
        data: updated,
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
            details: { field: error.field, ...error.details },
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[PATCH /api/v1/convenios/[id]/suscribir] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al suscribir el convenio',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
