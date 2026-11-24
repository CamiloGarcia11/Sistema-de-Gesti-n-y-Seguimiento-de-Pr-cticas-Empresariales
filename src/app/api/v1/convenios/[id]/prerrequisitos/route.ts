export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Prerrequisitos Documentales del Convenio (Criterio 1 & RN02)
// Endpoints:
//   - GET  /api/v1/convenios/[id]/prerrequisitos (Consulta prerrequisitos y checklist)
//   - POST /api/v1/convenios/[id]/prerrequisitos (Carga y valida documentos de soporte)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  getAgreementLegalService,
  AgreementLegalError,
} from '@/server/services/agreement-legal.service';
import { ApiResponse, UploadPrerequisiteInputDTO } from '@/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para consultar los prerrequisitos del convenio',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const service = getAgreementLegalService();
    const agreement = await service.getAgreementDetails(id, actor);

    return NextResponse.json(
      {
        success: true,
        data: {
          agreementId: agreement.id,
          status: agreement.status,
          prerequisites: agreement.prerequisites,
          checklist: agreement.checklist,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof AgreementLegalError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[GET /api/v1/convenios/[id]/prerrequisitos] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al consultar los prerrequisitos del convenio',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Debe iniciar sesión para cargar prerrequisitos del convenio',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    const contentType = req.headers.get('content-type') || '';
    let inputs: UploadPrerequisiteInputDTO[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const documentType = String(formData.get('documentType') || '');
      const issuedAt = (formData.get('issuedAt') as string) || null;
      const observations = (formData.get('observations') as string) || null;
      const file = formData.get('file') as File | null;
      const providedFileUrl = (formData.get('fileUrl') as string) || '';

      let finalFileUrl = providedFileUrl.trim();
      let finalFileName = (formData.get('fileName') as string) || null;
      let finalMimeType = (formData.get('mimeType') as string) || null;

      if (file) {
        if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: file.size <= 0 ? 'EMPTY_FILE' : 'FILE_TOO_LARGE',
                message:
                  file.size <= 0
                    ? 'El archivo seleccionado está vacío (0 bytes)'
                    : 'El archivo supera el límite máximo permitido de 10 MB',
              },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }

        const ext = path.extname(file.name).toLowerCase() || '.pdf';
        const safeBase = path
          .basename(file.name, ext)
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .substring(0, 40);
        const uniqueName = `conv_${id.slice(0, 8)}_${Date.now()}_${safeBase}${ext}`;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'convenios');
        await mkdir(uploadDir, { recursive: true });
        const bytes = await file.arrayBuffer();
        await writeFile(path.join(uploadDir, uniqueName), Buffer.from(bytes));

        finalFileUrl = `/uploads/convenios/${uniqueName}`;
        finalFileName = file.name;
        finalMimeType = file.type || null;
      }

      inputs = [
        {
          documentType,
          fileUrl: finalFileUrl,
          fileName: finalFileName,
          mimeType: finalMimeType,
          issuedAt,
          observations,
        },
      ];
    } else {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body.documents)) {
        inputs = body.documents;
      } else if (Array.isArray(body.prerequisites)) {
        inputs = body.prerequisites;
      } else if (Array.isArray(body)) {
        inputs = body;
      } else if (body && typeof body === 'object' && body.documentType) {
        inputs = [body];
      }
    }

    const service = getAgreementLegalService();
    const result = await service.uploadPrerequisites(id, inputs, actor);

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
    if (error instanceof AgreementLegalError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: { field: error.field, ...error.details },
          },
          timestamp: new Date().toISOString(),
        },
        { status: error.statusCode }
      );
    }

    console.error('[POST /api/v1/convenios/[id]/prerrequisitos] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error interno al cargar los prerrequisitos del convenio',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
