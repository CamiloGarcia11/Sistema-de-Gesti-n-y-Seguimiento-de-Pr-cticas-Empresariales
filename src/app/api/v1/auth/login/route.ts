export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Inicio de Sesión (Login)
// Capa de Controladores (Route Handler RNF11)
// Módulo: Seguridad / Autenticación y sesión (CU01)
// Endpoint: POST /api/v1/auth/login y POST /api/v1/auth/login/
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authService, AuthError } from '@/server/services/auth.service';
import { ApiResponse, UserResponseDTO } from '@/types';

const loginSchema = z.object({
  email: z.string().email('Ingrese un correo institucional válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const COOKIE_NAME = process.env.COOKIE_NAME || 'sigetrap_session_token';

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<{ user: UserResponseDTO; token: string }>>> {
  try {
    const body = await req.json();
    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos de acceso incompletos o con formato incorrecto',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    // Ejecutar lógica de negocio a través de AuthService (CU01)
    const { user, token } = await authService.login(validationResult.data);

    const response = NextResponse.json(
      {
        success: true,
        data: {
          user,
          token,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );

    // Adjuntar Cookie HTTP-Only segura
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });

    return response;
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
          error: {
            code: error.code,
            message: error.message,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_LOGIN_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al procesar el inicio de sesión',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
