# REGISTRO DE INCIDENCIAS Y TICKETS DE JIRA
## Ciclo de Aseguramiento de Calidad (QA) y Validación Pre-Producción — SIGETRAP

---

### Ticket Principal (Tarea Técnica de Jira)

#### **[SIG-QA-01] Ejecución del Plan Integral de Pruebas Funcionales, Seguridad, RNF y Usabilidad SUS**
- **Tipo de Incidencia:** Tarea Técnica (Technical Task)
- **Componente:** Aseguramiento de Calidad / Release Candidate
- **Prioridad:** Alta (P2)
- **Estado:** **Cerrada / Resuelta (Done)**
- **Resolución:** Aprobado para Producción
- **Etiquetas:** `qa-validation`, `e2e`, `security-audit`, `rnf-performance`, `sus-usability`, `release-ready`
- **Responsable:** Equipo de QA / Automatización de Pruebas

**Descripción del Ticket:**
> Se ejecutó el plan integral de validación pre-producción del sistema SIGETRAP cumpliendo los 5 criterios de aceptación:
> 1. Pruebas E2E de punta a punta (postulación -> calificación -> liquidación -> expediente) con 100% de éxito.
> 2. Auditoría de seguridad RBAC, IDOR, SQLi y XSS con 0 incidentes.
> 3. Pruebas de carga RNF con 100 peticiones concurrentes arrojando latencia promedio de 3.11 ms (< 2.0s) y p95 de 4.11 ms (< 2.5s) con 100% de disponibilidad.
> 4. Estudio de usabilidad SUS con 13 usuarios representativos obteniendo un puntaje de 86.92/100 (Grado A+ Excelente).
> 5. Consolidación de informe técnico y matrices de prueba.

**Entregables Adjuntos al Ticket:**
- `reports/INFORME_TECNICO_QA_VALIDACION_INTEGRAL.md` (Informe Técnico Oficial).
- `reports/tabulacion-sus.csv` (Tabulación y cálculo automatizado SUS para Excel).
- `reports/tabulacion-sus.json` (Dataset procesado en formato JSON).
- `tests/qa-master-runner.test.ts` (Suite de automatización reproducible).

---

### Tickets Derivados y Acciones de Mejora

#### **[SIG-QA-02] Incorporación de cola asíncrona de correos para notificaciones externas a tutores**
- **Tipo de Incidencia:** Mejora (Improvement)
- **Componente:** Notificaciones / Integración
- **Prioridad:** Baja (P4)
- **Severidad:** Menor (Minor)
- **Estado:** Backlog / Programado para Sprint de Mantenimiento
- **Regla RN01:** No bloqueante para paso a producción.

**Descripción:**
> Durante la prueba de usabilidad, el participante `usr_sus_eval_03` (Tutor Empresarial) sugirió que, además de la notificación interna en la plataforma y el registro en bitácora de auditoría, se despache un correo electrónico recordatorio cuando se aproxima la fecha límite de radicación de la rúbrica cuantitativa del 50%.
>
> **Acción acordada:** La funcionalidad actual cumple plenamente las reglas institucionales. Se programa la integración con servicio SMTP (ej. SendGrid o Amazon SES) en el backlog del siguiente sprint.

---

#### **[SIG-QA-03] Ajuste de badge de horas acumuladas en viewports ultracompactos**
- **Tipo de Incidencia:** Defecto UI (Bug)
- **Componente:** Frontend / UI Prácticas
- **Prioridad:** Muy Baja (P5)
- **Severidad:** Trivial (Trivial)
- **Estado:** **Cerrado / Resuelto (Resolved)**
- **Regla RN01:** No bloqueante.

**Descripción:**
> En dispositivos móviles con pantallas de ancho inferior a 360 píxeles, la etiqueta del porcentaje ponderado (20%) en el desglose de horas presentaba un salto de línea en la tarjeta de resumen de liquidación.
>
> **Acción ejecutada:** Se aplicó clase Tailwind `whitespace-nowrap` y ajuste tipográfico a `text-xs`, asegurando visualización responsiva óptima en cualquier dispositivo móvil.
