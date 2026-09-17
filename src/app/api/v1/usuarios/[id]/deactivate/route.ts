// ==============================================================================
// SIGETRAP - Controlador de Desactivación de Usuarios (HU01 - Criterio 2)
// Capa de Controladores (Route Handler RNF11)
// Endpoint: POST /api/v1/usuarios/[id]/deactivate
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  userManagementService,
  ValidationError,
} from '@/server/services/user-management.service';
import { ApiResponse, DeactivateUserResponseDTO } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/usuarios/[id]/deactivate
 * Desactiva una cuenta y revoca los tokens de sesión vigentes (Admin Auth)
 */
export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<DeactivateUserResponseDTO>>> {
  try {
    // 1. Extraer y verificar la autenticación del usuario administrador (Admin Auth)
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para realizar esta operación',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: targetUserId } = await params;
    if (!targetUserId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'El identificador del usuario es obligatorio',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // 2. Ejecutar la desactivación mediante el servicio de negocio
    const result = await userManagementService.deactivateUser(targetUserId, actor);

    // 3. Responder 200 OK
    return NextResponse.json(
      {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
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

    console.error('[API_DEACTIVATE_USER_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ocurrió un error inesperado al desactivar la cuenta',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
