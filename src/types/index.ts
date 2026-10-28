// ==============================================================================
// SIGETRAP - Definiciones de Tipos Globales y DTOs de Dominio
// ==============================================================================

export type UserStatus = 'ACTIVO' | 'INACTIVO' | 'PENDIENTE' | 'BLOQUEADO';

export type Role =
  | 'DIRECTOR_PROGRAMA'
  | 'ESTUDIANTE'
  | 'DOCENTE_PRACTICA'
  | 'TUTOR_EMPRESARIAL'
  | 'ADMIN';

export type AgreementStatus =
  | 'EN_TRAMITE'
  | 'VIGENTE'
  | 'VENCIDO'
  | 'CANCELADO';

export type VacancyStatus =
  | 'BORRADOR'
  | 'PUBLICADA'
  | 'EN_SELECCION'
  | 'CUBIERTA'
  | 'CANCELADA';

export type PostulacionEstadoDomain =
  | 'Pendiente'
  | 'En Revisión'
  | 'Preseleccionado'
  | 'Aceptado'
  | 'Rechazado';

export const DOMAIN_APPLICATION_STATUSES: readonly PostulacionEstadoDomain[] = [
  'Pendiente',
  'En Revisión',
  'Preseleccionado',
  'Aceptado',
  'Rechazado',
] as const;

export type ApplicationStatus =
  | 'POSTULADO'
  | 'PRESENTADO'
  | 'PENDIENTE'
  | 'EN_REVISION'
  | 'PRESELECCIONADO'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'CANCELADO'
  | PostulacionEstadoDomain;

export type PracticaFormativaEstadoDomain =
  | 'En Trámite'
  | 'Formalizada'
  | 'En Curso'
  | 'Finalizada'
  | 'Cancelada';

export const DOMAIN_PRACTICE_FORMALIZATION_STATUSES: readonly PracticaFormativaEstadoDomain[] = [
  'En Trámite',
  'Formalizada',
  'En Curso',
  'Finalizada',
  'Cancelada',
] as const;

export type PlanTrabajoEstadoDomain =
  | 'Pendiente'
  | 'En Revisión'
  | 'Aprobado'
  | 'Rechazado';

export type PracticeStatus =
  | 'ASPIRANTE'
  | 'POSTULADO'
  | 'PRESENTADO_A_EMPRESA'
  | 'REUBICACION_PENDIENTE'
  | 'ACEPTADO_ARL_PENDIENTE'
  | 'ASIGNADO_FORMALMENTE'
  | 'PLAN_EN_REVISION'
  | 'PRACTICA_EN_EJECUCION'
  | 'EVALUACION_PENDIENTE'
  | 'FINALIZADA'
  | 'CERRADA';

export type WorkPlanStatus =
  | 'BORRADOR'
  | 'EN_REVISION'
  | 'APROBADO_TUTOR'
  | 'APROBADO_DOCENTE'
  | 'APROBADO_DUAL'
  | 'RECHAZADO';

export type ReportType = 'INICIAL' | 'PARCIAL' | 'FINAL';
export type ReportStatus = 'PENDIENTE' | 'ENTREGADO' | 'APROBADO' | 'DEVUELTO_CORRECCIONES';
export type EvaluationType = 'PARCIAL_TUTOR' | 'FINAL_TUTOR' | 'FINAL_DOCENTE';

// ------------------------------------------------------------------------------
// Sesión y Token JWT
// ------------------------------------------------------------------------------

export interface UserJwtPayload {
  userId: string;
  email: string;
  role: Role;
  name: string;
  status: UserStatus;
  tokenVersion: number;
  companyId?: string | null;
  studentCode?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  name: string;
  status: UserStatus;
  tokenVersion: number;
  companyId?: string | null;
  studentCode?: string | null;
}

// ------------------------------------------------------------------------------
// DTOs de Gestión de Usuarios (HU01)
// ------------------------------------------------------------------------------

export interface CreateUserDTO {
  email: string;
  password: string;
  name: string;
  documentType?: string;
  documentNumber: string;
  phone?: string;
  role: Role;
  studentCode?: string;
  academicAverage?: number;
  approvedCredits?: number;
  program?: string;
  companyId?: string;
  status?: UserStatus;
}

export interface EnableUserByDocumentDTO {
  documentNumber: string;
  documentType?: string;
  email: string;
  name?: string;
  password?: string;
  role?: Role;
  studentCode?: string;
  academicAverage?: number;
  approvedCredits?: number;
  phone?: string;
}

export interface VerifyUserIdentityDTO {
  documentNumber: string;
  email?: string;
}

export interface UserResponseDTO {
  id: string;
  email: string;
  name: string;
  documentType: string;
  documentNumber: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  isActive: boolean;
  studentCode: string | null;
  academicAverage?: number | null;
  approvedCredits?: number | null;
  program: string;
  companyId: string | null;
  company?: {
    id: string;
    businessName: string;
    nit: string;
  } | null;
  activePractice?: {
    id: string;
    currentStatus: PracticeStatus;
    estadoDomain?: PracticaFormativaEstadoDomain;
    academicPeriod?: string | null;
    companyId?: string | null;
    companyName?: string | null;
    vacancyTitle?: string | null;
    teacherId?: string | null;
    teacherName?: string | null;
    teacherEmail?: string | null;
    tutorId?: string | null;
    tutorName?: string | null;
    tutorEmail?: string | null;
    tutorCargo?: string | null;
    workPlanId?: string | null;
    workPlanStatus?: string | null;
    startDate?: Date | string | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserFilterDTO {
  role?: Role;
  status?: UserStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface DeactivateUserResponseDTO {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  isActive: boolean;
  message: string;
  deactivatedAt: Date;
}

// ------------------------------------------------------------------------------
// DTOs de Gestión y Radicación de Empresas Receptoras (HU07)
// ------------------------------------------------------------------------------

export interface CreateCompanyDTO {
  nit: string;
  businessName: string;
  legalRepresentative: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  isActive?: boolean;
}

export interface UpdateCompanyDTO {
  businessName?: string;
  legalRepresentative?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  isActive?: boolean;
}

export interface CompanyResponseDTO {
  id: string;
  nit: string;
  businessName: string;
  legalRepresentative: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  isActive: boolean;
  agreementsCount?: number;
  activeAgreement?: {
    id: string;
    agreementNumber: string;
    status: AgreementStatus;
    startDate: Date;
    endDate: Date;
  } | null;
  tutorsCount?: number;
  practicesCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyFilterDTO {
  search?: string;
  city?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface VerifyNitDTO {
  nit: string;
}

// ------------------------------------------------------------------------------
// DTOs de Máquina de Estados y Transiciones
// ------------------------------------------------------------------------------

export interface TransitionPracticeRequestDTO {
  toStatus: PracticeStatus;
  notes?: string;
  arlSupportUrl?: string; // Requerido para pasar a ASIGNADO_FORMALMENTE (RN-06)
  presentationLetterUrl?: string; // Para PRESENTADO_A_EMPRESA (RN-02)
  rejectionReason?: string; // Para REUBICACION_PENDIENTE
  metadata?: Record<string, unknown>;
}

export interface WorkPlanApprovalDTO {
  approved: boolean;
  feedback?: string;
}

export interface TransitionResult {
  success: boolean;
  practiceId: string;
  previousStatus: PracticeStatus;
  currentStatus: PracticeStatus;
  transitionTimestamp: Date;
  message: string;
}

// ------------------------------------------------------------------------------
// DTOs de Postulación de Estudiantes a Vacantes y Elegibilidad
// ------------------------------------------------------------------------------

export interface StudentEligibilityDTO {
  isEligible: boolean;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  approvedCredits: number | null;
  academicAverage: number | null;
  requiredCredits: number;
  minimumAverage: number;
  hasActivePractice: boolean;
  activePracticeStatus?: PracticeStatus | null;
  reasons: string[];
  program: string;
  planName: string | null;
  planSource: 'PLAN_DE_ESTUDIOS' | 'VALORES_POR_DEFECTO';
  missingCredits: number;
  checkedAt: string;
}

export interface VacancyResponseDTO {
  id: string;
  companyId: string;
  title: string;
  description: string;
  requirements: string;
  program: string;
  academicPeriod: string | null;
  vacanciesCount: number;
  status: VacancyStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  company: {
    id: string;
    businessName: string;
    nit: string;
    city: string;
    hasActiveAgreement: boolean;
    agreementNumber?: string | null;
  };
  applicationsCount: number;
  availableSlots: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VacancyFilterDTO {
  search?: string;
  city?: string;
  status?: VacancyStatus;
  program?: string;
  academicPeriod?: string;
  companyId?: string;
  page?: number;
  limit?: number;
}

export interface CreateVacancyDTO {
  companyId?: string;
  title: string;
  description: string;
  requirements: string;
  program?: string;
  academicPeriod?: string;
  vacanciesCount: number;
  status?: VacancyStatus;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

export interface UpdateVacancyDTO {
  title?: string;
  description?: string;
  requirements?: string;
  program?: string;
  academicPeriod?: string;
  vacanciesCount?: number;
  status?: VacancyStatus;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

export interface ApplyVacancyDTO {
  vacancyId: string;
  cvUrl: string; // Hoja de vida (PDF / Enlace)
  notes?: string;
}

export interface ApplicationResponseDTO {
  id: string;
  vacancyId: string;
  studentId: string;
  status: ApplicationStatus;
  cvUrl: string | null;
  presentationLetterUrl?: string | null;
  rejectionReason?: string | null;
  practiceId?: string | null;
  practiceStatus?: PracticeStatus | null;
  vacancy?: {
    id: string;
    title: string;
    description?: string;
    requirements?: string;
    company: {
      id: string;
      businessName: string;
      city: string;
    };
  };
  student?: {
    id: string;
    name: string;
    email: string;
    studentCode: string | null;
    academicAverage?: number | null;
    approvedCredits?: number | null;
  };
  updatedById?: string | null;
  updatedBy?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateApplicationStatusDTO {
  status?: string;
  estado?: string;
  notes?: string;
  rejectionReason?: string;
}

export interface ApplicationStatusUpdateResultDTO {
  id: string;
  vacancyId: string;
  studentId: string;
  previousStatus: string;
  newStatus: string;
  status: ApplicationStatus;
  updatedAt: Date;
  updatedById: string;
  updatedByName?: string;
  rejectionReason?: string | null;
  practiceId?: string | null;
  practiceStatus?: PracticeStatus | null;
  message: string;
}

// ------------------------------------------------------------------------------
// DTOs de Vinculación de Tutores Empresariales (HU09 / CU09)
// ------------------------------------------------------------------------------

export type TutorEstadoDomain = 'Activo' | 'Inactivo';

export interface CreateCompanyTutorDTO {
  // Campos en español (Dominio CU09) y en inglés (API estándar)
  nombre?: string;
  name?: string;
  cargo?: string;
  position?: string;
  correo?: string;
  correoInstitucional?: string;
  email?: string;
  documento?: string;
  documentNumber?: string;
  tipoDocumento?: string;
  documentType?: string;
  telefono?: string;
  phone?: string;
  empresaId?: string;
  companyId?: string;
  password?: string;
}

export interface CompanyTutorResponseDTO {
  id: string;
  usuarioId: string;
  userId: string;
  empresaId: string;
  companyId: string;
  nombre: string;
  name: string;
  cargo: string;
  position: string;
  correo: string;
  email: string;
  tipoDocumento: string;
  documentType: string;
  documento: string;
  documentNumber: string;
  telefono: string | null;
  phone: string | null;
  role: Role;
  estado: TutorEstadoDomain;
  status: TutorEstadoDomain;
  userStatus: UserStatus;
  isActive: boolean;
  company?: {
    id: string;
    businessName: string;
    nit: string;
    city?: string;
    isActive: boolean;
  } | null;
  assignedPracticesCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyTutorFilterDTO {
  companyId?: string;
  empresaId?: string;
  onlyActive?: boolean;
  search?: string;
}

export interface AssignPracticeEvaluatorDTO {
  tutorId?: string;
  supervisorId?: string;
  evaluadorId?: string;
  teacherId?: string;
  docenteId?: string;
  notes?: string;
}

export interface PracticeEvaluatorAssignmentResultDTO {
  practiceId: string;
  studentId: string;
  companyId: string;
  tutorId: string;
  tutor: {
    id: string;
    name: string;
    nombre: string;
    cargo: string;
    position: string;
    email: string;
    correo: string;
    documentNumber: string;
    documento: string;
    estado: TutorEstadoDomain;
  };
  teacherId?: string | null;
  currentStatus: PracticeStatus;
  updatedAt: Date;
  message: string;
}

// ------------------------------------------------------------------------------
// DTOs de Formalización de la Práctica Empresarial (HU13 / CU13)
// ------------------------------------------------------------------------------

export interface WorkPlanFormalizationInputDTO {
  id?: string;
  status?: string;
  estado?: string;
  objectives?: string;
  objetivos?: string;
  methodology?: string;
  metodologia?: string;
  schedule?: unknown;
  cronograma?: unknown;
  documentUrl?: string;
  documentoUrl?: string;
  tutorApproved?: boolean;
  aprobadoTutorExterno?: boolean;
  teacherApproved?: boolean;
  aprobadoTutorDocente?: boolean;
  feedback?: string;
}

export interface FormalizePracticeDTO {
  // Identificador de práctica existente (si aplica)
  practiceId?: string;
  practicaId?: string;
  id?: string;

  // Estudiante (fk_practica_estudiante)
  studentId?: string;
  estudianteId?: string;

  // Empresa receptora
  companyId?: string;
  empresaId?: string;
  vacancyId?: string;
  plazaId?: string;

  // Tutor docente asignado (fk_practica_docente -> docentes_tutores)
  teacherId?: string | null;
  docenteTutorId?: string | null;
  tutorDocenteId?: string | null;
  docenteId?: string | null;

  // Tutor externo vinculado (fk_practica_tutor_ext -> tutores_empresariales)
  tutorId?: string | null;
  tutorExternoId?: string | null;
  tutorEmpresarialId?: string | null;

  // Plan de trabajo aprobado (fk_practica_plan_trabajo -> planes_trabajo)
  workPlanId?: string | null;
  planTrabajoId?: string | null;
  workPlanStatus?: string | null;
  estadoPlanTrabajo?: string | null;
  workPlan?: WorkPlanFormalizationInputDTO | null;
  planTrabajo?: WorkPlanFormalizationInputDTO | null;

  // Periodo lectivo vigente (uq_estudiante_practica_periodo)
  academicPeriod?: string;
  periodoLectivo?: string;
  periodo?: string;

  // Estado de la práctica formativa (chk_estado_practica)
  estado?: string;
  status?: string;

  // Fechas, horas y soportes
  startDate?: string | Date;
  fechaInicio?: string | Date;
  endDate?: string | Date;
  fechaFin?: string | Date;
  totalHoursRequired?: number;
  horasRequeridas?: number;
  arlSupportUrl?: string;
  presentationLetterUrl?: string;
  notes?: string;
  observaciones?: string;
}

export interface FormalizePracticeResponseDTO {
  id: string;
  practiceId: string;
  estudianteId: string;
  studentId: string;
  empresaId: string;
  companyId: string;
  docenteTutorId: string;
  teacherId: string;
  tutorExternoId: string;
  tutorId: string;
  planTrabajoId: string;
  workPlanId: string;
  coordinadorId: string;
  directorId: string;
  periodoLectivo: string;
  academicPeriod: string;
  estado: PracticaFormativaEstadoDomain;
  status: PracticaFormativaEstadoDomain;
  currentStatus: PracticeStatus;
  fechaInicio: Date;
  startDate: Date;
  fechaFin: Date | null;
  endDate: Date | null;
  fechaFormalizacion: Date;
  formalizedAt: Date;
  horasRequeridas: number;
  totalHoursRequired: number;
  student?: {
    id: string;
    name: string;
    nombre: string;
    email: string;
    studentCode?: string | null;
    documentNumber?: string;
    program?: string;
  };
  teacher?: {
    id: string;
    name: string;
    nombre: string;
    email: string;
    correo: string;
  };
  tutor?: {
    id: string;
    name: string;
    nombre: string;
    email: string;
    correo: string;
    cargo?: string;
  };
  workPlan?: {
    id: string;
    estado: PlanTrabajoEstadoDomain;
    status: WorkPlanStatus;
    objectives: string;
    methodology: string;
    tutorApproved: boolean;
    teacherApproved: boolean;
  };
  company?: {
    id: string;
    businessName: string;
    razonSocial: string;
    nit: string;
  };
  isNew: boolean;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

// ------------------------------------------------------------------------------
// Estructuras de Respuesta API Estandarizadas
// ------------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

// ------------------------------------------------------------------------------
// DTOs y Dominio de Seguimiento y Control de Prácticas (CU14: Entrega de Informes de Avance y Bitácoras)
// ------------------------------------------------------------------------------

export type InformeEstadoDomain =
  | 'Borrador'
  | 'Radicado'
  | 'En Revisión'
  | 'Aprobado'
  | 'Rechazado';

export const DOMAIN_INFORME_STATUSES: InformeEstadoDomain[] = [
  'Borrador',
  'Radicado',
  'En Revisión',
  'Aprobado',
  'Rechazado',
];

// Estados de práctica activos para radicación (Criterio 1 y Criterio 3)
export const ACTIVE_PRACTICE_STATUSES = [
  'ASIGNADO_FORMALMENTE',
  'PRACTICA_EN_EJECUCION',
  'Formalizada',
  'En Curso',
] as const;

// Estados de práctica no activos (Criterio 3)
export const INACTIVE_PRACTICE_STATUSES = [
  'ASPIRANTE',
  'POSTULADO',
  'PRESENTADO_A_EMPRESA',
  'REUBICACION_PENDIENTE',
  'ACEPTADO_ARL_PENDIENTE',
  'PLAN_EN_REVISION',
  'EVALUACION_PENDIENTE',
  'FINALIZADA',
  'CERRADA',
  'CANCELADO',
  'Finalizada',
  'Cancelada',
  'En Trámite',
] as const;

export interface RadicarInformeDTO {
  practicaId?: string;
  practiceId?: string;
  horasEjecutadas?: number;
  horas_ejecutadas?: number;
  horas?: number;
  descripcionActividades?: string;
  descripcion_actividades?: string;
  actividades?: string;
  tipo?: string;
  estado?: string;
  periodoInicio?: string | Date;
  periodoFin?: string | Date;
  documentUrl?: string;
  documento_url?: string;
  archivosAdjuntos?: Array<{
    nombreArchivo: string;
    urlArchivo: string;
    tipoMime?: string;
    tamanoBytes?: number;
  }>;
  observaciones?: string;
}

export interface AttachmentDTO {
  id: string;
  entidadTipo: string;
  entidadId: string;
  nombreArchivo: string;
  urlArchivo: string;
  tipoMime?: string | null;
  tamanoBytes?: number | string | bigint | null;
  createdAt: Date | string;
}

export interface FollowUpLogDTO {
  id: string;
  informeId?: string | null;
  practicaId: string;
  estudianteId: string;
  fechaActividad: Date | string;
  descripcionActividades: string;
  horasEjecutadas: number;
  observaciones?: string | null;
  createdAt: Date | string;
}

export interface AdvanceReportResponseDTO {
  id: string;
  practicaId: string;
  estudianteId: string;
  tipo: string;
  estado: InformeEstadoDomain;
  horasEjecutadas: number;
  descripcionActividades: string;
  periodoInicio?: Date | string | null;
  periodoFin?: Date | string | null;
  fechaEntrega: Date | string;
  revisadoPorId?: string | null;
  observaciones?: string | null;
  revisadoAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  bitacora?: FollowUpLogDTO;
  bitacoras?: FollowUpLogDTO[];
  archivos?: AttachmentDTO[];
  practice?: {
    id: string;
    currentStatus: string;
    totalHoursRequired: number;
    totalHoursCompleted: number;
  };
}

export interface RadicarInformeResultDTO {
  informe: AdvanceReportResponseDTO;
  bitacora: FollowUpLogDTO;
  horasReportadas: number;
  totalHorasAcumuladas: number;
  fechaEntrega: Date | string;
  mensaje: string;
}


// ------------------------------------------------------------------------------
// DTOs y Dominio de Apertura y Configuración de Periodos Lectivos (HU05 / CU02)
// Entidad BD: periodos_academicos (Restricción SQL: chk_fechas_periodo)
// ------------------------------------------------------------------------------

export type PeriodoAcademicoEstadoDomain =
  | 'Abierto'
  | 'En Configuración'
  | 'Cerrado';

export const DOMAIN_ACADEMIC_PERIOD_STATUSES: readonly PeriodoAcademicoEstadoDomain[] = [
  'Abierto',
  'En Configuración',
  'Cerrado',
] as const;

export interface CreateAcademicPeriodDTO {
  // Campos en español (Dominio HU05 / CU02) y en inglés (API estándar)
  codigo?: string;
  code?: string;
  periodo?: string;
  nombre?: string;
  name?: string;
  descripcion?: string;
  description?: string;

  // Fechas de vigencia del periodo lectivo (chk_fechas_periodo: fecha_fin > fecha_inicio)
  fecha_inicio?: string | Date;
  fechaInicio?: string | Date;
  startDate?: string | Date;

  fecha_fin?: string | Date;
  fechaFin?: string | Date;
  endDate?: string | Date;

  // Ventana temporal para convocatorias (opcional)
  fecha_inicio_convocatorias?: string | Date | null;
  fechaInicioConvocatorias?: string | Date | null;
  vacanciesStartDate?: string | Date | null;

  fecha_fin_convocatorias?: string | Date | null;
  fechaFinConvocatorias?: string | Date | null;
  vacanciesEndDate?: string | Date | null;

  // Ventana temporal para informes (opcional)
  fecha_inicio_informes?: string | Date | null;
  fechaInicioInformes?: string | Date | null;
  reportsStartDate?: string | Date | null;

  fecha_fin_informes?: string | Date | null;
  fechaFinInformes?: string | Date | null;
  reportsEndDate?: string | Date | null;

  // Estado y vigencia
  estado?: string;
  status?: string;
  activo?: boolean;
  isActive?: boolean;
}

export interface UpdateAcademicPeriodDTO {
  codigo?: string;
  code?: string;
  nombre?: string;
  name?: string;
  descripcion?: string | null;
  description?: string | null;

  fecha_inicio?: string | Date;
  fechaInicio?: string | Date;
  startDate?: string | Date;

  fecha_fin?: string | Date;
  fechaFin?: string | Date;
  endDate?: string | Date;

  fecha_inicio_convocatorias?: string | Date | null;
  fechaInicioConvocatorias?: string | Date | null;
  vacanciesStartDate?: string | Date | null;

  fecha_fin_convocatorias?: string | Date | null;
  fechaFinConvocatorias?: string | Date | null;
  vacanciesEndDate?: string | Date | null;

  fecha_inicio_informes?: string | Date | null;
  fechaInicioInformes?: string | Date | null;
  reportsStartDate?: string | Date | null;

  fecha_fin_informes?: string | Date | null;
  fechaFinInformes?: string | Date | null;
  reportsEndDate?: string | Date | null;

  estado?: string;
  status?: string;
  activo?: boolean;
  isActive?: boolean;
}

export interface AcademicPeriodResponseDTO {
  id: string;
  codigo: string;
  code: string;
  nombre: string;
  name: string;
  descripcion: string | null;
  description: string | null;
  fecha_inicio: Date;
  fechaInicio: Date;
  startDate: Date;
  fecha_fin: Date;
  fechaFin: Date;
  endDate: Date;
  fecha_inicio_convocatorias: Date | null;
  fechaInicioConvocatorias: Date | null;
  vacanciesStartDate: Date | null;
  fecha_fin_convocatorias: Date | null;
  fechaFinConvocatorias: Date | null;
  vacanciesEndDate: Date | null;
  fecha_inicio_informes: Date | null;
  fechaInicioInformes: Date | null;
  reportsStartDate: Date | null;
  fecha_fin_informes: Date | null;
  fechaFinInformes: Date | null;
  reportsEndDate: Date | null;
  estado: PeriodoAcademicoEstadoDomain;
  status: PeriodoAcademicoEstadoDomain;
  activo: boolean;
  isActive: boolean;
  enVigencia: boolean;
  isCurrentlyValid: boolean;
  creadoPorId: string | null;
  createdById: string | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    role?: Role;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  message?: string;
}

export interface AcademicPeriodFilterDTO {
  search?: string;
  estado?: string;
  status?: string;
  activo?: boolean;
  isActive?: boolean;
  onlyVigente?: boolean;
  page?: number;
  limit?: number;
}


// ==============================================================================
// DTOs de Liquidación y Cierre Académico de Prácticas
// Módulo: Liquidación y Cierre de Práctica Formativa
// ==============================================================================

export type LiquidationApprovalStatus = 'APROBADO' | 'REPROBADO';

export interface EvaluationBreakdownItem {
  type: string;
  label: string;
  weightPercentage: number;
  score: number | null;
  weightedScore: number | null;
  evaluatorName: string | null;
  evaluatorRole: string | null;
  isCompleted: boolean;
  qualitativeComments?: string | null;
  date?: Date | string | null;
}

export interface HoursBreakdownItem {
  weightPercentage: number;
  requiredHours: number;
  completedHours: number;
  isCompleted: boolean;
  score: number;
  weightedScore: number;
}

export interface LiquidationPrerequisiteItem {
  code: string;
  title: string;
  description: string;
  isMet: boolean;
  details?: string;
}

export interface LiquidationSummaryDTO {
  practiceId: string;
  student: {
    id: string;
    name: string;
    email: string;
    studentCode: string | null;
    program: string;
    documentNumber: string | null;
  };
  company: {
    id: string;
    businessName: string;
    nit: string;
  };
  teacher: {
    id: string;
    name: string;
    email: string;
  } | null;
  tutor: {
    id: string;
    name: string;
    email: string;
  } | null;
  vacancyTitle: string | null;
  periodName: string | null;
  currentStatus: string;
  isAlreadyLiquidated: boolean;
  liquidationDate?: Date | string | null;
  actaNumber?: string | null;
  evaluationsBreakdown: EvaluationBreakdownItem[];
  hoursBreakdown: HoursBreakdownItem;
  cumulativeFinalScore: number;
  approvalStatus: LiquidationApprovalStatus;
  prerequisites: LiquidationPrerequisiteItem[];
  isLiquidable: boolean;
  missingRequirements: string[];
}

export interface LiquidarPracticaDTO {
  observations?: string;
  academicResolutionNumber?: string;
  forceGrade?: number;
}

export interface LiquidationResultDTO {
  practiceId: string;
  studentId: string;
  studentName: string;
  finalScore: number;
  approvalStatus: LiquidationApprovalStatus;
  actaNumber: string;
  liquidationDate: Date | string;
  liquidatedBy: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  message: string;
  actaDownloadUrl: string;
  curriculumTransferred: boolean;
  notificationsSent: {
    student: boolean;
    tutor: boolean;
    teacher: boolean;
  };
}
