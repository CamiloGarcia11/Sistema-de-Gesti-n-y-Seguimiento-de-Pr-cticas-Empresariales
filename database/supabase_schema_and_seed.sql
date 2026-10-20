-- ==============================================================================
-- SIGETRAP - Script DDL Completo para Supabase / PostgreSQL
-- Sistema Web para la Gestión, Trazabilidad y Seguimiento de Prácticas
-- ==============================================================================

-- 1. EXTENSIONES DE POSTGRESQL REQUERIDAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. DEFINICIÓN DE TIPOS ENUM PERSONALIZADOS
-- ------------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'BLOQUEADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'BLOQUEADO';

-- Alias conceptual del enum para especificación académica (estado_usuario enum)
DO $$ BEGIN
    CREATE TYPE "estado_usuario" AS ENUM ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'BLOQUEADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM (
        'DIRECTOR_PROGRAMA',
        'ESTUDIANTE',
        'DOCENTE_PRACTICA',
        'TUTOR_EMPRESARIAL',
        'ADMIN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AgreementStatus" AS ENUM ('EN_TRAMITE', 'VIGENTE', 'VENCIDO', 'CANCELADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "VacancyStatus" AS ENUM ('BORRADOR', 'PUBLICADA', 'EN_SELECCION', 'CUBIERTA', 'CANCELADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ApplicationStatus" AS ENUM ('POSTULADO', 'PRESENTADO', 'PENDIENTE', 'EN_REVISION', 'PRESELECCIONADO', 'ACEPTADO', 'RECHAZADO', 'CANCELADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PracticeStatus" AS ENUM (
        'ASPIRANTE',
        'POSTULADO',
        'PRESENTADO_A_EMPRESA',
        'REUBICACION_PENDIENTE',
        'ACEPTADO_ARL_PENDIENTE',
        'ASIGNADO_FORMALMENTE',
        'PLAN_EN_REVISION',
        'PRACTICA_EN_EJECUCION',
        'EVALUACION_PENDIENTE',
        'FINALIZADA',
        'CERRADA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "WorkPlanStatus" AS ENUM (
        'BORRADOR',
        'EN_REVISION',
        'APROBADO_TUTOR',
        'APROBADO_DOCENTE',
        'APROBADO_DUAL',
        'RECHAZADO'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ReportType" AS ENUM ('INICIAL', 'PARCIAL', 'FINAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ReportStatus" AS ENUM ('PENDIENTE', 'ENTREGADO', 'APROBADO', 'DEVUELTO_CORRECCIONES');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "EvaluationType" AS ENUM ('PARCIAL_TUTOR', 'FINAL_TUTOR', 'FINAL_DOCENTE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 3. FUNCIÓN TRIGGER PARA ACTUALIZACIÓN AUTOMÁTICA DE UPDATED_AT
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 4. CREACIÓN DE TABLAS RELACIONALES
-- ------------------------------------------------------------------------------

-- Tabla: companies (Empresas vinculadas)
CREATE TABLE IF NOT EXISTS "companies" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "nit" VARCHAR(50) NOT NULL UNIQUE,
    "business_name" VARCHAR(255) NOT NULL,
    "legal_representative" VARCHAR(255) NOT NULL,
    "contact_email" VARCHAR(255) NOT NULL,
    "contact_phone" VARCHAR(50) NOT NULL,
    "address" TEXT NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ
);

-- Tabla: users (Cuentas de usuario, RBAC - HU01 y Tutores Empresariales - HU09 / CU09)
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "document_type" VARCHAR(20) NOT NULL DEFAULT 'CC',
    "document_number" VARCHAR(50) NOT NULL UNIQUE,
    "phone" VARCHAR(50),
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVO',
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "token_version" INT NOT NULL DEFAULT 1,
    "student_code" VARCHAR(50) UNIQUE,
    "academic_average" DOUBLE PRECISION,
    "approved_credits" INT,
    "program" VARCHAR(150) NOT NULL DEFAULT 'Ingeniería de Sistemas',
    "company_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "fk_tutor_empresa" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL,
    CONSTRAINT "uq_tutor_email" UNIQUE ("email"),
    CONSTRAINT "uq_tutor_documento_empresa" UNIQUE ("document_number", "company_id"),
    CONSTRAINT "chk_correo_tutor_valido" CHECK ("email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Vistas conceptuales para HU09 / CU09 (empresas, usuarios, tutores_empresariales)
CREATE OR REPLACE VIEW "empresas" AS
SELECT
    "id",
    "nit",
    "business_name" AS "razon_social",
    "legal_representative" AS "representante_legal",
    "contact_email" AS "correo_contacto",
    "contact_phone" AS "telefono_contacto",
    "address" AS "direccion",
    "city" AS "ciudad",
    "is_active" AS "activo",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_modificacion",
    "deleted_at"
FROM "companies";

CREATE OR REPLACE VIEW "usuarios" AS
SELECT
    "id",
    "email" AS "correo",
    "name" AS "nombre",
    "document_type" AS "tipo_documento",
    "document_number" AS "documento",
    "phone" AS "telefono",
    "role" AS "rol",
    "status" AS "estado",
    "is_active" AS "activo",
    "company_id" AS "empresa_id",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_modificacion"
FROM "users";

CREATE OR REPLACE VIEW "tutores_empresariales" AS
SELECT
    "id",
    "id" AS "usuario_id",
    "company_id" AS "empresa_id",
    "name" AS "nombre",
    "program" AS "cargo",
    "email" AS "correo",
    "document_type" AS "tipo_documento",
    "document_number" AS "documento",
    "phone" AS "telefono",
    CASE WHEN "status" = 'ACTIVO' AND "is_active" = TRUE THEN 'Activo' ELSE 'Inactivo' END AS "estado",
    "status",
    "is_active",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_modificacion",
    "deleted_at"
FROM "users"
WHERE "role" = 'TUTOR_EMPRESARIAL' AND "deleted_at" IS NULL;

-- Tabla: agreements (Convenios marco e interinstitucionales - RN-01)
CREATE TABLE IF NOT EXISTS "agreements" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
    "agreement_number" VARCHAR(100) NOT NULL UNIQUE,
    "status" "AgreementStatus" NOT NULL DEFAULT 'EN_TRAMITE',
    "start_date" TIMESTAMPTZ NOT NULL,
    "end_date" TIMESTAMPTZ NOT NULL,
    "document_url" TEXT,
    "signed_by_director" BOOLEAN NOT NULL DEFAULT FALSE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ
);

-- Tabla: vacancies (Ofertas de práctica empresarial)
CREATE TABLE IF NOT EXISTS "vacancies" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
    "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "program" VARCHAR(150) NOT NULL DEFAULT 'Ingeniería de Sistemas',
    "academic_period" VARCHAR(50),
    "vacancies_count" INT NOT NULL DEFAULT 1,
    "status" "VacancyStatus" NOT NULL DEFAULT 'PUBLICADA',
    "start_date" TIMESTAMPTZ,
    "end_date" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ
);

-- Tabla: applications (Postulaciones de estudiantes - CU12 Preselección y Aceptación de Candidatos)
CREATE TABLE IF NOT EXISTS "applications" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "vacancy_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'POSTULADO',
    "cv_url" TEXT,
    "presentation_letter_url" TEXT,
    "rejection_reason" TEXT,
    "updated_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "fk_postulacion_plaza" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_postulacion_estudiante" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT,
    CONSTRAINT "chk_estado_postulacion" CHECK ("status"::text IN ('Pendiente', 'En Revisión', 'Preseleccionado', 'Aceptado', 'Rechazado', 'POSTULADO', 'PRESENTADO', 'PENDIENTE', 'EN_REVISION', 'PRESELECCIONADO', 'ACEPTADO', 'RECHAZADO', 'CANCELADO'))
);

-- Vista conceptual postulaciones para CU12
CREATE OR REPLACE VIEW "postulaciones" AS
SELECT
    "id",
    "vacancy_id" AS "plaza_id",
    "student_id" AS "estudiante_id",
    "status" AS "estado",
    "cv_url" AS "hoja_de_vida_url",
    "presentation_letter_url",
    "rejection_reason" AS "motivo_rechazo",
    "updated_by_id" AS "usuario_modificacion_id",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_modificacion",
    "deleted_at"
FROM "applications";

-- Tabla: practices (Ciclo de Vida de Práctica, Máquina de Estados y Formalización HU13 / CU13)
CREATE TABLE IF NOT EXISTS "practices" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "application_id" UUID UNIQUE REFERENCES "applications"("id") ON DELETE RESTRICT,
    "student_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
    "vacancy_id" UUID REFERENCES "vacancies"("id") ON DELETE SET NULL,
    "teacher_id" UUID,
    "tutor_id" UUID,
    "director_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "current_status" "PracticeStatus" NOT NULL DEFAULT 'ASPIRANTE',
    "academic_period" VARCHAR(50) DEFAULT '2026-1',
    "arl_support_url" TEXT,
    "arl_validated_at" TIMESTAMPTZ,
    "arl_validated_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "presentation_letter_url" TEXT,
    "start_date" TIMESTAMPTZ,
    "end_date" TIMESTAMPTZ,
    "total_hours_required" INT NOT NULL DEFAULT 320,
    "total_hours_completed" INT NOT NULL DEFAULT 0,
    "final_score" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "fk_practica_docente" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "fk_practica_tutor_ext" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "chk_estado_practica" CHECK (
        "current_status"::text IN (
            'En Trámite', 'Formalizada', 'En Curso', 'Finalizada', 'Cancelada',
            'ASPIRANTE', 'POSTULADO', 'PRESENTADO_A_EMPRESA', 'REUBICACION_PENDIENTE',
            'ACEPTADO_ARL_PENDIENTE', 'ASIGNADO_FORMALMENTE', 'PLAN_EN_REVISION',
            'PRACTICA_EN_EJECUCION', 'EVALUACION_PENDIENTE', 'FINALIZADA', 'CERRADA'
        )
    )
);

-- Restricción de unicidad por estudiante y periodo lectivo para prácticas activas ("Formalizada" o "En Curso") - HU13 Criterio 3
CREATE UNIQUE INDEX IF NOT EXISTS "uq_estudiante_practica_periodo"
ON "practices" ("student_id", COALESCE("academic_period", '2026-1'))
WHERE "current_status"::text IN (
    'Formalizada', 'En Curso', 'ASIGNADO_FORMALMENTE', 'PRACTICA_EN_EJECUCION'
) AND "deleted_at" IS NULL AND "is_active" = TRUE;

-- Vista conceptual asignaciones_practica para CU09
CREATE OR REPLACE VIEW "asignaciones_practica" AS
SELECT
    "id",
    "application_id" AS "postulacion_id",
    "student_id" AS "estudiante_id",
    "company_id" AS "empresa_id",
    "vacancy_id" AS "plaza_id",
    "teacher_id" AS "docente_id",
    "tutor_id" AS "tutor_empresarial_id",
    "director_id",
    "current_status" AS "estado_actual",
    "arl_support_url",
    "start_date" AS "fecha_inicio",
    "end_date" AS "fecha_fin",
    "is_active" AS "activo",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_modificacion"
FROM "practices";

-- Tabla: practice_status_history (Auditoría e Inmutabilidad - RNF05, RNF15)
CREATE TABLE IF NOT EXISTS "practice_status_history" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "practice_id" UUID NOT NULL REFERENCES "practices"("id") ON DELETE CASCADE,
    "from_status" "PracticeStatus" NOT NULL,
    "to_status" "PracticeStatus" NOT NULL,
    "changed_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla: work_plans (Planes de Trabajo y Aprobación Dual - RN-07, RN-08, HU13)
CREATE TABLE IF NOT EXISTS "work_plans" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "practice_id" UUID NOT NULL UNIQUE,
    "objectives" TEXT NOT NULL,
    "methodology" TEXT NOT NULL,
    "schedule" JSONB NOT NULL,
    "document_url" TEXT,
    "status" "WorkPlanStatus" NOT NULL DEFAULT 'BORRADOR',
    "tutor_approved" BOOLEAN NOT NULL DEFAULT FALSE,
    "tutor_approved_at" TIMESTAMPTZ,
    "tutor_approved_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "teacher_approved" BOOLEAN NOT NULL DEFAULT FALSE,
    "teacher_approved_at" TIMESTAMPTZ,
    "teacher_approved_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "feedback" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "fk_practica_plan_trabajo" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE
);

-- Vistas conceptuales para HU13 / CU13 (estudiantes, docentes_tutores, planes_trabajo, practicas_formativas)
CREATE OR REPLACE VIEW "estudiantes" AS
SELECT
    "id",
    "id" AS "usuario_id",
    "student_code" AS "codigo_estudiantil",
    "name" AS "nombre",
    "email" AS "correo",
    "document_type" AS "tipo_documento",
    "document_number" AS "documento",
    "phone" AS "telefono",
    "program" AS "programa",
    "academic_average" AS "promedio_academico",
    "approved_credits" AS "creditos_aprobados",
    "status" AS "estado",
    "is_active" AS "activo",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_modificacion"
FROM "users"
WHERE "role" = 'ESTUDIANTE' AND "deleted_at" IS NULL;

CREATE OR REPLACE VIEW "docentes_tutores" AS
SELECT
    "id",
    "id" AS "usuario_id",
    "name" AS "nombre",
    "email" AS "correo",
    "document_type" AS "tipo_documento",
    "document_number" AS "documento",
    "phone" AS "telefono",
    "program" AS "programa",
    CASE WHEN "status" = 'ACTIVO' AND "is_active" = TRUE THEN 'Activo' ELSE 'Inactivo' END AS "estado",
    "status",
    "is_active",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_modificacion"
FROM "users"
WHERE "role" = 'DOCENTE_PRACTICA' AND "deleted_at" IS NULL;

CREATE OR REPLACE VIEW "planes_trabajo" AS
SELECT
    "id",
    "practice_id" AS "practica_id",
    "objectives" AS "objetivos",
    "methodology" AS "metodologia",
    "schedule" AS "cronograma",
    "document_url" AS "documento_url",
    CASE
        WHEN "status" = 'APROBADO_DUAL' OR ("tutor_approved" = TRUE AND "teacher_approved" = TRUE) THEN 'Aprobado'
        WHEN "status" = 'RECHAZADO' THEN 'Rechazado'
        ELSE 'Pendiente'
    END AS "estado",
    "status" AS "estado_interno",
    "tutor_approved" AS "aprobado_tutor_externo",
    "teacher_approved" AS "aprobado_tutor_docente",
    "feedback" AS "observaciones",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_modificacion"
FROM "work_plans";

CREATE OR REPLACE VIEW "practicas_formativas" AS
SELECT
    p."id",
    p."student_id" AS "estudiante_id",
    p."company_id" AS "empresa_id",
    p."vacancy_id" AS "plaza_id",
    p."teacher_id" AS "docente_tutor_id",
    p."tutor_id" AS "tutor_externo_id",
    wp."id" AS "plan_trabajo_id",
    p."director_id" AS "coordinador_id",
    COALESCE(p."academic_period", '2026-1') AS "periodo_lectivo",
    CASE
        WHEN p."current_status" = 'ASIGNADO_FORMALMENTE' THEN 'Formalizada'
        WHEN p."current_status" IN ('PRACTICA_EN_EJECUCION', 'EVALUACION_PENDIENTE') THEN 'En Curso'
        WHEN p."current_status" IN ('FINALIZADA', 'CERRADA') THEN 'Finalizada'
        WHEN p."current_status" = 'REUBICACION_PENDIENTE' OR p."is_active" = FALSE THEN 'Cancelada'
        ELSE 'En Trámite'
    END AS "estado",
    p."current_status" AS "estado_interno",
    p."start_date" AS "fecha_inicio",
    p."end_date" AS "fecha_fin",
    p."total_hours_required" AS "horas_requeridas",
    p."total_hours_completed" AS "horas_completadas",
    p."arl_support_url",
    p."is_active" AS "activo",
    p."created_at" AS "fecha_creacion",
    p."updated_at" AS "fecha_modificacion",
    p."deleted_at"
FROM "practices" p
LEFT JOIN "work_plans" wp ON wp."practice_id" = p."id";

-- Tabla: follow_up_visits (Visitas de supervisión docente)
CREATE TABLE IF NOT EXISTS "follow_up_visits" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "practice_id" UUID NOT NULL REFERENCES "practices"("id") ON DELETE CASCADE,
    "teacher_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "visit_date" TIMESTAMPTZ NOT NULL,
    "visit_type" VARCHAR(50) NOT NULL DEFAULT 'PRESENCIAL',
    "observations" TEXT NOT NULL,
    "commitments" TEXT,
    "support_document_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla: reports (Informes de avance y final del practicante)
CREATE TABLE IF NOT EXISTS "reports" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "practice_id" UUID NOT NULL REFERENCES "practices"("id") ON DELETE CASCADE,
    "student_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDIENTE',
    "document_url" TEXT,
    "period_start" TIMESTAMPTZ,
    "period_end" TIMESTAMPTZ,
    "hours_reported" INT NOT NULL DEFAULT 0,
    "reviewed_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "feedback" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla: reports (Informes de avance y final del practicante)
CREATE TABLE IF NOT EXISTS "reports" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "practice_id" UUID NOT NULL REFERENCES "practices"("id") ON DELETE CASCADE,
    "student_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDIENTE',
    "document_url" TEXT,
    "period_start" TIMESTAMPTZ,
    "period_end" TIMESTAMPTZ,
    "hours_reported" INT NOT NULL DEFAULT 0,
    "reviewed_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "feedback" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- CU14: SEGUIMIENTO Y CONTROL DE PRÁCTICAS - INFORMES DE AVANCE Y BITÁCORAS
-- Entidades: informes_avance, practicas_formativas, bitacoras_seguimiento, archivos_adjuntos
-- ==============================================================================

-- Vista conceptual: practicas_formativas
CREATE OR REPLACE VIEW "practicas_formativas" AS
SELECT
    "id",
    "application_id" AS "postulacion_id",
    "student_id" AS "estudiante_id",
    "company_id" AS "empresa_id",
    "vacancy_id" AS "plaza_id",
    "teacher_id" AS "docente_id",
    "tutor_id" AS "tutor_id",
    "director_id" AS "director_id",
    "current_status" AS "estado",
    "start_date" AS "fecha_inicio",
    "end_date" AS "fecha_fin",
    "total_hours_required" AS "horas_requeridas",
    "total_hours_completed" AS "horas_completadas",
    "final_score" AS "calificacion_final",
    "is_active" AS "activo",
    "created_at" AS "fecha_creacion",
    "updated_at" AS "fecha_actualizacion",
    "deleted_at"
FROM "practices";

-- Tabla: informes_avance (Informes periódicos y de seguimiento del plan formativo)
CREATE TABLE IF NOT EXISTS "informes_avance" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "practica_id" UUID NOT NULL,
    "estudiante_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "tipo" VARCHAR(50) NOT NULL DEFAULT 'SEGUIMIENTO',
    "estado" VARCHAR(50) NOT NULL DEFAULT 'Borrador',
    "horas_ejecutadas" INT NOT NULL,
    "descripcion_actividades" TEXT NOT NULL,
    "periodo_inicio" TIMESTAMPTZ,
    "periodo_fin" TIMESTAMPTZ,
    "fecha_entrega" TIMESTAMPTZ,
    "revisado_por_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "observaciones" TEXT,
    "revisado_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "fk_informe_practica" FOREIGN KEY ("practica_id") REFERENCES "practices"("id") ON DELETE CASCADE,
    CONSTRAINT "chk_horas_ejecutadas_positivas" CHECK ("horas_ejecutadas" > 0),
    CONSTRAINT "chk_estado_informe" CHECK ("estado" IN ('Borrador', 'Radicado', 'En Revisión', 'Aprobado', 'Rechazado'))
);

-- Tabla: bitacoras_seguimiento (Registro detallado de actividades y horas del practicante)
CREATE TABLE IF NOT EXISTS "bitacoras_seguimiento" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "informe_id" UUID REFERENCES "informes_avance"("id") ON DELETE CASCADE,
    "practica_id" UUID NOT NULL,
    "estudiante_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "fecha_actividad" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "descripcion_actividades" TEXT NOT NULL,
    "horas_ejecutadas" INT NOT NULL,
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "fk_bitacora_practica" FOREIGN KEY ("practica_id") REFERENCES "practices"("id") ON DELETE CASCADE,
    CONSTRAINT "chk_bitacora_horas_positivas" CHECK ("horas_ejecutadas" > 0)
);

-- Tabla: archivos_adjuntos (Evidencias y soportes documentales de seguimiento)
CREATE TABLE IF NOT EXISTS "archivos_adjuntos" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "entidad_tipo" VARCHAR(50) NOT NULL,
    "entidad_id" UUID NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "url_archivo" TEXT NOT NULL,
    "tipo_mime" VARCHAR(100),
    "tamano_bytes" BIGINT,
    "subido_por_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ==============================================================================
-- HU05 / CU02: PARAMETRIZACIÓN DE PERIODOS ACADÉMICOS Y ELEGIBILIDAD
-- Entidad BD: periodos_academicos
-- Restricción SQL: chk_fechas_periodo (fecha_fin > fecha_inicio)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS "periodos_academicos" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "fecha_inicio" TIMESTAMPTZ NOT NULL,
    "fecha_fin" TIMESTAMPTZ NOT NULL,
    "fecha_inicio_convocatorias" TIMESTAMPTZ,
    "fecha_fin_convocatorias" TIMESTAMPTZ,
    "fecha_inicio_informes" TIMESTAMPTZ,
    "fecha_fin_informes" TIMESTAMPTZ,
    "estado" VARCHAR(50) NOT NULL DEFAULT 'Abierto',
    "activo" BOOLEAN NOT NULL DEFAULT TRUE,
    "creado_por_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "uq_codigo_periodo" UNIQUE ("codigo"),
    CONSTRAINT "chk_fechas_periodo" CHECK ("fecha_fin" > "fecha_inicio"),
    CONSTRAINT "chk_fechas_convocatorias_periodo" CHECK (
        "fecha_inicio_convocatorias" IS NULL OR "fecha_fin_convocatorias" IS NULL OR (
            "fecha_fin_convocatorias" > "fecha_inicio_convocatorias" AND
            "fecha_inicio_convocatorias" >= "fecha_inicio" AND
            "fecha_fin_convocatorias" <= "fecha_fin"
        )
    ),
    CONSTRAINT "chk_fechas_informes_periodo" CHECK (
        "fecha_inicio_informes" IS NULL OR "fecha_fin_informes" IS NULL OR (
            "fecha_fin_informes" > "fecha_inicio_informes" AND
            "fecha_inicio_informes" >= "fecha_inicio" AND
            "fecha_fin_informes" <= "fecha_fin"
        )
    ),
    CONSTRAINT "chk_estado_periodo" CHECK ("estado" IN ('Abierto', 'En Configuración', 'Cerrado', 'Activo', 'Inactivo'))
);

CREATE TABLE IF NOT EXISTS "evaluations" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "practice_id" UUID NOT NULL REFERENCES "practices"("id") ON DELETE CASCADE,
    "evaluator_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "type" "EvaluationType" NOT NULL,
    "criteria_scores" JSONB NOT NULL,
    "quantitative_score" DOUBLE PRECISION NOT NULL,
    "qualitative_comments" TEXT,
    "document_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. CREACIÓN DE TRIGGERS PARA ACTUALIZACIÓN AUTOMÁTICA DE TIMESTAMPS
-- ------------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON "companies"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_agreements_updated_at BEFORE UPDATE ON "agreements"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_vacancies_updated_at BEFORE UPDATE ON "vacancies"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON "applications"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_practices_updated_at BEFORE UPDATE ON "practices"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_work_plans_updated_at BEFORE UPDATE ON "work_plans"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_follow_up_visits_updated_at BEFORE UPDATE ON "follow_up_visits"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON "reports"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_informes_avance_updated_at BEFORE UPDATE ON "informes_avance"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_bitacoras_seguimiento_updated_at BEFORE UPDATE ON "bitacoras_seguimiento"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_evaluations_updated_at BEFORE UPDATE ON "evaluations"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_periodos_academicos_updated_at BEFORE UPDATE ON "periodos_academicos"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_evaluations_updated_at_noop BEFORE UPDATE ON "evaluations"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 6. ÍNDICES DE ALTO RENDIMIENTO
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");
CREATE INDEX IF NOT EXISTS "idx_users_document_number" ON "users"("document_number");
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users"("status");

CREATE INDEX IF NOT EXISTS "idx_companies_nit" ON "companies"("nit");
CREATE INDEX IF NOT EXISTS "idx_companies_business_name" ON "companies"("business_name");

CREATE INDEX IF NOT EXISTS "idx_agreements_company_id" ON "agreements"("company_id");
CREATE INDEX IF NOT EXISTS "idx_agreements_status" ON "agreements"("status");
CREATE INDEX IF NOT EXISTS "idx_agreements_number" ON "agreements"("agreement_number");

CREATE INDEX IF NOT EXISTS "idx_vacancies_company_id" ON "vacancies"("company_id");
CREATE INDEX IF NOT EXISTS "idx_vacancies_status" ON "vacancies"("status");

CREATE INDEX IF NOT EXISTS "idx_applications_vacancy_id" ON "applications"("vacancy_id");
CREATE INDEX IF NOT EXISTS "idx_applications_student_id" ON "applications"("student_id");
CREATE INDEX IF NOT EXISTS "idx_applications_status" ON "applications"("status");

CREATE INDEX IF NOT EXISTS "idx_practices_student_id" ON "practices"("student_id");
CREATE INDEX IF NOT EXISTS "idx_practices_company_id" ON "practices"("company_id");
CREATE INDEX IF NOT EXISTS "idx_practices_teacher_id" ON "practices"("teacher_id");
CREATE INDEX IF NOT EXISTS "idx_practices_tutor_id" ON "practices"("tutor_id");
CREATE INDEX IF NOT EXISTS "idx_practices_current_status" ON "practices"("current_status");

CREATE INDEX IF NOT EXISTS "idx_history_practice_id" ON "practice_status_history"("practice_id");
CREATE INDEX IF NOT EXISTS "idx_history_changed_by" ON "practice_status_history"("changed_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_history_created_at" ON "practice_status_history"("created_at");

CREATE INDEX IF NOT EXISTS "idx_work_plans_practice_id" ON "work_plans"("practice_id");
CREATE INDEX IF NOT EXISTS "idx_work_plans_status" ON "work_plans"("status");

CREATE INDEX IF NOT EXISTS "idx_reports_practice_id" ON "reports"("practice_id");
CREATE INDEX IF NOT EXISTS "idx_reports_student_id" ON "reports"("student_id");
CREATE INDEX IF NOT EXISTS "idx_evaluations_practice_id" ON "evaluations"("practice_id");

-- Índices CU14: Seguimiento y Control de Prácticas
CREATE INDEX IF NOT EXISTS "idx_informes_practica_id" ON "informes_avance"("practica_id");
CREATE INDEX IF NOT EXISTS "idx_informes_estudiante_id" ON "informes_avance"("estudiante_id");
CREATE INDEX IF NOT EXISTS "idx_informes_estado" ON "informes_avance"("estado");
CREATE INDEX IF NOT EXISTS "idx_bitacoras_informe_id" ON "bitacoras_seguimiento"("informe_id");
CREATE INDEX IF NOT EXISTS "idx_bitacoras_practica_id" ON "bitacoras_seguimiento"("practica_id");
CREATE INDEX IF NOT EXISTS "idx_archivos_entidad" ON "archivos_adjuntos"("entidad_tipo", "entidad_id");

-- Índices HU05 / CU02: Parametrización de Periodos Académicos
CREATE INDEX IF NOT EXISTS "idx_periodos_codigo" ON "periodos_academicos"("codigo");
CREATE INDEX IF NOT EXISTS "idx_periodos_estado" ON "periodos_academicos"("estado");
CREATE INDEX IF NOT EXISTS "idx_periodos_activo" ON "periodos_academicos"("activo");
CREATE INDEX IF NOT EXISTS "idx_periodos_fechas" ON "periodos_academicos"("fecha_inicio", "fecha_fin");

-- ------------------------------------------------------------------------------
-- 7. CONFIGURACIÓN DE SUPABASE STORAGE (BUCKET DE EXPEDIENTES)
-- ------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('sigetrap-expedientes', 'sigetrap-expedientes', false)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 8. DATOS SEMILLA (INITIAL SEED DATA PARA SUPABASE)
-- Contraseña unificada para todos los usuarios: Password123!
-- Hash BCrypt: $2a$10$w09ZJ/E9fR/n1vXJ4b2K8.fXWkQZ59A89e27K0b/1rM/xYVz5Fj9e
-- ------------------------------------------------------------------------------

-- Insertar Empresa de Prueba
INSERT INTO "companies" (
    "id", "nit", "business_name", "legal_representative", "contact_email", "contact_phone", "address", "city"
) VALUES (
    'a1111111-1111-1111-1111-111111111111',
    '900123456-1',
    'Tech Innovations Colombia S.A.S.',
    'Carlos Mendoza',
    'contacto@techinnovations.co',
    '+57 300 123 4567',
    'Calle 100 # 15-20',
    'Cúcuta'
) ON CONFLICT ("nit") DO NOTHING;

-- Insertar Convenio VIGENTE (RN-01)
INSERT INTO "agreements" (
    "id", "company_id", "agreement_number", "status", "start_date", "end_date", "signed_by_director", "document_url", "notes"
) VALUES (
    'b1111111-1111-1111-1111-111111111111',
    'a1111111-1111-1111-1111-111111111111',
    'CONV-2026-001',
    'VIGENTE',
    '2026-01-01 00:00:00+00',
    '2028-12-31 23:59:59+00',
    TRUE,
    'https://storage.sigetrap.co/agreements/conv-2026-001.pdf',
    'Convenio marco de cooperación interinstitucional vigente'
) ON CONFLICT ("agreement_number") DO NOTHING;

-- Insertar Usuarios para los 5 Roles del Sistema (HU01)
-- 1. Administrador
INSERT INTO "users" (
    "id", "email", "password_hash", "name", "document_type", "document_number", "role", "status", "is_active", "token_version"
) VALUES (
    'c1111111-1111-1111-1111-111111111111',
    'admin.sigetrap@ufps.edu.co',
    '$2a$10$w09ZJ/E9fR/n1vXJ4b2K8.fXWkQZ59A89e27K0b/1rM/xYVz5Fj9e',
    'Administrador del Sistema',
    'CC',
    '1000000001',
    'ADMIN',
    'ACTIVO',
    TRUE,
    1
) ON CONFLICT ("email") DO NOTHING;

-- 2. Director de Programa
INSERT INTO "users" (
    "id", "email", "password_hash", "name", "document_type", "document_number", "role", "status", "is_active", "program", "token_version"
) VALUES (
    'c2222222-2222-2222-2222-222222222222',
    'director.sistemas@ufps.edu.co',
    '$2a$10$w09ZJ/E9fR/n1vXJ4b2K8.fXWkQZ59A89e27K0b/1rM/xYVz5Fj9e',
    'Dr. Roberto Gómez (Director)',
    'CC',
    '1010203040',
    'DIRECTOR_PROGRAMA',
    'ACTIVO',
    TRUE,
    'Ingeniería de Sistemas',
    1
) ON CONFLICT ("email") DO NOTHING;

-- 3. Docente Supervisor de Práctica
INSERT INTO "users" (
    "id", "email", "password_hash", "name", "document_type", "document_number", "role", "status", "is_active", "program", "token_version"
) VALUES (
    'c3333333-3333-3333-3333-333333333333',
    'docente.practica@ufps.edu.co',
    '$2a$10$w09ZJ/E9fR/n1vXJ4b2K8.fXWkQZ59A89e27K0b/1rM/xYVz5Fj9e',
    'Ing. Laura Restrepo (Docente)',
    'CC',
    '1020304050',
    'DOCENTE_PRACTICA',
    'ACTIVO',
    TRUE,
    'Ingeniería de Sistemas',
    1
) ON CONFLICT ("email") DO NOTHING;

-- 4. Tutor Empresarial
INSERT INTO "users" (
    "id", "email", "password_hash", "name", "document_type", "document_number", "role", "status", "is_active", "company_id", "token_version"
) VALUES (
    'c4444444-4444-4444-4444-444444444444',
    'tutor@techinnovations.co',
    '$2a$10$w09ZJ/E9fR/n1vXJ4b2K8.fXWkQZ59A89e27K0b/1rM/xYVz5Fj9e',
    'Ing. Andrés Silva (Tutor Empresarial)',
    'CC',
    '1030405060',
    'TUTOR_EMPRESARIAL',
    'ACTIVO',
    TRUE,
    'a1111111-1111-1111-1111-111111111111',
    1
) ON CONFLICT ("email") DO NOTHING;

-- 5. Estudiante Practicante
INSERT INTO "users" (
    "id", "email", "password_hash", "name", "document_type", "document_number", "role", "status", "is_active", "student_code", "program", "token_version"
) VALUES (
    'c5555555-5555-5555-5555-555555555555',
    'estudiante@ufps.edu.co',
    '$2a$10$w09ZJ/E9fR/n1vXJ4b2K8.fXWkQZ59A89e27K0b/1rM/xYVz5Fj9e',
    'Juan David Pérez (Estudiante)',
    'CC',
    '1090123456',
    'ESTUDIANTE',
    'ACTIVO',
    TRUE,
    '1152001',
    'Ingeniería de Sistemas',
    1
) ON CONFLICT ("email") DO NOTHING;

-- 6. Insertar Vacante de Práctica
INSERT INTO "vacancies" (
    "id", "company_id", "created_by_id", "title", "description", "requirements", "vacancies_count", "status"
) VALUES (
    'd1111111-1111-1111-1111-111111111111',
    'a1111111-1111-1111-1111-111111111111',
    'c4444444-4444-4444-4444-444444444444',
    'Desarrollador Fullstack Junior / Practicante',
    'Participación en el desarrollo de microservicios y frontend en Next.js.',
    'Estudiante de 9no o 10mo semestre con conocimientos en TypeScript, React y SQL.',
    2,
    'PUBLICADA'
) ON CONFLICT ("id") DO NOTHING;

-- 7. Insertar Práctica de Ejemplo en estado ACEPTADO_ARL_PENDIENTE (RN-06)
INSERT INTO "practices" (
    "id", "student_id", "company_id", "vacancy_id", "teacher_id", "tutor_id", "director_id", "current_status", "presentation_letter_url"
) VALUES (
    'e1111111-1111-1111-1111-111111111111',
    'c5555555-5555-5555-5555-555555555555',
    'a1111111-1111-1111-1111-111111111111',
    'd1111111-1111-1111-1111-111111111111',
    'c3333333-3333-3333-3333-333333333333',
    'c4444444-4444-4444-4444-444444444444',
    'c2222222-2222-2222-2222-222222222222',
    'ACEPTADO_ARL_PENDIENTE',
    'https://storage.sigetrap.co/docs/oficio_presentacion_juan_perez.pdf'
) ON CONFLICT ("id") DO NOTHING;

-- 8. Registrar Trazabilidad Histórica Inmutable (RNF05, RNF15)
INSERT INTO "practice_status_history" ("practice_id", "from_status", "to_status", "changed_by_user_id", "notes")
VALUES
    ('e1111111-1111-1111-1111-111111111111', 'ASPIRANTE', 'POSTULADO', 'c5555555-5555-5555-5555-555555555555', 'Postulación inicial a la vacante'),
    ('e1111111-1111-1111-1111-111111111111', 'POSTULADO', 'PRESENTADO_A_EMPRESA', 'c2222222-2222-2222-2222-222222222222', 'Emisión de Oficio de Presentación #OP-2026-45'),
    ('e1111111-1111-1111-1111-111111111111', 'PRESENTADO_A_EMPRESA', 'ACEPTADO_ARL_PENDIENTE', 'c4444444-4444-4444-4444-444444444444', 'Estudiante seleccionado tras entrevista técnica. Pendiente afiliación ARL.')
ON CONFLICT ("id") DO NOTHING;


-- 9. Insertar Periodos Lectivos Iniciales (HU05 / CU02)
INSERT INTO "periodos_academicos" (
    "id", "codigo", "nombre", "descripcion", "fecha_inicio", "fecha_fin",
    "fecha_inicio_convocatorias", "fecha_fin_convocatorias",
    "fecha_inicio_informes", "fecha_fin_informes",
    "estado", "activo", "creado_por_id"
) VALUES
(
    'f1111111-1111-1111-1111-111111111111',
    '2026-1',
    'Primer Semestre Académico 2026',
    'Periodo lectivo oficial para convocatorias, formalización e informes de práctica del primer semestre de 2026.',
    '2026-02-01 00:00:00+00',
    '2026-06-30 23:59:59+00',
    '2026-02-01 00:00:00+00',
    '2026-03-15 23:59:59+00',
    '2026-03-01 00:00:00+00',
    '2026-06-25 23:59:59+00',
    'Cerrado',
    FALSE,
    'c2222222-2222-2222-2222-222222222222'
),
(
    'f2222222-2222-2222-2222-222222222222',
    '2026-2',
    'Segundo Semestre Académico 2026',
    'Periodo lectivo vigente para convocatorias, formalización e informes de práctica del segundo semestre de 2026.',
    '2026-08-01 00:00:00+00',
    '2026-12-15 23:59:59+00',
    '2026-08-01 00:00:00+00',
    '2026-09-30 23:59:59+00',
    '2026-09-01 00:00:00+00',
    '2026-12-10 23:59:59+00',
    'Abierto',
    TRUE,
    'c2222222-2222-2222-2222-222222222222'
)
ON CONFLICT ("codigo") DO NOTHING;
