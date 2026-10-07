// ==============================================================================
// SIGETRAP - Controlador de Consulta y Supervisión de Prácticas
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - GET /api/v1/practicas (Supervisión para docentes, directores, tutores y administradores)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { practiceRepository } from '@/server/repositories/practice.repository';
import { ApiResponse, PracticeStatus } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar el listado de prácticas',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    if (
      actor.role !== 'DOCENTE_PRACTICA' &&
      actor.role !== 'DIRECTOR_PROGRAMA' &&
      actor.role !== 'TUTOR_EMPRESARIAL' &&
      actor.role !== 'ADMIN'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_OPERATION',
            message: 'No tiene autorización para consultar las prácticas institucionales',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as PracticeStatus) || undefined;
    const search = searchParams.get('search') || undefined;

    let companyId: string | undefined = undefined;
    let tutorId: string | undefined = undefined;
    let teacherId: string | undefined = undefined;

    if (actor.role === 'TUTOR_EMPRESARIAL') {
      companyId = actor.companyId || undefined;
      tutorId = searchParams.get('onlyMine') === 'true' ? actor.id : undefined;
    } else if (actor.role === 'DOCENTE_PRACTICA') {
      teacherId = searchParams.get('onlyMine') === 'true' ? actor.id : undefined;
    }

    const result = await practiceRepository.findMany({
      companyId,
      tutorId,
      teacherId,
      status,
      search,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API_GET_PRACTICAS_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar el listado de prácticas',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
