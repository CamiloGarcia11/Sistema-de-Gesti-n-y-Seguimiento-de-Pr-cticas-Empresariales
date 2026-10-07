export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Desactivación de Usuarios por Documento (HU01)
// Capa de Controladores (Route Handler RNF11)
// Endpoint: POST /api/v1/usuarios/deshabilitar
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  userManagementService,
  ValidationError,
} from '@/server/services/user-management.service';
import { ApiResponse } from '@/types';

const disableUserSchema = z.object({
  documentNumber: z
    .string({ required_error: 'El número de documento es obligatorio' })
    .min(5, 'El documento debe tener al menos 5 caracteres')
    .max(15, 'El documento no puede superar 15 caracteres')
    .regex(/^[A-Za-z0-9]+$/, 'El documento solo puede contener números o letras sin espacios ni caracteres especiales'),
});

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
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

    const body = await req.json();
    const validationResult = disableUserSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos incompletos o con formato incorrecto',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    const result = await userManagementService.disableUserByDocument(
      validationResult.data.documentNumber,
      actor
    );

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
            details: error.field ? { field: error.field } : undefined,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_DISABLE_USER_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al desactivar el usuario en el sistema',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
