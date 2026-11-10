export const dynamic = 'force-dynamic';

// ==============================================================================
// SIGETRAP - Controlador de Evaluaciones y Prerrequisitos de Práctica
// Endpoints:
//   - GET  /api/v1/practicas/[id]/evaluaciones
//   - POST / PATCH /api/v1/practicas/[id]/evaluaciones
// Permite registrar/actualizar Evaluación Empresarial (50%), Evaluación Docente (30%),
// Horas Ejecutadas (20%) y Aprobación Dual del Plan de Trabajo para habilitar la liquidación.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ApiResponse } from '@/types';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const params = await Promise.resolve(context.params);
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const evaluations = await prisma.evaluation.findMany({
      where: { practiceId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      {
        success: true,
        data: evaluations,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[GET_EVALUACIONES_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al consultar las evaluaciones' },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const params = await Promise.resolve(context.params);
    const actor = getAuthenticatedUser(req);
    if (!actor) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    if (actor.role === 'ESTUDIANTE') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Los estudiantes no pueden registrar calificaciones oficiales' },
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const practice = await prisma.practice.findUnique({
      where: { id: params.id },
      include: {
        evaluations: true,
        workPlan: true,
      },
    });

    if (!practice) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Práctica empresarial no encontrada' },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    if (practice.currentStatus === 'FINALIZADA' || practice.currentStatus === 'CERRADA') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'ALREADY_LIQUIDATED', message: 'La práctica ya fue liquidada y sus calificaciones son inmutables' },
          timestamp: new Date().toISOString(),
        },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // 1. Evaluación del Tutor Empresarial (50%)
    if (body.tutorScore !== undefined && body.tutorScore !== null && body.tutorScore !== '') {
      const score = Number(body.tutorScore);
      if (isNaN(score) || score < 0 || score > 5.0) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'INVALID_SCORE', message: 'La calificación del tutor debe estar entre 0.0 y 5.0' },
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }

      const existingTutorEval = (practice.evaluations || []).find(
        (e: any) => e.type === 'FINAL_TUTOR'
      );
      const evaluatorId = practice.tutorId || actor.id;

      if (existingTutorEval) {
        await prisma.evaluation.update({
          where: { id: existingTutorEval.id },
          data: {
            quantitativeScore: Number(score.toFixed(2)),
            qualitativeComments:
              body.tutorComments !== undefined
                ? String(body.tutorComments).trim()
                : existingTutorEval.qualitativeComments,
            evaluatorId,
          },
        });
      } else {
        await prisma.evaluation.create({
          data: {
            practiceId: practice.id,
            evaluatorId,
            type: 'FINAL_TUTOR',
            criteriaScores: { desempenoTecnico: score, cumplimiento: score, trabajoEquipo: score },
            quantitativeScore: Number(score.toFixed(2)),
            qualitativeComments:
              body.tutorComments
                ? String(body.tutorComments).trim()
                : 'Desempeño sobresaliente en las actividades técnicas y empresariales asignadas.',
          },
        });
      }
    }

    // 2. Evaluación del Docente Supervisor (30%)
    if (body.teacherScore !== undefined && body.teacherScore !== null && body.teacherScore !== '') {
      const score = Number(body.teacherScore);
      if (isNaN(score) || score < 0 || score > 5.0) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'INVALID_SCORE', message: 'La calificación del docente debe estar entre 0.0 y 5.0' },
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }

      const existingTeacherEval = (practice.evaluations || []).find(
        (e: any) => e.type === 'FINAL_DOCENTE'
      );
      const evaluatorId = practice.teacherId || actor.id;

      if (existingTeacherEval) {
        await prisma.evaluation.update({
          where: { id: existingTeacherEval.id },
          data: {
            quantitativeScore: Number(score.toFixed(2)),
            qualitativeComments:
              body.teacherComments !== undefined
                ? String(body.teacherComments).trim()
                : existingTeacherEval.qualitativeComments,
            evaluatorId,
          },
        });
      } else {
        await prisma.evaluation.create({
          data: {
            practiceId: practice.id,
            evaluatorId,
            type: 'FINAL_DOCENTE',
            criteriaScores: { sustentacion: score, informeFinal: score, rigorMetodologico: score },
            quantitativeScore: Number(score.toFixed(2)),
            qualitativeComments:
              body.teacherComments
                ? String(body.teacherComments).trim()
                : 'Cumplimiento satisfactorio de objetivos académicos y sustentación final.',
          },
        });
      }
    }

    // 3. Horas ejecutadas y estado de práctica
    if (body.completedHours !== undefined && body.completedHours !== null && body.completedHours !== '') {
      const hours = Number(body.completedHours);
      if (!isNaN(hours) && hours >= 0) {
        await prisma.practice.update({
          where: { id: practice.id },
          data: {
            totalHoursCompleted: Math.round(hours),
          },
        });
      }
    }

    // 4. Aprobación Dual del Plan de Trabajo
    if (body.approveWorkPlan) {
      if (practice.workPlan) {
        await prisma.workPlan.update({
          where: { id: practice.workPlan.id },
          data: {
            status: 'APROBADO_DUAL',
            tutorApproved: true,
            tutorApprovedAt: new Date(),
            teacherApproved: true,
            teacherApprovedAt: new Date(),
          },
        });
      } else {
        await prisma.workPlan.create({
          data: {
            practiceId: practice.id,
            objectives:
              'Ejecutar las actividades de ingeniería de software y aseguramiento de calidad acordadas con la empresa receptora.',
            methodology:
              'Metodología ágil con entregas incrementales, revisiones quincenales y seguimiento docente.',
            schedule: [
              { fase: 1, actividad: 'Inducción y levantamiento de requerimientos', semanas: '1-4' },
              { fase: 2, actividad: 'Desarrollo e implementación de módulos', semanas: '5-12' },
              { fase: 3, actividad: 'Pruebas integrales, documentación y entrega final', semanas: '13-16' },
            ],
            status: 'APROBADO_DUAL',
            tutorApproved: true,
            tutorApprovedAt: new Date(),
            teacherApproved: true,
            teacherApprovedAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Evaluaciones y prerrequisitos de cierre actualizados exitosamente',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[POST_EVALUACIONES_ERROR]:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error al registrar las evaluaciones de la práctica' },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  return POST(req, context);
}
