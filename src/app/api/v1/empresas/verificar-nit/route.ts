// ==============================================================================
// SIGETRAP - Verificación en Tiempo Real de NIT (HU07)
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - GET /api/v1/empresas/verificar-nit?nit=...
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  companyManagementService,
  CompanyValidationError,
} from '@/server/services/company-management.service';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { searchParams } = new URL(req.url);
    const nit = searchParams.get('nit');

    if (!nit || nit.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_PARAM',
            message: 'El parámetro NIT es obligatorio',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const result = await companyManagementService.verifyNit(nit);

    return NextResponse.json(
      {
        success: true,
        data: result,
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
          message: 'Error al verificar el NIT de la empresa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
