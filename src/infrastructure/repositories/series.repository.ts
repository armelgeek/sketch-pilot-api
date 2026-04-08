import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '../database/db'
import { series, videos } from '../database/schema'

export class SeriesRepository {
  async create(data: {
    id: string
    userId: string
    title: string
    description?: string
    characterModelId?: string
    promptId?: string
    fullStory?: string
    totalEpisodes?: number
    secondaryCharacterIds?: string[]
  }) {
    const [created] = await db
      .insert(series)
      .values({
        id: data.id,
        userId: data.userId,
        title: data.title,
        description: data.description,
        characterModelId: data.characterModelId,
        promptId: data.promptId,
        fullStory: data.fullStory,
        totalEpisodes: data.totalEpisodes,
        secondaryCharacterIds: data.secondaryCharacterIds,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()
    return created
  }

  async findById(id: string) {
    const [found] = await db.select().from(series).where(eq(series.id, id))
    return found || null
  }

  async findByIdAndUserId(id: string, userId: string) {
    const [found] = await db
      .select()
      .from(series)
      .where(and(eq(series.id, id), eq(series.userId, userId)))
    return found || null
  }

  async listByUser(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit
    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(series)
        .where(eq(series.userId, userId))
        .orderBy(desc(series.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(series)
        .where(eq(series.userId, userId))
    ])
    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit
    }
  }

  async update(
    id: string,
    userId: string,
    data: {
      title?: string
      description?: string
      characterModelId?: string
      promptId?: string
      fullStory?: string
      totalEpisodes?: number
      secondaryCharacterIds?: string[]
    }
  ) {
    const [updated] = await db
      .update(series)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(series.id, id), eq(series.userId, userId)))
      .returning()
    return updated || null
  }

  async delete(id: string, userId: string) {
    const [deleted] = await db
      .delete(series)
      .where(and(eq(series.id, id), eq(series.userId, userId)))
      .returning()
    return deleted || null
  }

  /**
   * Get all episodes (videos) for a given series, ordered by episode number.
   */
  async getEpisodes(seriesId: string) {
    return await db.select().from(videos).where(eq(videos.seriesId, seriesId)).orderBy(asc(videos.episodeNumber))
  }

  /**
   * Get the last (highest episode number) video for a series.
   * Used to build the previousEpisodeContext when generating the next episode.
   */
  async getLastEpisode(seriesId: string) {
    const [last] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.seriesId, seriesId), eq(videos.status, 'completed')))
      .orderBy(desc(videos.episodeNumber))
      .limit(1)
    return last || null
  }

  /**
   * Get the next episode number for a series (max + 1).
   */
  async getNextEpisodeNumber(seriesId: string): Promise<number> {
    const [result] = await db
      .select({ max: sql<number>`COALESCE(MAX(episode_number), 0)` })
      .from(videos)
      .where(eq(videos.seriesId, seriesId))
    return (result?.max ?? 0) + 1
  }
}
