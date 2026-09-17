# SIGETRAP - Sistema de Gestión, Trazabilidad y Seguimiento de Prácticas Empresariales

Sistema Web para la Gestión, Trazabilidad y Seguimiento de Prácticas Empresariales del Programa de Ingeniería de Sistemas. Diseñado bajo una **arquitectura basada en máquina de estados e inmutabilidad de ciclo de vida**, con desacoplamiento estricto en 3 capas.

---

## 🏛️ 1. Arquitectura en 3 Capas (`src/server`)

```
src/
├── app/
│   ├── api/
│   │   └── practices/
│   │       ├── [id]/
│   │       │   ├── route.ts                 # GET: Consulta y trazabilidad completa
│   │       │   └── transition/
│   │       │       └── route.ts             # POST: Transición de estado (Route Handler)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── auth.ts                              # Hashing (BCrypt), JWT y Guardias RBAC
│   └── prisma.ts                            # Singleton seguro de PrismaClient
├── server/
│   ├── repositories/                        # Capa de Acceso a Datos (Prisma)
│   │   ├── agreement.repository.ts          # Consultas de convenios y vigencia (RN-01)
│   │   └── practice.repository.ts           # Mutaciones transaccionales e histórico inmutable
│   └── services/                            # Capa de Negocio y Reglas
│       └── practice-workflow.service.ts     # Máquina de estados y reglas RN-01 a RN-08
└── types/
    └── index.ts                             # Tipos y DTOs estricto en TypeScript
```

---

## 🔄 2. Máquina de Estados del Ciclo de Vida

```
[ASPIRANTE]
    │
    ▼ (Postulación a vacante / Empresa con Convenio VIGENTE - RN-01)
[POSTULADO]
    │
    ▼ (Director de Programa emite Oficio de Presentación - RN-02)
[PRESENTADO_A_EMPRESA] ──(Rechazo Empresa)──► [REUBICACION_PENDIENTE]
    │                                                    │ (Nueva postulación)
    ▼ (Empresa acepta estudiante)                        ▼
[ACEPTADO_ARL_PENDIENTE] ◄───────────────────────────────┘
    │
    ▼ (Validación obligatoria de soporte ARL por Director/Admin - RN-06)
[ASIGNADO_FORMALMENTE]
    │
    ▼ (Diseño y envío de Plan de Trabajo)
[PLAN_EN_REVISION]
    │
    ▼ (Aprobación Dual Concurrente: Tutor Empresarial Y Docente de Práctica - RN-07, RN-08)
[PRACTICA_EN_EJECUCION]
    │ (Seguimiento: Visitas académicas, Informes de avance)
    ▼ (Cumplimiento de horas y entregas)
[EVALUACION_PENDIENTE]
    │ (Evaluación de desempeño de tutor y calificación docente)
    ▼
[FINALIZADA]
    │ (Cierre administrativo)
    ▼
[CERRADA]
```

---

## 🛡️ 3. Reglas de Negocio Implementadas

- **RN-01 (Convenio Obligatorio):** Solo empresas con convenio en estado `VIGENTE` y fecha válida pueden ofertar vacantes o aceptar prácticas.
- **RN-02 (Oferta Empresarial):** El `DIRECTOR_PROGRAMA` (o `ADMIN`) es el único facultado para formalizar la presentación y emitir el oficio a la empresa.
- **RN-06 (Estado Intermedio ACEPTADO_ARL_PENDIENTE):** Bloquea el inicio del plan de trabajo hasta que el soporte de ARL sea validado por el Director/Admin; al validarse, pasa a `ASIGNADO_FORMALMENTE`.
- **RN-07 y RN-08 (Aprobación Dual Concurrente):** El plan de trabajo requiere la aprobación individual y concurrente de:
  1. `TUTOR_EMPRESARIAL` (`tutorApproved = true`)
  2. `DOCENTE_PRACTICA` (`teacherApproved = true`)
  Solo con ambas aprobaciones se desbloquea el avance a `PRACTICA_EN_EJECUCION`.
- **Auditoría e Inmutabilidad (RNF05, RNF15):** Toda mutación de estado se ejecuta dentro de `$transaction` de Prisma, generando un registro histórico inmutable en `practice_status_history` con actor, timestamps, notas y metadata de auditoría.

---

## 🚀 4. Guía de Puesta en Marcha

### 4.1. Instalación de dependencias
```bash
npm install
```

### 4.2. Variables de entorno
Copia `.env.example` a `.env` y configura tu base de datos PostgreSQL / Supabase:
```bash
cp .env.example .env
```

### 4.3. Generar cliente Prisma y aplicar migraciones
```bash
npx prisma generate
npx prisma migrate dev --name init_sigetrap
```

### 4.4. Poblar datos iniciales de prueba (Seeder)
```bash
npm run prisma:seed
```

### 4.5. Iniciar servidor de desarrollo
```bash
npm run dev
```

---

## 👥 5. Usuarios de Prueba (Seed)

| Rol | Correo | Contraseña |
|---|---|---|
| **DIRECTOR_PROGRAMA** | `director.sistemas@universidad.edu.co` | `Password123!` |
| **DOCENTE_PRACTICA** | `docente.practica@universidad.edu.co` | `Password123!` |
| **TUTOR_EMPRESARIAL** | `tutor@techinnovations.co` | `Password123!` |
| **ESTUDIANTE** | `estudiante.practicante@universidad.edu.co` | `Password123!` |
| **ADMIN** | `admin.sigetrap@universidad.edu.co` | `Password123!` |
