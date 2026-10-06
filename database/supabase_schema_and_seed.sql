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
    CREATE TYPE "ApplicationStatus" AS ENUM ('POSTULADO', 'PRESENTADO', 'ACEPTADO', 'RECHAZADO', 'CANCELADO');
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

-- Tabla: users (Cuentas de usuario y RBAC - HU01)
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL UNIQUE,
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
    "program" VARCHAR(150) NOT NULL DEFAULT 'Ingeniería de Sistemas',
    "company_id" UUID REFERENCES "companies"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ
);

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

-- Tabla: applications (Postulaciones de estudiantes)
CREATE TABLE IF NOT EXISTS "applications" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "vacancy_id" UUID NOT NULL REFERENCES "vacancies"("id") ON DELETE RESTRICT,
    "student_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'POSTULADO',
    "cv_url" TEXT,
    "presentation_letter_url" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ
);

-- Tabla: practices (Ciclo de Vida de Práctica y Máquina de Estados)
CREATE TABLE IF NOT EXISTS "practices" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "application_id" UUID UNIQUE REFERENCES "applications"("id") ON DELETE RESTRICT,
    "student_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
    "vacancy_id" UUID REFERENCES "vacancies"("id") ON DELETE SET NULL,
    "teacher_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "tutor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "director_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "current_status" "PracticeStatus" NOT NULL DEFAULT 'ASPIRANTE',
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
    "deleted_at" TIMESTAMPTZ
);

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

-- Tabla: work_plans (Planes de Trabajo y Aprobación Dual - RN-07, RN-08)
CREATE TABLE IF NOT EXISTS "work_plans" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "practice_id" UUID NOT NULL UNIQUE REFERENCES "practices"("id") ON DELETE CASCADE,
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
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Tabla: evaluations (Evaluaciones de competencias y calificación)
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
    CREATE TRIGGER update_evaluations_updated_at BEFORE UPDATE ON "evaluations"
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
