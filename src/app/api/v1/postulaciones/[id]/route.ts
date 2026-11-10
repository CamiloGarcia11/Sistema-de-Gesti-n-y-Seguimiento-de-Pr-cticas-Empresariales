export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Evaluación, Edición y Baja de Postulaciones (CU12)
// Caso de Uso: CU12 - Preselección y Aceptación de Candidatos
// Endpoints:
//   - GET    /api/v1/postulaciones/[id] (Detalle de postulación y hoja de vida)
//   - PATCH  /api/v1/postulaciones/[id] (Actualización de estado o reemplazo de CV)
//   - PUT    /api/v1/postulaciones/[id] (Alias de actualización)
//   - DELETE /api/v1/postulaciones/[id] (Retiro / eliminación segura de postulación)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getCandidateSelectionService,
  CandidateSelectionError,
} from '@/server/services/candidate-selection.service';
import { prisma } from '@/lib/prisma';
import { ApiResponse } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/postulaciones/[id]
 * Actualiza el estado de una postulación (reclutador) o actualiza la hoja de vida adjunta (estudiante)
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para evaluar y actualizar postulaciones',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    // Si el estudiante actualiza su propio soporte de Hoja de Vida (CV)
    if (body.cvUrl && !body.estado && !body.status) {
      const existing = await prisma.application.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'La postulación no existe' },
            timestamp: new Date().toISOString(),
          },
          { status: 404 }
        );
      }
      if (actor.role === 'ESTUDIANTE' && existing.studentId !== actor.id) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'No puede editar la postulación de otro estudiante' },
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        );
      }
      const updated = await prisma.application.update({
        where: { id },
        data: { cvUrl: String(body.cvUrl).trim() },
      });
      return NextResponse.json(
        {
          success: true,
          message: 'Soporte de Hoja de Vida (CV) actualizado exitosamente',
          data: updated,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    const service = getCandidateSelectionService();
    const result = await service.updateApplicationStatus(id, body, actor);

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof CandidateSelectionError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.constraint
              ? { constraint: error.constraint, field: error.field }
              : undefined,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_PATCH_POSTULACION_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al actualizar el estado de la postulación',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/postulaciones/[id]
 * Alias de PATCH para compatibilidad REST
 */
export async function PUT(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  return PATCH(req, context);
}

/**
 * GET /api/v1/postulaciones/[id]
 * Consulta individual de postulación para evaluación de hoja de vida
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar los detalles de la postulación',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const application = await getCandidateSelectionService().getApplicationById(id, actor);

    return NextResponse.json(
      {
        success: true,
        data: application,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof CandidateSelectionError) {
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

    console.error('[API_GET_POSTULACION_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar la postulación',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/postulaciones/[id]
 * Permite retirar o eliminar de forma segura una postulación
 */
export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const existing = await prisma.application.findUnique({
      where: { id },
      include: { practice: true },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'La postulación especificada no existe' },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    if (actor.role === 'ESTUDIANTE' && existing.studentId !== actor.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'No puede retirar la postulación de otro estudiante' },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    // Si tiene una práctica vinculada en estado inicial (POSTULADO), desvincularla o eliminarla antes de borrar la postulación
    if (existing.practice) {
      if (existing.practice.currentStatus === 'POSTULADO' || existing.practice.currentStatus === 'ASPIRANTE') {
        await prisma.practiceStatusHistory.deleteMany({ where: { practiceId: existing.practice.id } });
        await prisma.practice.delete({ where: { id: existing.practice.id } });
      } else {
        await prisma.practice.update({
          where: { id: existing.practice.id },
          data: { applicationId: null },
        });
      }
    }

    await prisma.application.delete({ where: { id } });

    return NextResponse.json(
      {
        success: true,
        message: 'Postulación retirada y eliminada exitosamente.',
        data: { id, deleted: true },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[API_DELETE_POSTULACION_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al retirar la postulación',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
