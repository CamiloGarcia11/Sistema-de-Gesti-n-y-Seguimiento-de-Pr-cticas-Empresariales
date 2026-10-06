// ==============================================================================
// SIGETRAP - Servicio de Gestión y Publicación de Convocatorias Empresariales
// Capa de Servicios (RNF11)
// Historia de Usuario:
// "Como entidad empleadora, quiero crear y publicar convocatorias vinculadas
//  a programas académicos y periodos específicos, para captar perfiles de practicantes idóneos."
// ==============================================================================

import {
  VacancyRepository,
  vacancyRepository,
} from '@/server/repositories/vacancy.repository';
import {
  CompanyRepository,
  companyRepository,
} from '@/server/repositories/company.repository';
import {
  AgreementRepository,
  agreementRepository,
} from '@/server/repositories/agreement.repository';
import {
  AuthenticatedUser,
  CreateVacancyDTO,
  UpdateVacancyDTO,
  VacancyResponseDTO,
  VacancyStatus,
} from '@/types';

export class VacancyValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;

  constructor(
    message: string,
    code: string = 'VACANCY_VALIDATION_ERROR',
    statusCode: number = 422,
    field?: string
  ) {
    super(message);
    this.name = 'VacancyValidationError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
  }
}

export class VacancyManagementService {
  constructor(
    private vacancyRepo: VacancyRepository = vacancyRepository,
    private companyRepo: CompanyRepository = companyRepository,
    private agreementRepo: AgreementRepository = agreementRepository
  ) {}

  /**
   * Crea una nueva convocatoria vinculada a programa y periodo específico
   */
  async createVacancy(
    dto: CreateVacancyDTO,
    actor: AuthenticatedUser
  ): Promise<VacancyResponseDTO> {
    // 1. Control de acceso RBAC: Solo Tutor Empresarial, Admin o Director
    if (
      actor.role !== 'TUTOR_EMPRESARIAL' &&
      actor.role !== 'ADMIN' &&
      actor.role !== 'DIRECTOR_PROGRAMA'
    ) {
      throw new VacancyValidationError(
        'Únicamente las entidades empleadoras (tutores) o administradores pueden crear convocatorias de práctica',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    // 2. Determinar la empresa empleadora asociada
    let targetCompanyId: string;
    if (actor.role === 'TUTOR_EMPRESARIAL') {
      if (!actor.companyId) {
        throw new VacancyValidationError(
          'El tutor empresarial no tiene una empresa receptora asignada en su perfil',
          'TUTOR_WITHOUT_COMPANY',
          400,
          'companyId'
        );
      }
      targetCompanyId = actor.companyId;
    } else {
      // Si es Admin o Director, debe proveer el ID de la empresa
      if (!dto.companyId) {
        throw new VacancyValidationError(
          'Es obligatorio especificar la empresa empleadora para la convocatoria',
          'COMPANY_REQUIRED',
          422,
          'companyId'
        );
      }
      targetCompanyId = dto.companyId;
    }

    // 3. Validar que la empresa exista y esté activa
    const company = await this.companyRepo.findById(targetCompanyId);
    if (!company || company.deletedAt || !company.isActive) {
      throw new VacancyValidationError(
        'La empresa empleadora especificada no existe o se encuentra inactiva',
        'COMPANY_NOT_FOUND',
        404,
        'companyId'
      );
    }

    // 4. Validar campos obligatorios de la convocatoria
    const normalizedTitle = dto.title?.trim();
    if (!normalizedTitle || normalizedTitle.length < 5) {
      throw new VacancyValidationError(
        'El título de la convocatoria es obligatorio y debe tener al menos 5 caracteres',
        'INVALID_TITLE',
        422,
        'title'
      );
    }

    const normalizedDescription = dto.description?.trim();
    if (!normalizedDescription || normalizedDescription.length < 10) {
      throw new VacancyValidationError(
        'La descripción de la convocatoria debe contener al menos 10 caracteres detallando el rol',
        'INVALID_DESCRIPTION',
        422,
        'description'
      );
    }

    const normalizedRequirements = dto.requirements?.trim();
    if (!normalizedRequirements || normalizedRequirements.length < 5) {
      throw new VacancyValidationError(
        'Los requisitos y perfil de practicante idóneo son obligatorios (mínimo 5 caracteres)',
        'INVALID_REQUIREMENTS',
        422,
        'requirements'
      );
    }

    const program = dto.program?.trim() || 'Ingeniería de Sistemas';

    const academicPeriod = dto.academicPeriod?.trim();
    if (!academicPeriod || academicPeriod.length < 4) {
      throw new VacancyValidationError(
        'Debe especificar un periodo académico válido para la convocatoria (ej: 2026-1)',
        'INVALID_ACADEMIC_PERIOD',
        422,
        'academicPeriod'
      );
    }

    const vacanciesCount = dto.vacanciesCount !== undefined ? Number(dto.vacanciesCount) : 1;
    if (isNaN(vacanciesCount) || vacanciesCount < 1) {
      throw new VacancyValidationError(
        'El número de cupos disponibles debe ser un número entero mayor o igual a 1',
        'INVALID_VACANCIES_COUNT',
        422,
        'vacanciesCount'
      );
    }

    // 5. Validar consistencia de fechas si se suministran
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (dto.startDate) {
      startDate = new Date(dto.startDate);
      if (isNaN(startDate.getTime())) {
        throw new VacancyValidationError('La fecha de inicio suministrada es inválida', 'INVALID_START_DATE', 422, 'startDate');
      }
    }

    if (dto.endDate) {
      endDate = new Date(dto.endDate);
      if (isNaN(endDate.getTime())) {
        throw new VacancyValidationError('La fecha de fin suministrada es inválida', 'INVALID_END_DATE', 422, 'endDate');
      }
    }

    if (startDate && endDate && endDate < startDate) {
      throw new VacancyValidationError(
        'La fecha de cierre de la convocatoria no puede ser anterior a la fecha de inicio',
        'INVALID_DATE_RANGE',
        422,
        'endDate'
      );
    }

    const targetStatus: VacancyStatus = dto.status || 'PUBLICADA';

    // 6. Validar Regla RN-01: Convenio Obligatorio VIGENTE para poder publicar
    const activeAgreement = await this.agreementRepo.findActiveAgreementByCompanyId(targetCompanyId);
    if (targetStatus === 'PUBLICADA' && !activeAgreement) {
      throw new VacancyValidationError(
        'RN-01: La entidad empleadora no cuenta con un convenio institucional VIGENTE. Para ofertar vacantes públicas se requiere convenio vigente activo.',
        'RN01_AGREEMENT_NOT_ACTIVE',
        400,
        'companyId'
      );
    }

    // 7. Persistir en la base de datos
    const created = await this.vacancyRepo.create({
      company: { connect: { id: targetCompanyId } },
      createdBy: { connect: { id: actor.id } },
      title: normalizedTitle,
      description: normalizedDescription,
      requirements: normalizedRequirements,
      program,
      academicPeriod,
      vacanciesCount,
      status: targetStatus,
      startDate,
      endDate,
    });

    return this.mapToResponseDTO(created, activeAgreement);
  }

  /**
   * Publica una convocatoria previamente guardada en estado BORRADOR (validando RN-01)
   */
  async publishVacancy(
    vacancyId: string,
    actor: AuthenticatedUser
  ): Promise<VacancyResponseDTO> {
    const vacancy = await this.vacancyRepo.findById(vacancyId);
    if (!vacancy || vacancy.deletedAt) {
      throw new VacancyValidationError('La convocatoria no existe o ha sido dada de baja', 'VACANCY_NOT_FOUND', 404);
    }

    // Validar autorización sobre la convocatoria
    if (actor.role === 'TUTOR_EMPRESARIAL' && actor.companyId !== vacancy.companyId) {
      throw new VacancyValidationError(
        'No tiene autorización para modificar convocatorias de otra empresa',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    // Validar Regla RN-01
    const activeAgreement = await this.agreementRepo.findActiveAgreementByCompanyId(vacancy.companyId);
    if (!activeAgreement) {
      throw new VacancyValidationError(
        'RN-01: No es posible publicar la convocatoria porque la entidad empleadora no posee un convenio institucional VIGENTE activo.',
        'RN01_AGREEMENT_NOT_ACTIVE',
        400,
        'companyId'
      );
    }

    const updated = await this.vacancyRepo.updateStatus(vacancyId, 'PUBLICADA');
    const reloaded = await this.vacancyRepo.findById(updated.id);

    return this.mapToResponseDTO(reloaded!, activeAgreement);
  }

  /**
   * Actualiza los datos de una convocatoria existente
   */
  async updateVacancy(
    vacancyId: string,
    dto: UpdateVacancyDTO,
    actor: AuthenticatedUser
  ): Promise<VacancyResponseDTO> {
    const vacancy = await this.vacancyRepo.findById(vacancyId);
    if (!vacancy || vacancy.deletedAt) {
      throw new VacancyValidationError('La convocatoria no existe', 'VACANCY_NOT_FOUND', 404);
    }

    if (actor.role === 'TUTOR_EMPRESARIAL' && actor.companyId !== vacancy.companyId) {
      throw new VacancyValidationError('No tiene autorización para modificar esta convocatoria', 'FORBIDDEN_OPERATION', 403);
    }

    const activeAgreement = await this.agreementRepo.findActiveAgreementByCompanyId(vacancy.companyId);

    if (dto.status === 'PUBLICADA' && !activeAgreement) {
      throw new VacancyValidationError(
        'RN-01: No se puede cambiar el estado a PUBLICADA sin un convenio institucional VIGENTE activo',
        'RN01_AGREEMENT_NOT_ACTIVE',
        400
      );
    }

    const updateData: any = {};
    if (dto.title?.trim()) updateData.title = dto.title.trim();
    if (dto.description?.trim()) updateData.description = dto.description.trim();
    if (dto.requirements?.trim()) updateData.requirements = dto.requirements.trim();
    if (dto.program?.trim()) updateData.program = dto.program.trim();
    if (dto.academicPeriod?.trim()) updateData.academicPeriod = dto.academicPeriod.trim();
    if (dto.vacanciesCount !== undefined) {
      const count = Number(dto.vacanciesCount);
      if (isNaN(count) || count < 1) {
        throw new VacancyValidationError('El número de cupos debe ser >= 1', 'INVALID_VACANCIES_COUNT', 422);
      }
      updateData.vacanciesCount = count;
    }
    if (dto.status) updateData.status = dto.status;
    if (dto.startDate !== undefined) updateData.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) updateData.endDate = dto.endDate ? new Date(dto.endDate) : null;

    const updated = await this.vacancyRepo.update(vacancyId, updateData);
    return this.mapToResponseDTO(updated, activeAgreement);
  }

  /**
   * Obtiene las convocatorias creadas por una entidad empleadora específica
   */
  async getCompanyVacancies(
    companyId: string,
    actor: AuthenticatedUser
  ): Promise<VacancyResponseDTO[]> {
    if (actor.role === 'TUTOR_EMPRESARIAL' && actor.companyId !== companyId) {
      throw new VacancyValidationError(
        'No tiene permisos para ver las convocatorias de otra empresa',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const vacancies = await this.vacancyRepo.findByCompanyId(companyId);
    const activeAgreement = await this.agreementRepo.findActiveAgreementByCompanyId(companyId);

    return vacancies.map((v) => this.mapToResponseDTO(v, activeAgreement));
  }

  /**
   * Consulta el detalle de una convocatoria
   */
  async getVacancyById(id: string): Promise<VacancyResponseDTO> {
    const vacancy = await this.vacancyRepo.findById(id);
    if (!vacancy || vacancy.deletedAt) {
      throw new VacancyValidationError('La convocatoria no existe', 'VACANCY_NOT_FOUND', 404);
    }

    const activeAg = await this.agreementRepo.findActiveAgreementByCompanyId(vacancy.companyId);
    return this.mapToResponseDTO(vacancy, activeAg);
  }

  private mapToResponseDTO(vacancy: any, activeAgreement: any): VacancyResponseDTO {
    const appCount = vacancy._count?.applications ?? (vacancy.applications?.length || 0);
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
        hasActiveAgreement: !!activeAgreement,
        agreementNumber: activeAgreement ? activeAgreement.agreementNumber : null,
      },
      applicationsCount: appCount,
      availableSlots: Math.max(0, vacancy.vacanciesCount - appCount),
      createdAt: vacancy.createdAt,
      updatedAt: vacancy.updatedAt,
    };
  }
}

export const vacancyManagementService = new VacancyManagementService();
