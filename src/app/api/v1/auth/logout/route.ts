// ==============================================================================
// SIGETRAP - Controlador de Cierre de Sesión (Logout)
// Endpoint: POST /api/v1/auth/logout
// ==============================================================================

import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';

const COOKIE_NAME = process.env.COOKIE_NAME || 'sigetrap_session_token';

export async function POST(): Promise<NextResponse<ApiResponse<{ loggedOut: boolean }>>> {
  const response = NextResponse.json(
    {
      success: true,
      data: { loggedOut: true },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );

  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });

  return response;
}
