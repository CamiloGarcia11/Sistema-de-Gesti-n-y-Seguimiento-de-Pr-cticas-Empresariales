'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import {
  Scale,
  Building2,
  FileCheck2,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Upload,
  Send,
  PlusCircle,
  Search,
  RefreshCw,
  ExternalLink,
  X,
  Calendar,
  FileWarning,
  History,
  CheckCheck,
  Ban,
  ArrowRight,
  Mail,
} from 'lucide-react';
import {
  AgreementPrerequisiteDocumentType,
  AgreementResponseDTO,
  AgreementStatus,
  CompanyResponseDTO,
  UserResponseDTO,
} from '@/types';

const PREREQUISITE_CATALOG: Array<{
  type: AgreementPrerequisiteDocumentType;
  title: string;
  subtitle: string;
  accept: string;
  requiresIssuedAt: boolean;
}> = [
  {
    type: 'BORRADOR_MINUTA',
    title: '1. Borrador de Minuta Diligenciado',
    subtitle: 'Formato institucional diligenciado por la empresa (únicamente PDF o Word: .pdf, .doc, .docx).',
    accept: '.pdf,.doc,.docx',
    requiresIssuedAt: false,
  },
  {
    type: 'REPRESENTANTE_DIRECTIVA',
    title: '2. Representante Legal y Composición Directiva',
    subtitle: 'Cédula y nombramiento del representante legal, certificado de existencia/representación y junta directiva.',
    accept: '.pdf,.doc,.docx,.png,.jpg,.jpeg',
    requiresIssuedAt: false,
  },
  {
    type: 'ANTECEDENTES_LEGALES',
    title: '3. Certificados de Antecedentes Legales y Fiscales',
    subtitle: 'Procuraduría, Contraloría, Personería, Policía y Medidas Correctivas (máximo 30 días calendario - RN02).',
    accept: '.pdf,.doc,.docx,.png,.jpg,.jpeg',
    requiresIssuedAt: true,
  },
];

function AgreementStatusBadge({ status }: { status: AgreementStatus }) {
  switch (status) {
    case 'PENDIENTE_JURIDICA_UFPS':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Scale className="w-3.5 h-3.5" />
          Pendiente por Jurídica UFPS
        </span>
      );
    case 'OBSERVADO_JURIDICA':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
          <AlertTriangle className="w-3.5 h-3.5" />
          Observado por Jurídica
        </span>
      );
    case 'APROBADO_JURIDICA':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          Aprobado Jurídica (Firma Habilitada)
        </span>
      );
    case 'VIGENTE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Vigente / Suscrito
        </span>
      );
    case 'VENCIDO':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
          <Ban className="w-3.5 h-3.5" />
          Vencido
        </span>
      );
    case 'CANCELADO':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
          <Ban className="w-3.5 h-3.5" />
          Cancelado
        </span>
      );
    case 'EN_TRAMITE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
          <Clock className="w-3.5 h-3.5" />
          En Trámite
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
          <FileText className="w-3.5 h-3.5" />
          Borrador
        </span>
      );
  }
}

function ConveniosPanelContent() {
  const searchParams = useSearchParams();
  const initialCompanyId = searchParams.get('companyId') || '';

  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [agreements, setAgreements] = useState<AgreementResponseDTO[]>([]);
  const [companies, setCompanies] = useState<CompanyResponseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [companyFilter, setCompanyFilter] = useState<string>(initialCompanyId);

  // Modal Nueva Solicitud de Convenio
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    companyId: initialCompanyId,
    agreementNumber: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Expediente Seleccionado
  const [selectedAgreement, setSelectedAgreement] = useState<AgreementResponseDTO | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    notification?: any;
  } | null>(null);

  // Estados de carga por cada prerrequisito
  const [prereqInputs, setPrereqInputs] = useState<
    Record<
      AgreementPrerequisiteDocumentType,
      { fileUrl: string; fileName: string; mimeType: string; issuedAt: string; uploading: boolean }
    >
  >({
    BORRADOR_MINUTA: { fileUrl: '', fileName: '', mimeType: '', issuedAt: '', uploading: false },
    REPRESENTANTE_DIRECTIVA: { fileUrl: '', fileName: '', mimeType: '', issuedAt: '', uploading: false },
    ANTECEDENTES_LEGALES: {
      fileUrl: '',
      fileName: '',
      mimeType: '',
      issuedAt: new Date().toISOString().split('T')[0],
      uploading: false,
    },
  });

  // Remisión a Jurídica
  const [sendNotes, setSendNotes] = useState('');
  const [isSendingToJuridica, setIsSendingToJuridica] = useState(false);

  // Dictamen Jurídica
  const [dictamenDecision, setDictamenDecision] = useState<'APROBADO' | 'DEVUELTO'>('APROBADO');
  const [dictamenRadicado, setDictamenRadicado] = useState('');
  const [dictamenDate, setDictamenDate] = useState(new Date().toISOString().split('T')[0]);
  const [dictamenConceptUrl, setDictamenConceptUrl] = useState('');
  const [dictamenObservations, setDictamenObservations] = useState('');
  const [dictamenActivateNow, setDictamenActivateNow] = useState(false);
  const [observedDocTypes, setObservedDocTypes] = useState<AgreementPrerequisiteDocumentType[]>([]);
  const [isUploadingConcept, setIsUploadingConcept] = useState(false);
  const [isSubmittingDictamen, setIsSubmittingDictamen] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
          if (data.data.role === 'TUTOR_EMPRESARIAL' && data.data.companyId) {
            setCreateForm((prev) => ({ ...prev, companyId: data.data.companyId }));
          }
        }
      })
      .catch((err) => console.error(err));
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (companyFilter) params.append('companyId', companyFilter);
      if (searchTerm) params.append('search', searchTerm);

      const [convRes, compRes] = await Promise.all([
        fetch(`/api/v1/convenios?${params.toString()}`),
        fetch('/api/v1/empresas?limit=100'),
      ]);

      const convData = await convRes.json();
      const compData = await compRes.json();

      if (convData.success && convData.data) {
        const items: AgreementResponseDTO[] = convData.data.items || [];
        setAgreements(items);
        setSelectedAgreement((prev) => {
          if (!prev) return null;
          return items.find((i) => i.id === prev.id) || prev;
        });
      }

      if (compData.success && compData.data) {
        setCompanies(compData.data.items || []);
      }
    } catch (err) {
      console.error('Error cargando convenios:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, companyFilter, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAgreementExpediente = (ag: AgreementResponseDTO) => {
    setSelectedAgreement(ag);
    setFeedbackBanner(null);
    setDictamenRadicado(ag.juridicaRadicadoNumber || '');
    setDictamenConceptUrl(ag.juridicaConceptUrl || '');
    setDictamenObservations('');
    setObservedDocTypes([]);

    const nextInputs = {
      BORRADOR_MINUTA: { fileUrl: '', fileName: '', mimeType: '', issuedAt: '', uploading: false },
      REPRESENTANTE_DIRECTIVA: { fileUrl: '', fileName: '', mimeType: '', issuedAt: '', uploading: false },
      ANTECEDENTES_LEGALES: {
        fileUrl: '',
        fileName: '',
        mimeType: '',
        issuedAt: new Date().toISOString().split('T')[0],
        uploading: false,
      },
    };

    for (const p of ag.prerequisites) {
      if (nextInputs[p.documentType]) {
        nextInputs[p.documentType] = {
          fileUrl: p.fileUrl,
          fileName: p.fileName || '',
          mimeType: p.mimeType || '',
          issuedAt: p.issuedAt ? p.issuedAt.split('T')[0] : nextInputs[p.documentType].issuedAt,
          uploading: false,
        };
      }
    }
    setPrereqInputs(nextInputs);
  };

  const handleCreateAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      const res = await fetch('/api/v1/convenios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.error?.message || 'No se pudo crear la solicitud de convenio');
        return;
      }
      setIsCreateModalOpen(false);
      await loadData();
      if (data.data) {
        openAgreementExpediente(data.data);
      }
    } catch (err) {
      console.error(err);
      setCreateError('Error de conexión al crear el convenio');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUploadFileForPrerequisite = async (
    docType: AgreementPrerequisiteDocumentType,
    file: File
  ) => {
    setPrereqInputs((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], uploading: true },
    }));
    setFeedbackBanner(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'convenios');
      const uploadRes = await fetch('/api/v1/upload/cv', { method: 'POST', body: fd });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.success) {
        setFeedbackBanner({
          type: 'error',
          message: uploadData.error?.message || 'Error al subir el archivo de soporte',
        });
        return;
      }

      setPrereqInputs((prev) => ({
        ...prev,
        [docType]: {
          ...prev[docType],
          fileUrl: uploadData.data.url,
          fileName: uploadData.data.fileName,
          mimeType: uploadData.data.mimeType,
          uploading: false,
        },
      }));
    } catch (err) {
      console.error(err);
      setFeedbackBanner({ type: 'error', message: 'Error de red al subir el archivo' });
    } finally {
      setPrereqInputs((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], uploading: false },
      }));
    }
  };

  const handleSavePrerequisite = async (docType: AgreementPrerequisiteDocumentType) => {
    if (!selectedAgreement) return;
    const input = prereqInputs[docType];
    setFeedbackBanner(null);

    if (!input.fileUrl.trim()) {
      setFeedbackBanner({
        type: 'error',
        message: 'Debe subir un archivo o ingresar la URL del soporte documental antes de guardar.',
      });
      return;
    }

    setPrereqInputs((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], uploading: true },
    }));

    try {
      const res = await fetch(`/api/v1/convenios/${selectedAgreement.id}/prerrequisitos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: docType,
          fileUrl: input.fileUrl.trim(),
          fileName: input.fileName || undefined,
          mimeType: input.mimeType || undefined,
          issuedAt: docType === 'ANTECEDENTES_LEGALES' ? input.issuedAt || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedbackBanner({
          type: 'error',
          message: data.error?.message || 'No fue posible registrar el prerrequisito',
        });
        return;
      }

      setSelectedAgreement(data.data.agreement);
      setFeedbackBanner({
        type: 'success',
        message: data.message || 'Prerrequisito guardado y validado correctamente.',
      });
      loadData();
    } catch (err) {
      console.error(err);
      setFeedbackBanner({ type: 'error', message: 'Error de conexión al guardar prerrequisito' });
    } finally {
      setPrereqInputs((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], uploading: false },
      }));
    }
  };

  const handleSendToJuridica = async () => {
    if (!selectedAgreement) return;
    setIsSendingToJuridica(true);
    setFeedbackBanner(null);

    try {
      const res = await fetch(`/api/v1/convenios/${selectedAgreement.id}/enviar-juridica`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: sendNotes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedbackBanner({
          type: 'error',
          message: data.error?.message || 'No fue posible remitir el expediente a Jurídica UFPS',
        });
        return;
      }

      setSelectedAgreement(data.data.agreement);
      setFeedbackBanner({
        type: 'success',
        message: data.message,
      });
      loadData();
    } catch (err) {
      console.error(err);
      setFeedbackBanner({ type: 'error', message: 'Error de red al remitir el expediente' });
    } finally {
      setIsSendingToJuridica(false);
    }
  };

  const handleUploadConceptPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingConcept(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'juridica');
      const res = await fetch('/api/v1/upload/cv', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.success) {
        setDictamenConceptUrl(data.data.url);
      } else {
        setFeedbackBanner({
          type: 'error',
          message: data.error?.message || 'Error al subir concepto jurídico',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingConcept(false);
    }
  };

  const handleSubmitDictamen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgreement) return;
    setIsSubmittingDictamen(true);
    setFeedbackBanner(null);

    try {
      const res = await fetch(`/api/v1/convenios/${selectedAgreement.id}/dictamen-juridica`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: dictamenDecision,
          radicadoNumber: dictamenRadicado,
          approvalDate: dictamenDate,
          conceptUrl: dictamenDecision === 'APROBADO' ? dictamenConceptUrl : undefined,
          observations: dictamenObservations,
          observedDocuments: dictamenDecision === 'DEVUELTO' ? observedDocTypes : undefined,
          activateImmediately: dictamenDecision === 'APROBADO' ? dictamenActivateNow : false,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedbackBanner({
          type: 'error',
          message: data.error?.message || 'Error al registrar el dictamen de Jurídica UFPS',
        });
        return;
      }

      setSelectedAgreement(data.data.agreement);
      setFeedbackBanner({
        type: dictamenDecision === 'APROBADO' ? 'success' : 'warning',
        message: data.message,
        notification: data.data.notification,
      });
      loadData();
    } catch (err) {
      console.error(err);
      setFeedbackBanner({ type: 'error', message: 'Error de conexión al guardar dictamen' });
    } finally {
      setIsSubmittingDictamen(false);
    }
  };

  const handleSubscribeApproved = async () => {
    if (!selectedAgreement) return;
    setIsSubscribing(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch(`/api/v1/convenios/${selectedAgreement.id}/suscribir`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedbackBanner({
          type: 'error',
          message: data.error?.message || 'No fue posible suscribir el convenio',
        });
        return;
      }
      setSelectedAgreement(data.data);
      setFeedbackBanner({
        type: 'success',
        message: data.message,
      });
      loadData();
    } catch (err) {
      console.error(err);
      setFeedbackBanner({ type: 'error', message: 'Error de red al suscribir el convenio' });
    } finally {
      setIsSubscribing(false);
    }
  };

  const isCoordinatorOrAdmin =
    currentUser?.role === 'DIRECTOR_PROGRAMA' || currentUser?.role === 'ADMIN';
  const canCreateOrUpload =
    isCoordinatorOrAdmin || currentUser?.role === 'TUTOR_EMPRESARIAL';

  const stats = {
    total: agreements.length,
    borradorObservado: agreements.filter(
      (a) => a.status === 'BORRADOR' || a.status === 'EN_TRAMITE' || a.status === 'OBSERVADO_JURIDICA'
    ).length,
    pendienteJuridica: agreements.filter((a) => a.status === 'PENDIENTE_JURIDICA_UFPS').length,
    aprobadoVigente: agreements.filter(
      (a) => a.status === 'APROBADO_JURIDICA' || a.status === 'VIGENTE'
    ).length,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-red-700" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-bold uppercase tracking-wider">
                <Scale className="w-3.5 h-3.5" />
                <span>Protocolo Jurídico Institucional • UFPS</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Convenios Empresariales y Revisión Jurídica UFPS
              </h1>
              <p className="text-sm text-slate-600 max-w-3xl">
                Gestión obligatoria de prerrequisitos documentales (minuta, representación/directiva y antecedentes vigentes ≤ 30 días), remisión a la Oficina de Asesoría Jurídica y trazabilidad de vistos buenos antes de formalizar prácticas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-start md:self-center">
              <Link
                href="/empresas"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-all"
              >
                <Building2 className="w-4 h-4" />
                <span>Directorio Empresas</span>
              </Link>
              {canCreateOrUpload && (
                <button
                  onClick={() => {
                    setCreateError(null);
                    setIsCreateModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-md shadow-red-700/20 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Radicar Solicitud de Convenio</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Convenios</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Borrador / Observado</p>
            <p className="text-2xl font-black text-amber-800 mt-1">{stats.borradorObservado}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-sm">
            <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Pendiente Jurídica UFPS</p>
            <p className="text-2xl font-black text-indigo-800 mt-1">{stats.pendienteJuridica}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm">
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Aprobados / Vigentes</p>
            <p className="text-2xl font-black text-emerald-800 mt-1">{stats.aprobadoVigente}</p>
          </div>
        </div>

        {/* Filtros y Tabla */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por # convenio, empresa, NIT o radicado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                <option value="">Todos los estados</option>
                <option value="BORRADOR">Borrador</option>
                <option value="PENDIENTE_JURIDICA_UFPS">Pendiente Jurídica UFPS</option>
                <option value="OBSERVADO_JURIDICA">Observado por Jurídica</option>
                <option value="APROBADO_JURIDICA">Aprobado Jurídica</option>
                <option value="VIGENTE">Vigente / Suscrito</option>
                <option value="VENCIDO">Vencido</option>
              </select>

              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 max-w-xs"
              >
                <option value="">Todas las empresas</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.businessName} ({c.nit})
                  </option>
                ))}
              </select>

              <button
                onClick={loadData}
                title="Actualizar panel"
                className="p-2 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-slate-200"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-600" />
              <p className="text-xs">Cargando panel de convenios institucionales...</p>
            </div>
          ) : agreements.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <Scale className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-sm text-slate-800">No se encontraron convenios registrados</p>
              <p className="text-xs text-slate-400">
                Inicie una solicitud de convenio en estado BORRADOR para cargar los 3 paquetes de prerrequisitos documentales.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Convenio & Empresa</th>
                    <th className="py-3 px-4">Prerrequisitos (3 Paquetes)</th>
                    <th className="py-3 px-4">Estado Jurídico UFPS</th>
                    <th className="py-3 px-4">Radicado / Dictamen</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {agreements.map((ag) => (
                    <tr key={ag.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900">{ag.agreementNumber}</div>
                        <div className="font-semibold text-slate-700 mt-0.5">
                          {ag.company?.businessName || 'Empresa Receptora'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          NIT: {ag.company?.nit || '—'} • Vigencia: {new Date(ag.startDate).toLocaleDateString()} –{' '}
                          {new Date(ag.endDate).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              ag.checklist.allRequiredUploaded && ag.checklist.antecedentesWithin30Days
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {ag.prerequisites.length} / 3 cargados
                          </span>
                          {ag.checklist.hasAntecedentesLegales && !ag.checklist.antecedentesWithin30Days && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                              Antecedentes &gt; 30d
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {ag.checklist.isFormalizableForPractices
                            ? '✓ Habilita formalización de prácticas (RN01)'
                            : '✕ Bloquea formalización anticipada (RN01)'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <AgreementStatusBadge status={ag.status} />
                      </td>

                      <td className="py-3.5 px-4">
                        {ag.juridicaRadicadoNumber ? (
                          <div className="space-y-0.5">
                            <div className="font-mono font-bold text-slate-800">
                              Rad. {ag.juridicaRadicadoNumber}
                            </div>
                            {ag.juridicaApprovalDate && (
                              <div className="text-[10px] text-emerald-700">
                                Aprobado: {new Date(ag.juridicaApprovalDate).toLocaleDateString()}
                              </div>
                            )}
                            {ag.juridicaObservations && (
                              <div className="text-[10px] text-amber-700 max-w-xs truncate">
                                Obs: {ag.juridicaObservations}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Sin radicado asignado</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openAgreementExpediente(ag)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-sm transition-all cursor-pointer"
                        >
                          <FileCheck2 className="w-3.5 h-3.5" />
                          <span>Expediente Jurídico</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* MODAL: NUEVA SOLICITUD DE CONVENIO */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-red-800 to-red-700 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5" />
                <h3 className="font-bold text-sm">Radicar Solicitud de Convenio (BORRADOR)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-red-100 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAgreement} className="p-6 space-y-4">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Empresa Receptora *</label>
                <select
                  required
                  value={createForm.companyId}
                  disabled={currentUser?.role === 'TUTOR_EMPRESARIAL' && !!currentUser?.companyId}
                  onChange={(e) => setCreateForm({ ...createForm, companyId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                >
                  <option value="">Seleccione una empresa...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} (NIT: {c.nit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Convenio (Opcional — autogenerado si se omite)
                </label>
                <input
                  type="text"
                  placeholder="Ej. CONV-UFPS-2026-099"
                  value={createForm.agreementNumber}
                  onChange={(e) => setCreateForm({ ...createForm, agreementNumber: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Inicio *</label>
                  <input
                    type="date"
                    required
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Vencimiento *</label>
                  <input
                    type="date"
                    required
                    value={createForm.endDate}
                    onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notas iniciales</label>
                <textarea
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Observaciones iniciales de la postulación..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl disabled:opacity-50"
                >
                  {isCreating ? 'Creando...' : 'Iniciar Expediente (BORRADOR)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EXPEDIENTE JURÍDICO COMPLETO */}
      {selectedAgreement && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-800 to-red-700 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Scale className="w-5 h-5" />
                  <h3 className="font-bold text-base">
                    Expediente Jurídico: {selectedAgreement.agreementNumber}
                  </h3>
                </div>
                <p className="text-xs text-red-100">
                  {selectedAgreement.company?.businessName} (NIT: {selectedAgreement.company?.nit})
                </p>
              </div>
              <div className="flex items-center gap-3">
                <AgreementStatusBadge status={selectedAgreement.status} />
                <button
                  type="button"
                  onClick={() => setSelectedAgreement(null)}
                  className="text-red-100 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {feedbackBanner && (
                <div
                  role="alert"
                  className={`p-4 rounded-xl border text-xs space-y-2 ${
                    feedbackBanner.type === 'success'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : feedbackBanner.type === 'warning'
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-red-50 border-red-300 text-red-900'
                  }`}
                >
                  <p className="font-bold">{feedbackBanner.message}</p>
                  {feedbackBanner.notification && (
                    <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200 flex items-start gap-2">
                      <Mail className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-[11px]">
                          Notificación enviada a {feedbackBanner.notification.recipientEmail || feedbackBanner.notification.recipientName}
                        </p>
                        <p className="text-[11px] text-slate-600">{feedbackBanner.notification.message}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Alerta RN01 si aún no aprobado */}
              {!selectedAgreement.checklist.isFormalizableForPractices && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">RN01 - Bloqueo de Formalización Anticipada:</span> Ningún estudiante puede ser formalizado en prácticas con esta empresa hasta que el convenio obtenga el visto bueno de Jurídica UFPS (<code className="font-mono">APROBADO_JURIDICA</code> o <code className="font-mono">VIGENTE</code>).
                  </div>
                </div>
              )}

              {/* SECCIÓN 1: PRERREQUISITOS DOCUMENTALES (3 PAQUETES) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-red-700" />
                    <span>Criterio 1: Paquetes Documentales Obligatorios ({selectedAgreement.prerequisites.length}/3)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    RN02: Antecedentes con vigencia ≤ 30 días calendario
                  </span>
                </div>

                <div className="space-y-3">
                  {PREREQUISITE_CATALOG.map((pkg) => {
                    const saved = selectedAgreement.prerequisites.find((p) => p.documentType === pkg.type);
                    const input = prereqInputs[pkg.type];
                    const canEditPrereqs =
                      canCreateOrUpload &&
                      ['BORRADOR', 'EN_TRAMITE', 'OBSERVADO_JURIDICA'].includes(selectedAgreement.status);

                    return (
                      <div
                        key={pkg.type}
                        className={`p-4 rounded-xl border space-y-3 ${
                          saved?.verificationStatus === 'OBSERVADO'
                            ? 'bg-amber-50/60 border-amber-300'
                            : saved
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-slate-900">{pkg.title}</p>
                            <p className="text-[11px] text-slate-500">{pkg.subtitle}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {saved ? (
                              <>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    saved.verificationStatus === 'VERIFICADO'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : saved.verificationStatus === 'OBSERVADO'
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : 'bg-sky-100 text-sky-800 border-sky-300'
                                  }`}
                                >
                                  {saved.verificationStatus}
                                </span>
                                <a
                                  href={saved.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:underline"
                                >
                                  <span>Ver soporte</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                                Faltante
                              </span>
                            )}
                          </div>
                        </div>

                        {saved?.observations && (
                          <div className="p-2 rounded-lg bg-amber-100/70 text-amber-900 text-[11px] font-medium">
                            Observación jurídica: {saved.observations}
                          </div>
                        )}

                        {pkg.type === 'ANTECEDENTES_LEGALES' && saved && (
                          <div className="flex items-center gap-2 text-[11px]">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              Expedición: <strong>{saved.issuedAt ? new Date(saved.issuedAt).toLocaleDateString() : 'No registrada'}</strong>
                            </span>
                            {saved.daysSinceIssued !== null && (
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold ${
                                  saved.isWithin30DaysValidity
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {saved.daysSinceIssued} días calendario ({saved.isWithin30DaysValidity ? 'Vigente ≤ 30d' : 'Vencido > 30d'})
                              </span>
                            )}
                          </div>
                        )}

                        {canEditPrereqs && (
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 items-end">
                            <div className={pkg.requiresIssuedAt ? 'sm:col-span-5' : 'sm:col-span-8'}>
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                Archivo / URL del Soporte
                              </label>
                              <input
                                type="text"
                                placeholder="Suba archivo o pegue URL (https://...)"
                                value={input.fileUrl}
                                onChange={(e) =>
                                  setPrereqInputs((prev) => ({
                                    ...prev,
                                    [pkg.type]: { ...prev[pkg.type], fileUrl: e.target.value },
                                  }))
                                }
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                              />
                            </div>

                            {pkg.requiresIssuedAt && (
                              <div className="sm:col-span-3">
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                  Fecha Expedición (RN02) *
                                </label>
                                <input
                                  type="date"
                                  value={input.issuedAt}
                                  onChange={(e) =>
                                    setPrereqInputs((prev) => ({
                                      ...prev,
                                      [pkg.type]: { ...prev[pkg.type], issuedAt: e.target.value },
                                    }))
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                />
                              </div>
                            )}

                            <div className="sm:col-span-4 flex items-center gap-1.5">
                              <label className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer">
                                <Upload className="w-3.5 h-3.5" />
                                <span>{input.uploading ? '...' : 'Archivo'}</span>
                                <input
                                  type="file"
                                  accept={pkg.accept}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadFileForPrerequisite(pkg.type, f);
                                  }}
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                disabled={input.uploading}
                                onClick={() => handleSavePrerequisite(pkg.type)}
                                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50 cursor-pointer"
                              >
                                <CheckCheck className="w-3.5 h-3.5" />
                                <span>Guardar</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECCIÓN 2: REMISIÓN A JURÍDICA UFPS (CRITERIO 2) */}
              {isCoordinatorOrAdmin &&
                ['BORRADOR', 'EN_TRAMITE', 'OBSERVADO_JURIDICA'].includes(selectedAgreement.status) && (
                  <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                          <Send className="w-4 h-4 text-indigo-700" />
                          <span>Criterio 2: Remitir Expediente a Jurídica UFPS</span>
                        </h4>
                        <p className="text-[11px] text-indigo-800">
                          Actualiza el convenio a <code className="font-mono font-bold">PENDIENTE_JURIDICA_UFPS</code> tras verificar los 3 paquetes y vigencia ≤ 30 días.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        placeholder="Notas de remisión interna (opcional)..."
                        value={sendNotes}
                        onChange={(e) => setSendNotes(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs border border-indigo-200 rounded-xl bg-white"
                      />
                      <button
                        type="button"
                        disabled={!selectedAgreement.checklist.canSendToJuridica || isSendingToJuridica}
                        onClick={handleSendToJuridica}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-45 disabled:cursor-not-allowed rounded-xl shadow-sm cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span>
                          {isSendingToJuridica ? 'Remitiendo...' : 'Remitir a Jurídica UFPS'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

              {/* SECCIÓN 3: DICTAMEN OFICINA JURÍDICA UFPS (CRITERIO 3 & RN03) */}
              {isCoordinatorOrAdmin && selectedAgreement.status === 'PENDIENTE_JURIDICA_UFPS' && (
                <form
                  onSubmit={handleSubmitDictamen}
                  className="p-5 rounded-xl bg-slate-50 border border-slate-300 space-y-4"
                >
                  <div className="border-b border-slate-200 pb-2">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Scale className="w-4 h-4 text-red-700" />
                      <span>Criterio 3: Registrar Dictamen de Oficina de Asesoría Jurídica UFPS</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Registre el visto bueno favorable (con radicado y resolución/concepto) o la devolución con observaciones obligatorias (RN03).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDictamenDecision('APROBADO')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        dictamenDecision === 'APROBADO'
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-200'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Aprobado (Visto Bueno Favorable)</span>
                      </div>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        Habilita firma final (APROBADO_JURIDICA / VIGENTE).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDictamenDecision('DEVUELTO')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        dictamenDecision === 'DEVUELTO'
                          ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-200'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <FileWarning className="w-4 h-4 text-amber-600" />
                        <span>Devuelto con Observaciones</span>
                      </div>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        Notifica a la empresa para subsanar soportes (OBSERVADO_JURIDICA).
                      </p>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Número de Radicado Interno (RN03) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. RAD-JUR-UFPS-2026-0142"
                        value={dictamenRadicado}
                        onChange={(e) => setDictamenRadicado(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Fecha de Emisión / Revisión *
                      </label>
                      <input
                        type="date"
                        required
                        value={dictamenDate}
                        onChange={(e) => setDictamenDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                  </div>

                  {dictamenDecision === 'APROBADO' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Concepto Favorable / Resolución Jurídica (PDF o URL) *
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            required
                            placeholder="https://... o suba resolución PDF"
                            value={dictamenConceptUrl}
                            onChange={(e) => setDictamenConceptUrl(e.target.value)}
                            className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                          />
                          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{isUploadingConcept ? 'Subiendo...' : 'Subir'}</span>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx"
                              onChange={handleUploadConceptPdf}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dictamenActivateNow}
                          onChange={(e) => setDictamenActivateNow(e.target.checked)}
                          className="rounded border-slate-300 text-red-700 focus:ring-red-500"
                        />
                        <span>Registrar firma final del Director y activar inmediatamente como VIGENTE</span>
                      </label>
                    </div>
                  )}

                  {dictamenDecision === 'DEVUELTO' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700">
                        Paquetes Documentales Observados (opcional)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {PREREQUISITE_CATALOG.map((pkg) => {
                          const checked = observedDocTypes.includes(pkg.type);
                          return (
                            <label
                              key={pkg.type}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-[11px] font-medium cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setObservedDocTypes((prev) =>
                                    checked ? prev.filter((x) => x !== pkg.type) : [...prev, pkg.type]
                                  )
                                }
                              />
                              <span>{pkg.type}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Observaciones Jurídicas {dictamenDecision === 'DEVUELTO' ? '(Obligatorio RN03) *' : '(Opcional)'}
                    </label>
                    <textarea
                      rows={3}
                      required={dictamenDecision === 'DEVUELTO'}
                      placeholder={
                        dictamenDecision === 'DEVUELTO'
                          ? 'Detalle los ajustes jurídicos requeridos para que la empresa subsane los soportes...'
                          : 'Notas adicionales del concepto favorable...'
                      }
                      value={dictamenObservations}
                      onChange={(e) => setDictamenObservations(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingDictamen}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50 ${
                        dictamenDecision === 'APROBADO'
                          ? 'bg-emerald-700 hover:bg-emerald-800'
                          : 'bg-amber-700 hover:bg-amber-800'
                      }`}
                    >
                      <Scale className="w-4 h-4" />
                      <span>
                        {isSubmittingDictamen
                          ? 'Registrando...'
                          : dictamenDecision === 'APROBADO'
                          ? 'Emitir Visto Bueno Favorable'
                          : 'Registrar Devolución y Notificar Empresa'}
                      </span>
                    </button>
                  </div>
                </form>
              )}

              {/* BOTÓN FIRMA FINAL CUANDO ESTÁ APROBADO_JURIDICA */}
              {isCoordinatorOrAdmin && selectedAgreement.status === 'APROBADO_JURIDICA' && (
                <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-teal-900">
                      Visto bueno emitido por Jurídica UFPS (Radicado: {selectedAgreement.juridicaRadicadoNumber})
                    </p>
                    <p className="text-[11px] text-teal-700">
                      El convenio tiene habilitada la firma final para pasar a estado VIGENTE.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSubscribing}
                    onClick={handleSubscribeApproved}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubscribing ? 'Suscribiendo...' : 'Suscribir y Activar (VIGENTE)'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* HISTORIAL DE TRAZABILIDAD JURÍDICA (RN03) */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-4 h-4 text-slate-500" />
                  <span>Trazabilidad de Conceptos Jurídicos (RN03)</span>
                </h4>
                {selectedAgreement.juridicaHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    Aún no se han registrado dictámenes de la Oficina de Jurídica UFPS para este convenio.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedAgreement.juridicaHistory.map((h) => (
                      <div
                        key={h.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col gap-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                h.decision === 'APROBADO'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {h.decision}
                            </span>
                            <span className="font-mono font-bold text-slate-800">
                              Radicado: {h.radicadoNumber}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {new Date(h.reviewedAt).toLocaleString()} • {h.reviewerName}
                          </span>
                        </div>
                        {h.observations && (
                          <p className="text-slate-700 text-[11px]">{h.observations}</p>
                        )}
                        {h.conceptUrl && (
                          <a
                            href={h.conceptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:underline w-fit"
                          >
                            <span>Ver concepto / resolución</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">
          SIGETRAP • Sistema de Gestión y Trazabilidad de Prácticas Empresariales
        </p>
        <p className="text-slate-400 mt-1">
          Programa de Ingeniería de Sistemas • Universidad Francisco de Paula Santander
        </p>
      </footer>
    </div>
  );
}

export default function ConveniosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500">
          Cargando módulo de convenios...
        </div>
      }
    >
      <ConveniosPanelContent />
    </Suspense>
  );
}
