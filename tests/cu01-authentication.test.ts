// ==============================================================================
// SIGETRAP - Test de Verificación CU01: Autenticación y Sesión
// Módulo / Épica: Seguridad / Autenticación y sesión
// Caso de Uso: CU01 - Gestión de acceso y autenticación
// Criterios de Aceptación:
//   - Criterio 1: Bloqueo de usuarios inactivos (PI)
//     Dado que un usuario introduce credenciales válidas pero su cuenta está en estado 'BLOQUEADO',
//     Cuando se envía la petición POST /api/v1/auth/login/ ,
//     Entonces el servicio de autenticación deniega el acceso con código 403 Forbidden y el mensaje "cuenta deshabilitada".
//   - Pruebas adicionales de soporte:
//     * Bloqueo de usuarios con estado 'INACTIVO' (403 Forbidden y "cuenta deshabilitada")
//     * Autenticación exitosa de usuario 'ACTIVO' con emisión de JWT y claims RBAC (200 OK)
//     * Rechazo por credenciales inválidas (401 Unauthorized)
//     * Validación de campos obligatorios mediante Zod (422 Unprocessable Entity)
// ==============================================================================

import { NextRequest } from 'next/server';
import { POST as loginRouteHandler } from '../src/app/api/v1/auth/login/route';
import { authService, AuthService, AuthError } from '../src/server/services/auth.service';
import { UserRepository } from '../src/server/repositories/user.repository';
import { hashPassword, verifyToken } from '../src/lib/auth';
import { Role, UserStatus } from '../src/types';

// Mock del Repositorio de Usuarios en memoria
class MockUserRepository extends UserRepository {
  private users: any[] = [];

  constructor(initialUsers: any[] = []) {
    super();
    this.users = [...initialUsers];
  }

  async findByEmail(email: string) {
    return (
      this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) || null
    );
  }

  async findByDocumentNumber(documentNumber: string) {
    return this.users.find((u) => u.documentNumber === documentNumber.trim()) || null;
  }

  async findById(id: string) {
    return this.users.find((u) => u.id === id) || null;
  }

  addUser(user: any) {
    this.users.push(user);
  }
}

async function runTests() {
  console.log('🧪 ====================================================================');
  console.log('🧪 Iniciando Suite de Pruebas: CU01 - Gestión de Acceso y Autenticación');
  console.log('🧪 Módulo: Seguridad / Autenticación y sesión');
  console.log('🧪 ====================================================================\n');

  const plainPassword = 'Password123!';
  const hashedPassword = await hashPassword(plainPassword);

  // 1. Usuario BLOQUEADO (Caso de prueba Criterio 1)
  const blockedUser = {
    id: 'usr-blocked-001',
    email: 'usuario.bloqueado@ufps.edu.co',
    passwordHash: hashedPassword,
    name: 'Usuario Bloqueado Prueba',
    documentType: 'CC',
    documentNumber: '1090000001',
    phone: '3001112233',
    role: 'ESTUDIANTE' as Role,
    status: 'BLOQUEADO' as UserStatus,
    isActive: false,
    tokenVersion: 1,
    studentCode: '1152999',
    program: 'Ingeniería de Sistemas',
    companyId: null,
    company: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 2. Usuario INACTIVO
  const inactiveUser = {
    id: 'usr-inactive-002',
    email: 'usuario.inactivo@ufps.edu.co',
    passwordHash: hashedPassword,
    name: 'Usuario Inactivo Prueba',
    documentType: 'CC',
    documentNumber: '1090000002',
    phone: '3001112234',
    role: 'DOCENTE_PRACTICA' as Role,
    status: 'INACTIVO' as UserStatus,
    isActive: false,
    tokenVersion: 1,
    studentCode: null,
    program: 'Ingeniería de Sistemas',
    companyId: null,
    company: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 3. Usuario ACTIVO
  const activeUser = {
    id: 'usr-active-003',
    email: 'usuario.activo@ufps.edu.co',
    passwordHash: hashedPassword,
    name: 'Carlos Activo Gómez',
    documentType: 'CC',
    documentNumber: '1090000003',
    phone: '3001112235',
    role: 'ADMIN' as Role,
    status: 'ACTIVO' as UserStatus,
    isActive: true,
    tokenVersion: 1,
    studentCode: null,
    program: 'Ingeniería de Sistemas',
    companyId: null,
    company: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepo = new MockUserRepository([blockedUser, inactiveUser, activeUser]);

  // Configurar AuthService con el mock repository
  authService.setRepository(mockRepo);

  // ----------------------------------------------------------------------------
  // PRUEBA 1 (CRITERIO 1 - PI): Bloqueo de usuarios con cuenta 'BLOQUEADO'
  // ----------------------------------------------------------------------------
  console.log('📌 Test 1 (CRITERIO 1 - PI): Bloqueo de usuario con credenciales válidas y estado "BLOQUEADO" en POST /api/v1/auth/login/');
  {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'usuario.bloqueado@ufps.edu.co',
        password: plainPassword,
      }),
    });

    const res = await loginRouteHandler(req);
    const data = await res.json();

    console.log(`   -> HTTP Status recibido: ${res.status}`);
    console.log(`   -> Respuesta JSON: ${JSON.stringify(data)}`);

    const hasAccountDisabledMessage =
      data.message === 'cuenta deshabilitada' ||
      data.error?.message === 'cuenta deshabilitada';

    if (res.status === 403 && hasAccountDisabledMessage) {
      console.log('   ✅ PASÓ: Acceso denegado con código 403 Forbidden y mensaje "cuenta deshabilitada".\n');
    } else {
      throw new Error(
        `   ❌ FALLÓ: Se esperaba status 403 con mensaje "cuenta deshabilitada", recibido status ${res.status} y body: ${JSON.stringify(data)}`
      );
    }
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 2: Bloqueo de usuarios con estado 'INACTIVO' en POST /api/v1/auth/login/
  // ----------------------------------------------------------------------------
  console.log('📌 Test 2: Bloqueo de usuario con estado "INACTIVO" en POST /api/v1/auth/login/');
  {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'usuario.inactivo@ufps.edu.co',
        password: plainPassword,
      }),
    });

    const res = await loginRouteHandler(req);
    const data = await res.json();

    const hasAccountDisabledMessage =
      data.message === 'cuenta deshabilitada' ||
      data.error?.message === 'cuenta deshabilitada';

    if (res.status === 403 && hasAccountDisabledMessage) {
      console.log('   ✅ PASÓ: Acceso denegado con código 403 Forbidden y mensaje "cuenta deshabilitada".\n');
    } else {
      throw new Error(
        `   ❌ FALLÓ: Se esperaba status 403 con mensaje "cuenta deshabilitada", recibido status ${res.status}`
      );
    }
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 3: Autenticación exitosa de usuario 'ACTIVO' con Token JWT y RBAC
  // ----------------------------------------------------------------------------
  console.log('📌 Test 3: Autenticación exitosa de usuario "ACTIVO" con JWT y datos de sesión');
  {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'usuario.activo@ufps.edu.co',
        password: plainPassword,
      }),
    });

    const res = await loginRouteHandler(req);
    const data = await res.json();

    if (res.status !== 200 || !data.success || !data.data?.token) {
      throw new Error(`   ❌ FALLÓ: No se autenticó correctamente el usuario activo: ${JSON.stringify(data)}`);
    }

    // Verificar token JWT firmado
    const decoded = verifyToken(data.data.token);
    if (!decoded || decoded.userId !== activeUser.id || decoded.role !== 'ADMIN') {
      throw new Error('   ❌ FALLÓ: El token JWT no contiene los claims o rol esperado');
    }

    console.log(`   -> Token emitido: ${data.data.token.substring(0, 25)}...`);
    console.log(`   -> Rol en JWT: ${decoded.role}`);
    console.log('   ✅ PASÓ: Autenticación exitosa con código 200 OK y token válido emitido.\n');
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 4: Credenciales erróneas (Contraseña incorrecta)
  // ----------------------------------------------------------------------------
  console.log('📌 Test 4: Rechazo por contraseña incorrecta (401 Unauthorized)');
  {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'usuario.activo@ufps.edu.co',
        password: 'WrongPassword!',
      }),
    });

    const res = await loginRouteHandler(req);
    const data = await res.json();

    if (res.status === 401 && data.error?.code === 'INVALID_CREDENTIALS') {
      console.log('   ✅ PASÓ: Rechazo correcto con código 401 Unauthorized.\n');
    } else {
      throw new Error(`   ❌ FALLÓ: Se esperaba status 401, recibido ${res.status}`);
    }
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 5: Correo no registrado
  // ----------------------------------------------------------------------------
  console.log('📌 Test 5: Rechazo por correo inexistente (401 Unauthorized)');
  {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'no.existe@ufps.edu.co',
        password: plainPassword,
      }),
    });

    const res = await loginRouteHandler(req);
    const data = await res.json();

    if (res.status === 401 && data.error?.code === 'INVALID_CREDENTIALS') {
      console.log('   ✅ PASÓ: Rechazo correcto con código 401 Unauthorized.\n');
    } else {
      throw new Error(`   ❌ FALLÓ: Se esperaba status 401, recibido ${res.status}`);
    }
  }

  // ----------------------------------------------------------------------------
  // PRUEBA 6: Validación de esquema (Payload incompleto)
  // ----------------------------------------------------------------------------
  console.log('📌 Test 6: Rechazo por datos incompletos (422 Unprocessable Entity)');
  {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'formato-invalido',
      }),
    });

    const res = await loginRouteHandler(req);
    const data = await res.json();

    if (res.status === 422 && data.error?.code === 'VALIDATION_ERROR') {
      console.log('   ✅ PASÓ: Validación Zod correcta con código 422 Unprocessable Entity.\n');
    } else {
      throw new Error(`   ❌ FALLÓ: Se esperaba status 422, recibido ${res.status}`);
    }
  }

  console.log('🎉 ====================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE CU01 (INCLUYENDO CRITERIO 1) PASARON CON ÉXITO');
  console.log('🎉 ====================================================================');
}

runTests().catch((e) => {
  console.error('Error durante la ejecución de las pruebas CU01:', e);
  process.exit(1);
});
