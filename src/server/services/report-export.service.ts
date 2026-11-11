// ==============================================================================
// SIGETRAP - Servicio de Exportación de Reportes Consolidados (Excel & PDF)
// ==============================================================================

import {
  ReportFilters,
  buildBaseWhere,
  reportRepository,
} from '@/server/repositories/report.repository';
import { reportDashboardService } from './report-dashboard.service';

export const reportExportService = {
  /**
   * Genera un archivo CSV con BOM UTF-8 y delimitador estándar compatible con Microsoft Excel.
   */
  async exportToExcel(filters: ReportFilters): Promise<Buffer> {
    const base = await buildBaseWhere(filters);
    const { rows } = await reportRepository.findRowsPage(base, 1, 5000);

    const headers = [
      'Código Estudiantil',
      'Estudiante',
      'Documento',
      'Programa Académico',
      'Empresa Receptora',
      'Tutor Empresarial',
      'Docente Supervisor',
      'Fecha Inicio',
      'Fecha Fin',
      'Estado',
      'Nota Definitiva',
      'Póliza ARL',
    ];

    const escapeCsv = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvLines: string[] = [
      headers.map(escapeCsv).join(';'),
      ...rows.map((r) =>
        [
          r.codigoEstudiantil || 'N/A',
          r.estudiante,
          r.documento || 'N/A',
          r.programa || 'Ingeniería de Sistemas',
          r.empresa,
          r.tutorEmpresarial || 'Por Asignar',
          r.docente || 'Por Asignar',
          r.fechaInicio || 'N/A',
          r.fechaFin || 'N/A',
          r.estadoLabel || r.estado,
          r.notaDefinitiva !== null && r.notaDefinitiva !== undefined
            ? Number(r.notaDefinitiva).toFixed(2)
            : 'Pendiente',
          r.estadoArl || 'PENDIENTE',
        ]
          .map(escapeCsv)
          .join(';')
      ),
    ];

    // UTF-8 BOM para que Excel en Windows reconozca caracteres en español (tildes, ñ)
    const bom = '\uFEFF';
    return Buffer.from(bom + csvLines.join('\r\n'), 'utf-8');
  },

  /**
   * Genera una vista HTML corporativa lista para descarga o impresión oficial PDF.
   */
  async exportToPdfHtml(filters: ReportFilters): Promise<{ html: string; filename: string }> {
    const base = await buildBaseWhere(filters);
    const [{ rows }, kpis] = await Promise.all([
      reportRepository.findRowsPage(base, 1, 5000),
      reportDashboardService.getKpis(filters, false),
    ]);

    const fechaGen = new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const rowsHtml = rows
      .map(
        (r) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace; text-align: center;">${r.codigoEstudiantil || 'N/A'}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: 600;">${r.estudiante}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.empresa}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; background-color: #fef3c7; color: #92400e;">
            ${r.estadoLabel || r.estado}
          </span>
        </td>
        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; font-family: monospace;">
          ${r.notaDefinitiva !== null && r.notaDefinitiva !== undefined ? Number(r.notaDefinitiva).toFixed(2) : 'Pendiente'}
        </td>
        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${r.estadoArl || 'PENDIENTE'}</td>
      </tr>
    `
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>SIGETRAP - Reporte Ejecutivo Consolidado</title>
  <style>
    @page { size: letter landscape; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; font-size: 12px; }
    .header { border-bottom: 3px solid #b91c1c; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 20px; font-weight: 900; color: #0f172a; margin: 0; }
    .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
    .kpi-grid { display: flex; gap: 12px; margin-bottom: 20px; }
    .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
    .kpi-val { font-size: 20px; font-weight: 900; color: #b91c1c; }
    .kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
    th { background: #1e293b; color: white; padding: 8px; text-align: left; font-weight: 700; }
    tr:nth-child(even) { background-color: #f8fafc; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 15px; text-align: right;">
    <button onclick="window.print()" style="background: #b91c1c; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">
      🖨️ Imprimir / Guardar como PDF
    </button>
  </div>
  <div class="header">
    <div>
      <h1 class="title">UNIVERSIDAD FRANCISCO DE PAULA SANTANDER</h1>
      <div class="subtitle">SIGETRAP · Sistema de Gestión y Seguimiento de Prácticas Empresariales</div>
      <div class="subtitle">Programa: Ingeniería de Sistemas | Generado: ${fechaGen}</div>
    </div>
    <div style="text-align: right;">
      <span style="font-weight: 900; color: #b91c1c; font-size: 16px;">INFORME EJECUTIVO</span>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-val">${kpis.total}</div>
      <div class="kpi-label">Total Prácticas</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${kpis.activas}</div>
      <div class="kpi-label">En Ejecución</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${kpis.finalizadas}</div>
      <div class="kpi-label">Finalizadas</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${kpis.tasaAprobacion}%</div>
      <div class="kpi-label">Tasa Aprobación</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${kpis.alertas.total}</div>
      <div class="kpi-label">Alertas ARL / Control</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align: center;">Código</th>
        <th>Estudiante</th>
        <th>Empresa Receptora</th>
        <th style="text-align: center;">Estado</th>
        <th style="text-align: center;">Nota Definitiva</th>
        <th style="text-align: center;">Póliza ARL</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

    return {
      html,
      filename: `reporte_ejecutivo_practicas_${new Date().toISOString().slice(0, 10)}.html`,
    };
  },
};
