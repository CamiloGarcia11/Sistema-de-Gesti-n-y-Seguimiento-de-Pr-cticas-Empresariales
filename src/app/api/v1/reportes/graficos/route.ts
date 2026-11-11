export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - API Endpoint: Métricas y Distribuciones Gráficas
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { authorizeReportAccess, handleReportError } from '@/lib/reportes/guard';
import {
  parseReportFilters,
  reportDashboardService,
} from '@/server/services/report-dashboard.service';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  const auth = authorizeReportAccess(req);
  if (auth.denied) return auth.denied;

  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === 'true';
    const filters = parseReportFilters(searchParams);

    const graficos = await reportDashboardService.getGraficos(filters, refresh);

    return NextResponse.json(
      {
        success: true,
        data: graficos,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleReportError(error, 'API_REPORT_GRAFICOS');
  }
}
