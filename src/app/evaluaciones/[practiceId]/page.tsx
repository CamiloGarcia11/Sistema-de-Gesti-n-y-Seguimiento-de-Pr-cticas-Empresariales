'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Award, CheckCircle2, Loader2, Save, ShieldCheck } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { UserResponseDTO } from '@/types';

interface RubricCriterion {
  id: string;
  name: string;
  weight: number;
}

interface RubricCategory {
  id: string;
  name: string;
  weight: number;
  criteria: RubricCriterion[];
}

interface SavedCriterion {
  criterionId: string;
  score: number;
  comment: string;
}

interface Evaluation {
  id: string;
  status: 'DRAFT' | 'CERTIFIED';
  type: 'PARCIAL_TUTOR' | 'FINAL_TUTOR' | 'FINAL_DOCENTE';
  criteriaScores: SavedCriterion[];
  quantitativeScore: number;
  qualitativeComments: string | null;
  completedAt: string | null;
  evaluator: { name: string };
  auditEvents: { action: string; createdAt: string; actor: { name: string }; justification?: string | null }[];
}

interface CertifiedEvaluation {
  id: string;
  type: 'FINAL_TUTOR' | 'FINAL_DOCENTE';
  quantitativeScore: number;
  completedAt: string | null;
  evaluator: { id: string; name: string; role: string };
  auditEvents: {
    action: string;
    createdAt: string;
    actor: { id: string; name: string };
  }[];
}

interface Level {
  label: string;
  score: number;
}

export default function CompetencyEvaluationPage() {
  const { practiceId } = useParams<{ practiceId: string }>();
  const [user, setUser] = useState<UserResponseDTO | null>(null);
  const [rubric, setRubric] = useState<RubricCategory[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [certifiedEvaluations, setCertifiedEvaluations] = useState<CertifiedEvaluation[]>([]);
  const [consolidatedScore, setConsolidatedScore] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, SavedCriterion>>({});
  const [generalComments, setGeneralComments] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCertification, setShowCertification] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [reopenJustification, setReopenJustification] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const loadEvaluation = useCallback(async () => {
    const [userResponse, rubricResponse] = await Promise.all([
      fetch('/api/v1/auth/me'),
      fetch(`/api/v1/evaluaciones/${practiceId}/rubrica`),
    ]);
    const userData = await userResponse.json();
    const rubricData = await rubricResponse.json();
    if (!userResponse.ok || !userData.success) throw new Error('Debe iniciar sesión para abrir esta evaluación.');
    if (!rubricResponse.ok || !rubricData.success) {
      throw new Error(rubricData.error?.message || 'No se pudo cargar la rúbrica.');
    }
    setUser(userData.data);
    setRubric(rubricData.data.rubric);
    setLevels(rubricData.data.levels);
    const savedEvaluation = rubricData.data.evaluation as Evaluation | null;
    setEvaluation(savedEvaluation);
    setCertifiedEvaluations(rubricData.data.certifiedEvaluations as CertifiedEvaluation[]);
    setConsolidatedScore(rubricData.data.consolidatedScore);
    if (savedEvaluation) {
      const restored: Record<string, SavedCriterion> = {};
      if (Array.isArray(savedEvaluation.criteriaScores)) {
        savedEvaluation.criteriaScores.forEach((item) => {
          restored[item.criterionId] = item;
        });
      }
      setScores(restored);
      setGeneralComments(savedEvaluation.qualitativeComments || '');
    }
  }, [practiceId]);

  useEffect(() => {
    loadEvaluation()
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Error al cargar la rúbrica.'))
      .finally(() => setLoading(false));
  }, [loadEvaluation]);

  const criteria = useMemo(() => rubric.flatMap((category) => category.criteria), [rubric]);
  const selectedWeight = criteria.reduce((sum, criterion) => sum + (scores[criterion.id] ? criterion.weight : 0), 0);
  const liveScore = selectedWeight
    ? criteria.reduce((sum, criterion) => sum + (scores[criterion.id]?.score || 0) * criterion.weight, 0) / selectedWeight
    : 0;
  const isEvaluator = user?.role === 'TUTOR_EMPRESARIAL' || user?.role === 'DOCENTE_PRACTICA' || user?.role === 'DIRECTOR_PROGRAMA';
  const readOnly = !isEvaluator || evaluation?.status === 'CERTIFIED';
  const canReopen = user?.role === 'ADMIN' && evaluation?.status === 'CERTIFIED';

  function updateScore(criterion: RubricCriterion, value: string) {
    setScores((current) => {
      const next = { ...current };
      if (value === '') {
        delete next[criterion.id];
      } else {
        next[criterion.id] = {
          criterionId: criterion.id,
          score: Number(value),
          comment: next[criterion.id]?.comment || '',
        };
      }
      return next;
    });
    setSubmitted(false);
    setError('');
  }

  function updateComment(criterion: RubricCriterion, comment: string) {
    setScores((current) => ({
      ...current,
      [criterion.id]: {
        criterionId: criterion.id,
        score: current[criterion.id]?.score ?? 0,
        comment,
      },
    }));
  }

  function payload() {
    return {
      criteriaScores: Object.values(scores),
      qualitativeComments: generalComments,
    };
  }

  async function saveDraft() {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/v1/evaluaciones/${practiceId}/borrador`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'No se pudo guardar el borrador.');
      setSuccess('Borrador guardado. La nota aún no ha sido certificada ni notificada al practicante.');
      await loadEvaluation();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Error al guardar el borrador.');
    } finally {
      setSubmitting(false);
    }
  }

  async function certify() {
    setSubmitted(true);
    const missing = criteria.filter((criterion) => !scores[criterion.id]);
    const noJustification = criteria.filter(
      (criterion) => scores[criterion.id]?.score === 0 && !scores[criterion.id]?.comment.trim()
    );
    if (missing.length || noJustification.length) {
      setShowCertification(false);
      setError(
        missing.length
          ? 'Debe completar todos los criterios antes de certificar.'
          : 'Debe justificar cada criterio calificado como Insuficiente.'
      );
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/v1/evaluaciones/${practiceId}/finalizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'No se pudo certificar la evaluación.');
      setShowCertification(false);
      setSuccess('Evaluación finalizada y certificada. La edición está bloqueada.');
      await loadEvaluation();
    } catch (certificationError) {
      setError(certificationError instanceof Error ? certificationError.message : 'Error al certificar la evaluación.');
    } finally {
      setSubmitting(false);
    }
  }

  async function reopenEvaluation() {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/evaluaciones/${practiceId}/reabrir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification: reopenJustification }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'No se pudo reabrir la evaluación.');
      setShowReopen(false);
      setReopenJustification('');
      setSuccess('Evaluación reabierta. La justificación quedó registrada en la bitácora.');
      await loadEvaluation();
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : 'Error al reabrir la evaluación.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!loading && user?.role === 'ESTUDIANTE') {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar currentUser={user} />
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <Link href="/evaluaciones" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-700">
            <ArrowLeft className="h-4 w-4" /> Volver a evaluaciones
          </Link>
          <header className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-50 p-3 text-red-700"><Award className="h-6 w-6" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-700">Certificación de competencias</p>
                <h1 className="text-2xl font-black text-slate-900">Resultado de práctica</h1>
              </div>
            </div>
          </header>

          {error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
          ) : (
            <>
              <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
                <p className="text-sm font-bold text-blue-950">Calificación consolidada</p>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {consolidatedScore === null ? 'Pendiente de certificación' : `${consolidatedScore.toFixed(2)} / 5.00`}
                </p>
                <p className="mt-2 text-sm text-blue-900">
                  Promedio ponderado: tutor empresarial 50% y docente supervisor 50%.
                </p>
              </section>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-extrabold text-slate-900">Historial de evaluaciones</h2>
                {certifiedEvaluations.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">Aún no hay evaluaciones certificadas.</p>
                ) : (
                  <ul className="mt-4 space-y-4">
                    {certifiedEvaluations.map((item) => (
                      <li key={item.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-slate-900">
                            {item.type === 'FINAL_TUTOR' ? 'Tutor empresarial' : 'Docente supervisor'}
                          </p>
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Certificada</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">Evaluador: {item.evaluator.name}</p>
                        {item.completedAt && (
                          <p className="mt-1 text-xs text-slate-600">
                            Fecha de certificación: {new Date(item.completedAt).toLocaleString('es-CO')}
                          </p>
                        )}
                        {item.auditEvents.length > 0 && (
                          <details className="mt-3 text-sm text-slate-700">
                            <summary className="cursor-pointer font-semibold">Historial de auditoría</summary>
                            <ul className="mt-2 space-y-1">
                              {item.auditEvents.map((event, index) => (
                                <li key={`${item.id}-${event.action}-${index}`}>
                                  {new Date(event.createdAt).toLocaleString('es-CO')} · {event.action} · {event.actor.name}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar currentUser={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/evaluaciones" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-700">
          <ArrowLeft className="h-4 w-4" /> Volver a evaluaciones
        </Link>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl bg-white p-6 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Cargando rúbrica…</div>
        ) : error && !rubric.length ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : (
          <>
            <header className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-red-50 p-3 text-red-700"><Award className="h-6 w-6" /></div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-red-700">Rúbrica de competencias</p>
                  <h1 className="text-2xl font-black text-slate-900">Evaluación del desempeño en práctica</h1>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                Puntaje ponderado en escala de 0.00 a 5.00. Las tres dimensiones suman el 100% de la nota.
              </p>
            </header>

            {error && <div role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div>}
            {success && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{success}</div>}

            <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Puntaje acumulado">
              {rubric.map((category) => {
                const categoryScore = category.criteria.filter((criterion) => scores[criterion.id])
                  .reduce((sum, criterion) => sum + scores[criterion.id].score * criterion.weight, 0);
                const categoryWeight = category.criteria.filter((criterion) => scores[criterion.id])
                  .reduce((sum, criterion) => sum + criterion.weight, 0);
                return (
                  <div key={category.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{category.name} · {category.weight}%</p>
                    <p className="mt-1 text-lg font-black text-slate-900">
                      {categoryWeight ? `${(categoryScore / categoryWeight).toFixed(2)} / 5` : '—'}
                    </p>
                  </div>
                );
              })}
            </section>

            <section className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-5">
              <h2 className="font-extrabold text-blue-950">Evaluaciones independientes y nota consolidada</h2>
              <p className="mt-1 text-sm text-blue-900">
                La nota final se calcula cuando ambos evaluadores certifiquen: 50% tutor empresarial y 50% docente supervisor.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(['FINAL_TUTOR', 'FINAL_DOCENTE'] as const).map((type) => {
                  const certified = certifiedEvaluations.find((item) => item.type === type);
                  return (
                    <p key={type} className="rounded-lg border border-blue-100 bg-white p-3 text-sm text-slate-800">
                      <strong>{type === 'FINAL_TUTOR' ? 'Tutor empresarial' : 'Docente supervisor'}:</strong>{' '}
                      {certified
                        ? `${certified.quantitativeScore.toFixed(2)} / 5.00 · ${certified.evaluator.name}`
                        : 'Evaluación pendiente'}
                    </p>
                  );
                })}
              </div>
              <p className="mt-3 font-extrabold text-slate-950">
                Nota consolidada: {consolidatedScore === null
                  ? 'Pendiente de ambas certificaciones'
                  : `${consolidatedScore.toFixed(2)} / 5.00`}
              </p>
            </section>

            <div className="mb-5 flex items-center justify-between rounded-xl bg-slate-900 px-5 py-4 text-white">
              <span className="text-sm font-bold">Puntaje acumulado ponderado</span>
              <span className="text-2xl font-black">{liveScore.toFixed(2)} <span className="text-sm font-semibold text-slate-300">/ 5.00</span></span>
            </div>

            <div className="space-y-5">
              {rubric.map((category) => (
                <section key={category.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
                    <h2 className="font-extrabold text-slate-900">{category.name}</h2>
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">Peso {category.weight}%</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {category.criteria.map((criterion) => {
                      const selected = scores[criterion.id];
                      const invalidScore = submitted && !selected;
                      const invalidComment = submitted && selected?.score === 0 && !selected.comment.trim();
                      return (
                        <div key={criterion.id} className="p-5">
                          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                            <label htmlFor={`score-${criterion.id}`} className="font-bold text-slate-800">{criterion.name}</label>
                            <span className="text-xs font-semibold text-slate-500">Peso individual {criterion.weight}%</span>
                          </div>
                          <select
                            id={`score-${criterion.id}`}
                            value={selected ? String(selected.score) : ''}
                            disabled={readOnly}
                            onChange={(event) => updateScore(criterion, event.target.value)}
                            className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-red-200 disabled:bg-slate-100 ${invalidScore ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'}`}
                            aria-invalid={invalidScore}
                          >
                            <option value="" className="bg-white text-slate-900">Selecciona un nivel de logro</option>
                            {levels.map((level) => <option key={level.score} value={level.score} className="bg-white text-slate-900">{level.label} · {level.score.toFixed(1)} / 5</option>)}
                          </select>
                          {invalidScore && <p className="mt-1 text-xs font-semibold text-red-700">Este criterio requiere una calificación.</p>}
                          {selected?.score === 0 && (
                            <div className="mt-3">
                              <label htmlFor={`comment-${criterion.id}`} className="mb-1 block text-xs font-bold text-slate-700">
                                Justificación obligatoria por calificación mínima
                              </label>
                              <textarea
                                id={`comment-${criterion.id}`}
                                rows={2}
                                maxLength={2000}
                                disabled={readOnly}
                                value={selected.comment}
                                onChange={(event) => updateComment(criterion, event.target.value)}
                                className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 disabled:bg-slate-100 ${invalidComment ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'}`}
                              />
                              {invalidComment && <p className="mt-1 text-xs font-semibold text-red-700">Explica el motivo de esta calificación.</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
              <label htmlFor="general-comments" className="mb-2 block font-bold text-slate-900">Retroalimentación general</label>
              <textarea
                id="general-comments"
                rows={4}
                maxLength={5000}
                disabled={readOnly}
                value={generalComments}
                onChange={(event) => setGeneralComments(event.target.value)}
                placeholder="Observaciones generales para el proceso de certificación…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 disabled:bg-slate-100"
              />
            </section>

            {evaluation?.status === 'CERTIFIED' && (
              <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <ShieldCheck className="h-5 w-5" /> Evaluación certificada
                </div>
                <p className="mt-2 text-sm text-emerald-900">
                  Nota de esta evaluación: <strong>{evaluation.quantitativeScore.toFixed(2)} / 5.00</strong>
                  {' '}({evaluation.type === 'FINAL_TUTOR' ? 'Tutor empresarial' : 'Docente supervisor'})
                  {evaluation.completedAt && ` · ${new Date(evaluation.completedAt).toLocaleString('es-CO')}`}
                  {` · Evaluador: ${evaluation.evaluator.name}`}
                </p>
                {evaluation.auditEvents?.length > 0 && (
                  <details className="mt-4 text-sm text-slate-700">
                    <summary className="cursor-pointer font-bold">Historial de auditoría</summary>
                    <ul className="mt-2 space-y-2">
                      {evaluation.auditEvents.map((event, index) => (
                        <li key={`${event.action}-${index}`}>
                          {new Date(event.createdAt).toLocaleString('es-CO')} · {event.action} · {event.actor.name}
                          {event.justification ? ` · Justificación: ${event.justification}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}

            {!readOnly && (
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar borrador
                </button>
                <button
                  type="button"
                  onClick={() => { setSubmitted(true); setError(''); setShowCertification(true); }}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" /> Finalizar y certificar
                </button>
              </div>
            )}

            {canReopen && (
              <div className="mt-6 flex justify-end">
                <button type="button" onClick={() => setShowReopen(true)} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100">
                  Reabrir evaluación (administrador)
                </button>
              </div>
            )}

            {evaluation?.status === 'CERTIFIED' && (
              <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-600">
                <ShieldCheck className="h-4 w-4" /> La evaluación certificada no puede editarse.
              </div>
            )}
          </>
        )}
      </main>

      {showCertification && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="certify-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="certify-title" className="text-lg font-extrabold text-slate-900">Confirmar certificación</h2>
            <p className="mt-2 text-sm text-slate-600">Al finalizar, la calificación queda certificada, disponible para consulta y bloqueada para edición.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowCertification(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
              <button type="button" onClick={certify} disabled={submitting} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                Confirmar y certificar
              </button>
            </div>
          </div>
        </div>
      )}

      {showReopen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reopen-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="reopen-title" className="text-lg font-extrabold text-slate-900">Reapertura administrativa</h2>
            <p className="mt-2 text-sm text-slate-600">La justificación se guardará en la bitácora de auditoría.</p>
            <textarea
              rows={4}
              minLength={10}
              maxLength={2000}
              value={reopenJustification}
              onChange={(event) => setReopenJustification(event.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
              placeholder="Escribe una justificación de al menos 10 caracteres"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowReopen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
              <button type="button" onClick={reopenEvaluation} disabled={submitting || reopenJustification.trim().length < 10} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                Reabrir evaluación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
