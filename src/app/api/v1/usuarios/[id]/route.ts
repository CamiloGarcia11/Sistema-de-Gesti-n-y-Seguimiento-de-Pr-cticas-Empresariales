export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Detalle, Edición y Baja de Usuario (HU01)
// Capa de Controladores (Route Handler RNF11)
// Endpoints: GET, PATCH, DELETE /api/v1/usuarios/[id]
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  userManagementService,
  ValidationError,
} from '@/server/services/user-management.service';
import { prisma } from '@/lib/prisma';
import { ApiResponse, UserResponseDTO } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<UserResponseDTO>>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar la información del usuario',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: targetUserId } = await params;
    const user = await userManagementService.getUserById(targetUserId, actor);

    return NextResponse.json(
      {
        success: true,
        data: user,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_GET_USER_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar la información del usuario',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<UserResponseDTO>>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para editar usuarios',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    if (actor.role !== 'ADMIN' && actor.role !== 'DIRECTOR_PROGRAMA') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Solo el Administrador o Director de Programa puede actualizar usuarios',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const { id: targetUserId } = await params;
    const existing = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'El usuario especificado no existe',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const body = await req.json();
    const updateData: Record<string, any> = {};

    if (body.name !== undefined) {
      const cleanName = String(body.name).trim();
      if (cleanName.length < 3) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El nombre debe tener al menos 3 caracteres',
            },
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }
      updateData.name = cleanName;
    }

    if (body.email !== undefined) {
      const cleanEmail = String(body.email).trim().toLowerCase();
      if (!cleanEmail.includes('@')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El correo electrónico suministrado no es válido',
            },
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }
      if (cleanEmail !== existing.email.toLowerCase()) {
        const dupEmail = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (dupEmail && dupEmail.id !== targetUserId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EMAIL_ALREADY_EXISTS',
                message: `El correo '${cleanEmail}' ya está en uso por otra cuenta`,
              },
              timestamp: new Date().toISOString(),
            },
            { status: 409 }
          );
        }
      }
      updateData.email = cleanEmail;
    }

    if (body.documentNumber !== undefined) {
      const cleanDoc = String(body.documentNumber).trim();
      if (cleanDoc !== existing.documentNumber) {
        const dupDoc = await prisma.user.findUnique({ where: { documentNumber: cleanDoc } });
        if (dupDoc && dupDoc.id !== targetUserId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'DOCUMENT_ALREADY_EXISTS',
                message: `El documento '${cleanDoc}' ya pertenece a otro usuario`,
              },
              timestamp: new Date().toISOString(),
            },
            { status: 409 }
          );
        }
      }
      updateData.documentNumber = cleanDoc;
    }

    if (body.documentType !== undefined) updateData.documentType = String(body.documentType).trim();
    if (body.phone !== undefined) updateData.phone = body.phone ? String(body.phone).trim() : null;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.program !== undefined) updateData.program = String(body.program).trim();
    if (body.studentCode !== undefined) {
      updateData.studentCode = body.studentCode ? String(body.studentCode).trim() : null;
    }
    if (body.academicAverage !== undefined) {
      updateData.academicAverage =
        body.academicAverage === null || body.academicAverage === ''
          ? null
          : Number(body.academicAverage);
    }
    if (body.approvedCredits !== undefined) {
      updateData.approvedCredits =
        body.approvedCredits === null || body.approvedCredits === ''
          ? null
          : Number(body.approvedCredits);
    }
    if (body.status !== undefined) {
      updateData.status = body.status;
      updateData.isActive = body.status === 'ACTIVO';
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
    });

    const updatedUser = await userManagementService.getUserById(targetUserId, actor);

    return NextResponse.json(
      {
        success: true,
        message: 'Datos del usuario actualizados correctamente',
        data: updatedUser,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[API_PATCH_USER_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al actualizar los datos del usuario',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<{ id: string; deleted: boolean; mode: 'physical' | 'logical'; message: string }>>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor || actor.role !== 'ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Solo un Administrador puede eliminar o dar de baja cuentas de usuario',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const { id: targetUserId } = await params;
    if (targetUserId === actor.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SELF_DELETE_NOT_ALLOWED',
            message: 'No puede eliminar su propia cuenta de administrador con sesión activa',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'El usuario especificado no existe',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    // Verificar dependencias en llaves foráneas para evitar errores 500
    const [practicesCount, applicationsCount] = await Promise.all([
      prisma.practice.count({
        where: {
          OR: [
            { studentId: targetUserId },
            { teacherId: targetUserId },
            { tutorId: targetUserId },
            { directorId: targetUserId },
          ],
        },
      }),
      prisma.application.count({ where: { studentId: targetUserId } }),
    ]);

    if (practicesCount > 0 || applicationsCount > 0) {
      // Soft-delete lógico para preservar integridad referencial e historial
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          status: 'INACTIVO',
          isActive: false,
          deletedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });

      return NextResponse.json(
        {
          success: true,
          message:
            'Usuario dado de baja lógicamente (Soft-Delete) preservando el historial de prácticas y postulaciones asociadas.',
          data: {
            id: targetUserId,
            deleted: true,
            mode: 'logical',
            message: 'Baja lógica aplicada exitosamente',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    // Eliminación física si no posee dependencias
    try {
      await prisma.user.delete({ where: { id: targetUserId } });
      return NextResponse.json(
        {
          success: true,
          message: 'Usuario eliminado físicamente del sistema de forma exitosa.',
          data: {
            id: targetUserId,
            deleted: true,
            mode: 'physical',
            message: 'Eliminación completada exitosamente',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    } catch {
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          status: 'INACTIVO',
          isActive: false,
          deletedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
      return NextResponse.json(
        {
          success: true,
          message: 'Usuario dado de baja lógicamente para conservar la trazabilidad referencial.',
          data: {
            id: targetUserId,
            deleted: true,
            mode: 'logical',
            message: 'Baja lógica aplicada exitosamente',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }
  } catch (error: unknown) {
    console.error('[API_DELETE_USER_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al procesar la baja del usuario',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
