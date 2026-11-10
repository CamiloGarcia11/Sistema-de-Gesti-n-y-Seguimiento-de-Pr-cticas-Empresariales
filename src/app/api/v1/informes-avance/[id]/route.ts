export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Informe de Avance Individual (CU14)
// Endpoints:
//   - GET /api/v1/informes-avance/[id]
//   - PATCH / PUT /api/v1/informes-avance/[id] (Edición / Revisión de informe y bitácora)
//   - DELETE /api/v1/informes-avance/[id] (Eliminación lógica con recálculo de horas)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ApiResponse } from '@/types';

async function syncPracticeHours(practicaId: string): Promise<number> {
  const reports = await prisma.advanceReport.findMany({
    where: {
      practicaId,
      deletedAt: null,
    },
  });
  const totalHours = reports.reduce(
    (sum: number, r: any) => sum + (Number(r.horasEjecutadas) || 0),
    0
  );
  await prisma.practice.update({
    where: { id: practicaId },
    data: { totalHoursCompleted: totalHours },
  });
  return totalHours;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const params = await Promise.resolve(context.params);
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const report = await prisma.advanceReport.findUnique({
      where: { id: params.id },
      include: {
        bitacoras: true,
      },
    });

    if (!report || report.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Informe de avance no encontrado' },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const adjuntos = await prisma.attachment.findMany({
      where: {
        entidadTipo: 'INFORME_AVANCE',
        entidadId: report.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { ...report, archivosAdjuntos: adjuntos },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[GET_INFORME_ID_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al consultar el informe' },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const params = await Promise.resolve(context.params);
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const report = await prisma.advanceReport.findUnique({
      where: { id: params.id },
      include: { bitacoras: true },
    });

    if (!report || report.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Informe de avance no encontrado' },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    if (actor.role === 'ESTUDIANTE' && report.estudianteId !== actor.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tiene permisos para modificar este informe' },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const updateData: Record<string, any> = {};

    if (body.horasEjecutadas !== undefined) {
      const horas = Number(body.horasEjecutadas);
      if (isNaN(horas) || horas <= 0 || !Number.isInteger(horas)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_HOURS',
              message: 'Las horas ejecutadas deben ser un número entero positivo mayor a cero',
            },
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }
      updateData.horasEjecutadas = horas;
    }

    if (typeof body.descripcionActividades === 'string' && body.descripcionActividades.trim().length >= 10) {
      updateData.descripcionActividades = body.descripcionActividades.trim();
    }

    if (typeof body.tipo === 'string' && body.tipo.trim()) {
      updateData.tipo = body.tipo.trim();
    }

    if (typeof body.estado === 'string' && ['Borrador', 'Radicado', 'En Revisión', 'Aprobado', 'Observado'].includes(body.estado)) {
      updateData.estado = body.estado;
      if (actor.role !== 'ESTUDIANTE') {
        updateData.revisadoPorId = actor.id;
        updateData.revisadoAt = new Date();
      }
    }

    if (body.observaciones !== undefined) {
      updateData.observaciones = body.observaciones ? String(body.observaciones).trim() : null;
    }

    if (body.periodoInicio) {
      updateData.periodoInicio = new Date(body.periodoInicio);
    }

    if (body.periodoFin) {
      updateData.periodoFin = new Date(body.periodoFin);
    }

    const updated = await prisma.advanceReport.update({
      where: { id: params.id },
      data: updateData,
    });

    // Sincronizar bitácora asociada si existe
    if (report.bitacoras && report.bitacoras.length > 0) {
      const firstLog = report.bitacoras[0];
      await prisma.followUpLog.update({
        where: { id: firstLog.id },
        data: {
          ...(updateData.horasEjecutadas !== undefined ? { horasEjecutadas: updateData.horasEjecutadas } : {}),
          ...(updateData.descripcionActividades ? { descripcionActividades: updateData.descripcionActividades } : {}),
          ...(updateData.observaciones !== undefined ? { observaciones: updateData.observaciones } : {}),
        },
      });
    }

    // Agregar nuevos archivos adjuntos si se envían
    if (Array.isArray(body.archivosAdjuntos) && body.archivosAdjuntos.length > 0) {
      for (const file of body.archivosAdjuntos) {
        if (file.nombreArchivo && file.urlArchivo) {
          await prisma.attachment.create({
            data: {
              entidadTipo: 'INFORME_AVANCE',
              entidadId: params.id,
              nombreArchivo: file.nombreArchivo,
              urlArchivo: file.urlArchivo,
              tipoMime: file.tipoMime || 'application/pdf',
              tamanoBytes: Number(file.tamanoBytes || 1024),
              subidoPorId: actor.id,
            },
          });
        }
      }
    }

    const totalHours = await syncPracticeHours(report.practicaId);
    const adjuntos = await prisma.attachment.findMany({
      where: { entidadTipo: 'INFORME_AVANCE', entidadId: params.id },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Informe de avance actualizado exitosamente',
        data: {
          ...updated,
          archivosAdjuntos: adjuntos,
          totalHorasAcumuladasPractica: totalHours,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[PATCH_INFORME_ID_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al actualizar el informe de avance' },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  return PATCH(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const params = await Promise.resolve(context.params);
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const report = await prisma.advanceReport.findUnique({
      where: { id: params.id },
    });

    if (!report || report.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Informe de avance no encontrado' },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    if (actor.role === 'ESTUDIANTE' && report.estudianteId !== actor.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tiene permisos para eliminar este informe' },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    await prisma.advanceReport.update({
      where: { id: params.id },
      data: {
        deletedAt: new Date(),
      },
    });

    await prisma.followUpLog.deleteMany({
      where: { informeId: params.id },
    });

    const totalHours = await syncPracticeHours(report.practicaId);

    return NextResponse.json(
      {
        success: true,
        message: 'Informe de avance eliminado correctamente',
        data: {
          id: params.id,
          deleted: true,
          totalHorasAcumuladasPractica: totalHours,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[DELETE_INFORME_ID_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al eliminar el informe de avance' },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
