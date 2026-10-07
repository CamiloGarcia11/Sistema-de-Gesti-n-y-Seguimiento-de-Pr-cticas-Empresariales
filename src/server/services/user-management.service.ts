// ==============================================================================
// SIGETRAP - Servicio de Gestión de Usuarios y Seguridad (HU01)
// Capa de Servicios (RNF11)
// ==============================================================================

import {
  UserRepository,
  userRepository,
} from '@/server/repositories/user.repository';
import {
  CreateUserDTO,
  UserFilterDTO,
  AuthenticatedUser,
  UserResponseDTO,
  DeactivateUserResponseDTO,
  Role,
} from '@/types';
import { hashPassword } from '@/lib/auth';
import { Prisma } from '@prisma/client';

export class ValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;

  constructor(message: string, code: string = 'VALIDATION_ERROR', statusCode: number = 422, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
  }
}

export class UserManagementService {
  constructor(private userRepo: UserRepository = userRepository) {}

  /**
   * Registra un nuevo usuario con validación estricta de unicidad (HU01 - Criterio 1)
   * Previene duplicación de documento y correo institucional antes de la persistencia.
   */
  async registerUser(
    dto: CreateUserDTO,
    actor?: AuthenticatedUser
  ): Promise<UserResponseDTO> {
    // 1. Si hay un actor autenticado creando el usuario, validar permisos RBAC
    if (actor && actor.role !== 'ADMIN' && actor.role !== 'DIRECTOR_PROGRAMA') {
      throw new ValidationError(
        'No tiene permisos suficientes para registrar usuarios en el sistema',
        'FORBIDDEN_OPERATION',
        403
      );
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedDoc = dto.documentNumber.trim();

    // 2. Criterio 1 (PU): Validar que el correo no esté registrado previamente
    const existingUserByEmail = await this.userRepo.findByEmail(normalizedEmail);
    if (existingUserByEmail) {
      throw new ValidationError(
        `Ya existe un usuario registrado con el correo electrónico '${normalizedEmail}'`,
        'EMAIL_ALREADY_EXISTS',
        409,
        'email'
      );
    }

    // 3. Criterio 1 (PU): Validar que el número de documento no esté registrado previamente
    const existingUserByDoc = await this.userRepo.findByDocumentNumber(normalizedDoc);
    if (existingUserByDoc) {
      throw new ValidationError(
        `Ya existe un usuario registrado con el documento de identidad '${normalizedDoc}'`,
        'DOCUMENT_ALREADY_EXISTS',
        409,
        'documentNumber'
      );
    }

    // 4. Hashear la contraseña de forma segura con BCrypt (RNF01, RNF02)
    const passwordHash = await hashPassword(dto.password);

    try {
      // 5. Persistir en la base de datos
      const user = await this.userRepo.create({
        email: normalizedEmail,
        passwordHash,
        name: dto.name.trim(),
        documentType: dto.documentType || 'CC',
        documentNumber: normalizedDoc,
        phone: dto.phone?.trim() || null,
        role: dto.role,
        status: dto.status || 'ACTIVO',
        isActive: dto.status === 'INACTIVO' ? false : true,
        studentCode: dto.studentCode?.trim() || null,
        academicAverage: dto.academicAverage !== undefined ? dto.academicAverage : null,
        approvedCredits: dto.approvedCredits !== undefined ? dto.approvedCredits : null,
        program: dto.program || 'Ingeniería de Sistemas',
        company: dto.companyId ? { connect: { id: dto.companyId } } : undefined,
      });

      return this.mapToResponseDTO(user);
    } catch (error: unknown) {
      // Manejar constraint de BD por concurrencia (P2002)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[]) || [];
        if (target.includes('email')) {
          throw new ValidationError(
            `Restricción UNIQUE: El correo '${normalizedEmail}' ya se encuentra en uso`,
            'EMAIL_ALREADY_EXISTS',
            409,
            'email'
          );
        }
        if (target.includes('document_number') || target.includes('documentNumber')) {
          throw new ValidationError(
            `Restricción UNIQUE: El documento '${normalizedDoc}' ya se encuentra en uso`,
            'DOCUMENT_ALREADY_EXISTS',
            409,
            'documentNumber'
          );
        }
      }
      throw error;
    }
  }

  /**
   * Desactiva una cuenta de usuario y revoca tokens vigentes (HU01 - Criterio 2)
   * Requiere sesión activa de Administrador (Admin Auth).
   */
  async deactivateUser(
    targetUserId: string,
    actor: AuthenticatedUser
  ): Promise<DeactivateUserResponseDTO> {
    // 1. Criterio 2 (PI): Validar que el actor sea un Administrador autenticado
    if (actor.role !== 'ADMIN') {
      throw new ValidationError(
        'Acceso denegado: Únicamente un administrador puede desactivar cuentas de usuario',
        'ADMIN_AUTH_REQUIRED',
        403
      );
    }

    // 2. Validar que la cuenta objetivo exista
    const targetUser = await this.userRepo.findById(targetUserId);
    if (!targetUser) {
      throw new ValidationError(
        'El usuario a desactivar no existe en el sistema',
        'USER_NOT_FOUND',
        404
      );
    }

    // 3. Prevenir que el admin se desactive a sí mismo
    if (targetUser.id === actor.id) {
      throw new ValidationError(
        'No está permitido desactivar su propia cuenta de administrador',
        'CANNOT_DEACTIVATE_SELF',
        400
      );
    }

    // 4. Cambiar estado a INACTIVO, isActive a false e invalidar tokens
    const updatedUser = await this.userRepo.deactivateUser(targetUserId);

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      status: updatedUser.status as 'INACTIVO',
      isActive: updatedUser.isActive,
      message: 'Cuenta desactivada exitosamente. Todas las sesiones activas han sido revocadas.',
      deactivatedAt: updatedUser.updatedAt,
    };
  }

  /**
   * Habilita/Activa una cuenta de usuario previamente inactiva
   */
  async activateUser(
    targetUserId: string,
    actor: AuthenticatedUser
  ): Promise<UserResponseDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ValidationError(
        'Acceso denegado: Únicamente un administrador puede habilitar cuentas de usuario',
        'ADMIN_AUTH_REQUIRED',
        403
      );
    }

    const targetUser = await this.userRepo.findById(targetUserId);
    if (!targetUser) {
      throw new ValidationError(
        'El usuario a habilitar no existe en el sistema',
        'USER_NOT_FOUND',
        404
      );
    }

    const updatedUser = await this.userRepo.activateUser(targetUserId);
    return this.mapToResponseDTO(updatedUser);
  }

  /**
   * Habilita un usuario validando su documento de identidad y correo institucional (HU01)
   * Si la cuenta existe inactiva/pendiente, la activa y actualiza sus credenciales;
   * si no existe, la crea y habilita directamente en el sistema con unicidad garantizada.
   */
  async enableUserByDocument(
    dto: {
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
    },
    actor: AuthenticatedUser
  ): Promise<{ user: UserResponseDTO; isNew: boolean; message: string }> {
    if (actor.role !== 'ADMIN') {
      throw new ValidationError(
        'Acceso denegado: Únicamente un administrador puede habilitar usuarios por documento de identidad',
        'ADMIN_AUTH_REQUIRED',
        403
      );
    }

    const normalizedDoc = dto.documentNumber.trim();
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Buscar si ya existe una cuenta con este número de documento
    const existingUserByDoc = await this.userRepo.findByDocumentNumber(normalizedDoc);

    if (existingUserByDoc) {
      // Validar si el correo ingresado pertenece a otro usuario distinto
      const existingUserByEmail = await this.userRepo.findByEmail(normalizedEmail);
      if (existingUserByEmail && existingUserByEmail.id !== existingUserByDoc.id) {
        throw new ValidationError(
          `El correo '${normalizedEmail}' ya se encuentra registrado con otro documento de identidad`,
          'EMAIL_ALREADY_EXISTS',
          409,
          'email'
        );
      }

      // Preparar datos de actualización y habilitación
      const updateData: Prisma.UserUpdateInput = {
        status: 'ACTIVO',
        isActive: true,
        email: normalizedEmail,
      };

      if (dto.name?.trim()) updateData.name = dto.name.trim();
      if (dto.documentType) updateData.documentType = dto.documentType;
      if (dto.role) updateData.role = dto.role;
      if (dto.studentCode) updateData.studentCode = dto.studentCode.trim();
      if (dto.academicAverage !== undefined) updateData.academicAverage = dto.academicAverage;
      if (dto.approvedCredits !== undefined) updateData.approvedCredits = dto.approvedCredits;
      if (dto.phone) updateData.phone = dto.phone.trim();
      if (dto.password) {
        updateData.passwordHash = await hashPassword(dto.password);
      }

      const updatedUser = await this.userRepo.updateUser(existingUserByDoc.id, updateData);

      return {
        user: this.mapToResponseDTO(updatedUser),
        isNew: false,
        message: `Cuenta asociada al documento ${normalizedDoc} habilitada exitosamente como ACTIVA.`,
      };
    }

    // 2. Si no existe por documento, verificar que el correo no esté ocupado
    const existingByEmail = await this.userRepo.findByEmail(normalizedEmail);
    if (existingByEmail) {
      throw new ValidationError(
        `El correo '${normalizedEmail}' ya se encuentra registrado para el usuario '${existingByEmail.name}' con documento '${existingByEmail.documentNumber}'`,
        'EMAIL_ALREADY_EXISTS',
        409,
        'email'
      );
    }

    // 3. Crear y habilitar nuevo usuario
    if (!dto.name || !dto.password || !dto.role) {
      throw new ValidationError(
        'Para registrar y habilitar un nuevo usuario se requiere nombre, contraseña y rol',
        'MISSING_REQUIRED_FIELDS',
        422
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const newUser = await this.userRepo.create({
      email: normalizedEmail,
      passwordHash,
      name: dto.name.trim(),
      documentType: dto.documentType || 'CC',
      documentNumber: normalizedDoc,
      phone: dto.phone?.trim() || null,
      role: dto.role,
      status: 'ACTIVO',
      isActive: true,
      studentCode: dto.studentCode?.trim() || null,
      academicAverage: dto.academicAverage !== undefined ? dto.academicAverage : null,
      approvedCredits: dto.approvedCredits !== undefined ? dto.approvedCredits : null,
      program: 'Ingeniería de Sistemas',
    });

    return {
      user: this.mapToResponseDTO(newUser),
      isNew: true,
      message: `Usuario ${newUser.name} registrado y habilitado exitosamente con documento ${normalizedDoc}.`,
    };
  }

  /**
   * Consulta el estado de identidad de un usuario por documento y correo para validación previa
   */
  async verifyIdentity(documentNumber: string, email?: string) {
    const userByDoc = await this.userRepo.findByDocumentNumber(documentNumber.trim());
    let userByEmail = null;

    if (email) {
      userByEmail = await this.userRepo.findByEmail(email.trim().toLowerCase());
    }

    return {
      existsByDocument: !!userByDoc,
      existsByEmail: !!userByEmail,
      user: userByDoc ? this.mapToResponseDTO(userByDoc) : userByEmail ? this.mapToResponseDTO(userByEmail) : null,
      canEnable: userByDoc ? userByDoc.status !== 'ACTIVO' || !userByDoc.isActive : true,
    };
  }

  /**
   * Consulta el detalle de un usuario por su ID
   */
  async getUserById(id: string, actor: AuthenticatedUser): Promise<UserResponseDTO> {
    // Un usuario normal solo puede consultar su propio perfil a menos que sea ADMIN o DIRECTOR
    if (actor.role !== 'ADMIN' && actor.role !== 'DIRECTOR_PROGRAMA' && actor.id !== id) {
      throw new ValidationError(
        'No tiene autorización para consultar los datos de este usuario',
        'FORBIDDEN',
        403
      );
    }

    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new ValidationError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
    }

    return this.mapToResponseDTO(user);
  }

  /**
   * Lista usuarios con filtros y paginación
   */
  async listUsers(filter: UserFilterDTO, actor: AuthenticatedUser) {
    if (
      actor.role !== 'ADMIN' &&
      actor.role !== 'DIRECTOR_PROGRAMA' &&
      actor.role !== 'DOCENTE_PRACTICA'
    ) {
      throw new ValidationError(
        'No tiene autorización para listar el directorio de usuarios',
        'FORBIDDEN',
        403
      );
    }

    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const skip = (page - 1) * limit;

    const { users, total } = await this.userRepo.findMany({
      role: filter.role,
      status: filter.status,
      search: filter.search,
      skip,
      take: limit,
    });

    return {
      items: users.map((u) => this.mapToResponseDTO(u)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private mapToResponseDTO(user: any): UserResponseDTO {
    const latestPractice = user.practicesAsStudent && user.practicesAsStudent.length > 0 ? user.practicesAsStudent[0] : null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      phone: user.phone,
      role: user.role,
      status: user.status || (user.isActive ? 'ACTIVO' : 'INACTIVO'),
      isActive: user.isActive,
      studentCode: user.studentCode,
      academicAverage: user.academicAverage !== undefined ? user.academicAverage : null,
      approvedCredits: user.approvedCredits !== undefined ? user.approvedCredits : null,
      program: user.program,
      companyId: user.companyId,
      company: user.company
        ? {
            id: user.company.id,
            businessName: user.company.businessName,
            nit: user.company.nit,
          }
        : null,
      activePractice: latestPractice
        ? {
            id: latestPractice.id,
            currentStatus: latestPractice.currentStatus,
            companyName: latestPractice.company?.businessName || null,
            vacancyTitle: latestPractice.vacancy?.title || null,
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export const userManagementService = new UserManagementService();
