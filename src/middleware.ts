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

  if (!isApiAdminRoute && !isPageAdminRoute) {
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
  if (!payload) {
    if (isApiAdminRoute) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Sesión inválida o expirada' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Validar rol y estado del usuario (Aquí se integró tu validación de BLOQUEADO)
  const isAuthorized = payload.role === 'ADMIN' && payload.status !== 'INACTIVO' && payload.status !== 'BLOQUEADO';

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/v1/admin/:path*'],
};