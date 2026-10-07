'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import {
  Briefcase,
  Building2,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Search,
  MapPin,
  Clock,
  Users,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  GraduationCap,
  FileCheck2,
  Lock,
  ArrowRight,
  Info,
  Calendar,
  X,
  FileCheck,
  Plus,
  Send,
  Layers,
  AlertCircle,
  Check,
  Mail,
  Phone,
} from 'lucide-react';
import {
  VacancyResponseDTO,
  StudentEligibilityDTO,
  ApplicationResponseDTO,
  UserResponseDTO,
  CompanyResponseDTO,
} from '@/types';

export default function VacantesPage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Tabs: 'vacantes' | 'mis-postulaciones' | 'mis-convocatorias'
  const [activeTab, setActiveTab] = useState<'vacantes' | 'mis-postulaciones' | 'mis-convocatorias'>('vacantes');

  // Estado de elegibilidad del estudiante
  const [eligibility, setEligibility] = useState<StudentEligibilityDTO | null>(null);
  const [isLoadingEligibility, setIsLoadingEligibility] = useState(false);

  // Listado de vacantes públicas
  const [vacancies, setVacancies] = useState<VacancyResponseDTO[]>([]);
  const [isLoadingVacancies, setIsLoadingVacancies] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');

  // Mis postulaciones (para estudiantes)
  const [myApplications, setMyApplications] = useState<ApplicationResponseDTO[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);

  // Mis convocatorias (para entidades empleadoras y administradores)
  const [myCompanyVacancies, setMyCompanyVacancies] = useState<VacancyResponseDTO[]>([]);
  const [isLoadingCompanyVacancies, setIsLoadingCompanyVacancies] = useState(false);
  const [publishingVacancyId, setPublishingVacancyId] = useState<string | null>(null);

  // Modal de postulación (estudiantes)
  const [selectedVacancy, setSelectedVacancy] = useState<VacancyResponseDTO | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cvMethod, setCvMethod] = useState<'upload' | 'url'>('upload');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvUrl, setCvUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Modal de creación de convocatoria (entidades empleadoras / administradores)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [companiesList, setCompaniesList] = useState<CompanyResponseDTO[]>([]);
  const [newVacancy, setNewVacancy] = useState({
    companyId: '',
    title: '',
    program: 'Ingeniería de Sistemas',
    academicPeriod: '2026-1',
    vacanciesCount: 1,
    description: '',
    requirements: '',
    location: '',
    startDate: '',
    endDate: '',
    status: 'PUBLICADA' as 'PUBLICADA' | 'BORRADOR',
  });
  const [isCreatingVacancy, setIsCreatingVacancy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Modal de visualización de candidatos / postulados (Tutor empresarial / Admin)
  const [selectedVacancyForApplicants, setSelectedVacancyForApplicants] = useState<VacancyResponseDTO | null>(null);
  const [applicantsList, setApplicantsList] = useState<ApplicationResponseDTO[]>([]);
  const [isLoadingApplicants, setIsLoadingApplicants] = useState(false);
  const [isApplicantsModalOpen, setIsApplicantsModalOpen] = useState(false);

  const isEmployerOrAdmin =
    currentUser?.role === 'TUTOR_EMPRESARIAL' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'DIRECTOR_PROGRAMA';

  const handleOpenApplicantsModal = async (vacancy: VacancyResponseDTO) => {
    setSelectedVacancyForApplicants(vacancy);
    setIsApplicantsModalOpen(true);
    setIsLoadingApplicants(true);
    try {
      const res = await fetch(`/api/v1/postulaciones?vacancyId=${vacancy.id}`);
      const data = await res.json();
      if (data.success && data.data) {
        setApplicantsList(data.data.items || []);
      } else {
        setApplicantsList([]);
      }
    } catch (e) {
      console.error('Error cargando candidatos:', e);
      setApplicantsList([]);
    } finally {
      setIsLoadingApplicants(false);
    }
  };

  // Cargar usuario autenticado
  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
          if (data.data.companyId) {
            setNewVacancy((prev) => ({ ...prev, companyId: data.data.companyId }));
          }
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setIsCheckingAuth(false));
  }, []);

  // Cargar elegibilidad si es estudiante
  const loadEligibility = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'ESTUDIANTE') return;
    setIsLoadingEligibility(true);
    try {
      const res = await fetch('/api/v1/estudiantes/elegibilidad');
      const data = await res.json();
      if (data.success && data.data) {
        setEligibility(data.data);
      }
    } catch (e) {
      console.error('Error cargando elegibilidad:', e);
    } finally {
      setIsLoadingEligibility(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === 'ESTUDIANTE') {
      loadEligibility();
    }
  }, [currentUser, loadEligibility]);

  // Cargar vacantes públicas con filtros
  const loadVacancies = useCallback(async () => {
    setIsLoadingVacancies(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (cityFilter) params.append('city', cityFilter);
      if (programFilter) params.append('program', programFilter);
      if (periodFilter) params.append('academicPeriod', periodFilter);

      const res = await fetch(`/api/v1/vacantes?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.data) {
        setVacancies(data.data.vacancies || []);
      }
    } catch (e) {
      console.error('Error cargando vacantes:', e);
    } finally {
      setIsLoadingVacancies(false);
    }
  }, [searchTerm, cityFilter, programFilter, periodFilter]);

  useEffect(() => {
    loadVacancies();
  }, [loadVacancies]);

  // Cargar mis postulaciones
  const loadMyApplications = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'ESTUDIANTE') return;
    setIsLoadingApplications(true);
    try {
      const res = await fetch('/api/v1/postulaciones/mis-postulaciones');
      const data = await res.json();
      if (data.success && data.data) {
        setMyApplications(data.data || []);
      }
    } catch (e) {
      console.error('Error cargando postulaciones:', e);
    } finally {
      setIsLoadingApplications(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === 'mis-postulaciones' && currentUser?.role === 'ESTUDIANTE') {
      loadMyApplications();
    }
  }, [activeTab, currentUser, loadMyApplications]);

  // Cargar convocatorias de la empresa / mis convocatorias
  const loadCompanyVacancies = useCallback(async () => {
    if (!isEmployerOrAdmin) return;
    setIsLoadingCompanyVacancies(true);
    try {
      if (currentUser?.companyId) {
        const res = await fetch(`/api/v1/empresas/${currentUser.companyId}/vacantes`);
        const data = await res.json();
        if (data.success && data.data) {
          setMyCompanyVacancies(data.data || []);
        }
      } else if (currentUser?.role === 'ADMIN' || currentUser?.role === 'DIRECTOR_PROGRAMA') {
        // El admin puede ver todas las vacantes
        const res = await fetch('/api/v1/vacantes?limit=100');
        const data = await res.json();
        if (data.success && data.data) {
          setMyCompanyVacancies(data.data.vacancies || []);
        }
      }
    } catch (e) {
      console.error('Error cargando convocatorias de empresa:', e);
    } finally {
      setIsLoadingCompanyVacancies(false);
    }
  }, [currentUser, isEmployerOrAdmin]);

  useEffect(() => {
    if (activeTab === 'mis-convocatorias' && isEmployerOrAdmin) {
      loadCompanyVacancies();
    }
  }, [activeTab, isEmployerOrAdmin, loadCompanyVacancies]);

  // Cargar lista de empresas si es admin para el modal de creación
  const loadCompaniesList = async () => {
    if (companiesList.length > 0) return;
    try {
      const res = await fetch('/api/v1/empresas?limit=50');
      const data = await res.json();
      if (data.success && data.data) {
        setCompaniesList(data.data.companies || []);
      }
    } catch (e) {
      console.error('Error cargando lista de empresas:', e);
    }
  };

  // Manejo de apertura de modal de postulación
  const handleOpenApplyModal = (vacancy: VacancyResponseDTO) => {
    setSelectedVacancy(vacancy);
    setCvFile(null);
    setCvUrl('');
    setNotes('');
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsModalOpen(true);
  };

  // Manejo de apertura de modal de creación de convocatoria
  const handleOpenCreateModal = () => {
    setNewVacancy({
      companyId: currentUser?.companyId || '',
      title: '',
      program: 'Ingeniería de Sistemas',
      academicPeriod: '2026-1',
      vacanciesCount: 1,
      description: '',
      requirements: '',
      location: 'Cúcuta',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      status: 'PUBLICADA',
    });
    setCreateError(null);
    setCreateSuccess(null);
    if (!currentUser?.companyId) {
      loadCompaniesList();
    }
    setIsCreateModalOpen(true);
  };

  // Crear convocatoria
  const handleCreateVacancy = async (statusToSet: 'BORRADOR' | 'PUBLICADA') => {
    setCreateError(null);
    setCreateSuccess(null);

    if (!newVacancy.title.trim()) {
      setCreateError('El título de la convocatoria es obligatorio');
      return;
    }
    if (!newVacancy.description.trim() || newVacancy.description.trim().length < 10) {
      setCreateError('La descripción del rol debe tener al menos 10 caracteres');
      return;
    }
    if (!newVacancy.requirements.trim() || newVacancy.requirements.trim().length < 5) {
      setCreateError('El perfil de practicante idóneo y requisitos son obligatorios (mínimo 5 caracteres)');
      return;
    }
    if (!newVacancy.academicPeriod.trim()) {
      setCreateError('El periodo académico específico es obligatorio (ej: 2026-1)');
      return;
    }
    if (newVacancy.vacanciesCount < 1) {
      setCreateError('El número de cupos disponibles debe ser al menos 1');
      return;
    }
    if (!currentUser?.companyId && !newVacancy.companyId) {
      setCreateError('Debe seleccionar la empresa receptora para la convocatoria');
      return;
    }

    setIsCreatingVacancy(true);
    try {
      const payload = {
        title: newVacancy.title.trim(),
        program: newVacancy.program.trim(),
        academicPeriod: newVacancy.academicPeriod.trim(),
        vacanciesCount: Number(newVacancy.vacanciesCount),
        description: newVacancy.description.trim(),
        requirements: newVacancy.requirements.trim(),
        location: newVacancy.location.trim() || undefined,
        startDate: newVacancy.startDate || undefined,
        endDate: newVacancy.endDate || undefined,
        companyId: currentUser?.companyId || newVacancy.companyId,
        status: statusToSet,
      };

      const res = await fetch('/api/v1/vacantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al registrar la convocatoria');
      }

      setCreateSuccess(
        statusToSet === 'PUBLICADA'
          ? '¡Convocatoria creada y publicada exitosamente! Ya se encuentra disponible para la captación de practicantes idóneos.'
          : '¡Convocatoria guardada exitosamente en estado BORRADOR! Podrás publicarla una vez cuentes con convenio institucional activo.'
      );

      loadVacancies();
      loadCompanyVacancies();

      setTimeout(() => {
        setIsCreateModalOpen(false);
        setActiveTab('mis-convocatorias');
      }, 1500);
    } catch (err: any) {
      setCreateError(err.message || 'Error inesperado al crear la convocatoria');
    } finally {
      setIsCreatingVacancy(false);
    }
  };

  // Publicar convocatoria en borrador
  const handlePublishDraft = async (vacancyId: string) => {
    setPublishingVacancyId(vacancyId);
    try {
      const res = await fetch(`/api/v1/vacantes/${vacancyId}/publicar`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error?.message || 'No se pudo publicar la convocatoria');
        return;
      }
      alert('¡Convocatoria publicada exitosamente! Cumple con la regla RN-01 de convenio institucional vigente.');
      loadCompanyVacancies();
      loadVacancies();
    } catch (err: any) {
      alert(err.message || 'Error al conectar con el servidor');
    } finally {
      setPublishingVacancyId(null);
    }
  };

  // Envío de postulación (estudiantes)
  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVacancy) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      let finalCvUrl = cvUrl.trim();

      if (cvMethod === 'upload') {
        if (!cvFile) {
          setSubmitError('Por favor selecciona un archivo PDF de hoja de vida');
          setIsSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', cvFile);

        const uploadRes = await fetch('/api/v1/upload/cv', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error?.message || 'Error al subir la hoja de vida');
        }

        finalCvUrl = uploadData.data.cvUrl;
      } else {
        if (!finalCvUrl) {
          setSubmitError('Por favor ingresa la URL o enlace a tu hoja de vida');
          setIsSubmitting(false);
          return;
        }
      }

      const res = await fetch(`/api/v1/vacantes/${selectedVacancy.id}/postular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvUrl: finalCvUrl,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al radicar la postulación');
      }

      setSubmitSuccess(
        '¡Postulación radicada con éxito! Tu hoja de vida ha sido adjuntada para el proceso de preselección empresarial.'
      );
      loadVacancies();
      loadMyApplications();
    } catch (err: any) {
      setSubmitError(err.message || 'Error inesperado al postularse');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAlreadyApplied = (vacancyId: string) => {
    return myApplications.some((app) => app.vacancyId === vacancyId);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner de Cabecera */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-red-50/70 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 w-2.5 h-full bg-red-700" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider mb-3">
                <Briefcase className="w-3.5 h-3.5" />
                <span>Convocatorias y Vacantes de Prácticas</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Gestión y Postulación a Convocatorias Empresariales
              </h1>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
                Convocatorias vinculadas a programas académicos y periodos específicos para captar perfiles de practicantes idóneos, garantizando convenios institucionales vigentes (RN-01).
              </p>
            </div>

            {/* Acciones y Pestañas */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              {isEmployerOrAdmin && (
                <button
                  onClick={handleOpenCreateModal}
                  className="px-5 py-2.5 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-700/20 transition-all cursor-pointer hover:shadow-xl hover:-translate-y-0.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Convocatoria</span>
                </button>
              )}

              {/* Selector de Pestañas */}
              <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shrink-0">
                <button
                  onClick={() => setActiveTab('vacantes')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'vacantes'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Ofertas Abiertas</span>
                </button>

                {currentUser?.role === 'ESTUDIANTE' && (
                  <button
                    onClick={() => setActiveTab('mis-postulaciones')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'mis-postulaciones'
                        ? 'bg-white text-red-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Mis Postulaciones</span>
                    {myApplications.length > 0 && (
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 font-extrabold text-[10px] flex items-center justify-center">
                        {myApplications.length}
                      </span>
                    )}
                  </button>
                )}

                {isEmployerOrAdmin && (
                  <button
                    onClick={() => setActiveTab('mis-convocatorias')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'mis-convocatorias'
                        ? 'bg-white text-red-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Gestión Empresarial</span>
                    {myCompanyVacancies.length > 0 && (
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 font-extrabold text-[10px] flex items-center justify-center">
                        {myCompanyVacancies.length}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tarjeta de Elegibilidad del Estudiante */}
        {currentUser?.role === 'ESTUDIANTE' && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    eligibility?.isEligible
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}
                >
                  {eligibility?.isEligible ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Estado de Elegibilidad Académica</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold uppercase border ${
                        eligibility?.isEligible
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      {eligibility?.isEligible ? 'Elegible para Postulación' : 'No Elegible Aún'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Estudiante: <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.studentCode || 'Sin código'})
                  </p>
                </div>
              </div>

              {/* Badges de Criterios */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-slate-500 font-medium">Créditos Aprobados: </span>
                  <strong className={eligibility && (eligibility.approvedCredits ?? 0) >= eligibility.requiredCredits ? 'text-emerald-700' : 'text-amber-700'}>
                    {eligibility?.approvedCredits ?? 0} / {eligibility?.requiredCredits ?? 100} mín.
                  </strong>
                </div>
                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-slate-500 font-medium">Promedio: </span>
                  <strong className={eligibility && (eligibility.academicAverage ?? 0) >= (eligibility.minimumAverage ?? 0) ? 'text-emerald-700' : 'text-slate-700'}>
                    {eligibility?.academicAverage !== undefined && eligibility?.academicAverage !== null ? eligibility.academicAverage.toFixed(2) : 'N/A'} / {(eligibility?.minimumAverage ?? 3.0).toFixed(1)} mín.
                  </strong>
                </div>
              </div>
            </div>

            {/* Motivos si no es elegible */}
            {!eligibility?.isEligible && eligibility?.reasons && eligibility.reasons.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Condiciones pendientes para participar en prácticas:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-700">
                  {eligibility.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO DE PESTAÑA: VACANTES DISPONIBLES */}
        {activeTab === 'vacantes' && (
          <div className="space-y-6">
            {/* Buscador y Filtros */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar vacante por cargo, perfil, palabras clave o empresa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full md:w-auto">
                <select
                  value={programFilter}
                  onChange={(e) => setProgramFilter(e.target.value)}
                  className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 text-slate-700"
                >
                  <option value="">Todos los programas</option>
                  <option value="Ingeniería de Sistemas">Ingeniería de Sistemas</option>
                  <option value="Ingeniería Electrónica">Ingeniería Electrónica</option>
                  <option value="Ingeniería Industrial">Ingeniería Industrial</option>
                </select>

                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 text-slate-700"
                >
                  <option value="">Todos los periodos</option>
                  <option value="2026-1">Periodo 2026-1</option>
                  <option value="2026-2">Periodo 2026-2</option>
                  <option value="2025-2">Periodo 2025-2</option>
                </select>

                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 text-slate-700"
                >
                  <option value="">Todas las ciudades</option>
                  <option value="Cúcuta">Cúcuta</option>
                  <option value="Bogotá">Bogotá D.C.</option>
                  <option value="Medellín">Medellín</option>
                  <option value="Bucaramanga">Bucaramanga</option>
                </select>
              </div>
            </div>

            {/* Listado de Tarjetas de Vacantes */}
            {isLoadingVacancies ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-red-700 border-t-transparent" />
                <p className="mt-2 text-xs font-semibold text-slate-600">Cargando ofertas de práctica...</p>
              </div>
            ) : vacancies.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
                <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl mx-auto flex items-center justify-center">
                  <Briefcase className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800">No se encontraron convocatorias abiertas</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  En este momento no hay vacantes disponibles que coincidan con los filtros seleccionados o con empresas que cuenten con convenio vigente.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {vacancies.map((vacancy) => {
                  const applied = isAlreadyApplied(vacancy.id);
                  const canApply =
                    currentUser?.role === 'ESTUDIANTE' &&
                    eligibility?.isEligible &&
                    !applied &&
                    vacancy.availableSlots > 0;

                  return (
                    <div
                      key={vacancy.id}
                      className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                    >
                      <div className="space-y-4">
                        {/* Badges superiores */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Convenio Vigente RN-01</span>
                          </span>

                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" />
                            <span>{vacancy.program || 'Ingeniería de Sistemas'}</span>
                          </span>

                          {vacancy.academicPeriod && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>Periodo: {vacancy.academicPeriod}</span>
                            </span>
                          )}
                        </div>

                        {/* Cabecera de la tarjeta */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="text-lg font-bold text-slate-900 group-hover:text-red-700 transition-colors">
                              {vacancy.title}
                            </h2>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              <strong className="text-slate-800">{vacancy.company.businessName}</strong>
                              <span>•</span>
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span>{vacancy.company.city}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                              {vacancy.availableSlots} de {vacancy.vacanciesCount} {vacancy.vacanciesCount === 1 ? 'cupo' : 'cupos'}
                            </span>
                          </div>
                        </div>

                        {/* Descripción y Requisitos */}
                        <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                          <p className="line-clamp-2">{vacancy.description}</p>
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                            <span className="font-bold text-slate-800 text-[11px] block">Perfil Idóneo y Requisitos:</span>
                            <p className="text-[11px] text-slate-600 line-clamp-2">{vacancy.requirements}</p>
                          </div>
                        </div>
                      </div>

                      {/* Footer de la tarjeta y Botón de Postulación */}
                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>{vacancy.applicationsCount} postulado(s)</span>
                        </div>

                        {applied ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Ya te postulaste</span>
                          </div>
                        ) : currentUser?.role === 'ESTUDIANTE' ? (
                          <button
                            onClick={() => handleOpenApplyModal(vacancy)}
                            disabled={!canApply}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                              canApply
                                ? 'bg-red-700 hover:bg-red-800 active:bg-red-900 text-white shadow-md shadow-red-700/20'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Postularme</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold">
                            <Check className="w-3.5 h-3.5 text-slate-500" />
                            <span>Convocatoria Abierta</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO DE PESTAÑA: MIS POSTULACIONES */}
        {activeTab === 'mis-postulaciones' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-1">
                Seguimiento de Preselección Empresarial
              </h2>
              <p className="text-xs text-slate-500 mb-6">
                Historial de tus postulaciones a convocatorias de práctica y estado de tu hoja de vida.
              </p>

              {isLoadingApplications ? (
                <div className="p-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-red-700 border-t-transparent" />
                  <p className="mt-2 text-xs font-semibold text-slate-600">Cargando postulaciones...</p>
                </div>
              ) : myApplications.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-3">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">Aún no te has postulado a ninguna vacante</p>
                  <button
                    onClick={() => setActiveTab('vacantes')}
                    className="px-4 py-2 bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Ver Vacantes Ofertadas
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {myApplications.map((app) => (
                    <div key={app.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{app.vacancy?.title}</h3>
                          <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {app.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{app.vacancy?.company.businessName}</span>
                          <span>•</span>
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{new Date(app.createdAt).toLocaleDateString()}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {app.cvUrl && (
                          <a
                            href={app.cvUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-red-300 hover:bg-red-50 text-xs font-bold text-slate-700 hover:text-red-700 rounded-xl transition-all"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Ver Hoja de Vida</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">
                          En Preselección
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTENIDO DE PESTAÑA: GESTIÓN EMPRESARIAL (MIS CONVOCATORIAS) */}
        {activeTab === 'mis-convocatorias' && isEmployerOrAdmin && (
          <div className="space-y-6">
            {/* Aviso informativo de RN-01 */}
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-3">
              <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs text-indigo-900 leading-relaxed">
                <strong className="font-bold">Regla RN-01: Publicación de Ofertas con Convenio Vigente</strong>
                <p className="mt-0.5 text-indigo-800">
                  Las entidades empleadoras pueden registrar convocatorias en estado <strong>BORRADOR</strong> en cualquier momento. Para realizar la <strong>PUBLICACIÓN</strong> a estudiantes, la empresa receptora debe poseer un convenio institucional activo y no vencido registrado en el sistema.
                </p>
              </div>
            </div>

            {/* Panel de Convocatorias Empresariales */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Convocatorias Registradas
                  </h2>
                  <p className="text-xs text-slate-500">
                    {currentUser?.company ? (
                      <>Empresa: <strong className="text-slate-800">{currentUser.company.businessName}</strong> (NIT: {currentUser.company.nit})</>
                    ) : (
                      'Gestión integral de convocatorias de práctica empresarial'
                    )}
                  </p>
                </div>

                <button
                  onClick={handleOpenCreateModal}
                  className="px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Convocatoria</span>
                </button>
              </div>

              {isLoadingCompanyVacancies ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-red-700 border-t-transparent" />
                  <p className="mt-2 text-xs font-semibold text-slate-600">Cargando convocatorias empresariales...</p>
                </div>
              ) : myCompanyVacancies.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl space-y-4">
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl mx-auto flex items-center justify-center">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">No hay convocatorias registradas</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      Crea tu primera convocatoria vinculada al programa académico y periodo para iniciar la captación de practicantes idóneos.
                    </p>
                  </div>
                  <button
                    onClick={handleOpenCreateModal}
                    className="px-5 py-2.5 bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-red-800 transition-all inline-flex items-center gap-2 shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Convocatoria Ahora</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {myCompanyVacancies.map((vac) => {
                    const isDraft = vac.status === 'BORRADOR';
                    const isPublished = vac.status === 'PUBLICADA';

                    return (
                      <div
                        key={vac.id}
                        className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white shadow-sm flex flex-col justify-between space-y-4 transition-all"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {isDraft ? (
                                <span className="text-[10px] uppercase font-extrabold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Borrador</span>
                                </span>
                              ) : isPublished ? (
                                <span className="text-[10px] uppercase font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>Publicada</span>
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                  {vac.status}
                                </span>
                              )}

                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {vac.program}
                              </span>

                              {vac.academicPeriod && (
                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                  Periodo: {vac.academicPeriod}
                                </span>
                              )}
                            </div>

                            <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                              {vac.vacanciesCount} {vac.vacanciesCount === 1 ? 'cupo' : 'cupos'}
                            </span>
                          </div>

                          <div>
                            <h3 className="text-base font-bold text-slate-900">{vac.title}</h3>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{vac.description}</p>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px] text-slate-600">
                            <strong className="text-slate-800 block mb-0.5">Perfil Requerido:</strong>
                            <p className="line-clamp-2">{vac.requirements}</p>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          <button
                            onClick={() => handleOpenApplicantsModal(vac)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Ver Candidatos ({vac.applicationsCount})</span>
                          </button>

                          {isDraft && (
                            <button
                              onClick={() => handlePublishDraft(vac.id)}
                              disabled={publishingVacancyId === vac.id}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                            >
                              {publishingVacancyId === vac.id ? (
                                <span>Publicando...</span>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Publicar Convocatoria</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE CREACIÓN DE CONVOCATORIA (ENTIDAD EMPLEADORA / ADMIN) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 relative max-h-[90vh] overflow-y-auto">
            {/* Botón cerrar */}
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Cabecera del modal */}
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-extrabold uppercase">
                <Briefcase className="w-3 h-3" />
                <span>Nueva Convocatoria Empresarial</span>
              </div>
              <h3 className="text-xl font-black text-slate-900 mt-2">
                Crear y Publicar Convocatoria de Práctica
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Vincula tu oferta al programa académico y periodo lectivo para captar practicantes idóneos de la Universidad.
              </p>
            </div>

            {/* Mensajes de feedback */}
            {createError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold block">No se pudo procesar la convocatoria:</strong>
                  <span>{createError}</span>
                </div>
              </div>
            )}

            {createSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{createSuccess}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Si es Admin, seleccionar empresa */}
              {!currentUser?.companyId && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Empresa Receptora <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={newVacancy.companyId}
                    onChange={(e) => setNewVacancy({ ...newVacancy, companyId: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  >
                    <option value="">Seleccione una empresa...</option>
                    {companiesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName} (NIT: {c.nit})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Título de la Convocatoria */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Título de la Convocatoria / Cargo <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ej. Desarrollador Frontend React & TypeScript"
                  value={newVacancy.title}
                  onChange={(e) => setNewVacancy({ ...newVacancy, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                />
              </div>

              {/* Programa y Periodo Académico */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Programa Académico Vinculado <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={newVacancy.program}
                    onChange={(e) => setNewVacancy({ ...newVacancy, program: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  >
                    <option value="Ingeniería de Sistemas">Ingeniería de Sistemas</option>
                    <option value="Ingeniería Electrónica">Ingeniería Electrónica</option>
                    <option value="Ingeniería Industrial">Ingeniería Industrial</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Periodo Académico Específico <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="ej. 2026-1"
                    value={newVacancy.academicPeriod}
                    onChange={(e) => setNewVacancy({ ...newVacancy, academicPeriod: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  />
                </div>
              </div>

              {/* Cupos y Ubicación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Número de Cupos Disponibles <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newVacancy.vacanciesCount}
                    onChange={(e) => setNewVacancy({ ...newVacancy, vacanciesCount: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Ubicación / Modalidad
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Cúcuta (Híbrido) o Remoto"
                    value={newVacancy.location}
                    onChange={(e) => setNewVacancy({ ...newVacancy, location: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  />
                </div>
              </div>

              {/* Fechas de convocatoria */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Fecha de Inicio (Opcional)
                  </label>
                  <input
                    type="date"
                    value={newVacancy.startDate}
                    onChange={(e) => setNewVacancy({ ...newVacancy, startDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Fecha Límite de Cierre (Opcional)
                  </label>
                  <input
                    type="date"
                    value={newVacancy.endDate}
                    onChange={(e) => setNewVacancy({ ...newVacancy, endDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  />
                </div>
              </div>

              {/* Descripción de funciones */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Descripción del Puesto y Funciones <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Detalla las actividades, proyectos en los que participará el estudiante y tecnologías a emplear..."
                  value={newVacancy.description}
                  onChange={(e) => setNewVacancy({ ...newVacancy, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                />
              </div>

              {/* Perfil del Practicante Idóneo / Requisitos */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Perfil del Practicante Idóneo y Requisitos <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Define las competencias deseadas (conocimientos en bases de datos, trabajo en equipo, proactividad...)"
                  value={newVacancy.requirements}
                  onChange={(e) => setNewVacancy({ ...newVacancy, requirements: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                />
              </div>

              {/* Botones de Acción */}
              <div className="pt-4 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled={isCreatingVacancy}
                  onClick={() => handleCreateVacancy('BORRADOR')}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-200 disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>Guardar como Borrador</span>
                </button>

                <button
                  type="button"
                  disabled={isCreatingVacancy}
                  onClick={() => handleCreateVacancy('PUBLICADA')}
                  className="flex-1 py-3 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-red-700/20 disabled:opacity-50"
                >
                  {isCreatingVacancy ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Publicar Convocatoria (RN-01)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE POSTULACIÓN CON HOJA DE VIDA (ESTUDIANTES) */}
      {isModalOpen && selectedVacancy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 relative max-h-[90vh] overflow-y-auto">
            {/* Botón cerrar */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Cabecera del modal */}
            <div>
              <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                Formulario de Postulación
              </span>
              <h3 className="text-xl font-black text-slate-900 mt-2">
                {selectedVacancy.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" />
                <span>{selectedVacancy.company.businessName}</span>
              </p>
            </div>

            {/* Mensajes de feedback */}
            {submitError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {submitSuccess ? (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-emerald-900">¡Postulación Exitosa!</h4>
                <p className="text-xs text-emerald-700 leading-relaxed">{submitSuccess}</p>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setActiveTab('mis-postulaciones');
                  }}
                  className="mt-2 w-full py-2.5 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  Ver mis postulaciones
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitApplication} className="space-y-5">
                {/* Selector de método para adjuntar Hoja de Vida */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Soporte de Hoja de Vida (CV) <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCvMethod('upload')}
                      className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        cvMethod === 'upload'
                          ? 'border-red-600 bg-red-50 text-red-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Subir PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCvMethod('url')}
                      className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        cvMethod === 'url'
                          ? 'border-red-600 bg-red-50 text-red-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Enlace / URL</span>
                    </button>
                  </div>
                </div>

                {/* Subir archivo */}
                {cvMethod === 'upload' ? (
                  <div className="space-y-2">
                    <div className="border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl p-5 text-center transition-colors bg-slate-50/50">
                      <input
                        type="file"
                        id="cv-file-input"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setCvFile(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                      <label htmlFor="cv-file-input" className="cursor-pointer space-y-2 block">
                        <Upload className="w-7 h-7 text-red-600 mx-auto" />
                        <div className="text-xs">
                          {cvFile ? (
                            <span className="font-bold text-red-700">{cvFile.name} ({(cvFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                          ) : (
                            <>
                              <span className="font-bold text-slate-800">Seleccionar documento</span>
                              <span className="text-slate-500 block text-[11px]">PDF o Word hasta 10MB</span>
                            </>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Enlace a tu CV en línea (Drive, LinkedIn, etc.):
                    </label>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/file/d/..."
                      value={cvUrl}
                      onChange={(e) => setCvUrl(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                    />
                  </div>
                )}

                {/* Observaciones o Carta de Motivación */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Carta de Motivación / Observaciones (Opcional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Menciona tu interés por el puesto y fortalezas técnicas..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  />
                </div>

                {/* Botón enviar */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-700/20 hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Radicando Postulación...</span>
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-4 h-4" />
                        <span>Confirmar Postulación</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CANDIDATOS Y POSTULACIONES (TUTOR EMPRESARIAL / ADMIN) */}
      {isApplicantsModalOpen && selectedVacancyForApplicants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 relative max-h-[90vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-extrabold uppercase mb-1.5">
                  <Users className="w-3 h-3" />
                  <span>Preselección de Candidatos</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Candidatos Postulados: {selectedVacancyForApplicants.title}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedVacancyForApplicants.company.businessName} • {selectedVacancyForApplicants.vacanciesCount} cupo(s) ofertados
                </p>
              </div>

              <button
                onClick={() => setIsApplicantsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Listado de Candidatos */}
            {isLoadingApplicants ? (
              <div className="py-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-red-700 border-t-transparent" />
                <p className="mt-2 text-xs font-semibold text-slate-600">Cargando candidatos y hojas de vida...</p>
              </div>
            ) : applicantsList.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl mx-auto flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Aún no hay postulaciones registradas</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Los estudiantes elegibles podrán postularse a esta convocatoria una vez publicada.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Total de Postulaciones: {applicantsList.length}</span>
                  <span className="text-slate-400 text-[11px] font-normal">Ordenadas por fecha reciente</span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  {applicantsList.map((app: any) => (
                    <div key={app.id} className="p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm text-slate-900">{app.student?.name}</strong>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                            Cód: {app.student?.studentCode || 'N/A'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {app.student?.email}
                          </span>
                          {app.student?.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              {app.student?.phone}
                            </span>
                          )}
                          <span className="text-slate-600 font-medium">
                            Créditos: <strong>{app.student?.approvedCredits ?? 0}</strong> • Promedio: <strong>{app.student?.academicAverage ? app.student.academicAverage.toFixed(2) : 'N/A'}</strong>
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Fecha de postulación: {new Date(app.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                        {app.cvUrl && (
                          <a
                            href={app.cvUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Ver Hoja de Vida</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                          {app.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsApplicantsModalOpen(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">SIGETRAP • Sistema de Gestión y Trazabilidad de Prácticas Empresariales</p>
        <p className="text-slate-400 mt-1">Programa de Ingeniería de Sistemas • Universidad Francisco de Paula Santander</p>
      </footer>
    </div>
  );
}
