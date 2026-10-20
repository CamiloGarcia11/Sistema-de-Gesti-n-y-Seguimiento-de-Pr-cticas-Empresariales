'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import {
  CalendarRange,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Settings2,
  Search,
  Lock,
  Unlock,
  FileText,
  Briefcase,
  RefreshCw,
} from 'lucide-react';
import { AcademicPeriodResponseDTO, UserResponseDTO } from '@/types';

export default function PeriodosLectivosPage() {
  const [currentUser, setCurrentUser] = useState<UserResponseDTO | null>(null);
  const [periods, setPeriods] = useState<AcademicPeriodResponseDTO[]>([]);
  const [activePeriod, setActivePeriod] = useState<AcademicPeriodResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Estado del formulario de apertura / configuración (HU05)
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('2026-2');
  const [nombre, setNombre] = useState('Segundo Semestre Académico 2026');
  const [descripcion, setDescripcion] = useState(
    'Periodo lectivo para enmarcar temporalmente las convocatorias empresariales y la entrega de informes de práctica.'
  );
  const [fechaInicio, setFechaInicio] = useState('2026-08-01');
  const [fechaFin, setFechaFin] = useState('2026-12-15');
  const [fechaInicioConvocatorias, setFechaInicioConvocatorias] = useState('2026-08-01');
  const [fechaFinConvocatorias, setFechaFinConvocatorias] = useState('2026-09-30');
  const [fechaInicioInformes, setFechaInicioInformes] = useState('2026-09-01');
  const [fechaFinInformes, setFechaFinInformes] = useState('2026-12-10');
  const [estado, setEstado] = useState<'Abierto' | 'En Configuración' | 'Cerrado'>('Abierto');
  const [activo, setActivo] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    constraint?: string;
    rule?: string;
  } | null>(null);

  const canManagePeriods =
    currentUser?.role === 'DIRECTOR_PROGRAMA' || currentUser?.role === 'ADMIN';

  const loadPeriods = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter) params.set('estado', statusFilter);

      const res = await fetch(`/api/v1/periodos-academicos?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setPeriods(json.data.items || []);
        setActivePeriod(json.data.activePeriod || null);
      }
    } catch (error) {
      console.error('Error al cargar periodos académicos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  const toInputDate = (value?: Date | string | null) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const handleSelectForEdit = (period: AcademicPeriodResponseDTO) => {
    setEditingPeriodId(period.id);
    setCodigo(period.codigo);
    setNombre(period.nombre);
    setDescripcion(period.descripcion || '');
    setFechaInicio(toInputDate(period.fecha_inicio));
    setFechaFin(toInputDate(period.fecha_fin));
    setFechaInicioConvocatorias(toInputDate(period.fecha_inicio_convocatorias));
    setFechaFinConvocatorias(toInputDate(period.fecha_fin_convocatorias));
    setFechaInicioInformes(toInputDate(period.fecha_inicio_informes));
    setFechaFinInformes(toInputDate(period.fecha_fin_informes));
    setEstado(period.estado);
    setActivo(period.activo);
    setFeedback(null);
  };

  const resetForm = () => {
    setEditingPeriodId(null);
    setCodigo('');
    setNombre('');
    setDescripcion('');
    setFechaInicio('');
    setFechaFin('');
    setFechaInicioConvocatorias('');
    setFechaFinConvocatorias('');
    setFechaInicioInformes('');
    setFechaFinInformes('');
    setEstado('Abierto');
    setActivo(true);
    setFeedback(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const payload = {
        codigo,
        nombre,
        descripcion,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        fecha_inicio_convocatorias: fechaInicioConvocatorias || null,
        fecha_fin_convocatorias: fechaFinConvocatorias || null,
        fecha_inicio_informes: fechaInicioInformes || null,
        fecha_fin_informes: fechaFinInformes || null,
        estado,
        activo,
      };

      const url = editingPeriodId
        ? `/api/v1/periodos-academicos/${editingPeriodId}`
        : '/api/v1/periodos-academicos';
      const method = editingPeriodId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setFeedback({
          type: 'error',
          message:
            json.error?.message ||
            'Error al guardar la configuración del periodo lectivo.',
          constraint: json.error?.details?.constraint,
          rule: json.error?.details?.rule,
        });
        return;
      }

      setFeedback({
        type: 'success',
        message:
          json.message ||
          `Periodo lectivo ${codigo} configurado correctamente.`,
      });
      if (!editingPeriodId) {
        resetForm();
      }
      await loadPeriods();
    } catch (error) {
      console.error(error);
      setFeedback({
        type: 'error',
        message: 'Error de red al procesar la solicitud.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickToggleStatus = async (period: AcademicPeriodResponseDTO) => {
    if (!canManagePeriods) return;
    setFeedback(null);
    const nextStatus = period.estado === 'Abierto' ? 'Cerrado' : 'Abierto';
    const nextActive = nextStatus === 'Abierto';

    try {
      const res = await fetch(`/api/v1/periodos-academicos/${period.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: nextStatus,
          activo: nextActive,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({
          type: 'success',
          message: `El periodo ${period.codigo} cambió a estado '${nextStatus}'.`,
        });
        await loadPeriods();
      } else {
        setFeedback({
          type: 'error',
          message: json.error?.message || 'No fue posible actualizar el estado del periodo.',
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const hasLocalDateIncoherence =
    Boolean(fechaInicio && fechaFin) && new Date(fechaFin).getTime() <= new Date(fechaInicio).getTime();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Institucional */}
        <section className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-700 uppercase tracking-wider">
              <CalendarRange className="w-3.5 h-3.5" />
              <span>HU05 • CU02 Parametrización Académica</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Apertura y Configuración de Periodos Lectivos
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Gestione los periodos académicos con fechas estrictas de vigencia (
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-red-700">
                chk_fechas_periodo: fecha_fin &gt; fecha_inicio
              </code>
              ) para enmarcar temporalmente las convocatorias empresariales y la entrega de informes de avance.
            </p>
          </div>

          {activePeriod && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 min-w-[260px]">
              <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Periodo Lectivo Vigente</span>
              </div>
              <p className="text-lg font-black text-emerald-950 mt-1">
                {activePeriod.codigo} — {activePeriod.nombre}
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                Vigencia: {toInputDate(activePeriod.fecha_inicio)} al{' '}
                {toInputDate(activePeriod.fecha_fin)}
              </p>
            </div>
          )}
        </section>

        {feedback && (
          <div
            className={`rounded-xl p-4 border flex items-start gap-3 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="text-sm space-y-1">
              <p className="font-bold">{feedback.message}</p>
              {feedback.constraint && (
                <p className="text-xs font-mono">
                  Restricción SQL: <strong>{feedback.constraint}</strong>
                  {feedback.rule ? ` (${feedback.rule})` : ''}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Panel de Formulario de Apertura y Configuración (Solo Coordinador / Admin) */}
          {canManagePeriods && (
            <section className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 h-fit">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
                    {editingPeriodId ? (
                      <Settings2 className="w-5 h-5" />
                    ) : (
                      <PlusCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {editingPeriodId
                        ? `Configurar Periodo ${codigo}`
                        : 'Aperturar Nuevo Periodo Lectivo'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Entidad BD: <span className="font-mono">periodos_academicos</span>
                    </p>
                  </div>
                </div>
                {editingPeriodId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-semibold text-red-700 hover:underline"
                  >
                    + Nuevo periodo
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Código del Periodo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. 2026-2"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Estado del Periodo *
                    </label>
                    <select
                      value={estado}
                      onChange={(e) =>
                        setEstado(
                          e.target.value as 'Abierto' | 'En Configuración' | 'Cerrado'
                        )
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
                    >
                      <option value="Abierto">Abierto</option>
                      <option value="En Configuración">En Configuración</option>
                      <option value="Cerrado">Cerrado</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre Descriptivo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Segundo Semestre Académico 2026"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  />
                </div>

                {/* Fechas estrictas de vigencia general (chk_fechas_periodo) */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-red-700" />
                      Vigencia Estricta del Periodo Lectivo
                    </span>
                    <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                      chk_fechas_periodo
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Fecha de Inicio (fecha_inicio) *
                      </label>
                      <input
                        type="date"
                        required
                        value={fechaInicio}
                        onChange={(e) => setFechaInicio(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Fecha de Fin (fecha_fin) *
                      </label>
                      <input
                        type="date"
                        required
                        value={fechaFin}
                        onChange={(e) => setFechaFin(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>

                  {hasLocalDateIncoherence && (
                    <p className="text-xs text-red-700 font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Alerta chk_fechas_periodo: Se requiere estrictamente fecha_fin &gt; fecha_inicio.
                    </p>
                  )}
                </div>

                {/* Enmarcado temporal de Convocatorias e Informes */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-red-700" />
                    Ventana de Convocatorias (Opcional)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Apertura Convocatorias
                      </label>
                      <input
                        type="date"
                        value={fechaInicioConvocatorias}
                        onChange={(e) => setFechaInicioConvocatorias(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Cierre Convocatorias
                      </label>
                      <input
                        type="date"
                        value={fechaFinConvocatorias}
                        onChange={(e) => setFechaFinConvocatorias(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-red-700" />
                    Ventana de Entrega de Informes (Opcional)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Inicio Entrega Informes
                      </label>
                      <input
                        type="date"
                        value={fechaInicioInformes}
                        onChange={(e) => setFechaInicioInformes(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Límite Entrega Informes
                      </label>
                      <input
                        type="date"
                        value={fechaFinInformes}
                        onChange={(e) => setFechaFinInformes(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Observaciones / Lineamientos del Periodo
                  </label>
                  <textarea
                    rows={2}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Lineamientos académicos para convocatorias e informes del semestre..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    className="rounded border-slate-300 text-red-700 focus:ring-red-600"
                  />
                  Establecer como periodo lectivo activo / vigente
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold text-sm rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CalendarRange className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Guardando configuración...'
                      : editingPeriodId
                        ? 'Guardar Configuración del Periodo'
                        : 'Aperturar y Configurar Periodo Lectivo'}
                  </span>
                </button>
              </form>
            </section>
          )}

          {/* Listado Histórico y Estado de Periodos Académicos */}
          <section
            className={`${
              canManagePeriods ? 'lg:col-span-7' : 'lg:col-span-12'
            } bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Periodos Académicos Configurados
                </h2>
                <p className="text-xs text-slate-500">
                  Historial de vigencias para convocatorias empresariales e informes de avance
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar ej. 2026-1..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-red-600"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Todos los estados</option>
                  <option value="Abierto">Abierto</option>
                  <option value="En Configuración">En Configuración</option>
                  <option value="Cerrado">Cerrado</option>
                </select>

                <button
                  type="button"
                  onClick={loadPeriods}
                  title="Actualizar"
                  className="p-1.5 text-slate-600 hover:text-red-700 border border-slate-200 rounded-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Cargando periodos académicos...
              </div>
            ) : periods.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                No se encontraron periodos lectivos registrados con los filtros actuales.
              </div>
            ) : (
              <div className="space-y-4">
                {periods.map((period) => (
                  <div
                    key={period.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      period.activo && period.estado === 'Abierto'
                        ? 'border-emerald-300 bg-emerald-50/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 rounded-lg bg-red-700 text-white font-black text-sm">
                          {period.codigo}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {period.nombre}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                period.estado === 'Abierto'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : period.estado === 'En Configuración'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {period.estado}
                            </span>
                            {period.activo && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                Vigente
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {canManagePeriods && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectForEdit(period)}
                            className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-red-700 bg-white border border-slate-200 hover:border-red-200 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                            <span>Configurar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickToggleStatus(period)}
                            className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-red-700 bg-white border border-slate-200 hover:border-red-200 rounded-lg transition-colors flex items-center gap-1"
                          >
                            {period.estado === 'Abierto' ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Cerrar</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                <span>Reabrir</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {period.descripcion && (
                      <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                        {period.descripcion}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100 text-xs">
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">
                          Vigencia del Periodo
                        </span>
                        <span className="font-semibold text-slate-800">
                          {toInputDate(period.fecha_inicio)} → {toInputDate(period.fecha_fin)}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">
                          Marco de Convocatorias
                        </span>
                        <span className="font-semibold text-slate-800">
                          {toInputDate(period.fecha_inicio_convocatorias ?? period.fecha_inicio)}{' '}
                          → {toInputDate(period.fecha_fin_convocatorias ?? period.fecha_fin)}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                        <span className="block text-[10px] font-bold uppercase text-slate-500">
                          Marco de Informes
                        </span>
                        <span className="font-semibold text-slate-800">
                          {toInputDate(period.fecha_inicio_informes ?? period.fecha_inicio)} →{' '}
                          {toInputDate(period.fecha_fin_informes ?? period.fecha_fin)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
