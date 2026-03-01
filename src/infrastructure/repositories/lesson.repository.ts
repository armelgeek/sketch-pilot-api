import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { lessons } from '@/infrastructure/database/schema/schema'
import type { Lesson } from '@/domain/models/lesson.model'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'

export class LessonRepository implements LessonRepositoryInterface {
  async findById(id: string): Promise<Lesson | null> {
    const result = await db.query.lessons.findFirst({
      where: eq(lessons.id, id)
    })
    if (!result) return null

    return {
      id: result.id,
      title: result.title,
      content: result.content || undefined,
      order: result.order,
      moduleId: result.moduleId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async findAll(pagination?: { skip: number; limit: number }): Promise<Lesson[]> {
    const results = await db.query.lessons.findMany({
      limit: pagination?.limit,
      offset: pagination?.skip,
      orderBy: (lessons, { asc }) => [asc(lessons.order)]
    })

    return results.map((result) => ({
      id: result.id,
      title: result.title,
      content: result.content || undefined,
      order: result.order,
      moduleId: result.moduleId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }))
  }

  async findByModuleId(moduleId: string): Promise<Lesson[]> {
    const results = await db.query.lessons.findMany({
      where: eq(lessons.moduleId, moduleId),
      orderBy: (lessons, { asc }) => [asc(lessons.order)]
    })

    return results.map((result) => ({
      id: result.id,
      title: result.title,
      content: result.content || undefined,
      order: result.order,
      moduleId: result.moduleId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }))
  }

  async findMaxOrderByModuleId(moduleId: string): Promise<number> {
    const result = await db
      .select({
        maxOrder: sql<number>`COALESCE(MAX(${lessons.order}), 0)`
      })
      .from(lessons)
      .where(eq(lessons.moduleId, moduleId))

    return result[0]?.maxOrder || 0
  }
  async create(data: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lesson> {
    const now = new Date()

    const [result] = await db
      .insert(lessons)
      .values({
        id: randomUUID(),
        title: data.title,
        content: data.content || null,
        order: data.order ?? 0,
        moduleId: data.moduleId,
        createdAt: now,
        updatedAt: now
      })
      .returning()

    return {
      id: result.id,
      title: result.title,
      content: result.content || undefined,
      order: result.order,
      moduleId: result.moduleId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }
  async update(id: string, data: Partial<Omit<Lesson, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Lesson> {
    const [result] = await db
      .update(lessons)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(lessons.id, id))
      .returning()

    return {
      id: result.id,
      title: result.title,
      content: result.content || undefined,
      order: result.order,
      moduleId: result.moduleId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(lessons).where(eq(lessons.id, id))
    return result.length > 0
  }

  async count(): Promise<number> {
    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(lessons)
    return Number(result[0].count)
  }
}
