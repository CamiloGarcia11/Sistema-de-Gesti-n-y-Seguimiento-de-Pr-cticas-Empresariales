export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Postulaciones y Candidatos
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - GET /api/v1/postulaciones (Listado de postulaciones para tutores empresariales, docentes y administradores)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { applicationRepository } from '@/server/repositories/application.repository';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar las postulaciones',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    // RBAC: Solo Tutor Empresarial, Docente, Director o Admin
    if (
      actor.role !== 'TUTOR_EMPRESARIAL' &&
      actor.role !== 'DOCENTE_PRACTICA' &&
      actor.role !== 'DIRECTOR_PROGRAMA' &&
      actor.role !== 'ADMIN'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_OPERATION',
            message: 'No tiene autorización para consultar el listado general de postulaciones',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const vacancyId = searchParams.get('vacancyId') || undefined;
    const status = searchParams.get('status') || undefined;
    const studentId = searchParams.get('studentId') || undefined;

    // Si es tutor empresarial, solo puede ver postulaciones a vacantes de su propia empresa
    let companyId: string | undefined = undefined;
    if (actor.role === 'TUTOR_EMPRESARIAL') {
      if (!actor.companyId) {
        return NextResponse.json({
          success: true,
          data: { items: [], total: 0 },
          timestamp: new Date().toISOString(),
        });
      }
      companyId = actor.companyId;
    } else {
      companyId = searchParams.get('companyId') || undefined;
    }

    const result = await applicationRepository.findMany({
      companyId,
      vacancyId,
      studentId,
      status,
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
    console.error('[API_GET_POSTULACIONES_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar el listado de postulaciones',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
