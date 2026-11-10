'use client';

// ==============================================================================
// SIGETRAP - Vista de Liquidación y Cierre Académico de Prácticas
// Módulo: Liquidación y Cierre de Práctica Formativa
// Historia de Usuario: Consolidar calificación definitiva y remitir a expediente
// Reglas de Negocio: RN01 (Permisos), RN02 (Aprobado >= 3.0), RN03 (Inmutabilidad)
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import {
  Award,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  UserCheck,
  FileText,
  Clock,
  Printer,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  Send,
  Lock,
  ExternalLink,
  Info,
} from 'lucide-react';
import { LiquidationSummaryDTO, LiquidationResultDTO, UserResponseDTO } from '@/types';

export default function LiquidacionPracticaPage() {
  const params = useParams();
  const router = useRouter();
  const practiceId = params?.id as string;

  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [summary, setSummary] = useState<LiquidationSummaryDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal de confirmación
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resolutionNumber, setResolutionNumber] = useState('');
  const [observations, setObservations] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liquidationSuccess, setLiquidationSuccess] = useState<LiquidationResultDTO | null>(null);

  // Cargar usuario autenticado
  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  // Cargar resumen de liquidación
  const loadSummary = useCallback(async () => {
    if (!practiceId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/practicas/${practiceId}/resumen-liquidacion`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSummary(data.data);
      } else {
        setErrorMsg(data.error?.message || 'Error al cargar el resumen de liquidación');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  }, [practiceId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Ejecutar liquidación (Criterio 3)
  const handleConfirmLiquidation = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/practicas/${practiceId}/liquidar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academicResolutionNumber: resolutionNumber.trim() || undefined,
          observations: observations.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLiquidationSuccess(data.data);
        setShowConfirmModal(false);
        // Recargar resumen actualizado
        await loadSummary();
      } else {
        setErrorMsg(data.error?.message || 'No fue posible completar la liquidación.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Error de conexión al liquidar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCoordinatorOrAdmin =
    currentUser?.role === 'DIRECTOR_PROGRAMA' || currentUser?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {/* Navegación superior */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/estudiantes"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-red-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al Directorio de Estudiantes
          </Link>

          {summary?.isAlreadyLiquidated && (
            <a
              href={`/api/v1/practicas/${practiceId}/acta-cierre`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-red-700 hover:bg-red-800 px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" />
              Descargar / Imprimir Acta Oficial (PDF)
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Encabezado Principal */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-600 mb-1">
            <ShieldCheck className="w-4 h-4" />
            Comité de Prácticas · Liquidación Académica Oficial (RN01 - RN03)
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Consolidación de Calificaciones y Cierre de Práctica
          </h1>
          <p className="text-sm text-slate-600">
            Valide los prerrequisitos documentales, revise las calificaciones ponderadas de empresa y supervisión,
            y asiente la nota definitiva con remisión al expediente curricular.
          </p>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-red-700">Aviso del Sistema</p>
              <p className="text-sm">{errorMsg}</p>
            </div>
          </div>
        )}

        {liquidationSuccess && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-900 p-5 rounded-2xl shadow-sm flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-black text-emerald-900 uppercase tracking-wide">
                ¡Liquidación y Cierre Completados Exitosamente!
              </h3>
              <p className="text-xs text-emerald-800 mt-1">{liquidationSuccess.message}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={liquidationSuccess.actaDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Ver / Imprimir Acta Oficial: {liquidationSuccess.actaNumber}
                </a>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="bg-white rounded-2xl p-16 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
            <p className="text-sm text-slate-500 font-medium">Cargando consolidado evaluativo y expediente...</p>
          </div>
        ) : summary ? (
          <div className="space-y-6">
            {/* Banner de Estado Inmutable si ya fue liquidada */}
            {summary.isAlreadyLiquidated && (
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-700 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs uppercase font-black tracking-wider text-emerald-400">
                      Registro Inmutable (RN03)
                    </span>
                    <h3 className="text-base font-black text-white">
                      Práctica Oficialmente Liquidada y Finalizada
                    </h3>
                    <p className="text-xs text-slate-300">
                      Acta Nº: <strong>{summary.actaNumber || 'ACTA-FINALIZADA'}</strong> · Calificación Asentada:{' '}
                      <strong>{summary.cumulativeFinalScore.toFixed(2)}</strong> ({summary.approvalStatus})
                    </p>
                  </div>
                </div>

                <a
                  href={`/api/v1/practicas/${practiceId}/acta-cierre`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4 text-red-600" />
                  Ver Certificado Oficial
                </a>
              </div>
            )}

            {/* Ficha del Expediente de Práctica */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-red-600" />
                  Expediente Académico del Practicante
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                  {summary.periodName}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-500 block mb-1">Estudiante Practicante</span>
                  <p className="text-sm font-black text-slate-800">{summary.student.name}</p>
                  <p className="text-slate-600">Código: {summary.student.studentCode || 'N/A'}</p>
                  <p className="text-slate-600">Doc: {summary.student.documentNumber || 'N/A'}</p>
                  <p className="text-slate-500 mt-1">{summary.student.program}</p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-500 block mb-1">Entidad Receptora</span>
                  <p className="text-sm font-black text-slate-800 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                    {summary.company.businessName}
                  </p>
                  <p className="text-slate-600">NIT: {summary.company.nit}</p>
                  <p className="text-slate-600">Plaza: {summary.vacancyTitle}</p>
                  <p className="text-slate-500 mt-1">Tutor: {summary.tutor?.name || 'Asignado'}</p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-500 block mb-1">Supervisión Académica</span>
                  <p className="text-sm font-black text-slate-800 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    {summary.teacher?.name || 'Docente Supervisor'}
                  </p>
                  <p className="text-slate-600">Email: {summary.teacher?.email || 'N/A'}</p>
                  <p className="text-slate-600 mt-2">
                    Horas Ejecutadas:{' '}
                    <strong className="text-slate-900">
                      {summary.hoursBreakdown.completedHours} / {summary.hoursBreakdown.requiredHours} hrs
                    </strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Criterio 1: Desglose Evaluativo Consolidado */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Componente 1: Empresa 50% */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Evaluación Empresa (50%)
                    </span>
                    {summary.evaluationsBreakdown[0].isCompleted ? (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Radicada
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Pendiente
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-black text-slate-800">
                    {summary.evaluationsBreakdown[0].label}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Evaluador: {summary.evaluationsBreakdown[0].evaluatorName}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-900">
                    {summary.evaluationsBreakdown[0].score !== null
                      ? summary.evaluationsBreakdown[0].score.toFixed(2)
                      : '0.00'}
                    <span className="text-xs text-slate-400 font-normal"> / 5.0</span>
                  </span>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                    Ponderado:{' '}
                    {summary.evaluationsBreakdown[0].weightedScore !== null
                      ? summary.evaluationsBreakdown[0].weightedScore.toFixed(2)
                      : '0.00'}
                  </span>
                </div>
              </div>

              {/* Componente 2: Docente 30% */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Evaluación Docente (30%)
                    </span>
                    {summary.evaluationsBreakdown[1].isCompleted ? (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Radicada
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Pendiente
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-black text-slate-800">
                    {summary.evaluationsBreakdown[1].label}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Evaluador: {summary.evaluationsBreakdown[1].evaluatorName}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-900">
                    {summary.evaluationsBreakdown[1].score !== null
                      ? summary.evaluationsBreakdown[1].score.toFixed(2)
                      : '0.00'}
                    <span className="text-xs text-slate-400 font-normal"> / 5.0</span>
                  </span>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                    Ponderado:{' '}
                    {summary.evaluationsBreakdown[1].weightedScore !== null
                      ? summary.evaluationsBreakdown[1].weightedScore.toFixed(2)
                      : '0.00'}
                  </span>
                </div>
              </div>

              {/* Componente 3: Horas y Bitácoras 20% */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Horas & Informes (20%)
                    </span>
                    {summary.hoursBreakdown.isCompleted ? (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 100% Horas
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> En Progreso
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-black text-slate-800">
                    Cumplimiento Horas y Bitácoras
                  </h3>
                  <div className="mt-2 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-red-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (summary.hoursBreakdown.completedHours / summary.hoursBreakdown.requiredHours) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {summary.hoursBreakdown.completedHours} de {summary.hoursBreakdown.requiredHours} horas
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-900">
                    {summary.hoursBreakdown.score.toFixed(2)}
                    <span className="text-xs text-slate-400 font-normal"> / 5.0</span>
                  </span>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                    Ponderado: {summary.hoursBreakdown.weightedScore.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Calificación Definitiva Acumulada (RN02) */}
            <div
              className={`rounded-2xl p-6 border shadow-sm flex flex-wrap items-center justify-between gap-6 ${
                summary.approvalStatus === 'APROBADO'
                  ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200'
                  : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-3.5 rounded-2xl ${
                    summary.approvalStatus === 'APROBADO'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 text-white'
                  }`}
                >
                  <Award className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Cálculo Automático de Nota Final (Escala 0.0 a 5.0)
                  </span>
                  <div className="flex items-baseline gap-3 mt-0.5">
                    <span
                      className={`text-3xl font-black ${
                        summary.approvalStatus === 'APROBADO' ? 'text-emerald-800' : 'text-red-800'
                      }`}
                    >
                      {summary.cumulativeFinalScore.toFixed(2)}
                    </span>
                    <span
                      className={`text-xs font-black uppercase px-3 py-1 rounded-full ${
                        summary.approvalStatus === 'APROBADO'
                          ? 'bg-emerald-200 text-emerald-900'
                          : 'bg-red-200 text-red-900'
                      }`}
                    >
                      Concepto: {summary.approvalStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Regla Institucional RN02: Nota ≥ 3.0 aprueba la práctica formativa.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-500 block font-medium">Fórmula Reglamentaria:</span>
                <code className="text-xs font-bold text-slate-700 bg-white/70 px-2.5 py-1 rounded border border-slate-200">
                  (50% Empresa) + (30% Docente) + (20% Horas)
                </code>
              </div>
            </div>

            {/* Criterio 2: Checklist de Prerrequisitos de Cierre */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-red-600" />
                  Prerrequisitos Reglamentarios de Cierre (Criterio 2)
                </h3>
                <span
                  className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                    summary.isLiquidable
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {summary.isLiquidable ? 'Todos los requisitos cumplidos' : 'Requisitos pendientes'}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {summary.prerequisites.map((p) => (
                  <div key={p.code} className="py-3 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {p.isMet ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-xs font-black text-slate-800">{p.title}</p>
                        <p className="text-xs text-slate-500">{p.description}</p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold flex-shrink-0 ${
                        p.isMet ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {p.details}
                    </span>
                  </div>
                ))}
              </div>

              {/* Botón de Acción Principal (Criterio 2 & Criterio 3) */}
              <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                  {!summary.isLiquidable && !summary.isAlreadyLiquidated && (
                    <p className="text-xs text-amber-800 flex items-center gap-1.5 font-medium">
                      <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      El botón de liquidación permanece bloqueado hasta cumplir la totalidad de prerrequisitos (Criterio 2).
                    </p>
                  )}
                  {summary.isAlreadyLiquidated && (
                    <p className="text-xs text-slate-600 font-medium flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      Práctica liquidada. Registros protegidos contra modificaciones posteriores (RN03).
                    </p>
                  )}
                </div>

                {isCoordinatorOrAdmin && (
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={!summary.isLiquidable || summary.isAlreadyLiquidated}
                    className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center gap-2 ${
                      summary.isLiquidable && !summary.isAlreadyLiquidated
                        ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer hover:shadow'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                    }`}
                  >
                    <Award className="w-4 h-4" />
                    Liquidar y Finalizar Práctica
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Modal de Confirmación y Asentamiento de Nota (Criterio 3) */}
        {showConfirmModal && summary && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 text-red-700 rounded-xl">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-black uppercase text-red-600">
                    Confirmación de Asentamiento Definitivo
                  </span>
                  <h3 className="text-lg font-black text-slate-900">
                    Liquidar y Concluir Práctica
                  </h3>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2 mb-4">
                <p>
                  <strong>Practicante:</strong> {summary.student.name} ({summary.student.studentCode})
                </p>
                <p>
                  <strong>Empresa:</strong> {summary.company.businessName}
                </p>
                <p>
                  <strong>Calificación Definitiva:</strong>{' '}
                  <span className="text-sm font-black text-slate-900">
                    {summary.cumulativeFinalScore.toFixed(2)}
                  </span>{' '}
                  ({summary.approvalStatus})
                </p>
                <p className="text-slate-500">
                  Horas Validadas: {summary.hoursBreakdown.completedHours} de {summary.hoursBreakdown.requiredHours} hrs
                </p>
              </div>

              {/* Advertencia de Inmutabilidad RN03 */}
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-900 mb-4 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-amber-800 uppercase font-black tracking-wide">
                    Advertencia de Inmutabilidad (RN03):
                  </strong>
                  Una vez confirmada la liquidación, el estado cambiará a <strong>"FINALIZADA"</strong>, la nota
                  definitiva quedará inmutable y se emitirá el acta oficial remitiendo el resultado al expediente curricular.
                </div>
              </div>

              {/* Campos opcionales */}
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Número de Resolución del Consejo / Acta (Opcional):
                  </label>
                  <input
                    type="text"
                    value={resolutionNumber}
                    onChange={(e) => setResolutionNumber(e.target.value)}
                    placeholder="Ej. RES-CD-045-2026"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Observaciones Finales de Cierre (Opcional):
                  </label>
                  <textarea
                    rows={2}
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Anotaciones de sustentación o cumplimiento institucional..."
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                </div>
              </div>

              {/* Botones del Modal */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLiquidation}
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-all flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Asentando Nota...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Confirmar y Liquidar Práctica
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
