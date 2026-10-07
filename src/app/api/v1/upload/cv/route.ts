export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Carga de Soporte de Hoja de Vida (CV)
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - POST /api/v1/upload/cv
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { ApiResponse } from '@/types';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión para cargar documentos' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FILE_REQUIRED',
            message: 'No se ha proporcionado ningún archivo de hoja de vida',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Validar tipo MIME
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'El archivo debe ser un documento PDF o Word (.pdf, .doc, .docx)',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    // Validar tamaño máximo (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'El archivo de la hoja de vida no debe exceder 10MB',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Asegurar directorio public/uploads/cv
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'cv');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const sanitizedFileName = `${actor.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadsDir, sanitizedFileName);
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/cv/${sanitizedFileName}`;

    return NextResponse.json(
      {
        success: true,
        message: 'Hoja de vida cargada exitosamente',
        data: {
          cvUrl: publicUrl,
          fileName: file.name,
          size: file.size,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error al subir archivo de hoja de vida:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: 'Error al procesar y almacenar el archivo de la hoja de vida',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
