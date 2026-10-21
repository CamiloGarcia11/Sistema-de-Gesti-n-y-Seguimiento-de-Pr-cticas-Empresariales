'use client';

// ==============================================================================
// SIGETRAP - Dictamen de Elegibilidad Académica del Estudiante (RN-02)
// Vista institucional para verificación de requisitos y habilitación para prácticas
// ==============================================================================

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  GraduationCap,
  BookOpen,
  Award,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  Loader2,
} from 'lucide-react';
import { UserResponseDTO, StudentEligibilityDTO } from '@/types';

export default function DictamenEstudiantePage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [eligibility, setEligibility] = useState<StudentEligibilityDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
        }
      })
      .catch((e) => console.error(e));

    fetch('/api/v1/estudiantes/elegibilidad')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setEligibility(data.data);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-600 mb-1">
            <ShieldCheck className="w-4 h-4" />
            Dictamen Académico Oficial · RN-02
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            Elegibilidad y Estado Académico para Prácticas
          </h1>
          <p className="text-sm text-slate-600">
            Concepto de verificación académica emitido por el sistema para postulación y formalización de práctica empresarial.
          </p>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
            <p className="text-sm text-slate-500 font-medium">Consultando expediente académico institucional...</p>
          </div>
        ) : eligibility ? (
          <div className="space-y-6">
            {/* Tarjeta de Dictamen Principal */}
            <div
              className={`rounded-2xl p-6 border shadow-sm ${
                eligibility.isEligible
                  ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200'
                  : 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`p-3 rounded-xl ${
                    eligibility.isEligible ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                  }`}
                >
                  {eligibility.isEligible ? (
                    <CheckCircle2 className="w-8 h-8" />
                  ) : (
                    <AlertCircle className="w-8 h-8" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full ${
                        eligibility.isEligible
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {eligibility.isEligible ? 'Habilitado Oficialmente' : 'No Habilitado Temporalmente'}
                    </span>
                    <span className="text-xs text-slate-500">Plan de Estudios Ingeniería de Sistemas</span>
                  </div>

                  <h2 className="text-xl font-black text-slate-800">
                    {eligibility.isEligible
                      ? 'Cumple con los requisitos para iniciar y formalizar prácticas'
                      : 'Pendiente por cumplimiento de requisitos mínimos de elegibilidad'}
                  </h2>

                  <p className="text-sm text-slate-600 mt-1">
                    Estudiante: <strong className="text-slate-800">{eligibility.studentName}</strong> (Código: {eligibility.studentCode || 'N/A'})
                  </p>
                </div>
              </div>
            </div>

            {/* Cuadrícula de Métricas de Elegibilidad */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Créditos aprobados */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-red-600" />
                    Créditos Aprobados
                  </span>
                  {(eligibility.approvedCredits ?? 0) >= eligibility.requiredCredits ? (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Cumple
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Insuficiente
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-black text-slate-800">{eligibility.approvedCredits ?? 0}</span>
                  <span className="text-xs text-slate-500">/ {eligibility.requiredCredits} requeridos (mínimo)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-red-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(((eligibility.approvedCredits ?? 0) / eligibility.requiredCredits) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Promedio académico */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-red-600" />
                    Promedio Ponderado Acumulado
                  </span>
                  {(eligibility.academicAverage ?? 0) >= eligibility.minimumAverage ? (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Cumple
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Insuficiente
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-black text-slate-800">
                    {(eligibility.academicAverage ?? 0).toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-500">/ {eligibility.minimumAverage.toFixed(1)} mínimo requerido</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(((eligibility.academicAverage ?? 0) / 5.0) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Accesos rápidos */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800">Próximos pasos en el flujo de práctica</h4>
                <p className="text-xs text-slate-500">
                  Explora convocatorias vigentes o realiza seguimiento a tus horas radicadas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/vacantes"
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <FileCheck2 className="w-4 h-4" />
                  Ver Vacantes
                </Link>
                <Link
                  href="/estudiantes/informes"
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <BookOpen className="w-4 h-4" />
                  Bitácoras e Informes
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm text-slate-600">No se pudieron cargar los datos de elegibilidad en este momento.</p>
          </div>
        )}
      </main>
    </div>
  );
}
