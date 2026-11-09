// ==============================================================================
// SIGETRAP - Repositorio de Informes de Avance y Bitácoras de Seguimiento (CU14)
// Módulo / Épica: Seguimiento y Control de Prácticas
// Entidades BD: informes_avance, practicas_formativas, bitacoras_seguimiento, archivos_adjuntos
// Restricciones SQL: chk_horas_ejecutadas_positivas, chk_estado_informe, fk_informe_practica
// ==============================================================================

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface CreateAdvanceReportParams {
  practicaId: string;
  estudianteId: string;
  horasEjecutadas: number;
  descripcionActividades: string;
  tipo?: string;
  estado?: string;
  periodoInicio?: Date | null;
  periodoFin?: Date | null;
  fechaEntrega?: Date;
  observaciones?: string | null;
  archivos?: Array<{
    nombreArchivo: string;
    urlArchivo: string;
    tipoMime?: string;
    tamanoBytes?: number;
  }>;
}

export class AdvanceReportRepository {
  /**
   * Crea un informe de avance y su respectiva bitácora de seguimiento de manera atómica
   */
  async createAdvanceReportWithLog(params: CreateAdvanceReportParams) {
    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Crear informe en tabla informes_avance
        const report = await tx.advanceReport.create({
          data: {
            practicaId: params.practicaId,
            estudianteId: params.estudianteId,
            tipo: params.tipo || 'SEGUIMIENTO',
            estado: params.estado || 'Radicado',
            horasEjecutadas: params.horasEjecutadas,
            descripcionActividades: params.descripcionActividades,
            periodoInicio: params.periodoInicio || null,
            periodoFin: params.periodoFin || null,
            fechaEntrega: params.fechaEntrega || new Date(),
            observaciones: params.observaciones || null,
          },
        });

        // 2. Crear bitácora en tabla bitacoras_seguimiento
        const log = await tx.followUpLog.create({
          data: {
            informeId: report.id,
            practicaId: params.practicaId,
            estudianteId: params.estudianteId,
            fechaActividad: params.fechaEntrega || new Date(),
            descripcionActividades: params.descripcionActividades,
            horasEjecutadas: params.horasEjecutadas,
            observaciones: params.observaciones || null,
          },
        });

        // 3. Crear archivos adjuntos si existen
        if (params.archivos && params.archivos.length > 0) {
          for (const file of params.archivos) {
            await tx.attachment.create({
              data: {
                entidadTipo: 'INFORME_AVANCE',
                entidadId: report.id,
                nombreArchivo: file.nombreArchivo,
                urlArchivo: file.urlArchivo,
                tipoMime: file.tipoMime || 'application/pdf',
                tamanoBytes: file.tamanoBytes ? BigInt(file.tamanoBytes) : null,
                subidoPorId: params.estudianteId,
              },
            });
          }
        }

        // 4. Actualizar total de horas acumuladas en la práctica
        const updatedPractice = await tx.practice.update({
          where: { id: params.practicaId },
          data: {
            totalHoursCompleted: {
              increment: params.horasEjecutadas,
            },
            updatedAt: new Date(),
          },
        });

        return {
          report,
          log,
          updatedPractice,
        };
      });
    } catch (error: any) {
      this.handleDatabaseConstraintError(error);
      throw error;
    }
  }

  /**
   * Obtiene un informe de avance por su ID con relaciones
   */
  async findById(id: string) {
    return prisma.advanceReport.findUnique({
      where: { id },
      include: {
        practice: {
          select: {
            id: true,
            currentStatus: true,
            totalHoursRequired: true,
            totalHoursCompleted: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentCode: true,
          },
        },
        revisadoPor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        bitacoras: true,
      },
    });
  }

  /**
   * Obtiene todos los informes de una práctica formativa
   */
  async findByPracticeId(practicaId: string) {
    return prisma.advanceReport.findMany({
      where: {
        practicaId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        bitacoras: true,
      },
    });
  }

  /**
   * Obtiene todas las bitácoras de una práctica
   */
  async findLogsByPracticeId(practicaId: string) {
    return prisma.followUpLog.findMany({
      where: {
        practicaId,
        deletedAt: null,
      },
      orderBy: { fechaActividad: 'desc' },
    });
  }

  /**
   * Mapea y traduce errores de restricciones de base de datos PostgreSQL
   */
  private handleDatabaseConstraintError(error: any) {
    if (error?.code === 'P2002') {
      // Unique constraint
      const customErr: any = new Error('Violación de unicidad en informe de avance');
      customErr.code = '23505';
      throw customErr;
    }

    if (error?.code === 'P2003') {
      // Foreign key constraint (fk_informe_practica)
      const customErr: any = new Error(
        'Violación de llave foránea fk_informe_practica: La práctica formativa especificada no existe.'
      );
      customErr.code = '23503';
      customErr.constraint = 'fk_informe_practica';
      throw customErr;
    }

    if (
      error?.message?.includes('chk_horas_ejecutadas_positivas') ||
      error?.message?.includes('violates check constraint "chk_horas_ejecutadas_positivas"')
    ) {
      const customErr: any = new Error(
        'Violación de restricción chk_horas_ejecutadas_positivas: Las horas reportadas deben ser mayores a cero.'
      );
      customErr.code = '23514';
      customErr.constraint = 'chk_horas_ejecutadas_positivas';
      throw customErr;
    }

    if (
      error?.message?.includes('chk_estado_informe') ||
      error?.message?.includes('violates check constraint "chk_estado_informe"')
    ) {
      const customErr: any = new Error(
        'Violación de restricción chk_estado_informe: El estado del informe no es válido.'
      );
      customErr.code = '23514';
      customErr.constraint = 'chk_estado_informe';
      throw customErr;
    }
  }
}

export const advanceReportRepository = new AdvanceReportRepository();
