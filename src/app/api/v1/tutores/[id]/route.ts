export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Tutor Empresarial Individual (HU09 / CU09)
// Endpoints:
//   - PATCH / PUT /api/v1/tutores/[id] (Edición de datos, cargo, empresa y estado del tutor)
//   - DELETE /api/v1/tutores/[id] (Desvinculación / Baja lógica de tutor empresarial)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ApiResponse } from '@/types';

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

    if (actor.role !== 'ADMIN' && actor.role !== 'DIRECTOR_PROGRAMA' && actor.role !== 'TUTOR_EMPRESARIAL') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tiene permisos para modificar tutores empresariales' },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const tutor = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!tutor || tutor.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tutor empresarial no encontrado' },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const updateData: Record<string, any> = {};

    const nombre = body.nombre ?? body.name;
    if (typeof nombre === 'string' && nombre.trim().length >= 3) {
      updateData.name = nombre.trim();
    }

    const cargo = body.cargo ?? body.position ?? body.program;
    if (typeof cargo === 'string' && cargo.trim().length >= 2) {
      updateData.program = cargo.trim();
    }

    const correo = body.correo ?? body.email;
    if (typeof correo === 'string' && correo.trim()) {
      const cleanEmail = correo.trim().toLowerCase();
      if (cleanEmail !== tutor.email.toLowerCase()) {
        const dup = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (dup && dup.id !== tutor.id) {
          return NextResponse.json(
            {
              success: false,
              error: { code: 'DUPLICATE_EMAIL', message: 'El correo electrónico ya está registrado por otro usuario' },
              timestamp: new Date().toISOString(),
            },
            { status: 409 }
          );
        }
        updateData.email = cleanEmail;
      }
    }

    const telefono = body.telefono ?? body.phone;
    if (telefono !== undefined) {
      updateData.phone = telefono ? String(telefono).trim() : null;
    }

    const numeroDocumento = body.numeroDocumento ?? body.documentNumber;
    if (typeof numeroDocumento === 'string' && numeroDocumento.trim()) {
      const cleanDoc = numeroDocumento.trim();
      if (cleanDoc !== tutor.documentNumber) {
        const dupDoc = await prisma.user.findUnique({ where: { documentNumber: cleanDoc } });
        if (dupDoc && dupDoc.id !== tutor.id) {
          return NextResponse.json(
            {
              success: false,
              error: { code: 'DUPLICATE_DOCUMENT', message: 'El número de documento ya pertenece a otro usuario' },
              timestamp: new Date().toISOString(),
            },
            { status: 409 }
          );
        }
        updateData.documentNumber = cleanDoc;
      }
    }

    const empresaId = body.empresaId ?? body.companyId;
    if (typeof empresaId === 'string' && empresaId.trim()) {
      updateData.companyId = empresaId.trim();
    }

    if (body.estado !== undefined || body.isActive !== undefined) {
      const active =
        body.isActive !== undefined
          ? Boolean(body.isActive)
          : String(body.estado).toUpperCase() === 'ACTIVO';
      updateData.isActive = active;
      updateData.status = active ? 'ACTIVO' : 'INACTIVO';
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      include: {
        company: {
          select: {
            id: true,
            businessName: true,
            nit: true,
            city: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            practicesAsTutor: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Supervisor empresarial actualizado exitosamente',
        data: {
          id: updated.id,
          nombre: updated.name,
          cargo: updated.program || 'Supervisor Empresarial',
          correo: updated.email,
          tipoDocumento: updated.documentType,
          numeroDocumento: updated.documentNumber,
          telefono: updated.phone,
          estado: updated.isActive && updated.status === 'ACTIVO' ? 'Activo' : 'Inactivo',
          isActive: updated.isActive,
          empresaId: updated.companyId,
          empresa: updated.company
            ? {
                id: updated.company.id,
                razonSocial: updated.company.businessName,
                nit: updated.company.nit,
                ciudad: updated.company.city,
                estado: updated.company.isActive ? 'Activa' : 'Inactiva',
              }
            : null,
          practicasAsignadasCount: updated._count?.practicesAsTutor || 0,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[PATCH_TUTOR_ID_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al actualizar el tutor empresarial' },
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

    if (actor.role !== 'ADMIN' && actor.role !== 'DIRECTOR_PROGRAMA') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Permisos insuficientes para dar de baja a un tutor empresarial' },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const tutor = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            practicesAsTutor: true,
          },
        },
      },
    });

    if (!tutor || tutor.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tutor empresarial no encontrado' },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    await prisma.user.update({
      where: { id: params.id },
      data: {
        isActive: false,
        status: 'INACTIVO',
        deletedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Tutor empresarial dado de baja exitosamente',
        data: { id: params.id, deleted: true },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[DELETE_TUTOR_ID_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al dar de baja al tutor empresarial' },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
