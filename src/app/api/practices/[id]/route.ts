// ==============================================================================
// SIGETRAP - Controlador de Consulta de Práctica y Trazabilidad
// Capa de Controladores (Route Handler RNF11)
// Endpoint: GET /api/practices/[id]
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { practiceRepository } from '@/server/repositories/practice.repository';
import { ApiResponse } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar la información de la práctica',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: practiceId } = await params;
    const practice = await practiceRepository.findById(practiceId);

    if (!practice) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'La práctica solicitada no fue encontrada',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    // Comprobación de visibilidad según rol (RBAC)
    if (user.role === 'ESTUDIANTE' && practice.studentId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'No tiene autorización para consultar prácticas de otros estudiantes',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: practice,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API_GET_PRACTICE_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar la práctica',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
