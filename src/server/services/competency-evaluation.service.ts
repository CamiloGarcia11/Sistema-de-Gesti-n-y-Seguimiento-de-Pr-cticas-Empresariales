import { EvaluationStatus, EvaluationType, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { AuthenticatedUser } from '@/types';

export const COMPETENCY_RUBRIC = [
  {
    id: 'desempeno',
    name: 'Desempeño',
    weight: 40,
    criteria: [
      { id: 'calidad_trabajo', name: 'Calidad del trabajo', weight: 20 },
      { id: 'cumplimiento_objetivos', name: 'Cumplimiento de objetivos', weight: 20 },
    ],
  },
  {
    id: 'responsabilidad',
    name: 'Responsabilidad',
    weight: 30,
    criteria: [
      { id: 'cumplimiento_compromisos', name: 'Cumplimiento de compromisos', weight: 15 },
      { id: 'iniciativa_autonomia', name: 'Iniciativa y autonomía', weight: 15 },
    ],
  },
  {
    id: 'comunicacion',
    name: 'Comunicación',
    weight: 30,
    criteria: [
      { id: 'claridad_comunicacion', name: 'Claridad en la comunicación', weight: 15 },
      { id: 'colaboracion', name: 'Colaboración y trabajo en equipo', weight: 15 },
    ],
  },
] as const;

export const ACHIEVEMENT_LEVELS = [
  { label: 'Insuficiente', score: 0 },
  { label: 'Básico', score: 2 },
  { label: 'Aceptable', score: 3.5 },
  { label: 'Sobresaliente', score: 5 },
] as const;

export const EVALUATOR_SCORE_WEIGHTS = {
  FINAL_TUTOR: 0.5,
  FINAL_DOCENTE: 0.5,
} as const;

type CriterionScore = {
  criterionId: string;
  score: number;
  comment: string;
};

type EvaluationPayload = {
  criteriaScores: CriterionScore[];
  qualitativeComments: string | null;
};

export class CompetencyEvaluationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CompetencyEvaluationError';
  }
}

function getEvaluationType(actor: AuthenticatedUser): EvaluationType {
  if (actor.role === 'TUTOR_EMPRESARIAL') return 'FINAL_TUTOR';
  return 'FINAL_DOCENTE';
}

function isEvaluatorRole(actor: AuthenticatedUser): boolean {
  return (
    actor.role === 'TUTOR_EMPRESARIAL' ||
    actor.role === 'DOCENTE_PRACTICA' ||
    actor.role === 'DIRECTOR_PROGRAMA'
  );
}

async function getAuthorizedPractice(practiceId: string, actor: AuthenticatedUser) {
  const practice = await prisma.practice.findFirst({
    where: { id: practiceId, deletedAt: null },
    include: { tutoringAssignment: true },
  });
  if (!practice) {
    throw new CompetencyEvaluationError('No se encontró la práctica solicitada', 404, 'PRACTICE_NOT_FOUND');
  }

  const isAssignedEvaluator =
    (actor.role === 'TUTOR_EMPRESARIAL' &&
      (practice.tutorId === actor.id || practice.tutoringAssignment?.tutorId === actor.id)) ||
    (actor.role === 'DOCENTE_PRACTICA' && practice.teacherId === actor.id) ||
    (actor.role === 'DIRECTOR_PROGRAMA' && practice.directorId === actor.id);
  const isStudent = actor.role === 'ESTUDIANTE' && practice.studentId === actor.id;

  if (actor.role !== 'ADMIN' && !isAssignedEvaluator && !isStudent) {
    throw new CompetencyEvaluationError('No tiene acceso a la evaluación de esta práctica', 403, 'FORBIDDEN');
  }
  if (isStudent && actor.role === 'ESTUDIANTE') {
    const certifiedEvaluation = await prisma.evaluation.findFirst({
      where: { practiceId, status: 'CERTIFIED' },
    });
    if (!certifiedEvaluation) {
      throw new CompetencyEvaluationError('La evaluación aún no está disponible para consulta', 404, 'EVALUATION_NOT_FOUND');
    }
  }

  return practice;
}

function parsePayload(body: unknown): EvaluationPayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CompetencyEvaluationError('El contenido de la evaluación no es válido', 400, 'INVALID_PAYLOAD');
  }

  const data = body as Record<string, unknown>;
  if (!Array.isArray(data.criteriaScores)) {
    throw new CompetencyEvaluationError('Debe enviar la lista de criterios evaluados', 400, 'INVALID_CRITERIA');
  }

  const allCriteria = COMPETENCY_RUBRIC.flatMap((category) => category.criteria);
  const seen = new Set<string>();
  const criteriaScores: CriterionScore[] = data.criteriaScores.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new CompetencyEvaluationError('Uno de los criterios enviados no es válido', 400, 'INVALID_CRITERION');
    }

    const criterion = item as Record<string, unknown>;
    const criterionId = criterion.criterionId;
    const score = criterion.score;
    const comment = criterion.comment ?? '';
    if (
      typeof criterionId !== 'string' ||
      !allCriteria.some((candidate) => candidate.id === criterionId) ||
      seen.has(criterionId)
    ) {
      throw new CompetencyEvaluationError('Hay criterios desconocidos o repetidos', 400, 'INVALID_CRITERION');
    }
    if (
      typeof score !== 'number' ||
      !ACHIEVEMENT_LEVELS.some((level) => level.score === score)
    ) {
      throw new CompetencyEvaluationError('La puntuación debe corresponder a un nivel de la rúbrica', 400, 'INVALID_SCORE');
    }
    if (typeof comment !== 'string' || comment.length > 2000) {
      throw new CompetencyEvaluationError('La observación no puede superar 2000 caracteres', 400, 'INVALID_COMMENT');
    }
    seen.add(criterionId);
    return { criterionId, score, comment: comment.trim() };
  });

  const qualitativeComments = data.qualitativeComments ?? '';
  if (typeof qualitativeComments !== 'string' || qualitativeComments.length > 5000) {
    throw new CompetencyEvaluationError('La retroalimentación general no puede superar 5000 caracteres', 400, 'INVALID_COMMENT');
  }

  return { criteriaScores, qualitativeComments: qualitativeComments.trim() || null };
}

function calculateScore(criteriaScores: CriterionScore[]): number {
  const weights = new Map(
    COMPETENCY_RUBRIC.flatMap((category) =>
      category.criteria.map((criterion) => [criterion.id, criterion.weight] as const)
    )
  );
  const selectedWeight = criteriaScores.reduce(
    (total, criterion) => total + (weights.get(criterion.criterionId) ?? 0),
    0
  );
  if (selectedWeight === 0) return 0;
  const weightedScore = criteriaScores.reduce(
    (total, criterion) => total + criterion.score * (weights.get(criterion.criterionId) ?? 0),
    0
  );
  return Math.round((weightedScore / selectedWeight) * 100) / 100;
}

function calculateConsolidatedScore(
  evaluations: Array<{ type: EvaluationType; quantitativeScore: number }>
): number | null {
  const latestByType = new Map<EvaluationType, number>();
  for (const evaluation of evaluations) {
    if (!latestByType.has(evaluation.type)) {
      latestByType.set(evaluation.type, evaluation.quantitativeScore);
    }
  }
  const tutorScore = latestByType.get('FINAL_TUTOR');
  const teacherScore = latestByType.get('FINAL_DOCENTE');
  if (tutorScore === undefined || teacherScore === undefined) return null;
  return Math.round(
    (tutorScore * EVALUATOR_SCORE_WEIGHTS.FINAL_TUTOR +
      teacherScore * EVALUATOR_SCORE_WEIGHTS.FINAL_DOCENTE) *
      100
  ) / 100;
}

function validateCompleteRubric(criteriaScores: CriterionScore[]): void {
  const missing = COMPETENCY_RUBRIC.flatMap((category) => category.criteria)
    .filter((criterion) => !criteriaScores.some((score) => score.criterionId === criterion.id));
  if (missing.length) {
    throw new CompetencyEvaluationError(
      'Debe completar todos los criterios antes de certificar la evaluación',
      400,
      'INCOMPLETE_RUBRIC'
    );
  }
  const missingJustifications = criteriaScores.filter(
    (criterion) => criterion.score === 0 && !criterion.comment.trim()
  );
  if (missingJustifications.length) {
    throw new CompetencyEvaluationError(
      'Debe justificar cada criterio calificado como Insuficiente',
      400,
      'MISSING_MINIMUM_SCORE_JUSTIFICATION'
    );
  }
}

async function findEvaluation(
  practiceId: string,
  actor: AuthenticatedUser
) {
  return prisma.evaluation.findFirst({
    where: {
      practiceId,
      ...(actor.role === 'ESTUDIANTE'
        ? { status: 'CERTIFIED' }
        : actor.role === 'ADMIN'
          ? {}
          : { evaluatorId: actor.id, type: getEvaluationType(actor) }),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      evaluator: { select: { id: true, name: true, role: true } },
      auditEvents: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, name: true } } },
      },
    },
  });
}

async function getCertifiedEvaluationSummary(practiceId: string) {
  const evaluations = await prisma.evaluation.findMany({
    where: {
      practiceId,
      status: 'CERTIFIED',
      type: { in: ['FINAL_TUTOR', 'FINAL_DOCENTE'] },
    },
    orderBy: { completedAt: 'desc' },
    include: {
      evaluator: { select: { id: true, name: true, role: true } },
      auditEvents: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, name: true } } },
      },
    },
  });

  return {
    evaluations,
    consolidatedScore: calculateConsolidatedScore(evaluations),
  };
}

export async function getCompetencyEvaluation(practiceId: string, actor: AuthenticatedUser) {
  await getAuthorizedPractice(practiceId, actor);
  const [evaluation, certificationSummary] = await Promise.all([
    findEvaluation(practiceId, actor),
    getCertifiedEvaluationSummary(practiceId),
  ]);
  if (actor.role === 'ESTUDIANTE' && certificationSummary.evaluations.length === 0) {
    throw new CompetencyEvaluationError('La evaluación aún no está disponible para consulta', 404, 'EVALUATION_NOT_FOUND');
  }
  const isStudent = actor.role === 'ESTUDIANTE';
  return {
    rubric: COMPETENCY_RUBRIC,
    levels: ACHIEVEMENT_LEVELS,
    scoreScale: { minimum: 0, maximum: 5 },
    evaluation: isStudent ? null : evaluation,
    certifiedEvaluations: isStudent
      ? certificationSummary.evaluations.map((item) => ({
          id: item.id,
          type: item.type,
          status: item.status,
          completedAt: item.completedAt,
          evaluator: item.evaluator,
          auditEvents: item.auditEvents.map((event) => ({
            action: event.action,
            createdAt: event.createdAt,
            actor: event.actor,
          })),
        }))
      : certificationSummary.evaluations,
    consolidatedScore: certificationSummary.consolidatedScore,
    evaluatorWeights: { tutor: 50, docente: 50 },
  };
}

export async function listCompetencyEvaluations(actor: AuthenticatedUser) {
  if (!isEvaluatorRole(actor) && actor.role !== 'ADMIN' && actor.role !== 'ESTUDIANTE') {
    throw new CompetencyEvaluationError('No tiene autorización para consultar evaluaciones', 403, 'FORBIDDEN');
  }
  const where: Prisma.PracticeWhereInput = {
    deletedAt: null,
    ...(actor.role === 'ESTUDIANTE'
      ? {
          studentId: actor.id,
          evaluations: {
            some: {
              status: 'CERTIFIED',
              type: { in: ['FINAL_TUTOR', 'FINAL_DOCENTE'] },
            },
          },
        }
      : actor.role === 'ADMIN'
        ? {}
        : actor.role === 'TUTOR_EMPRESARIAL'
          ? {
              OR: [
                { tutorId: actor.id },
                { tutoringAssignment: { is: { tutorId: actor.id } } },
              ],
            }
          : actor.role === 'DOCENTE_PRACTICA'
            ? { teacherId: actor.id }
            : { directorId: actor.id }),
  };

  const practices = await prisma.practice.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      currentStatus: true,
      student: { select: { id: true, name: true, studentCode: true } },
      company: { select: { businessName: true } },
      evaluations: {
        where:
          actor.role === 'ESTUDIANTE'
            ? {
                status: 'CERTIFIED',
                type: { in: ['FINAL_TUTOR', 'FINAL_DOCENTE'] },
              }
            : actor.role === 'ADMIN'
              ? {}
              : { OR: [{ status: 'CERTIFIED' }, { evaluatorId: actor.id }] },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          type: true,
          quantitativeScore: true,
          completedAt: true,
          evaluator: { select: { name: true } },
        },
      },
    },
  });
  return practices.map((practice) => {
    const certifiedEvaluations = practice.evaluations.filter(
      (evaluation) => evaluation.status === 'CERTIFIED'
    );
    return {
      ...practice,
      evaluations:
        actor.role === 'ESTUDIANTE'
          ? practice.evaluations.map((evaluation) => ({
              id: evaluation.id,
              status: evaluation.status,
              type: evaluation.type,
              completedAt: evaluation.completedAt,
              evaluator: evaluation.evaluator,
            }))
          : practice.evaluations,
      consolidatedScore: calculateConsolidatedScore(certifiedEvaluations),
    };
  });
}

export async function saveCompetencyDraft(
  practiceId: string,
  body: unknown,
  actor: AuthenticatedUser,
  ipAddress: string | null
) {
  if (!isEvaluatorRole(actor)) {
    throw new CompetencyEvaluationError('Solo un evaluador asignado puede guardar esta rúbrica', 403, 'FORBIDDEN');
  }
  await getAuthorizedPractice(practiceId, actor);
  const payload = parsePayload(body);
  const type = getEvaluationType(actor);
  const existing = await prisma.evaluation.findFirst({
    where: { practiceId, evaluatorId: actor.id, type },
  });
  if (existing?.status === 'CERTIFIED') {
    throw new CompetencyEvaluationError('La evaluación certificada está bloqueada', 409, 'EVALUATION_LOCKED');
  }

  return prisma.$transaction(async (tx) => {
    const evaluation = existing
      ? await tx.evaluation.update({
          where: { id: existing.id },
          data: {
            criteriaScores: payload.criteriaScores,
            quantitativeScore: calculateScore(payload.criteriaScores),
            qualitativeComments: payload.qualitativeComments,
          },
        })
      : await tx.evaluation.create({
          data: {
            practiceId,
            evaluatorId: actor.id,
            type,
            status: 'DRAFT',
            criteriaScores: payload.criteriaScores,
            quantitativeScore: calculateScore(payload.criteriaScores),
            qualitativeComments: payload.qualitativeComments,
          },
        });
    await tx.evaluationAudit.create({
      data: {
        evaluationId: evaluation.id,
        actorId: actor.id,
        action: 'DRAFT_SAVED',
        ipAddress,
      },
    });
    return evaluation;
  });
}

export async function certifyCompetencyEvaluation(
  practiceId: string,
  body: unknown,
  actor: AuthenticatedUser,
  ipAddress: string | null
) {
  if (!isEvaluatorRole(actor)) {
    throw new CompetencyEvaluationError('Solo un evaluador asignado puede certificar esta rúbrica', 403, 'FORBIDDEN');
  }
  await getAuthorizedPractice(practiceId, actor);
  const payload = parsePayload(body);
  validateCompleteRubric(payload.criteriaScores);
  const type = getEvaluationType(actor);
  const existing = await prisma.evaluation.findFirst({
    where: { practiceId, evaluatorId: actor.id, type },
  });
  if (existing?.status === 'CERTIFIED') {
    throw new CompetencyEvaluationError('La evaluación ya fue certificada', 409, 'EVALUATION_LOCKED');
  }

  const score = calculateScore(payload.criteriaScores);
  return prisma.$transaction(async (tx) => {
    const data = {
      status: 'CERTIFIED' as EvaluationStatus,
      criteriaScores: payload.criteriaScores,
      quantitativeScore: score,
      qualitativeComments: payload.qualitativeComments,
      completedAt: new Date(),
      ipAddress,
    };
    const evaluation = existing
      ? await tx.evaluation.update({ where: { id: existing.id }, data })
      : await tx.evaluation.create({
          data: { practiceId, evaluatorId: actor.id, type, ...data },
        });
    await tx.evaluationAudit.create({
      data: {
        evaluationId: evaluation.id,
        actorId: actor.id,
        action: 'CERTIFIED',
        ipAddress,
      },
    });
    const certifiedEvaluations = await tx.evaluation.findMany({
      where: {
        practiceId,
        status: 'CERTIFIED',
        type: { in: ['FINAL_TUTOR', 'FINAL_DOCENTE'] },
      },
      orderBy: { completedAt: 'desc' },
      select: { type: true, quantitativeScore: true },
    });
    await tx.practice.update({
      where: { id: practiceId },
      data: { finalScore: calculateConsolidatedScore(certifiedEvaluations) },
    });
    return evaluation;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reopenCompetencyEvaluation(
  practiceId: string,
  body: unknown,
  actor: AuthenticatedUser,
  ipAddress: string | null
) {
  if (actor.role !== 'ADMIN') {
    throw new CompetencyEvaluationError('Solo un administrador puede reabrir una evaluación', 403, 'FORBIDDEN');
  }
  await getAuthorizedPractice(practiceId, actor);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CompetencyEvaluationError('Debe indicar la justificación de reapertura', 400, 'INVALID_JUSTIFICATION');
  }
  const justification = (body as Record<string, unknown>).justification;
  if (typeof justification !== 'string' || justification.trim().length < 10 || justification.length > 2000) {
    throw new CompetencyEvaluationError(
      'La justificación debe tener entre 10 y 2000 caracteres',
      400,
      'INVALID_JUSTIFICATION'
    );
  }
  const evaluation = await prisma.evaluation.findFirst({
    where: { practiceId, status: 'CERTIFIED' },
    orderBy: { completedAt: 'desc' },
  });
  if (!evaluation) {
    throw new CompetencyEvaluationError('No hay una evaluación certificada para reabrir', 404, 'EVALUATION_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    const reopened = await tx.evaluation.update({
      where: { id: evaluation.id },
      data: { status: 'DRAFT', completedAt: null, ipAddress: null },
    });
    const remainingCertifiedEvaluations = await tx.evaluation.findMany({
      where: {
        practiceId,
        status: 'CERTIFIED',
        type: { in: ['FINAL_TUTOR', 'FINAL_DOCENTE'] },
      },
      orderBy: { completedAt: 'desc' },
      select: { type: true, quantitativeScore: true },
    });
    await tx.practice.update({
      where: { id: practiceId },
      data: { finalScore: calculateConsolidatedScore(remainingCertifiedEvaluations) },
    });
    await tx.evaluationAudit.create({
      data: {
        evaluationId: evaluation.id,
        actorId: actor.id,
        action: 'REOPENED',
        justification: justification.trim(),
        ipAddress,
      },
    });
    return reopened;
  });
}
