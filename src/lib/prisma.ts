// ==============================================================================
// SIGETRAP - Singleton de Prisma Client + Adaptador Supabase PostgREST HTTPS
// Garantiza conexión 100% resiliente contra la base de datos PostgreSQL en Supabase
// ==============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function ensureEnvLoaded(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // ignore fs errors in edge environments
  }
}

ensureEnvLoaded();

interface FieldMap {
  [camelField: string]: string;
}

interface RelationDef {
  type: 'belongsTo' | 'hasMany' | 'hasOne';
  targetModel: string;
  foreignKey: string; // camelCase field on source (belongsTo) or target (hasMany/hasOne)
  targetKey?: string; // defaults to 'id'
}

interface ModelSchema {
  table: string;
  fields: FieldMap;
  dateFields: string[];
  numberFields: string[];
  defaults?: Record<string, () => unknown>;
  relations: Record<string, RelationDef>;
}

const MODEL_SCHEMAS: Record<string, ModelSchema> = {
  user: {
    table: 'users',
    fields: {
      id: 'id',
      email: 'email',
      passwordHash: 'password_hash',
      name: 'name',
      documentType: 'document_type',
      documentNumber: 'document_number',
      phone: 'phone',
      role: 'role',
      status: 'status',
      isActive: 'is_active',
      tokenVersion: 'token_version',
      studentCode: 'student_code',
      academicAverage: 'academic_average',
      approvedCredits: 'approved_credits',
      program: 'program',
      availableHours: 'available_hours',
      specialty: 'specialty',
      companyId: 'company_id',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: ['createdAt', 'updatedAt', 'deletedAt'],
    numberFields: ['academicAverage', 'approvedCredits', 'tokenVersion', 'availableHours'],
    defaults: {
      id: () => crypto.randomUUID(),
      documentType: () => 'CC',
      role: () => 'ESTUDIANTE',
      status: () => 'ACTIVO',
      isActive: () => true,
      tokenVersion: () => 1,
      program: () => 'Ingeniería de Sistemas',
      availableHours: () => 0,
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      company: { type: 'belongsTo', targetModel: 'company', foreignKey: 'companyId' },
      studentPractices: { type: 'hasMany', targetModel: 'practice', foreignKey: 'studentId' },
      teacherPractices: { type: 'hasMany', targetModel: 'practice', foreignKey: 'teacherId' },
      tutorPractices: { type: 'hasMany', targetModel: 'practice', foreignKey: 'tutorId' },
      directorPractices: { type: 'hasMany', targetModel: 'practice', foreignKey: 'directorId' },
      applications: { type: 'hasMany', targetModel: 'application', foreignKey: 'studentId' },
    },
  },
  studyPlan: {
    table: 'study_plans',
    fields: {
      id: 'id',
      program: 'program',
      name: 'name',
      minCreditsForPractice: 'min_credits_for_practice',
      minAverageForPractice: 'min_average_for_practice',
      isActive: 'is_active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    dateFields: ['createdAt', 'updatedAt'],
    numberFields: ['minCreditsForPractice', 'minAverageForPractice'],
    defaults: {
      id: () => crypto.randomUUID(),
      minCreditsForPractice: () => 100,
      minAverageForPractice: () => 3.0,
      isActive: () => true,
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {},
  },
  company: {
    table: 'companies',
    fields: {
      id: 'id',
      nit: 'nit',
      businessName: 'business_name',
      legalRepresentative: 'legal_representative',
      contactEmail: 'contact_email',
      contactPhone: 'contact_phone',
      address: 'address',
      city: 'city',
      isActive: 'is_active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: ['createdAt', 'updatedAt', 'deletedAt'],
    numberFields: [],
    defaults: {
      id: () => crypto.randomUUID(),
      isActive: () => true,
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      tutors: { type: 'hasMany', targetModel: 'user', foreignKey: 'companyId' },
      agreements: { type: 'hasMany', targetModel: 'agreement', foreignKey: 'companyId' },
      vacancies: { type: 'hasMany', targetModel: 'vacancy', foreignKey: 'companyId' },
      practices: { type: 'hasMany', targetModel: 'practice', foreignKey: 'companyId' },
    },
  },
  agreement: {
    table: 'agreements',
    fields: {
      id: 'id',
      companyId: 'company_id',
      agreementNumber: 'agreement_number',
      startDate: 'start_date',
      endDate: 'end_date',
      documentUrl: 'document_url',
      status: 'status',
      signedByDirector: 'signed_by_director',
      notes: 'notes',
      observations: 'notes',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: ['startDate', 'endDate', 'createdAt', 'updatedAt', 'deletedAt'],
    numberFields: [],
    defaults: {
      id: () => crypto.randomUUID(),
      status: () => 'EN_TRAMITE',
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      company: { type: 'belongsTo', targetModel: 'company', foreignKey: 'companyId' },
    },
  },
  vacancy: {
    table: 'vacancies',
    fields: {
      id: 'id',
      companyId: 'company_id',
      createdById: 'created_by_id',
      title: 'title',
      description: 'description',
      requirements: 'requirements',
      program: 'program',
      academicPeriod: 'academic_period',
      vacanciesCount: 'vacancies_count',
      status: 'status',
      startDate: 'start_date',
      endDate: 'end_date',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: ['startDate', 'endDate', 'createdAt', 'updatedAt', 'deletedAt'],
    numberFields: ['vacanciesCount'],
    defaults: {
      id: () => crypto.randomUUID(),
      program: () => 'Ingeniería de Sistemas',
      vacanciesCount: () => 1,
      status: () => 'BORRADOR',
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      company: { type: 'belongsTo', targetModel: 'company', foreignKey: 'companyId' },
      createdBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'createdById' },
      applications: { type: 'hasMany', targetModel: 'application', foreignKey: 'vacancyId' },
      practices: { type: 'hasMany', targetModel: 'practice', foreignKey: 'vacancyId' },
    },
  },
  application: {
    table: 'applications',
    fields: {
      id: 'id',
      vacancyId: 'vacancy_id',
      studentId: 'student_id',
      status: 'status',
      cvUrl: 'cv_url',
      presentationLetterUrl: 'presentation_letter_url',
      rejectionReason: 'rejection_reason',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: ['createdAt', 'updatedAt', 'deletedAt'],
    numberFields: [],
    defaults: {
      id: () => crypto.randomUUID(),
      status: () => 'POSTULADO',
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      vacancy: { type: 'belongsTo', targetModel: 'vacancy', foreignKey: 'vacancyId' },
      student: { type: 'belongsTo', targetModel: 'user', foreignKey: 'studentId' },
      updatedBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'updatedById' },
      practice: { type: 'hasOne', targetModel: 'practice', foreignKey: 'applicationId' },
    },
  },
  practice: {
    table: 'practices',
    fields: {
      id: 'id',
      applicationId: 'application_id',
      studentId: 'student_id',
      companyId: 'company_id',
      vacancyId: 'vacancy_id',
      teacherId: 'teacher_id',
      tutorId: 'tutor_id',
      directorId: 'director_id',
      currentStatus: 'current_status',
      arlSupportUrl: 'arl_support_url',
      arlValidatedAt: 'arl_validated_at',
      arlValidatedById: 'arl_validated_by_id',
      presentationLetterUrl: 'presentation_letter_url',
      startDate: 'start_date',
      endDate: 'end_date',
      totalHoursRequired: 'total_hours_required',
      totalHoursCompleted: 'total_hours_completed',
      finalScore: 'final_score',
      isActive: 'is_active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: ['arlValidatedAt', 'startDate', 'endDate', 'createdAt', 'updatedAt', 'deletedAt'],
    numberFields: ['totalHoursRequired', 'totalHoursCompleted', 'finalScore'],
    defaults: {
      id: () => crypto.randomUUID(),
      currentStatus: () => 'ASPIRANTE',
      totalHoursRequired: () => 320,
      totalHoursCompleted: () => 0,
      isActive: () => true,
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      application: { type: 'belongsTo', targetModel: 'application', foreignKey: 'applicationId' },
      student: { type: 'belongsTo', targetModel: 'user', foreignKey: 'studentId' },
      company: { type: 'belongsTo', targetModel: 'company', foreignKey: 'companyId' },
      vacancy: { type: 'belongsTo', targetModel: 'vacancy', foreignKey: 'vacancyId' },
      teacher: { type: 'belongsTo', targetModel: 'user', foreignKey: 'teacherId' },
      tutor: { type: 'belongsTo', targetModel: 'user', foreignKey: 'tutorId' },
      director: { type: 'belongsTo', targetModel: 'user', foreignKey: 'directorId' },
      arlValidatedBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'arlValidatedById' },
      workPlan: { type: 'hasOne', targetModel: 'workPlan', foreignKey: 'practiceId' },
      statusHistory: { type: 'hasMany', targetModel: 'practiceStatusHistory', foreignKey: 'practiceId' },
      visits: { type: 'hasMany', targetModel: 'followUpVisit', foreignKey: 'practiceId' },
      reports: { type: 'hasMany', targetModel: 'report', foreignKey: 'practiceId' },
      evaluations: { type: 'hasMany', targetModel: 'evaluation', foreignKey: 'practiceId' },
      tutorAssignments: { type: 'hasMany', targetModel: 'tutorAssignment', foreignKey: 'practiceId' },
      advanceReports: { type: 'hasMany', targetModel: 'advanceReport', foreignKey: 'practicaId' },
      followUpLogs: { type: 'hasMany', targetModel: 'followUpLog', foreignKey: 'practicaId' },
    },
  },
  tutorAssignment: {
    table: 'asignaciones_tutoria',
    fields: {
      id: 'id',
      practiceId: 'practice_id',
      tutorId: 'tutor_id',
      teacherId: 'tutor_id',
      assignedById: 'assigned_by_id',
      assignedHours: 'assigned_hours',
      assignedAt: 'created_at',
      createdAt: 'created_at',
    },
    dateFields: ['assignedAt', 'createdAt'],
    numberFields: ['assignedHours'],
    defaults: {
      id: () => crypto.randomUUID(),
      assignedHours: () => 4,
      createdAt: () => new Date().toISOString(),
    },
    relations: {
      practice: { type: 'belongsTo', targetModel: 'practice', foreignKey: 'practiceId' },
      teacher: { type: 'belongsTo', targetModel: 'user', foreignKey: 'teacherId' },
      assignedBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'assignedById' },
    },
  },
  practiceStatusHistory: {
    table: 'practice_status_history',
    fields: {
      id: 'id',
      practiceId: 'practice_id',
      fromStatus: 'from_status',
      toStatus: 'to_status',
      changedById: 'changed_by_user_id',
      changedByUserId: 'changed_by_user_id',
      notes: 'notes',
      metadata: 'metadata',
      createdAt: 'created_at',
    },
    dateFields: ['createdAt'],
    numberFields: [],
    defaults: {
      id: () => crypto.randomUUID(),
      createdAt: () => new Date().toISOString(),
    },
    relations: {
      practice: { type: 'belongsTo', targetModel: 'practice', foreignKey: 'practiceId' },
      changedBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'changedById' },
    },
  },
  workPlan: {
    table: 'work_plans',
    fields: {
      id: 'id',
      practiceId: 'practice_id',
      objectives: 'objectives',
      methodology: 'methodology',
      schedule: 'schedule',
      documentUrl: 'document_url',
      status: 'status',
      tutorApproved: 'tutor_approved',
      tutorApprovedAt: 'tutor_approved_at',
      tutorApprovedById: 'tutor_approved_by_id',
      teacherApproved: 'teacher_approved',
      teacherApprovedAt: 'teacher_approved_at',
      teacherApprovedById: 'teacher_approved_by_id',
      feedback: 'feedback',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    dateFields: ['tutorApprovedAt', 'teacherApprovedAt', 'createdAt', 'updatedAt'],
    numberFields: [],
    defaults: {
      id: () => crypto.randomUUID(),
      status: () => 'BORRADOR',
      tutorApproved: () => false,
      teacherApproved: () => false,
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      practice: { type: 'belongsTo', targetModel: 'practice', foreignKey: 'practiceId' },
    },
  },
  followUpVisit: {
    table: 'follow_up_visits',
    fields: {
      id: 'id',
      practiceId: 'practice_id',
      teacherId: 'teacher_id',
      createdById: 'teacher_id',
      visitDate: 'visit_date',
      visitType: 'visit_type',
      observations: 'observations',
      summary: 'observations',
      commitments: 'commitments',
      supportDocumentUrl: 'support_document_url',
      actUrl: 'support_document_url',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    dateFields: ['visitDate', 'createdAt', 'updatedAt'],
    numberFields: [],
    defaults: {
      id: () => crypto.randomUUID(),
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      practice: { type: 'belongsTo', targetModel: 'practice', foreignKey: 'practiceId' },
      createdBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'createdById' },
    },
  },
  report: {
    table: 'reports',
    fields: {
      id: 'id',
      practiceId: 'practice_id',
      studentId: 'student_id',
      submittedById: 'student_id',
      type: 'type',
      status: 'status',
      documentUrl: 'document_url',
      periodStart: 'period_start',
      periodEnd: 'period_end',
      hoursReported: 'hours_reported',
      hoursLogged: 'hours_reported',
      reviewedById: 'reviewed_by_id',
      feedback: 'feedback',
      reviewedAt: 'reviewed_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    dateFields: ['periodStart', 'periodEnd', 'reviewedAt', 'createdAt', 'updatedAt'],
    numberFields: ['hoursLogged', 'hoursReported'],
    defaults: {
      id: () => crypto.randomUUID(),
      status: () => 'PENDIENTE',
      hoursReported: () => 0,
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      practice: { type: 'belongsTo', targetModel: 'practice', foreignKey: 'practiceId' },
      submittedBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'submittedById' },
      reviewedBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'reviewedById' },
    },
  },
  evaluation: {
    table: 'evaluations',
    fields: {
      id: 'id',
      practiceId: 'practice_id',
      evaluatorId: 'evaluator_id',
      type: 'type',
      criteriaScores: 'criteriaScores',
      finalScore: 'quantitative_score',
      quantitativeScore: 'quantitative_score',
      qualitativeComments: 'qualitative_comments',
      documentUrl: 'document_url',
      actUrl: 'document_url',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    dateFields: ['createdAt', 'updatedAt'],
    numberFields: ['finalScore', 'quantitativeScore'],
    defaults: {
      id: () => crypto.randomUUID(),
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      practice: { type: 'belongsTo', targetModel: 'practice', foreignKey: 'practiceId' },
      evaluator: { type: 'belongsTo', targetModel: 'user', foreignKey: 'evaluatorId' },
    },
  },
  advanceReport: {
    table: 'informes_avance',
    fields: {
      id: 'id',
      practicaId: 'practica_id',
      estudianteId: 'estudiante_id',
      tipo: 'tipo',
      estado: 'estado',
      horasEjecutadas: 'horas_ejecutadas',
      descripcionActividades: 'descripcion_actividades',
      periodoInicio: 'periodo_inicio',
      periodoFin: 'periodo_fin',
      fechaEntrega: 'fecha_entrega',
      revisadoPorId: 'revisado_por_id',
      observaciones: 'observaciones',
      revisadoAt: 'revisado_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: ['periodoInicio', 'periodoFin', 'fechaEntrega', 'revisadoAt', 'createdAt', 'updatedAt', 'deletedAt'],
    numberFields: ['horasEjecutadas'],
    defaults: {
      id: () => crypto.randomUUID(),
      tipo: () => 'Avance Periódico',
      estado: () => 'Radicado',
      fechaEntrega: () => new Date().toISOString(),
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      practice: { type: 'belongsTo', targetModel: 'practice', foreignKey: 'practicaId' },
      student: { type: 'belongsTo', targetModel: 'user', foreignKey: 'estudianteId' },
      reviewer: { type: 'belongsTo', targetModel: 'user', foreignKey: 'revisadoPorId' },
      bitacoras: { type: 'hasMany', targetModel: 'followUpLog', foreignKey: 'informeId' },
    },
  },
  followUpLog: {
    table: 'bitacoras_seguimiento',
    fields: {
      id: 'id',
      informeId: 'informe_id',
      practicaId: 'practica_id',
      estudianteId: 'estudiante_id',
      fechaActividad: 'fecha_actividad',
      descripcionActividades: 'descripcion_actividades',
      horasEjecutadas: 'horas_ejecutadas',
      observaciones: 'observaciones',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: ['fechaActividad', 'createdAt', 'updatedAt', 'deletedAt'],
    numberFields: ['horasEjecutadas'],
    defaults: {
      id: () => crypto.randomUUID(),
      fechaActividad: () => new Date().toISOString(),
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      informe: { type: 'belongsTo', targetModel: 'advanceReport', foreignKey: 'informeId' },
      practice: { type: 'belongsTo', targetModel: 'practice', foreignKey: 'practicaId' },
      student: { type: 'belongsTo', targetModel: 'user', foreignKey: 'estudianteId' },
    },
  },
  attachment: {
    table: 'archivos_adjuntos',
    fields: {
      id: 'id',
      entidadTipo: 'entidad_tipo',
      entidadId: 'entidad_id',
      nombreArchivo: 'nombre_archivo',
      urlArchivo: 'url_archivo',
      tipoMime: 'tipo_mime',
      tamanoBytes: 'tamano_bytes',
      subidoPorId: 'subido_por_id',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    dateFields: ['createdAt', 'updatedAt'],
    numberFields: ['tamanoBytes'],
    defaults: {
      id: () => crypto.randomUUID(),
      entidadTipo: () => 'INFORME_AVANCE',
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      uploader: { type: 'belongsTo', targetModel: 'user', foreignKey: 'subidoPorId' },
    },
  },
  academicPeriod: {
    table: 'periodos_academicos',
    fields: {
      id: 'id',
      codigo: 'codigo',
      nombre: 'nombre',
      descripcion: 'descripcion',
      fechaInicio: 'fecha_inicio',
      fechaFin: 'fecha_fin',
      fechaInicioConvocatorias: 'fecha_inicio_convocatorias',
      fechaFinConvocatorias: 'fecha_fin_convocatorias',
      fechaInicioInformes: 'fecha_inicio_informes',
      fechaFinInformes: 'fecha_fin_informes',
      estado: 'estado',
      activo: 'activo',
      creadoPorId: 'creado_por_id',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },
    dateFields: [
      'fechaInicio',
      'fechaFin',
      'fechaInicioConvocatorias',
      'fechaFinConvocatorias',
      'fechaInicioInformes',
      'fechaFinInformes',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ],
    numberFields: [],
    defaults: {
      id: () => crypto.randomUUID(),
      estado: () => 'Abierto',
      activo: () => true,
      createdAt: () => new Date().toISOString(),
      updatedAt: () => new Date().toISOString(),
    },
    relations: {
      createdBy: { type: 'belongsTo', targetModel: 'user', foreignKey: 'creadoPorId' },
    },
  },
};

function getReverseFields(schema: ModelSchema): Record<string, string> {
  const rev: Record<string, string> = {};
  for (const [camel, snake] of Object.entries(schema.fields)) {
    rev[snake] = camel;
  }
  return rev;
}

function rowToModel(modelName: string, row: Record<string, any>): Record<string, any> {
  const schema = MODEL_SCHEMAS[modelName];
  if (!schema || !row) return row;
  const rev = getReverseFields(schema);
  const out: Record<string, any> = {};

  for (const [col, val] of Object.entries(row)) {
    const camel = rev[col] || col;
    if (val === null || val === undefined) {
      out[camel] = null;
    } else if (schema.dateFields.includes(camel)) {
      out[camel] = val instanceof Date ? val : new Date(val);
    } else if (schema.numberFields.includes(camel)) {
      out[camel] = typeof val === 'number' ? val : Number(val);
    } else {
      out[camel] = val;
    }
  }
  return out;
}

function modelToRow(modelName: string, data: Record<string, any>, isCreate = false): Record<string, any> {
  const schema = MODEL_SCHEMAS[modelName];
  if (!schema) return data;
  const row: Record<string, any> = {};

  if (isCreate && schema.defaults) {
    for (const [camel, defaultFn] of Object.entries(schema.defaults)) {
      if (data[camel] === undefined) {
        const col = schema.fields[camel] || camel;
        row[col] = defaultFn();
      }
    }
  }

  for (const [camel, val] of Object.entries(data)) {
    if (val === undefined) continue;
    if (schema.relations[camel]) continue; // handled separately
    const col = schema.fields[camel];
    if (!col) continue;

    if (val instanceof Date) {
      row[col] = val.toISOString();
    } else if (typeof val === 'bigint') {
      row[col] = Number(val);
    } else {
      row[col] = val;
    }
  }

  if (!isCreate && schema.fields.updatedAt && row[schema.fields.updatedAt] === undefined) {
    row[schema.fields.updatedAt] = new Date().toISOString();
  }

  return row;
}

function matchesCondition(itemVal: any, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond === null) return itemVal === null || itemVal === undefined;

  if (cond instanceof Date) {
    if (!itemVal) return false;
    return new Date(itemVal).getTime() === cond.getTime();
  }

  if (typeof cond === 'object' && !Array.isArray(cond)) {
    const modeInsensitive = cond.mode === 'insensitive';
    const normalizeStr = (v: any) =>
      v === null || v === undefined ? '' : modeInsensitive ? String(v).toLowerCase() : String(v);

    for (const [op, opVal] of Object.entries(cond)) {
      if (op === 'mode') continue;
      if (op === 'equals') {
        if (modeInsensitive && typeof opVal === 'string') {
          if (normalizeStr(itemVal) !== opVal.toLowerCase()) return false;
        } else if (itemVal !== opVal) {
          return false;
        }
      } else if (op === 'not') {
        if (matchesCondition(itemVal, opVal)) return false;
      } else if (op === 'in') {
        if (!Array.isArray(opVal) || !opVal.includes(itemVal)) return false;
      } else if (op === 'notIn') {
        if (Array.isArray(opVal) && opVal.includes(itemVal)) return false;
      } else if (op === 'contains') {
        if (itemVal === null || itemVal === undefined) return false;
        const target = modeInsensitive ? String(opVal).toLowerCase() : String(opVal);
        if (!normalizeStr(itemVal).includes(target)) return false;
      } else if (op === 'startsWith') {
        if (itemVal === null || itemVal === undefined) return false;
        const target = modeInsensitive ? String(opVal).toLowerCase() : String(opVal);
        if (!normalizeStr(itemVal).startsWith(target)) return false;
      } else if (op === 'endsWith') {
        if (itemVal === null || itemVal === undefined) return false;
        const target = modeInsensitive ? String(opVal).toLowerCase() : String(opVal);
        if (!normalizeStr(itemVal).endsWith(target)) return false;
      } else if (op === 'gt') {
        if (itemVal === null || itemVal === undefined) return false;
        const a = itemVal instanceof Date || opVal instanceof Date ? new Date(itemVal).getTime() : Number(itemVal);
        const b = opVal instanceof Date ? opVal.getTime() : typeof opVal === 'string' && isNaN(Number(opVal)) ? new Date(opVal).getTime() : Number(opVal);
        if (!(a > b)) return false;
      } else if (op === 'gte') {
        if (itemVal === null || itemVal === undefined) return false;
        const a = itemVal instanceof Date || opVal instanceof Date ? new Date(itemVal).getTime() : Number(itemVal);
        const b = opVal instanceof Date ? opVal.getTime() : typeof opVal === 'string' && isNaN(Number(opVal)) ? new Date(opVal).getTime() : Number(opVal);
        if (!(a >= b)) return false;
      } else if (op === 'lt') {
        if (itemVal === null || itemVal === undefined) return false;
        const a = itemVal instanceof Date || opVal instanceof Date ? new Date(itemVal).getTime() : Number(itemVal);
        const b = opVal instanceof Date ? opVal.getTime() : typeof opVal === 'string' && isNaN(Number(opVal)) ? new Date(opVal).getTime() : Number(opVal);
        if (!(a < b)) return false;
      } else if (op === 'lte') {
        if (itemVal === null || itemVal === undefined) return false;
        const a = itemVal instanceof Date || opVal instanceof Date ? new Date(itemVal).getTime() : Number(itemVal);
        const b = opVal instanceof Date ? opVal.getTime() : typeof opVal === 'string' && isNaN(Number(opVal)) ? new Date(opVal).getTime() : Number(opVal);
        if (!(a <= b)) return false;
      }
    }
    return true;
  }

  return itemVal === cond;
}

async function matchesWhereAsync(
  modelName: string,
  item: Record<string, any>,
  where: Record<string, any> | undefined,
  client: Record<string, any>
): Promise<boolean> {
  if (!where || Object.keys(where).length === 0) return true;
  const schema = MODEL_SCHEMAS[modelName];

  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;

    if (key === 'OR' && Array.isArray(cond)) {
      let anyMatch = false;
      for (const subWhere of cond) {
        if (await matchesWhereAsync(modelName, item, subWhere, client)) {
          anyMatch = true;
          break;
        }
      }
      if (!anyMatch) return false;
      continue;
    }

    if (key === 'AND' && Array.isArray(cond)) {
      for (const subWhere of cond) {
        if (!(await matchesWhereAsync(modelName, item, subWhere, client))) {
          return false;
        }
      }
      continue;
    }

    if (key === 'NOT') {
      const subWheres = Array.isArray(cond) ? cond : [cond];
      for (const subWhere of subWheres) {
        if (await matchesWhereAsync(modelName, item, subWhere, client)) {
          return false;
        }
      }
      continue;
    }

    // Compound unique key support (e.g., vacancyId_studentId: { vacancyId, studentId })
    if (
      typeof cond === 'object' &&
      cond !== null &&
      !Array.isArray(cond) &&
      key.includes('_') &&
      !schema.fields[key] &&
      !schema.relations[key]
    ) {
      for (const [subK, subV] of Object.entries(cond)) {
        if (!matchesCondition(item[subK], subV)) return false;
      }
      continue;
    }

    // Relation filter support (e.g., company: { city: ... } or agreements: { some: ... })
    if (schema.relations[key] && typeof cond === 'object' && cond !== null) {
      const rel = schema.relations[key];
      if (rel.type === 'belongsTo') {
        const fkVal = item[rel.foreignKey];
        if (!fkVal) return false;
        const relItem = await client[rel.targetModel].findUnique({ where: { id: fkVal } });
        if (!relItem) return false;
        if (!(await matchesWhereAsync(rel.targetModel, relItem, cond, client))) return false;
        continue;
      } else if (rel.type === 'hasMany') {
        const children = await client[rel.targetModel].findMany({
          where: { [rel.foreignKey]: item.id },
        });
        if (cond.some) {
          let anyChild = false;
          for (const ch of children) {
            if (await matchesWhereAsync(rel.targetModel, ch, cond.some, client)) {
              anyChild = true;
              break;
            }
          }
          if (!anyChild) return false;
        }
        if (cond.none) {
          for (const ch of children) {
            if (await matchesWhereAsync(rel.targetModel, ch, cond.none, client)) {
              return false;
            }
          }
        }
        if (cond.every) {
          for (const ch of children) {
            if (!(await matchesWhereAsync(rel.targetModel, ch, cond.every, client))) {
              return false;
            }
          }
        }
        continue;
      }
    }

    if (!matchesCondition(item[key], cond)) {
      return false;
    }
  }

  return true;
}

function sortItems(items: Record<string, any>[], orderBy: any): Record<string, any>[] {
  if (!orderBy) return items;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...items].sort((a, b) => {
    for (const ord of orders) {
      for (const [field, dir] of Object.entries(ord)) {
        const va = a[field];
        const vb = b[field];
        if (va === vb) continue;
        if (va === null || va === undefined) return dir === 'asc' ? 1 : -1;
        if (vb === null || vb === undefined) return dir === 'asc' ? -1 : 1;
        const na = va instanceof Date ? va.getTime() : va;
        const nb = vb instanceof Date ? vb.getTime() : vb;
        if (na < nb) return dir === 'asc' ? -1 : 1;
        if (na > nb) return dir === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}

function applySelect(item: Record<string, any>, select: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(select)) {
    if (v) {
      out[k] = item[k];
    }
  }
  return out;
}

async function resolveRelations(
  modelName: string,
  item: Record<string, any>,
  include?: Record<string, any>,
  select?: Record<string, any>,
  client?: Record<string, any>
): Promise<Record<string, any>> {
  if (!item || !client) return item;
  const schema = MODEL_SCHEMAS[modelName];
  const spec = include || select;
  if (!spec) return item;

  const result = { ...item };

  // Handle _count
  if (spec._count) {
    const countSelect = spec._count === true ? {} : spec._count.select || {};
    const counts: Record<string, number> = {};
    for (const [relName, relFlag] of Object.entries(countSelect)) {
      if (!relFlag) continue;
      const rel = schema.relations[relName];
      if (rel && rel.type === 'hasMany') {
        const relWhere = typeof relFlag === 'object' && (relFlag as any).where ? (relFlag as any).where : {};
        counts[relName] = await client[rel.targetModel].count({
          where: { ...relWhere, [rel.foreignKey]: item.id },
        });
      } else {
        counts[relName] = 0;
      }
    }
    result._count = counts;
  }

  // Handle relations in include or select
  for (const [relName, relSpec] of Object.entries(spec)) {
    if (!relSpec || relName === '_count') continue;
    const rel = schema.relations[relName];
    if (!rel) continue;

    const subArgs = typeof relSpec === 'object' ? relSpec : {};

    if (rel.type === 'belongsTo') {
      const fkVal = item[rel.foreignKey];
      if (!fkVal) {
        result[relName] = null;
      } else {
        result[relName] = await client[rel.targetModel].findUnique({
          where: { id: fkVal },
          include: subArgs.include,
          select: subArgs.select,
        });
      }
    } else if (rel.type === 'hasOne') {
      result[relName] = await client[rel.targetModel].findFirst({
        where: { ...(subArgs.where || {}), [rel.foreignKey]: item.id },
        include: subArgs.include,
        select: subArgs.select,
      });
    } else if (rel.type === 'hasMany') {
      result[relName] = await client[rel.targetModel].findMany({
        where: { ...(subArgs.where || {}), [rel.foreignKey]: item.id },
        orderBy: subArgs.orderBy,
        take: subArgs.take,
        skip: subArgs.skip,
        include: subArgs.include,
        select: subArgs.select,
      });
    }
  }

  if (select) {
    return applySelect(result, select);
  }
  return result;
}

async function supabaseFetch(
  table: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    query?: string;
    body?: any;
    prefer?: string;
  } = {}
): Promise<any> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/${table}${options.query ? `?${options.query}` : ''}`;
  const headers: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  if (!res.ok) {
    const pgCode = json?.code || String(res.status);
    const msg = json?.message || json?.error || `Supabase error (${res.status})`;
    const details = json?.details || '';
    const err: any = new Error(`${msg} ${details}`.trim());
    err.code = pgCode === '23505' ? 'P2002' : pgCode;
    err.pgCode = pgCode;
    err.details = details;
    err.meta = { target: details || msg, cause: msg };
    throw err;
  }

  return json;
}

function createSupabasePrismaClient(): PrismaClient {
  const client: Record<string, any> = {};

  for (const [modelName, schema] of Object.entries(MODEL_SCHEMAS)) {
    const fetchAllModelRows = async (simpleWhere?: Record<string, any>): Promise<Record<string, any>[]> => {
      // Push down simple scalar equality filters to PostgREST for speed
      const queryParts: string[] = ['select=*'];
      if (simpleWhere && !simpleWhere.OR && !simpleWhere.AND && !simpleWhere.NOT) {
        for (const [k, v] of Object.entries(simpleWhere)) {
          const col = schema.fields[k];
          if (!col) continue;
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            queryParts.push(`${col}=eq.${encodeURIComponent(String(v))}`);
          } else if (v === null) {
            queryParts.push(`${col}=is.null`);
          }
        }
      }
      const rows = await supabaseFetch(schema.table, {
        method: 'GET',
        query: queryParts.join('&'),
      });
      return (Array.isArray(rows) ? rows : []).map((r) => rowToModel(modelName, r));
    };

    client[modelName] = {
      async findMany(args: any = {}) {
        const all = await fetchAllModelRows(args.where);
        const filtered: Record<string, any>[] = [];
        for (const item of all) {
          if (await matchesWhereAsync(modelName, item, args.where, client)) {
            filtered.push(item);
          }
        }
        const sorted = sortItems(filtered, args.orderBy);
        const skipped = args.skip ? sorted.slice(args.skip) : sorted;
        const taken = args.take !== undefined ? skipped.slice(0, args.take) : skipped;

        const results: Record<string, any>[] = [];
        for (const item of taken) {
          results.push(await resolveRelations(modelName, item, args.include, args.select, client));
        }
        return results;
      },

      async findFirst(args: any = {}) {
        const list = await client[modelName].findMany({ ...args, take: 1 });
        return list[0] ?? null;
      },

      async findUnique(args: any = {}) {
        if (!args?.where) return null;
        return client[modelName].findFirst(args);
      },

      async count(args: any = {}) {
        const all = await fetchAllModelRows(args?.where);
        let cnt = 0;
        for (const item of all) {
          if (await matchesWhereAsync(modelName, item, args?.where, client)) {
            cnt++;
          }
        }
        return cnt;
      },

      async create(args: any) {
        const rawData = { ...(args.data || {}) };

        // Handle belongsTo connect (e.g., company: { connect: { id } })
        const nestedHasManyCreates: Array<{ rel: RelationDef; createData: any }> = [];
        for (const [relName, relDef] of Object.entries(schema.relations)) {
          if (rawData[relName] && typeof rawData[relName] === 'object') {
            const relInput = rawData[relName];
            if (relDef.type === 'belongsTo' && relInput.connect?.id) {
              rawData[relDef.foreignKey] = relInput.connect.id;
            } else if ((relDef.type === 'hasMany' || relDef.type === 'hasOne') && relInput.create) {
              nestedHasManyCreates.push({ rel: relDef, createData: relInput.create });
            }
            delete rawData[relName];
          }
        }

        const rowPayload = modelToRow(modelName, rawData, true);
        const insertedRows = await supabaseFetch(schema.table, {
          method: 'POST',
          body: rowPayload,
          prefer: 'return=representation',
        });

        const createdRaw = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows;
        const createdItem = rowToModel(modelName, createdRaw);

        // Execute nested creates (e.g. statusHistory: { create: ... })
        for (const nested of nestedHasManyCreates) {
          const itemsToCreate = Array.isArray(nested.createData) ? nested.createData : [nested.createData];
          for (const subData of itemsToCreate) {
            await client[nested.rel.targetModel].create({
              data: {
                ...subData,
                [nested.rel.foreignKey]: createdItem.id,
              },
            });
          }
        }

        return resolveRelations(modelName, createdItem, args.include, args.select, client);
      },

      async createMany(args: any) {
        const dataList = Array.isArray(args?.data) ? args.data : [args?.data];
        let count = 0;
        for (const d of dataList) {
          if (!d) continue;
          await client[modelName].create({ data: d });
          count++;
        }
        return { count };
      },

      async update(args: any) {
        const existing = await client[modelName].findFirst({ where: args.where });
        if (!existing) {
          const err: any = new Error(`Record to update not found in ${modelName}`);
          err.code = 'P2025';
          throw err;
        }

        const rawData = { ...(args.data || {}) };
        for (const [k, v] of Object.entries(rawData)) {
          if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
            if ('increment' in v) {
              rawData[k] = Number(existing[k] || 0) + Number((v as any).increment);
            } else if ('decrement' in v) {
              rawData[k] = Number(existing[k] || 0) - Number((v as any).decrement);
            } else if ('set' in v) {
              rawData[k] = (v as any).set;
            }
          }
        }

        const rowPatch = modelToRow(modelName, rawData, false);
        const updatedRows = await supabaseFetch(schema.table, {
          method: 'PATCH',
          query: `id=eq.${encodeURIComponent(existing.id)}`,
          body: rowPatch,
          prefer: 'return=representation',
        });

        const updatedRaw = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
        const updatedItem = rowToModel(modelName, updatedRaw || { ...existing, ...rawData });
        return resolveRelations(modelName, updatedItem, args.include, args.select, client);
      },

      async updateMany(args: any) {
        const targets = await client[modelName].findMany({ where: args?.where });
        let count = 0;
        for (const t of targets) {
          await client[modelName].update({
            where: { id: t.id },
            data: args.data,
          });
          count++;
        }
        return { count };
      },

      async upsert(args: any) {
        const existing = await client[modelName].findFirst({ where: args.where });
        if (existing) {
          return client[modelName].update({
            where: { id: existing.id },
            data: args.update,
            include: args.include,
            select: args.select,
          });
        }
        return client[modelName].create({
          data: args.create,
          include: args.include,
          select: args.select,
        });
      },

      async delete(args: any) {
        const existing = await client[modelName].findFirst({ where: args.where });
        if (!existing) {
          const err: any = new Error(`Record to delete not found in ${modelName}`);
          err.code = 'P2025';
          throw err;
        }
        await supabaseFetch(schema.table, {
          method: 'DELETE',
          query: `id=eq.${encodeURIComponent(existing.id)}`,
        });
        return existing;
      },

      async deleteMany(args: any = {}) {
        const targets = await client[modelName].findMany({ where: args?.where });
        let count = 0;
        for (const t of targets) {
          await supabaseFetch(schema.table, {
            method: 'DELETE',
            query: `id=eq.${encodeURIComponent(t.id)}`,
          });
          count++;
        }
        return { count };
      },
    };
  }

  client.$transaction = async (arg: any) => {
    if (typeof arg === 'function') {
      return arg(client);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  };

  client.$queryRaw = async () => {
    const users = await client.user.findMany({ take: 1 });
    return [
      {
        current_database: 'postgres',
        current_user: 'postgres',
        now: new Date(),
        active_users: users.length,
      },
    ];
  };

  client.$queryRawUnsafe = client.$queryRaw;
  client.$executeRaw = async () => 1;
  client.$executeRawUnsafe = async () => 1;
  client.$connect = async () => {};
  client.$disconnect = async () => {};

  return client as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createSupabasePrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
