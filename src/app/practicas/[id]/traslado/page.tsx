'use client';

// ==============================================================================
// SIGETRAP - Vista de Protocolo de Traslado y Reubicación de Practicante (HU20)
// Historia de Usuario:
//   HU20 - Protocolo de Traslado y Reubicación de Practicante por Ausencia de Tutor Empresarial
// Criterios de Aceptación:
//   - Criterio 1: Declaración de causa AUSENCIA_TUTOR_EMPRESARIAL, congelamiento y generación de informe de corte.
//   - Criterio 2: Búsqueda y compatibilidad de empresas receptoras disponibles con UFPS al final como última instancia.
//   - Criterio 3: Asignación a nueva entidad, preservación del histórico formativo y notificación a las partes.
// Reglas de Negocio:
//   - RN01: Preservación de horas acumuladas como saldo a favor.
//   - RN02: UFPS como último recurso con advertencia de confirmación y justificación obligatoria.
//   - RN03: Reevaluación de cobertura ARL para nuevas instalaciones físicas (o amparo sede UFPS).
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  ArrowLeft,
  ArrowRightLeft,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserX,
  Briefcase,
  BellRing,
  Snowflake,
} from 'lucide-react';
import {
  CompatibleTransferCompaniesResultDTO,
  CompatibleTransferCompanyItemDTO,
  ConfirmPracticeTransferResultDTO,
  PracticeCutoffReportDTO,
  RequestPracticeTransferResultDTO,
  UserResponseDTO,
} from '@/types';

export default function TrasladoPracticantePage() {
  const params = useParams();
  const rawId = params?.id as string;
  const practiceId =
    rawId && rawId !== 'undefined' && rawId !== '[id]'
      ? rawId
      : '574821c9-8787-4f6d-865d-81f45f8f91e6';

  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado del Paso 1: Solicitud de Traslado e Informe de Corte (Criterio 1)
  const [reasonCode, setReasonCode] = useState<'AUSENCIA_TUTOR_EMPRESARIAL'>(
    'AUSENCIA_TUTOR_EMPRESARIAL'
  );
  const [transferJustification, setTransferJustification] = useState(
    'El tutor empresarial asignado renunció sin reemplazo y la empresa receptora notificó incapacidad de suministrar un evaluador directo para el seguimiento formativo.'
  );
  const [cutoffHoursInput, setCutoffHoursInput] = useState<string>('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestResult, setRequestResult] =
    useState<RequestPracticeTransferResultDTO | null>(null);
  const [cutoffReport, setCutoffReport] = useState<PracticeCutoffReportDTO | null>(
    null
  );

  // Estado del Paso 2: Empresas Compatibles con UFPS en última prioridad (Criterio 2)
  const [compatibleData, setCompatibleData] =
    useState<CompatibleTransferCompaniesResultDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [skillsFilter, setSkillsFilter] = useState('');
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  // Estado del Paso 3: Selección de Destino, Advertencia RN02 UFPS y Confirmación (Criterio 3)
  const [selectedCompany, setSelectedCompany] =
    useState<CompatibleTransferCompanyItemDTO | null>(null);
  const [selectedVacancyId, setSelectedVacancyId] = useState<string>('');
  const [selectedTutorId, setSelectedTutorId] = useState<string>('');
  const [confirmUfpsWarning, setConfirmUfpsWarning] = useState<boolean>(false);
  const [ufpsJustification, setUfpsJustification] = useState<string>('');
  const [relocationObservations, setRelocationObservations] = useState<string>('');
  const [isConfirmingTransfer, setIsConfirmingTransfer] = useState(false);
  const [confirmResult, setConfirmResult] =
    useState<ConfirmPracticeTransferResultDTO | null>(null);

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

  // Cargar contexto y empresas compatibles (allowPreview=true para visualizar desde el inicio)
  const loadTransferContext = useCallback(
    async (customSearch?: string, customSkills?: string) => {
      if (!practiceId) return;
      setIsLoadingCompanies(true);
      setErrorMsg(null);
      try {
        const qp = new URLSearchParams();
        qp.set('allowPreview', 'true');
        if (customSearch !== undefined ? customSearch : searchQuery) {
          qp.set('search', (customSearch !== undefined ? customSearch : searchQuery).trim());
        }
        if (customSkills !== undefined ? customSkills : skillsFilter) {
          qp.set('skills', (customSkills !== undefined ? customSkills : skillsFilter).trim());
        }

        const res = await fetch(
          `/api/v1/practicas/${practiceId}/empresas-compatibles-traslado?${qp.toString()}`
        );
        const data = await res.json();
        if (res.ok && data.success && data.data) {
          const result: CompatibleTransferCompaniesResultDTO = data.data;
          setCompatibleData(result);
          if (!skillsFilter && result.studentSkills?.length > 0) {
            setSkillsFilter(result.studentSkills.join(', '));
          }
          if (!cutoffHoursInput && result.hoursToTransfer >= 0) {
            setCutoffHoursInput(String(result.hoursToTransfer || 120));
          }
        } else {
          setErrorMsg(
            data.error?.message ||
              'No fue posible cargar la información de traslado de la práctica.'
          );
        }
      } catch (e: any) {
        setErrorMsg(e.message || 'Error de conexión al consultar el expediente de traslado.');
      } finally {
        setIsLoadingCompanies(false);
        setIsLoadingContext(false);
      }
    },
    [practiceId, searchQuery, skillsFilter, cutoffHoursInput]
  );

  useEffect(() => {
    loadTransferContext();
  }, [practiceId]);

  // Paso 1: Solicitar Traslado por Ausencia de Tutor Empresarial (POST /solicitar-traslado)
  const handleRequestTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingRequest(true);
    setErrorMsg(null);
    setConfirmResult(null);

    try {
      const parsedHours = cutoffHoursInput ? Number(cutoffHoursInput) : undefined;
      const res = await fetch(`/api/v1/practicas/${practiceId}/solicitar-traslado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reasonCode,
          justification: transferJustification,
          cutoffHoursOverride:
            typeof parsedHours === 'number' && !isNaN(parsedHours) ? parsedHours : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(
          data.error?.message ||
            'Error al iniciar la solicitud de traslado por ausencia de tutor empresarial.'
        );
        return;
      }

      const result: RequestPracticeTransferResultDTO = data.data;
      setRequestResult(result);
      setCutoffReport(result.cutoffReport);
      await loadTransferContext();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión al solicitar el traslado.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // Seleccionar empresa candidata de la lista
  const handleSelectCompany = (company: CompatibleTransferCompanyItemDTO) => {
    setSelectedCompany(company);
    setSelectedVacancyId(company.vacancies[0]?.id || '');
    setSelectedTutorId(company.availableTutors[0]?.id || '');
    setConfirmUfpsWarning(false);
    if (!company.isUfpsContingency) {
      setUfpsJustification('');
    }
    setErrorMsg(null);
  };

  // Paso 3: Confirmar Traslado Formal (POST /confirmar-traslado)
  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) {
      setErrorMsg('Debe seleccionar una entidad receptora de destino en el listado.');
      return;
    }

    setIsConfirmingTransfer(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/practicas/${practiceId}/confirmar-traslado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetCompanyId: selectedCompany.companyId,
          targetVacancyId: selectedVacancyId || undefined,
          targetTutorId: selectedTutorId || undefined,
          confirmUfpsLastResort: selectedCompany.isUfpsContingency
            ? confirmUfpsWarning
            : undefined,
          ufpsJustification: selectedCompany.isUfpsContingency
            ? ufpsJustification
            : undefined,
          justification:
            (selectedCompany.isUfpsContingency ? ufpsJustification : relocationObservations) ||
            transferJustification,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(
          data.error?.message || 'No fue posible confirmar el traslado empresarial.'
        );
        return;
      }

      const result: ConfirmPracticeTransferResultDTO = data.data;
      setConfirmResult(result);
      await loadTransferContext();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión al confirmar el traslado.');
    } finally {
      setIsConfirmingTransfer(false);
    }
  };

  const isFrozenInTransfer =
    requestResult?.currentStatus === 'EN_TRASLADO_EMPRESARIAL' ||
    compatibleData?.currentStatus === 'EN_TRASLADO_EMPRESARIAL' ||
    compatibleData?.transferStatus === 'EN_TRASLADO_EMPRESARIAL';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Navegación superior */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/estudiantes"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-red-700 bg-white px-3.5 py-2 rounded-xl border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al Directorio de Estudiantes
          </Link>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1.5 rounded-full border ${
                confirmResult
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : isFrozenInTransfer
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              {confirmResult ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Traslado Completado (PRACTICA_EN_EJECUCION)</span>
                </>
              ) : isFrozenInTransfer ? (
                <>
                  <Snowflake className="w-3.5 h-3.5 text-amber-600" />
                  <span>Práctica Congelada: EN_TRASLADO_EMPRESARIAL</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Estado Actual: {compatibleData?.currentStatus || 'PRACTICA_EN_EJECUCION'}</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Cabecera Principal HU20 */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2.5 h-full bg-red-700" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>HU20 • Protocolo de Contingencia y Continuidad Formativa</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Protocolo de Traslado y Reubicación por Ausencia de Tutor Empresarial
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                Desvincule formalmente al estudiante cuando la empresa receptora carezca de tutor empresarial disponible,
                congele la práctica actual preservando las horas previamente validadas (RN01) y reubíquelo en una empresa
                compatible con convenio activo (reservando a la UFPS como opción institucional de última instancia, RN02).
              </p>
            </div>

            {compatibleData && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shrink-0 min-w-[240px] space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Resumen del Practicante
                </span>
                <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-red-700 shrink-0" />
                  {compatibleData.studentName}
                </p>
                <p className="text-xs text-slate-600">
                  Empresa Actual:{' '}
                  <strong className="text-slate-800">
                    {compatibleData.sourceCompany.businessName}
                  </strong>
                </p>
                <p className="text-xs text-emerald-700 font-bold">
                  Horas Acumuladas Avaladas (RN01): {compatibleData.hoursToTransfer} hrs
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Alertas de Error */}
        {errorMsg && (
          <div
            role="alert"
            className="bg-red-50 border border-red-300 text-red-900 p-4 rounded-2xl flex items-start gap-3 shadow-sm"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-wider text-red-700">
                Validación del Protocolo de Traslado (HU20)
              </p>
              <p className="text-xs sm:text-sm font-medium mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Resultado Exitoso de Confirmación de Traslado (Criterio 3, RN01, RN02, RN03) */}
        {confirmResult && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-3xl p-6 shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-200 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-emerald-600 text-white rounded-2xl shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                    Criterio 3 Completado • Reubicación Formal Aplicada
                  </span>
                  <h2 className="text-lg font-black text-emerald-950">
                    ¡Traslado Empresarial Confirmado y Horas Preservadas!
                  </h2>
                  <p className="text-xs text-emerald-800 mt-0.5">{confirmResult.message}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Vinculación Nueva Entidad y Tutor (Criterio 3a) */}
              <div className="bg-white p-4 rounded-2xl border border-emerald-200 space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  Nueva Entidad y Tutor (Criterio 3a)
                </span>
                <p className="text-sm font-black text-slate-900">
                  {confirmResult.targetCompany.businessName}
                </p>
                <p className="text-slate-600">NIT: {confirmResult.targetCompany.nit}</p>
                <p className="text-slate-700 font-semibold">
                  Nuevo Tutor: {confirmResult.newTutor.name} ({confirmResult.newTutor.cargo})
                </p>
                {confirmResult.ufpsContingencyApplied && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-900 rounded text-[10px] font-bold">
                    Contingencia Institucional UFPS (RN02)
                  </span>
                )}
              </div>

              {/* Preservación del Histórico y Horas (Criterio 3b & RN01) */}
              <div className="bg-white p-4 rounded-2xl border border-emerald-200 space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Saldo a Favor Preservado (RN01)
                </span>
                <p className="text-sm font-black text-emerald-800">
                  {confirmResult.hoursPreserved.hoursTransferredFromOrigin} /{' '}
                  {confirmResult.hoursPreserved.totalHoursRequired} horas avaladas
                </p>
                <p className="text-slate-600">
                  Horas restantes en destino:{' '}
                  <strong>{confirmResult.hoursPreserved.remainingHoursToComplete} hrs</strong>
                </p>
                <p className="text-slate-500">
                  Informes preservados: {confirmResult.hoursPreserved.previousReportsPreservedCount} •
                  Bitácoras: {confirmResult.hoursPreserved.previousLogsPreservedCount}
                </p>
              </div>

              {/* Reevaluación de ARL (RN03) */}
              <div className="bg-white p-4 rounded-2xl border border-amber-300 space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Reevaluación de Cobertura ARL (RN03)
                </span>
                <p className="text-sm font-black text-amber-900">
                  Estado ARL: {confirmResult.arlReevaluation.arlSemaphoreLabel}
                </p>
                <p className="text-[11px] text-slate-600 leading-snug">
                  {confirmResult.arlReevaluation.coverageNote}
                </p>
              </div>
            </div>

            {/* Notificaciones enviadas (Criterio 3c) */}
            <div className="bg-white p-4 rounded-2xl border border-emerald-200 space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <BellRing className="w-4 h-4 text-emerald-600" />
                Notificaciones Oficiales Emitidas (Criterio 3c)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {confirmResult.notificationsSent.items.map((notif, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {notif.recipientType}
                      </span>
                      <span className="text-[10px] text-slate-400">Enviado</span>
                    </div>
                    <p className="font-bold text-slate-900 truncate">{notif.recipientName}</p>
                    <p className="text-[11px] text-slate-500 truncate">{notif.recipientEmail}</p>
                    <p className="text-[11px] text-slate-600 line-clamp-2">{notif.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {isLoadingContext ? (
          <div className="bg-white rounded-3xl p-14 text-center border border-slate-200">
            <Loader2 className="w-8 h-8 animate-spin text-red-700 mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-600">
              Cargando expediente de práctica y catálogo de empresas compatibles...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* COLUMNA IZQUIERDA (5 cols): PASO 1 - Declaración de Causa e Informe de Corte (Criterio 1) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-red-700 text-white text-xs font-black flex items-center justify-center">
                      1
                    </span>
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                      Apertura de Traslado (Criterio 1)
                    </h2>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full">
                    POST /solicitar-traslado
                  </span>
                </div>

                <form onSubmit={handleRequestTransfer} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Causa Específica del Traslado <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={reasonCode}
                      onChange={(e) =>
                        setReasonCode(e.target.value as 'AUSENCIA_TUTOR_EMPRESARIAL')
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    >
                      <option value="AUSENCIA_TUTOR_EMPRESARIAL">
                        AUSENCIA_TUTOR_EMPRESARIAL — Falta de tutor o incapacidad de supervisión
                      </option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Horas Válidas Acumuladas al Corte (RN01)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="320"
                      value={cutoffHoursInput}
                      onChange={(e) => setCutoffHoursInput(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                    <p className="text-[11px] text-slate-500">
                      Las horas debidamente radicadas y aprobadas en la empresa de origen se consolidan como saldo a favor.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Justificación de Apertura del Expediente <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={transferJustification}
                      onChange={(e) => setTransferJustification(e.target.value)}
                      placeholder="Describa el motivo por el cual la empresa actual no garantiza tutor empresarial..."
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingRequest}
                    className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmittingRequest ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Congelando Práctica y Generando Corte...</span>
                      </>
                    ) : (
                      <>
                        <Snowflake className="w-4 h-4" />
                        <span>
                          {isFrozenInTransfer
                            ? 'Actualizar Expediente de Traslado e Informe de Corte'
                            : 'Declarar Ausencia de Tutor y Congelar Práctica'}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Tarjeta del Informe de Corte Generado (Criterio 1 & RN01) */}
              {cutoffReport && (
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-md space-y-4 border border-slate-700">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                        Informe Oficial de Corte (Criterio 1)
                      </span>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-slate-700 text-slate-200">
                      {cutoffReport.code}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700">
                      <span className="text-[10px] text-slate-400 block">
                        Horas Avaladas (RN01)
                      </span>
                      <strong className="text-base font-black text-emerald-400">
                        {cutoffReport.hoursAccumulated} / {cutoffReport.requiredHours} hrs
                      </strong>
                    </div>
                    <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700">
                      <span className="text-[10px] text-slate-400 block">
                        Saldo Restante en Destino
                      </span>
                      <strong className="text-base font-black text-amber-300">
                        {cutoffReport.remainingHours} hrs
                      </strong>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {cutoffReport.summary}
                  </p>
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA (7 cols): PASO 2 Y PASO 3 - Empresas Compatibles y Confirmación (Criterios 2 y 3) */}
            <div className="lg:col-span-7 space-y-6">
              {/* PASO 2: Búsqueda y Compatibilidad de Empresas Receptoras (Criterio 2) */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-red-700 text-white text-xs font-black flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                        Empresas Receptoras Compatibles (Criterio 2)
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Con vacantes disponibles y convenio activo • UFPS ordenada al final como contingencia de última instancia.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                    GET /empresas-compatibles-traslado
                  </span>
                </div>

                {/* Filtros de Skills y Búsqueda */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-5 relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar empresa, NIT o vacante..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      value={skillsFilter}
                      onChange={(e) => setSkillsFilter(e.target.value)}
                      placeholder="Skills (ej. TypeScript, React, SQL)..."
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => loadTransferContext(searchQuery, skillsFilter)}
                      disabled={isLoadingCompanies}
                      className="w-full h-full py-2 px-3 bg-slate-900 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isLoadingCompanies ? 'animate-spin' : ''}`}
                      />
                      <span>Filtrar</span>
                    </button>
                  </div>
                </div>

                {/* Chips de Skills del Estudiante */}
                {compatibleData?.studentSkills && compatibleData.studentSkills.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-red-600" />
                      Perfil Técnico del Practicante:
                    </span>
                    {compatibleData.studentSkills.map((skill) => (
                      <span
                        key={skill}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {/* Lista Ordenada de Empresas (Sector Productivo primero, UFPS al final) */}
                <div className="space-y-3">
                  {compatibleData?.items.map((company) => {
                    const isSelected = selectedCompany?.companyId === company.companyId;
                    return (
                      <div
                        key={company.companyId}
                        onClick={() => handleSelectCompany(company)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? company.isUfpsContingency
                              ? 'bg-amber-50/70 border-2 border-amber-500 shadow-sm'
                              : 'bg-red-50/50 border-2 border-red-600 shadow-sm'
                            : company.isUfpsContingency
                            ? 'bg-amber-50/30 border-amber-200 hover:border-amber-400'
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                                Prioridad #{company.priorityRank}
                              </span>
                              {company.isUfpsContingency ? (
                                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                                  Contingencia de Última Instancia (UFPS • RN02)
                                </span>
                              ) : (
                                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  Sector Productivo • Convenio {company.agreementNumber}
                                </span>
                              )}
                            </div>

                            <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-red-700 shrink-0" />
                              {company.businessName}
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              NIT: {company.nit} • {company.city} • Cupos disponibles:{' '}
                              <strong>{company.availableSlotsTotal}</strong>
                            </p>
                          </div>

                          <div className="flex sm:flex-col items-end justify-between shrink-0 gap-1">
                            <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-900">
                              Compatibilidad: {company.compatibilityScore}%
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectCompany(company);
                              }}
                              className={`text-[11px] font-bold px-3 py-1 rounded-lg transition-colors ${
                                isSelected
                                  ? 'bg-red-700 text-white'
                                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {isSelected ? 'Seleccionada ✓' : 'Seleccionar Destino'}
                            </button>
                          </div>
                        </div>

                        {/* Skills coincidentes y vacante */}
                        <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-slate-500 font-semibold">Skills afines:</span>
                            {company.matchedSkills.map((sk) => (
                              <span
                                key={sk}
                                className="px-2 py-0.5 bg-white rounded border border-slate-200 text-[10px] font-bold text-slate-700"
                              >
                                {sk}
                              </span>
                            ))}
                          </div>
                          {company.vacancies[0] && (
                            <span className="text-slate-600 font-medium truncate">
                              Vacante: <strong>{company.vacancies[0].title}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PASO 3: Confirmación de Reubicación y Salvaguarda RN02 / RN03 (Criterio 3) */}
              {selectedCompany && (
                <div className="bg-white rounded-3xl p-6 border-2 border-slate-800 shadow-md space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center">
                        3
                      </span>
                      <div>
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                          Confirmar Traslado y Reubicación (Criterio 3)
                        </h2>
                        <p className="text-[11px] text-slate-500">
                          Entidad seleccionada: <strong>{selectedCompany.businessName}</strong>
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                      POST /confirmar-traslado
                    </span>
                  </div>

                  {/* Advertencia Institucional RN02 cuando se selecciona a la UFPS */}
                  {selectedCompany.isUfpsContingency && (
                    <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-black uppercase tracking-wider text-amber-900">
                            Advertencia de Confirmación Obligatoria (RN02 - UFPS como Último Recurso)
                          </p>
                          <p className="text-xs leading-relaxed">
                            {selectedCompany.ufpsWarningMessage}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        <label className="block text-xs font-bold text-amber-950">
                          Justificación de Agotamiento de Plazas Externas Afines (RN02){' '}
                          <span className="text-red-600">*</span>
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={ufpsJustification}
                          onChange={(e) => setUfpsJustification(e.target.value)}
                          placeholder="Justifique formalmente que se agotaron las plazas externas compatibles en el sector productivo..."
                          className="w-full px-3.5 py-2 bg-white border border-amber-400 rounded-xl text-xs text-slate-900"
                        />

                        <label className="flex items-center gap-2 text-xs font-bold text-amber-950 cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={confirmUfpsWarning}
                            onChange={(e) => setConfirmUfpsWarning(e.target.checked)}
                            className="w-4 h-4 accent-amber-700 rounded"
                          />
                          <span>
                            Confirmo que se agotaron las plazas externas afines y autorizo la reubicación en dependencia interna UFPS (RN02).
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleConfirmTransfer} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Vacante / Plaza Destino
                        </label>
                        <select
                          value={selectedVacancyId}
                          onChange={(e) => setSelectedVacancyId(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                        >
                          {selectedCompany.vacancies.map((vac) => (
                            <option key={vac.id} value={vac.id}>
                              {vac.title} ({vac.availableSlots} cupos)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Nuevo Tutor Empresarial Asignado (Criterio 3a)
                        </label>
                        <select
                          value={selectedTutorId}
                          onChange={(e) => setSelectedTutorId(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                        >
                          {selectedCompany.availableTutors.length > 0 ? (
                            selectedCompany.availableTutors.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.email})
                              </option>
                            ))
                          ) : (
                            <option value="">
                              Supervisor Designado por {selectedCompany.businessName}
                            </option>
                          )}
                        </select>
                      </div>
                    </div>

                    {!selectedCompany.isUfpsContingency && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Observaciones de Reubicación y Emisión de Notificaciones
                        </label>
                        <input
                          type="text"
                          value={relocationObservations}
                          onChange={(e) => setRelocationObservations(e.target.value)}
                          placeholder="Ej. Reubicación aprobada por compatibilidad en desarrollo de software..."
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900"
                        />
                      </div>
                    )}

                    {/* Nota Informativa RN01 y RN03 */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                      <p>
                        • <strong>RN01 (Preservación de Horas):</strong> Se traspasan{' '}
                        <strong>
                          {cutoffReport?.hoursAccumulated ??
                            compatibleData?.hoursToTransfer ??
                            120}{' '}
                          horas
                        </strong>{' '}
                        como saldo a favor en la práctica reubicada.
                      </p>
                      <p>
                        • <strong>RN03 (Reevaluación ARL):</strong> El estado de ARL pasará a{' '}
                        <strong>Pendiente de revisión</strong> para verificar la cobertura en las nuevas instalaciones físicas.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isConfirmingTransfer}
                      className="w-full py-3 px-5 bg-slate-900 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isConfirmingTransfer ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Confirmando Reubicación y Notificando...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span>
                            Confirmar Traslado Formal a {selectedCompany.businessName}
                          </span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
