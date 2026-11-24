// ==============================================================================
// SIGETRAP - Suite de Pruebas: Prerrequisitos Documentales y Revisión Jurídica UFPS
// Criterios de Aceptación:
//   - Criterio 1: Carga y validación de prerrequisitos documentales obligatorios (3 paquetes)
//   - Criterio 2: Transición al estado PENDIENTE_JURIDICA_UFPS
//   - Criterio 3: Emisión del visto bueno (APROBADO_JURIDICA / VIGENTE) o devolución (OBSERVADO_JURIDICA)
// Reglas de Negocio:
//   - RN01: Bloqueo de formalización anticipada de estudiante sin visto bueno final de Jurídica
//   - RN02: Vigencia de antecedentes legales y fiscales <= 30 días calendario
//   - RN03: Trazabilidad de conceptos (fecha, número de radicado interno y observaciones obligatorias)
// ==============================================================================

import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  AgreementLegalService,
  AgreementLegalError,
  setAgreementLegalServiceInstance,
} from '../src/server/services/agreement-legal.service';
import {
  PracticeFormalizationService,
  PracticeFormalizationError,
} from '../src/server/services/practice-formalization.service';
import {
  PracticeWorkflowService,
  BusinessRuleError,
} from '../src/server/services/practice-workflow.service';
import { AgreementRepository } from '../src/server/repositories/agreement.repository';
import { CompanyRepository } from '../src/server/repositories/company.repository';
import { PracticeRepository } from '../src/server/repositories/practice.repository';
import { UserRepository } from '../src/server/repositories/user.repository';
import { generateToken } from '../src/lib/auth';
import {
  POST as createAgreementHandler,
  GET as listAgreementsHandler,
} from '../src/app/api/v1/convenios/route';
import { GET as getAgreementDetailHandler } from '../src/app/api/v1/convenios/[id]/route';
import {
  POST as uploadPrerequisitesHandler,
  GET as getPrerequisitesHandler,
} from '../src/app/api/v1/convenios/[id]/prerrequisitos/route';
import { PATCH as sendToJuridicaHandler } from '../src/app/api/v1/convenios/[id]/enviar-juridica/route';
import { PATCH as dictamenJuridicaHandler } from '../src/app/api/v1/convenios/[id]/dictamen-juridica/route';
import { PATCH as suscribirAgreementHandler } from '../src/app/api/v1/convenios/[id]/suscribir/route';
import { AuthenticatedUser, AgreementStatus, Role, UserStatus } from '../src/types';

// ------------------------------------------------------------------------------
// MOCKS EN MEMORIA
// ------------------------------------------------------------------------------

class MockAgreementRepository extends AgreementRepository {
  public agreements: any[] = [];
  public prerequisites: any[] = [];
  public companiesRef: any[] = [];

  constructor(companiesRef: any[] = []) {
    super();
    this.companiesRef = companiesRef;
  }

  private hydrate(ag: any) {
    if (!ag) return null;
    return {
      ...ag,
      company: this.companiesRef.find((c) => c.id === ag.companyId) || null,
      prerequisites: this.prerequisites.filter((p) => p.agreementId === ag.id),
    };
  }

  async findActiveAgreementByCompanyId(companyId: string) {
    const now = new Date();
    const found = this.agreements.find(
      (a) =>
        a.companyId === companyId &&
        a.status === 'VIGENTE' &&
        !a.deletedAt &&
        new Date(a.startDate) <= now &&
        new Date(a.endDate) >= now
    );
    return found ? this.hydrate(found) : null;
  }

  async findApprovedOrActiveAgreementByCompanyId(companyId: string) {
    const now = new Date();
    const found = this.agreements.find(
      (a) =>
        a.companyId === companyId &&
        (a.status === 'APROBADO_JURIDICA' || a.status === 'VIGENTE') &&
        !a.deletedAt &&
        new Date(a.endDate) >= now
    );
    return found ? this.hydrate(found) : null;
  }

  async findByCompanyId(companyId: string) {
    return this.agreements
      .filter((a) => a.companyId === companyId && !a.deletedAt)
      .map((a) => this.hydrate(a));
  }

  async findById(agreementId: string) {
    const found = this.agreements.find((a) => a.id === agreementId && !a.deletedAt);
    return this.hydrate(found);
  }

  async findMany(params: { companyId?: string; status?: string; search?: string } = {}) {
    let list = this.agreements.filter((a) => !a.deletedAt);
    if (params.companyId) list = list.filter((a) => a.companyId === params.companyId);
    if (params.status) list = list.filter((a) => a.status === params.status);
    let hydrated = list.map((a) => this.hydrate(a));
    if (params.search) {
      const q = params.search.toLowerCase();
      hydrated = hydrated.filter(
        (a) =>
          a.agreementNumber.toLowerCase().includes(q) ||
          a.company?.businessName?.toLowerCase().includes(q)
      );
    }
    return hydrated;
  }

  async create(data: any) {
    const ag = {
      id: `ag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      companyId: data.companyId,
      agreementNumber: data.agreementNumber,
      status: data.status || 'BORRADOR',
      startDate: data.startDate,
      endDate: data.endDate,
      documentUrl: data.documentUrl ?? null,
      signedByDirector: data.signedByDirector ?? false,
      notes: data.notes ?? null,
      juridicaRadicadoNumber: null,
      juridicaApprovalDate: null,
      juridicaConceptUrl: null,
      juridicaObservations: null,
      juridicaReviewedAt: null,
      juridicaReviewedById: null,
      sentToJuridicaAt: null,
      sentToJuridicaById: null,
      juridicaHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    this.agreements.push(ag);
    return this.hydrate(ag);
  }

  async update(agreementId: string, data: Record<string, any>) {
    const ag = this.agreements.find((a) => a.id === agreementId);
    if (!ag) throw new Error('Agreement not found');
    Object.assign(ag, data, { updatedAt: new Date() });
    return this.hydrate(ag);
  }

  async findPrerequisitesByAgreementId(agreementId: string) {
    return this.prerequisites.filter((p) => p.agreementId === agreementId);
  }

  async upsertPrerequisite(data: any) {
    const existing = this.prerequisites.find(
      (p) => p.agreementId === data.agreementId && p.documentType === data.documentType
    );
    if (existing) {
      Object.assign(existing, {
        fileUrl: data.fileUrl,
        fileName: data.fileName ?? existing.fileName,
        mimeType: data.mimeType ?? existing.mimeType,
        issuedAt: data.issuedAt !== undefined ? data.issuedAt : existing.issuedAt,
        verificationStatus: data.verificationStatus || 'PENDIENTE',
        observations: data.observations !== undefined ? data.observations : null,
        uploadedById: data.uploadedById ?? existing.uploadedById,
        reviewedAt: null,
        reviewedById: null,
        updatedAt: new Date(),
      });
      return existing;
    }

    const created = {
      id: `prereq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agreementId: data.agreementId,
      documentType: data.documentType,
      fileUrl: data.fileUrl,
      fileName: data.fileName ?? null,
      mimeType: data.mimeType ?? null,
      issuedAt: data.issuedAt ?? null,
      verificationStatus: data.verificationStatus || 'PENDIENTE',
      observations: data.observations ?? null,
      uploadedById: data.uploadedById ?? null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prerequisites.push(created);
    return created;
  }

  async updatePrerequisitesVerification(params: {
    agreementId: string;
    verificationStatus: string;
    reviewedById?: string | null;
    reviewedAt?: Date | null;
    observations?: string | null;
    documentTypes?: string[];
  }) {
    const targets = this.prerequisites.filter((p) => {
      if (p.agreementId !== params.agreementId) return false;
      if (params.documentTypes && params.documentTypes.length > 0) {
        return params.documentTypes.includes(p.documentType);
      }
      return true;
    });
    for (const item of targets) {
      item.verificationStatus = params.verificationStatus;
      item.reviewedById = params.reviewedById ?? null;
      item.reviewedAt = params.reviewedAt ?? new Date();
      if (params.observations !== undefined) item.observations = params.observations;
      item.updatedAt = new Date();
    }
    return targets;
  }
}

class MockCompanyRepository extends CompanyRepository {
  constructor(public companies: any[] = []) {
    super();
  }
  async findById(id: string) {
    return this.companies.find((c) => c.id === id && !c.deletedAt) || null;
  }
}

class MockUserRepository extends UserRepository {
  constructor(public users: any[] = []) {
    super();
  }
  async findById(id: string) {
    return this.users.find((u) => u.id === id && !u.deletedAt) || null;
  }
}

class MockPracticeRepository extends PracticeRepository {
  public practices: any[] = [];
  public workPlans: any[] = [];
  public history: any[] = [];

  constructor(
    initialPractices: any[] = [],
    initialWorkPlans: any[] = [],
    private usersRef: any[] = [],
    private companiesRef: any[] = []
  ) {
    super();
    this.practices = initialPractices;
    this.workPlans = initialWorkPlans;
  }

  async findById(practiceId: string) {
    const p = this.practices.find((item) => item.id === practiceId && !item.deletedAt);
    if (!p) return null;
    return {
      ...p,
      student: this.usersRef.find((u) => u.id === p.studentId) || null,
      teacher: this.usersRef.find((u) => u.id === p.teacherId) || null,
      tutor: this.usersRef.find((u) => u.id === p.tutorId) || null,
      company: this.companiesRef.find((c) => c.id === p.companyId) || null,
      workPlan: this.workPlans.find((wp) => wp.practiceId === p.id) || null,
      statusHistory: this.history.filter((h) => h.practiceId === p.id),
    } as any;
  }

  async findWorkPlanById(id: string) {
    return this.workPlans.find((wp) => wp.id === id) || null;
  }

  async findWorkPlanByPracticeId(practiceId: string) {
    return this.workPlans.find((wp) => wp.practiceId === practiceId) || null;
  }

  async findActiveFormalizedOrInCourseByStudentAndPeriod() {
    return null;
  }

  async saveFormalizedPractice(params: any) {
    const practice = {
      id: params.practiceId || `pract_${Date.now()}`,
      studentId: params.studentId,
      companyId: params.companyId,
      teacherId: params.teacherId,
      tutorId: params.tutorId,
      directorId: params.directorId,
      currentStatus: params.targetInternalStatus,
      academicPeriod: params.academicPeriod,
      startDate: params.startDate,
      endDate: params.endDate || null,
      totalHoursRequired: params.totalHoursRequired || 320,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return {
      practice: {
        ...practice,
        company: this.companiesRef.find((c) => c.id === params.companyId),
      },
      workPlan: this.workPlans[0],
      isNew: false,
    } as any;
  }
}

// ------------------------------------------------------------------------------
// EJECUCIÓN DE PRUEBAS
// ------------------------------------------------------------------------------

async function runTests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 SIGETRAP - Suite de Pruebas: Convenios y Revisión Jurídica UFPS');
  console.log('🧪 Criterios 1, 2, 3 | Reglas de Negocio RN01, RN02, RN03 | RBAC & HTTP');
  console.log('🧪 ====================================================================\n');

  const company = {
    id: 'comp-jur-001',
    nit: '900888777-2',
    businessName: 'Ingeniería Avanzada Norte S.A.S.',
    legalRepresentative: 'Dra. Claudia Patricia Rojas',
    contactEmail: 'juridica@ingenierianorte.co',
    contactPhone: '3105551234',
    address: 'Av. Libertadores # 10-20',
    city: 'Cúcuta',
    isActive: true,
    deletedAt: null,
  };

  const coordinatorActor: AuthenticatedUser = {
    id: 'coord-ufps-01',
    email: 'coordinador.convenios@ufps.edu.co',
    name: 'Dr. Roberto Gómez (Coordinador Convenios)',
    role: 'DIRECTOR_PROGRAMA',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const companyTutorActor: AuthenticatedUser = {
    id: 'tutor-emp-01',
    email: 'enlace@ingenierianorte.co',
    name: 'Ing. Marcos Suárez',
    role: 'TUTOR_EMPRESARIAL',
    status: 'ACTIVO',
    tokenVersion: 1,
    companyId: company.id,
  };

  const studentActor: AuthenticatedUser = {
    id: 'est-ufps-01',
    email: 'estudiante@ufps.edu.co',
    name: 'Sofía Martínez',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const teacherUser = {
    id: 'doc-01',
    email: 'docente@ufps.edu.co',
    name: 'Ing. Laura Restrepo',
    role: 'DOCENTE_PRACTICA' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    deletedAt: null,
  };

  const tutorUser = {
    id: 'tut-01',
    email: 'tutor@ingenierianorte.co',
    name: 'Ing. Marcos Suárez',
    role: 'TUTOR_EMPRESARIAL' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    companyId: company.id,
    deletedAt: null,
  };

  const studentUser = {
    id: 'est-01',
    email: 'sofia@ufps.edu.co',
    name: 'Sofía Martínez',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    studentCode: '1152099',
    deletedAt: null,
  };

  const agreementRepo = new MockAgreementRepository([company]);
  const companyRepo = new MockCompanyRepository([company]);
  const userRepo = new MockUserRepository([teacherUser, tutorUser, studentUser]);
  const practiceRepo = new MockPracticeRepository(
    [
      {
        id: 'pract-jur-01',
        studentId: studentUser.id,
        companyId: company.id,
        teacherId: teacherUser.id,
        tutorId: tutorUser.id,
        currentStatus: 'ACEPTADO_ARL_PENDIENTE',
        arlSupportUrl: 'https://storage.ufps.edu.co/arl/arl-ok.pdf',
        academicPeriod: '2026-2',
        isActive: true,
        deletedAt: null,
      },
    ],
    [
      {
        id: 'wp-jur-01',
        practiceId: 'pract-jur-01',
        objectives: 'Desarrollar módulo jurídico.',
        methodology: 'Scrum',
        schedule: [],
        status: 'APROBADO_DUAL',
        tutorApproved: true,
        teacherApproved: true,
      },
    ],
    [teacherUser, tutorUser, studentUser],
    [company]
  );

  const service = new AgreementLegalService(agreementRepo, companyRepo);
  setAgreementLegalServiceInstance(service);

  const formalizationService = new PracticeFormalizationService(
    practiceRepo,
    userRepo,
    companyRepo,
    agreementRepo
  );
  const workflowService = new PracticeWorkflowService(practiceRepo, agreementRepo);

  const referenceNow = new Date('2026-11-24T12:00:00Z');

  // --------------------------------------------------------------------------
  // TEST 1: Criterio 1 - Carga de prerrequisitos y validación de formatos
  // --------------------------------------------------------------------------
  console.log('📌 Test 1 (Criterio 1): Creación en BORRADOR, validación de formato PDF/Word y carga de 2 de 3 paquetes...');
  const draftAgreement = await service.createAgreementDraft(
    {
      companyId: company.id,
      agreementNumber: 'CONV-UFPS-2026-888',
      startDate: '2026-11-01',
      endDate: '2028-11-01',
    },
    coordinatorActor
  );
  assert.equal(draftAgreement.status, 'BORRADOR');

  // Formato inválido para BORRADOR_MINUTA (.exe)
  await assert.rejects(
    async () =>
      service.uploadPrerequisites(
        draftAgreement.id,
        [
          {
            documentType: 'BORRADOR_MINUTA',
            fileUrl: 'https://files.ufps.edu.co/minuta.exe',
            fileName: 'minuta.exe',
          },
        ],
        companyTutorActor,
        referenceNow
      ),
    (err: AgreementLegalError) => err.code === 'INVALID_FILE_FORMAT' && err.statusCode === 422
  );

  // Cargar paquete 1 (Word) y paquete 2 (PDF)
  const upload1 = await service.uploadPrerequisites(
    draftAgreement.id,
    [
      {
        documentType: 'BORRADOR_MINUTA',
        fileUrl: '/uploads/convenios/minuta_diligenciada.docx',
        fileName: 'minuta_diligenciada.docx',
      },
      {
        documentType: 'REPRESENTANTE_DIRECTIVA',
        fileUrl: '/uploads/convenios/camara_y_cedula_rep.pdf',
        fileName: 'camara_y_cedula_rep.pdf',
      },
    ],
    companyTutorActor,
    referenceNow
  );
  assert.equal(upload1.agreement.prerequisites.length, 2);
  assert.equal(upload1.agreement.checklist.allRequiredUploaded, false);
  assert.deepEqual(upload1.agreement.checklist.missingDocuments, ['ANTECEDENTES_LEGALES']);
  console.log('  ✅ PASÓ (Criterio 1): Formatos validados y faltante ANTECEDENTES_LEGALES detectado.');

  // --------------------------------------------------------------------------
  // TEST 2: RN02 - Vigencia de antecedentes <= 30 días calendario
  // --------------------------------------------------------------------------
  console.log('📌 Test 2 (RN02): Bloqueo de antecedentes sin fecha o > 30 días calendario; aceptación <= 30 días...');
  await assert.rejects(
    async () =>
      service.uploadPrerequisites(
        draftAgreement.id,
        [
          {
            documentType: 'ANTECEDENTES_LEGALES',
            fileUrl: '/uploads/convenios/antecedentes.pdf',
          },
        ],
        companyTutorActor,
        referenceNow
      ),
    (err: AgreementLegalError) => err.code === 'MISSING_ISSUED_DATE' && err.statusCode === 422
  );

  // 31 días antes del 2026-11-24 -> 2026-10-24 (31 días)
  await assert.rejects(
    async () =>
      service.uploadPrerequisites(
        draftAgreement.id,
        [
          {
            documentType: 'ANTECEDENTES_LEGALES',
            fileUrl: '/uploads/convenios/antecedentes_viejos.pdf',
            issuedAt: '2026-10-24T12:00:00Z',
          },
        ],
        companyTutorActor,
        referenceNow
      ),
    (err: AgreementLegalError) => err.code === 'RN02_ANTECEDENTES_VENCIDOS' && err.statusCode === 422
  );

  // 15 días antes -> válido
  const upload3 = await service.uploadPrerequisites(
    draftAgreement.id,
    [
      {
        documentType: 'ANTECEDENTES_LEGALES',
        fileUrl: '/uploads/convenios/paquete_antecedentes_procuraduria_contraloria.pdf',
        fileName: 'paquete_antecedentes_procuraduria_contraloria.pdf',
        issuedAt: '2026-11-09T12:00:00Z',
      },
    ],
    companyTutorActor,
    referenceNow
  );
  assert.equal(upload3.agreement.checklist.allRequiredUploaded, true);
  assert.equal(upload3.agreement.checklist.antecedentesWithin30Days, true);
  assert.equal(upload3.agreement.checklist.canSendToJuridica, true);
  console.log('  ✅ PASÓ (RN02): Antecedentes con 31 días rechazados (422) y con 15 días aceptados.');

  // --------------------------------------------------------------------------
  // TEST 3: RN01 (Bloqueo anticipado antes de visto bueno) + Criterio 2
  // --------------------------------------------------------------------------
  console.log('📌 Test 3 (RN01 & Criterio 2): Bloqueo de formalización de estudiante en BORRADOR/PENDIENTE y transición a PENDIENTE_JURIDICA_UFPS...');
  await assert.rejects(
    async () =>
      formalizationService.formalizePractice(
        {
          practiceId: 'pract-jur-01',
          studentId: studentUser.id,
          companyId: company.id,
          teacherId: teacherUser.id,
          tutorId: tutorUser.id,
          workPlanStatus: 'Aprobado',
          academicPeriod: '2026-2',
        },
        coordinatorActor
      ),
    (err: PracticeFormalizationError) =>
      err.code === 'RN01_AGREEMENT_NOT_APPROVED_BY_JURIDICA' && err.statusCode === 422
  );

  // Transición a PENDIENTE_JURIDICA_UFPS (Criterio 2)
  const sentRes = await service.sendToJuridica(
    draftAgreement.id,
    { notes: 'Expediente completo remitido a Jurídica UFPS.' },
    coordinatorActor,
    referenceNow
  );
  assert.equal(sentRes.currentStatus, 'PENDIENTE_JURIDICA_UFPS');
  assert.equal(sentRes.agreement.status, 'PENDIENTE_JURIDICA_UFPS');

  // En PENDIENTE_JURIDICA_UFPS tampoco se puede formalizar estudiante (RN01)
  await assert.rejects(
    async () =>
      workflowService.transitionPracticeStatus(
        'pract-jur-01',
        {
          toStatus: 'ASIGNADO_FORMALMENTE',
          arlSupportUrl: 'https://storage.ufps.edu.co/arl/arl-ok.pdf',
        },
        coordinatorActor
      ),
    (err: BusinessRuleError) => err.code === 'RN01_AGREEMENT_NOT_ACTIVE' && err.statusCode === 422
  );
  console.log('  ✅ PASÓ (RN01 & Criterio 2): Convenio en PENDIENTE_JURIDICA_UFPS y formalización anticipada bloqueada.');

  // --------------------------------------------------------------------------
  // TEST 4: Criterio 3 & RN03 - Devolución con Observaciones obligatorias
  // --------------------------------------------------------------------------
  console.log('📌 Test 4 (Criterio 3 & RN03): Validación de radicado/observaciones obligatorias en devolución y notificación a empresa...');
  await assert.rejects(
    async () =>
      service.registerJuridicaDictamen(
        draftAgreement.id,
        {
          decision: 'DEVUELTO',
          radicadoNumber: '',
          observations: 'Falta cláusula de confidencialidad',
        },
        coordinatorActor,
        referenceNow
      ),
    (err: AgreementLegalError) => err.code === 'MISSING_RADICADO_NUMBER' && err.statusCode === 422
  );

  await assert.rejects(
    async () =>
      service.registerJuridicaDictamen(
        draftAgreement.id,
        {
          decision: 'DEVUELTO',
          radicadoNumber: 'RAD-JUR-2026-0091',
          observations: '',
        },
        coordinatorActor,
        referenceNow
      ),
    (err: AgreementLegalError) => err.code === 'MISSING_OBSERVATIONS' && err.statusCode === 422
  );

  const returnedRes = await service.registerJuridicaDictamen(
    draftAgreement.id,
    {
      decision: 'DEVUELTO',
      radicadoNumber: 'RAD-JUR-2026-0091',
      observations: 'Ajustar cláusula quinta de minuta sobre póliza de cumplimiento y actualizar certificado de Personería.',
      observedDocuments: ['BORRADOR_MINUTA', 'ANTECEDENTES_LEGALES'],
    },
    coordinatorActor,
    referenceNow
  );
  assert.equal(returnedRes.currentStatus, 'OBSERVADO_JURIDICA');
  assert.equal(returnedRes.notification?.sent, true);
  assert.equal(returnedRes.notification?.recipientEmail, company.contactEmail);
  assert.equal(returnedRes.agreement.juridicaHistory.length, 1);
  console.log('  ✅ PASÓ (Criterio 3 & RN03): Devolución registrada con radicado, fecha, observaciones y notificación a la empresa.');

  // --------------------------------------------------------------------------
  // TEST 5: Subsanación, Reenvío y Visto Bueno APROBADO_JURIDICA -> VIGENTE + RN01 habilitado
  // --------------------------------------------------------------------------
  console.log('📌 Test 5 (Criterio 3 & RN01): Subsanación, reenvío, aprobación jurídica y habilitación de formalización...');
  await service.uploadPrerequisites(
    draftAgreement.id,
    [
      {
        documentType: 'BORRADOR_MINUTA',
        fileUrl: '/uploads/convenios/minuta_corregida_v2.pdf',
        fileName: 'minuta_corregida_v2.pdf',
      },
      {
        documentType: 'ANTECEDENTES_LEGALES',
        fileUrl: '/uploads/convenios/antecedentes_actualizados_v2.pdf',
        fileName: 'antecedentes_actualizados_v2.pdf',
        issuedAt: '2026-11-20T10:00:00Z',
      },
    ],
    companyTutorActor,
    referenceNow
  );

  await service.sendToJuridica(draftAgreement.id, {}, coordinatorActor, referenceNow);

  // Aprobación sin conceptoUrl -> 422
  await assert.rejects(
    async () =>
      service.registerJuridicaDictamen(
        draftAgreement.id,
        {
          decision: 'APROBADO',
          radicadoNumber: 'RAD-JUR-2026-0115',
        },
        coordinatorActor,
        referenceNow
      ),
    (err: AgreementLegalError) => err.code === 'MISSING_CONCEPT_URL' && err.statusCode === 422
  );

  const approvedRes = await service.registerJuridicaDictamen(
    draftAgreement.id,
    {
      decision: 'APROBADO',
      radicadoNumber: 'RAD-JUR-2026-0115',
      approvalDate: '2026-11-24T15:00:00Z',
      conceptUrl: '/uploads/juridica/resolucion_favorable_0115.pdf',
      observations: 'Concepto jurídico favorable emitido sin objeciones.',
    },
    coordinatorActor,
    referenceNow
  );
  assert.equal(approvedRes.currentStatus, 'APROBADO_JURIDICA');
  assert.equal(approvedRes.agreement.juridicaRadicadoNumber, 'RAD-JUR-2026-0115');
  assert.equal(approvedRes.agreement.juridicaConceptUrl, '/uploads/juridica/resolucion_favorable_0115.pdf');
  assert.equal(approvedRes.agreement.checklist.isFormalizableForPractices, true);
  assert.equal(approvedRes.agreement.juridicaHistory.length, 2);

  // Suscripción final -> VIGENTE
  const subscribed = await service.subscribeApprovedAgreement(draftAgreement.id, coordinatorActor);
  assert.equal(subscribed.status, 'VIGENTE');
  assert.equal(subscribed.signedByDirector, true);

  // Ahora SÍ se puede formalizar el estudiante (RN01 cumplido)
  const formalized = await formalizationService.formalizePractice(
    {
      practiceId: 'pract-jur-01',
      studentId: studentUser.id,
      companyId: company.id,
      teacherId: teacherUser.id,
      tutorId: tutorUser.id,
      workPlanStatus: 'Aprobado',
      academicPeriod: '2026-2',
    },
    coordinatorActor
  );
  assert.equal(formalized.estado, 'Formalizada');
  console.log('  ✅ PASÓ (Criterio 3 & RN01): APROBADO_JURIDICA -> VIGENTE y práctica formalizada tras visto bueno.');

  // --------------------------------------------------------------------------
  // TEST 6: Endpoints HTTP REST & Control de Acceso RBAC
  // --------------------------------------------------------------------------
  console.log('📌 Test 6 (Endpoints REST & RBAC): POST /prerrequisitos, PATCH /enviar-juridica, PATCH /dictamen-juridica y RBAC...');
  const coordToken = generateToken({
    userId: coordinatorActor.id,
    email: coordinatorActor.email,
    role: coordinatorActor.role,
    name: coordinatorActor.name,
    status: 'ACTIVO',
    tokenVersion: 1,
  });
  const studentToken = generateToken({
    userId: studentActor.id,
    email: studentActor.email,
    role: studentActor.role,
    name: studentActor.name,
    status: 'ACTIVO',
    tokenVersion: 1,
  });

  // 6.1 Crear nuevo convenio vía POST /api/v1/convenios
  const reqCreate = new NextRequest('http://localhost/api/v1/convenios', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${coordToken}`,
    },
    body: JSON.stringify({
      companyId: company.id,
      agreementNumber: 'CONV-UFPS-2026-HTTP',
    }),
  });
  const resCreate = await createAgreementHandler(reqCreate);
  assert.equal(resCreate.status, 201);
  const jsonCreate = await resCreate.json();
  const httpAgreementId = jsonCreate.data.id;

  // 6.2 RBAC: Estudiante intenta cargar prerrequisitos -> 403
  const reqStudentUpload = new NextRequest(
    `http://localhost/api/v1/convenios/${httpAgreementId}/prerrequisitos`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        documentType: 'BORRADOR_MINUTA',
        fileUrl: '/uploads/convenios/minuta.pdf',
      }),
    }
  );
  const resStudentUpload = await uploadPrerequisitesHandler(reqStudentUpload, {
    params: Promise.resolve({ id: httpAgreementId }),
  });
  assert.equal(resStudentUpload.status, 403);

  // 6.3 Cargar los 3 paquetes vía POST /api/v1/convenios/[id]/prerrequisitos
  const todayIso = new Date().toISOString();
  const reqUploadBatch = new NextRequest(
    `http://localhost/api/v1/convenios/${httpAgreementId}/prerrequisitos`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${coordToken}`,
      },
      body: JSON.stringify({
        documents: [
          {
            documentType: 'BORRADOR_MINUTA',
            fileUrl: 'https://storage.ufps.edu.co/minuta.pdf',
            fileName: 'minuta.pdf',
          },
          {
            documentType: 'REPRESENTANTE_DIRECTIVA',
            fileUrl: 'https://storage.ufps.edu.co/rep_legal.pdf',
            fileName: 'rep_legal.pdf',
          },
          {
            documentType: 'ANTECEDENTES_LEGALES',
            fileUrl: 'https://storage.ufps.edu.co/antecedentes.pdf',
            fileName: 'antecedentes.pdf',
            issuedAt: todayIso,
          },
        ],
      }),
    }
  );
  const resUploadBatch = await uploadPrerequisitesHandler(reqUploadBatch, {
    params: Promise.resolve({ id: httpAgreementId }),
  });
  assert.equal(resUploadBatch.status, 201);

  // 6.4 PATCH /api/v1/convenios/[id]/enviar-juridica
  const reqEnviar = new NextRequest(
    `http://localhost/api/v1/convenios/${httpAgreementId}/enviar-juridica`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${coordToken}`,
      },
      body: JSON.stringify({ notes: 'Listo para revisión legal' }),
    }
  );
  const resEnviar = await sendToJuridicaHandler(reqEnviar, {
    params: Promise.resolve({ id: httpAgreementId }),
  });
  assert.equal(resEnviar.status, 200);
  const jsonEnviar = await resEnviar.json();
  assert.equal(jsonEnviar.data.currentStatus, 'PENDIENTE_JURIDICA_UFPS');

  // 6.5 PATCH /api/v1/convenios/[id]/dictamen-juridica -> APROBADO con activateImmediately
  const reqDictamen = new NextRequest(
    `http://localhost/api/v1/convenios/${httpAgreementId}/dictamen-juridica`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${coordToken}`,
      },
      body: JSON.stringify({
        decision: 'APROBADO',
        radicadoNumber: 'RAD-JUR-2026-HTTP-01',
        conceptUrl: 'https://storage.ufps.edu.co/concepto_favorable.pdf',
        activateImmediately: true,
      }),
    }
  );
  const resDictamen = await dictamenJuridicaHandler(reqDictamen, {
    params: Promise.resolve({ id: httpAgreementId }),
  });
  assert.equal(resDictamen.status, 200);
  const jsonDictamen = await resDictamen.json();
  assert.equal(jsonDictamen.data.currentStatus, 'VIGENTE');

  // 6.6 GET endpoints (list, detail, prerequisites, suscribir)
  const resList = await listAgreementsHandler(
    new NextRequest('http://localhost/api/v1/convenios', {
      headers: { Authorization: `Bearer ${coordToken}` },
    })
  );
  assert.equal(resList.status, 200);

  const resDetail = await getAgreementDetailHandler(
    new NextRequest(`http://localhost/api/v1/convenios/${httpAgreementId}`, {
      headers: { Authorization: `Bearer ${coordToken}` },
    }),
    { params: Promise.resolve({ id: httpAgreementId }) }
  );
  assert.equal(resDetail.status, 200);

  const resPrereqs = await getPrerequisitesHandler(
    new NextRequest(`http://localhost/api/v1/convenios/${httpAgreementId}/prerrequisitos`, {
      headers: { Authorization: `Bearer ${coordToken}` },
    }),
    { params: Promise.resolve({ id: httpAgreementId }) }
  );
  assert.equal(resPrereqs.status, 200);

  const resSuscribir = await suscribirAgreementHandler(
    new NextRequest(`http://localhost/api/v1/convenios/${httpAgreementId}/suscribir`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${coordToken}` },
    }),
    { params: Promise.resolve({ id: httpAgreementId }) }
  );
  assert.equal(resSuscribir.status, 200);

  console.log('  ✅ PASÓ (Endpoints REST & RBAC): Todos los endpoints HTTP y controles RBAC validados.');
  console.log('\n🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE CONVENIOS Y REVISIÓN JURÍDICA UFPS PASARON (6/6)');
  console.log('🎉 ====================================================================');

  setAgreementLegalServiceInstance(null);
}

runTests().catch((err) => {
  console.error('❌ FALLO EN SUITE DE CONVENIOS JURÍDICA UFPS:', err);
  process.exit(1);
});
