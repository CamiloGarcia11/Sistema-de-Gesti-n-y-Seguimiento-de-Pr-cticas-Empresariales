export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Habilitación de Usuarios por Documento (HU01)
// Capa de Controladores (Route Handler RNF11)
// Endpoint: POST /api/v1/usuarios/habilitar
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  userManagementService,
  ValidationError,
} from '@/server/services/user-management.service';
import { ApiResponse, Role } from '@/types';

const enableUserSchema = z.object({
  documentNumber: z
    .string({ required_error: 'El número de documento es obligatorio' })
    .min(4, 'El documento debe tener al menos 4 caracteres'),
  documentType: z.string().default('CC'),
  email: z
    .string({ required_error: 'El correo institucional es obligatorio' })
    .email('El formato del correo es inválido'),
  name: z.string().optional(),
  password: z.string().min(6).optional(),
  role: z.enum([
    'DIRECTOR_PROGRAMA',
    'ESTUDIANTE',
    'DOCENTE_PRACTICA',
    'TUTOR_EMPRESARIAL',
    'ADMIN',
  ] as [Role, ...Role[]]).optional(),
  studentCode: z.string().optional(),
  academicAverage: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
      z.number().min(0).max(5).optional()
    ),
  approvedCredits: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
      z.number().int().min(0).optional()
    ),
  phone: z.string().optional(),
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
    const validationResult = enableUserSchema.safeParse(body);

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

    const result = await userManagementService.enableUserByDocument(
      validationResult.data,
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

    console.error('[API_ENABLE_USER_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al habilitar el usuario en el sistema',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
