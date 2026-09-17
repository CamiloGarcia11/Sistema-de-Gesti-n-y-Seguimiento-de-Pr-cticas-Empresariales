// ==============================================================================
// SIGETRAP - Test de Verificación HU01: Registro y Habilitación de Usuarios
// Casos de Prueba:
//   - Criterio 1: Prevención de cuenta duplicada (correo y documento)
//   - Criterio 2: Desactivación de cuentas y revocación de tokens con Admin Auth
// ==============================================================================

import { UserManagementService, ValidationError } from '../src/server/services/user-management.service';
import { UserRepository } from '../src/server/repositories/user.repository';
import { AuthenticatedUser, Role, UserStatus } from '../src/types';

// Mock en memoria del repositorio de usuarios para pruebas unitarias deterministas
class MockUserRepository extends UserRepository {
  private users: any[] = [];

  constructor(initialUsers: any[] = []) {
    super();
    this.users = [...initialUsers];
  }

  async findByEmail(email: string) {
    return this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) || null;
  }

  async findByDocumentNumber(documentNumber: string) {
    return this.users.find((u) => u.documentNumber === documentNumber.trim()) || null;
  }

  async findById(id: string) {
    return this.users.find((u) => u.id === id) || null;
  }

  async create(data: any) {
    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      ...data,
      status: data.status || 'ACTIVO',
      isActive: data.isActive ?? true,
      tokenVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      company: null,
    };
    this.users.push(newUser);
    return newUser;
  }

  async deactivateUser(id: string) {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new Error('User not found');
    user.status = 'INACTIVO';
    user.isActive = false;
    user.tokenVersion = (user.tokenVersion || 1) + 1;
    user.updatedAt = new Date();
    return user;
  }

  async activateUser(id: string) {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new Error('User not found');
    user.status = 'ACTIVO';
    user.isActive = true;
    user.updatedAt = new Date();
    return user;
  }
}

async function runTests() {
  console.log('🧪 Iniciando Suite de Pruebas: HU01 - Registro y Habilitación de Usuarios\n');

  const adminActor: AuthenticatedUser = {
    id: 'admin-001',
    email: 'admin@ufps.edu.co',
    name: 'Admin Sistema',
    role: 'ADMIN',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const studentActor: AuthenticatedUser = {
    id: 'student-actor-001',
    email: 'actor@ufps.edu.co',
    name: 'Estudiante Actor',
    role: 'ESTUDIANTE',
    status: 'ACTIVO',
    tokenVersion: 1,
  };

  const existingUser = {
    id: 'user-existing-01',
    email: 'estudiante@ufps.edu.co',
    documentNumber: '1090123456',
    name: 'Carlos Estudiante Existente',
    role: 'ESTUDIANTE' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    tokenVersion: 1,
    passwordHash: 'hash123',
  };

  const mockRepo = new MockUserRepository([existingUser]);
  const service = new UserManagementService(mockRepo);

  // ----------------------------------------------------------------------------
  // PRUEBA 1: Registro Exitoso con datos válidos y no duplicados
  // ----------------------------------------------------------------------------
  console.log('Test 1: Registro exitoso de nuevo usuario...');
  const newUser = await service.registerUser(
    {
      email: 'nuevo.practicante@ufps.edu.co',
      documentNumber: '1090999888',
      name: 'Maria Fernanda Gomez',
      password: 'SecurePassword123!',
      role: 'ESTUDIANTE',
      studentCode: '1152001',
    },
    adminActor
  );

  if (newUser.email === 'nuevo.practicante@ufps.edu.co' && newUser.status === 'ACTIVO') {
    console.log('  ✅ PASÓ: Usuario registrado correctamente con estado ACTIVO.\n');
  } else {
    throw new Error('  ❌ FALLÓ: El usuario no se creó según lo esperado');
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 2 (CRITERIO 1): Prevención de cuenta duplicada por CORREO
  // ----------------------------------------------------------------------------
  console.log('Test 2 (Criterio 1): Intento de registro con correo duplicado (estudiante@ufps.edu.co)...');
  try {
    await service.registerUser(
      {
        email: 'estudiante@ufps.edu.co', // CORREO DUPLICADO
        documentNumber: '1090555444',
        name: 'Otro Usuario',
        password: 'Password123!',
        role: 'ESTUDIANTE',
      },
      adminActor
    );
    throw new Error('  ❌ FALLÓ: Se esperaba ValidationError por correo duplicado');
  } catch (error) {
    if (error instanceof ValidationError && error.code === 'EMAIL_ALREADY_EXISTS') {
      console.log(`  ✅ PASÓ (Criterio 1): Error esperado detectado -> [${error.code}] ${error.message}\n`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 3 (CRITERIO 1): Prevención de cuenta duplicada por DOCUMENTO
  // ----------------------------------------------------------------------------
  console.log('Test 3 (Criterio 1): Intento de registro con documento duplicado (1090123456)...');
  try {
    await service.registerUser(
      {
        email: 'otro.correo@ufps.edu.co',
        documentNumber: '1090123456', // DOCUMENTO DUPLICADO
        name: 'Tercer Usuario',
        password: 'Password123!',
        role: 'ESTUDIANTE',
      },
      adminActor
    );
    throw new Error('  ❌ FALLÓ: Se esperaba ValidationError por documento duplicado');
  } catch (error) {
    if (error instanceof ValidationError && error.code === 'DOCUMENT_ALREADY_EXISTS') {
      console.log(`  ✅ PASÓ (Criterio 1): Error esperado detectado -> [${error.code}] ${error.message}\n`);
    } else {
      throw error;
    }
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 4 (CRITERIO 2): Desactivación de cuenta por ADMINISTRADOR
  // ----------------------------------------------------------------------------
  console.log('Test 4 (Criterio 2): Desactivación de cuenta con sesión activa de Administrador (Admin Auth)...');
  const deactivationResult = await service.deactivateUser(existingUser.id, adminActor);

  if (
    deactivationResult.status === 'INACTIVO' &&
    deactivationResult.isActive === false
  ) {
    const updatedInDb = await mockRepo.findById(existingUser.id);
    if (updatedInDb.tokenVersion === 2) {
      console.log('  ✅ PASÓ (Criterio 2): Estado cambiado a INACTIVO y tokenVersion incrementado para revocar sesiones.\n');
    } else {
      throw new Error('  ❌ FALLÓ: tokenVersion no se incrementó para revocar sesiones');
    }
  } else {
    throw new Error('  ❌ FALLÓ: El estado no cambió a INACTIVO');
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 5 (CRITERIO 2): Desactivación rechazada si no es Administrador
  // ----------------------------------------------------------------------------
  console.log('Test 5 (Criterio 2): Intento de desactivación por un usuario sin rol ADMIN...');
  try {
    await service.deactivateUser(newUser.id, studentActor);
    throw new Error('  ❌ FALLÓ: Se esperaba error de autorización');
  } catch (error) {
    if (error instanceof ValidationError && error.code === 'ADMIN_AUTH_REQUIRED') {
      console.log(`  ✅ PASÓ: Acceso denegado a no-admin -> [${error.code}] ${error.message}\n`);
    } else {
      throw error;
    }
  }

  console.log('🎉 TODAS LAS PRUEBAS DE HU01 SE EJECUTARON SATISFACTORIAMENTE.');
}

runTests().catch((e) => {
  console.error('Error durante la ejecución de las pruebas:', e);
  process.exit(1);
});
