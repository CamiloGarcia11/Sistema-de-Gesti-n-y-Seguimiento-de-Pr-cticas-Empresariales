// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = process.env.COOKIE_NAME || 'sigetrap_session_token';

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

function getToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7);
  return request.cookies.get(COOKIE_NAME)?.value ?? null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiAdminRoute = pathname.startsWith('/api/v1/admin');
  const isPageAdminRoute = pathname.startsWith('/admin');
  const isStudentsRoute = pathname.startsWith('/estudiantes');
  const isProtectedAppRoute =
    pathname.startsWith('/vacantes') ||
    pathname.startsWith('/empresas') ||
    pathname.startsWith('/estudiante') ||
    isStudentsRoute ||
    isPageAdminRoute;

  if (!isApiAdminRoute && !isProtectedAppRoute) {
    return NextResponse.next();
  }

  const token = getToken(request);

  // Sin sesion activa
  if (!token) {
    if (isApiAdminRoute) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión para acceder a este recurso' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwtPayload(token);

  // Token corrupto o inválido
  if (!payload || payload.status === 'INACTIVO' || payload.status === 'BLOQUEADO') {
    if (isApiAdminRoute) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Sesión inválida, inactiva o expirada' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Si es ruta administrativa, validar rol ADMIN
  if (isApiAdminRoute || isPageAdminRoute) {
    const isAuthorized = payload.role === 'ADMIN';

    if (!isAuthorized) {
      if (isApiAdminRoute) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN_RBAC',
              message: 'No tiene privilegios de administrador para acceder a este recurso',
            },
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Si es ruta de supervisión de estudiantes / practicantes, validar roles docentes, tutor o admin
  if (isStudentsRoute) {
    const isAuthorized =
      payload.role === 'DOCENTE_PRACTICA' ||
      payload.role === 'DIRECTOR_PROGRAMA' ||
      payload.role === 'TUTOR_EMPRESARIAL' ||
      payload.role === 'ADMIN';

    if (!isAuthorized) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/v1/admin/:path*',
    '/vacantes/:path*',
    '/empresas/:path*',
    '/estudiantes/:path*',
    '/estudiante/:path*',
  ],
};