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
  ShieldCheck,
  IdCard,
  Check,
  Filter,
} from 'lucide-react';
import { UserResponseDTO, PracticeStatus } from '@/types';

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
              companyName: p.company?.businessName,
              vacancyTitle: p.vacancy?.title,
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

                    {/* Estado de la Práctica */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">Estado de Práctica:</span>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${practiceBadge.color}`}>
                          {practiceBadge.label}
                        </span>
                      </div>

                      {student.activePractice?.companyName && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-700 mt-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold truncate">{student.activePractice.companyName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
