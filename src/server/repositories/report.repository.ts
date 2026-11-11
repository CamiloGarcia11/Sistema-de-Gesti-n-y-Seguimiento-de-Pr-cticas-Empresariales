// ==============================================================================
// SIGETRAP - Repositorio de Reportes y Analítica de Prácticas
// Capa de Acceso a Datos (Prisma)
// ==============================================================================

import { Prisma, PracticeStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  ESTADOS_ARL_REQUERIDA,
  ESTADOS_EN_CURSO_PARA_RETRASO,
  ESTADOS_FINALIZADOS,
  ESTADO_ANULADA,
  INFORMES_PENDIENTES,
  NOTA_APROBATORIA,
  etiquetaEstado,
  resolverEstadoArl,
} from '@/lib/reportes/constants';

export interface ReportFilters {
  periodo?: string;
  programa?: string;
  empresaId?: string;
  fechaInicio?: Date;
  fechaFin?: Date;
}

export interface ReportRow {
  id: string;
  codigoEstudiantil: string;
  codigo: string;
  documento: string;
  estudiante: string;
  programa: string;
  empresa: string;
  tutorEmpresarial: string;
  docente: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  estado: string;
  estadoLabel: string;
  notaDefinitiva: number | null;
  nota: number | null;
  horas: number;
  horasRequeridas: number;
  periodo: string;
  estadoArl: string;
  arlStatus: string;
}

/** RN03 - Registros vigentes (excluye anulados / cancelados) */
const VIGENTE: Prisma.PracticeWhereInput = { isActive: true, deletedAt: null };

/** RN03 - Registros anulados o cancelados formalmente */
const ANULADA: Prisma.PracticeWhereInput = {
  OR: [{ isActive: false }, { deletedAt: { not: null } }],
};

function finDeDia(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** Fecha de referencia de una práctica: startDate o, si no existe, createdAt */
function porRangoDeFechas(rango: Prisma.DateTimeFilter): Prisma.PracticeWhereInput {
  return {
    OR: [{ startDate: rango }, { AND: [{ startDate: null }, { createdAt: rango }] }],
  };
}

/** Construye el filtro base (período, programa, empresa y rango de fechas) */
export async function buildBaseWhere(f: ReportFilters): Promise<Prisma.PracticeWhereInput> {
  const and: Prisma.PracticeWhereInput[] = [];

  if (f.empresaId) {
    and.push({ companyId: f.empresaId });
  }

  if (f.programa) {
    and.push({ student: { program: f.programa } });
  }

  if (f.periodo) {
    const period = await prisma.academicPeriod.findFirst({
      where: { code: f.periodo, deletedAt: null },
      select: { startDate: true, endDate: true },
    });

    const opciones: Prisma.PracticeWhereInput[] = [{ vacancy: { academicPeriod: f.periodo } }];

    if (period) {
      // Prácticas cuya vacante no declara período: se ubican por sus fechas
      opciones.push({
        AND: [
          { OR: [{ vacancyId: null }, { vacancy: { academicPeriod: null } }] },
          porRangoDeFechas({ gte: period.startDate, lte: finDeDia(period.endDate) }),
        ],
      });
    }

    and.push({ OR: opciones });
  }

  if (f.fechaInicio || f.fechaFin) {
    const rango: Prisma.DateTimeFilter = {};
    if (f.fechaInicio) rango.gte = f.fechaInicio;
    if (f.fechaFin) rango.lte = f.fechaFin;
    and.push(porRangoDeFechas(rango));
  }

  return and.length ? { AND: and } : {};
}

const vigentes = (base: Prisma.PracticeWhereInput): Prisma.PracticeWhereInput => ({
  AND: [base, VIGENTE],
});

const ROW_SELECT = {
  id: true,
  currentStatus: true,
  startDate: true,
  endDate: true,
  finalScore: true,
  arlValidatedAt: true,
  isActive: true,
  deletedAt: true,
  student: { select: { studentCode: true, name: true, program: true, documentNumber: true } },
  company: { select: { businessName: true } },
  tutor: { select: { name: true } },
  teacher: { select: { name: true } },
} satisfies Prisma.PracticeSelect;

type RowPayload = Prisma.PracticeGetPayload<{ select: typeof ROW_SELECT }>;

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function mapRow(p: RowPayload): ReportRow {
  const anulada = !p.isActive || p.deletedAt !== null;
  const estado = anulada ? ESTADO_ANULADA : p.currentStatus;
  const estadoArl = resolverEstadoArl({
    arlValidatedAt: p.arlValidatedAt,
    currentStatus: p.currentStatus,
  });

  return {
    id: p.id,
    codigoEstudiantil: p.student.studentCode ?? '',
    codigo: p.student.studentCode ?? '',
    documento: p.student.documentNumber ?? '',
    estudiante: p.student.name,
    programa: p.student.program,
    empresa: p.company.businessName,
    tutorEmpresarial: p.tutor?.name ?? '',
    docente: p.teacher?.name ?? '',
    fechaInicio: isoDate(p.startDate),
    fechaFin: isoDate(p.endDate),
    estado,
    estadoLabel: etiquetaEstado(estado),
    notaDefinitiva: p.finalScore ?? null,
    nota: p.finalScore ?? null,
    horas: 160,
    horasRequeridas: 320,
    periodo: '2026-1',
    estadoArl,
    arlStatus: estadoArl,
  };
}

export const reportRepository = {
  /** Conteo de prácticas vigentes agrupadas por estado del flujo */
  async countByStatus(base: Prisma.PracticeWhereInput): Promise<Record<string, number>> {
    const groups = await prisma.practice.groupBy({
      by: ['currentStatus'],
      where: vigentes(base),
      _count: { _all: true },
    });
    const result: Record<string, number> = {};
    for (const g of groups) result[g.currentStatus] = g._count._all;
    return result;
  },

  async countAnuladas(base: Prisma.PracticeWhereInput): Promise<number> {
    return prisma.practice.count({ where: { AND: [base, ANULADA] } });
  },

  /** Finalizadas con nota definitiva y cuántas son aprobatorias */
  async countNotasFinalizadas(
    base: Prisma.PracticeWhereInput
  ): Promise<{ conNota: number; aprobadas: number }> {
    const finalizadas: Prisma.PracticeWhereInput = {
      AND: [
        base,
        VIGENTE,
        { currentStatus: { in: ESTADOS_FINALIZADOS } },
        { finalScore: { not: null } },
      ],
    };
    const [conNota, aprobadas] = await Promise.all([
      prisma.practice.count({ where: finalizadas }),
      prisma.practice.count({
        where: { AND: [finalizadas, { finalScore: { gte: NOTA_APROBATORIA } }] },
      }),
    ]);
    return { conNota, aprobadas };
  },

  /** Alerta: ARL pendiente de validación */
  async countArlPendiente(base: Prisma.PracticeWhereInput): Promise<number> {
    return prisma.practice.count({
      where: {
        AND: [
          base,
          VIGENTE,
          {
            OR: [
              { currentStatus: 'ACEPTADO_ARL_PENDIENTE' as PracticeStatus },
              {
                currentStatus: { in: ESTADOS_ARL_REQUERIDA },
                arlValidatedAt: null,
              },
            ],
          },
        ],
      },
    });
  },

  /** Alerta: prácticas en curso cuya fecha de fin ya pasó */
  async countRetrasadas(base: Prisma.PracticeWhereInput, now: Date): Promise<number> {
    return prisma.practice.count({
      where: {
        AND: [
          base,
          VIGENTE,
          { currentStatus: { in: ESTADOS_EN_CURSO_PARA_RETRASO } },
          { endDate: { lt: now } },
        ],
      },
    });
  },

  /** Alerta: informes de avance radicados / en revisión sin resolver */
  async countInformesPendientes(base: Prisma.PracticeWhereInput): Promise<number> {
    return prisma.advanceReport.count({
      where: {
        deletedAt: null,
        estado: { in: INFORMES_PENDIENTES },
        practice: vigentes(base),
      },
    });
  },

  /** Empresas con mayor número de practicantes vinculados */
  async topEmpresas(
    base: Prisma.PracticeWhereInput,
    take = 10
  ): Promise<Array<{ nombre: string; total: number }>> {
    const groups = await prisma.practice.groupBy({
      by: ['companyId'],
      where: vigentes(base),
      _count: { _all: true },
      orderBy: { _count: { companyId: 'desc' } },
      take,
    });

    if (groups.length === 0) return [];

    const companies = await prisma.company.findMany({
      where: { id: { in: groups.map((g) => g.companyId) } },
      select: { id: true, businessName: true },
    });
    const names = new Map(companies.map((c) => [c.id, c.businessName]));

    return groups.map((g) => ({
      nombre: names.get(g.companyId) ?? 'Empresa sin nombre',
      total: g._count._all,
    }));
  },

  /**
   * Nota por práctica vigente: nota definitiva o, si aún no existe,
   * el promedio de las evaluaciones (rúbricas) registradas.
   */
  async notasPorPractica(base: Prisma.PracticeWhereInput): Promise<number[]> {
    const practicas = await prisma.practice.findMany({
      where: {
        AND: [
          base,
          VIGENTE,
          { OR: [{ finalScore: { not: null } }, { evaluations: { some: {} } }] },
        ],
      },
      select: {
        finalScore: true,
        evaluations: { select: { quantitativeScore: true } },
      },
    });

    const notas: number[] = [];
    for (const p of practicas) {
      if (p.finalScore !== null) {
        notas.push(p.finalScore);
      } else if (p.evaluations.length > 0) {
        const suma = p.evaluations.reduce((acc, e) => acc + e.quantitativeScore, 0);
        notas.push(suma / p.evaluations.length);
      }
    }
    return notas;
  },

  /** Página de la tabla consolidada (incluye anuladas, marcadas con su estado) */
  async findRowsPage(
    base: Prisma.PracticeWhereInput,
    page: number,
    pageSize: number
  ): Promise<{ rows: ReportRow[]; total: number }> {
    const [total, items] = await Promise.all([
      prisma.practice.count({ where: base }),
      prisma.practice.findMany({
        where: base,
        select: ROW_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { rows: items.map(mapRow), total };
  },

  /** Recorre todas las filas por lotes (cursor) para exportaciones de gran volumen */
  async *iterateRows(
    base: Prisma.PracticeWhereInput,
    batchSize = 500
  ): AsyncGenerator<ReportRow, void, undefined> {
    let cursor: string | undefined;

    while (true) {
      const items = await prisma.practice.findMany({
        where: base,
        select: ROW_SELECT,
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (items.length === 0) return;
      for (const item of items) yield mapRow(item);

      cursor = items[items.length - 1].id;
      if (items.length < batchSize) return;
    }
  },

  /** Opciones para los selectores de filtros */
  async listFilterOptions() {
    const [periodos, programas, empresas] = await Promise.all([
      prisma.academicPeriod.findMany({
        where: { deletedAt: null },
        select: { code: true, name: true },
        orderBy: { startDate: 'desc' },
      }),
      prisma.user.findMany({
        where: { role: 'ESTUDIANTE', deletedAt: null },
        select: { program: true },
        distinct: ['program'],
        orderBy: { program: 'asc' },
      }),
      prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true, businessName: true },
        orderBy: { businessName: 'asc' },
      }),
    ]);

    return {
      periodos: periodos.map((p) => ({ codigo: p.code, nombre: p.name })),
      programas: programas.map((p) => p.program),
      empresas: empresas.map((e) => ({ id: e.id, nombre: e.businessName })),
    };
  },
};