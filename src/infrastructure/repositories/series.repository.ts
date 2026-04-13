import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../database/db'
import { series, videos, type NarrativeThread } from '../database/schema'

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
    const results = await db
      .select({
        series,
        episodesCount: sql<number>`(SELECT count(*) FROM ${videos} WHERE ${videos.seriesId} = ${series.id} AND ${videos.status} = 'completed')`,
        maxEpisode: sql<number>`(SELECT MAX(${videos.episodeNumber}) FROM ${videos} WHERE ${videos.seriesId} = ${series.id} AND ${videos.status} = 'completed')`
      })
      .from(series)
      .where(eq(series.userId, userId))
      .orderBy(desc(series.updatedAt))

    return results.map((r) => ({
      ...r.series,
      lastEpisodeNumber: r.maxEpisode || 0 // Override with true narrative progress
    }))
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

    // Hardening: Fetch the LATEST successful video to get the most accurate state snapshot
    // This allows "time-travel" (deleting a video rewinds the saga context automatically)
    const [lastVideo] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.seriesId, id), eq(videos.status, 'completed')))
      .orderBy(desc(videos.episodeNumber))
      .limit(1)

    return {
      seriesId: s.id,
      title: s.title,
      description: s.description || '',
      globalContext: lastVideo?.globalContext || s.globalContext || s.description || '',
      previousEpisodesContext: lastVideo?.previousEpisodesContext || s.previousEpisodesContext || '',
      characterRegistry: (s.characterRegistry as Record<string, any>) || {},
      locationRegistry: (s.locationRegistry as Record<string, any>) || {},
      assetRegistry: (s.assetRegistry as Record<string, any>) || {},

      totalEpisodes: s.totalEpisodes ? Number(s.totalEpisodes) : undefined,
      lastEpisodeNumber: lastVideo?.episodeNumber || 0,
      episodeNumber: (lastVideo?.episodeNumber || 0) + 1,
      lastCliffhanger: s.lastCliffhanger ?? undefined,
      unresolvedThreads: (s.unresolvedThreads as NarrativeThread[]) || [],

      // PROJECT SEQUEL: Episode Bridging context (Video-as-Source-of-Truth)
      lastEpisodeFinalImage: (lastVideo as any)?.lastEpisodeFinalImage || s.lastEpisodeFinalImage || undefined,
      lastEpisodeFinalScene: (lastVideo as any)?.lastEpisodeFinalScene || s.lastEpisodeFinalScene || undefined,

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
      threads: (s.threads as any[]) || [],
      roadmap: s.roadmap ?? undefined,

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

  async updateNarrativeContext(id: string, data: { lastCliffhanger?: any; unresolvedThreads?: NarrativeThread[] }) {
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
      .where(and(eq(videos.seriesId, id), eq(videos.status, 'completed')))
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
