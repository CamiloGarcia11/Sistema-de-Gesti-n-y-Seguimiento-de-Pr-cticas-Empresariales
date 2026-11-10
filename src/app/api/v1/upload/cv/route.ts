export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Subida de Documentos, Hojas de Vida y Evidencias
// Endpoint: POST /api/v1/upload/cv
// Almacena en Supabase Storage (bucket: sigetrap-expedientes) + respaldo local
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getAuthenticatedUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiResponse } from '@/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp'];

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{
  url: string;
  cvUrl: string;
  fileUrl: string;
  supabaseUrl?: string | null;
  bucket?: string;
  fileName: string;
  size: number;
  mimeType: string;
  attachmentId?: string | null;
}>>> {
  const actor = getAuthenticatedUser(request);
  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Debe iniciar sesión para subir archivos al sistema',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = ((formData.get('category') as string) || 'cv').replace(/[^a-zA-Z0-9_-]/g, '');
    const entidadTipo = (formData.get('entidadTipo') as string) || null;
    const entidadId = (formData.get('entidadId') as string) || null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FILE_MISSING',
            message: 'No se seleccionó ningún archivo para adjuntar',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EMPTY_FILE',
            message: 'El archivo seleccionado está vacío (0 bytes)',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'El archivo supera el tamaño máximo permitido de 10 MB',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const ext = path.extname(file.name).toLowerCase() || '.pdf';
    const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type);
    const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);

    if (!isAllowedMime && !isAllowedExt) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Formato de archivo no válido. Solo se permiten documentos PDF, Word (.doc, .docx) o imágenes (.png, .jpg)',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const safeBaseName = path
      .basename(file.name, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 40);
    const uniqueFileName = `${category}_${actor.id.substring(0, 8)}_${Date.now()}_${safeBaseName}${ext}`;

    // 1. Guardar copia local en public/uploads/<category> para acceso inmediato en el servidor local
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', category);
    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, uniqueFileName);
    await writeFile(filePath, buffer);
    const localUrl = `/uploads/${category}/${uniqueFileName}`;

    // 2. Subir al bucket de Supabase Storage (sigetrap-expedientes) si está configurado
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET_DOCS || 'sigetrap-expedientes';
    let supabaseStorageUrl: string | null = null;

    if (supabaseUrl && serviceKey) {
      try {
        const objectPath = `${category}/${uniqueFileName}`;
        const storageEndpoint = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucketName}/${objectPath}`;
        const upRes = await fetch(storageEndpoint, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': file.type || 'application/pdf',
            'x-upsert': 'true',
          },
          body: buffer,
        });
        if (upRes.ok) {
          supabaseStorageUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/authenticated/${bucketName}/${objectPath}`;
        }
      } catch (storageErr) {
        console.warn('[POST /api/v1/upload/cv] Respaldo local activo; aviso en Supabase Storage:', storageErr);
      }
    }

    // 3. Registrar opcionalmente en la tabla archivos_adjuntos de la base de datos
    let attachmentId: string | null = null;
    if (entidadId) {
      try {
        const att = await prisma.attachment.create({
          data: {
            entidadTipo: entidadTipo || category.toUpperCase(),
            entidadId,
            nombreArchivo: file.name,
            urlArchivo: localUrl,
            tipoMime: file.type || 'application/pdf',
            tamanoBytes: file.size,
            subidoPorId: actor.id,
          },
        });
        attachmentId = att.id;
      } catch (attErr) {
        console.warn('[POST /api/v1/upload/cv] No se pudo registrar metadata en archivos_adjuntos:', attErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          url: localUrl,
          cvUrl: localUrl,
          fileUrl: localUrl,
          supabaseUrl: supabaseStorageUrl,
          bucket: bucketName,
          fileName: file.name,
          size: file.size,
          mimeType: file.type || 'application/pdf',
          attachmentId,
        },
        message: 'Documento subido y validado exitosamente',
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/v1/upload/cv] Error al procesar archivo:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: 'Error interno al procesar y almacenar el documento',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
