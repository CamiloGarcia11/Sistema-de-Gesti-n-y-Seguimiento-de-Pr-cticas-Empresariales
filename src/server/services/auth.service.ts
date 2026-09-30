// ==============================================================================
// SIGETRAP - Servicio de Autenticación y Sesión (CU01)
// Capa de Servicios (RNF11)
// Módulo: Seguridad / Autenticación y sesión
// ==============================================================================

import {
  UserRepository,
  userRepository,
} from '@/server/repositories/user.repository';
import { comparePassword, generateToken } from '@/lib/auth';
import { UserResponseDTO } from '@/types';

export class AuthError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = 'AUTH_ERROR', statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AuthService {
  constructor(private userRepo: UserRepository = userRepository) {}

  setRepository(repo: UserRepository) {
    this.userRepo = repo;
  }

  /**
   * CU01 - Autenticación de usuario con credenciales cifradas y token JWT
   * 
   * Criterio 1: Bloqueo de usuarios inactivos / bloqueados
   * Dado que un usuario introduce credenciales válidas pero su cuenta está en estado 'BLOQUEADO' o 'INACTIVO',
   * se deniega el acceso con código 403 Forbidden y el mensaje "cuenta deshabilitada".
   */
  async login(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: UserResponseDTO; token: string }> {
    const normalizedEmail = credentials.email.trim().toLowerCase();

    // 1. Buscar usuario por email institucional
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new AuthError(
        'El correo electrónico o la contraseña son incorrectos',
        'INVALID_CREDENTIALS',
        401
      );
    }

    // 2. Verificar contraseña cifrada con BCrypt (RNF01, RNF02)
    const isValidPassword = await comparePassword(credentials.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthError(
        'El correo electrónico o la contraseña son incorrectos',
        'INVALID_CREDENTIALS',
        401
      );
    }

    // 3. Criterio 1 (PI): Validar estado de la cuenta (bloqueado o inactivo)
    if (user.status === 'BLOQUEADO' || user.status === 'INACTIVO' || !user.isActive) {
      throw new AuthError('cuenta deshabilitada', 'ACCOUNT_DISABLED', 403);
    }

    // 4. Generar Token JWT con claims y rol para autorización (RBAC)
    const token = generateToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status as any,
      tokenVersion: user.tokenVersion,
      companyId: user.companyId,
      studentCode: user.studentCode,
    });

    const userDTO: UserResponseDTO = {
      id: user.id,
      email: user.email,
      name: user.name,
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      phone: user.phone,
      role: user.role,
      status: user.status as any,
      isActive: user.isActive,
      studentCode: user.studentCode,
      program: user.program,
      companyId: user.companyId,
      company: user.company,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return { user: userDTO, token };
  }
}

export const authService = new AuthService();
