import * as crypto from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { prompts } from '@/infrastructure/database/schema/prompt.schema'
import type { CreatePromptInput, Prompt, UpdatePromptInput } from '@/domain/models/prompt.model'
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'

function toPrompt(row: typeof prompts.$inferSelect): Prompt {
  const config = (row.config as any) || {}
  return {
    id: row.id,
    name: config.name || row.name,
    description: row.description ?? undefined,
    isActive: row.isActive,
    category: config.category,
    tags: config.tags || [],
    role: config.role,
    context: config.context,
    audienceDefault: config.audienceDefault,
    task: config.task,
    goals: config.goals || [],
    structure: config.structure,
    rules: config.rules || [],
    formatting: config.formatting,
    instructions: config.instructions || [],

    // NEW: Advanced Studio Specs
    assetSystemInstruction: config.assetSystemInstruction,
    assetPromptTemplate: config.assetPromptTemplate,
    wordsPerSecondBase: config.wordsPerSecondBase,
    wordsPerSecondFactors: config.wordsPerSecondFactors,
    defaultBackgroundPrompt: config.defaultBackgroundPrompt,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export class PromptRepository implements PromptRepositoryInterface {
  async findById(id: string): Promise<Prompt | null> {
    const [row] = await db.select().from(prompts).where(eq(prompts.id, id))
    return row ? toPrompt(row) : null
  }

  async findAll(filters: any = {}): Promise<{ data: Prompt[]; total: number }> {
    const { isActive, page = 1, limit = 20 } = filters
    const offset = (page - 1) * limit

    const conditions: any[] = []
    if (isActive !== undefined) conditions.push(eq(prompts.isActive, isActive))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [data, countResult] = await Promise.all([
      db.select().from(prompts).where(whereClause).orderBy(desc(prompts.updatedAt)).limit(limit).offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(prompts)
        .where(whereClause)
    ])

    return {
      data: data.map(toPrompt),
      total: Number(countResult[0]?.count ?? 0)
    }
  }

  async findBestMatch(criteria: { id?: string; name?: string }): Promise<Prompt | null> {
    const { id, name } = criteria

    if (id) {
      return this.findById(id)
    }

    // Fetch all active prompts
    const candidates = await db.select().from(prompts).where(eq(prompts.isActive, true))

    if (candidates.length === 0) return null

    // For now, if name is provided, find by name, otherwise take the first one (Rebuild Narrative System)
    if (name) {
      const match = candidates.find((c) => c.name === name)
      return match ? toPrompt(match) : toPrompt(candidates[0])
    }

    return toPrompt(candidates[0])
  }

  async create(data: CreatePromptInput): Promise<Prompt> {
    const id = crypto.randomUUID()
    const now = new Date()

    // Flattened data into config for DB storage, while keeping metadata columns
    const { id: _, isActive, description, createdAt, updatedAt, ...config } = data as any

    await db.insert(prompts).values({
      id,
      name: config.name,
      description,
      config: {
        ...config,
        category: config.category,
        tags: config.tags || []
      },
      isActive: isActive ?? true,
      createdAt: now,
      updatedAt: now
    })
    const created = await this.findById(id)
    if (!created) throw new Error(`Failed to retrieve prompt after creation (id: ${id})`)
    return created
  }

  async update(id: string, data: UpdatePromptInput): Promise<Prompt | null> {
    const [existing] = await db.select().from(prompts).where(eq(prompts.id, id))
    if (!existing) return null

    const now = new Date()
    const { isActive, description, ...inputConfig } = data as any

    const config = {
      ...(existing.config as any),
      ...inputConfig
    }

    await db
      .update(prompts)
      .set({
        ...(description !== undefined && { description }),
        ...(Object.keys(inputConfig).length > 0 && {
          config: {
            ...config,
            category: config.category,
            tags: config.tags || (existing.config as any)?.tags || []
          },
          name: config.name || (existing.config as any).name
        }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: now
      })
      .where(eq(prompts.id, id))
    return this.findById(id)
  }

  async delete(id: string): Promise<boolean> {
    await db.delete(prompts).where(eq(prompts.id, id))
    return true
  }
}
