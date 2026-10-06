// ==============================================================================
// SIGETRAP - Servicio de Postulación a Vacantes y Elegibilidad Estudiantil
// Capa de Servicios (RNF11)
// Historia de Usuario:
// "Como estudiante elegible, quiero postularme a una vacante adjuntando mi
//  hoja de vida, para participar en el proceso de preselección empresarial."
// ==============================================================================

import {
  VacancyRepository,
  vacancyRepository,
} from '@/server/repositories/vacancy.repository';
import {
  ApplicationRepository,
  applicationRepository,
} from '@/server/repositories/application.repository';
import {
  UserRepository,
  userRepository,
} from '@/server/repositories/user.repository';
import {
  AgreementRepository,
  agreementRepository,
} from '@/server/repositories/agreement.repository';
import {
  PracticeRepository,
  practiceRepository,
} from '@/server/repositories/practice.repository';
import {
  AuthenticatedUser,
  ApplyVacancyDTO,
  StudentEligibilityDTO,
  VacancyResponseDTO,
  VacancyFilterDTO,
  ApplicationResponseDTO,
  PracticeStatus,
} from '@/types';

export class ApplicationValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;

  constructor(
    message: string,
    code: string = 'APPLICATION_VALIDATION_ERROR',
    statusCode: number = 422,
    field?: string
  ) {
    super(message);
    this.name = 'ApplicationValidationError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
  }
}

// Constantes académicas de elegibilidad para el programa de Ingeniería de Sistemas
export const REQUIRED_CREDITS_THRESHOLD = 100;
export const MINIMUM_ACADEMIC_AVERAGE = 3.0;

// Estados de práctica que indican que el estudiante ya tiene un proceso formal en curso
const ACTIVE_PRACTICE_BLOCKING_STATUSES: PracticeStatus[] = [
  'ASIGNADO_FORMALMENTE',
  'PLAN_EN_REVISION',
  'PRACTICA_EN_EJECUCION',
  'EVALUACION_PENDIENTE',
];

export class StudentApplicationService {
  constructor(
    private vacancyRepo: VacancyRepository = vacancyRepository,
    private applicationRepo: ApplicationRepository = applicationRepository,
    private userRepo: UserRepository = userRepository,
    private agreementRepo: AgreementRepository = agreementRepository,
    private practiceRepo: PracticeRepository = practiceRepository
  ) {}

  /**
   * Evalúa la elegibilidad académica y disciplinar del estudiante para realizar prácticas
   */
  async checkStudentEligibility(studentId: string): Promise<StudentEligibilityDTO> {
    const student = await this.userRepo.findById(studentId);

    if (!student) {
      throw new ApplicationValidationError(
        'El estudiante especificado no existe en el sistema',
        'STUDENT_NOT_FOUND',
        404
      );
    }

    const reasons: string[] = [];

    // 1. Validar rol
    if (student.role !== 'ESTUDIANTE') {
      reasons.push(`El usuario no tiene el rol de ESTUDIANTE (rol actual: ${student.role})`);
    }

    // 2. Validar estado de la cuenta
    if (student.status !== 'ACTIVO' || !student.isActive) {
      reasons.push('La cuenta del estudiante no se encuentra activa en el sistema');
    }

    // 3. Validar código estudiantil
    if (!student.studentCode || student.studentCode.trim() === '') {
      reasons.push('El estudiante no tiene registrado un código estudiantil institucional');
    }

    // 4. Validar créditos académicos aprobados (Mínimo 100 créditos)
    const studentWithAcademics = student as any;
    const approvedCredits = studentWithAcademics.approvedCredits ?? 0;
    if (approvedCredits < REQUIRED_CREDITS_THRESHOLD) {
      reasons.push(
        `Créditos insuficientes: cuenta con ${approvedCredits} créditos aprobados y se requieren mínimo ${REQUIRED_CREDITS_THRESHOLD}`
      );
    }

    // 5. Validar promedio ponderado acumulado (Mínimo 3.0)
    const academicAverage = studentWithAcademics.academicAverage ?? null;
    if (academicAverage !== null && academicAverage < MINIMUM_ACADEMIC_AVERAGE) {
      reasons.push(
        `Promedio insuficiente: cuenta con promedio ${academicAverage.toFixed(2)} y el mínimo exigido es ${MINIMUM_ACADEMIC_AVERAGE.toFixed(1)}`
      );
    }

    // 6. Validar si ya tiene una práctica activa en curso que impida nuevas postulaciones
    const activePractice = await this.practiceRepo.findActiveByStudentId(studentId);
    let hasActivePractice = false;
    let activePracticeStatus: PracticeStatus | null = null;

    if (activePractice) {
      activePracticeStatus = activePractice.currentStatus as PracticeStatus;
      if (ACTIVE_PRACTICE_BLOCKING_STATUSES.includes(activePracticeStatus)) {
        hasActivePractice = true;
        reasons.push(
          `El estudiante ya cuenta con una práctica empresarial en curso en estado '${activePracticeStatus}'`
        );
      }
    }

    const isEligible = reasons.length === 0;

    return {
      isEligible,
      studentId: student.id,
      studentName: student.name,
      studentCode: student.studentCode,
      approvedCredits: studentWithAcademics.approvedCredits ?? null,
      academicAverage: studentWithAcademics.academicAverage ?? null,
      requiredCredits: REQUIRED_CREDITS_THRESHOLD,
      minimumAverage: MINIMUM_ACADEMIC_AVERAGE,
      hasActivePractice,
      activePracticeStatus,
      reasons,
    };
  }

  /**
   * Procesa la postulación de un estudiante a una vacante adjuntando su hoja de vida
   */
  async applyToVacancy(
    dto: ApplyVacancyDTO,
    actor: AuthenticatedUser
  ): Promise<ApplicationResponseDTO> {
    // 1. Validar permisos de actor (RBAC)
    // El actor debe ser ESTUDIANTE o ADMIN
    if (actor.role !== 'ESTUDIANTE' && actor.role !== 'ADMIN') {
      throw new ApplicationValidationError(
        'Únicamente los estudiantes elegibles pueden postularse a vacantes de práctica empresarial',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const studentId = actor.role === 'ESTUDIANTE' ? actor.id : actor.id;

    // 2. Validar que la hoja de vida esté adjunta y no vacía
    const normalizedCvUrl = dto.cvUrl ? dto.cvUrl.trim() : '';
    if (!normalizedCvUrl) {
      throw new ApplicationValidationError(
        'Es obligatorio adjuntar el soporte documental de la hoja de vida (CV) para participar en la preselección',
        'CV_REQUIRED',
        422,
        'cvUrl'
      );
    }

    // Validar formato básico de la URL / enlace del documento
    const isValidUrlPattern =
      /^https?:\/\/.+/i.test(normalizedCvUrl) ||
      /^\/uploads\/.+/i.test(normalizedCvUrl) ||
      /^blob:.+/i.test(normalizedCvUrl) ||
      /^data:application\/pdf/i.test(normalizedCvUrl);

    if (!isValidUrlPattern) {
      throw new ApplicationValidationError(
        'El enlace o documento de la hoja de vida suministrado tiene un formato inválido. Debe ser una URL válida o archivo PDF',
        'INVALID_CV_URL',
        422,
        'cvUrl'
      );
    }

    // 3. Validar elegibilidad del estudiante
    const eligibility = await this.checkStudentEligibility(studentId);
    if (!eligibility.isEligible) {
      throw new ApplicationValidationError(
        `El estudiante no cumple con las condiciones de elegibilidad para postularse: ${eligibility.reasons.join('; ')}`,
        'STUDENT_NOT_ELIGIBLE',
        422,
        'eligibility'
      );
    }

    // 4. Validar que la vacante exista
    const vacancy = await this.vacancyRepo.findById(dto.vacancyId);
    if (!vacancy || vacancy.deletedAt) {
      throw new ApplicationValidationError(
        'La vacante seleccionada no existe o ha sido dada de baja',
        'VACANCY_NOT_FOUND',
        404,
        'vacancyId'
      );
    }

    // 5. Validar estado de la vacante (Debe estar PUBLICADA o EN_SELECCION)
    if (vacancy.status !== 'PUBLICADA' && vacancy.status !== 'EN_SELECCION') {
      throw new ApplicationValidationError(
        `La vacante no se encuentra abierta para postulaciones (estado actual: ${vacancy.status})`,
        'VACANCY_NOT_OPEN',
        400,
        'vacancyId'
      );
    }

    // 6. Validar Regla RN-01: La empresa debe tener convenio VIGENTE activo no vencido
    const activeAgreement = await this.agreementRepo.findActiveAgreementByCompanyId(vacancy.companyId);
    if (!activeAgreement) {
      throw new ApplicationValidationError(
        'RN-01: La empresa que oferta la vacante no posee un convenio institucional VIGENTE. La postulación no puede procesarse.',
        'RN01_AGREEMENT_NOT_ACTIVE',
        400,
        'companyId'
      );
    }

    // 7. Validar duplicidad: El estudiante no puede postularse dos veces a la misma vacante activa
    const existingApp = await this.applicationRepo.findByStudentAndVacancy(studentId, dto.vacancyId);
    if (existingApp) {
      if (existingApp.status === 'POSTULADO' || existingApp.status === 'PRESENTADO' || existingApp.status === 'ACEPTADO') {
        throw new ApplicationValidationError(
          `Ya cuenta con una postulación previa registrada para la vacante '${vacancy.title}' en estado ${existingApp.status}`,
          'DUPLICATE_APPLICATION',
          409,
          'vacancyId'
        );
      }
    }

    // 8. Ejecutar postulación transaccional atómica (Application + Practice + Auditoría inmutable)
    const result = await this.applicationRepo.createApplicationWithPractice({
      vacancyId: vacancy.id,
      studentId,
      companyId: vacancy.companyId,
      cvUrl: normalizedCvUrl,
      notes: dto.notes,
    });

    // 9. Si la vacante estaba en PUBLICADA, pasar a EN_SELECCION
    if (vacancy.status === 'PUBLICADA') {
      await this.vacancyRepo.updateStatus(vacancy.id, 'EN_SELECCION');
    }

    const student = await this.userRepo.findById(studentId);

    return {
      id: result.application.id,
      vacancyId: vacancy.id,
      studentId,
      status: result.application.status,
      cvUrl: result.application.cvUrl,
      practiceId: result.practice.id,
      practiceStatus: result.practice.currentStatus,
      vacancy: {
        id: vacancy.id,
        title: vacancy.title,
        description: vacancy.description,
        requirements: vacancy.requirements,
        company: {
          id: vacancy.company.id,
          businessName: vacancy.company.businessName,
          city: vacancy.company.city,
        },
      },
      student: student
        ? {
            id: student.id,
            name: student.name,
            email: student.email,
            studentCode: student.studentCode,
            academicAverage: (student as any).academicAverage ?? null,
            approvedCredits: (student as any).approvedCredits ?? null,
          }
        : undefined,
      createdAt: result.application.createdAt,
      updatedAt: result.application.updatedAt,
    };
  }

  /**
   * Obtiene la lista de vacantes disponibles para que los estudiantes se postulen
   */
  async getAvailableVacancies(filter: VacancyFilterDTO): Promise<{
    vacancies: VacancyResponseDTO[];
    total: number;
  }> {
    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 20;
    const skip = (page - 1) * limit;

    const { vacancies, total } = await this.vacancyRepo.findAvailableVacancies({
      search: filter.search,
      city: filter.city,
      program: filter.program,
      academicPeriod: filter.academicPeriod,
      companyId: filter.companyId,
      status: filter.status,
      skip,
      take: limit,
    });

    const mapped: VacancyResponseDTO[] = vacancies.map((v) => {
      const activeAg = v.company.agreements[0] || null;
      const appCount = v._count?.applications ?? 0;
      return {
        id: v.id,
        companyId: v.companyId,
        title: v.title,
        description: v.description,
        requirements: v.requirements,
        program: v.program || 'Ingeniería de Sistemas',
        academicPeriod: v.academicPeriod || null,
        vacanciesCount: v.vacanciesCount,
        status: v.status,
        startDate: v.startDate,
        endDate: v.endDate,
        company: {
          id: v.company.id,
          businessName: v.company.businessName,
          nit: v.company.nit,
          city: v.company.city,
          hasActiveAgreement: !!activeAg,
          agreementNumber: activeAg ? activeAg.agreementNumber : null,
        },
        applicationsCount: appCount,
        availableSlots: Math.max(0, v.vacanciesCount - appCount),
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      };
    });

    return { vacancies: mapped, total };
  }

  /**
   * Obtiene el detalle de una vacante por ID
   */
  async getVacancyById(id: string): Promise<VacancyResponseDTO> {
    const vacancy = await this.vacancyRepo.findById(id);

    if (!vacancy || vacancy.deletedAt) {
      throw new ApplicationValidationError(
        'La vacante no existe o ha sido dada de baja',
        'VACANCY_NOT_FOUND',
        404
      );
    }

    const activeAg = await this.agreementRepo.findActiveAgreementByCompanyId(vacancy.companyId);
    const appCount = vacancy._count?.applications ?? 0;

    return {
      id: vacancy.id,
      companyId: vacancy.companyId,
      title: vacancy.title,
      description: vacancy.description,
      requirements: vacancy.requirements,
      program: vacancy.program || 'Ingeniería de Sistemas',
      academicPeriod: vacancy.academicPeriod || null,
      vacanciesCount: vacancy.vacanciesCount,
      status: vacancy.status,
      startDate: vacancy.startDate,
      endDate: vacancy.endDate,
      company: {
        id: vacancy.company.id,
        businessName: vacancy.company.businessName,
        nit: vacancy.company.nit,
        city: vacancy.company.city,
        hasActiveAgreement: !!activeAg,
        agreementNumber: activeAg ? activeAg.agreementNumber : null,
      },
      applicationsCount: appCount,
      availableSlots: Math.max(0, vacancy.vacanciesCount - appCount),
      createdAt: vacancy.createdAt,
      updatedAt: vacancy.updatedAt,
    };
  }

  /**
   * Consulta las postulaciones de un estudiante en el proceso de preselección empresarial
   */
  async getStudentApplications(
    studentId: string,
    actor: AuthenticatedUser
  ): Promise<ApplicationResponseDTO[]> {
    // Solo el propio estudiante o ADMIN/DIRECTOR puede ver las postulaciones
    if (actor.role === 'ESTUDIANTE' && actor.id !== studentId) {
      throw new ApplicationValidationError(
        'No tiene autorización para consultar las postulaciones de otro estudiante',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const applications = await this.applicationRepo.findManyByStudentId(studentId);

    return applications.map((app) => ({
      id: app.id,
      vacancyId: app.vacancyId,
      studentId: app.studentId,
      status: app.status,
      cvUrl: app.cvUrl,
      presentationLetterUrl: app.presentationLetterUrl,
      rejectionReason: app.rejectionReason,
      practiceId: app.practice?.id,
      practiceStatus: app.practice?.currentStatus,
      vacancy: {
        id: app.vacancy.id,
        title: app.vacancy.title,
        company: {
          id: app.vacancy.company.id,
          businessName: app.vacancy.company.businessName,
          city: app.vacancy.company.city,
        },
      },
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    }));
  }
}

export const studentApplicationService = new StudentApplicationService();
