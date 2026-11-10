// ==============================================================================
// SIGETRAP - Guardas de acceso y respuestas de error del módulo de Reportes
// RN01 - Solo Dirección de Programa (coordinación) y Administrador
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, hasRequiredRole } from '@/lib/auth';
import { ApiResponse, AuthenticatedUser } from '@/types';
import { ROLES_REPORTES } from './constants';
import { ReportValidationError } from '@/server/services/report-dashboard.service';

type GuardResult =
  | { actor: AuthenticatedUser; denied?: undefined }
  | { actor?: undefined; denied: NextResponse<ApiResponse> };

export function authorizeReportAccess(req: NextRequest): GuardResult {
  const actor = getAuthenticatedUser(req);

  if (!actor) {
    return {
      denied: NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión para consultar los reportes' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      ),
    };
  }

  if (!hasRequiredRole(actor.role, ROLES_REPORTES)) {
    return {
      denied: NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_RBAC',
            message:
              'Solo la Dirección de Programa y los administradores pueden ver métricas globales y exportar reportes',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      ),
    };
  }

  return { actor };
}

export function reportErrorResponse(error: unknown, tag: string): NextResponse<ApiResponse> {
  if (error instanceof ReportValidationError) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code, message: error.message },
        timestamp: new Date().toISOString(),
      },
      { status: error.statusCode }
    );
  }

  console.error(`[${tag}]:`, error);
  return NextResponse.json(
    {
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error inesperado al procesar el reporte' },
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}