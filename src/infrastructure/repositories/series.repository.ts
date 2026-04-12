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
    assetRegistry?: Record<string, any>

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
        assetRegistry: data.assetRegistry || {},
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
      assetRegistry: (s.assetRegistry as Record<string, any>) || {},

      totalEpisodes: s.totalEpisodes ? Number(s.totalEpisodes) : undefined,
      lastEpisodeNumber: s.lastEpisodeNumber ? Number(s.lastEpisodeNumber) : 0,
      lastCliffhanger: s.lastCliffhanger ?? undefined,
      unresolvedThreads: (s.unresolvedThreads as string[]) || [],

      // PROJECT SEQUEL: Episode Bridging context
      lastEpisodeFinalImage: s.lastEpisodeFinalImage ?? undefined,
      lastEpisodeFinalScene: s.lastEpisodeFinalScene || undefined,

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
      plannedEpisodes: (s.plannedEpisodes as { number: number; title: string; hook: string }[]) || [],
      currentEpisodePitch: undefined as string | undefined,
      isFinalEpisode: undefined as boolean | undefined,

      // V13, V14 & V15 fields
      visualEvolution: (s.visualEvolution as Record<string, string>) || {},
      weatherState: s.weatherState ?? undefined,
      timeOfDay: s.timeOfDay ?? undefined,
      relationshipMap: (s.relationshipMap as Record<string, Record<string, string>>) || {},
      assetEvolution: (s.assetEvolution as Record<string, string>) || {},
      colorPalette: s.colorPalette ?? undefined,
      symbolicMotifs: (s.symbolicMotifs as string[]) || [],
      cameraStyle: s.cameraStyle ?? undefined,

      // V21 Recency Bias
      lastEpisodeSummary: this.getLastEpisodeSummary(s.previousEpisodesContext || '')
    }
  }

  private getLastEpisodeSummary(history: string): string | undefined {
    if (!history) return undefined
    const parts = history.split('--- Episode Summary ---')
    const lastPart = parts.at(-1)
    return lastPart ? lastPart.trim() : undefined
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

  async updateFinalBridge(id: string, data: { lastEpisodeFinalImage: string; lastEpisodeFinalScene: any }) {
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

  async updateAssetRegistry(id: string, registry: Record<string, any>) {
    const [updated] = await db
      .update(series)
      .set({
        assetRegistry: registry,
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
