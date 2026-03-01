import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { games, lessons, modules } from '@/infrastructure/database/schema/schema'
import type { Module } from '@/domain/models/module.model'
import type { ModuleRepositoryInterface } from '@/domain/repositories/module.repository.interface'

export class ModuleRepository implements ModuleRepositoryInterface {
  async findById(id: string): Promise<Module | null> {
    const result = await db.query.modules.findFirst({
      where: eq(modules.id, id)
    })
    if (!result) return null

    return {
      id: result.id,
      name: result.name,
      coverUrl: result.coverUrl || undefined,
      description: result.description || undefined,
      position: result.position ?? 0,
      isActive: result.isActive,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async findAll(pagination?: { skip: number; limit: number }): Promise<Module[]> {
    const results = await db.query.modules.findMany({
      limit: pagination?.limit,
      offset: pagination?.skip,
      orderBy: (modules, { asc }) => [asc(modules.position)]
    })

    return results.map((result) => ({
      id: result.id,
      name: result.name,
      coverUrl: result.coverUrl || undefined,
      description: result.description || undefined,
      position: result.position ?? 0,
      isActive: result.isActive,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }))
  }

  async findWithSearch(search?: string, pagination?: { skip: number; limit: number }): Promise<Module[]> {
    let whereCondition
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      const searchCondition = or(ilike(modules.name, searchTerm), ilike(modules.description, searchTerm))
      whereCondition = searchCondition
    }

    const results = await db.query.modules.findMany({
      where: whereCondition,
      limit: pagination?.limit,
      offset: pagination?.skip,
      orderBy: (modules, { asc }) => [asc(modules.position)]
    })

    return results.map((result) => ({
      id: result.id,
      name: result.name,
      coverUrl: result.coverUrl || undefined,
      description: result.description || undefined,
      position: result.position ?? 0,
      isActive: result.isActive,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }))
  }

  async create(data: Omit<Module, 'id' | 'createdAt' | 'updatedAt'>): Promise<Module> {
    const id = crypto.randomUUID()
    const now = new Date()

    // Récupère la position max existante pour placer le nouveau module à la fin
    const maxResult = await db.select({ max: sql`COALESCE(MAX(position), 0)` }).from(modules)
    const nextPosition = Number(maxResult[0].max) + 1

    const [result] = await db
      .insert(modules)
      .values({
        id,
        name: data.name,
        coverUrl: data.coverUrl || null,
        description: data.description || null,
        isActive: data.isActive,
        position: nextPosition,
        createdAt: now,
        updatedAt: now
      })
      .returning()

    return {
      id: result.id,
      name: result.name,
      coverUrl: result.coverUrl || undefined,
      description: result.description || undefined,
      isActive: result.isActive,
      position: result.position,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async update(id: string, data: Partial<Omit<Module, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Module> {
    const [result] = await db
      .update(modules)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(modules.id, id))
      .returning()

    return {
      id: result.id,
      name: result.name,
      coverUrl: result.coverUrl || undefined,
      description: result.description || undefined,
      position: result.position ?? 0,
      isActive: result.isActive,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async delete(id: string): Promise<boolean> {
    // Supprimer d'abord les lessons liées (cascade explicite)
    // Récupérer les lessons liés au module
    const lessonRows = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.moduleId, id))
    for (const lesson of lessonRows) {
      await db.delete(games).where(eq(games.lessonId, lesson.id))
    }
    await db.delete(lessons).where(eq(lessons.moduleId, id))
    // Puis supprimer le module
    const result = await db.delete(modules).where(eq(modules.id, id))
    return result.length > 0
  }

  async updateStatus(id: string, isActive: boolean): Promise<Module> {
    const [result] = await db
      .update(modules)
      .set({
        isActive,
        updatedAt: new Date()
      })
      .where(eq(modules.id, id))
      .returning()

    return {
      id: result.id,
      name: result.name,
      coverUrl: result.coverUrl || undefined,
      description: result.description || undefined,
      position: result.position ?? 0,
      isActive: result.isActive,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }
  }

  async count(): Promise<number> {
    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(modules)
    return Number(result[0].count)
  }

  async countActive(): Promise<number> {
    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(modules)
      .where(eq(modules.isActive, true))
    return Number(result[0].count)
  }

  async countWithSearch(search?: string): Promise<number> {
    let whereCondition

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      const searchCondition = or(ilike(modules.name, searchTerm), ilike(modules.description, searchTerm))
      whereCondition = searchCondition
    }

    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(modules)
      .where(whereCondition)

    return Number(result[0].count)
  }

  async findWithSearchWithActiveStatus(
    search?: string,
    isActive?: boolean,
    pagination?: { skip: number; limit: number }
  ): Promise<Module[]> {
    const whereConditions = []

    // Ajouter la condition de recherche si fournie
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      const searchCondition = or(ilike(modules.name, searchTerm), ilike(modules.description, searchTerm))
      whereConditions.push(searchCondition)
    }

    // Ajouter la condition de statut actif si fournie
    if (isActive !== undefined) {
      whereConditions.push(eq(modules.isActive, isActive))
    }

    // Combiner les conditions avec AND
    const whereCondition = whereConditions.length > 0 ? and(...whereConditions) : undefined

    const results = await db.query.modules.findMany({
      where: whereCondition,
      limit: pagination?.limit,
      offset: pagination?.skip,
      orderBy: (modules, { asc }) => [asc(modules.position)]
    })

    return results.map((result) => ({
      id: result.id,
      name: result.name,
      coverUrl: result.coverUrl || undefined,
      description: result.description || undefined,
      position: result.position ?? 0,
      isActive: result.isActive,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    }))
  }

  async countWithSearchWithActiveStatus(search?: string, isActive?: boolean): Promise<number> {
    const whereConditions = []

    // Ajouter la condition de recherche si fournie
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      const searchCondition = or(ilike(modules.name, searchTerm), ilike(modules.description, searchTerm))
      whereConditions.push(searchCondition)
    }

    // Ajouter la condition de statut actif si fournie
    if (isActive !== undefined) {
      whereConditions.push(eq(modules.isActive, isActive))
    }

    // Combiner les conditions avec AND
    const whereCondition = whereConditions.length > 0 ? and(...whereConditions) : undefined

    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(modules)
      .where(whereCondition)

    return Number(result[0].count)
  }

  /**
   * Met à jour la position d'un module.
   * @param id ID du module
   * @param position Nouvelle position (entier)
   */
  async updatePosition(id: string, position: number): Promise<void> {
    await db.update(modules).set({ position, updatedAt: new Date() }).where(eq(modules.id, id))
  }
}
