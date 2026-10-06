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

export type ApplicationStatus =
  | 'POSTULADO'
  | 'PRESENTADO'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'CANCELADO';

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

