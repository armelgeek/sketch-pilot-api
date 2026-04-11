import { and, desc, eq } from 'drizzle-orm'
import { db } from '../database/db'
import { series, videos } from '../database/schema'

export class SeriesRepository {
  async create(data: {
    id: string
    userId: string
    title: string
    description?: string
    globalContext?: string
    characterRegistry?: Record<string, any>
    locationRegistry?: Record<string, any>

    totalEpisodes?: string
    language?: string
    aspectRatio?: string
    duration?: string
    videoType?: string
    videoGenre?: string
    promptId?: string
    visualStyleModelId?: string
    audioProvider?: string
    kokoroVoicePreset?: string
    plannedEpisodes?: { number: number; title: string; hook: string }[]
  }) {
    const [result] = await db
      .insert(series)
      .values({
        ...data,
        characterRegistry: data.characterRegistry || {},
        locationRegistry: data.locationRegistry || {},
        plannedEpisodes: data.plannedEpisodes || [],
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()
    return result
  }

  async findById(id: string) {
    const [result] = await db.select().from(series).where(eq(series.id, id))
    return result || null
  }

  async findByIdAndUserId(id: string, userId: string) {
    const [result] = await db
      .select()
      .from(series)
      .where(and(eq(series.id, id), eq(series.userId, userId)))
    return result || null
  }

  async findByUserId(userId: string) {
    return await db.select().from(series).where(eq(series.userId, userId))
  }

  async update(id: string, data: any) {
    const [updated] = await db
      .update(series)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()
    return updated || null
  }

  async findLastByUserId(userId: string) {
    const [result] = await db
      .select()
      .from(series)
      .where(eq(series.userId, userId))
      .orderBy(desc(series.updatedAt))
      .limit(1)
    return result || null
  }

  /**
   * Fetches the full context required for the SeriesVideoGenerator.
   */
  async getSeriesContext(id: string) {
    const s = await this.findById(id)
    if (!s) return null

    return {
      seriesId: s.id,
      globalContext: s.globalContext || '',
      previousEpisodesContext: s.previousEpisodesContext || '',
      characterRegistry: (s.characterRegistry as Record<string, any>) || {},
      locationRegistry: (s.locationRegistry as Record<string, any>) || {},

      totalEpisodes: s.totalEpisodes ? Number(s.totalEpisodes) : undefined,
      lastEpisodeNumber: s.lastEpisodeNumber ? Number(s.lastEpisodeNumber) : 0,
      lastCliffhanger: s.lastCliffhanger ?? undefined,
      unresolvedThreads: (s.unresolvedThreads as string[]) || [],
      status: s.status ?? undefined,
      language: s.language ?? undefined,
      aspectRatio: s.aspectRatio ?? undefined,
      duration: s.duration ?? undefined,
      videoType: s.videoType ?? undefined,
      videoGenre: s.videoGenre ?? undefined,
      promptId: s.promptId ?? undefined,
      visualStyleModelId: s.visualStyleModelId ?? undefined,
      audioProvider: s.audioProvider ?? undefined,
      kokoroVoicePreset: s.kokoroVoicePreset ?? undefined,
      plannedEpisodes: (s.plannedEpisodes as { number: number; title: string; hook: string }[]) || []
    }
  }

  async updateNarrativeContext(id: string, data: { lastCliffhanger?: any; unresolvedThreads?: string[] }) {
    const [updated] = await db
      .update(series)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()
    return updated
  }

  async incrementEpisodeNumber(id: string) {
    // Find the highest episode number for this series to stay in sync
    const [lastVideo] = await db
      .select()
      .from(videos)
      .where(eq(videos.seriesId, id))
      .orderBy(desc(videos.episodeNumber))
      .limit(1)

    const nextEpisodeNumber = lastVideo?.episodeNumber || 0

    const [updated] = await db
      .update(series)
      .set({
        lastEpisodeNumber: String(nextEpisodeNumber),
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()
    return updated
  }

  async updateCharacterRegistry(id: string, registry: Record<string, any>) {
    const [updated] = await db
      .update(series)
      .set({
        characterRegistry: registry,
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()
    return updated
  }

  async updateLocationRegistry(id: string, registry: Record<string, any>) {
    const [updated] = await db
      .update(series)
      .set({
        locationRegistry: registry,
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()
    return updated
  }

  /**
   * Appends an episode summary to the series history.
   */
  async appendEpisodeSummary(id: string, summary: string) {
    const s = await this.findById(id)
    if (!s) return null

    const newHistory = s.previousEpisodesContext
      ? `${s.previousEpisodesContext}\n\n--- Episode Summary ---\n${summary}`
      : `--- Episode Summary ---\n${summary}`

    const [updated] = await db
      .update(series)
      .set({
        previousEpisodesContext: newHistory,
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()
    return updated
  }

  async delete(id: string, userId: string) {
    const [deleted] = await db
      .delete(series)
      .where(and(eq(series.id, id), eq(series.userId, userId)))
      .returning()
    return deleted || null
  }
}
