'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  GraduationCap,
  Search,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone,
  Building2,
  Briefcase,
  UserCheck,
  UserX,
  RefreshCw,
  Clock,
  Layers,
  FileCheck2,
  Award,
  ShieldCheck,
  IdCard,
  Check,
  Filter,
  Users,
  UserPlus,
  X,
} from 'lucide-react';
import { UserResponseDTO, PracticeStatus, CompanyTutorResponseDTO } from '@/types';

export default function EstudiantesPage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Lista de estudiantes
  const [students, setStudents] = useState<UserResponseDTO[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState('');
  const [practiceStatusFilter, setPracticeStatusFilter] = useState('');

  // ============================================================================
  // HU09 / CU09 (Criterio 3) - Modal de Formalización/Seguimiento y Selector de Evaluadores Directos
  // ============================================================================
  const [selectedStudentForEvaluator, setSelectedStudentForEvaluator] = useState<UserResponseDTO | null>(null);
  const [availableEvaluators, setAvailableEvaluators] = useState<CompanyTutorResponseDTO[]>([]);
  const [isLoadingEvaluators, setIsLoadingEvaluators] = useState(false);
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string>('');
  const [evaluatorNotes, setEvaluatorNotes] = useState<string>('');
  const [isAssigningEvaluator, setIsAssigningEvaluator] = useState(false);
  const [evaluatorError, setEvaluatorError] = useState<string | null>(null);
  const [evaluatorSuccess, setEvaluatorSuccess] = useState<string | null>(null);

  // ============================================================================
  // HU13 / CU13 - Modal de Formalización de la Práctica Empresarial (Coordinador)
  // ============================================================================
  const [selectedStudentForFormalization, setSelectedStudentForFormalization] = useState<UserResponseDTO | null>(null);
  const [isLoadingFormalizationDetails, setIsLoadingFormalizationDetails] = useState(false);
  const [availableTeachers, setAvailableTeachers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [availableExternalTutors, setAvailableExternalTutors] = useState<Array<{ id: string; name: string; email: string; cargo?: string }>>([]);
  const [formalizationTeacherId, setFormalizationTeacherId] = useState<string>('');
  const [formalizationTutorId, setFormalizationTutorId] = useState<string>('');
  const [formalizationWorkPlanStatus, setFormalizationWorkPlanStatus] = useState<string>('Aprobado');
  const [formalizationPeriod, setFormalizationPeriod] = useState<string>('2026-1');
  const [formalizationObjectives, setFormalizationObjectives] = useState<string>('');
  const [formalizationNotes, setFormalizationNotes] = useState<string>('');
  const [isSubmittingFormalization, setIsSubmittingFormalization] = useState(false);
  const [formalizationError, setFormalizationError] = useState<string | null>(null);
  const [formalizationSuccess, setFormalizationSuccess] = useState<string | null>(null);

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

  // Cargar lista de estudiantes
  const loadStudents = useCallback(async () => {
    setIsLoadingStudents(true);
    try {
      if (currentUser?.role === 'TUTOR_EMPRESARIAL') {
        const res = await fetch('/api/v1/practicas');
        const data = await res.json();
        if (data.success && data.data && Array.isArray(data.data.items)) {
          const mapped: UserResponseDTO[] = data.data.items.map((p: any) => ({
            id: p.student.id,
            name: p.student.name,
            email: p.student.email,
            documentNumber: p.student.documentNumber,
            documentType: p.student.documentType || 'CC',
            phone: p.student.phone,
            role: 'ESTUDIANTE',
            status: p.student.status || 'ACTIVO',
            isActive: p.student.status === 'ACTIVO',
            studentCode: p.student.studentCode,
            academicAverage: p.student.academicAverage,
            approvedCredits: p.student.approvedCredits,
            program: p.student.program || 'Ingeniería de Sistemas',
            companyId: p.companyId,
            company: p.company ? { id: p.company.id, businessName: p.company.businessName, nit: p.company.nit } : null,
            activePractice: {
              id: p.id,
              currentStatus: p.currentStatus,
              companyId: p.companyId || p.company?.id,
              companyName: p.company?.businessName,
              vacancyTitle: p.vacancy?.title,
              tutorId: p.tutorId || p.tutor?.id || null,
              tutorName: p.tutor?.name || null,
              tutorEmail: p.tutor?.email || null,
              tutorCargo:
                p.tutor?.program && p.tutor.program !== 'Ingeniería de Sistemas'
                  ? p.tutor.program
                  : 'Supervisor Empresarial',
            },
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }));
          setStudents(mapped);
        } else {
          setStudents([]);
        }
      } else {
        const params = new URLSearchParams();
        params.append('role', 'ESTUDIANTE');
        params.append('limit', '100');
        if (statusFilter) params.append('status', statusFilter);
        if (searchTerm) params.append('search', searchTerm);

        const res = await fetch(`/api/v1/usuarios?${params.toString()}`);
        const data = await res.json();

        if (data.success && data.data) {
          setStudents(data.data.items || []);
        }
      }
    } catch (e) {
      console.error('Error cargando estudiantes:', e);
    } finally {
      setIsLoadingStudents(false);
    }
  }, [currentUser, statusFilter, searchTerm]);

  // Abrir formulario de formalización/seguimiento para seleccionar evaluador directo (CU09 - Criterio 3)
  const handleOpenEvaluatorModal = async (student: UserResponseDTO) => {
    if (!student.activePractice?.id) return;
    setSelectedStudentForEvaluator(student);
    setSelectedEvaluatorId(student.activePractice.tutorId || '');
    setEvaluatorNotes('');
    setEvaluatorError(null);
    setEvaluatorSuccess(null);
    setIsLoadingEvaluators(true);

    try {
      const res = await fetch(`/api/v1/practicas/${student.activePractice.id}/evaluador`);
      const data = await res.json();
      if (data.success && data.data) {
        const list: CompanyTutorResponseDTO[] = data.data.evaluators || [];
        setAvailableEvaluators(list);
        if (!student.activePractice.tutorId && list.length > 0) {
          setSelectedEvaluatorId(list[0].id);
        }
      } else {
        setAvailableEvaluators([]);
      }
    } catch (e) {
      console.error('Error cargando evaluadores directos:', e);
      setAvailableEvaluators([]);
    } finally {
      setIsLoadingEvaluators(false);
    }
  };

  const handleAssignEvaluator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForEvaluator?.activePractice?.id || !selectedEvaluatorId) {
      setEvaluatorError('Debe seleccionar un supervisor inmediato del selector de evaluadores directos.');
      return;
    }

    setIsAssigningEvaluator(true);
    setEvaluatorError(null);
    setEvaluatorSuccess(null);

    try {
      const res = await fetch(
        `/api/v1/practicas/${selectedStudentForEvaluator.activePractice.id}/evaluador`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tutorId: selectedEvaluatorId,
            notes: evaluatorNotes || 'Asignación de supervisor inmediato como evaluador directo (CU09)',
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEvaluatorError(data.error?.message || 'Error al asignar el evaluador directo.');
        return;
      }

      setEvaluatorSuccess(
        data.message || 'Evaluador directo asignado exitosamente al plan de práctica.'
      );
      loadStudents();
    } catch (err) {
      console.error(err);
      setEvaluatorError('Error de conexión al asignar el evaluador directo.');
    } finally {
      setIsAssigningEvaluator(false);
    }
  };

  // Abrir formulario de Formalización de la Práctica Empresarial (HU13 / CU13)
  const handleOpenFormalizationModal = async (student: UserResponseDTO) => {
    if (!student.activePractice?.id) return;
    setSelectedStudentForFormalization(student);
    setFormalizationTeacherId(student.activePractice.teacherId || '');
    setFormalizationTutorId(student.activePractice.tutorId || '');
    setFormalizationWorkPlanStatus(student.activePractice.workPlanStatus || 'Aprobado');
    setFormalizationPeriod(student.activePractice.academicPeriod || '2026-1');
    setFormalizationObjectives('');
    setFormalizationNotes('');
    setFormalizationError(null);
    setFormalizationSuccess(null);
    setIsLoadingFormalizationDetails(true);

    try {
      const res = await fetch(`/api/v1/practicas/${student.activePractice.id}/formalizar`);
      const data = await res.json();
      if (data.success && data.data) {
        const details = data.data;
        setAvailableTeachers(details.availableTeachers || []);
        setAvailableExternalTutors(details.availableExternalTutors || []);
        if (details.teacherId) setFormalizationTeacherId(details.teacherId);
        else if (details.availableTeachers?.length > 0) {
          setFormalizationTeacherId(details.availableTeachers[0].id);
        }
        if (details.tutorId) setFormalizationTutorId(details.tutorId);
        else if (details.availableExternalTutors?.length > 0) {
          setFormalizationTutorId(details.availableExternalTutors[0].id);
        }
        if (details.workPlan?.estado) {
          setFormalizationWorkPlanStatus(details.workPlan.estado);
        }
        if (details.workPlan?.objectives) {
          setFormalizationObjectives(details.workPlan.objectives);
        }
        if (details.academicPeriod) {
          setFormalizationPeriod(details.academicPeriod);
        }
      }
    } catch (e) {
      console.error('Error cargando detalles de formalización:', e);
    } finally {
      setIsLoadingFormalizationDetails(false);
    }
  };

  // Confirmar Formalización de la Práctica Empresarial (HU13 / CU13)
  const handleConfirmFormalization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForFormalization?.activePractice?.id) return;

    setIsSubmittingFormalization(true);
    setFormalizationError(null);
    setFormalizationSuccess(null);

    try {
      const res = await fetch(
        `/api/v1/practicas/${selectedStudentForFormalization.activePractice.id}/formalizar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: selectedStudentForFormalization.id,
            companyId: selectedStudentForFormalization.activePractice.companyId,
            teacherId: formalizationTeacherId || null,
            tutorId: formalizationTutorId || null,
            estadoPlanTrabajo: formalizationWorkPlanStatus,
            periodoLectivo: formalizationPeriod,
            estado: 'Formalizada',
            planTrabajo: {
              estado: formalizationWorkPlanStatus,
              objetivos:
                formalizationObjectives ||
                'Desarrollar las actividades del plan de formación práctica empresarial aprobado.',
            },
            observaciones:
              formalizationNotes ||
              'Legalización y formalización oficial del inicio de la práctica empresarial (CU13)',
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormalizationError(
          data.error?.message || 'Error al emitir la formalización de la práctica empresarial.'
        );
        return;
      }

      setFormalizationSuccess(
        data.message || 'Práctica empresarial formalizada exitosamente con estado "Formalizada".'
      );
      loadStudents();
    } catch (err) {
      console.error(err);
      setFormalizationError('Error de conexión al confirmar la formalización de la práctica.');
    } finally {
      setIsSubmittingFormalization(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadStudents();
    }
  }, [currentUser, loadStudents]);

  // Filtrado local adicional (por elegibilidad y estado de práctica)
  const filteredStudents = students.filter((student) => {
    const approvedCredits = student.approvedCredits ?? 0;
    const academicAvg = student.academicAverage ?? 0;
    const isEligible = approvedCredits >= 100 && academicAvg >= 3.0;

    if (eligibilityFilter === 'ELEGIBLE' && !isEligible) return false;
    if (eligibilityFilter === 'NO_ELEGIBLE' && isEligible) return false;

    if (practiceStatusFilter) {
      const pStatus = student.activePractice?.currentStatus || 'ASPIRANTE';
      if (pStatus !== practiceStatusFilter) return false;
    }

    return true;
  });

  const eligibleCount = students.filter(
    (s) => (s.approvedCredits ?? 0) >= 100 && (s.academicAverage ?? 0) >= 3.0
  ).length;

  const inPracticeCount = students.filter((s) => {
    const st = s.activePractice?.currentStatus;
    return (
      st === 'PRACTICA_EN_EJECUCION' ||
      st === 'ASIGNADO_FORMALMENTE' ||
      st === 'PLAN_EN_REVISION' ||
      st === 'ACEPTADO_ARL_PENDIENTE'
    );
  }).length;

  const isTutor = currentUser?.role === 'TUTOR_EMPRESARIAL';

  const getPracticeBadge = (status?: PracticeStatus) => {
    switch (status) {
      case 'PRACTICA_EN_EJECUCION':
        return {
          label: 'En Ejecución',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'ASIGNADO_FORMALMENTE':
        return {
          label: 'Asignado Formalmente',
          color: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      case 'PLAN_EN_REVISION':
        return {
          label: 'Plan en Revisión',
          color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'POSTULADO':
        return {
          label: 'Postulado a Vacante',
          color: 'bg-purple-50 text-purple-700 border-purple-200',
        };
      case 'PRESENTADO_A_EMPRESA':
        return {
          label: 'Presentado a Empresa',
          color: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'FINALIZADA':
        return {
          label: 'Práctica Finalizada',
          color: 'bg-teal-50 text-teal-700 border-teal-200',
        };
      default:
        return {
          label: 'Aspirante',
          color: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  };

  const isAuthorized =
    currentUser?.role === 'DOCENTE_PRACTICA' ||
    currentUser?.role === 'DIRECTOR_PROGRAMA' ||
    currentUser?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner de Cabecera */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-red-50/70 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 w-2.5 h-full bg-red-700" />

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>{isTutor ? 'Supervisión Empresarial de Practicantes' : 'Supervisión y Seguimiento Académico'}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {isTutor ? 'Practicantes de la Empresa Receptora' : 'Directorio y Estado de Estudiantes'}
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                {isTutor
                  ? `Estudiantes vinculados a la empresa para el desarrollo de prácticas, estado de formalización de ARL y seguimiento.`
                  : 'Consulta centralizada de estudiantes del programa, verificación de requisitos de elegibilidad académica (RN-02) y trazabilidad de prácticas en curso.'}
              </p>
            </div>

            <button
              onClick={loadStudents}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-sm cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-4 h-4 text-red-700 ${isLoadingStudents ? 'animate-spin' : ''}`} />
              <span>{isTutor ? 'Actualizar Practicantes' : 'Actualizar Estudiantes'}</span>
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas Estadísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Estudiantes</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{students.length}</div>
              <span className="text-[11px] text-slate-500 font-medium">Registrados en el programa</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
              <GraduationCap className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Elegibles (RN-02)</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">{eligibleCount}</div>
              <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ≥100 créditos y prom. ≥3.0
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">En Práctica / Asignados</span>
              <div className="text-2xl font-black text-blue-700 mt-1">{inPracticeCount}</div>
              <span className="text-[11px] text-blue-600 font-medium flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Con empresa receptora
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
              <Briefcase className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">No Elegibles Aún</span>
              <div className="text-2xl font-black text-amber-700 mt-1">{students.length - eligibleCount}</div>
              <span className="text-[11px] text-amber-600 font-medium">Requisitos pendientes</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Buscador y Filtros */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, código de estudiante, cédula o correo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full md:w-auto">
            <select
              value={eligibilityFilter}
              onChange={(e) => setEligibilityFilter(e.target.value)}
              className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 text-slate-700"
            >
              <option value="">Toda Elegibilidad</option>
              <option value="ELEGIBLE">Solo Elegibles (RN-02)</option>
              <option value="NO_ELEGIBLE">No Elegibles</option>
            </select>

            <select
              value={practiceStatusFilter}
              onChange={(e) => setPracticeStatusFilter(e.target.value)}
              className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 text-slate-700"
            >
              <option value="">Estado de Práctica</option>
              <option value="ASPIRANTE">Aspirante</option>
              <option value="POSTULADO">Postulado</option>
              <option value="PRESENTADO_A_EMPRESA">Presentado a Empresa</option>
              <option value="ASIGNADO_FORMALMENTE">Asignado Formalmente</option>
              <option value="PLAN_EN_REVISION">Plan en Revisión</option>
              <option value="PRACTICA_EN_EJECUCION">En Ejecución</option>
              <option value="FINALIZADA">Finalizada</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 text-slate-700"
            >
              <option value="">Estado de Cuenta</option>
              <option value="ACTIVO">Cuenta Activa</option>
              <option value="INACTIVO">Cuenta Inactiva</option>
            </select>
          </div>
        </div>

        {/* Listado de Estudiantes */}
        {isLoadingStudents ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-red-700 border-t-transparent" />
            <p className="mt-2 text-xs font-semibold text-slate-600">Cargando directorio de estudiantes...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl mx-auto flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No se encontraron estudiantes coincidentes</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Intente ajustar los filtros de búsqueda, estado de elegibilidad o estado de la práctica.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map((student) => {
              const approvedCredits = student.approvedCredits ?? 0;
              const academicAvg = student.academicAverage ?? 0;
              const isEligible = approvedCredits >= 100 && academicAvg >= 3.0;
              const practiceBadge = getPracticeBadge(student.activePractice?.currentStatus);

              return (
                <div
                  key={student.id}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Header de la tarjeta */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-700 border border-red-200 flex items-center justify-center font-black text-sm shrink-0">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-sm font-bold text-slate-900 leading-snug">{student.name}</h2>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-mono font-semibold text-slate-700">
                              Cód: {student.studentCode || 'Sin código'}
                            </span>
                            <span>•</span>
                            <span>{student.documentType} {student.documentNumber}</span>
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          student.status === 'ACTIVO'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {student.status}
                      </span>
                    </div>

                    {/* Información de contacto */}
                    <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{student.email}</span>
                      </div>
                      {student.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{student.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Métricas Académicas y Elegibilidad (RN-02) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Elegibilidad RN-02:</span>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                            isEligible
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}
                        >
                          {isEligible ? 'Elegible' : 'Pendiente'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
                          <span className="text-[10px] text-slate-500 font-medium block">Créditos Aprobados</span>
                          <strong
                            className={`text-xs ${
                              approvedCredits >= 100 ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {approvedCredits} / 100 mín.
                          </strong>
                        </div>

                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
                          <span className="text-[10px] text-slate-500 font-medium block">Promedio General</span>
                          <strong
                            className={`text-xs ${
                              academicAvg >= 3.0 ? 'text-emerald-700' : 'text-slate-700'
                            }`}
                          >
                            {academicAvg > 0 ? academicAvg.toFixed(2) : 'N/A'} / 3.0
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Estado de la Práctica y Evaluador Directo (CU09 - Criterio 3) */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">Estado de Práctica:</span>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${practiceBadge.color}`}>
                          {practiceBadge.label}
                        </span>
                      </div>

                      {student.activePractice?.companyName && (
                        <div className="space-y-2 mt-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-800">
                            <Building2 className="w-3.5 h-3.5 text-red-700 shrink-0" />
                            <span className="font-bold truncate">{student.activePractice.companyName}</span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                            <div className="flex items-center gap-1.5 truncate">
                              <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">
                                Evaluador:{' '}
                                <strong className="text-slate-800">
                                  {student.activePractice.tutorName || 'Pendiente por asignar'}
                                </strong>
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenEvaluatorModal(student)}
                            className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Asignar Evaluador Externo (HU09)</span>
                          </button>

                          {(currentUser?.role === 'DIRECTOR_PROGRAMA' || currentUser?.role === 'ADMIN') && (
                            <button
                              type="button"
                              onClick={() => handleOpenFormalizationModal(student)}
                              className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>Formalizar Práctica Empresarial (HU13)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL: FORMULARIO DE FORMALIZACIÓN / SEGUIMIENTO DE PRÁCTICA - SELECTOR DE EVALUADORES DIRECTOS (CU09 - CRITERIO 3) */}
        {selectedStudentForEvaluator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 border border-slate-200 shadow-2xl space-y-5 relative">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1">
                    <span>CU09 • Formalización y Seguimiento de Práctica</span>
                  </div>
                  <h3 className="text-base font-black text-slate-900">
                    Asignación de Evaluador Directo al Plan de Práctica
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Seleccione un supervisor inmediato vinculado a{' '}
                    <strong>{selectedStudentForEvaluator.activePractice?.companyName}</strong> para evaluar el desempeño de{' '}
                    <strong>{selectedStudentForEvaluator.name}</strong>.
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStudentForEvaluator(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {evaluatorError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{evaluatorError}</span>
                </div>
              )}

              {evaluatorSuccess && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-start gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{evaluatorSuccess}</span>
                </div>
              )}

              {isLoadingEvaluators ? (
                <div className="py-8 text-center text-slate-500 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-700" />
                  <p className="text-xs">Cargando supervisores activos de la organización...</p>
                </div>
              ) : (
                <form onSubmit={handleAssignEvaluator} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="evaluator-selector" className="text-xs font-bold text-slate-700">
                      Selector de Evaluadores Directos (Supervisores Activos) <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="evaluator-selector"
                      value={selectedEvaluatorId}
                      onChange={(e) => setSelectedEvaluatorId(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                    >
                      <option value="">Seleccione un supervisor vinculado...</option>
                      {availableEvaluators.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.nombre} — {ev.cargo} ({ev.correo}) [{ev.estado}]
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400">
                      Se listan únicamente los supervisores vinculados a la empresa activa con estado <strong>Activo</strong>.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="evaluator-notes" className="text-xs font-bold text-slate-700">
                      Observaciones de Formalización / Plan de Práctica (Opcional)
                    </label>
                    <textarea
                      id="evaluator-notes"
                      rows={2}
                      placeholder="Ej. Designado como evaluador directo para el seguimiento del plan de trabajo semestral."
                      value={evaluatorNotes}
                      onChange={(e) => setEvaluatorNotes(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <Link
                      href="/empresas"
                      className="text-xs font-bold text-red-700 hover:underline flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Vincular nuevo supervisor</span>
                    </Link>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStudentForEvaluator(null)}
                        className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                      >
                        Cerrar
                      </button>
                      <button
                        type="submit"
                        disabled={isAssigningEvaluator || !selectedEvaluatorId}
                        className="px-5 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {isAssigningEvaluator ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Asignando...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Asignar Evaluador Directo</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* MODAL: FORMALIZACIÓN DE LA PRÁCTICA EMPRESARIAL (HU13 / CU13) */}
        {selectedStudentForFormalization && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 border border-slate-200 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1">
                    <span>HU13 • CU13 • Legalización y Formalización de Prácticas</span>
                  </div>
                  <h3 className="text-base font-black text-slate-900">
                    Formalización Oficial de la Práctica Empresarial
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Emita el registro en <strong>practicas_formativas</strong> para{' '}
                    <strong>{selectedStudentForFormalization.name}</strong> verificando tutor docente, tutor externo y plan de trabajo aprobado.
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStudentForFormalization(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formalizationError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{formalizationError}</span>
                </div>
              )}

              {formalizationSuccess && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-start gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{formalizationSuccess}</span>
                </div>
              )}

              {isLoadingFormalizationDetails ? (
                <div className="py-8 text-center text-slate-500 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-700" />
                  <p className="text-xs">Verificando requisitos de formalización del estudiante...</p>
                </div>
              ) : (
                <form onSubmit={handleConfirmFormalization} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="formalize-teacher" className="text-xs font-bold text-slate-700">
                        Tutor Docente Asignado (docentes_tutores) <span className="text-red-600">*</span>
                      </label>
                      <select
                        id="formalize-teacher"
                        value={formalizationTeacherId}
                        onChange={(e) => setFormalizationTeacherId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                      >
                        <option value="">-- Sin tutor docente asignado --</option>
                        {availableTeachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="formalize-tutor" className="text-xs font-bold text-slate-700">
                        Tutor Externo Vinculado (tutores_empresariales) <span className="text-red-600">*</span>
                      </label>
                      <select
                        id="formalize-tutor"
                        value={formalizationTutorId}
                        onChange={(e) => setFormalizationTutorId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                      >
                        <option value="">-- Sin tutor externo vinculado --</option>
                        {availableExternalTutors.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} — {t.cargo || 'Tutor Empresarial'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="formalize-plan-status" className="text-xs font-bold text-slate-700">
                        Estado del Plan de Trabajo (planes_trabajo) <span className="text-red-600">*</span>
                      </label>
                      <select
                        id="formalize-plan-status"
                        value={formalizationWorkPlanStatus}
                        onChange={(e) => setFormalizationWorkPlanStatus(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                      >
                        <option value="Aprobado">Aprobado (Requisito cumplido)</option>
                        <option value="Pendiente">Pendiente de aprobación</option>
                        <option value="En Revisión">En Revisión</option>
                        <option value="Rechazado">Rechazado</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="formalize-period" className="text-xs font-bold text-slate-700">
                        Periodo Lectivo Vigente <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="formalize-period"
                        type="text"
                        value={formalizationPeriod}
                        onChange={(e) => setFormalizationPeriod(e.target.value)}
                        placeholder="Ej. 2026-1"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="formalize-objectives" className="text-xs font-bold text-slate-700">
                      Objetivos del Plan de Trabajo Aprobado
                    </label>
                    <textarea
                      id="formalize-objectives"
                      rows={2}
                      value={formalizationObjectives}
                      onChange={(e) => setFormalizationObjectives(e.target.value)}
                      placeholder="Objetivos acordados y aprobados en el plan de trabajo..."
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setSelectedStudentForFormalization(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cerrar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingFormalization}
                      className="px-5 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {isSubmittingFormalization ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Formalizando...</span>
                        </>
                      ) : (
                        <>
                          <FileCheck2 className="w-3.5 h-3.5" />
                          <span>Confirmar Formalización (Estado: Formalizada)</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
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
