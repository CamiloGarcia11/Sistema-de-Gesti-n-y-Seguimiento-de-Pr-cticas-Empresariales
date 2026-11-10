import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  CompetencyEvaluationError,
  getCompetencyEvaluation,
} from '@/server/services/competency-evaluation.service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ practica_id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const actor = getAuthenticatedUser(req);
  if (!actor) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión' } }, { status: 401 });
  }

  try {
    const { practica_id } = await params;
    const data = await getCompetencyEvaluation(practica_id, actor);
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error) {
    if (error instanceof CompetencyEvaluationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    console.error('[API_GET_EVALUACION_RUBRICA_ERROR]:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al consultar la rúbrica' } },
      { status: 500 }
    );
  }
}
