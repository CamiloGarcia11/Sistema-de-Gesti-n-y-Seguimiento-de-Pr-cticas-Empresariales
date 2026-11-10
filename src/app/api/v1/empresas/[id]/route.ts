export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Detalle, Actualización, Convenios y Baja de Empresa (HU07 / HU08)
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - GET    /api/v1/empresas/[id]  (Consulta de datos fiscales de una empresa)
//   - PUT    /api/v1/empresas/[id]  (Actualización de datos fiscales)
//   - PATCH  /api/v1/empresas/[id]  (Actualización parcial y gestión de convenio HU08)
//   - DELETE /api/v1/empresas/[id]  (Baja lógica / eliminación segura de empresa)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  companyManagementService,
  CompanyValidationError,
} from '@/server/services/company-management.service';
import { companyRepository } from '@/server/repositories/company.repository';
import { prisma } from '@/lib/prisma';
import { ApiResponse } from '@/types';

const updateCompanySchema = z.object({
  businessName: z.string().min(2).max(255).optional(),
  legalRepresentative: z.string().min(3).max(255).optional(),
  contactEmail: z.string().email().max(255).optional(),
  contactPhone: z.string().min(5).max(50).optional(),
  address: z.string().min(4).optional(),
  city: z.string().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
  agreement: z
    .object({
      agreementNumber: z.string().min(3),
      status: z.enum(['EN_TRAMITE', 'VIGENTE', 'VENCIDO', 'CANCELADO']).default('VIGENTE'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      documentUrl: z.string().optional().nullable(),
      observations: z.string().optional().nullable(),
    })
    .optional(),
});

/**
 * GET /api/v1/empresas/[id]
 * Consulta los datos fiscales y convenios de una empresa por ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
    const company = await companyManagementService.getCompanyById(id);

    return NextResponse.json(
      {
        success: true,
        data: company,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof CompanyValidationError) {
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

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar los datos de la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * PUT / PATCH /api/v1/empresas/[id]
 * Actualiza los datos fiscales de una empresa y/o su convenio institucional (HU08)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
    const actor = getAuthenticatedUser(req);
    const body = await req.json();

    const validationResult = updateCompanySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos de actualización inválidos',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    const { agreement, ...companyFields } = validationResult.data;

    if (Object.keys(companyFields).length > 0) {
      await companyManagementService.updateCompany(
        id,
        companyFields,
        actor || undefined
      );
    }

    if (agreement) {
      const existingAgreement = await prisma.agreement.findFirst({
        where: { companyId: id },
        orderBy: { createdAt: 'desc' },
      });

      const start = agreement.startDate ? new Date(agreement.startDate) : new Date();
      const end = agreement.endDate
        ? new Date(agreement.endDate)
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      if (existingAgreement) {
        await prisma.agreement.update({
          where: { id: existingAgreement.id },
          data: {
            agreementNumber: agreement.agreementNumber.trim(),
            status: agreement.status,
            startDate: start,
            endDate: end,
            documentUrl: agreement.documentUrl ?? existingAgreement.documentUrl,
            notes: agreement.observations ?? existingAgreement.notes,
          },
        });
      } else {
        await prisma.agreement.create({
          data: {
            companyId: id,
            agreementNumber: agreement.agreementNumber.trim(),
            status: agreement.status,
            startDate: start,
            endDate: end,
            documentUrl: agreement.documentUrl || null,
            notes: agreement.observations || 'Convenio Marco de Prácticas Empresariales UFPS',
          },
        });
      }
    }

    const updatedCompany = await companyManagementService.getCompanyById(id);

    return NextResponse.json(
      {
        success: true,
        message: 'Empresa actualizada exitosamente',
        data: updatedCompany,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof CompanyValidationError) {
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

    console.error('[PUT /api/v1/empresas/[id]] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al actualizar los datos de la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  return PUT(req, ctx);
}

/**
 * DELETE /api/v1/empresas/[id]
 * Realiza baja lógica (soft-delete) de la empresa para evitar errores 500 por llaves foráneas
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor || (actor.role !== 'ADMIN' && actor.role !== 'DIRECTOR_PROGRAMA')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Solo el Administrador o Director de Programa puede dar de baja una empresa',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = await companyRepository.findById(id);
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'COMPANY_NOT_FOUND',
            message: 'La empresa especificada no existe',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    await companyRepository.softDelete(id);

    return NextResponse.json(
      {
        success: true,
        message: `Empresa "${existing.businessName}" dada de baja exitosamente (Soft-Delete).`,
        data: { id, deleted: true },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[DELETE /api/v1/empresas/[id]] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al dar de baja la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
