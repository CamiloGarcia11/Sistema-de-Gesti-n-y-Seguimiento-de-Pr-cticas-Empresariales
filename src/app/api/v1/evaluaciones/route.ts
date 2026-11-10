import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  CompetencyEvaluationError,
  listCompetencyEvaluations,
} from '@/server/services/competency-evaluation.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = getAuthenticatedUser(req);
  if (!actor) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión' } }, { status: 401 });
  }

  try {
    const data = await listCompetencyEvaluations(actor);
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error) {
    if (error instanceof CompetencyEvaluationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    console.error('[API_GET_EVALUACIONES_ERROR]:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al consultar las evaluaciones' } },
      { status: 500 }
    );
  }
}
