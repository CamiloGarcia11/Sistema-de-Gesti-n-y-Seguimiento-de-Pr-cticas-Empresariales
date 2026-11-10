export const dynamic = 'force-dynamic';

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
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
    const filters = parseReportFilters(searchParams);

    const tabla = await reportDashboardService.getTabla(filters, page, pageSize);

    return NextResponse.json(
      {
        success: true,
        data: tabla,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleReportError(error);
  }
}
