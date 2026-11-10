'use client';

// ==============================================================================
// SIGETRAP - Módulo de Seguimiento y Control de Prácticas
// Caso de Uso: CU14 - Entrega de Informes de Avance y Bitácoras
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Upload,
  Calendar,
  Send,
  Building2,
  BookOpen,
  ArrowRight,
  ShieldAlert,
  Loader2,
  FileCheck,
  Edit3,
  Trash2,
  X,
  BellRing,
  ShieldCheck,
} from 'lucide-react';
import { UserResponseDTO, ArlStudentAlertItemDTO } from '@/types';

interface PracticeData {
  id: string;
  currentStatus: string;
  totalHoursRequired: number;
  totalHoursCompleted: number;
  company?: {
    businessName: string;
  };
  vacancy?: {
    title: string;
  };
}

interface AdvanceReportItem {
  id: string;
  tipo: string;
  estado: string;
  horasEjecutadas: number;
  descripcionActividades: string;
  fechaEntrega: string;
  observaciones?: string | null;
  periodoInicio?: string | null;
  periodoFin?: string | null;
}

export default function InformesAvancePage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activePractice, setActivePractice] = useState<PracticeData | null>(null);
  const [informes, setInformes] = useState<AdvanceReportItem[]>([]);
  const [isLoadingPractice, setIsLoadingPractice] = useState(true);

  // Form states
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [horasEjecutadas, setHorasEjecutadas] = useState<string>('');
  const [descripcionActividades, setDescripcionActividades] = useState('');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFin, setPeriodoFin] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<
    Array<{ nombreArchivo: string; urlArchivo: string; tipoMime: string; tamanoBytes: number }>
  >([]);

  // UI Feedback states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);

  // Estado de ARL y Renovación (HU Alertas Automáticas ARL - Criterio 2, 3 y RN02)
  const [studentArlAlert, setStudentArlAlert] = useState<ArlStudentAlertItemDTO | null>(null);
  const [isArlModalOpen, setIsArlModalOpen] = useState(false);
  const [arlDocumentUrl, setArlDocumentUrl] = useState('');
  const [arlExpirationDate, setArlExpirationDate] = useState('');
  const [arlPolicyNumber, setArlPolicyNumber] = useState('');
  const [arlEntityName, setArlEntityName] = useState('Positiva ARL');
  const [isUploadingArlFile, setIsUploadingArlFile] = useState(false);
  const [isSubmittingArl, setIsSubmittingArl] = useState(false);
  const [arlError, setArlError] = useState<string | null>(null);
  const [arlSuccess, setArlSuccess] = useState<string | null>(null);

  // Cargar usuario autenticado
  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setIsCheckingAuth(false));
  }, []);

  // Cargar práctica activa del estudiante
  const loadStudentPractice = useCallback(async () => {
    setIsLoadingPractice(true);
    try {
      const res = await fetch('/api/v1/practicas?limit=1');
      const data = await res.json();
      if (data.success && data.data && data.data.items && data.data.items.length > 0) {
        const p = data.data.items[0];
        setActivePractice({
          id: p.id,
          currentStatus: p.currentStatus || 'PRACTICA_EN_EJECUCION',
          totalHoursRequired: p.totalHoursRequired || 320,
          totalHoursCompleted: p.totalHoursCompleted || 0,
          company: p.company,
          vacancy: p.vacancy,
        });

        // Cargar informes radicados
        const resInformes = await fetch(`/api/v1/informes-avance?practicaId=${p.id}`);
        const dataInformes = await resInformes.json();
        if (dataInformes.success && Array.isArray(dataInformes.data)) {
          setInformes(dataInformes.data);
        }

        // Consultar estado y alertas de ARL (GET /api/v1/practicas/alertas/arl)
        try {
          const resArl = await fetch(`/api/v1/practicas/alertas/arl?studentId=${p.studentId || p.student?.id || ''}`);
          const dataArl = await resArl.json();
          if (dataArl.success && dataArl.data?.items?.length > 0) {
            const matched =
              dataArl.data.items.find((it: ArlStudentAlertItemDTO) => it.practiceId === p.id) ||
              dataArl.data.items[0];
            setStudentArlAlert(matched);
          }
        } catch (arlErr) {
          console.error(arlErr);
        }
      } else {
        // Fallback demo practice if no backend seed
        setActivePractice({
          id: 'practice-activa-demo',
          currentStatus: 'PRACTICA_EN_EJECUCION',
          totalHoursRequired: 320,
          totalHoursCompleted: 45,
          company: { businessName: 'Tech Innovations Colombia S.A.S.' },
          vacancy: { title: 'Desarrollador Backend Node.js / PostgreSQL' },
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPractice(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadStudentPractice();
    }
  }, [currentUser, loadStudentPractice]);

  const isPracticeActiveStatus = (status?: string): boolean => {
    if (!status) return false;
    const s = status.toUpperCase();
    return (
      s === 'PRACTICA_EN_EJECUCION' ||
      s === 'ASIGNADO_FORMALMENTE' ||
      s === 'ACEPTADO_ARL_PENDIENTE' ||
      s === 'FORMALIZADA' ||
      s === 'EN CURSO'
    );
  };

  const isArlExpiredBlocked = Boolean(
    studentArlAlert?.arlStatus === 'VENCIDO' || studentArlAlert?.isBlockedFromReports
  );
  const isActive =
    (activePractice ? isPracticeActiveStatus(activePractice.currentStatus) : false) &&
    !isArlExpiredBlocked;

  const handleUploadArlSupportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingArlFile(true);
    setArlError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'arl');
      const res = await fetch('/api/v1/upload/cv', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.success && data.data?.url) {
        setArlDocumentUrl(data.data.url);
      } else {
        setArlError(data.error?.message || 'Error al subir el certificado PDF de ARL.');
      }
    } catch (err) {
      console.error(err);
      setArlError('Error de conexión al subir el archivo de ARL.');
    } finally {
      setIsUploadingArlFile(false);
    }
  };

  const handleSubmitArlRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetStudentId = studentArlAlert?.studentId || currentUser?.id;
    if (!targetStudentId) return;
    setIsSubmittingArl(true);
    setArlError(null);
    setArlSuccess(null);
    try {
      const res = await fetch(`/api/v1/estudiantes/${targetStudentId}/arl/documento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practiceId: activePractice?.id,
          documentUrl: arlDocumentUrl,
          expirationDate: arlExpirationDate,
          policyNumber: arlPolicyNumber,
          arlEntityName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setArlError(data.error?.message || 'Error al registrar la renovación de ARL.');
        return;
      }
      setArlSuccess(
        data.message ||
          'Certificado de ARL cargado exitosamente en estado "Pendiente de revisión" (RN02). Se ha desbloqueado el registro de informes.'
      );
      await loadStudentPractice();
    } catch (err) {
      console.error(err);
      setArlError('Error de conexión al cargar la renovación de ARL.');
    } finally {
      setIsSubmittingArl(false);
    }
  };

  // Manejo de envío de radicación
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAlert(null);
    setSuccessAlert(null);

    const horasNum = parseFloat(horasEjecutadas);

    // Validación client-side previa de horas (Criterio 2)
    if (isNaN(horasNum) || horasNum <= 0) {
      setErrorAlert('Las horas reportadas deben ser mayores a cero (Restricción chk_horas_ejecutadas_positivas).');
      return;
    }

    if (!descripcionActividades.trim()) {
      setErrorAlert('Debe detallar la descripción de las actividades ejecutadas.');
      return;
    }

    if (!activePractice) {
      setErrorAlert('No se encontró una práctica formativa vinculada.');
      return;
    }

    if (!isActive) {
      setErrorAlert('Solo se permiten radicaciones sobre prácticas activas en curso (Criterio 3).');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = editingReportId ? `/api/v1/informes-avance/${editingReportId}` : '/api/v1/informes-avance';
      const method = editingReportId ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practicaId: activePractice.id,
          horasEjecutadas: horasNum,
          descripcionActividades: descripcionActividades.trim(),
          periodoInicio: periodoInicio || undefined,
          periodoFin: periodoFin || undefined,
          documentUrl: documentUrl || undefined,
          observaciones: observaciones || undefined,
          archivosAdjuntos: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          estado: 'Radicado',
        }),
      });

      const data = await res.json();

      if ((res.status === 201 || res.status === 200) && data.success) {
        setSuccessAlert(
          editingReportId
            ? '¡Informe de avance actualizado exitosamente y horas de práctica sincronizadas!'
            : '¡Informe de avance y bitácora radicados exitosamente! Se ha registrado con estado "Radicado" y fecha de entrega actualizada.'
        );
        // Limpiar formulario
        setEditingReportId(null);
        setHorasEjecutadas('');
        setDescripcionActividades('');
        setPeriodoInicio('');
        setPeriodoFin('');
        setDocumentUrl('');
        setObservaciones('');
        setUploadedAttachments([]);

        // Actualizar datos
        loadStudentPractice();
      } else {
        const errorMsg = data.error?.message || 'Error al radicar el informe de seguimiento.';
        setErrorAlert(errorMsg);
      }
    } catch (err: any) {
      setErrorAlert(err.message || 'Error de conexión con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadEvidenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFile(true);
    setErrorAlert(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'informes');
      const res = await fetch('/api/v1/upload/cv', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.success) {
        setDocumentUrl(data.data.url);
        setUploadedAttachments((prev) => [
          ...prev,
          {
            nombreArchivo: data.data.fileName || file.name,
            urlArchivo: data.data.url,
            tipoMime: data.data.mimeType || file.type || 'application/pdf',
            tamanoBytes: data.data.size || file.size || 1024,
          },
        ]);
      } else {
        setErrorAlert(data.error?.message || 'Error al subir el archivo de evidencia.');
      }
    } catch (err) {
      console.error(err);
      setErrorAlert('Error de conexión al subir el archivo.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleSelectReportForEdit = (inf: AdvanceReportItem) => {
    setEditingReportId(inf.id);
    setHorasEjecutadas(String(inf.horasEjecutadas));
    setDescripcionActividades(inf.descripcionActividades || '');
    setPeriodoInicio(inf.periodoInicio ? new Date(inf.periodoInicio).toISOString().split('T')[0] : '');
    setPeriodoFin(inf.periodoFin ? new Date(inf.periodoFin).toISOString().split('T')[0] : '');
    setObservaciones(inf.observaciones || '');
    setErrorAlert(null);
    setSuccessAlert(null);
  };

  const handleApproveReport = async (reportId: string) => {
    try {
      const res = await fetch(`/api/v1/informes-avance/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'Aprobado' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessAlert('Informe aprobado exitosamente.');
        loadStudentPractice();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('¿Confirma eliminar este informe de avance? Se recalcularán las horas de la práctica.')) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/informes-avance/${reportId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (editingReportId === reportId) {
          setEditingReportId(null);
        }
        setSuccessAlert('Informe eliminado y horas de práctica actualizadas.');
        loadStudentPractice();
      } else {
        setErrorAlert(data.error?.message || 'No fue posible eliminar el informe.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const progressPercent = activePractice
    ? Math.min(100, Math.round((activePractice.totalHoursCompleted / activePractice.totalHoursRequired) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Encabezado */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 text-red-700 rounded-xl">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Bitácoras e Informes de Seguimiento
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Módulo de Seguimiento y Control de Prácticas (CU14) • Evidencia de avance gradual de horas formativas
              </p>
            </div>
          </div>
        </div>

        {/* Banner de Estado y Alertas Automáticas de ARL en el Panel del Estudiante (Criterios 1, 2, 3 y RN02) */}
        {studentArlAlert && (
          <div
            className={`mb-6 p-5 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              studentArlAlert.arlStatus === 'VENCIDO'
                ? 'bg-red-50 border-red-300 text-red-900'
                : studentArlAlert.arlStatus === 'PROXIMO_A_VENCER'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : studentArlAlert.arlStatus === 'PENDIENTE_REVISION'
                    ? 'bg-blue-50 border-blue-300 text-blue-900'
                    : studentArlAlert.arlStatus === 'SIN_AFILIACION'
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="flex items-start gap-3">
              <BellRing className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider">
                    Estado Cobertura ARL: {studentArlAlert.arlSemaphoreLabel}
                  </span>
                  {studentArlAlert.arlExpirationDate && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/70 border border-current/20">
                      Vigencia: {new Date(studentArlAlert.arlExpirationDate).toISOString().split('T')[0]}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed">
                  {studentArlAlert.studentBannerMessage ||
                    studentArlAlert.alertMessage ||
                    'Su certificado de afiliación a Riesgos Laborales (ARL) se encuentra vigente y validado.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setArlDocumentUrl(studentArlAlert.arlSupportUrl || '');
                setArlExpirationDate(
                  studentArlAlert.arlExpirationDate
                    ? new Date(studentArlAlert.arlExpirationDate).toISOString().split('T')[0]
                    : ''
                );
                setArlPolicyNumber(studentArlAlert.arlPolicyNumber || '');
                setArlEntityName(studentArlAlert.arlEntityName || 'Positiva ARL');
                setArlError(null);
                setArlSuccess(null);
                setIsArlModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-bold bg-white hover:bg-gray-100 text-gray-900 border border-gray-300 rounded-xl shadow-sm transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-red-700" />
              <span>Renovar / Actualizar Soporte ARL</span>
            </button>
          </div>
        )}

        {/* Alertas */}
        {errorAlert && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Validación de Radicación</h3>
              <p className="text-sm mt-0.5">{errorAlert}</p>
            </div>
          </div>
        )}

        {successAlert && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Radicación Confirmada (201 Created)</h3>
              <p className="text-sm mt-0.5">{successAlert}</p>
            </div>
          </div>
        )}

        {/* Resumen de Práctica y Horas */}
        {activePractice && (
          <div className="mb-8 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Práctica Formativa
                  </span>
                  <span
                    className={`px-2.5 py-0.5 text-xs font-extrabold rounded-full ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {activePractice.currentStatus.replace(/_/g, ' ')}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-gray-900 mt-1">
                  {activePractice.vacancy?.title || 'Plaza de Práctica Empresarial'}
                </h2>
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  <span>{activePractice.company?.businessName || 'Entidad Receptora Vinculada'}</span>
                </div>
              </div>

              {/* Métricas de Horas */}
              <div className="lg:border-x lg:border-gray-100 lg:px-6">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm font-semibold text-gray-600">Avance de Horas</span>
                  <span className="text-base font-extrabold text-gray-900">
                    {activePractice.totalHoursCompleted}h / {activePractice.totalHoursRequired}h
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-red-600 to-red-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                  <span>{progressPercent}% completado</span>
                  <span>Restan {Math.max(0, activePractice.totalHoursRequired - activePractice.totalHoursCompleted)}h</span>
                </div>
              </div>

              {/* Estado de Radicación */}
              <div className="flex flex-col justify-center">
                {isActive ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-800">
                      Habilitado para radicar informes periódicos y bitácoras de actividades.
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                    <span className="text-xs font-semibold text-amber-800">
                      Radicación restringida: Solo se permiten radicaciones sobre prácticas activas en curso.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sección Formulario + Historial */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Formulario de Radicación */}
          <div className="lg:col-span-7">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="border-b border-gray-100 pb-4 mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-600" />
                    {editingReportId ? 'Editar Informe y Bitácora Seleccionada' : 'Radicar Nuevo Informe y Bitácora'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Registra tus horas ejecutadas (&gt; 0) y el detalle de actividades realizadas para seguimiento académico y empresarial.
                  </p>
                </div>
                {editingReportId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReportId(null);
                      setHorasEjecutadas('');
                      setDescripcionActividades('');
                      setPeriodoInicio('');
                      setPeriodoFin('');
                      setDocumentUrl('');
                      setObservaciones('');
                      setUploadedAttachments([]);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancelar Edición</span>
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Horas Ejecutadas */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Horas Ejecutadas a Reportar <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="1"
                      min="1"
                      disabled={!isActive || isSubmitting}
                      value={horasEjecutadas}
                      onChange={(e) => setHorasEjecutadas(e.target.value)}
                      placeholder="Ej. 20 (debe ser mayor a 0)"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all disabled:opacity-50"
                      required
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Restricción SQL: <code>chk_horas_ejecutadas_positivas (horas &gt; 0)</code>
                  </span>
                </div>

                {/* Período de actividades */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Fecha Inicio Período
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="date"
                        disabled={!isActive || isSubmitting}
                        value={periodoInicio}
                        onChange={(e) => setPeriodoInicio(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Fecha Fin Período
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="date"
                        disabled={!isActive || isSubmitting}
                        value={periodoFin}
                        onChange={(e) => setPeriodoFin(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Descripción de Actividades */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Descripción de Actividades Ejecutadas <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    rows={4}
                    disabled={!isActive || isSubmitting}
                    value={descripcionActividades}
                    onChange={(e) => setDescripcionActividades(e.target.value)}
                    placeholder="Describe de manera detallada las tareas, hitos o avances realizados durante las horas reportadas..."
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all disabled:opacity-50"
                    required
                  />
                </div>

                {/* URL de Evidencia o Soporte */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Enlace de Evidencia / Archivo Adjunto (PDF, Word o Imagen)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Upload className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        disabled={!isActive || isSubmitting}
                        value={documentUrl}
                        onChange={(e) => setDocumentUrl(e.target.value)}
                        placeholder="https://... o suba su archivo adjunto"
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all disabled:opacity-50"
                      />
                    </div>
                    <label
                      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all shrink-0 ${
                        !isActive || isSubmitting ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      <span>{isUploadingFile ? 'Subiendo...' : 'Subir Archivo'}</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        disabled={!isActive || isSubmitting || isUploadingFile}
                        onChange={handleUploadEvidenceFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Observaciones o Notas Adicionales
                  </label>
                  <input
                    type="text"
                    disabled={!isActive || isSubmitting}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Comentarios adicionales para tu tutor empresarial o docente..."
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all disabled:opacity-50"
                  />
                </div>

                {/* Botón de Confirmación */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={!isActive || isSubmitting}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-700 hover:bg-red-800 text-white font-bold text-sm rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Radicando informe y bitácora...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Confirmar Envío y Radicar Informe (201 Created)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Historial de Informes y Bitácoras */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="border-b border-gray-100 pb-4 mb-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-emerald-600" />
                    Historial de Radicaciones
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Registro de informes y bitácoras entregadas
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 bg-gray-100 text-gray-700 rounded-lg">
                  {informes.length} radicado(s)
                </span>
              </div>

              {informes.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <Clock className="w-10 h-10 mx-auto text-gray-300 mb-2 stroke-[1.5]" />
                  <p className="text-sm font-semibold text-gray-600">No hay informes radicados aún</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                    Los informes y bitácoras que radique aparecerán aquí con su fecha de entrega y estado de revisión.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                  {informes.map((inf) => (
                    <div
                      key={inf.id}
                      className="p-4 border border-gray-100 rounded-xl bg-gray-50/50 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-900">
                          {inf.tipo} • {inf.horasEjecutadas} horas
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {inf.estado}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-3 mb-2">
                        {inf.descripcionActividades}
                      </p>
                      <div className="flex justify-between items-center text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                        <span>Entregado: {new Date(inf.fechaEntrega).toLocaleDateString()}</span>
                        <div className="flex items-center gap-1.5">
                          {currentUser && currentUser.role !== 'ESTUDIANTE' && inf.estado !== 'Aprobado' && (
                            <button
                              type="button"
                              onClick={() => handleApproveReport(inf.id)}
                              className="px-2 py-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md"
                            >
                              Aprobar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSelectReportForEdit(inf)}
                            title="Editar informe"
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReport(inf.id)}
                            title="Eliminar informe"
                            className="p-1 text-gray-400 hover:text-red-700 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MODAL: SUBIDA / RENOVACIÓN DE SOPORTE ARL DEL ESTUDIANTE (POST /api/v1/estudiantes/{id}/arl/documento - RN02) */}
        {isArlModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-gray-200 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1">
                    Cobertura Riesgos Laborales • RN02
                  </span>
                  <h3 className="text-base font-extrabold text-gray-900">
                    Cargar / Renovar Certificado de ARL
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Al cargar su nuevo soporte de ARL, el estado pasará a <strong>Pendiente de revisión</strong> hasta que la coordinación valide su autenticidad (RN02).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsArlModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {arlError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{arlError}</span>
                </div>
              )}

              {arlSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{arlSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSubmitArlRenewal} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Soporte o Certificado ARL (PDF o Imagen) <span className="text-red-600">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      required
                      value={arlDocumentUrl}
                      onChange={(e) => setArlDocumentUrl(e.target.value)}
                      placeholder="/uploads/arl/certificado.pdf o suba su archivo"
                      className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <label className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isUploadingArlFile ? 'Subiendo...' : 'Subir PDF'}</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        disabled={isUploadingArlFile}
                        onChange={handleUploadArlSupportFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Nueva Fecha de Vigencia / Vencimiento <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={arlExpirationDate}
                      onChange={(e) => setArlExpirationDate(e.target.value)}
                      className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Número de Póliza / Radicado
                    </label>
                    <input
                      type="text"
                      value={arlPolicyNumber}
                      onChange={(e) => setArlPolicyNumber(e.target.value)}
                      placeholder="Ej. POL-ARL-2026-01"
                      className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Administradora de Riesgos Laborales (ARL)
                  </label>
                  <input
                    type="text"
                    value={arlEntityName}
                    onChange={(e) => setArlEntityName(e.target.value)}
                    placeholder="Ej. Positiva Compañía de Seguros / Sura ARL"
                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsArlModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingArl || !arlDocumentUrl || !arlExpirationDate}
                    className="px-5 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{isSubmittingArl ? 'Guardando...' : 'Confirmar Carga de Soporte ARL'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
