import * as crypto from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { prompts } from '@/infrastructure/database/schema/prompt.schema'
import type { CreatePromptInput, Prompt, UpdatePromptInput } from '@/domain/models/prompt.model'
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'

export const DEFAULT_SCRIPT_OUTPUT_FORMAT = {
  titles: ['Title 1', 'Title 2', 'Title 3'],
  fullNarration: 'String - The complete unbroken text of the video.',
  topic: 'String',
  audience: 'String',
  characterSheets: [
    {
      id: 'CHAR-01',
      name: 'Name',
      role: 'Role',
      metadata: { gender: 'male|female|unknown', age: 'child|youth|senior|unknown' },
      appearance: {
        description: 'Base style',
        clothing: 'Specific clothing...',
        accessories: ['Distinguishing items'],
        colorPalette: ['#HEX1', '#HEX2'],
        uniqueIdentifiers: ['Specific trait 1', 'Specific trait 2']
      },
      expressions: ['Happy', 'Sad', 'Neutral'],
      imagePrompt: 'Consistent visual reference prompt'
    }
  ],
  scenes: [
    {
      sceneNumber: 'Integer',
      locationId: 'String - Identifier to reuse locations across scenes',
      timeRange: { start: 'Float', end: 'Float' },
      duration: 'Float',
      timestamp: 'Float',
      summary: 'String',
      narration: 'String',
      actions: ['String'],
      expression: 'String',
      characterIds: ['String'],
      speakingCharacterId: 'String',
      speechBubble: 'String',
      mood: 'String',
      cameraType: 'String',
      framing: 'String',
      background: 'String - Explicit background description including weather and time-of-day',
      lighting: 'String - Explicit lighting description (e.g., morning sun, neon, soft)',
      props: ['String - Relevant props for this scene to track logically'],
      imagePrompt: '[action/metaphor]',
      animationPrompt: '...',
      transitionToNext: 'fade | slide-left | zoom-in | wipe | swish',
      tension: 5,
      characterVariant: 'Optional character skin name',
      continueFromPrevious: false,
      visualSource: 'local',
      poseId: 'NONE | STAND | WALK | RUN | TYPE | EXHAUSTED | ...',
      poseStyle: {
        position: 'left | center | right | custom',
        x: 50,
        y: 50,
        scale: 1
      },
      onscreenText: 'The primary large overlay text',
      onscreenTextSuggestions: [
        'Concise version',
        'Action-oriented version',
        'Question-based version',
        'Keyword-heavy version'
      ],
      onscreenTextStyle: {
        enabled: true,
        color: '#000000',
        fontFamily: 'sans-serif',
        fontSize: 58,
        fontWeight: 'bold',
        maxWordsPerLine: 6,
        highlightWords: [{ word: 'specificword', color: '#FF0000' }]
      },
      anchorDetail: 'String',
      soundEffects: [{ type: 'pop | whoosh | swish | ding | jump', timestamp: 1.5, volume: 0.8 }],
      soundscape: 'String'
    }
  ]
}

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
    outputFormat: JSON.stringify(DEFAULT_SCRIPT_OUTPUT_FORMAT, null, 2),
    instructions: config.instructions || [],
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
        tags: config.tags || [],
        outputFormat: JSON.stringify(DEFAULT_SCRIPT_OUTPUT_FORMAT, null, 2)
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
        ...(Object.keys(config).length > 0 && {
          config: {
            ...config,
            category: config.category,
            tags: config.tags || (existing.config as any)?.tags || [],
            outputFormat: JSON.stringify(DEFAULT_SCRIPT_OUTPUT_FORMAT, null, 2)
          },
          name: config.name
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
