// ==============================================================================
// SIGETRAP - Controlador de Inicio de Sesión (Login)
// Capa de Controladores (Route Handler RNF11)
// Endpoint: POST /api/v1/auth/login
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userRepository } from '@/server/repositories/user.repository';
import { comparePassword, generateToken } from '@/lib/auth';
import { ApiResponse, UserResponseDTO } from '@/types';

const loginSchema = z.object({
  email: z.string().email('Ingrese un correo institucional válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const COOKIE_NAME = process.env.COOKIE_NAME || 'sigetrap_session_token';

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<{ user: UserResponseDTO; token: string }>>> {
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

    const { email, password } = validationResult.data;
    const user = await userRepository.findByEmail(email);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'El correo electrónico o la contraseña son incorrectos',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    // Validar contraseña
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'El correo electrónico o la contraseña son incorrectos',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    // Validar estado de la cuenta (HU01 - Criterio 2)
    if (user.status === 'INACTIVO' || !user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ACCOUNT_DEACTIVATED',
            message: 'Tu cuenta se encuentra inactiva o deshabilitada. Contacta al administrador del sistema.',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    // Generar JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status as any,
      tokenVersion: user.tokenVersion,
      companyId: user.companyId,
      studentCode: user.studentCode,
    });

    const userDTO: UserResponseDTO = {
      id: user.id,
      email: user.email,
      name: user.name,
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      phone: user.phone,
      role: user.role,
      status: user.status as any,
      isActive: user.isActive,
      studentCode: user.studentCode,
      program: user.program,
      companyId: user.companyId,
      company: user.company,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const response = NextResponse.json(
      {
        success: true,
        data: {
          user: userDTO,
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
  } catch (error) {
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
