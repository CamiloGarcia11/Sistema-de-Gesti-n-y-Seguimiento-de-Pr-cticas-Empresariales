// ==============================================================================
// SIGETRAP - Controlador de Transición de Estados de Práctica
// Capa de Controladores (Route Handler RNF11)
// Endpoint: POST /api/practices/[id]/transition
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  practiceWorkflowService,
  BusinessRuleError,
} from '@/server/services/practice-workflow.service';
import { ApiResponse, PracticeStatus, TransitionResult } from '@/types';

// Esquema de validación estricto para el cuerpo de la petición
const transitionRequestSchema = z.object({
  toStatus: z.enum([
    'ASPIRANTE',
    'POSTULADO',
    'PRESENTADO_A_EMPRESA',
    'REUBICACION_PENDIENTE',
    'ACEPTADO_ARL_PENDIENTE',
    'ASIGNADO_FORMALMENTE',
    'PLAN_EN_REVISION',
    'PRACTICA_EN_EJECUCION',
    'EVALUACION_PENDIENTE',
    'FINALIZADA',
    'CERRADA',
  ] as [PracticeStatus, ...PracticeStatus[]]),
  notes: z.string().optional(),
  arlSupportUrl: z.string().url().optional(),
  presentationLetterUrl: z.string().url().optional(),
  rejectionReason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<TransitionResult>>> {
  try {
    // 1. Extraer y verificar la autenticación del usuario (RNF01, RNF02)
    const user = getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para realizar esta operación',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id: practiceId } = await params;
    if (!practiceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'El identificador de la práctica es obligatorio',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // 2. Parsear y validar el cuerpo de la petición con Zod
    const body = await req.json();
    const validationResult = transitionRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El payload de la petición contiene errores de formato',
            details: validationResult.error.flatten().fieldErrors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    // 3. Delegar la lógica de negocio al Servicio de Workflow
    const result = await practiceWorkflowService.transitionPracticeStatus(
      practiceId,
      validationResult.data,
      user
    );

    // 4. Retornar respuesta exitosa
    return NextResponse.json(
      {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    // Manejo de violaciones a las reglas de negocio (RN-01 a RN-08)
    if (error instanceof BusinessRuleError) {
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

    // Errores internos no controlados
    console.error('[API_TRANSITION_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ocurrió un error inesperado al procesar la transición de estado',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
