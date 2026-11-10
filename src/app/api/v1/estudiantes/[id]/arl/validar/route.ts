export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Validación de Póliza ARL por Coordinación
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - PATCH /api/v1/estudiantes/[id]/arl/validar (RN02 - Aprobación o rechazo de ARL)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getArlAlertService, ArlAlertError } from '@/server/services/arl-alert.service';
import type { ApiResponse, ValidateArlDocumentDTO } from '@/types';

async function handleValidateArl(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión como coordinador para validar el certificado de ARL',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const resolvedParams = await Promise.resolve(context.params);
    const studentId = resolvedParams.id;
    const body = await req.json().catch(() => ({}));

    const dto: ValidateArlDocumentDTO = {
      practiceId: body.practiceId,
      approved: Boolean(body.approved),
      expirationDate: body.expirationDate || body.arlExpirationDate,
      rejectionReason: body.rejectionReason || body.observaciones,
    };

    if (typeof body.approved !== 'boolean') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Debe especificar si aprueba o rechaza la póliza de ARL (approved: boolean)',
            details: { field: 'approved' },
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const service = getArlAlertService();
    const result = await service.validateStudentArlDocument(studentId, dto, actor);

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
    if (error instanceof ArlAlertError) {
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

    console.error('[API_PATCH_ESTUDIANTE_ARL_VALIDAR_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al validar la póliza de ARL del estudiante',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  return handleValidateArl(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  return handleValidateArl(req, context);
}
