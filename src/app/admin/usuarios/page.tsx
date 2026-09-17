'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Sparkles,
  Phone,
  IdCard,
} from 'lucide-react';
import { Role, UserStatus, UserResponseDTO } from '@/types';

export default function AdminUsersPage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [users, setUsers] = useState<UserResponseDTO[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estados del Formulario de Creación (HU01 - Criterio 1)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    documentType: 'CC',
    documentNumber: '',
    phone: '',
    role: 'ESTUDIANTE' as Role,
    studentCode: '',
    program: 'Ingeniería de Sistemas',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ message: string; field?: string } | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Estados para acción de Desactivación / Habilitación (HU01 - Criterio 2)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; message: string; type: 'success' | 'error' } | null>(null);

  // Cargar usuario autenticado
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
    loadUsers();
  }, [loadUsers]);

  // Copiar al portapapeles
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Manejador de Registro de Usuario (HU01 - Criterio 1)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await fetch('/api/v1/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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
      // Limpiar formulario
      setFormData({
        name: '',
        email: '',
        password: '',
        documentType: 'CC',
        documentNumber: '',
        phone: '',
        role: 'ESTUDIANTE',
        studentCode: '',
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

  // Manejador de Desactivación de Cuenta (HU01 - Criterio 2)
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
          message: 'Cuenta desactivada y tokens revocados exitosamente (200 OK)',
          type: 'success',
        });
        loadUsers();
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

  // Manejador de Habilitación / Activación de Cuenta
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

  const activeCount = users.filter((u) => u.status === 'ACTIVO' && u.isActive).length;
  const inactiveCount = users.filter((u) => u.status === 'INACTIVO' || !u.isActive).length;

  const getRoleBadge = (role: Role) => {
    const map: Record<Role, { bg: string; text: string; border: string }> = {
      ADMIN: { bg: 'bg-red-50 text-red-700 border-red-200', text: '', border: '' },
      DIRECTOR_PROGRAMA: { bg: 'bg-amber-50 text-amber-800 border-amber-200', text: '', border: '' },
      DOCENTE_PRACTICA: { bg: 'bg-blue-50 text-blue-700 border-blue-200', text: '', border: '' },
      TUTOR_EMPRESARIAL: { bg: 'bg-purple-50 text-purple-700 border-purple-200', text: '', border: '' },
      ESTUDIANTE: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: '', border: '' },
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
          {/* Decorative accents */}
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-red-100/50 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 w-2.5 h-full bg-red-700" />

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
                <Shield className="w-3.5 h-3.5 text-red-600" />
                <span>HU01 • Seguridad & Gestión de Cuentas</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Registro y Habilitación de Usuarios
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                Validación de unicidad de documento y correo institucional con prevención de duplicados y control de sesiones activas en tiempo real.
              </p>
            </div>

            <button
              onClick={loadUsers}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-red-700 ${isLoadingList ? 'animate-spin' : ''}`} />
              <span>Sincronizar Datos</span>
            </button>
          </div>
        </div>

        {/* Statistical Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Cuentas</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{users.length}</div>
              <span className="text-[11px] text-slate-500 font-medium">Registrados en BD</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Cuentas Activas</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">{activeCount}</div>
              <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Acceso habilitado
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Inactivas / Revocadas</span>
              <div className="text-2xl font-black text-red-700 mt-1">{inactiveCount}</div>
              <span className="text-[11px] text-red-600 font-medium">Sesiones invalidadas</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-700">
              <UserX className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Roles RBAC</span>
              <div className="text-2xl font-black text-slate-900 mt-1">5</div>
              <span className="text-[11px] text-slate-500 font-medium">Seguridad RNF01</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-700">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Main Grid: Form & User Directory */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* ==================================================================== */}
          {/* COLUMNA 1: FORMULARIO DE REGISTRO (CRITERIO 1 - PREVENCIÓN DUPLICADOS) */}
          {/* ==================================================================== */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/40 overflow-hidden sticky top-24">
              {/* Form Header */}
              <div className="bg-gradient-to-r from-red-800 via-red-700 to-red-800 p-6 text-white flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold tracking-tight">Registrar Nuevo Usuario</h2>
                  <p className="text-xs text-red-100">Validación estricta de documento y correo</p>
                </div>
              </div>

              {/* Form Content */}
              <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                {/* Feedback Alerts */}
                {formError && (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3 animate-fadeIn">
                    <div className="p-1 rounded-lg bg-red-100 text-red-700 shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold block text-red-900">Restricción Detectada (Criterio 1):</span>
                      <span className="text-red-700">{formError.message}</span>
                    </div>
                  </div>
                )}

                {formSuccess && (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-3 animate-fadeIn">
                    <div className="p-1 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold block text-emerald-900">¡Registro Completado!</span>
                      <span className="text-emerald-700">{formSuccess}</span>
                    </div>
                  </div>
                )}

                {/* Nombre Completo */}
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
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all font-medium"
                  />
                </div>

                {/* Documento (Tipo y Número) */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Tipo
                    </label>
                    <select
                      value={formData.documentType}
                      onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all font-medium"
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
                      className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all font-medium ${
                        formError?.field === 'documentNumber' ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-200'
                      }`}
                    />
                  </div>
                </div>

                {/* Correo Institucional */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Correo Institucional *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="usuario@ufps.edu.co"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all font-medium ${
                        formError?.field === 'email' ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-200'
                      }`}
                    />
                  </div>
                </div>

                {/* Contraseña Inicial */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contraseña Inicial *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Rol en el Sistema */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Rol en la Plataforma *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all"
                  >
                    <option value="ESTUDIANTE">ESTUDIANTE (Practicante)</option>
                    <option value="DOCENTE_PRACTICA">DOCENTE_PRACTICA (Supervisor)</option>
                    <option value="TUTOR_EMPRESARIAL">TUTOR_EMPRESARIAL (Empresa)</option>
                    <option value="DIRECTOR_PROGRAMA">DIRECTOR_PROGRAMA (Programa)</option>
                    <option value="ADMIN">ADMIN (Administrador de Sistema)</option>
                  </select>
                </div>

                {/* Código Estudiantil (Condicional) */}
                {formData.role === 'ESTUDIANTE' && (
                  <div className="animate-fadeIn">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Código Estudiantil
                    </label>
                    <input
                      type="text"
                      value={formData.studentCode}
                      onChange={(e) => setFormData({ ...formData, studentCode: e.target.value })}
                      placeholder="Ej. 1152001"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all font-medium"
                    />
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 py-3 px-4 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-700/20 hover:shadow-xl hover:shadow-red-700/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Registrar y Habilitar Cuenta</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* ==================================================================== */}
          {/* COLUMNA 2: DIRECTORIO DE USUARIOS Y ACCIONES (CRITERIO 2 - DESACTIVACIÓN) */}
          {/* ==================================================================== */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por documento, nombre o correo..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 transition-all font-medium"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 cursor-pointer"
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
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-red-600 cursor-pointer"
                >
                  <option value="">Todos los Estados</option>
                  <option value="ACTIVO">Activos</option>
                  <option value="INACTIVO">Inactivos</option>
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
                                className="flex items-center gap-1 font-mono hover:text-slate-800 transition-colors"
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
                                className="flex items-center gap-1 hover:text-slate-800 transition-colors"
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

                        {/* Status Badge & Action Controls (HU01 - Criterio 2) */}
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
                            {isActive ? 'ACTIVO' : 'INACTIVO'}
                          </span>

                          {/* Action Button: Desactivar (Criterio 2) / Habilitar */}
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
