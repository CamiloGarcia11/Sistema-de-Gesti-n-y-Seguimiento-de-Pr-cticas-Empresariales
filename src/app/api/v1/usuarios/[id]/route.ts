// ==============================================================================
// SIGETRAP - Controlador de Detalle de Usuario (HU01)
// Capa de Controladores (Route Handler RNF11)
// Endpoint: GET /api/v1/usuarios/[id]
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  userManagementService,
  ValidationError,
} from '@/server/services/user-management.service';
import { ApiResponse, UserResponseDTO } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<UserResponseDTO>>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar la información del usuario',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: targetUserId } = await params;
    const user = await userManagementService.getUserById(targetUserId, actor);

    return NextResponse.json(
      {
        success: true,
        data: user,
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

    console.error('[API_GET_USER_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar la información del usuario',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
