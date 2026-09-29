
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { userRepository } from '@/server/repositories/user.repository';
import { ApiResponse } from '@/types';

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<any>>> {
  try {
   
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión para realizar esta operación' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }
    if (actor.role !== 'ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_RBAC',
            message: 'No tiene privilegios de administrador para acceder a este recurso',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const { users, total } = await userRepository.findMany({ skip: 0, take: 1 });

    const summary = {
      totalUsuarios: total,
      administrador: { id: actor.id, name: actor.name, email: actor.email },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(
      { success: true, data: summary, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[API_ADMIN_DASHBOARD_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error inesperado al obtener el dashboard' },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}