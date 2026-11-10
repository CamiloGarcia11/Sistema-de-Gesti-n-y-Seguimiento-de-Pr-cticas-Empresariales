export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Carga de Soporte/Renovación de ARL del Estudiante
// Capa de Controladores (Route Handler RNF11)
// Endpoint:
//   - POST /api/v1/estudiantes/[id]/arl/documento (RN02 - Subida de certificado ARL)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAuthenticatedUser } from '@/lib/auth';
import { getArlAlertService, ArlAlertError } from '@/server/services/arl-alert.service';
import type { ApiResponse, UploadArlDocumentDTO } from '@/types';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para cargar el soporte de afiliación a ARL',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const resolvedParams = await Promise.resolve(context.params);
    const studentId = resolvedParams.id;

    const contentType = req.headers.get('content-type') || '';
    let dto: UploadArlDocumentDTO;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const uploadedFile = (formData.get('file') || formData.get('document')) as File | null;
      let documentUrl = String(formData.get('documentUrl') || '').trim();

      if (uploadedFile && typeof uploadedFile === 'object' && 'arrayBuffer' in uploadedFile) {
        if (uploadedFile.type && !ALLOWED_MIME_TYPES.has(uploadedFile.type)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'INVALID_FILE_TYPE',
                message: 'Solo se permiten archivos PDF o imágenes (PNG/JPG) para el certificado de ARL',
              },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }

        if (uploadedFile.size > MAX_FILE_SIZE_BYTES) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'FILE_TOO_LARGE',
                message: 'El certificado de ARL no debe superar los 10 MB',
              },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }

        const safeFileName = uploadedFile.name
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .toLowerCase();
        const storedFileName = `arl-${studentId}-${Date.now()}-${safeFileName}`;

        try {
          const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'arl');
          await mkdir(uploadDir, { recursive: true });
          const buffer = Buffer.from(await uploadedFile.arrayBuffer());
          await writeFile(path.join(uploadDir, storedFileName), buffer);
        } catch {
          // En entornos serverless de solo lectura igual conservamos la URL de referencia
        }

        documentUrl = `/uploads/arl/${storedFileName}`;
      }

      dto = {
        practiceId: formData.get('practiceId') ? String(formData.get('practiceId')).trim() : undefined,
        documentUrl,
        expirationDate: String(formData.get('expirationDate') || '').trim(),
        policyNumber: formData.get('policyNumber') ? String(formData.get('policyNumber')).trim() : undefined,
        arlEntityName: formData.get('arlEntityName') ? String(formData.get('arlEntityName')).trim() : undefined,
      };
    } else {
      const body = await req.json().catch(() => ({}));
      dto = {
        practiceId: body.practiceId,
        documentUrl: body.documentUrl || body.arlSupportUrl || '',
        expirationDate: body.expirationDate || body.arlExpirationDate || '',
        policyNumber: body.policyNumber || body.arlPolicyNumber,
        arlEntityName: body.arlEntityName,
      };
    }

    const service = getArlAlertService();
    const result = await service.uploadStudentArlDocument(studentId, dto, actor);

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ArlAlertError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: {
              field: error.field,
              constraint: error.constraint,
            },
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[API_POST_ESTUDIANTE_ARL_DOCUMENTO_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al procesar la subida del certificado de ARL',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
