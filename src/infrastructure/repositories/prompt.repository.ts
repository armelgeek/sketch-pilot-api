import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { prompts } from '@/infrastructure/database/schema/prompt.schema'
import type { Prompt, CreatePromptInput, UpdatePromptInput } from '@/domain/models/prompt.model'
import type { PromptFilters, PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'
import type { PromptType } from '@/infrastructure/database/schema/prompt.schema'

function toPrompt(row: typeof prompts.$inferSelect): Prompt {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    promptType: row.promptType as PromptType,
    videoType: row.videoType ?? undefined,
    videoGenre: row.videoGenre ?? undefined,
    template: row.template,
    variables: (row.variables as string[]) ?? [],
    language: row.language ?? undefined,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PromptRepository implements PromptRepositoryInterface {
  async findById(id: string): Promise<Prompt | null> {
    const [row] = await db.select().from(prompts).where(eq(prompts.id, id))
    return row ? toPrompt(row) : null
  }

  async findAll(filters: PromptFilters = {}): Promise<{ data: Prompt[]; total: number }> {
    const { promptType, videoType, videoGenre, language, isActive, page = 1, limit = 20 } = filters
    const offset = (page - 1) * limit

    const conditions: any[] = []
    if (promptType) conditions.push(eq(prompts.promptType, promptType))
    if (videoType !== undefined) conditions.push(eq(prompts.videoType, videoType))
    if (videoGenre !== undefined) conditions.push(eq(prompts.videoGenre, videoGenre))
    if (language !== undefined) conditions.push(eq(prompts.language, language))
    if (isActive !== undefined) conditions.push(eq(prompts.isActive, isActive))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [data, countResult] = await Promise.all([
      db.select().from(prompts).where(whereClause).orderBy(desc(prompts.updatedAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(prompts).where(whereClause),
    ])

    return {
      data: data.map(toPrompt),
      total: Number(countResult[0]?.count ?? 0),
    }
  }

  async findBestMatch(criteria: {
    promptType: PromptType
    videoType?: string
    videoGenre?: string
    language?: string
  }): Promise<Prompt | null> {
    const { promptType, videoType, videoGenre, language } = criteria

    // Fetch all active prompts of this type (small set, safe to load in memory)
    const candidates = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.promptType, promptType), eq(prompts.isActive, true)))

    if (candidates.length === 0) return null

    // Score each candidate: higher = better match
    function score(row: typeof prompts.$inferSelect): number {
      let s = 0
      if (videoType && row.videoType === videoType) s += 4
      else if (row.videoType !== null) return -1 // Mismatched videoType
      if (videoGenre && row.videoGenre === videoGenre) s += 2
      else if (row.videoGenre !== null) return -1 // Mismatched videoGenre
      if (language && row.language === language) s += 1
      else if (row.language !== null) return -1 // Mismatched language
      return s
    }

    const scored = candidates
      .map((row) => ({ row, score: score(row) }))
      .filter((x: { row: typeof prompts.$inferSelect; score: number }) => x.score >= 0)
    if (scored.length === 0) return null

    scored.sort(
      (a: { score: number }, b: { score: number }) => b.score - a.score
    )
    return toPrompt(scored[0].row)
  }

  async create(data: CreatePromptInput): Promise<Prompt> {
    const id = crypto.randomUUID()
    const now = new Date()
    await db.insert(prompts).values({
      id,
      name: data.name,
      description: data.description,
      promptType: data.promptType,
      videoType: data.videoType,
      videoGenre: data.videoGenre,
      template: data.template,
      variables: data.variables ?? [],
      language: data.language,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    const created = await this.findById(id)
    if (!created) throw new Error(`Failed to retrieve prompt after creation (id: ${id})`)
    return created
  }

  async update(id: string, data: UpdatePromptInput): Promise<Prompt | null> {
    const now = new Date()
    await db
      .update(prompts)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.promptType !== undefined && { promptType: data.promptType }),
        ...(data.videoType !== undefined && { videoType: data.videoType }),
        ...(data.videoGenre !== undefined && { videoGenre: data.videoGenre }),
        ...(data.template !== undefined && { template: data.template }),
        ...(data.variables !== undefined && { variables: data.variables }),
        ...(data.language !== undefined && { language: data.language }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedAt: now,
      })
      .where(eq(prompts.id, id))
    return this.findById(id)
  }

  async delete(id: string): Promise<boolean> {
    await db.delete(prompts).where(eq(prompts.id, id))
    return true
  }
}
