// ==============================================================================
// SIGETRAP - Test de Verificación HU07: Radicación de Datos Fiscales de Empresa
// Criterios de Aceptación:
//   - Criterio 1: Radicación exitosa de datos fiscales con todos los campos requeridos
//   - Criterio 2: Intercepción de violación de unicidad UNIQUE(nit) (PostgreSQL 23505 / P2002)
//   - Criterio 3: Validación de correo de contacto y campos obligatorios
//   - Criterio 4: Consulta en tiempo real de existencia de NIT (verifyNit)
//   - Criterio 5: Listado y filtrado en el directorio empresarial
//   - Criterio 6: Restricción de permisos (RBAC) para roles no autorizados
// ==============================================================================

import {
  CompanyManagementService,
  CompanyValidationError,
} from '../src/server/services/company-management.service';
import { CompanyRepository } from '../src/server/repositories/company.repository';
import { AuthenticatedUser, CreateCompanyDTO } from '../src/types';

// Mock en memoria del repositorio de empresas para pruebas unitarias deterministas
class MockCompanyRepository extends CompanyRepository {
  private companies: any[] = [];

  constructor(initialCompanies: any[] = []) {
    super();
    this.companies = [...initialCompanies];
  }

  async findByNit(nit: string) {
    const normalized = nit.trim();
    return (
      this.companies.find((c) => c.nit.trim().toLowerCase() === normalized.toLowerCase() && !c.deletedAt) ||
      null
    );
  }

  async findById(id: string) {
    return this.companies.find((c) => c.id === id && !c.deletedAt) || null;
  }

  async create(data: any) {
    // Simulación de restricción de unicidad de PostgreSQL UNIQUE(nit)
    const exists = await this.findByNit(data.nit);
    if (exists) {
      const error: any = new Error('Unique constraint failed on the fields: (`nit`)');
      error.code = '23505'; // PostgreSQL unique violation code
      throw error;
    }

    const newCompany = {
      id: `comp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      ...data,
      isActive: data.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      agreements: [],
      _count: {
        agreements: 0,
        tutors: 0,
        practices: 0,
        vacancies: 0,
      },
    };
    this.companies.push(newCompany);
    return newCompany;
  }

  async findMany(params: any) {
    let filtered = this.companies.filter((c) => !c.deletedAt);

    if (params.isActive !== undefined) {
      filtered = filtered.filter((c) => c.isActive === params.isActive);
    }

    if (params.city) {
      filtered = filtered.filter((c) =>
        c.city.toLowerCase().includes(params.city.toLowerCase())
      );
    }

    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.nit.toLowerCase().includes(s) ||
          c.businessName.toLowerCase().includes(s) ||
          c.legalRepresentative.toLowerCase().includes(s) ||
          c.contactEmail.toLowerCase().includes(s) ||
          c.city.toLowerCase().includes(s)
      );
    }

    return {
      companies: filtered,
      total: filtered.length,
    };
  }
}

async function runTests() {
  console.log('🏢 Iniciando Suite de Pruebas: HU07 - Radicación de Datos Fiscales de la Empresa Receptora\n');

  const coordinatorActor: AuthenticatedUser = {
    id: 'coord-001',
    email: 'extension@ufps.edu.co',
    name: 'Coordinador de Extensión',
    role: 'DIRECTOR_PROGRAMA',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const studentActor: AuthenticatedUser = {
    id: 'student-001',
    email: 'estudiante@ufps.edu.co',
    name: 'Estudiante Prueba',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const initialCompany = {
    id: 'comp-existing-01',
    nit: '900123456-1',
    businessName: 'OpenAI Colombia S.A.S.',
    legalRepresentative: 'Sam Altman',
    contactEmail: 'contacto@openaicolombia.com',
    contactPhone: '6013456789',
    address: 'Calle 100 # 15-20',
    city: 'Bogotá',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    agreements: [],
  };

  const mockRepo = new MockCompanyRepository([initialCompany]);
  const service = new CompanyManagementService(mockRepo);

  // --------------------------------------------------------------------------
  // TEST 1: Radicación exitosa de nueva empresa receptora
  // --------------------------------------------------------------------------
  console.log('Test 1 (Criterio Éxito): Radicación exitosa de datos fiscales de una nueva empresa...');
  const newCompanyDto: CreateCompanyDTO = {
    nit: '901987654-3',
    businessName: 'Soluciones Cloud del Oriente S.A.S.',
    legalRepresentative: 'Carlos Mendoza',
    contactEmail: 'legal@cloudoriente.co',
    contactPhone: '3109876543',
    address: 'Av. Gran Colombia # 12-40',
    city: 'Cúcuta',
  };

  const registeredCompany = await service.registerCompany(newCompanyDto, coordinatorActor);

  if (
    registeredCompany.nit === newCompanyDto.nit &&
    registeredCompany.businessName === newCompanyDto.businessName &&
    registeredCompany.isActive === true
  ) {
    console.log(`  ✅ PASÓ: Empresa '${registeredCompany.businessName}' radicada correctamente con NIT ${registeredCompany.nit}`);
  } else {
    throw new Error('❌ FALLÓ Test 1: Los datos de la empresa radicada no coinciden');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Violación de unicidad por NIT duplicado (PostgreSQL 23505 / P2002)
  // --------------------------------------------------------------------------
  console.log('\nTest 2 (Restricción UNIQUE(nit)): Intento de radicación con NIT duplicado (900123456-1)...');
  const duplicateNitDto: CreateCompanyDTO = {
    nit: '900123456-1', // Ya existe en initialCompany
    businessName: 'Otra Empresa Con Mismo NIT',
    legalRepresentative: 'Juan Pérez',
    contactEmail: 'info@otraempresa.com',
    contactPhone: '3001234567',
    address: 'Av. 5 # 10-20',
    city: 'Cúcuta',
  };

  try {
    await service.registerCompany(duplicateNitDto, coordinatorActor);
    throw new Error('❌ FALLÓ Test 2: Se esperaba excepción por NIT duplicado');
  } catch (error: any) {
    if (
      error instanceof CompanyValidationError &&
      error.code === 'NIT_ALREADY_EXISTS' &&
      error.statusCode === 409
    ) {
      console.log(`  ✅ PASÓ: Intercepción de error PostgreSQL 23505 / UNIQUE(nit) confirmada -> [${error.code}] ${error.message}`);
    } else {
      throw new Error(`❌ FALLÓ Test 2: Tipo de error inesperado -> ${error.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 3: Validación de campos obligatorios faltantes
  // --------------------------------------------------------------------------
  console.log('\nTest 3 (Validación): Rechazo por NIT faltante...');
  try {
    await service.registerCompany(
      {
        ...newCompanyDto,
        nit: '',
      },
      coordinatorActor
    );
    throw new Error('❌ FALLÓ Test 3: Se debió rechazar el registro sin NIT');
  } catch (error: any) {
    if (error instanceof CompanyValidationError && error.code === 'MISSING_NIT') {
      console.log(`  ✅ PASÓ: Validación correcta -> [${error.code}] ${error.message}`);
    } else {
      throw new Error(`❌ FALLÓ Test 3: Se esperaba MISSING_NIT pero se recibió: ${error.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 4: Validación de correo de contacto inválido
  // --------------------------------------------------------------------------
  console.log('\nTest 4 (Validación): Rechazo por correo electrónico inválido...');
  try {
    await service.registerCompany(
      {
        ...newCompanyDto,
        nit: '902555666-1',
        contactEmail: 'correo-invalido-sin-arroba',
      },
      coordinatorActor
    );
    throw new Error('❌ FALLÓ Test 4: Se debió rechazar el correo inválido');
  } catch (error: any) {
    if (error instanceof CompanyValidationError && error.code === 'INVALID_EMAIL') {
      console.log(`  ✅ PASÓ: Correo inválido rechazado -> [${error.code}] ${error.message}`);
    } else {
      throw new Error(`❌ FALLÓ Test 4: Se esperaba INVALID_EMAIL pero se recibió: ${error.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 5: Verificación de NIT en tiempo real (verifyNit)
  // --------------------------------------------------------------------------
  console.log('\nTest 5 (Tiempo Real): Consulta previa de disponibilidad de NIT...');
  const checkExisting = await service.verifyNit('900123456-1');
  const checkAvailable = await service.verifyNit('999888777-9');

  if (checkExisting.exists && checkExisting.company?.businessName === 'OpenAI Colombia S.A.S.' && !checkAvailable.exists) {
    console.log('  ✅ PASÓ: Verificación en tiempo real detecta NIT ocupado y NIT disponible con precisión.');
  } else {
    throw new Error('❌ FALLÓ Test 5: Fallo en la verificación en tiempo real de NIT');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Listado y filtrado de empresas en directorio
  // --------------------------------------------------------------------------
  console.log('\nTest 6 (Directorio): Listado y filtrado por ciudad y término de búsqueda...');
  const searchResult = await service.listCompanies({ search: 'Cloud', city: 'Cúcuta' });

  if (searchResult.items.length === 1 && searchResult.items[0].businessName.includes('Cloud')) {
    console.log(`  ✅ PASÓ: Filtrado exitoso, retornó ${searchResult.items.length} empresa(s) coincidente(s).`);
  } else {
    throw new Error('❌ FALLÓ Test 6: Fallo en el filtrado de empresas');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Restricción de permisos RBAC para estudiantes
  // --------------------------------------------------------------------------
  console.log('\nTest 7 (Seguridad RBAC): Rechazo de radicación iniciada por rol ESTUDIANTE...');
  try {
    await service.registerCompany(
      {
        ...newCompanyDto,
        nit: '903444333-2',
      },
      studentActor
    );
    throw new Error('❌ FALLÓ Test 7: Un estudiante no debe poder radicar empresas');
  } catch (error: any) {
    if (error instanceof CompanyValidationError && error.code === 'FORBIDDEN_OPERATION') {
      console.log(`  ✅ PASÓ: Acceso denegado a estudiante -> [${error.code}] ${error.message}`);
    } else {
      throw new Error(`❌ FALLÓ Test 7: Se esperaba FORBIDDEN_OPERATION pero se recibió: ${error.message}`);
    }
  }

  console.log('\n🎉 TODAS LAS PRUEBAS DE LA HU07 (RADICACIÓN DE EMPRESAS) SE EJECUTARON SATISFACTORIAMENTE.\n');
}

runTests().catch((err) => {
  console.error('❌ Error en ejecución de pruebas HU07:', err);
  process.exit(1);
});
