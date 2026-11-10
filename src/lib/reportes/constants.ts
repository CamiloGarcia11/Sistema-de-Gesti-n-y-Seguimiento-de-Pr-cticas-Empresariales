// ==============================================================================
// SIGETRAP - Constantes y reglas de clasificación del módulo de Reportes
// HU: Dashboard general de métricas y reportes exportables
// ==============================================================================

import type { PracticeStatus } from '@prisma/client';
import type { Role } from '@/types';

/** RN01 - Roles con acceso a métricas globales y reportes consolidados */
export const ROLES_REPORTES: Role[] = ['DIRECTOR_PROGRAMA', 'ADMIN'];

/** Nota mínima aprobatoria para la tasa de aprobación */
export const NOTA_APROBATORIA = 3.0;

/** RN02 - Tiempo de vida de la caché analítica (15 minutos) */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/** Delimitador del CSV (Excel en configuración regional es-CO usa punto y coma) */
export const CSV_DELIMITER = ';';

/** RN03 - Categoría independiente para registros anulados o cancelados */
export const ESTADO_ANULADA = 'ANULADA_CANCELADA';

export const ESTADOS_ACTIVOS: PracticeStatus[] = ['PRACTICA_EN_EJECUCION'];

export const ESTADOS_PENDIENTES: PracticeStatus[] = [
  'ACEPTADO_ARL_PENDIENTE',
  'ASIGNADO_FORMALMENTE',
  'PLAN_EN_REVISION',
];

export const ESTADOS_FINALIZADOS: PracticeStatus[] = ['FINALIZADA', 'CERRADA'];

/** Estados en los que la ARL ya debería estar validada */
export const ESTADOS_ARL_REQUERIDA: PracticeStatus[] = [
  'ASIGNADO_FORMALMENTE',
  'PLAN_EN_REVISION',
  'PRACTICA_EN_EJECUCION',
  'EVALUACION_PENDIENTE',
];

/** Estados de práctica que se consideran "en curso" para detectar retrasos */
export const ESTADOS_EN_CURSO_PARA_RETRASO: PracticeStatus[] = [
  'PRACTICA_EN_EJECUCION',
  'EVALUACION_PENDIENTE',
];

/** Estados de informe de avance que cuentan como pendientes de revisión */
export const INFORMES_PENDIENTES = ['Radicado', 'En Revisión'];

export const ESTADO_LABELS: Record<string, string> = {
  ASPIRANTE: 'Aspirante',
  POSTULADO: 'Postulado',
  PRESENTADO_A_EMPRESA: 'Presentado a empresa',
  REUBICACION_PENDIENTE: 'Reubicación pendiente',
  ACEPTADO_ARL_PENDIENTE: 'Aceptado - ARL pendiente',
  ASIGNADO_FORMALMENTE: 'Asignado formalmente',
  PLAN_EN_REVISION: 'Plan en revisión',
  PRACTICA_EN_EJECUCION: 'Práctica en ejecución',
  EVALUACION_PENDIENTE: 'Evaluación pendiente',
  FINALIZADA: 'Finalizada',
  CERRADA: 'Cerrada / liquidada',
  [ESTADO_ANULADA]: 'Anulada / cancelada',
};

export function etiquetaEstado(estado: string): string {
  return ESTADO_LABELS[estado] ?? estado;
}

export type EstadoArl = 'Validada' | 'Pendiente' | 'No aplica';

/** Estado de la ARL derivado de arlValidatedAt y de la etapa del flujo */
export function resolverEstadoArl(practica: {
  arlValidatedAt: Date | null;
  currentStatus: PracticeStatus;
}): EstadoArl {
  if (practica.arlValidatedAt) return 'Validada';
  if (
    practica.currentStatus === 'ACEPTADO_ARL_PENDIENTE' ||
    ESTADOS_ARL_REQUERIDA.includes(practica.currentStatus)
  ) {
    return 'Pendiente';
  }
  return 'No aplica';
}

export const BUCKETS_NOTA = ['0.0-2.9', '3.0-3.4', '3.5-3.9', '4.0-4.4', '4.5-5.0'] as const;

export function bucketNota(nota: number): (typeof BUCKETS_NOTA)[number] {
  if (nota < 3) return '0.0-2.9';
  if (nota < 3.5) return '3.0-3.4';
  if (nota < 4) return '3.5-3.9';
  if (nota < 4.5) return '4.0-4.4';
  return '4.5-5.0';
}