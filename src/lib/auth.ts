// ==============================================================================
// SIGETRAP - Módulo de Autenticación, Hashing y RBAC
// ==============================================================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role, UserStatus, UserJwtPayload, AuthenticatedUser } from '@/types';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'sigetrap-fallback-secret-development-2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_NAME = process.env.COOKIE_NAME || 'sigetrap_session_token';

/**
 * Genera un hash seguro para contraseñas usando BCrypt con factor de costo 12
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Compara y verifica una contraseña en texto plano contra el hash almacenado
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Emite un JSON Web Token firmado con el payload del usuario autenticado
 */
export function generateToken(payload: UserJwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']) || '7d',
  });
}

/**
 * Valida y decodifica un JWT
 */
export function verifyToken(token: string): UserJwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserJwtPayload;
  } catch {
    return null;
  }
}

/**
 * Verifica si un rol de usuario tiene los permisos requeridos (RBAC)
 */
export function hasRequiredRole(userRole: Role, allowedRoles: Role[]): boolean {
  if (userRole === 'ADMIN') return true; // Administrador tiene acceso transversal
  return allowedRoles.includes(userRole);
}

/**
 * Extrae y autentica al usuario desde los headers o cookies de NextRequest
 * Rechaza usuarios en estado INACTIVO (RNF01, RNF04, HU01 Criterio 2)
 */
export function getAuthenticatedUser(req: NextRequest): AuthenticatedUser | null {
  // 1. Intentar obtener el token del Header 'Authorization: Bearer <token>'
  const authHeader = req.headers.get('authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Si no viene en el Header, buscar en las cookies HTTP-only
  if (!token) {
    const cookie = req.cookies.get(COOKIE_NAME);
    if (cookie) {
      token = cookie.value;
    }
  }

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  // Rechazar sesiones de usuarios inactivos
  if (payload.status === 'INACTIVO') {
    return null;
  }

  return {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
    name: payload.name,
    status: payload.status || 'ACTIVO',
    tokenVersion: payload.tokenVersion || 1,
    companyId: payload.companyId,
    studentCode: payload.studentCode,
  };
}
