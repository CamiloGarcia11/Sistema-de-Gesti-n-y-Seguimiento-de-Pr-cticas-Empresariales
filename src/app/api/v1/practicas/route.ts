export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Consulta, Supervisión y Formalización de Prácticas
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - GET  /api/v1/practicas (Supervisión para docentes, directores, tutores y administradores)
//   - POST /api/v1/practicas (Emisión y formalización de la práctica empresarial - HU13 / CU13)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { practiceRepository } from '@/server/repositories/practice.repository';
import {
  getPracticeFormalizationService,
  PracticeFormalizationError,
} from '@/server/services/practice-formalization.service';
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

/**
 * POST /api/v1/practicas
 * Emite y formaliza el registro de práctica con tutor docente, tutor externo y plan de trabajo aprobado (HU13 / CU13)
 * Responde 201 Created cuando los requisitos están completos.
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión como coordinador para formalizar la práctica empresarial',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const service = getPracticeFormalizationService();
    const result = await service.formalizePractice(body, actor);

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof PracticeFormalizationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: {
              field: error.field,
              constraint: error.constraint,
            },
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_POST_PRACTICAS_FORMALIZAR_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al procesar la formalización de la práctica empresarial',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
