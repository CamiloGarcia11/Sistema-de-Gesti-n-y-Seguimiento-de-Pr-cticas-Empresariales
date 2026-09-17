// ==============================================================================
// SIGETRAP - Controlador de Verificación de Identidad de Usuario
// Capa de Controladores (Route Handler RNF11)
// Endpoint: GET /api/v1/usuarios/verificar-identidad?documentNumber=...&email=...
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { userManagementService } from '@/server/services/user-management.service';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor || actor.role !== 'ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Acceso exclusivo para administradores',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const documentNumber = searchParams.get('documentNumber');
    const email = searchParams.get('email') || undefined;

    if (!documentNumber) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'El número de documento es requerido para verificar',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const result = await userManagementService.verifyIdentity(documentNumber, email);

    return NextResponse.json(
      {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API_VERIFY_IDENTITY_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al verificar la identidad del usuario',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
