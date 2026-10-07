export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Registro y Consulta de Usuarios (HU01)
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - POST /api/v1/usuarios  (Registro y validación de unicidad de documento y correo)
//   - GET  /api/v1/usuarios  (Listado paginado de usuarios con filtros)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  userManagementService,
  ValidationError,
} from '@/server/services/user-management.service';
import { ApiResponse, Role, UserStatus } from '@/types';

// Esquema de validación estricto para registro de usuario
const createUserSchema = z.object({
  email: z
    .string({ required_error: 'El correo electrónico es obligatorio' })
    .email('El formato del correo electrónico es inválido'),
  password: z
    .string({ required_error: 'La contraseña es obligatoria' })
    .min(6, 'La contraseña debe tener mínimo 6 caracteres'),
  name: z
    .string({ required_error: 'El nombre completo es obligatorio' })
    .min(3, 'El nombre debe tener al menos 3 caracteres'),
  documentType: z.string().default('CC'),
  documentNumber: z
    .string({ required_error: 'El número de documento es obligatorio' })
    .min(5, 'El documento debe tener al menos 5 caracteres')
    .max(15, 'El documento no puede superar 15 caracteres')
    .regex(/^[A-Za-z0-9]+$/, 'El documento solo puede contener números o letras sin espacios ni caracteres especiales'),
  phone: z.string().optional(),
  role: z.enum([
    'DIRECTOR_PROGRAMA',
    'ESTUDIANTE',
    'DOCENTE_PRACTICA',
    'TUTOR_EMPRESARIAL',
    'ADMIN',
  ] as [Role, ...Role[]], {
    required_error: 'El rol del usuario es obligatorio',
  }),
  studentCode: z.string().optional(),
  academicAverage: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
      z
        .number({ invalid_type_error: 'El promedio académico debe ser un número' })
        .min(0, 'El promedio debe ser mínimo 0.0')
        .max(5, 'El promedio no puede ser superior a 5.0')
        .optional()
    ),
  approvedCredits: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
      z
        .number({ invalid_type_error: 'Los créditos aprobados deben ser un número' })
        .int('Los créditos deben ser un número entero')
        .min(0, 'Los créditos no pueden ser negativos')
        .optional()
    ),
  program: z.string().default('Ingeniería de Sistemas'),
  companyId: z.string().uuid().optional(),
  status: z.enum(['ACTIVO', 'INACTIVO', 'PENDIENTE'] as [UserStatus, ...UserStatus[]]).default('ACTIVO'),
});

/**
 * POST /api/v1/usuarios
 * Registra un nuevo usuario validando que el documento y correo no existan (HU01 - Criterio 1)
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);

    // Parsear y validar el payload
    const body = await req.json();
    const validationResult = createUserSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los datos suministrados no cumplen con el formato requerido',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    // Delegar al servicio de gestión de usuarios
    const user = await userManagementService.registerUser(
      validationResult.data,
      actor || undefined
    );

    return NextResponse.json(
      {
        success: true,
        data: user,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
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

    console.error('[API_CREATE_USER_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ocurrió un error inesperado al registrar el usuario',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/usuarios
 * Consulta de directorio de usuarios con filtros por rol, estado y búsqueda
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar el listado de usuarios',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') as Role | null;
    const status = searchParams.get('status') as UserStatus | null;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await userManagementService.listUsers(
      {
        role: role || undefined,
        status: status || undefined,
        search,
        page,
        limit,
      },
      actor
    );

    return NextResponse.json(
      {
        success: true,
        data: result,
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

    console.error('[API_LIST_USERS_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar la lista de usuarios',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
