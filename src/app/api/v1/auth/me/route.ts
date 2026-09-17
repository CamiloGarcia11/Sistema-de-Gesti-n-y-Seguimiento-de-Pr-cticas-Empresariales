// ==============================================================================
// SIGETRAP - Perfil del Usuario Autenticado
// Endpoint: GET /api/v1/auth/me
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { userRepository } from '@/server/repositories/user.repository';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  const actor = getAuthenticatedUser(req);
  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No hay una sesión activa',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    );
  }

  const user = await userRepository.findById(actor.id);
  if (!user || user.status === 'INACTIVO' || !user.isActive) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Cuenta inactiva',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        documentType: user.documentType,
        documentNumber: user.documentNumber,
        phone: user.phone,
        role: user.role,
        status: user.status,
        isActive: user.isActive,
        studentCode: user.studentCode,
        program: user.program,
        company: user.company,
      },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
