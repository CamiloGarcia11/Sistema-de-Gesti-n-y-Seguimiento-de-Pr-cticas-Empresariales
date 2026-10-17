// ==============================================================================
// SIGETRAP - Servicio de Vinculación de Tutores Empresariales (HU09 / CU09)
// Módulo / Épica: Gestión Empresarial y Evaluación de Prácticas
// Caso de Uso Asociado: CU09 - Vinculación de Tutores Empresariales
// Entidades BD: empresas, tutores_empresariales, usuarios, asignaciones_practica
// Restricciones SQL: fk_tutor_empresa, chk_correo_tutor_valido, uq_tutor_documento_empresa, uq_tutor_email
// ==============================================================================

import {
  CompanyTutorRepository,
  companyTutorRepository,
} from '@/server/repositories/tutor.repository';
import {
  CompanyRepository,
  companyRepository,
} from '@/server/repositories/company.repository';
import {
  PracticeRepository,
  practiceRepository,
} from '@/server/repositories/practice.repository';
import {
  AuthenticatedUser,
  CreateCompanyTutorDTO,
  CompanyTutorResponseDTO,
  CompanyTutorFilterDTO,
  AssignPracticeEvaluatorDTO,
  PracticeEvaluatorAssignmentResultDTO,
} from '@/types';
import { hashPassword } from '@/lib/auth';
import { Prisma } from '@prisma/client';

// Expresión regular homóloga a la restricción SQL chk_correo_tutor_valido
export const EMAIL_TUTOR_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export class TutorLinkingError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;
  public readonly constraint?: string;

  constructor(
    message: string,
    code: string = 'TUTOR_LINKING_ERROR',
    statusCode: number = 400,
    field?: string,
    constraint?: string
  ) {
    super(message);
    this.name = 'TutorLinkingError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    this.constraint = constraint;
  }
}

/**
 * Valida que el correo cumpla con el formato de la restricción SQL chk_correo_tutor_valido
 */
export function validateTutorEmailFormat(rawEmail?: string | null): string {
  if (!rawEmail || typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    throw new TutorLinkingError(
      'El correo electrónico no es válido o ya se encuentra en uso. Debe ingresar un correo institucional válido (chk_correo_tutor_valido).',
      'INVALID_TUTOR_EMAIL',
      400,
      'email',
      'chk_correo_tutor_valido'
    );
  }

  const normalized = rawEmail.trim().toLowerCase();
  if (!EMAIL_TUTOR_REGEX.test(normalized)) {
    throw new TutorLinkingError(
      `El correo electrónico no es válido o ya se encuentra en uso ('${rawEmail.trim()}'). Falla por la restricción chk_correo_tutor_valido.`,
      'INVALID_TUTOR_EMAIL',
      400,
      'email',
      'chk_correo_tutor_valido'
    );
  }

  return normalized;
}

export class TutorLinkingService {
  constructor(
    private tutorRepo: CompanyTutorRepository = companyTutorRepository,
    private companyRepo: CompanyRepository = companyRepository,
    private practiceRepo: PracticeRepository = practiceRepository
  ) {}

  /**
   * Registra y vincula un supervisor inmediato a una empresa (CU09 - Criterios 1 y 2)
   *   - Criterio 1: Crea/asocia el registro en tutores_empresariales vinculado a la empresa con estado "Activo" -> 201 Created
   *   - Criterio 2: Valida correo con formato erróneo (chk_correo_tutor_valido) o duplicado (uq_tutor_email) -> 400 Bad Request
   */
  async registerCompanyTutor(
    dto: CreateCompanyTutorDTO,
    actor?: AuthenticatedUser | null
  ): Promise<CompanyTutorResponseDTO> {
    // 1. Validar autorización RBAC
    if (!actor || !actor.id) {
      throw new TutorLinkingError(
        'Debe iniciar sesión para vincular supervisores empresariales',
        'UNAUTHORIZED',
        401
      );
    }

    if (actor.role === 'ESTUDIANTE') {
      throw new TutorLinkingError(
        'Los estudiantes no tienen autorización para vincular tutores empresariales',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    // 2. Extraer y normalizar campos (soportando nombres en español e inglés)
    const rawName = dto.nombre ?? dto.name ?? '';
    const rawCargo = dto.cargo ?? dto.position ?? '';
    const rawEmail = dto.correoInstitucional ?? dto.correo ?? dto.email ?? '';
    const rawDocument = dto.documento ?? dto.documentNumber ?? '';
    const rawDocType = dto.tipoDocumento ?? dto.documentType ?? 'CC';
    const rawPhone = dto.telefono ?? dto.phone ?? null;
    const rawCompanyId = dto.empresaId ?? dto.companyId ?? actor.companyId ?? '';

    // 3. Criterio 2: Validar formato del correo institucional (chk_correo_tutor_valido) -> 400 Bad Request
    const normalizedEmail = validateTutorEmailFormat(rawEmail);

    // 4. Validar campos obligatorios del supervisor (nombre, cargo, documento, empresa)
    const normalizedName = rawName.trim();
    if (!normalizedName || normalizedName.length < 3) {
      throw new TutorLinkingError(
        'El nombre completo del supervisor inmediato es obligatorio (mínimo 3 caracteres).',
        'MISSING_TUTOR_NAME',
        400,
        'name'
      );
    }

    const normalizedCargo = rawCargo.trim();
    if (!normalizedCargo || normalizedCargo.length < 2) {
      throw new TutorLinkingError(
        'El cargo del supervisor inmediato en la empresa es obligatorio.',
        'MISSING_TUTOR_POSITION',
        400,
        'cargo'
      );
    }

    const normalizedDoc = rawDocument.trim().toUpperCase();
    if (!normalizedDoc || normalizedDoc.length < 5 || normalizedDoc.length > 15 || !/^[A-Z0-9]+$/.test(normalizedDoc)) {
      throw new TutorLinkingError(
        'El documento de identidad del supervisor es obligatorio y debe tener entre 5 y 15 caracteres alfanuméricos.',
        'INVALID_TUTOR_DOCUMENT',
        400,
        'documentNumber',
        'uq_tutor_documento_empresa'
      );
    }

    const targetCompanyId = rawCompanyId.trim();
    if (!targetCompanyId) {
      throw new TutorLinkingError(
        'Debe especificar la empresa a la cual se vinculará el supervisor inmediato (fk_tutor_empresa).',
        'MISSING_COMPANY_ID',
        400,
        'companyId',
        'fk_tutor_empresa'
      );
    }

    // 5. Multitenancy: si el actor es contacto empresarial (TUTOR_EMPRESARIAL) con empresa asignada,
    // solo puede asociar supervisores a su propia organización
    if (actor.role === 'TUTOR_EMPRESARIAL' && actor.companyId && actor.companyId !== targetCompanyId) {
      throw new TutorLinkingError(
        'No tiene permisos para vincular supervisores a una empresa distinta a su organización asignada.',
        'FORBIDDEN_COMPANY_ACCESS',
        403,
        'companyId'
      );
    }

    // 6. Validar restricción fk_tutor_empresa: la empresa debe existir y estar activa
    const company = await this.companyRepo.findById(targetCompanyId);
    if (!company || (company as any).deletedAt) {
      throw new TutorLinkingError(
        `La empresa especificada ('${targetCompanyId}') no existe en el sistema. Violación de restricción fk_tutor_empresa.`,
        'COMPANY_NOT_FOUND',
        400,
        'companyId',
        'fk_tutor_empresa'
      );
    }

    if (!company.isActive) {
      throw new TutorLinkingError(
        `La empresa '${company.businessName}' se encuentra inactiva y no admite la vinculación de nuevos supervisores.`,
        'INACTIVE_COMPANY',
        400,
        'companyId',
        'fk_tutor_empresa'
      );
    }

    // 7. Criterio 2: Validar unicidad de correo en la plataforma (uq_tutor_email) -> 400 Bad Request
    const existingByEmail = await this.tutorRepo.findByEmail(normalizedEmail);
    if (existingByEmail) {
      throw new TutorLinkingError(
        `El correo electrónico no es válido o ya se encuentra en uso ('${normalizedEmail}' ya está registrado en la plataforma). Violación de restricción uq_tutor_email.`,
        'TUTOR_EMAIL_ALREADY_IN_USE',
        400,
        'email',
        'uq_tutor_email'
      );
    }

    // 8. Validar unicidad de documento por empresa / plataforma (uq_tutor_documento_empresa) -> 400 Bad Request
    const existingByDoc = await this.tutorRepo.findByDocumentNumber(normalizedDoc, targetCompanyId);
    if (existingByDoc) {
      throw new TutorLinkingError(
        `El número de documento '${normalizedDoc}' ya se encuentra registrado y vinculado en el sistema (restricción uq_tutor_documento_empresa).`,
        'TUTOR_DOCUMENT_ALREADY_IN_USE',
        400,
        'documentNumber',
        'uq_tutor_documento_empresa'
      );
    }

    // 9. Generar hash seguro de contraseña inicial (o usar la suministrada)
    const rawPassword = dto.password?.trim() || 'Password123!';
    const passwordHash = await hashPassword(rawPassword);

    try {
      // 10. Criterio 1: Persistir en tutores_empresariales (users con rol TUTOR_EMPRESARIAL) con estado "Activo"
      const createdTutor = await this.tutorRepo.createTutor({
        name: normalizedName,
        cargo: normalizedCargo,
        email: normalizedEmail,
        documentType: rawDocType.trim() || 'CC',
        documentNumber: normalizedDoc,
        phone: rawPhone ? rawPhone.trim() : null,
        companyId: targetCompanyId,
        passwordHash,
      });

      return this.mapToTutorResponseDTO(createdTutor);
    } catch (error: unknown) {
      // Intercepción de restricciones a nivel de base de datos PostgreSQL / Prisma
      if (error instanceof TutorLinkingError) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = (error.meta?.target as string[]) || [];
          if (target.includes('email') || target.includes('uq_tutor_email')) {
            throw new TutorLinkingError(
              `El correo electrónico no es válido o ya se encuentra en uso ('${normalizedEmail}'). Falla por restricción uq_tutor_email.`,
              'TUTOR_EMAIL_ALREADY_IN_USE',
              400,
              'email',
              'uq_tutor_email'
            );
          }
          if (
            target.includes('document_number') ||
            target.includes('documentNumber') ||
            target.includes('uq_tutor_documento_empresa')
          ) {
            throw new TutorLinkingError(
              `El documento '${normalizedDoc}' ya se encuentra registrado en la empresa (restricción uq_tutor_documento_empresa).`,
              'TUTOR_DOCUMENT_ALREADY_IN_USE',
              400,
              'documentNumber',
              'uq_tutor_documento_empresa'
            );
          }
        }

        if (error.code === 'P2003') {
          throw new TutorLinkingError(
            'La empresa especificada no existe. Violación de clave foránea fk_tutor_empresa.',
            'INVALID_COMPANY_REFERENCE',
            400,
            'companyId',
            'fk_tutor_empresa'
          );
        }
      }

      const err = error as { code?: string; constraint?: string; message?: string };

      if (
        err.constraint === 'chk_correo_tutor_valido' ||
        err.code === '23514' ||
        err.message?.includes('chk_correo_tutor_valido')
      ) {
        throw new TutorLinkingError(
          `El correo electrónico no es válido o ya se encuentra en uso. Violación de restricción chk_correo_tutor_valido.`,
          'INVALID_TUTOR_EMAIL',
          400,
          'email',
          'chk_correo_tutor_valido'
        );
      }

      if (
        err.constraint === 'uq_tutor_email' ||
        err.message?.includes('uq_tutor_email') ||
        err.message?.includes('users_email_key') ||
        (err.code === '23505' && err.message?.toLowerCase().includes('email'))
      ) {
        throw new TutorLinkingError(
          `El correo electrónico no es válido o ya se encuentra en uso ('${normalizedEmail}'). Violación de restricción uq_tutor_email.`,
          'TUTOR_EMAIL_ALREADY_IN_USE',
          400,
          'email',
          'uq_tutor_email'
        );
      }

      if (
        err.constraint === 'uq_tutor_documento_empresa' ||
        err.message?.includes('uq_tutor_documento_empresa') ||
        (err.code === '23505' && err.message?.toLowerCase().includes('document'))
      ) {
        throw new TutorLinkingError(
          `El documento '${normalizedDoc}' ya se encuentra vinculado a la empresa. Violación de restricción uq_tutor_documento_empresa.`,
          'TUTOR_DOCUMENT_ALREADY_IN_USE',
          400,
          'documentNumber',
          'uq_tutor_documento_empresa'
        );
      }

      if (
        err.constraint === 'fk_tutor_empresa' ||
        err.code === '23503' ||
        err.message?.includes('fk_tutor_empresa')
      ) {
        throw new TutorLinkingError(
          'La empresa asociada no es válida. Violación de restricción fk_tutor_empresa.',
          'INVALID_COMPANY_REFERENCE',
          400,
          'companyId',
          'fk_tutor_empresa'
        );
      }

      throw error;
    }
  }

  /**
   * Lista los supervisores vinculados a una empresa (CU09 - Criterio 3)
   * Permite poblar el selector de evaluadores directos para formalización/seguimiento de práctica.
   */
  async listCompanyTutors(
    filter: CompanyTutorFilterDTO,
    actor?: AuthenticatedUser | null
  ): Promise<{ items: CompanyTutorResponseDTO[]; total: number }> {
    const companyId =
      filter.companyId?.trim() ||
      filter.empresaId?.trim() ||
      (actor?.role === 'TUTOR_EMPRESARIAL' ? actor.companyId || undefined : undefined);

    const onlyActive = filter.onlyActive !== undefined ? filter.onlyActive : true;

    const tutors = await this.tutorRepo.findByCompanyId({
      companyId,
      onlyActive,
      search: filter.search,
    });

    const mapped = tutors.map((t) => this.mapToTutorResponseDTO(t));
    return {
      items: mapped,
      total: mapped.length,
    };
  }

  /**
   * Obtiene los evaluadores directos disponibles para el formulario de formalización/seguimiento
   * de práctica de un estudiante asignado a una organización activa (CU09 - Criterio 3)
   */
  async getAvailableEvaluatorsForPractice(
    practiceId: string,
    actor?: AuthenticatedUser | null
  ): Promise<{
    practiceId: string;
    studentId: string;
    studentName: string;
    companyId: string;
    companyName: string;
    currentTutorId: string | null;
    currentStatus: string;
    evaluators: CompanyTutorResponseDTO[];
  }> {
    if (!actor) {
      throw new TutorLinkingError(
        'Debe autenticarse para consultar el formulario de formalización y evaluadores',
        'UNAUTHORIZED',
        401
      );
    }

    const practice = await this.practiceRepo.findById(practiceId);
    if (!practice) {
      throw new TutorLinkingError(
        'La asignación de práctica especificada no existe',
        'PRACTICE_NOT_FOUND',
        404
      );
    }

    // Obtener supervisores activos vinculados a la empresa activa de la práctica
    const activeTutors = await this.tutorRepo.findByCompanyId({
      companyId: practice.companyId,
      onlyActive: true,
    });

    return {
      practiceId: practice.id,
      studentId: practice.studentId,
      studentName: practice.student?.name || 'Estudiante',
      companyId: practice.companyId,
      companyName: practice.company?.businessName || 'Empresa Receptora',
      currentTutorId: practice.tutorId || null,
      currentStatus: practice.currentStatus,
      evaluators: activeTutors.map((t) => this.mapToTutorResponseDTO(t)),
    };
  }

  /**
   * Asigna un supervisor vinculado como evaluador directo en el plan/asignación de práctica (CU09 - Criterio 3)
   */
  async assignEvaluatorToPractice(
    practiceId: string,
    dto: AssignPracticeEvaluatorDTO,
    actor: AuthenticatedUser
  ): Promise<PracticeEvaluatorAssignmentResultDTO> {
    if (!actor || !actor.id) {
      throw new TutorLinkingError(
        'Debe iniciar sesión para asignar un evaluador directo a la práctica',
        'UNAUTHORIZED',
        401
      );
    }

    if (actor.role === 'ESTUDIANTE') {
      throw new TutorLinkingError(
        'Los estudiantes no tienen permisos para asignar evaluadores directos',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const targetTutorId = (dto.tutorId ?? dto.supervisorId ?? dto.evaluadorId ?? '').trim();
    if (!targetTutorId) {
      throw new TutorLinkingError(
        'Debe seleccionar un supervisor inmediato válido como evaluador directo.',
        'MISSING_EVALUATOR_ID',
        400,
        'tutorId'
      );
    }

    const practice = await this.practiceRepo.findById(practiceId);
    if (!practice) {
      throw new TutorLinkingError(
        'La asignación de práctica del estudiante no fue encontrada',
        'PRACTICE_NOT_FOUND',
        404
      );
    }

    // Verificar que el supervisor exista, esté activo y pertenezca a la misma empresa activa de la práctica
    const tutor = await this.tutorRepo.findById(targetTutorId);
    if (!tutor) {
      throw new TutorLinkingError(
        'El supervisor seleccionado no existe o no está registrado como tutor empresarial.',
        'EVALUATOR_NOT_FOUND',
        404,
        'tutorId'
      );
    }

    if (tutor.status !== 'ACTIVO' || !tutor.isActive) {
      throw new TutorLinkingError(
        'El supervisor seleccionado no se encuentra en estado Activo y no puede ser asignado como evaluador.',
        'INACTIVE_EVALUATOR',
        400,
        'tutorId'
      );
    }

    if (tutor.companyId !== practice.companyId) {
      throw new TutorLinkingError(
        'El supervisor seleccionado no está vinculado a la empresa receptora donde fue asignado el estudiante (fk_tutor_empresa).',
        'EVALUATOR_COMPANY_MISMATCH',
        400,
        'tutorId',
        'fk_tutor_empresa'
      );
    }

    if (tutor.company && !tutor.company.isActive) {
      throw new TutorLinkingError(
        'La empresa vinculada al supervisor se encuentra inactiva.',
        'INACTIVE_COMPANY',
        400,
        'companyId'
      );
    }

    const targetTeacherId = (dto.teacherId ?? dto.docenteId)?.trim() || undefined;

    const updatedPractice = await this.practiceRepo.assignTutorToPractice({
      practiceId: practice.id,
      tutorId: tutor.id,
      teacherId: targetTeacherId,
      changedByUserId: actor.id,
      notes: dto.notes,
    });

    const mappedTutor = this.mapToTutorResponseDTO(tutor);

    return {
      practiceId: updatedPractice.id,
      studentId: updatedPractice.studentId,
      companyId: updatedPractice.companyId,
      tutorId: tutor.id,
      tutor: {
        id: mappedTutor.id,
        name: mappedTutor.name,
        nombre: mappedTutor.nombre,
        cargo: mappedTutor.cargo,
        position: mappedTutor.position,
        email: mappedTutor.email,
        correo: mappedTutor.correo,
        documentNumber: mappedTutor.documentNumber,
        documento: mappedTutor.documento,
        estado: mappedTutor.estado,
      },
      teacherId: updatedPractice.teacherId,
      currentStatus: updatedPractice.currentStatus as any,
      updatedAt: updatedPractice.updatedAt,
      message: `Supervisor '${mappedTutor.name}' (${mappedTutor.cargo}) asignado exitosamente como evaluador directo de la práctica.`,
    };
  }

  /**
   * Mapea la entidad persistida a CompanyTutorResponseDTO con estado "Activo" / "Inactivo"
   */
  public mapToTutorResponseDTO(tutor: any): CompanyTutorResponseDTO {
    const isActiveStatus = tutor.status === 'ACTIVO' && tutor.isActive !== false;
    const estadoDomain = isActiveStatus ? 'Activo' : 'Inactivo';
    const cargoValue =
      tutor.cargo ||
      tutor.position ||
      (tutor.program && tutor.program !== 'Ingeniería de Sistemas'
        ? tutor.program
        : 'Supervisor Empresarial');

    return {
      id: tutor.id,
      usuarioId: tutor.id,
      userId: tutor.id,
      empresaId: tutor.companyId || '',
      companyId: tutor.companyId || '',
      nombre: tutor.name,
      name: tutor.name,
      cargo: cargoValue,
      position: cargoValue,
      correo: tutor.email,
      email: tutor.email,
      tipoDocumento: tutor.documentType || 'CC',
      documentType: tutor.documentType || 'CC',
      documento: tutor.documentNumber,
      documentNumber: tutor.documentNumber,
      telefono: tutor.phone || null,
      phone: tutor.phone || null,
      role: 'TUTOR_EMPRESARIAL',
      estado: estadoDomain,
      status: estadoDomain,
      userStatus: isActiveStatus ? 'ACTIVO' : 'INACTIVO',
      isActive: isActiveStatus,
      company: tutor.company
        ? {
            id: tutor.company.id,
            businessName: tutor.company.businessName,
            nit: tutor.company.nit,
            city: tutor.company.city,
            isActive: tutor.company.isActive ?? true,
          }
        : null,
      assignedPracticesCount: tutor._count?.practicesAsTutor ?? 0,
      createdAt: tutor.createdAt || new Date(),
      updatedAt: tutor.updatedAt || new Date(),
    };
  }
}

export const tutorLinkingService = new TutorLinkingService();

let activeTutorServiceInstance: TutorLinkingService | null = null;

export function getTutorLinkingService(): TutorLinkingService {
  return activeTutorServiceInstance || tutorLinkingService;
}

export function setTutorLinkingServiceInstance(service: TutorLinkingService | null): void {
  activeTutorServiceInstance = service;
}
