import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  CompetencyEvaluationError,
  reopenCompetencyEvaluation,
} from '@/server/services/competency-evaluation.service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ practica_id: string }>;
}

function getClientIp(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const actor = getAuthenticatedUser(req);
  if (!actor) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión' } }, { status: 401 });
  }

  try {
    const { practica_id } = await params;
    const body = await req.json();
    const data = await reopenCompetencyEvaluation(practica_id, body, actor, getClientIp(req));
    return NextResponse.json({
      success: true,
      message: 'Evaluación reabierta. La justificación quedó registrada en la bitácora.',
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es JSON válido' } }, { status: 400 });
    }
    if (error instanceof CompetencyEvaluationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    console.error('[API_POST_EVALUACION_REABRIR_ERROR]:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al reabrir la evaluación' } },
      { status: 500 }
    );
  }
}
