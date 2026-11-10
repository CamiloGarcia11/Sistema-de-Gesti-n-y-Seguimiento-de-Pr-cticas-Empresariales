export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Alertas Automáticas de ARL Estudiante
// Capa de Controladores (Route Handler RNF11)
// Endpoints:
//   - GET  /api/v1/practicas/alertas/arl (Consulta practicantes con alertas activas y semáforo ARL - Criterio 4)
//   - POST /api/v1/practicas/alertas/arl (Dispara el Job diario RN01 de evaluación y notificación de ARL)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getArlAlertService, ArlAlertError } from '@/server/services/arl-alert.service';
import { arlAlertsCronWorker } from '@/server/jobs/arl-alerts.cron';
import type { ApiResponse, ArlStatus } from '@/types';

const VALID_ARL_STATUSES: ArlStatus[] = [
  'VIGENTE',
  'PROXIMO_A_VENCER',
  'VENCIDO',
  'SIN_AFILIACION',
  'PENDIENTE_REVISION',
];

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar el estado y alertas de ARL',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status') || undefined;
    const status =
      rawStatus && VALID_ARL_STATUSES.includes(rawStatus as ArlStatus)
        ? (rawStatus as ArlStatus)
        : undefined;
    const onlyActiveAlertsParam = searchParams.get('onlyActiveAlerts');
    const onlyActiveAlerts =
      onlyActiveAlertsParam === 'true'
        ? true
        : onlyActiveAlertsParam === 'false'
          ? false
          : undefined;
    const studentId = searchParams.get('studentId') || undefined;
    const search = searchParams.get('search') || undefined;
    const refDateParam = searchParams.get('referenceDate');
    const referenceDate =
      refDateParam && !Number.isNaN(new Date(refDateParam).getTime())
        ? new Date(refDateParam)
        : new Date();

    const service = getArlAlertService();
    const result = await service.getArlAlerts(
      {
        status,
        onlyActiveAlerts,
        studentId,
        search,
      },
      actor,
      referenceDate
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
    if (error instanceof ArlAlertError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: {
              field: error.field,
              constraint: error.constraint,
            },
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_GET_ARL_ALERTAS_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al consultar las alertas de ARL de los practicantes',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para ejecutar el monitoreo diario de ARL',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    if (
      actor.role !== 'DIRECTOR_PROGRAMA' &&
      actor.role !== 'ADMIN' &&
      actor.role !== 'DOCENTE_PRACTICA'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_OPERATION',
            message: 'Solo la coordinación o administración puede ejecutar el chequeo periódico de ARL',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const referenceDate =
      body && typeof body.referenceDate === 'string' && !Number.isNaN(new Date(body.referenceDate).getTime())
        ? new Date(body.referenceDate)
        : new Date();

    const summary = await arlAlertsCronWorker.runDailyCheck(referenceDate);

    return NextResponse.json(
      {
        success: true,
        message: `Chequeo periódico de ARL ejecutado exitosamente. Prácticas evaluadas: ${summary.totalPracticesEvaluated}. Alertas activas: ${summary.alertsGenerated}.`,
        data: {
          summary,
          cronJobStatus: arlAlertsCronWorker.getStatus(),
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[API_POST_ARL_BATCH_CHECK_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al ejecutar el proceso batch de evaluación de ARL',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
