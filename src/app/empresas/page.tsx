'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  Building2,
  FileCheck,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone,
  MapPin,
  UserCheck,
  ShieldCheck,
  RefreshCw,
  Copy,
  CheckCheck,
  ArrowRight,
  ExternalLink,
  Info,
  Briefcase,
  Layers,
  ChevronRight,
  FileSpreadsheet,
  Users,
  UserPlus,
  IdCard,
  Edit3,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CompanyResponseDTO, CompanyTutorResponseDTO, UserResponseDTO } from '@/types';

export default function EmpresasPage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Tab activo: 'radicar', 'directorio' o 'tutores' (HU09 / CU09)
  const [activeTab, setActiveTab] = useState<'radicar' | 'directorio' | 'tutores'>('radicar');

  // Listado de empresas
  const [companies, setCompanies] = useState<CompanyResponseDTO[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [copiedNit, setCopiedNit] = useState<string | null>(null);

  // Formulario de radicación de empresa (HU07)
  const [formData, setFormData] = useState({
    nit: '',
    businessName: '',
    legalRepresentative: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    city: 'Cúcuta',
  });

  // Estado de validación en tiempo real del NIT
  const [isCheckingNit, setIsCheckingNit] = useState(false);
  const [nitStatus, setNitStatus] = useState<{
    checked: boolean;
    exists: boolean;
    company?: CompanyResponseDTO | null;
  }>({ checked: false, exists: false });

  // Estados de envío y feedback (HU07)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ message: string; code?: string; field?: string } | null>(null);
  const [formSuccess, setFormSuccess] = useState<CompanyResponseDTO | null>(null);

  // ============================================================================
  // HU09 / CU09 - Vinculación de Tutores Empresariales (Supervisores Inmediatos)
  // ============================================================================
  const [selectedTutorCompanyId, setSelectedTutorCompanyId] = useState<string>('');
  const [companyTutors, setCompanyTutors] = useState<CompanyTutorResponseDTO[]>([]);
  const [isLoadingTutors, setIsLoadingTutors] = useState(false);
  const [tutorForm, setTutorForm] = useState({
    nombre: '',
    cargo: '',
    correo: '',
    tipoDocumento: 'CC',
    documento: '',
    telefono: '',
  });
  const [isSubmittingTutor, setIsSubmittingTutor] = useState(false);
  const [tutorError, setTutorError] = useState<{
    message: string;
    code?: string;
    constraint?: string;
    field?: string;
  } | null>(null);
  const [tutorSuccess, setTutorSuccess] = useState<CompanyTutorResponseDTO | null>(null);

  // Cargar usuario autenticado
  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
          if (data.data.companyId) {
            setSelectedTutorCompanyId(data.data.companyId);
          }
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setIsCheckingAuth(false));
  }, []);

  // Cargar directorio de empresas
  const loadCompanies = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (cityFilter) params.append('city', cityFilter);

      const res = await fetch(`/api/v1/empresas?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.data) {
        const list: CompanyResponseDTO[] = data.data.items || [];
        setCompanies(list);
        if (!selectedTutorCompanyId && list.length > 0) {
          setSelectedTutorCompanyId(list[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingList(false);
    }
  }, [searchTerm, cityFilter, selectedTutorCompanyId]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  // Cargar tutores empresariales vinculados a la empresa seleccionada (HU09)
  const loadCompanyTutors = useCallback(async (companyIdToLoad?: string) => {
    const targetId = companyIdToLoad ?? selectedTutorCompanyId;
    setIsLoadingTutors(true);
    try {
      const params = new URLSearchParams();
      if (targetId) params.append('companyId', targetId);
      params.append('onlyActive', 'true');

      const res = await fetch(`/api/v1/tutores?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.data) {
        setCompanyTutors(data.data.items || []);
      } else {
        setCompanyTutors([]);
      }
    } catch (e) {
      console.error('Error cargando tutores empresariales:', e);
      setCompanyTutors([]);
    } finally {
      setIsLoadingTutors(false);
    }
  }, [selectedTutorCompanyId]);

  useEffect(() => {
    if (activeTab === 'tutores') {
      loadCompanyTutors();
    }
  }, [activeTab, selectedTutorCompanyId, loadCompanyTutors]);

  // Envío del formulario de Vinculación de Supervisor Inmediato (HU09 / CU09)
  const handleRegisterTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    setTutorError(null);
    setTutorSuccess(null);

    const targetCompanyId = selectedTutorCompanyId || currentUser?.companyId || '';
    if (!targetCompanyId) {
      setTutorError({
        message: 'Debe seleccionar una empresa receptora activa para vincular al supervisor.',
        field: 'companyId',
      });
      return;
    }

    setIsSubmittingTutor(true);
    try {
      const res = await fetch('/api/v1/tutores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: targetCompanyId,
          nombre: tutorForm.nombre,
          cargo: tutorForm.cargo,
          correo: tutorForm.correo,
          tipoDocumento: tutorForm.tipoDocumento,
          documento: tutorForm.documento,
          telefono: tutorForm.telefono,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setTutorError({
          message:
            data.error?.message ||
            'El correo electrónico no es válido o ya se encuentra en uso.',
          code: data.error?.code,
          constraint: data.error?.details?.constraint,
          field: data.error?.details?.field,
        });
        return;
      }

      setTutorSuccess(data.data);
      setTutorForm({
        nombre: '',
        cargo: '',
        correo: '',
        tipoDocumento: 'CC',
        documento: '',
        telefono: '',
      });
      loadCompanyTutors(targetCompanyId);
      loadCompanies();
    } catch (err) {
      console.error(err);
      setTutorError({
        message: 'Error de conexión al intentar registrar el supervisor empresarial.',
      });
    } finally {
      setIsSubmittingTutor(false);
    }
  };

  // Verificar NIT en tiempo real con debounce
  const handleNitChange = (val: string) => {
    setFormData((prev) => ({ ...prev, nit: val }));
    setFormError(null);
    setFormSuccess(null);

    const clean = val.trim();
    if (clean.length < 5) {
      setNitStatus({ checked: false, exists: false });
      return;
    }

    setIsCheckingNit(true);
    fetch(`/api/v1/empresas/verificar-nit?nit=${encodeURIComponent(clean)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setNitStatus({
            checked: true,
            exists: data.data.exists,
            company: data.data.company,
          });
          if (data.data.exists) {
            setFormError({
              message: `Ya existe una empresa registrada con este NIT (${data.data.company?.businessName || clean})`,
              code: 'NIT_ALREADY_EXISTS',
              field: 'nit',
            });
          }
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setIsCheckingNit(false));
  };

  // Envío del Formulario de Radicación
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Validaciones en cliente
    if (!formData.nit.trim()) {
      setFormError({ message: 'El NIT o Identificador Fiscal es obligatorio', field: 'nit' });
      return;
    }
    if (!formData.businessName.trim()) {
      setFormError({ message: 'La Razón Social de la empresa es obligatoria', field: 'businessName' });
      return;
    }
    if (!formData.legalRepresentative.trim()) {
      setFormError({ message: 'El Representante Legal es obligatorio', field: 'legalRepresentative' });
      return;
    }
    if (!formData.contactEmail.trim() || !formData.contactEmail.includes('@')) {
      setFormError({ message: 'Ingrese un correo electrónico de contacto fiscal válido', field: 'contactEmail' });
      return;
    }
    if (!formData.contactPhone.trim()) {
      setFormError({ message: 'El teléfono de contacto es obligatorio', field: 'contactPhone' });
      return;
    }
    if (!formData.address.trim()) {
      setFormError({ message: 'La dirección de la sede es obligatoria', field: 'address' });
      return;
    }
    if (!formData.city.trim()) {
      setFormError({ message: 'La ciudad de radicación es obligatoria', field: 'city' });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/v1/empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Intercepción del error de NIT duplicado (PostgreSQL 23505 o Prisma P2002)
        const errorMessage =
          data.error?.code === 'NIT_ALREADY_EXISTS'
            ? data.error.message || 'Ya existe una empresa registrada con este NIT'
            : data.error?.message || 'Error al radicar los datos de la empresa';

        setFormError({
          message: errorMessage,
          code: data.error?.code,
          field: data.error?.details?.field || 'nit',
        });
        return;
      }

      // Radicación exitosa
      setFormSuccess(data.data);
      setFormData({
        nit: '',
        businessName: '',
        legalRepresentative: '',
        contactEmail: '',
        contactPhone: '',
        address: '',
        city: 'Cúcuta',
      });
      setNitStatus({ checked: false, exists: false });
      loadCompanies();
    } catch (err: unknown) {
      console.error(err);
      setFormError({
        message: 'Error de conexión con el servidor. Por favor intente nuevamente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNit(text);
    setTimeout(() => setCopiedNit(null), 2000);
  };

  // Estados para Edición y Baja de Empresa + Convenio (HU07 / HU08)
  const [editingCompany, setEditingCompany] = useState<CompanyResponseDTO | null>(null);
  const [editCompanyData, setEditCompanyData] = useState({
    nit: '',
    businessName: '',
    legalRepresentative: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    city: '',
    agreementNumber: '',
    agreementStartDate: '',
    agreementEndDate: '',
    agreementStatus: 'VIGENTE',
    agreementDocumentUrl: '',
  });
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [editCompanyError, setEditCompanyError] = useState<string | null>(null);
  const [isUploadingAgreementDoc, setIsUploadingAgreementDoc] = useState(false);

  const handleOpenEditCompany = (company: CompanyResponseDTO) => {
    setEditingCompany(company);
    setEditCompanyError(null);
    setEditCompanyData({
      nit: company.nit || '',
      businessName: company.businessName || '',
      legalRepresentative: company.legalRepresentative || '',
      contactEmail: company.contactEmail || '',
      contactPhone: company.contactPhone || '',
      address: company.address || '',
      city: company.city || 'Cúcuta',
      agreementNumber: company.activeAgreement?.agreementNumber || `CONV-UFPS-${new Date().getFullYear()}-${company.nit.slice(0, 4)}`,
      agreementStartDate: company.activeAgreement?.startDate
        ? new Date(company.activeAgreement.startDate).toISOString().split('T')[0]
        : '2026-01-15',
      agreementEndDate: company.activeAgreement?.endDate
        ? new Date(company.activeAgreement.endDate).toISOString().split('T')[0]
        : '2028-12-31',
      agreementStatus: company.activeAgreement?.status || 'VIGENTE',
      agreementDocumentUrl: (company.activeAgreement as any)?.documentUrl || '',
    });
  };

  const handleUploadAgreementPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAgreementDoc(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'convenios');
      const res = await fetch('/api/v1/upload/cv', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditCompanyData((prev) => ({ ...prev, agreementDocumentUrl: data.data.url }));
      } else {
        setEditCompanyError(data.error?.message || 'Error al subir el documento de convenio');
      }
    } catch (err) {
      console.error(err);
      setEditCompanyError('Error al subir el archivo de convenio');
    } finally {
      setIsUploadingAgreementDoc(false);
    }
  };

  const handleSaveEditCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setIsSavingCompany(true);
    setEditCompanyError(null);

    try {
      const payload: Record<string, any> = {
        nit: editCompanyData.nit,
        businessName: editCompanyData.businessName,
        legalRepresentative: editCompanyData.legalRepresentative,
        contactEmail: editCompanyData.contactEmail,
        contactPhone: editCompanyData.contactPhone,
        address: editCompanyData.address,
        city: editCompanyData.city,
      };
      if (editCompanyData.agreementNumber.trim()) {
        payload.agreement = {
          agreementNumber: editCompanyData.agreementNumber.trim(),
          startDate: editCompanyData.agreementStartDate,
          endDate: editCompanyData.agreementEndDate,
          status: editCompanyData.agreementStatus,
          documentUrl: editCompanyData.agreementDocumentUrl || null,
        };
      }

      const res = await fetch(`/api/v1/empresas/${editingCompany.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEditCompanyError(data.error?.message || 'No fue posible actualizar la empresa');
        return;
      }

      setEditingCompany(null);
      loadCompanies();
    } catch (err) {
      console.error(err);
      setEditCompanyError('Error de red al guardar los cambios');
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleDeleteCompany = async (companyId: string, businessName: string) => {
    if (!confirm(`¿Confirma dar de baja a la empresa "${businessName}"?`)) return;
    try {
      const res = await fetch(`/api/v1/empresas/${companyId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        loadCompanies();
      } else {
        alert(data.error?.message || 'Error al dar de baja la empresa');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Estados para Edición y Baja de Tutor Empresarial (HU09)
  const [editingTutor, setEditingTutor] = useState<CompanyTutorResponseDTO | null>(null);
  const [editTutorData, setEditTutorData] = useState({
    nombre: '',
    cargo: '',
    correo: '',
    telefono: '',
    numeroDocumento: '',
    estado: 'Activo',
  });
  const [isSavingTutor, setIsSavingTutor] = useState(false);
  const [editTutorError, setEditTutorError] = useState<string | null>(null);

  const handleOpenEditTutor = (tutor: CompanyTutorResponseDTO) => {
    setEditingTutor(tutor);
    setEditTutorError(null);
    setEditTutorData({
      nombre: tutor.nombre || '',
      cargo: tutor.cargo || '',
      correo: tutor.correo || '',
      telefono: tutor.telefono || '',
      numeroDocumento: tutor.documento || (tutor as any).numeroDocumento || '',
      estado: tutor.estado || 'Activo',
    });
  };

  const handleSaveEditTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTutor) return;
    setIsSavingTutor(true);
    setEditTutorError(null);
    try {
      const res = await fetch(`/api/v1/tutores/${editingTutor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editTutorData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEditTutorError(data.error?.message || 'Error al actualizar el tutor');
        return;
      }
      setEditingTutor(null);
      loadCompanyTutors(selectedTutorCompanyId || undefined);
      loadCompanies();
    } catch (err) {
      console.error(err);
      setEditTutorError('Error de conexión al guardar');
    } finally {
      setIsSavingTutor(false);
    }
  };

  const handleDeleteTutor = async (tutorId: string, nombre: string) => {
    if (!confirm(`¿Confirma desvincular / dar de baja al supervisor "${nombre}"?`)) return;
    try {
      const res = await fetch(`/api/v1/tutores/${tutorId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        loadCompanyTutors(selectedTutorCompanyId || undefined);
        loadCompanies();
      } else {
        alert(data.error?.message || 'Error al dar de baja al tutor');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isStudent = currentUser?.role === 'ESTUDIANTE';
  const canRegisterCompany =
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'DIRECTOR_PROGRAMA' ||
    currentUser?.role === 'DOCENTE_PRACTICA' ||
    currentUser?.role === 'TUTOR_EMPRESARIAL';

  useEffect(() => {
    if (isStudent && activeTab === 'radicar') {
      setActiveTab('directorio');
    }
  }, [isStudent, activeTab]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Encabezado del Módulo */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-red-700" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-bold uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5" />
                <span>{isStudent ? 'Directorio de Entidades Empleadoras' : 'Módulo de Registro Empresarial'}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {isStudent ? 'Directorio de Empresas con Convenio Institucional' : 'Radicación de Datos Fiscales de la Empresa Receptora'}
              </h1>
              <p className="text-sm text-slate-600 max-w-3xl">
                {isStudent
                  ? 'Consulta el catálogo de empresas receptoras vinculadas y el estado de sus convenios institucionales para la realización de prácticas profesionales.'
                  : 'Registro y validación de datos tributarios (NIT, razón social, representante legal y contacto) para la habilitación formal de empresas en el flujo de convenios institucionales.'}
              </p>
            </div>

            {/* Selector de pestañas */}
            {canRegisterCompany && (
              <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl border border-slate-200 self-start md:self-center gap-1">
                <button
                  onClick={() => setActiveTab('radicar')}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'radicar'
                      ? 'bg-red-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Radicar Empresa</span>
                </button>
                <button
                  onClick={() => setActiveTab('tutores')}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'tutores'
                      ? 'bg-red-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Vincular Tutores (HU09)</span>
                </button>
                <button
                  onClick={() => setActiveTab('directorio')}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'directorio'
                      ? 'bg-red-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Directorio ({companies.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PESTAÑA 1: FORMULARIO DE RADICACIÓN */}
        {activeTab === 'radicar' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Formulario Principal */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-red-700" />
                  <span>Formulario de Radicación Fiscal</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ingrese la información legal de la empresa. El sistema validará la disponibilidad del NIT antes del registro.
                </p>
              </div>

              {/* Feedback visual: Alerta de Error / NIT Duplicado */}
              {formError && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 animate-fadeIn"
                >
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold">Información de validación</p>
                    <p className="text-amber-800">{formError.message}</p>
                    {formError.code === 'NIT_ALREADY_EXISTS' && (
                      <p className="text-[11px] text-amber-700 mt-1">
                        💡 Verifique en la pestaña de <strong>Directorio</strong> si la empresa ya se encuentra registrada previamente.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback visual: Éxito */}
              {formSuccess && (
                <div
                  role="status"
                  className="p-5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 space-y-3 animate-fadeIn"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm">¡Empresa Radicada Exitosamente!</p>
                      <p className="text-xs text-emerald-800 mt-0.5">
                        La empresa <strong>{formSuccess.businessName}</strong> con NIT <strong>{formSuccess.nit}</strong> ha sido radicada correctamente y se encuentra disponible para asociar tutores y formalizar convenios institucionales.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/80 p-3 rounded-lg border border-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => setActiveTab('directorio')}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800"
                    >
                      <span>Consultar en Directorio</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Formulario */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Fila 1: NIT & Razón Social */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* NIT */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="nit" className="text-xs font-bold text-slate-700">
                        NIT / Identificador Fiscal <span className="text-red-600">*</span>
                      </label>
                      {isCheckingNit && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Verificando...
                        </span>
                      )}
                      {!isCheckingNit && nitStatus.checked && !nitStatus.exists && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> NIT Disponible
                        </span>
                      )}
                      {!isCheckingNit && nitStatus.checked && nitStatus.exists && (
                        <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Ya registrado
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="nit"
                        type="text"
                        placeholder="Ej. 900123456-1"
                        value={formData.nit}
                        onChange={(e) => handleNitChange(e.target.value)}
                        required
                        className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                          formError?.field === 'nit' || nitStatus.exists
                            ? 'border-amber-400 focus:ring-amber-200'
                            : 'border-slate-300 focus:ring-red-200 focus:border-red-600'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Razón Social */}
                  <div className="space-y-1.5">
                    <label htmlFor="businessName" className="text-xs font-bold text-slate-700">
                      Razón Social <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="businessName"
                      type="text"
                      placeholder="Ej. Soluciones Tecnológicas del Oriente S.A.S."
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 transition-all"
                    />
                  </div>
                </div>

                {/* Fila 2: Representante Legal & Correo de Contacto */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Representante Legal */}
                  <div className="space-y-1.5">
                    <label htmlFor="legalRepresentative" className="text-xs font-bold text-slate-700">
                      Representante Legal <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="legalRepresentative"
                      type="text"
                      placeholder="Ej. Ing. María Fernanda Pérez"
                      value={formData.legalRepresentative}
                      onChange={(e) => setFormData({ ...formData, legalRepresentative: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 transition-all"
                    />
                  </div>

                  {/* Correo Electrónico */}
                  <div className="space-y-1.5">
                    <label htmlFor="contactEmail" className="text-xs font-bold text-slate-700">
                      Correo Electrónico de Contacto <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="contactEmail"
                        type="email"
                        placeholder="contacto@empresa.com"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                        required
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Fila 3: Teléfono, Dirección & Ciudad */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Teléfono */}
                  <div className="space-y-1.5">
                    <label htmlFor="contactPhone" className="text-xs font-bold text-slate-700">
                      Teléfono de Contacto <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        id="contactPhone"
                        type="text"
                        placeholder="Ej. (607) 5776655 o 312..."
                        value={formData.contactPhone}
                        onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                        required
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 transition-all"
                      />
                    </div>
                  </div>

                  {/* Dirección */}
                  <div className="space-y-1.5">
                    <label htmlFor="address" className="text-xs font-bold text-slate-700">
                      Dirección Sede Principal <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input
                        id="address"
                        type="text"
                        placeholder="Ej. Av. 0 # 12-34 Barrio Blanco"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        required
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 transition-all"
                      />
                    </div>
                  </div>

                  {/* Ciudad */}
                  <div className="space-y-1.5">
                    <label htmlFor="city" className="text-xs font-bold text-slate-700">
                      Ciudad / Municipio <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="city"
                      type="text"
                      placeholder="Ej. Cúcuta, Los Patios, Bogotá"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 transition-all"
                    />
                  </div>
                </div>

                {/* Botón de Envío */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    <span>Registro institucional seguro</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || isCheckingNit || nitStatus.exists}
                    className="flex items-center gap-2 px-6 py-2.5 bg-red-700 hover:bg-red-800 active:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md shadow-red-700/20 hover:shadow-lg transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Radicando Empresa...</span>
                      </>
                    ) : (
                      <>
                        <PlusCircle className="w-4 h-4" />
                        <span>Radicar Empresa Receptora</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Panel Lateral: Información y Reglas de Negocio */}
            <div className="space-y-6">
              {/* Tarjeta de Trazabilidad */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 text-slate-900 font-bold text-sm">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-700 flex items-center justify-center">
                    <Info className="w-4 h-4" />
                  </div>
                  <span>Información del Proceso</span>
                </div>

                <div className="space-y-3 text-xs text-slate-600">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <p className="font-bold text-slate-800">Unicidad Tributaria (NIT)</p>
                    <p className="text-slate-500 text-[11px]">
                      Cada empresa receptora debe poseer un número de identificación tributaria (NIT) único. El sistema valida la no existencia previa.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <p className="font-bold text-slate-800">Siguiente Paso: Formalización de Convenios</p>
                    <p className="text-slate-500 text-[11px]">
                      Una vez radicada, la empresa queda disponible para la suscripción del convenio marco institucional y asignación de tutores.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <p className="font-bold text-slate-800">Tutores Empresariales</p>
                    <p className="text-slate-500 text-[11px]">
                      Los tutores empresariales podrán vincularse a la empresa radicada para coordinar el seguimiento de los practicantes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tarjeta Resumen Rápido */}
              <div className="bg-gradient-to-br from-red-700 to-red-900 text-white rounded-2xl p-6 shadow-md space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-200">Total Radicadas</span>
                  <Building2 className="w-5 h-5 text-red-200" />
                </div>
                <div className="text-3xl font-black">{companies.length}</div>
                <p className="text-[11px] text-red-100">
                  Empresas registradas en el sistema de prácticas empresariales UFPS.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: DIRECTORIO DE EMPRESAS */}
        {activeTab === 'directorio' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4 p-6">
            {/* Filtros y Buscador */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por NIT, nombre, ciudad..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 transition-all"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Filtrar por ciudad..."
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 transition-all w-full sm:w-44"
                />

                <button
                  onClick={loadCompanies}
                  title="Recargar directorio"
                  className="p-2.5 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-slate-200 hover:border-red-200 transition-all shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingList ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Tabla de Empresas */}
            {isLoadingList ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-600" />
                <p className="text-xs">Cargando directorio de empresas...</p>
              </div>
            ) : companies.length === 0 ? (
              <div className="py-16 text-center text-slate-500 space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800">No se encontraron empresas radicadas</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {searchTerm || cityFilter
                      ? 'Pruebe con otros criterios de búsqueda'
                      : 'Comience radicando la primera empresa receptora.'}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('radicar')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-xs font-bold rounded-xl shadow hover:bg-red-800 transition-all"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Radicar Empresa</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">NIT / Identificador</th>
                      <th className="py-3 px-4">Razón Social & Representante</th>
                      <th className="py-3 px-4">Contacto & Ubicación</th>
                      <th className="py-3 px-4">Estado Convenio (HU08)</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {companies.map((company) => (
                      <tr key={company.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* NIT */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {company.nit}
                            </span>
                            <button
                              onClick={() => copyToClipboard(company.nit)}
                              title="Copiar NIT"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            >
                              {copiedNit === company.nit ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Radicada: {new Date(company.createdAt).toLocaleDateString()}
                          </span>
                        </td>

                        {/* Razón Social & Rep Legal */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{company.businessName}</div>
                          <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                            <UserCheck className="w-3 h-3 text-slate-400" />
                            <span>Rep: {company.legalRepresentative}</span>
                          </div>
                        </td>

                        {/* Contacto & Ubicación */}
                        <td className="py-3 px-4">
                          <div className="text-slate-700 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>{company.contactEmail}</span>
                          </div>
                          <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>
                              {company.city} • {company.address}
                            </span>
                          </div>
                        </td>

                        {/* Estado Convenio */}
                        <td className="py-3 px-4">
                          {company.activeAgreement ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Convenio Vigente ({company.activeAgreement.agreementNumber})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="w-3 h-3" /> Sin Convenio Vigente
                            </span>
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                            {canRegisterCompany && (
                              <>
                                <button
                                  onClick={() => handleOpenEditCompany(company)}
                                  title="Editar empresa y gestionar Convenio Marco (HU08)"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-all cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Editar / Convenio</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedTutorCompanyId(company.id);
                                    setTutorError(null);
                                    setTutorSuccess(null);
                                    setActiveTab('tutores');
                                  }}
                                  title="Vincular supervisores inmediatos a esta empresa (HU09)"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-all cursor-pointer"
                                >
                                  <UserPlus className="w-3 h-3" />
                                  <span>Tutores ({company.tutorsCount ?? 0})</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteCompany(company.id, company.businessName)}
                                  title="Dar de baja empresa"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => copyToClipboard(company.id)}
                              title="Copiar ID de Empresa"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition-all"
                            >
                              <span>ID</span>
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 3: VINCULACIÓN DE TUTORES EMPRESARIALES (HU09 / CU09) */}
        {activeTab === 'tutores' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Formulario de Registro y Vinculación del Supervisor Inmediato */}
            <div className="lg:col-span-1 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1.5">
                  <span>CU09 • Evaluación Directa</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-red-700" />
                  <span>Vincular Supervisor Inmediato</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Asocie supervisores inmediatos a la empresa para que ejerzan como evaluadores directos del desempeño del estudiante.
                </p>
              </div>

              {/* Alerta de Error (Criterio 2: chk_correo_tutor_valido / uq_tutor_email / uq_tutor_documento_empresa) */}
              {tutorError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold">Validación de Registro (400 Bad Request)</p>
                    <p className="text-amber-800">{tutorError.message}</p>
                    {tutorError.constraint && (
                      <span className="inline-block font-mono text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                        Constraint: {tutorError.constraint}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Alerta de Éxito (Criterio 1: 201 Created con estado "Activo") */}
              {tutorSuccess && (
                <div
                  role="status"
                  className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 space-y-2"
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-bold">¡Supervisor Vinculado Exitosamente! (201 Created)</p>
                      <p className="text-emerald-800">
                        <strong>{tutorSuccess.nombre}</strong> ({tutorSuccess.cargo}) ha sido asociado en{' '}
                        <code className="font-mono">tutores_empresariales</code> con estado{' '}
                        <span className="font-bold underline">{tutorSuccess.estado}</span> y ya está disponible en el selector de evaluadores directos.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleRegisterTutor} className="space-y-4">
                {/* Selector de Empresa Receptora */}
                <div className="space-y-1.5">
                  <label htmlFor="tutorCompanyId" className="text-xs font-bold text-slate-700">
                    Empresa Receptora <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="tutorCompanyId"
                    value={selectedTutorCompanyId}
                    onChange={(e) => {
                      setSelectedTutorCompanyId(e.target.value);
                      setTutorError(null);
                      setTutorSuccess(null);
                    }}
                    disabled={currentUser?.role === 'TUTOR_EMPRESARIAL' && !!currentUser?.companyId}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                  >
                    <option value="">Seleccione una empresa activa...</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName} (NIT: {c.nit})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nombre Completo del Supervisor */}
                <div className="space-y-1.5">
                  <label htmlFor="tutorNombre" className="text-xs font-bold text-slate-700">
                    Nombre Completo del Supervisor <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="tutorNombre"
                    type="text"
                    placeholder="Ej. Ing. Carolina Martínez"
                    value={tutorForm.nombre}
                    onChange={(e) => setTutorForm({ ...tutorForm, nombre: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                  />
                </div>

                {/* Cargo del Supervisor */}
                <div className="space-y-1.5">
                  <label htmlFor="tutorCargo" className="text-xs font-bold text-slate-700">
                    Cargo en la Organización <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="tutorCargo"
                    type="text"
                    placeholder="Ej. Líder Técnico de Ingeniería / Jefe de TI"
                    value={tutorForm.cargo}
                    onChange={(e) => setTutorForm({ ...tutorForm, cargo: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                  />
                </div>

                {/* Correo Institucional / Corporativo */}
                <div className="space-y-1.5">
                  <label htmlFor="tutorCorreo" className="text-xs font-bold text-slate-700">
                    Correo Electrónico Institucional <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="tutorCorreo"
                      type="text"
                      placeholder="supervisor@empresa.co"
                      value={tutorForm.correo}
                      onChange={(e) => setTutorForm({ ...tutorForm, correo: e.target.value })}
                      required
                      className={`w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 ${
                        tutorError?.field === 'email'
                          ? 'border-amber-400 focus:ring-amber-200'
                          : 'border-slate-300 focus:ring-red-200 focus:border-red-600'
                      }`}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Validado por <code className="font-mono">chk_correo_tutor_valido</code> y <code className="font-mono">uq_tutor_email</code>.
                  </p>
                </div>

                {/* Documento de Identidad */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <label htmlFor="tutorTipoDoc" className="text-xs font-bold text-slate-700">
                      Tipo Doc.
                    </label>
                    <select
                      id="tutorTipoDoc"
                      value={tutorForm.tipoDocumento}
                      onChange={(e) => setTutorForm({ ...tutorForm, tipoDocumento: e.target.value })}
                      className="w-full px-2.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                    >
                      <option value="CC">CC</option>
                      <option value="CE">CE</option>
                      <option value="PA">PA</option>
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label htmlFor="tutorDocumento" className="text-xs font-bold text-slate-700">
                      Número de Documento <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="tutorDocumento"
                      type="text"
                      placeholder="Ej. 1090456789"
                      value={tutorForm.documento}
                      onChange={(e) => setTutorForm({ ...tutorForm, documento: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                    />
                  </div>
                </div>

                {/* Teléfono */}
                <div className="space-y-1.5">
                  <label htmlFor="tutorTelefono" className="text-xs font-bold text-slate-700">
                    Teléfono de Contacto (Opcional)
                  </label>
                  <input
                    id="tutorTelefono"
                    type="text"
                    placeholder="Ej. 315 234 5678"
                    value={tutorForm.telefono}
                    onChange={(e) => setTutorForm({ ...tutorForm, telefono: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingTutor}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-red-700/20 transition-all cursor-pointer"
                >
                  {isSubmittingTutor ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Vinculando Supervisor...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Confirmar Vinculación de Supervisor</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Listado de Supervisores Vinculados a la Empresa (Evaluadores Directos Disponibles) */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-red-700" />
                    <span>Supervisores Inmediatos Vinculados (Evaluadores Directos)</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supervisores con estado <strong>Activo</strong> habilitados en el selector de formalización y seguimiento de prácticas.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/estudiantes"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all"
                  >
                    <span>Asignar a Practicante</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => loadCompanyTutors()}
                    title="Actualizar supervisores"
                    className="p-2 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-slate-200 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingTutors ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {isLoadingTutors ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-600" />
                  <p className="text-xs">Consultando supervisores vinculados...</p>
                </div>
              ) : companyTutors.length === 0 ? (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <Users className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-sm text-slate-800">No hay supervisores vinculados para esta empresa</p>
                  <p className="text-xs text-slate-400">
                    Utilice el formulario izquierdo para asociar el primer supervisor inmediato como evaluador directo.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Supervisor & Cargo</th>
                        <th className="py-3 px-4">Documento</th>
                        <th className="py-3 px-4">Correo Institucional</th>
                        <th className="py-3 px-4">Empresa Vinculada</th>
                        <th className="py-3 px-4 text-right">Estado / Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {companyTutors.map((tutor) => (
                        <tr key={tutor.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{tutor.nombre}</div>
                            <div className="text-[11px] text-red-700 font-semibold mt-0.5 flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              <span>{tutor.cargo}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {tutor.tipoDocumento} {tutor.documento}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              <span>{tutor.correo}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {tutor.company?.businessName || 'Empresa Vinculada'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> {tutor.estado}
                              </span>
                              {canRegisterCompany && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTutor(tutor)}
                                    title="Editar tutor empresarial"
                                    className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTutor(tutor.id, tutor.nombre)}
                                    title="Dar de baja tutor"
                                    className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Edición de Empresa y Convenio Marco (HU07 / HU08) */}
        {editingCompany && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-red-800 to-red-700 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-5 h-5" />
                  <h3 className="font-bold text-base">Editar Empresa y Convenio Marco (HU08)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="text-red-100 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditCompany} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
                {editCompanyError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                    {editCompanyError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">NIT *</label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.nit}
                      onChange={(e) => setEditCompanyData({ ...editCompanyData, nit: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Razón Social *</label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.businessName}
                      onChange={(e) => setEditCompanyData({ ...editCompanyData, businessName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Representante Legal *</label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.legalRepresentative}
                      onChange={(e) => setEditCompanyData({ ...editCompanyData, legalRepresentative: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Correo de Contacto *</label>
                    <input
                      type="email"
                      required
                      value={editCompanyData.contactEmail}
                      onChange={(e) => setEditCompanyData({ ...editCompanyData, contactEmail: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono *</label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.contactPhone}
                      onChange={(e) => setEditCompanyData({ ...editCompanyData, contactPhone: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ciudad *</label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.city}
                      onChange={(e) => setEditCompanyData({ ...editCompanyData, city: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Dirección *</label>
                    <input
                      type="text"
                      required
                      value={editCompanyData.address}
                      onChange={(e) => setEditCompanyData({ ...editCompanyData, address: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                {/* Sección Convenio Marco (HU08) */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-red-700" />
                      Convenio Marco Institucional (HU08)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Habilita Convocatorias y Prácticas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Número de Convenio</label>
                      <input
                        type="text"
                        value={editCompanyData.agreementNumber}
                        onChange={(e) => setEditCompanyData({ ...editCompanyData, agreementNumber: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Estado del Convenio</label>
                      <select
                        value={editCompanyData.agreementStatus}
                        onChange={(e) => setEditCompanyData({ ...editCompanyData, agreementStatus: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="VIGENTE">VIGENTE</option>
                        <option value="EN_TRAMITE">EN TRÁMITE</option>
                        <option value="VENCIDO">VENCIDO</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Fecha Inicio</label>
                      <input
                        type="date"
                        value={editCompanyData.agreementStartDate}
                        onChange={(e) => setEditCompanyData({ ...editCompanyData, agreementStartDate: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Fecha Vencimiento</label>
                      <input
                        type="date"
                        value={editCompanyData.agreementEndDate}
                        onChange={(e) => setEditCompanyData({ ...editCompanyData, agreementEndDate: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Minuta / Documento de Convenio (PDF o URL)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="https://... o suba archivo adjunto"
                        value={editCompanyData.agreementDocumentUrl}
                        onChange={(e) => setEditCompanyData({ ...editCompanyData, agreementDocumentUrl: e.target.value })}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingAgreementDoc ? 'Subiendo...' : 'Subir Archivo'}</span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg"
                          onChange={handleUploadAgreementPdf}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingCompany(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCompany}
                    className="px-5 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-sm disabled:opacity-50"
                  >
                    {isSavingCompany ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Edición de Tutor Empresarial (HU09) */}
        {editingTutor && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
              <div className="bg-gradient-to-r from-red-800 to-red-700 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  <h3 className="font-bold text-sm">Editar Supervisor Empresarial</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTutor(null)}
                  className="text-red-100 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSaveEditTutor} className="p-5 space-y-3.5">
                {editTutorError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                    {editTutorError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    value={editTutorData.nombre}
                    onChange={(e) => setEditTutorData({ ...editTutorData, nombre: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cargo Empresarial *</label>
                  <input
                    type="text"
                    required
                    value={editTutorData.cargo}
                    onChange={(e) => setEditTutorData({ ...editTutorData, cargo: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Correo Institucional *</label>
                  <input
                    type="email"
                    required
                    value={editTutorData.correo}
                    onChange={(e) => setEditTutorData({ ...editTutorData, correo: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Documento</label>
                    <input
                      type="text"
                      value={editTutorData.numeroDocumento}
                      onChange={(e) => setEditTutorData({ ...editTutorData, numeroDocumento: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={editTutorData.telefono}
                      onChange={(e) => setEditTutorData({ ...editTutorData, telefono: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingTutor(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTutor}
                    className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl"
                  >
                    {isSavingTutor ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">SIGETRAP • Sistema de Gestión y Trazabilidad de Prácticas Empresariales</p>
        <p className="text-slate-400 mt-1">Programa de Ingeniería de Sistemas • Universidad Francisco de Paula Santander</p>
      </footer>
    </div>
  );
}
