// ==============================================================================
// SIGETRAP - Servicio de Apertura y Configuración de Periodos Lectivos (HU05 / CU02)
// Módulo / Épica: Parametrización de Periodos Académicos
// Caso de Uso Asociado: CU02 - Parametrización y Elegibilidad Académica
// Entidades BD: periodos_academicos
// Restricciones SQL (Constraints):
//   - chk_fechas_periodo (fecha_fin > fecha_inicio)
//   - chk_fechas_convocatorias_periodo
//   - chk_fechas_informes_periodo
//   - uq_codigo_periodo (UNIQUE codigo)
// ==============================================================================

import {
  AcademicPeriodRepository,
  academicPeriodRepository,
} from '@/server/repositories/academic-period.repository';
import {
  AuthenticatedUser,
  CreateAcademicPeriodDTO,
  UpdateAcademicPeriodDTO,
  AcademicPeriodResponseDTO,
  AcademicPeriodFilterDTO,
  PeriodoAcademicoEstadoDomain,
  DOMAIN_ACADEMIC_PERIOD_STATUSES,
} from '@/types';

export class AcademicPeriodValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;
  public readonly constraint?: string;

  constructor(
    message: string,
    code: string = 'ACADEMIC_PERIOD_VALIDATION_ERROR',
    statusCode: number = 400,
    field?: string,
    constraint?: string
  ) {
    super(message);
    this.name = 'AcademicPeriodValidationError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    this.constraint = constraint;
  }
}

const PERIOD_STATUS_MAP: Record<string, PeriodoAcademicoEstadoDomain> = {
  abierto: 'Abierto',
  activo: 'Abierto',
  vigente: 'Abierto',
  open: 'Abierto',
  'en configuración': 'En Configuración',
  'en configuracion': 'En Configuración',
  en_configuracion: 'En Configuración',
  configuracion: 'En Configuración',
  borrador: 'En Configuración',
  cerrado: 'Cerrado',
  inactivo: 'Cerrado',
  finalizado: 'Cerrado',
  closed: 'Cerrado',
};

/**
 * Normaliza y valida el estado del periodo lectivo
 */
export function normalizeAcademicPeriodStatus(
  rawStatus?: string | null
): PeriodoAcademicoEstadoDomain {
  if (!rawStatus || typeof rawStatus !== 'string' || rawStatus.trim() === '') {
    return 'Abierto';
  }

  const normalized = PERIOD_STATUS_MAP[rawStatus.trim().toLowerCase()];
  if (!normalized) {
    throw new AcademicPeriodValidationError(
      `El estado del periodo ('${rawStatus}') no es válido. Valores permitidos: ${DOMAIN_ACADEMIC_PERIOD_STATUSES.join(', ')}.`,
      'INVALID_PERIOD_STATUS',
      400,
      'estado',
      'chk_estado_periodo'
    );
  }

  return normalized;
}

/**
 * Parsea una fecha desde string o Date y verifica que sea válida
 */
function parseStrictDate(
  rawDate: string | Date | undefined | null,
  fieldName: string,
  label: string
): Date {
  if (rawDate === undefined || rawDate === null || rawDate === '') {
    throw new AcademicPeriodValidationError(
      `La ${label} (${fieldName}) es obligatoria para aperturar o configurar el periodo lectivo.`,
      'MISSING_PERIOD_DATE',
      400,
      fieldName
    );
  }

  const parsed = rawDate instanceof Date ? new Date(rawDate.getTime()) : new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new AcademicPeriodValidationError(
      `El formato de la ${label} (${fieldName}) es inválido.`,
      'INVALID_DATE_FORMAT',
      400,
      fieldName
    );
  }

  return parsed;
}

/**
 * Parsea una fecha opcional (para ventanas de convocatorias o informes)
 */
function parseOptionalDate(
  rawDate: string | Date | undefined | null,
  fieldName: string,
  label: string
): Date | null | undefined {
  if (rawDate === undefined) return undefined;
  if (rawDate === null || rawDate === '') return null;

  const parsed = rawDate instanceof Date ? new Date(rawDate.getTime()) : new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new AcademicPeriodValidationError(
      `El formato de la ${label} (${fieldName}) es inválido.`,
      'INVALID_DATE_FORMAT',
      400,
      fieldName
    );
  }

  return parsed;
}

/**
 * Valida la restricción SQL chk_fechas_periodo (fecha_fin > fecha_inicio)
 * Criterio 1: Si fecha_inicio >= fecha_fin, falla por chk_fechas_periodo con 400 Bad Request
 * indicando explícitamente fecha_fin > fecha_inicio.
 */
export function validatePeriodCoherentDates(
  startDate: Date,
  endDate: Date,
  options?: {
    vacanciesStartDate?: Date | null;
    vacanciesEndDate?: Date | null;
    reportsStartDate?: Date | null;
    reportsEndDate?: Date | null;
  }
): void {
  if (endDate.getTime() <= startDate.getTime()) {
    throw new AcademicPeriodValidationError(
      'La validación de fechas del periodo falló por la restricción chk_fechas_periodo: la fecha de fin debe ser estrictamente posterior a la fecha de inicio (fecha_fin > fecha_inicio).',
      'CHK_FECHAS_PERIODO_VIOLATION',
      400,
      'fecha_fin',
      'chk_fechas_periodo'
    );
  }

  // Validar ventana de convocatorias si se suministran fechas
  if (options?.vacanciesStartDate && options?.vacanciesEndDate) {
    if (options.vacanciesEndDate.getTime() <= options.vacanciesStartDate.getTime()) {
      throw new AcademicPeriodValidationError(
        'Violación en ventana de convocatorias (chk_fechas_periodo): la fecha de fin de convocatorias debe ser posterior a la fecha de inicio de convocatorias (fecha_fin > fecha_inicio).',
        'CHK_FECHAS_PERIODO_VIOLATION',
        400,
        'fecha_fin_convocatorias',
        'chk_fechas_periodo'
      );
    }
  }

  if (options?.vacanciesStartDate && options.vacanciesStartDate.getTime() < startDate.getTime()) {
    throw new AcademicPeriodValidationError(
      'La fecha de inicio de convocatorias no puede ser anterior a la fecha de inicio del periodo lectivo (chk_fechas_periodo).',
      'CHK_FECHAS_PERIODO_VIOLATION',
      400,
      'fecha_inicio_convocatorias',
      'chk_fechas_periodo'
    );
  }

  if (options?.vacanciesEndDate && options.vacanciesEndDate.getTime() > endDate.getTime()) {
    throw new AcademicPeriodValidationError(
      'La fecha de fin de convocatorias no puede exceder la fecha de fin del periodo lectivo (chk_fechas_periodo).',
      'CHK_FECHAS_PERIODO_VIOLATION',
      400,
      'fecha_fin_convocatorias',
      'chk_fechas_periodo'
    );
  }

  // Validar ventana de informes si se suministran fechas
  if (options?.reportsStartDate && options?.reportsEndDate) {
    if (options.reportsEndDate.getTime() <= options.reportsStartDate.getTime()) {
      throw new AcademicPeriodValidationError(
        'Violación en ventana de informes (chk_fechas_periodo): la fecha de fin de informes debe ser posterior a la fecha de inicio de informes (fecha_fin > fecha_inicio).',
        'CHK_FECHAS_PERIODO_VIOLATION',
        400,
        'fecha_fin_informes',
        'chk_fechas_periodo'
      );
    }
  }

  if (options?.reportsStartDate && options.reportsStartDate.getTime() < startDate.getTime()) {
    throw new AcademicPeriodValidationError(
      'La fecha de inicio de informes no puede ser anterior a la fecha de inicio del periodo lectivo (chk_fechas_periodo).',
      'CHK_FECHAS_PERIODO_VIOLATION',
      400,
      'fecha_inicio_informes',
      'chk_fechas_periodo'
    );
  }

  if (options?.reportsEndDate && options.reportsEndDate.getTime() > endDate.getTime()) {
    throw new AcademicPeriodValidationError(
      'La fecha de fin de informes no puede exceder la fecha de fin del periodo lectivo (chk_fechas_periodo).',
      'CHK_FECHAS_PERIODO_VIOLATION',
      400,
      'fecha_fin_informes',
      'chk_fechas_periodo'
    );
  }
}

export class AcademicPeriodService {
  constructor(
    private periodRepo: AcademicPeriodRepository = academicPeriodRepository
  ) {}

  /**
   * Verifica que el actor tenga permisos de Coordinador (DIRECTOR_PROGRAMA) o ADMIN
   */
  private assertCoordinatorAccess(actor?: AuthenticatedUser | null): void {
    if (!actor) {
      throw new AcademicPeriodValidationError(
        'Debe iniciar sesión como coordinador para aperturar o configurar periodos lectivos.',
        'UNAUTHORIZED',
        401
      );
    }

    if (actor.role !== 'DIRECTOR_PROGRAMA' && actor.role !== 'ADMIN') {
      throw new AcademicPeriodValidationError(
        'No tiene permisos para aperturar o configurar periodos lectivos. Esta operación es exclusiva del Coordinador de Prácticas (DIRECTOR_PROGRAMA) o Administrador.',
        'FORBIDDEN_OPERATION',
        403
      );
    }
  }

  /**
   * Transforma una entidad de base de datos al DTO estandarizado de respuesta
   */
  private mapToResponseDTO(
    period: any,
    customMessage?: string
  ): AcademicPeriodResponseDTO {
    const startDate = new Date(period.startDate ?? period.fecha_inicio);
    const endDate = new Date(period.endDate ?? period.fecha_fin);
    const vacanciesStartDate =
      period.vacanciesStartDate ?? period.fecha_inicio_convocatorias
        ? new Date(period.vacanciesStartDate ?? period.fecha_inicio_convocatorias)
        : null;
    const vacanciesEndDate =
      period.vacanciesEndDate ?? period.fecha_fin_convocatorias
        ? new Date(period.vacanciesEndDate ?? period.fecha_fin_convocatorias)
        : null;
    const reportsStartDate =
      period.reportsStartDate ?? period.fecha_inicio_informes
        ? new Date(period.reportsStartDate ?? period.fecha_inicio_informes)
        : null;
    const reportsEndDate =
      period.reportsEndDate ?? period.fecha_fin_informes
        ? new Date(period.reportsEndDate ?? period.fecha_fin_informes)
        : null;

    const status = normalizeAcademicPeriodStatus(period.status ?? period.estado);
    const isActive = Boolean(period.isActive ?? period.activo ?? true);
    const now = new Date();
    const isCurrentlyValid =
      isActive &&
      status === 'Abierto' &&
      now.getTime() >= startDate.getTime() &&
      now.getTime() <= endDate.getTime();

    const code = String(period.code ?? period.codigo);
    const name = String(period.name ?? period.nombre);
    const description = period.description ?? period.descripcion ?? null;
    const createdById = period.createdById ?? period.creado_por_id ?? null;

    return {
      id: period.id,
      codigo: code,
      code,
      nombre: name,
      name,
      descripcion: description,
      description,
      fecha_inicio: startDate,
      fechaInicio: startDate,
      startDate,
      fecha_fin: endDate,
      fechaFin: endDate,
      endDate,
      fecha_inicio_convocatorias: vacanciesStartDate,
      fechaInicioConvocatorias: vacanciesStartDate,
      vacanciesStartDate,
      fecha_fin_convocatorias: vacanciesEndDate,
      fechaFinConvocatorias: vacanciesEndDate,
      vacanciesEndDate,
      fecha_inicio_informes: reportsStartDate,
      fechaInicioInformes: reportsStartDate,
      reportsStartDate,
      fecha_fin_informes: reportsEndDate,
      fechaFinInformes: reportsEndDate,
      reportsEndDate,
      estado: status,
      status,
      activo: isActive,
      isActive,
      enVigencia: isCurrentlyValid,
      isCurrentlyValid,
      creadoPorId: createdById,
      createdById,
      createdBy: period.createdBy ?? null,
      createdAt: period.createdAt ? new Date(period.createdAt) : new Date(),
      updatedAt: period.updatedAt ? new Date(period.updatedAt) : new Date(),
      ...(customMessage ? { message: customMessage } : {}),
    };
  }

  /**
   * Intercepta errores de restricciones SQL de PostgreSQL / Prisma (23514 chk_fechas_periodo, 23505 uq_codigo_periodo)
   */
  private handleDatabaseError(error: unknown, fallbackCode?: string): never {
    if (error instanceof AcademicPeriodValidationError) {
      throw error;
    }

    const err = error as any;
    const errCode = err?.code || err?.meta?.code || '';
    const errMessage = String(err?.message || '');
    const errConstraint = String(err?.constraint || err?.meta?.constraint || '');

    // Intercepción de restricción CHECK chk_fechas_periodo (PostgreSQL 23514)
    if (
      errCode === '23514' ||
      errConstraint.includes('chk_fechas_periodo') ||
      errMessage.includes('chk_fechas_periodo') ||
      errMessage.includes('chk_fechas_convocatorias_periodo') ||
      errMessage.includes('chk_fechas_informes_periodo')
    ) {
      throw new AcademicPeriodValidationError(
        'La validación falló por la restricción chk_fechas_periodo: la fecha de fin debe ser estrictamente posterior a la fecha de inicio (fecha_fin > fecha_inicio).',
        'CHK_FECHAS_PERIODO_VIOLATION',
        400,
        'fecha_fin',
        'chk_fechas_periodo'
      );
    }

    // Intercepción de restricción UNIQUE uq_codigo_periodo (PostgreSQL 23505 / Prisma P2002)
    if (
      errCode === '23505' ||
      errCode === 'P2002' ||
      errConstraint.includes('uq_codigo_periodo') ||
      errMessage.includes('uq_codigo_periodo') ||
      errMessage.toLowerCase().includes('unique constraint')
    ) {
      throw new AcademicPeriodValidationError(
        `Ya existe un periodo académico registrado con el código '${fallbackCode || ''}' (restricción uq_codigo_periodo).`,
        'PERIOD_CODE_ALREADY_EXISTS',
        409,
        'codigo',
        'uq_codigo_periodo'
      );
    }

    throw error;
  }

  /**
   * Apertura y configura un nuevo periodo lectivo (HU05)
   */
  async openAndConfigurePeriod(
    dto: CreateAcademicPeriodDTO,
    actor?: AuthenticatedUser | null
  ): Promise<AcademicPeriodResponseDTO> {
    this.assertCoordinatorAccess(actor);

    const rawCode = (dto.codigo ?? dto.code ?? dto.periodo ?? '').trim();
    if (!rawCode || rawCode.length < 3) {
      throw new AcademicPeriodValidationError(
        'El código del periodo lectivo (ej. 2026-1) es obligatorio y debe tener al menos 3 caracteres.',
        'MISSING_PERIOD_CODE',
        400,
        'codigo'
      );
    }

    const rawName = (dto.nombre ?? dto.name ?? `Periodo Académico ${rawCode}`).trim();
    if (!rawName || rawName.length < 3) {
      throw new AcademicPeriodValidationError(
        'El nombre descriptivo del periodo lectivo es obligatorio.',
        'MISSING_PERIOD_NAME',
        400,
        'nombre'
      );
    }

    const rawDescription = dto.descripcion ?? dto.description ?? null;

    // Extraer y parsear fechas de inicio y fin del periodo lectivo
    const rawStartDate = dto.fecha_inicio ?? dto.fechaInicio ?? dto.startDate;
    const rawEndDate = dto.fecha_fin ?? dto.fechaFin ?? dto.endDate;

    const startDate = parseStrictDate(rawStartDate, 'fecha_inicio', 'fecha de inicio del periodo');
    const endDate = parseStrictDate(rawEndDate, 'fecha_fin', 'fecha de fin del periodo');

    // Fechas opcionales de enmarcado temporal de convocatorias e informes
    const vacanciesStartDate = parseOptionalDate(
      dto.fecha_inicio_convocatorias ?? dto.fechaInicioConvocatorias ?? dto.vacanciesStartDate,
      'fecha_inicio_convocatorias',
      'fecha de inicio de convocatorias'
    );
    const vacanciesEndDate = parseOptionalDate(
      dto.fecha_fin_convocatorias ?? dto.fechaFinConvocatorias ?? dto.vacanciesEndDate,
      'fecha_fin_convocatorias',
      'fecha de fin de convocatorias'
    );
    const reportsStartDate = parseOptionalDate(
      dto.fecha_inicio_informes ?? dto.fechaInicioInformes ?? dto.reportsStartDate,
      'fecha_inicio_informes',
      'fecha de inicio de informes'
    );
    const reportsEndDate = parseOptionalDate(
      dto.fecha_fin_informes ?? dto.fechaFinInformes ?? dto.reportsEndDate,
      'fecha_fin_informes',
      'fecha de fin de informes'
    );

    // Criterio 1: Validar coherencia estricta de fechas (chk_fechas_periodo: fecha_fin > fecha_inicio)
    validatePeriodCoherentDates(startDate, endDate, {
      vacanciesStartDate: vacanciesStartDate ?? null,
      vacanciesEndDate: vacanciesEndDate ?? null,
      reportsStartDate: reportsStartDate ?? null,
      reportsEndDate: reportsEndDate ?? null,
    });

    const status = normalizeAcademicPeriodStatus(dto.estado ?? dto.status ?? 'Abierto');
    const isActive =
      dto.activo !== undefined
        ? Boolean(dto.activo)
        : dto.isActive !== undefined
          ? Boolean(dto.isActive)
          : status === 'Abierto';

    // Verificar si ya existe un periodo con el mismo código
    const existing = await this.periodRepo.findByCode(rawCode);
    if (existing) {
      throw new AcademicPeriodValidationError(
        `Ya existe un periodo lectivo configurado con el código '${rawCode}' (restricción uq_codigo_periodo).`,
        'PERIOD_CODE_ALREADY_EXISTS',
        409,
        'codigo',
        'uq_codigo_periodo'
      );
    }

    try {
      const created = await this.periodRepo.create({
        code: rawCode,
        name: rawName,
        description: rawDescription,
        startDate,
        endDate,
        vacanciesStartDate: vacanciesStartDate ?? startDate,
        vacanciesEndDate: vacanciesEndDate ?? endDate,
        reportsStartDate: reportsStartDate ?? startDate,
        reportsEndDate: reportsEndDate ?? endDate,
        status,
        isActive,
        createdById: actor?.id ?? null,
      });

      // Si el nuevo periodo se marca como activo y abierto, desactivar periodos anteriores
      if (isActive && status === 'Abierto') {
        await this.periodRepo.deactivateOtherPeriods(created.id);
      }

      return this.mapToResponseDTO(
        created,
        `Periodo lectivo ${rawCode} aperturado y configurado exitosamente.`
      );
    } catch (error) {
      this.handleDatabaseError(error, rawCode);
    }
  }

  /**
   * Actualiza la configuración (fechas de vigencia, ventanas o estado) de un periodo lectivo existente
   */
  async updatePeriodConfiguration(
    id: string,
    dto: UpdateAcademicPeriodDTO,
    actor?: AuthenticatedUser | null
  ): Promise<AcademicPeriodResponseDTO> {
    this.assertCoordinatorAccess(actor);

    const existing = await this.periodRepo.findById(id);
    if (!existing) {
      throw new AcademicPeriodValidationError(
        'El periodo académico especificado no existe en el sistema.',
        'PERIOD_NOT_FOUND',
        404,
        'id'
      );
    }

    const rawCode = dto.codigo ?? dto.code;
    const code = rawCode !== undefined ? rawCode.trim() : existing.code;
    if (!code || code.length < 3) {
      throw new AcademicPeriodValidationError(
        'El código del periodo lectivo debe tener al menos 3 caracteres.',
        'INVALID_PERIOD_CODE',
        400,
        'codigo'
      );
    }

    if (code.toLowerCase() !== existing.code.toLowerCase()) {
      const duplicate = await this.periodRepo.findByCode(code);
      if (duplicate && duplicate.id !== existing.id) {
        throw new AcademicPeriodValidationError(
          `Ya existe otro periodo lectivo con el código '${code}' (restricción uq_codigo_periodo).`,
          'PERIOD_CODE_ALREADY_EXISTS',
          409,
          'codigo',
          'uq_codigo_periodo'
        );
      }
    }

    const rawName = dto.nombre ?? dto.name;
    const name = rawName !== undefined ? rawName.trim() : existing.name;
    if (!name || name.length < 3) {
      throw new AcademicPeriodValidationError(
        'El nombre del periodo lectivo debe tener al menos 3 caracteres.',
        'INVALID_PERIOD_NAME',
        400,
        'nombre'
      );
    }

    const description =
      dto.descripcion !== undefined
        ? dto.descripcion
        : dto.description !== undefined
          ? dto.description
          : existing.description;

    const rawStartDate = dto.fecha_inicio ?? dto.fechaInicio ?? dto.startDate;
    const rawEndDate = dto.fecha_fin ?? dto.fechaFin ?? dto.endDate;

    const startDate =
      rawStartDate !== undefined
        ? parseStrictDate(rawStartDate, 'fecha_inicio', 'fecha de inicio del periodo')
        : new Date(existing.startDate);

    const endDate =
      rawEndDate !== undefined
        ? parseStrictDate(rawEndDate, 'fecha_fin', 'fecha de fin del periodo')
        : new Date(existing.endDate);

    const parsedVacStart = parseOptionalDate(
      dto.fecha_inicio_convocatorias ?? dto.fechaInicioConvocatorias ?? dto.vacanciesStartDate,
      'fecha_inicio_convocatorias',
      'fecha de inicio de convocatorias'
    );
    const parsedVacEnd = parseOptionalDate(
      dto.fecha_fin_convocatorias ?? dto.fechaFinConvocatorias ?? dto.vacanciesEndDate,
      'fecha_fin_convocatorias',
      'fecha de fin de convocatorias'
    );
    const parsedRepStart = parseOptionalDate(
      dto.fecha_inicio_informes ?? dto.fechaInicioInformes ?? dto.reportsStartDate,
      'fecha_inicio_informes',
      'fecha de inicio de informes'
    );
    const parsedRepEnd = parseOptionalDate(
      dto.fecha_fin_informes ?? dto.fechaFinInformes ?? dto.reportsEndDate,
      'fecha_fin_informes',
      'fecha de fin de informes'
    );

    const vacanciesStartDate =
      parsedVacStart !== undefined
        ? parsedVacStart
        : rawStartDate !== undefined
          ? startDate
          : existing.vacanciesStartDate
            ? new Date(existing.vacanciesStartDate)
            : null;
    const vacanciesEndDate =
      parsedVacEnd !== undefined
        ? parsedVacEnd
        : rawEndDate !== undefined
          ? endDate
          : existing.vacanciesEndDate
            ? new Date(existing.vacanciesEndDate)
            : null;
    const reportsStartDate =
      parsedRepStart !== undefined
        ? parsedRepStart
        : rawStartDate !== undefined
          ? startDate
          : existing.reportsStartDate
            ? new Date(existing.reportsStartDate)
            : null;
    const reportsEndDate =
      parsedRepEnd !== undefined
        ? parsedRepEnd
        : rawEndDate !== undefined
          ? endDate
          : existing.reportsEndDate
            ? new Date(existing.reportsEndDate)
            : null;

    // Criterio 1: Validar chk_fechas_periodo (fecha_fin > fecha_inicio)
    validatePeriodCoherentDates(startDate, endDate, {
      vacanciesStartDate,
      vacanciesEndDate,
      reportsStartDate,
      reportsEndDate,
    });

    const rawStatus = dto.estado ?? dto.status;
    const status =
      rawStatus !== undefined
        ? normalizeAcademicPeriodStatus(rawStatus)
        : normalizeAcademicPeriodStatus(existing.status);

    let isActive =
      dto.activo !== undefined
        ? Boolean(dto.activo)
        : dto.isActive !== undefined
          ? Boolean(dto.isActive)
          : existing.isActive;

    if (status === 'Cerrado' && dto.activo === undefined && dto.isActive === undefined) {
      isActive = false;
    }

    try {
      const updated = await this.periodRepo.update(id, {
        code,
        name,
        description,
        startDate,
        endDate,
        vacanciesStartDate,
        vacanciesEndDate,
        reportsStartDate,
        reportsEndDate,
        status,
        isActive,
      });

      if (isActive && status === 'Abierto') {
        await this.periodRepo.deactivateOtherPeriods(updated.id);
      }

      return this.mapToResponseDTO(
        updated,
        `Configuración del periodo lectivo ${code} actualizada exitosamente.`
      );
    } catch (error) {
      this.handleDatabaseError(error, code);
    }
  }

  /**
   * Obtiene un periodo lectivo por ID o código
   */
  async getPeriodByIdOrCode(idOrCode: string): Promise<AcademicPeriodResponseDTO> {
    const byId = await this.periodRepo.findById(idOrCode);
    if (byId) {
      return this.mapToResponseDTO(byId);
    }

    const byCode = await this.periodRepo.findByCode(idOrCode);
    if (byCode) {
      return this.mapToResponseDTO(byCode);
    }

    throw new AcademicPeriodValidationError(
      `No se encontró el periodo académico '${idOrCode}'.`,
      'PERIOD_NOT_FOUND',
      404
    );
  }

  /**
   * Obtiene el periodo lectivo actualmente activo/vigente
   */
  async getActivePeriod(): Promise<AcademicPeriodResponseDTO | null> {
    const active = await this.periodRepo.findActivePeriod();
    if (!active) return null;
    return this.mapToResponseDTO(active);
  }

  /**
   * Lista los periodos lectivos registrados con soporte para filtros y paginación
   */
  async listPeriods(filters: AcademicPeriodFilterDTO = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const rawStatus = filters.estado ?? filters.status;
    const status = rawStatus ? normalizeAcademicPeriodStatus(rawStatus) : undefined;
    const isActive =
      filters.activo !== undefined
        ? filters.activo
        : filters.isActive !== undefined
          ? filters.isActive
          : filters.onlyVigente
            ? true
            : undefined;

    const { periods, total } = await this.periodRepo.findMany({
      search: filters.search,
      status: filters.onlyVigente ? 'Abierto' : status,
      isActive,
      skip,
      take: limit,
    });

    const items = periods.map((p) => this.mapToResponseDTO(p));
    const activePeriod = items.find((p) => p.activo && p.estado === 'Abierto') || null;

    return {
      items,
      periods: items,
      activePeriod,
      periodoVigente: activePeriod,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Verifica si una fecha dada (para convocatoria o informe) se encuentra enmarcada
   * dentro de la vigencia estricta del periodo lectivo especificado.
   */
  async verifyTemporalFraming(
    periodCodeOrId: string,
    eventType: 'CONVOCATORIA' | 'INFORME',
    targetDate: Date = new Date()
  ): Promise<{
    isValid: boolean;
    period: AcademicPeriodResponseDTO;
    windowStart: Date;
    windowEnd: Date;
    reason?: string;
  }> {
    const period = await this.getPeriodByIdOrCode(periodCodeOrId);

    if (!period.isActive || period.status !== 'Abierto') {
      return {
        isValid: false,
        period,
        windowStart: period.startDate,
        windowEnd: period.endDate,
        reason: `El periodo académico ${period.code} no se encuentra abierto o activo (estado actual: ${period.status}).`,
      };
    }

    const windowStart =
      eventType === 'CONVOCATORIA'
        ? period.vacanciesStartDate ?? period.startDate
        : period.reportsStartDate ?? period.startDate;

    const windowEnd =
      eventType === 'CONVOCATORIA'
        ? period.vacanciesEndDate ?? period.endDate
        : period.reportsEndDate ?? period.endDate;

    const ts = targetDate.getTime();
    if (ts < windowStart.getTime() || ts > windowEnd.getTime()) {
      const label = eventType === 'CONVOCATORIA' ? 'convocatorias' : 'informes';
      return {
        isValid: false,
        period,
        windowStart,
        windowEnd,
        reason: `La fecha se encuentra fuera del rango de vigencia configurado para ${label} en el periodo ${period.code} (${windowStart.toISOString().split('T')[0]} a ${windowEnd.toISOString().split('T')[0]}).`,
      };
    }

    return {
      isValid: true,
      period,
      windowStart,
      windowEnd,
    };
  }
}

let academicPeriodServiceInstance: AcademicPeriodService = new AcademicPeriodService();

export function getAcademicPeriodService(): AcademicPeriodService {
  return academicPeriodServiceInstance;
}

export function setAcademicPeriodServiceInstance(service: AcademicPeriodService): void {
  academicPeriodServiceInstance = service;
}

export const academicPeriodService = academicPeriodServiceInstance;
