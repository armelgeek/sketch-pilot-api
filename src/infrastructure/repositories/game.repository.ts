import { and, eq, ilike, sql } from 'drizzle-orm'
import { ExtractionStatus } from '@/domain/enums/extraction-status.enum'
import { db } from '@/infrastructure/database/db'
import { gamePrerequisites, games, lessons, modules } from '@/infrastructure/database/schema/schema'
import type { Game } from '@/domain/models/game.model'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'

export class GameRepository implements GameRepositoryInterface {
  async findById(id: string): Promise<Game | null> {
    const result = await db.query.games.findFirst({
      where: eq(games.id, id)
    })
    if (!result) return null

    return {
      id: result.id,
      title: result.title,
      file: result.file || undefined,
      coverUrl: result.coverUrl || undefined,
      lessonId: result.lessonId,
      position: result.position ?? 0,
      extractionStatus: (result.extractionStatus as ExtractionStatus) || ExtractionStatus.PENDING,
      extractionError: result.extractionError || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async findAll(pagination?: { skip: number; limit: number }): Promise<Game[]> {
    const results = await db.query.games.findMany({
      limit: pagination?.limit,
      offset: pagination?.skip,
      orderBy: (games, { desc }) => [desc(games.createdAt)]
    })

    return results.map((result) => ({
      id: result.id,
      title: result.title,
      file: result.file || undefined,
      coverUrl: result.coverUrl || undefined,
      lessonId: result.lessonId,
      position: result.position ?? 0,
      extractionStatus: (result.extractionStatus as ExtractionStatus) || ExtractionStatus.PENDING,
      extractionError: result.extractionError || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }))
  }

  async findByLessonId(lessonId: string): Promise<Game[]> {
    const results = await db.query.games.findMany({
      where: eq(games.lessonId, lessonId),
      orderBy: (games, { asc }) => [asc(games.position)]
    })

    return results.map((result) => ({
      id: result.id,
      title: result.title,
      file: result.file || undefined,
      coverUrl: result.coverUrl || undefined,
      lessonId: result.lessonId,
      position: result.position ?? 0,
      extractionStatus: (result.extractionStatus as ExtractionStatus) || ExtractionStatus.PENDING,
      extractionError: result.extractionError || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }))
  }

  async findPrerequisites(gameId: string): Promise<Game[]> {
    const results = await db
      .select({
        id: games.id,
        title: games.title,
        file: games.file,
        coverUrl: games.coverUrl,
        lessonId: games.lessonId,
        position: games.position,
        extractionStatus: games.extractionStatus,
        extractionError: games.extractionError,
        createdAt: games.createdAt,
        updatedAt: games.updatedAt
      })
      .from(games)
      .innerJoin(gamePrerequisites, eq(games.id, gamePrerequisites.prerequisiteGameId))
      .where(eq(gamePrerequisites.gameId, gameId))

    return results.map((result) => ({
      id: result.id,
      title: result.title,
      file: result.file || undefined,
      coverUrl: result.coverUrl || undefined,
      lessonId: result.lessonId,
      position: result.position ?? 0,
      extractionStatus: (result.extractionStatus as ExtractionStatus) || ExtractionStatus.PENDING,
      extractionError: result.extractionError || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }))
  }

  async addPrerequisite(gameId: string, prerequisiteGameId: string): Promise<void> {
    await db
      .insert(gamePrerequisites)
      .values({
        gameId,
        prerequisiteGameId
      })
      .onConflictDoNothing()
  }

  async removePrerequisite(gameId: string, prerequisiteGameId: string): Promise<void> {
    await db
      .delete(gamePrerequisites)
      .where(and(eq(gamePrerequisites.gameId, gameId), eq(gamePrerequisites.prerequisiteGameId, prerequisiteGameId)))
  }

  async create(data: Omit<Game, 'id' | 'createdAt' | 'updatedAt'>): Promise<Game> {
    const id = crypto.randomUUID()
    const now = new Date()

    const [result] = await db
      .insert(games)
      .values({
        id,
        title: data.title,
        file: data.file || null,
        coverUrl: data.coverUrl || null,
        lessonId: data.lessonId,
        createdAt: now,
        updatedAt: now
      })
      .returning()

    return {
      id: result.id,
      title: result.title,
      file: result.file || undefined,
      coverUrl: result.coverUrl || undefined,
      lessonId: result.lessonId,
      position: result.position ?? 0,
      extractionStatus: (result.extractionStatus as ExtractionStatus) || ExtractionStatus.PENDING,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async update(id: string, data: Partial<Omit<Game, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Game> {
    const [result] = await db
      .update(games)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(games.id, id))
      .returning()

    return {
      id: result.id,
      title: result.title,
      file: result.file || undefined,
      coverUrl: result.coverUrl || undefined,
      position: result.position ?? 0,
      extractionStatus: (result.extractionStatus as ExtractionStatus) || ExtractionStatus.PENDING,
      lessonId: result.lessonId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(games).where(eq(games.id, id))
    return result.length > 0
  }

  async count(): Promise<number> {
    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(games)
    return Number(result[0].count)
  }

  async findWithSearch(
    search?: string,
    pagination?: { skip: number; limit: number }
  ): Promise<
    Array<
      Game & {
        lessonTitle: string
        lessonOrder: number
        moduleId: string
        moduleTitle: string
        moduleDescription: string | null
      }
    >
  > {
    let whereCondition = undefined

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      whereCondition = ilike(games.title, searchTerm)
    }

    const query = db
      .select({
        id: games.id,
        title: games.title,
        file: games.file,
        coverUrl: games.coverUrl,
        lessonId: games.lessonId,
        position: games.position,
        extractionStatus: games.extractionStatus,
        extractionError: games.extractionError,
        createdAt: games.createdAt,
        updatedAt: games.updatedAt,
        lessonTitle: lessons.title,
        lessonOrder: lessons.order,
        moduleId: modules.id,
        moduleTitle: modules.name,
        moduleDescription: modules.description
      })
      .from(games)
      .innerJoin(lessons, eq(games.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .orderBy(games.createdAt)

    if (whereCondition) {
      query.where(whereCondition)
    }

    if (pagination?.limit) {
      query.limit(pagination.limit)
    }

    if (pagination?.skip) {
      query.offset(pagination.skip)
    }

    const results = await query

    return results.map((result) => ({
      id: result.id,
      title: result.title,
      file: result.file || undefined,
      coverUrl: result.coverUrl || undefined,
      lessonId: result.lessonId,
      position: result.position ?? 0,
      extractionStatus: (result.extractionStatus as ExtractionStatus) || ExtractionStatus.PENDING,
      extractionError: result.extractionError || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      lessonTitle: result.lessonTitle,
      lessonOrder: result.lessonOrder,
      moduleId: result.moduleId,
      moduleTitle: result.moduleTitle,
      moduleDescription: result.moduleDescription
    }))
  }

  async countWithSearch(search?: string): Promise<number> {
    let whereCondition = undefined

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      whereCondition = ilike(games.title, searchTerm)
    }

    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(games)
      .where(whereCondition)

    return Number(result[0].count)
  }

  async updateGamesOrder(lessonId: string, orderedGameIds: string[]): Promise<void> {
    let position = 0
    for (const gameId of orderedGameIds) {
      await db
        .update(games)
        .set({ position })
        .where(and(eq(games.id, gameId), eq(games.lessonId, lessonId)))
      position++
    }
  }
}
