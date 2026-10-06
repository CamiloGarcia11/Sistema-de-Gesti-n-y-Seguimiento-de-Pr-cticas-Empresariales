import { prisma } from '@/lib/prisma';

export class StudyPlanRepository {
  async findActiveByProgram(program: string) {
    return prisma.studyPlan.findFirst({ where: { program, isActive: true } });
  }
}

export const studyPlanRepository = new StudyPlanRepository();