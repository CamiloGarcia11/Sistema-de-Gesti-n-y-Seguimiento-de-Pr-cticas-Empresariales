'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  Users,
  ShieldCheck,
  Building2,
  ArrowRight,
  Lock,
  Briefcase,
  GraduationCap,
} from 'lucide-react';
import { UserResponseDTO } from '@/types';

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setIsLoading(false));
  }, []);

  const isAdmin = currentUser?.role === 'ADMIN';
  const isFaculty = currentUser?.role === 'DOCENTE_PRACTICA' || currentUser?.role === 'DIRECTOR_PROGRAMA';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* Hero Section */}
        <section className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200/80 shadow-xl shadow-slate-200/40 relative overflow-hidden">
          {/* Decorative background glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-red-100/50 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-red-50/60 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute top-0 left-0 w-2.5 h-full bg-red-700" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider mb-4">
              <span>Portal Institucional</span>
              <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
              <span>Ingeniería de Sistemas • UFPS</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              Gestión, Trazabilidad y Seguimiento de Prácticas
            </h1>

            <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
              Plataforma web oficial para la postulación, formalización con ARL, diseño de planes de trabajo y supervisión académica y empresarial de las prácticas profesionales.
            </p>

            {/* Call to Actions based on session */}
            <div className="mt-8 flex flex-wrap gap-4 items-center">
              {currentUser ? (
                <div className="flex flex-wrap gap-3 items-center">
                  {(isFaculty || isAdmin) && (
                    <Link
                      href="/estudiantes"
                      className="flex items-center gap-2 px-5 py-3.5 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-700/20 hover:shadow-xl transition-all cursor-pointer"
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>Directorio de Estudiantes</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                  <Link
                    href="/vacantes"
                    className={`flex items-center gap-2 px-5 py-3.5 ${
                      isFaculty || isAdmin
                        ? 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
                        : 'bg-red-700 hover:bg-red-800 active:bg-red-900 text-white shadow-lg shadow-red-700/20 hover:shadow-xl'
                    } font-bold text-sm rounded-xl transition-all cursor-pointer`}
                  >
                    <Briefcase className="w-4 h-4" />
                    <span>{currentUser.role === 'TUTOR_EMPRESARIAL' ? 'Convocatorias' : 'Convocatorias y Vacantes'}</span>
                    {!isFaculty && !isAdmin && <ArrowRight className="w-4 h-4" />}
                  </Link>
                  <Link
                    href="/empresas"
                    className="flex items-center gap-2 px-5 py-3.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Empresas</span>
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin/usuarios"
                      className="flex items-center gap-2 px-5 py-3.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      <Users className="w-4 h-4" />
                      <span>Usuarios</span>
                    </Link>
                  )}
                  <div className="px-4 py-3 bg-slate-100 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Sesión activa: <strong className="text-slate-900">{currentUser.name}</strong> ({currentUser.role.replace('_', ' ')})</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 items-center">
                  <Link
                    href="/login"
                    className="flex items-center gap-2 px-6 py-3.5 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Iniciar Sesión en el Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Feature Cards Grid (Clean, human-readable modules) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: If admin, points to user administration; if faculty, points to students directory; otherwise general security overview */}
          {isAdmin ? (
            <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-md hover:border-red-300 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Administración de Usuarios</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Registro y habilitación de usuarios validando documento y correo institucional, prevención de duplicados y control de cuentas activas.
              </p>
              <Link
                href="/admin/usuarios"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-800 mt-4 group-hover:translate-x-0.5 transition-transform"
              >
                <span>Ir al Panel de Administración</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : isFaculty ? (
            <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-md hover:border-red-300 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
                <GraduationCap className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Directorio de Estudiantes</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Supervisión académica de estudiantes, verificación de elegibilidad (créditos y promedio RN-02) y trazabilidad de prácticas en curso.
              </p>
              <Link
                href="/estudiantes"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-800 mt-4 group-hover:translate-x-0.5 transition-transform"
              >
                <span>Ver Directorio de Estudiantes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-md hover:border-red-300 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Seguridad & Autenticación</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Acceso seguro institucional con cifrado de credenciales, tokens de seguridad y control de permisos basado en roles (RBAC).
              </p>
              {!currentUser ? (
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-800 mt-4 group-hover:translate-x-0.5 transition-transform"
                >
                  <span>Acceder con mi cuenta</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 mt-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Sesión activa protegida</span>
                </div>
              )}
            </div>
          )}

          {/* Card 2: Vacantes y Postulaciones de Práctica */}
          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-md hover:border-red-300 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {currentUser?.role === 'TUTOR_EMPRESARIAL'
                ? 'Convocatorias Empresariales'
                : 'Convocatorias & Vacantes de Práctica'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {currentUser?.role === 'TUTOR_EMPRESARIAL'
                ? 'Publicación de convocatorias para captación de practicantes idóneos vinculados a programas y periodos específicos.'
                : 'Postulación a vacantes empresariales ofertadas con convenio vigente, adjuntando hoja de vida y verificando elegibilidad académica.'}
            </p>
            {currentUser ? (
              <Link
                href="/vacantes"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-800 mt-4 group-hover:translate-x-0.5 transition-transform"
              >
                <span>
                  {currentUser.role === 'TUTOR_EMPRESARIAL'
                    ? 'Gestionar Convocatorias'
                    : 'Ver Vacantes Disponibles'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-800 mt-4 group-hover:translate-x-0.5 transition-transform"
              >
                <span>Iniciar sesión para ver vacantes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Card 3: Registro y Radicación de Empresas */}
          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-md hover:border-red-300 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {currentUser?.role === 'ESTUDIANTE'
                ? 'Directorio de Empresas Receptoras'
                : 'Registro y Radicación de Empresas'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {currentUser?.role === 'ESTUDIANTE'
                ? 'Consulta el catálogo de empresas receptoras vinculadas y el estado de sus convenios institucionales vigentes.'
                : 'Radicación de datos fiscales de empresas receptoras, validación de NIT y habilitación formal para convenios institucionales.'}
            </p>
            {currentUser ? (
              <Link
                href="/empresas"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-800 mt-4 group-hover:translate-x-0.5 transition-transform"
              >
                <span>
                  {currentUser.role === 'ESTUDIANTE'
                    ? 'Consultar Directorio de Empresas'
                    : 'Ir a Radicación de Empresas'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-800 mt-4 group-hover:translate-x-0.5 transition-transform"
              >
                <span>Iniciar sesión para ver empresas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">SIGETRAP • Sistema de Gestión y Trazabilidad de Prácticas Empresariales</p>
        <p className="text-slate-400 mt-1">Programa de Ingeniería de Sistemas • Universidad Francisco de Paula Santander</p>
      </footer>
    </div>
  );
}
