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
  Sparkles,
  FileCheck2,
  Lock,
  ArrowRight,
  Info,
  Calendar,
  X,
  FileCheck,
} from 'lucide-react';
import {
  VacancyResponseDTO,
  StudentEligibilityDTO,
  ApplicationResponseDTO,
  UserResponseDTO,
} from '@/types';

export default function VacantesPage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Tabs: 'vacantes' o 'mis-postulaciones'
  const [activeTab, setActiveTab] = useState<'vacantes' | 'mis-postulaciones'>('vacantes');

  // Estado de elegibilidad del estudiante
  const [eligibility, setEligibility] = useState<StudentEligibilityDTO | null>(null);
  const [isLoadingEligibility, setIsLoadingEligibility] = useState(false);

  // Listado de vacantes
  const [vacancies, setVacancies] = useState<VacancyResponseDTO[]>([]);
  const [isLoadingVacancies, setIsLoadingVacancies] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');

  // Mis postulaciones
  const [myApplications, setMyApplications] = useState<ApplicationResponseDTO[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);

  // Modal de postulación
  const [selectedVacancy, setSelectedVacancy] = useState<VacancyResponseDTO | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cvMethod, setCvMethod] = useState<'upload' | 'url'>('upload');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvUrl, setCvUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

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

  // Cargar vacantes
  const loadVacancies = useCallback(async () => {
    setIsLoadingVacancies(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (cityFilter) params.append('city', cityFilter);

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
  }, [searchTerm, cityFilter]);

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

  // Manejo de apertura de modal
  const handleOpenApplyModal = (vacancy: VacancyResponseDTO) => {
    setSelectedVacancy(vacancy);
    setCvFile(null);
    setCvUrl('');
    setNotes('');
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsModalOpen(true);
  };

  // Envío de postulación
  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVacancy) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      let finalCvUrl = cvUrl.trim();

      // Si seleccionó subir archivo, procesarlo primero
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

      // Enviar la postulación
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

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider mb-3">
                <Briefcase className="w-3.5 h-3.5" />
                <span>Convocatorias y Vacantes de Prácticas</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Postulación a Vacantes Empresariales
              </h1>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
                Consulta las ofertas de práctica empresarial vigentes con convenios institucionales activos (RN-01).
                Adjunta tu hoja de vida y participa en el proceso de preselección empresarial.
              </p>
            </div>

            {/* Selector de Pestañas */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shrink-0">
              <button
                onClick={() => setActiveTab('vacantes')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'vacantes'
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                <span>Vacantes Ofertadas</span>
              </button>
              {currentUser?.role === 'ESTUDIANTE' && (
                <button
                  onClick={() => setActiveTab('mis-postulaciones')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'mis-postulaciones'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>Mis Postulaciones</span>
                  {myApplications.length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 font-extrabold text-[10px] flex items-center justify-center">
                      {myApplications.length}
                    </span>
                  )}
                </button>
              )}
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
                  <strong className={eligibility && (eligibility.approvedCredits ?? 0) >= 100 ? 'text-emerald-700' : 'text-amber-700'}>
                    {eligibility?.approvedCredits ?? 0} / 100 mín.
                  </strong>
                </div>
                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-slate-500 font-medium">Promedio: </span>
                  <strong className={eligibility && (eligibility.academicAverage ?? 0) >= 3.0 ? 'text-emerald-700' : 'text-slate-700'}>
                    {eligibility?.academicAverage ? eligibility.academicAverage.toFixed(2) : 'N/A'} / 3.0 mín.
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
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar vacante por cargo, palabras clave o empresa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                />
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="w-full sm:w-44 px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 text-slate-700"
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
                <h3 className="text-base font-bold text-slate-800">No se encontraron vacantes abiertas</h3>
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
                        {/* Cabecera de la tarjeta */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              <span>Convenio Vigente RN-01</span>
                            </span>
                            <h2 className="text-lg font-bold text-slate-900 mt-2 group-hover:text-red-700 transition-colors">
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
                              {vacancy.availableSlots} {vacancy.availableSlots === 1 ? 'cupo' : 'cupos'}
                            </span>
                          </div>
                        </div>

                        {/* Descripción y Requisitos */}
                        <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                          <p className="line-clamp-2">{vacancy.description}</p>
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                            <span className="font-bold text-slate-800 text-[11px] block">Requisitos:</span>
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
                          <span className="text-[11px] text-slate-400 font-medium">
                            Solo estudiantes elegibles
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
      </main>

      {/* MODAL DE POSTULACIÓN CON HOJA DE VIDA */}
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

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">SIGETRAP • Sistema de Gestión y Trazabilidad de Prácticas Empresariales</p>
        <p className="text-slate-400 mt-1">Programa de Ingeniería de Sistemas • Universidad Francisco de Paula Santander</p>
      </footer>
    </div>
  );
}
