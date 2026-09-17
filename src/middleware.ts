import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = process.env.COOKIE_NAME || 'sigetrap_session_token';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Proteger rutas administrativas (/admin/*)
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    try {
      // Decodificar el payload del JWT
      const parts = token.split('.');
      if (parts.length !== 3) {
        return NextResponse.redirect(new URL('/login', request.url));
      }

      const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
      const payload = JSON.parse(payloadJson);

      // Solo usuarios con rol ADMIN pueden acceder a /admin/*
      if (payload.role !== 'ADMIN' || payload.status === 'INACTIVO') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
