'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  FileCheck2,
  Building2,
  GraduationCap,
  ArrowRight,
  GitBranch,
  Lock,
  Briefcase,
  CalendarCheck,
  Award,
  Sparkles,
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
                  {isAdmin && (
                    <Link
                      href="/admin/usuarios"
                      className="flex items-center gap-2 px-6 py-3.5 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-700/20 hover:shadow-xl transition-all cursor-pointer"
                    >
                      <Users className="w-4 h-4" />
                      <span>Administración de Usuarios</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                  <div className="px-4 py-3 bg-slate-100 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Sesión activa como: <strong className="text-slate-900">{currentUser.name}</strong> ({currentUser.role.replace('_', ' ')})</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 items-center">
                  <Link
                    href="/login"
                    className="flex items-center gap-2 px-6 py-3.5 bg-red-700 hover:bg-red-800 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-700/20 hover:shadow-xl transition-all cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Ingresar al Portal Institucional</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Feature Cards Grid (Clean, human-readable modules) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: If admin, points to user administration; otherwise general security overview */}
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
          ) : (
            <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-md hover:border-red-300 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Seguridad & Autenticación</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Acceso seguro mediante correo institucional, validación unívoca de credenciales y control de permisos por roles académicos y empresariales.
              </p>
            </div>
          )}

          {/* Card 2 */}
          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-md hover:border-red-300 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Seguimiento y Aprobación Dual</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Coordinación concurrente entre el Tutor Empresarial y el Docente Supervisor para la revisión, ajustes y aprobación de planes de trabajo.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-md hover:border-red-300 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Convenios y Empresas</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Verificación de convenios vigentes, vinculación formal con empresas del sector tecnológico y trazabilidad documental completa.
            </p>
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
