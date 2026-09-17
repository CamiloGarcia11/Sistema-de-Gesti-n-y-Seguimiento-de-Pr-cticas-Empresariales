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
} from 'lucide-react';
import { UserResponseDTO } from '@/types';

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* Hero Section */}
        <section className="bg-white rounded-3xl p-8 sm:p-12 border border-gray-200 shadow-sm relative overflow-hidden">
          {/* Decorative background glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-red-100/50 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-red-50/60 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider mb-4">
              <span>Plataforma Oficial</span>
              <span className="w-1 h-1 rounded-full bg-red-600" />
              <span>Ingeniería de Sistemas • UFPS</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-gray-900 tracking-tight leading-tight">
              Gestión, Trazabilidad y Seguimiento de Prácticas
            </h1>

            <p className="mt-4 text-base sm:text-lg text-gray-600 leading-relaxed font-normal">
              Sistema integral basado en máquina de estados e inmutabilidad del ciclo de vida para estudiantes, docentes supervisores, tutores empresariales y dirección de programa.
            </p>

            {/* Call to Actions */}
            <div className="mt-8 flex flex-wrap gap-4 items-center">
              {currentUser ? (
                <>
                  <Link
                    href="/admin/usuarios"
                    className="flex items-center gap-2 px-6 py-3.5 bg-red-700 hover:bg-red-800 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all"
                  >
                    <Users className="w-4 h-4" />
                    <span>Gestión de Usuarios (HU01)</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="flex items-center gap-2 px-6 py-3.5 bg-red-700 hover:bg-red-800 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Iniciar Sesión en el Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/admin/usuarios"
                    className="flex items-center gap-2 px-6 py-3.5 bg-white hover:bg-gray-50 text-gray-800 font-bold text-sm rounded-xl border border-gray-300 shadow-sm transition-all"
                  >
                    <ShieldCheck className="w-4 h-4 text-red-700" />
                    <span>Ir a Módulo HU01</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Feature Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-7 rounded-2xl border border-gray-200 shadow-sm hover:border-red-200 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">HU01 - Seguridad & Usuarios</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Registro unívoco de usuarios con validación de documento, correo institucional, prevención de duplicados y desactivación con revocación de tokens.
            </p>
            <Link
              href="/admin/usuarios"
              className="inline-flex items-center gap-1 text-xs font-bold text-red-700 hover:text-red-800 mt-4"
            >
              <span>Acceder al Módulo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white p-7 rounded-2xl border border-gray-200 shadow-sm hover:border-red-200 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
              <GitBranch className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">Máquina de Estados Nuclear</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Ciclo de vida estricto de 11 estados con reglas RN-01 (Convenio), RN-02 (Presentación), RN-06 (ARL obligatoria) y RN-07/08 (Aprobación Dual).
            </p>
          </div>

          <div className="bg-white p-7 rounded-2xl border border-gray-200 shadow-sm hover:border-red-200 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-all">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">Conexión Supabase PostgreSQL</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              11 tablas relacionales, auditoría inmutable en tiempo real y compatibilidad con buckets para expedientes en PDF.
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-gray-200 py-6 text-center text-xs text-gray-500">
        <p className="font-semibold text-gray-700">SIGETRAP • Sistema de Gestión y Trazabilidad de Prácticas</p>
        <p className="text-gray-400 mt-1">Programa de Ingeniería de Sistemas • Universidad Francisco de Paula Santander</p>
      </footer>
    </div>
  );
}
