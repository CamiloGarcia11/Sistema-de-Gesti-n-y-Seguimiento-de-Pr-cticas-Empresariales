export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - API Endpoint: Exportación de Reportes a Excel (.xlsx)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { authorizeReportAccess, handleReportError } from '@/lib/reportes/guard';
import { parseReportFilters } from '@/server/services/report-dashboard.service';
import { reportExportService } from '@/server/services/report-export.service';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = authorizeReportAccess(req);
  if (auth.denied) return auth.denied;

  try {
    const { searchParams } = new URL(req.url);
    const filters = parseReportFilters(searchParams);

    const excelBuffer = await reportExportService.exportToExcel(filters);

    const fileName = `reporte_practicas_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(excelBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return handleReportError(error, 'API_REPORT_EXPORT_EXCEL');
  }
}
