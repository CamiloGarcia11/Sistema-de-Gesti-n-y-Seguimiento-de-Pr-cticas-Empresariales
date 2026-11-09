import { TutorAssignmentRepository, TutorListFilters } from '../src/server/repositories/tutor-assignment.repository';
import { TutorAssignmentService } from '../src/server/services/tutor-assignment.service';
import { TutorAssignmentError } from '../src/server/services/tutor-assignment.errors';
import { AuthenticatedUser } from '../src/types';

class MockTutorAssignmentRepository extends TutorAssignmentRepository {
  tutors = [
    { id: 'tutor-1', name: 'Ana Docente', email: 'ana@example.com', specialty: 'Software', availableHours: 12 },
    { id: 'tutor-2', name: 'Luis Docente', email: 'luis@example.com', specialty: 'Redes', availableHours: 0 },
  ];
  practices = [
    {
      id: 'practice-1',
      student: { id: 'student-1', name: 'Estudiante Uno', studentCode: '1001' },
      company: { id: 'company-1', businessName: 'Empresa Uno' },
      currentStatus: 'ASIGNADO_FORMALMENTE' as const,
    },
  ];
  assignments: Array<{ practiceId: string; tutorId: string; assignedHours: number; assignedById: string }> = [];

  async findTutors(filters: TutorListFilters) {
    const filtered = this.tutors.filter((tutor) => {
      if (filters.specialty && !tutor.specialty?.toLowerCase().includes(filters.specialty.toLowerCase())) return false;
      if (filters.available === true && tutor.availableHours <= 0) return false;
      if (filters.available === false && tutor.availableHours > 0) return false;
      if (filters.minimumHours !== undefined && tutor.availableHours < filters.minimumHours) return false;
      return true;
    });
    const start = (filters.page - 1) * filters.limit;
    return {
      items: filtered.slice(start, start + filters.limit),
      pagination: {
        total: filtered.length,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(filtered.length / filters.limit),
      },
    };
  }

  async findUnassignedPractices() {
    return this.practices;
  }

  async assignTutor(params: {
    practiceId: string;
    tutorId: string;
    assignedById: string;
    assignedHours: number;
  }) {
    const tutor = this.tutors.find((candidate) => candidate.id === params.tutorId);
    if (!tutor || tutor.availableHours < params.assignedHours) {
      throw new TutorAssignmentError(
        'El tutor no posee capacidad horaria disponible para esta asignación.',
        'TUTOR_HOURS_UNAVAILABLE',
        400
      );
    }
    if (!this.practices.some((practice) => practice.id === params.practiceId)) {
      throw new TutorAssignmentError('La práctica indicada no existe o no está activa.', 'PRACTICE_NOT_FOUND', 404);
    }

    tutor.availableHours -= params.assignedHours;
    this.assignments.push(params);
    this.practices = this.practices.filter((practice) => practice.id !== params.practiceId);
    return { ...params, tutor: { ...tutor }, practice: { id: params.practiceId } };
  }
}

async function runTests() {
  console.log('Iniciando pruebas HU06: Asignación de carga tutorial\n');

  const director: AuthenticatedUser = {
    id: 'director-1',
    email: 'director@example.com',
    name: 'Director',
    role: 'DIRECTOR_PROGRAMA',
    status: 'ACTIVO',
    tokenVersion: 1,
  };
  const student: AuthenticatedUser = {
    ...director,
    id: 'student-user',
    role: 'ESTUDIANTE',
  };
  const repository = new MockTutorAssignmentRepository();
  const service = new TutorAssignmentService(repository);

  const filtered = await service.listTutors(
    { specialty: 'software', available: true, page: 1, limit: 10 },
    director
  );
  if (filtered.items.length !== 1 || filtered.items[0].id !== 'tutor-1' || filtered.pagination.total !== 1) {
    throw new Error('Falló el filtro combinado por especialidad y disponibilidad.');
  }
  console.log('✅ Criterio 3: filtro combinado y paginación retornan solo tutores coincidentes.');

  const assignment = await service.assignTutor(
    { practiceId: 'practice-1', tutorId: 'tutor-1', assignedHours: 8 },
    director
  );
  if (
    assignment.practiceId !== 'practice-1' ||
    repository.tutors[0].availableHours !== 4 ||
    repository.assignments.length !== 1
  ) {
    throw new Error('Falló la asignación exitosa o el descuento de horas.');
  }
  console.log('✅ Criterio 1: se registra la asignación y se descuentan las horas del docente.');

  try {
    await service.assignTutor(
      { practiceId: 'practice-1', tutorId: 'tutor-1', assignedHours: 5 },
      director
    );
    throw new Error('Se esperaba rechazar la asignación por capacidad insuficiente.');
  } catch (error) {
    if (!(error instanceof TutorAssignmentError) || error.code !== 'TUTOR_HOURS_UNAVAILABLE' || error.statusCode !== 400) {
      throw error;
    }
  }
  console.log('✅ Criterio 2: la asignación excedida devuelve error 400 por capacidad horaria.');

  try {
    await service.listTutors({ page: 1, limit: 10 }, student);
    throw new Error('Se esperaba rechazar el acceso de un estudiante.');
  } catch (error) {
    if (!(error instanceof TutorAssignmentError) || error.statusCode !== 403) throw error;
  }
  console.log('✅ RBAC: solo director o administrador consulta y asigna tutores.');
}

runTests().catch((error: unknown) => {
  console.error('❌ Fallaron las pruebas HU06:', error);
  process.exitCode = 1;
});
