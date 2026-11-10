// ==============================================================================
// SIGETRAP - Servicio del Dashboard General de Prácticas
// Capa de Lógica de Negocio: KPIs, gráficos de distribución, filtros y tabla
// ==============================================================================

import {
  BUCKETS_NOTA,
  ESTADOS_ACTIVOS,
  ESTADOS_FINALIZADOS,
  ESTADOS_PENDIENTES,
  ESTADO_ANULADA,
  bucketNota,
  etiquetaEstado,
} from '@/lib/reportes/constants';
import { withCache } from '@/lib/reportes/cache';
import {
  ReportFilters,
  ReportRow,
  buildBaseWhere,
  reportRepository,
} from '@/server/repositories/report.repository';

export type { ReportFilters, ReportRow };

export class ReportValidationError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ReportValidationError';
  }
}

export interface KpisDTO {
  total: number;
  activas: number;
  pendientes: number;
  finalizadas: number;
  aprobadas: number;
  conNota: number;
  tasaAprobacion: number;
  anuladas: number;
  alertas: {
    total: number;
    arlPendiente: number;
    informesPendientes: number;
    retrasadas: number;
  };
  generadoEn: string;
  desdeCache: boolean;
}

export interface SerieItem {
  clave: string;
  nombre: string;
  valor: number;
}

export interface GraficosDTO {
  estados: SerieItem[];
  empresas: SerieItem[];
  calificaciones: SerieItem[];
  promedioGeneral: number | null;
  generadoEn: string;
  desdeCache: boolean;
}

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function leerTexto(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : undefined;
}

function leerFecha(valor: unknown, campo: string, finDeDia: boolean): Date | undefined {
  const texto = leerTexto(valor);
  if (!texto) return undefined;

  const date = new Date(`${texto}T${finDeDia ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (!FECHA_REGEX.test(texto) || Number.isNaN(date.getTime())) {
    throw new ReportValidationError(
      'INVALID_DATE',
      `El parámetro ${campo} debe tener el formato AAAA-MM-DD`
    );
  }
  return date;
}

/**
 * Convierte los parámetros de consulta (o el cuerpo JSON) en filtros validados.
 * Parámetros: periodo, programa, empresa, fecha_inicio, fecha_fin
 */
export function parseReportFilters(
  source: URLSearchParams | Record<string, unknown>
): ReportFilters {
  const get = (key: string): unknown =>
    source instanceof URLSearchParams ? source.get(key) : source[key];

  const filtros: ReportFilters = {
    periodo: leerTexto(get('periodo')),
    programa: leerTexto(get('programa')),
    empresaId: leerTexto(get('empresa')),
    fechaInicio: leerFecha(get('fecha_inicio'), 'fecha_inicio', false),
    fechaFin: leerFecha(get('fecha_fin'), 'fecha_fin', true),
  };

  if (filtros.fechaInicio && filtros.fechaFin && filtros.fechaInicio > filtros.fechaFin) {
    throw new ReportValidationError(
      'INVALID_DATE_RANGE',
      'fecha_inicio no puede ser posterior a fecha_fin'
    );
  }

  return filtros;
}

export function describirFiltros(f: ReportFilters, nombres?: { empresa?: string }): string[] {
  const partes: string[] = [];
  if (f.periodo) partes.push(`Período: ${f.periodo}`);
  if (f.programa) partes.push(`Programa: ${f.programa}`);
  if (f.empresaId) partes.push(`Empresa: ${nombres?.empresa ?? f.empresaId}`);
  if (f.fechaInicio) partes.push(`Desde: ${f.fechaInicio.toISOString().slice(0, 10)}`);
  if (f.fechaFin) partes.push(`Hasta: ${f.fechaFin.toISOString().slice(0, 10)}`);
  return partes;
}

const cacheKey = (prefijo: string, f: ReportFilters) => `${prefijo}:${JSON.stringify(f)}`;

export const reportDashboardService = {
  async getKpis(filters: ReportFilters, refresh = false): Promise<KpisDTO> {
    const { value, cached } = await withCache(
      cacheKey('kpis', filters),
      async (): Promise<KpisDTO> => {
        const base = await buildBaseWhere(filters);
        const ahora = new Date();

        const [porEstado, anuladas, notas, arlPendiente, retrasadas, informesPendientes] =
          await Promise.all([
            reportRepository.countByStatus(base),
            reportRepository.countAnuladas(base),
            reportRepository.countNotasFinalizadas(base),
            reportRepository.countArlPendiente(base),
            reportRepository.countRetrasadas(base, ahora),
            reportRepository.countInformesPendientes(base),
          ]);

        const suma = (estados: string[]) =>
          estados.reduce((acc, e) => acc + (porEstado[e] ?? 0), 0);

        const total = Object.values(porEstado).reduce((acc, n) => acc + n, 0);
        const tasa = notas.conNota > 0 ? (notas.aprobadas / notas.conNota) * 100 : 0;

        return {
          total,
          activas: suma(ESTADOS_ACTIVOS),
          pendientes: suma(ESTADOS_PENDIENTES),
          finalizadas: suma(ESTADOS_FINALIZADOS),
          aprobadas: notas.aprobadas,
          conNota: notas.conNota,
          tasaAprobacion: Math.round(tasa * 10) / 10,
          anuladas,
          alertas: {
            total: arlPendiente + informesPendientes + retrasadas,
            arlPendiente,
            informesPendientes,
            retrasadas,
          },
          generadoEn: ahora.toISOString(),
          desdeCache: false,
        };
      },
      { refresh }
    );

    return { ...value, desdeCache: cached };
  },

  async getGraficos(filters: ReportFilters, refresh = false): Promise<GraficosDTO> {
    const { value, cached } = await withCache(
      cacheKey('graficos', filters),
      async (): Promise<GraficosDTO> => {
        const base = await buildBaseWhere(filters);

        const [porEstado, anuladas, empresas, notas] = await Promise.all([
          reportRepository.countByStatus(base),
          reportRepository.countAnuladas(base),
          reportRepository.topEmpresas(base, 10),
          reportRepository.notasPorPractica(base),
        ]);

        const estados: SerieItem[] = Object.entries(porEstado)
          .map(([clave, valor]) => ({ clave, nombre: etiquetaEstado(clave), valor }))
          .sort((a, b) => b.valor - a.valor);

        // RN03: anuladas / canceladas como categoría independiente
        if (anuladas > 0) {
          estados.push({
            clave: ESTADO_ANULADA,
            nombre: etiquetaEstado(ESTADO_ANULADA),
            valor: anuladas,
          });
        }

        const conteoNotas: Record<string, number> = {};
        for (const b of BUCKETS_NOTA) conteoNotas[b] = 0;
        for (const n of notas) conteoNotas[bucketNota(n)] += 1;

        const promedio =
          notas.length > 0
            ? Math.round((notas.reduce((acc, n) => acc + n, 0) / notas.length) * 100) / 100
            : null;

        return {
          estados,
          empresas: empresas.map((e) => ({ clave: e.nombre, nombre: e.nombre, valor: e.total })),
          calificaciones: BUCKETS_NOTA.map((b) => ({ clave: b, nombre: b, valor: conteoNotas[b] })),
          promedioGeneral: promedio,
          generadoEn: new Date().toISOString(),
          desdeCache: false,
        };
      },
      { refresh }
    );

    return { ...value, desdeCache: cached };
  },

  async getTabla(filters: ReportFilters, page: number, pageSize: number) {
    const base = await buildBaseWhere(filters);
    const pagina = Math.max(1, Math.floor(page) || 1);
    const tamano = Math.min(100, Math.max(1, Math.floor(pageSize) || 10));
    const { rows, total } = await reportRepository.findRowsPage(base, pagina, tamano);

    return {
      rows,
      total,
      page: pagina,
      pageSize: tamano,
      totalPages: Math.max(1, Math.ceil(total / tamano)),
    };
  },

  async getFilterOptions(refresh = false) {
    const { value } = await withCache('filtros', () => reportRepository.listFilterOptions(), {
      refresh,
    });
    return value;
  },
};