export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Catálogo y Creación de Convocatorias Empresariales
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - GET  /api/v1/vacantes  (Listado de vacantes con filtros de programa y periodo)
//   - POST /api/v1/vacantes  (Creación y publicación de convocatorias por entidad empleadora)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  studentApplicationService,
  ApplicationValidationError,
} from '@/server/services/student-application.service';
import {
  vacancyManagementService,
  VacancyValidationError,
} from '@/server/services/vacancy-management.service';
import { ApiResponse, VacancyFilterDTO, VacancyStatus } from '@/types';

// Esquema Zod de validación para creación de convocatoria
const createVacancySchema = z.object({
  companyId: z.string().optional(),
  title: z
    .string({ required_error: 'El título de la convocatoria es obligatorio' })
    .min(5, 'El título debe tener al menos 5 caracteres')
    .max(255, 'El título no debe exceder 255 caracteres'),
  description: z
    .string({ required_error: 'La descripción del rol es obligatoria' })
    .min(10, 'La descripción debe tener al menos 10 caracteres'),
  requirements: z
    .string({ required_error: 'El perfil de practicante idóneo y requisitos son obligatorios' })
    .min(5, 'Los requisitos deben tener al menos 5 caracteres'),
  program: z.string().default('Ingeniería de Sistemas'),
  academicPeriod: z
    .string({ required_error: 'El periodo académico específico es obligatorio (ej: 2026-1)' })
    .min(4, 'El periodo debe tener al menos 4 caracteres'),
  vacanciesCount: z.coerce.number().int().min(1, 'El número de cupos debe ser al menos 1').default(1),
  status: z.enum(['BORRADOR', 'PUBLICADA']).optional().default('PUBLICADA'),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

/**
 * GET /api/v1/vacantes
 * Consulta catálogo de vacantes con filtros por búsqueda, ciudad, programa y periodo
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { searchParams } = new URL(req.url);

    const filter: VacancyFilterDTO = {
      search: searchParams.get('search') || undefined,
      city: searchParams.get('city') || undefined,
      program: searchParams.get('program') || undefined,
      academicPeriod: searchParams.get('academicPeriod') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      status: (searchParams.get('status') as VacancyStatus) || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20,
    };

    const result = await studentApplicationService.getAvailableVacancies(filter);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationValidationError || error instanceof VacancyValidationError) {
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

    console.error('Error al consultar vacantes:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al consultar el catálogo de vacantes',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/vacantes
 * Crea y publica una nueva convocatoria para entidades empleadoras vinculada a programa y periodo
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
            message: 'Debe iniciar sesión para crear una convocatoria de práctica',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const validationResult = createVacancySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los datos de la convocatoria no cumplen con el formato requerido',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    const created = await vacancyManagementService.createVacancy(
      validationResult.data,
      actor
    );

    return NextResponse.json(
      {
        success: true,
        message:
          created.status === 'PUBLICADA'
            ? 'Convocatoria creada y publicada exitosamente para captación de practicantes idóneos.'
            : 'Convocatoria guardada exitosamente en estado borrador.',
        data: created,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof VacancyValidationError) {
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

    console.error('Error al crear convocatoria:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error inesperado al crear la convocatoria de práctica',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
