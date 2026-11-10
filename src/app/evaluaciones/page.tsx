'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Award, ClipboardCheck, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { UserResponseDTO } from '@/types';

interface EvaluationPractice {
  id: string;
  currentStatus: string;
  student: { id: string; name: string; studentCode: string | null };
  company: { businessName: string };
  evaluations: {
    id: string;
    status: 'DRAFT' | 'CERTIFIED';
    type: 'PARCIAL_TUTOR' | 'FINAL_TUTOR' | 'FINAL_DOCENTE';
    quantitativeScore: number;
    completedAt: string | null;
    evaluator: { name: string };
  }[];
  consolidatedScore: number | null;
}

async function readJsonResponse(response: Response, endpoint: string) {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(
      `El servidor devolvió una respuesta vacía al consultar ${endpoint} (HTTP ${response.status}). Revisa la terminal donde ejecutas npm run dev.`
    );
  }

  try {
    return JSON.parse(body) as {
      success: boolean;
      data?: unknown;
      error?: { message?: string };
    };
  } catch {
    throw new Error(
      `El servidor respondió con un formato inesperado al consultar ${endpoint} (HTTP ${response.status}). Revisa la terminal donde ejecutas npm run dev.`
    );
  }
}

export default function EvaluationsPage() {
  const [user, setUser] = useState<UserResponseDTO | null>(null);
  const [practices, setPractices] = useState<EvaluationPractice[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const userResponse = await fetch('/api/v1/auth/me');
        const userData = await readJsonResponse(userResponse, 'la sesión');
        if (!userResponse.ok || !userData.success) {
          throw new Error('Tu sesión no está activa. Inicia sesión y vuelve a abrir Evaluaciones.');
        }

        const evaluationsResponse = await fetch('/api/v1/evaluaciones');
        const evaluationsData = await readJsonResponse(evaluationsResponse, 'las evaluaciones');
        if (!evaluationsResponse.ok || !evaluationsData.success) {
          throw new Error(evaluationsData.error?.message || 'No se pudieron cargar las evaluaciones.');
        }
        setUser(userData.data as UserResponseDTO);
        setPractices(evaluationsData.data as EvaluationPractice[]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Error al cargar las evaluaciones.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const isStudent = user?.role === 'ESTUDIANTE';

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar currentUser={user} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
            <Award className="h-4 w-4" /> Certificación de competencias
          </div>
          <h1 className="text-3xl font-black text-slate-900">Evaluaciones de práctica</h1>
          <p className="mt-2 text-sm text-slate-600">
            {isStudent
              ? 'Consulta las evaluaciones certificadas disponibles para tus prácticas.'
              : 'Selecciona una práctica asignada para completar o consultar su rúbrica.'}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl bg-white p-6 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando evaluaciones…
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : practices.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <ClipboardCheck className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-3 font-bold text-slate-900">No hay evaluaciones para mostrar</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isStudent ? 'Cuando se certifique una evaluación, aparecerá aquí.' : 'No tienes prácticas asignadas para evaluar.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {practices.map((practice) => {
              const evaluation = practice.evaluations.find((item) => item.status === 'DRAFT')
                || practice.evaluations[0];
              return (
                <article key={practice.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold text-slate-900">{practice.student.name}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {practice.student.studentCode ? `Código ${practice.student.studentCode} · ` : ''}{practice.company.businessName}
                    </p>
                    {isStudent ? (
                      <div className="mt-3 space-y-1 text-sm text-slate-700">
                        {practice.evaluations.map((item) => (
                          <p key={item.id}>
                            {item.type === 'FINAL_TUTOR' ? 'Tutor empresarial' : 'Docente supervisor'} ·{' '}
                            {item.status === 'CERTIFIED' ? 'Certificada' : 'Borrador'} · {item.evaluator.name}
                          </p>
                        ))}
                        <p className="pt-1 font-bold">
                          Calificación consolidada (50% + 50%): {practice.consolidatedScore === null
                            ? 'Pendiente de la evaluación de ambos evaluadores'
                            : `${practice.consolidatedScore.toFixed(2)} / 5.00`}
                        </p>
                      </div>
                    ) : evaluation && (
                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        {evaluation.status === 'CERTIFIED'
                          ? `Certificada · ${evaluation.quantitativeScore.toFixed(2)} / 5.00`
                          : 'Borrador guardado'}
                        {practice.consolidatedScore !== null
                          ? ` · Nota final: ${practice.consolidatedScore.toFixed(2)} / 5.00`
                          : ''}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/evaluaciones/${practice.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-800"
                  >
                    {isStudent ? 'Consultar resultado' : evaluation?.status === 'CERTIFIED' ? 'Ver evaluación' : 'Abrir rúbrica'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
