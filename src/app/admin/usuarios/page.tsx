'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  UserPlus,
  Users,
  Search,
  Filter,
  UserCheck,
  UserX,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Mail,
  FileText,
  Building,
  GraduationCap,
  RefreshCw,
  PowerOff,
  Check,
  TrendingUp,
  ShieldAlert,
  Copy,
  CheckCheck,
  Phone,
  IdCard,
  ArrowLeft,
  ShieldX,
  UserCog,
  BadgeCheck,
  X,
} from 'lucide-react';
import { Role, UserStatus, UserResponseDTO } from '@/types';

export default function AdminUsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [users, setUsers] = useState<UserResponseDTO[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'habilitar' | 'registrar'>('habilitar');

  // Estado para la pestaña de "Habilitación/Desactivación Rápida por Documento"
  const [enableForm, setEnableForm] = useState({
    documentNumber: '',
  });
  const [isVerifyingDoc, setIsVerifyingDoc] = useState(false);
  const [docVerificationResult, setDocVerificationResult] = useState<{
    exists: boolean;
    user?: UserResponseDTO | null;
    status?: UserStatus;
  } | null>(null);
  const [enableSubmitting, setEnableSubmitting] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [enableSuccess, setEnableSuccess] = useState<string | null>(null);
  const [disableSubmitting, setDisableSubmitting] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableSuccess, setDisableSuccess] = useState<string | null>(null);

  // Estados del Formulario de Registro Completo
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    documentType: 'CC',
    documentNumber: '',
    phone: '',
    role: 'ESTUDIANTE' as Role,
    studentCode: '',
    academicAverage: '',
    approvedCredits: '',
    program: 'Ingeniería de Sistemas',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ message: string; field?: string } | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Estados para acción de Desactivación / Habilitación en la tabla
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; message: string; type: 'success' | 'error' } | null>(null);

  // Cargar y validar usuario autenticado
  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
        } else {
          setCurrentUser(null);
        }
      })
      .catch((e) => {
        console.error(e);
        setCurrentUser(null);
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });
  }, []);

  // Cargar listado de usuarios
  const loadUsers = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);

      const res = await fetch(`/api/v1/usuarios?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.data) {
        setUsers(data.data.items || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingList(false);
    }
  }, [roleFilter, statusFilter, searchTerm]);

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      loadUsers();
    }
  }, [currentUser, loadUsers]);

  // Verificar Documento en tiempo real (muestra el usuario y estado actual)
  const handleVerifyDocument = async (doc: string) => {
    const cleanDoc = doc.trim();
    if (!cleanDoc || cleanDoc.length < 3) {
      setDocVerificationResult(null);
      return;
    }

    setIsVerifyingDoc(true);
    try {
      const res = await fetch(`/api/v1/usuarios/verificar-identidad?documentNumber=${encodeURIComponent(cleanDoc)}`);
      const data = await res.json();

      if (data.success && data.data) {
        if (data.data.existsByDocument && data.data.user) {
          setDocVerificationResult({
            exists: true,
            user: data.data.user,
            status: data.data.user.status,
          });
        } else {
          setDocVerificationResult({ exists: false, user: null });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsVerifyingDoc(false);
    }
  };

  // Habilitar Usuario únicamente por Documento
  const handleEnableByDocument = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanDoc = enableForm.documentNumber.trim();
    if (!cleanDoc || cleanDoc.length < 3) {
      setEnableError('Ingresa un número de documento válido (mínimo 3 caracteres).');
      return;
    }

    setEnableSubmitting(true);
    setEnableError(null);
    setEnableSuccess(null);
    setDisableError(null);
    setDisableSuccess(null);

    try {
      const res = await fetch('/api/v1/usuarios/habilitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentNumber: cleanDoc }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setEnableError(data.error?.message || 'No fue posible habilitar al usuario');
        return;
      }

      setEnableSuccess(data.data.message || '¡Usuario habilitado exitosamente!');
      if (data.data.user) {
        setDocVerificationResult({
          exists: true,
          user: data.data.user,
          status: data.data.user.status,
        });
      } else {
        handleVerifyDocument(cleanDoc);
      }
      loadUsers();
    } catch (err) {
      console.error(err);
      setEnableError('Error de red al habilitar el usuario.');
    } finally {
      setEnableSubmitting(false);
    }
  };

  // Desactivar Usuario únicamente por Documento
  const handleDisableByDocument = async () => {
    const cleanDoc = enableForm.documentNumber.trim();
    if (!cleanDoc || cleanDoc.length < 3) {
      setDisableError('Ingresa un número de documento válido (mínimo 3 caracteres).');
      return;
    }

    setDisableSubmitting(true);
    setDisableError(null);
    setDisableSuccess(null);
    setEnableError(null);
    setEnableSuccess(null);

    try {
      const res = await fetch('/api/v1/usuarios/deshabilitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentNumber: cleanDoc }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setDisableError(data.error?.message || 'No fue posible desactivar al usuario');
        return;
      }

      setDisableSuccess(data.data.message || '¡Usuario desactivado exitosamente!');
      if (data.data.user) {
        setDocVerificationResult({
          exists: true,
          user: data.data.user,
          status: data.data.user.status,
        });
      } else {
        handleVerifyDocument(cleanDoc);
      }
      loadUsers();
    } catch (err) {
      console.error(err);
      setDisableError('Error de red al desactivar el usuario.');
    } finally {
      setDisableSubmitting(false);
    }
  };

  // Copiar al portapapeles
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Registro Completo de Usuario
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const payload: any = {
        ...formData,
        academicAverage: formData.academicAverage ? parseFloat(formData.academicAverage) : undefined,
        approvedCredits: formData.approvedCredits ? parseInt(formData.approvedCredits, 10) : undefined,
      };
      if (formData.role !== 'ESTUDIANTE') {
        delete payload.studentCode;
        delete payload.academicAverage;
        delete payload.approvedCredits;
      }

      const res = await fetch('/api/v1/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setFormError({
          message: data.error?.message || 'Error al registrar el usuario',
          field: data.error?.details?.field,
        });
        setIsSubmitting(false);
        return;
      }

      setFormSuccess(`¡Usuario "${data.data.name}" registrado y habilitado exitosamente!`);
      setFormData({
        name: '',
        email: '',
        password: '',
        documentType: 'CC',
        documentNumber: '',
        phone: '',
        role: 'ESTUDIANTE',
        studentCode: '',
        academicAverage: '',
        approvedCredits: '',
        program: 'Ingeniería de Sistemas',
      });
      loadUsers();
    } catch (err) {
      console.error(err);
      setFormError({ message: 'Error de red al procesar el registro.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Desactivación de Cuenta desde la Tabla
  const handleDeactivate = async (userId: string, userName: string) => {
    if (!confirm(`¿Confirma la desactivación de "${userName}"? Esto revoca inmediatamente todas sus sesiones activas.`)) {
      return;
    }

    setActionLoadingId(userId);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/v1/usuarios/${userId}/deactivate`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setActionFeedback({
          id: userId,
          message: 'Cuenta desactivada y sesiones revocadas exitosamente',
          type: 'success',
        });
        loadUsers();
        if (enableForm.documentNumber.trim()) {
          handleVerifyDocument(enableForm.documentNumber.trim());
        }
      } else {
        setActionFeedback({
          id: userId,
          message: data.error?.message || 'Error al desactivar la cuenta',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ id: userId, message: 'Error de red', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Habilitación / Activación de Cuenta desde la Tabla
  const handleActivate = async (userId: string) => {
    setActionLoadingId(userId);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/v1/usuarios/${userId}/activate`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setActionFeedback({
          id: userId,
          message: 'Cuenta habilitada exitosamente (ACTIVO)',
          type: 'success',
        });
        loadUsers();
        if (enableForm.documentNumber.trim()) {
          handleVerifyDocument(enableForm.documentNumber.trim());
        }
      } else {
        setActionFeedback({
          id: userId,
          message: data.error?.message || 'Error al habilitar la cuenta',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ id: userId, message: 'Error de red', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <Navbar currentUser={currentUser} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-red-700" />
            <p className="text-sm font-semibold text-slate-600">Verificando permisos de acceso...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser || currentUser.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <Navbar currentUser={currentUser} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center border border-slate-200 shadow-xl shadow-slate-200/50 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mx-auto border border-red-200">
              <ShieldX className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Acceso Restringido</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Este módulo de administración de usuarios y seguridad es exclusivo para usuarios con rol de <strong>Administrador del Sistema</strong>.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/login"
                className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <span>Iniciar Sesión como Administrador</span>
              </Link>
              <Link
                href="/"
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver al Inicio</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeCount = users.filter((u) => u.status === 'ACTIVO' && u.isActive).length;
  const inactiveCount = users.filter((u) => u.status === 'INACTIVO' || !u.isActive).length;

  const getRoleBadge = (role: Role) => {
    const map: Record<Role, { bg: string }> = {
      ADMIN: { bg: 'bg-red-50 text-red-700 border-red-200' },
      DIRECTOR_PROGRAMA: { bg: 'bg-amber-50 text-amber-800 border-amber-200' },
      DOCENTE_PRACTICA: { bg: 'bg-blue-50 text-blue-700 border-blue-200' },
      TUTOR_EMPRESARIAL: { bg: 'bg-purple-50 text-purple-700 border-purple-200' },
      ESTUDIANTE: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    };
    const c = map[role] || { bg: 'bg-gray-50 text-gray-700 border-gray-200' };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${c.bg}`}>
        {role.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Module Header Banner */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xl shadow-slate-200/40 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-red-100/50 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 w-2.5 h-full bg-red-700" />

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
                <Shield className="w-3.5 h-3.5 text-red-600" />
                <span>Panel de Administración • Cuentas & Seguridad</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Habilitación y Control de Usuarios
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                Búsqueda por cédula/documento, visualización del estado en tiempo real, activación y desactivación de accesos institucionales.
              </p>
            </div>

            <button
              onClick={loadUsers}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-red-700 ${isLoadingList ? 'animate-spin' : ''}`} />
              <span>Actualizar Directorio</span>
            </button>
          </div>
        </div>

        {/* Statistical Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Cuentas</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{users.length}</div>
              <span className="text-[11px] text-slate-500 font-medium">Registrados en la base de datos</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Cuentas Habilitadas</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">{activeCount}</div>
              <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Acceso activo
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Inactivas / Desactivadas</span>
              <div className="text-2xl font-black text-red-700 mt-1">{inactiveCount}</div>
              <span className="text-[11px] text-red-600 font-medium">Sesiones revocadas</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-700">
              <UserX className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Roles del Sistema</span>
              <div className="text-2xl font-black text-slate-900 mt-1">5</div>
              <span className="text-[11px] text-slate-500 font-medium">Control de acceso RBAC</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-700">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Two Columns Grid: Operations Tabbed Card & Directory */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* ==================================================================== */}
          {/* COLUMNA 1: HABILITACIÓN POR DOCUMENTO Y REGISTRO (TABS) */}
          {/* ==================================================================== */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/40 overflow-hidden sticky top-24">
              
              {/* Tab Selector Header */}
              <div className="bg-slate-50 p-2 border-b border-slate-200 flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('habilitar')}
                  className={`flex-1 py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'habilitar'
                      ? 'bg-red-700 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <BadgeCheck className="w-4 h-4" />
                  <span>Habilitar por Documento</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('registrar')}
                  className={`flex-1 py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'registrar'
                      ? 'bg-red-700 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Registro Completo</span>
                </button>
              </div>

              {/* TAB 1: HABILITACIÓN / DESACTIVACIÓN RÁPIDA POR DOCUMENTO */}
              {activeTab === 'habilitar' && (
                <div className="p-6 space-y-4 animate-fadeIn">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Habilitar / Desactivar por Documento</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Digita el número de documento para consultar su estado y habilitar o deshabilitar la cuenta.
                    </p>
                  </div>

                  {enableError && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                      <div>
                        <span className="font-bold block text-red-900">Error:</span>
                        <span>{enableError}</span>
                      </div>
                    </div>
                  )}

                  {enableSuccess && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-3 animate-fadeIn">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <span className="font-bold block text-emerald-900">Operación Exitosa:</span>
                        <span>{enableSuccess}</span>
                      </div>
                    </div>
                  )}

                  {disableError && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                      <div>
                        <span className="font-bold block text-red-900">Error:</span>
                        <span>{disableError}</span>
                      </div>
                    </div>
                  )}

                  {disableSuccess && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-3 animate-fadeIn">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <span className="font-bold block text-emerald-900">Operación Exitosa:</span>
                        <span>{disableSuccess}</span>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleEnableByDocument} className="space-y-4">
                    {/* Documento con Verificación en Vivo */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Número de Documento / Cédula *
                        </label>
                        {isVerifyingDoc && (
                          <span className="text-[10px] text-red-700 font-semibold flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Buscando...
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <IdCard className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={enableForm.documentNumber}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEnableForm({ documentNumber: val });
                            handleVerifyDocument(val);
                          }}
                          placeholder="Ej. 1090123456"
                          className="w-full pl-10 pr-10 py-3 bg-white border-2 border-slate-300 rounded-xl text-sm text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-red-600 transition-all shadow-sm"
                        />
                        {enableForm.documentNumber && (
                          <button
                            type="button"
                            onClick={() => {
                              setEnableForm({ documentNumber: '' });
                              setDocVerificationResult(null);
                              setEnableSuccess(null);
                              setEnableError(null);
                              setDisableSuccess(null);
                              setDisableError(null);
                            }}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Tarjeta de Información y Estado del Usuario Encontrado */}
                      {docVerificationResult && (
                        <div className="mt-3 text-xs animate-fadeIn">
                          {docVerificationResult.exists && docVerificationResult.user ? (
                            <div className={`p-4 rounded-2xl border transition-all ${
                              docVerificationResult.user.status === 'ACTIVO' && docVerificationResult.user.isActive
                                ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-sm'
                                : 'bg-red-50/90 border-red-300 text-red-950 shadow-sm'
                            }`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-sm text-slate-900">
                                      {docVerificationResult.user.name}
                                    </span>
                                    {getRoleBadge(docVerificationResult.user.role)}
                                  </div>
                                  <p className="text-[11px] text-slate-700 font-medium">
                                    Doc: <strong className="text-slate-900">{docVerificationResult.user.documentNumber}</strong> • Correo: <strong className="text-slate-900">{docVerificationResult.user.email}</strong>
                                  </p>
                                </div>
                                
                                <div className="text-right shrink-0">
                                  {docVerificationResult.user.status === 'ACTIVO' && docVerificationResult.user.isActive ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 border border-emerald-300 text-emerald-800 shadow-sm">
                                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                                      ACTIVO / HABILITADO
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-red-100 border border-red-300 text-red-800 shadow-sm">
                                      <span className="w-2 h-2 rounded-full bg-red-600" />
                                      {docVerificationResult.user.status === 'BLOQUEADO' ? 'BLOQUEADO' : 'INACTIVO / DESHABILITADO'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-slate-700">
                                  {docVerificationResult.user.status === 'ACTIVO' && docVerificationResult.user.isActive
                                    ? '🟢 Cuenta actualmente habilitada con acceso total al sistema.'
                                    : '🔴 Cuenta actualmente deshabilitada (sesiones revocadas).'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold block text-amber-950">Documento no registrado en el sistema</span>
                                  <span className="text-[11px] text-amber-800">
                                    No se encontró ningún usuario con este documento. Usa la pestaña "Registro Completo" para crearlo.
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, documentNumber: enableForm.documentNumber });
                                  setActiveTab('registrar');
                                }}
                                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[10px] shrink-0 cursor-pointer shadow-sm"
                              >
                                Registrar
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Botones de acción (Habilitar / Desactivar) */}
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <button
                        type="submit"
                        disabled={enableSubmitting || disableSubmitting || !enableForm.documentNumber.trim()}
                        className={`py-3.5 px-4 font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed ${
                          docVerificationResult?.user?.status === 'ACTIVO' && docVerificationResult.user.isActive
                            ? 'bg-slate-100 hover:bg-emerald-50 text-emerald-800 border-2 border-emerald-600'
                            : 'bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white shadow-emerald-700/20'
                        }`}
                      >
                        {enableSubmitting ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <BadgeCheck className="w-4 h-4" />
                            <span>
                              {docVerificationResult?.user?.status === 'ACTIVO' && docVerificationResult.user.isActive
                                ? 'Re-habilitar'
                                : 'Habilitar Cuenta'}
                            </span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDisableByDocument}
                        disabled={enableSubmitting || disableSubmitting || !enableForm.documentNumber.trim()}
                        className={`py-3.5 px-4 font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed ${
                          docVerificationResult?.user?.status === 'INACTIVO' || (docVerificationResult?.exists && !docVerificationResult?.user?.isActive)
                            ? 'bg-slate-100 hover:bg-red-50 text-red-800 border-2 border-red-600'
                            : 'bg-red-700 hover:bg-red-800 active:bg-red-900 text-white shadow-red-700/20'
                        }`}
                      >
                        {disableSubmitting ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <PowerOff className="w-4 h-4" />
                            <span>
                              {docVerificationResult?.user?.status === 'INACTIVO' || (docVerificationResult?.exists && !docVerificationResult?.user?.isActive)
                                ? 'Ya Desactivada'
                                : 'Desactivar Cuenta'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 2: REGISTRO COMPLETO */}
              {activeTab === 'registrar' && (
                <div className="p-6 space-y-4 animate-fadeIn">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Formulario de Registro Completo</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Registro manual de cuenta con asignación de contraseña y datos institucionales.
                    </p>
                  </div>

                  {formError && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                      <div>
                        <span className="font-bold block text-red-900">Validación de Cuenta:</span>
                        <span>{formError.message}</span>
                      </div>
                    </div>
                  )}

                  {formSuccess && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-3 animate-fadeIn">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <span className="font-bold block text-emerald-900">¡Registro Exitoso!</span>
                        <span>{formSuccess}</span>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Nombre Completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej. Ing. Carlos Pérez"
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-semibold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-red-600 transition-all shadow-sm"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Tipo
                        </label>
                        <select
                          value={formData.documentType}
                          onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-red-600 transition-all shadow-sm"
                        >
                          <option value="CC">CC</option>
                          <option value="TI">TI</option>
                          <option value="CE">CE</option>
                          <option value="PASAPORTE">PAS</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Número Documento *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.documentNumber}
                          onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                          placeholder="Ej. 1090123456"
                          className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all shadow-sm ${
                            formError?.field === 'documentNumber' ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300'
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Correo Institucional *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="usuario@ufps.edu.co"
                          className={`w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl text-sm text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all shadow-sm ${
                            formError?.field === 'email' ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300'
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Contraseña Inicial *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all shadow-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Rol en la Plataforma *
                      </label>
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all cursor-pointer shadow-sm"
                      >
                        <option value="ESTUDIANTE">ESTUDIANTE (Practicante)</option>
                        <option value="DOCENTE_PRACTICA">DOCENTE_PRACTICA (Supervisor)</option>
                        <option value="TUTOR_EMPRESARIAL">TUTOR_EMPRESARIAL (Empresa)</option>
                        <option value="DIRECTOR_PROGRAMA">DIRECTOR_PROGRAMA (Programa)</option>
                        <option value="ADMIN">ADMIN (Administrador)</option>
                      </select>
                    </div>

                    {formData.role === 'ESTUDIANTE' && (
                      <div className="p-4 bg-red-50/50 border border-red-100 rounded-2xl space-y-3 animate-fadeIn">
                        <div className="flex items-center gap-2 text-xs font-bold text-red-900">
                          <GraduationCap className="w-4 h-4 text-red-700" />
                          <span>Datos Académicos del Estudiante</span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Código Estudiantil
                          </label>
                          <input
                            type="text"
                            value={formData.studentCode}
                            onChange={(e) => setFormData({ ...formData, studentCode: e.target.value })}
                            placeholder="Ej. 1152001"
                            className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-red-600 transition-all shadow-sm"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Promedio Académico
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="5"
                              value={formData.academicAverage}
                              onChange={(e) => setFormData({ ...formData, academicAverage: e.target.value })}
                              placeholder="Ej. 4.25 (0.0 a 5.0)"
                              className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-red-600 transition-all shadow-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Créditos Aprobados
                            </label>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={formData.approvedCredits}
                              onChange={(e) => setFormData({ ...formData, approvedCredits: e.target.value })}
                              placeholder="Ej. 130 créditos"
                              className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-red-600 transition-all shadow-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full mt-2 py-3.5 px-4 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          <span>Crear Usuario</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* ==================================================================== */}
          {/* COLUMNA 2: DIRECTORIO DE USUARIOS Y ACCIONES */}
          {/* ==================================================================== */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por documento, nombre o correo..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 font-semibold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-red-600 transition-all shadow-sm"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 cursor-pointer shadow-sm"
                >
                  <option value="">Todos los Roles</option>
                  <option value="ADMIN">Admin</option>
                  <option value="DIRECTOR_PROGRAMA">Director</option>
                  <option value="DOCENTE_PRACTICA">Docente</option>
                  <option value="TUTOR_EMPRESARIAL">Tutor</option>
                  <option value="ESTUDIANTE">Estudiante</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 cursor-pointer shadow-sm"
                >
                  <option value="">Todos los Estados</option>
                  <option value="ACTIVO">Habilitados</option>
                  <option value="INACTIVO">Desactivados</option>
                  <option value="BLOQUEADO">Bloqueados</option>
                </select>
              </div>
            </div>

            {/* User List Container */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/40 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/60">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-700" />
                  <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Directorio de Cuentas ({users.length})
                  </h3>
                </div>
              </div>

              {isLoadingList ? (
                <div className="p-16 text-center text-slate-400">
                  <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-red-700" />
                  <p className="text-xs font-semibold text-slate-600">Consultando directorio en tiempo real...</p>
                </div>
              ) : users.length === 0 ? (
                <div className="p-16 text-center text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
                  <p className="text-sm font-bold text-slate-700">No se encontraron usuarios</p>
                  <p className="text-xs text-slate-400 mt-1">Ajusta los términos de búsqueda o registra un nuevo usuario.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const isCurrentUser = currentUser?.id === u.id;
                    const isActive = u.status === 'ACTIVO' && u.isActive;
                    const feedback = actionFeedback?.id === u.id ? actionFeedback : null;

                    return (
                      <div
                        key={u.id}
                        className={`p-5 hover:bg-slate-50/80 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                          !isActive ? 'bg-red-50/20' : ''
                        }`}
                      >
                        {/* User Profile Details */}
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`w-11 h-11 rounded-2xl font-black flex items-center justify-center shrink-0 text-sm border shadow-sm ${
                              isActive
                                ? 'bg-gradient-to-br from-red-600 to-red-800 text-white border-red-700'
                                : 'bg-slate-100 text-slate-400 border-slate-200'
                            }`}
                          >
                            {u.name.charAt(0)}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-extrabold text-slate-900">{u.name}</span>
                              {isCurrentUser && (
                                <span className="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded border border-slate-200">
                                  Tú
                                </span>
                              )}
                              {getRoleBadge(u.role)}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                              {/* Document with copy button */}
                              <button
                                type="button"
                                onClick={() => handleCopy(u.documentNumber, `doc-${u.id}`)}
                                title="Copiar documento"
                                className="flex items-center gap-1 font-mono hover:text-slate-800 transition-colors cursor-pointer"
                              >
                                <IdCard className="w-3.5 h-3.5 text-slate-400" />
                                <span>{u.documentType} {u.documentNumber}</span>
                                {copiedId === `doc-${u.id}` ? (
                                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-300 opacity-60" />
                                )}
                              </button>

                              {/* Email with copy button */}
                              <button
                                type="button"
                                onClick={() => handleCopy(u.email, `email-${u.id}`)}
                                title="Copiar correo"
                                className="flex items-center gap-1 hover:text-slate-800 transition-colors cursor-pointer"
                              >
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                <span>{u.email}</span>
                                {copiedId === `email-${u.id}` ? (
                                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-300 opacity-60" />
                                )}
                              </button>
                            </div>

                            {/* Detalle académico para rol ESTUDIANTE */}
                            {u.role === 'ESTUDIANTE' && (u.studentCode || u.academicAverage !== null || u.approvedCredits !== null) && (
                              <div className="flex items-center gap-2 flex-wrap text-[11px] mt-2">
                                {u.studentCode && (
                                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono font-bold border border-slate-200">
                                    Cód: {u.studentCode}
                                  </span>
                                )}
                                {u.academicAverage !== null && u.academicAverage !== undefined && (
                                  <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-bold">
                                    Promedio: {Number(u.academicAverage).toFixed(2)}
                                  </span>
                                )}
                                {u.approvedCredits !== null && u.approvedCredits !== undefined && (
                                  <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md font-bold">
                                    Créditos: {u.approvedCredits}
                                  </span>
                                )}
                              </div>
                            )}

                            {feedback && (
                              <div
                                className={`text-[11px] font-bold mt-2 flex items-center gap-1 ${
                                  feedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'
                                }`}
                              >
                                <span>•</span>
                                <span>{feedback.message}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status Badge & Action Controls */}
                        <div className="flex items-center gap-3 self-end sm:self-center">
                          {/* Status Badge */}
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-red-50 text-red-800 border-red-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isActive ? 'bg-emerald-600 animate-pulse' : 'bg-red-600'
                              }`}
                            />
                            {isActive ? 'HABILITADO' : u.status === 'BLOQUEADO' ? 'BLOQUEADO' : 'INACTIVO'}
                          </span>

                          {/* Action Button: Desactivar / Habilitar */}
                          {!isCurrentUser && (
                            <>
                              {isActive ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeactivate(u.id, u.name)}
                                  disabled={actionLoadingId === u.id}
                                  title="Desactivar cuenta y revocar sesiones"
                                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 active:bg-red-200 border border-red-200 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
                                >
                                  {actionLoadingId === u.id ? (
                                    <div className="w-3.5 h-3.5 border-2 border-red-700 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <>
                                      <PowerOff className="w-3.5 h-3.5" />
                                      <span>Desactivar</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleActivate(u.id)}
                                  disabled={actionLoadingId === u.id}
                                  title="Habilitar cuenta"
                                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
                                >
                                  {actionLoadingId === u.id ? (
                                    <div className="w-3.5 h-3.5 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Habilitar</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}