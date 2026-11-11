export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - API Endpoint: Exportación de Reportes a Documento Imprimible / PDF
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

    const { html, filename } = await reportExportService.exportToPdfHtml(filters);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleReportError(error, 'API_REPORT_EXPORT_PDF');
  }
}
