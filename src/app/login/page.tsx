'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  GraduationCap,
  ArrowRight,
  Sparkles,
  Building2,
  FileCheck2,
  Check,
  ChevronRight,
  Layers,
  HelpCircle,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  // Cuentas Demo preconfiguradas
  const demoAccounts = [
    {
      role: 'ADMIN',
      label: 'Administrador',
      email: 'admin.sigetrap@ufps.edu.co',
      password: 'Password123!',
      tag: 'Control Total',
      bgClass: 'hover:border-red-500 hover:bg-red-50/70',
    },
    {
      role: 'DIRECTOR',
      label: 'Director de Programa',
      email: 'director.sistemas@ufps.edu.co',
      password: 'Password123!',
      tag: 'Asignación & Convenios',
      bgClass: 'hover:border-amber-500 hover:bg-amber-50/70',
    },
    {
      role: 'DOCENTE',
      label: 'Docente Supervisor',
      email: 'docente.practica@ufps.edu.co',
      password: 'Password123!',
      tag: 'Aprobación & Visitas',
      bgClass: 'hover:border-blue-500 hover:bg-blue-50/70',
    },
    {
      role: 'TUTOR',
      label: 'Tutor Empresarial',
      email: 'tutor@techinnovations.co',
      password: 'Password123!',
      tag: 'Empresa & Evaluación',
      bgClass: 'hover:border-purple-500 hover:bg-purple-50/70',
    },
    {
      role: 'ESTUDIANTE',
      label: 'Estudiante Practicante',
      email: 'estudiante@ufps.edu.co',
      password: 'Password123!',
      tag: 'Aspirante / Practicante',
      bgClass: 'hover:border-emerald-500 hover:bg-emerald-50/70',
    },
  ];

  const handleSelectDemo = (accEmail: string, accPass: string) => {
    setEmail(accEmail);
    setPassword(accPass);
    setErrorMsg(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(
          data.error?.message ||
            'No fue posible iniciar sesión. Verifique sus credenciales.'
        );
        setIsLoading(false);
        return;
      }

      setSuccessMsg(`¡Autenticación exitosa! Bienvenido(a), ${data.data.user.name}.`);
      setTimeout(() => {
        if (data.data.user.role === 'ADMIN') {
          router.push('/admin/usuarios');
        } else {
          router.push('/');
        }
        router.refresh();
      }, 700);
    } catch (err) {
      console.error(err);
      setErrorMsg('Error de red al intentar comunicarse con el servidor.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between font-sans selection:bg-red-500 selection:text-white">
      {/* Top micro-bar */}
      <div className="h-1.5 bg-gradient-to-r from-red-800 via-red-600 to-red-900 w-full" />

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
        <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl shadow-slate-300/70 border border-slate-200/80 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
          
          {/* ==================================================================== */}
          {/* COLUMNA IZQUIERDA: HERO INSTITUCIONAL BRANDING */}
          {/* ==================================================================== */}
          <div className="lg:col-span-6 bg-gradient-to-br from-red-900 via-red-800 to-red-950 p-8 sm:p-12 text-white flex flex-col justify-between relative overflow-hidden">
            {/* Background glowing effects */}
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-red-600/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-red-500/20 rounded-full blur-3xl pointer-events-none" />
            
            {/* Grid Pattern overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

            <div className="relative z-10">
              {/* Header Logo */}
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white text-red-800 flex items-center justify-center font-black text-2xl shadow-xl shadow-black/20">
                  S
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black tracking-tight text-white">SIGETRAP</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-500/30 border border-red-400/40 text-red-100">
                      v1.0
                    </span>
                  </div>
                  <p className="text-xs text-red-200 font-medium tracking-wide">
                    Ingeniería de Sistemas • UFPS
                  </p>
                </div>
              </div>

              {/* Tagline */}
              <div className="mt-12 space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs text-red-100 font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                  <span>Plataforma Oficial de Prácticas Empresariales</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                  Trazabilidad Total y Seguridad en cada fase de tu Práctica.
                </h2>
                <p className="text-sm text-red-100/80 leading-relaxed max-w-md">
                  Gestiona convenios, asignación formal con validación de ARL, planes de trabajo con aprobación dual y seguimiento académico en tiempo real.
                </p>
              </div>

              {/* Glassmorphic Feature Highlights */}
              <div className="mt-8 space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-xs font-medium">
                  <div className="w-7 h-7 rounded-xl bg-red-600/60 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-white" />
                  </div>
                  <span>Afiliación y validación de ARL previa al inicio de actividades</span>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-xs font-medium">
                  <div className="w-7 h-7 rounded-xl bg-red-600/60 flex items-center justify-center shrink-0">
                    <FileCheck2 className="w-4 h-4 text-white" />
                  </div>
                  <span>Aprobación digital dual del plan de trabajo por Tutor y Docente</span>
                </div>
              </div>
            </div>

            {/* Bottom Footer Quote */}
            <div className="relative z-10 pt-8 border-t border-white/10 mt-8 flex items-center justify-between text-xs text-red-200/80">
              <span>Universidad Francisco de Paula Santander</span>
              <span>Cúcuta, Colombia</span>
            </div>
          </div>

          {/* ==================================================================== */}
          {/* COLUMNA DERECHA: FORMULARIO DE ACCESO Y ACCESOS DEMO */}
          {/* ==================================================================== */}
          <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-between bg-white">
            <div>
              {/* Header Title */}
              <div className="mb-8">
                <span className="text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50 px-2.5 py-1 rounded-md border border-red-100">
                  Acceso Seguro al Portal
                </span>
                <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-2">
                  Iniciar Sesión
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Ingresa con tu correo institucional y contraseña asignada.
                </p>
              </div>

              {/* Feedback Alert Banners */}
              {errorMsg && (
                <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3 animate-fadeIn shadow-sm">
                  <div className="p-1 rounded-lg bg-red-100 text-red-700 shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <span className="font-bold block text-red-900">Acceso Denegado</span>
                    <span className="text-red-700 mt-0.5 block">{errorMsg}</span>
                  </div>
                </div>
              )}

              {successMsg && (
                <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-3 animate-fadeIn shadow-sm">
                  <div className="p-1 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <span className="font-bold block text-emerald-900">¡Acceso Correcto!</span>
                    <span className="text-emerald-700 mt-0.5 block">{successMsg}</span>
                  </div>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Correo Institucional
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="usuario@ufps.edu.co"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Contraseña
                    </label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember & Options */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 font-medium">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded text-red-700 focus:ring-red-600 w-3.5 h-3.5 border-slate-300"
                    />
                    <span>Recordar sesión</span>
                  </label>
                </div>

                {/* Submit Button in Vibrant UFPS Red */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3.5 px-6 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-700/20 hover:shadow-xl hover:shadow-red-700/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Ingresar al Sistema</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Demo Accounts Pill Grid */}
              <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-red-600" />
                    <span>Probar con Cuentas Demo</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">Autocompletar en 1 clic</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {demoAccounts.map((acc) => {
                    const isSelected = email === acc.email;
                    return (
                      <button
                        key={acc.role}
                        type="button"
                        onClick={() => handleSelectDemo(acc.email, acc.password)}
                        className={`text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-red-50 border-red-300 ring-1 ring-red-400'
                            : `bg-slate-50/70 border-slate-200 ${acc.bgClass}`
                        }`}
                      >
                        <div className="truncate mr-2">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <span>{acc.label}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{acc.tag}</div>
                        </div>
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-red-700 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3" />
                          </div>
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Footer Help */}
            <div className="mt-8 text-center text-xs text-slate-400 border-t border-slate-100 pt-4 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <span>Plataforma Segura SIGETRAP • Ingeniería de Sistemas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Page Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 bg-white border-t border-slate-200">
        © {new Date().getFullYear()} Universidad Francisco de Paula Santander • Todos los derechos reservados
      </footer>
    </div>
  );
}
