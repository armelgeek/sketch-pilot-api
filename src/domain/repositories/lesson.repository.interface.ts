import type { Lesson } from '../models/lesson.model'

export interface LessonRepositoryInterface {
  findById: (id: string) => Promise<Lesson | null>
  findAll: (pagination?: { skip: number; limit: number }) => Promise<Lesson[]>
  findByModuleId: (moduleId: string) => Promise<Lesson[]>
  findMaxOrderByModuleId: (moduleId: string) => Promise<number>
  create: (data: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Lesson>
  update: (id: string, data: Partial<Omit<Lesson, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Lesson>
  delete: (id: string) => Promise<boolean>
  count: () => Promise<number>
}
