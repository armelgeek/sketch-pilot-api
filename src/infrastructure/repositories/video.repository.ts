import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../database/db'
import { videos } from '../database/schema'

export interface VideoFilters {
  page?: number
  limit?: number
  status?: string
  genre?: string
  type?: string
  search?: string
  sort?: string
}

export class VideoRepository {
  async create(data: {
    id: string
    userId: string
    topic: string
    options?: any
    genre?: string
    type?: string
    language?: string
  }) {
    const [video] = await db
      .insert(videos)
      .values({
        id: data.id,
        userId: data.userId,
        topic: data.topic,
        status: 'queued',
        progress: 0,
        options: data.options,
        genre: data.genre,
        type: data.type,
        language: data.language || 'en',
        creditsUsed: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()
    return video
  }

  async findById(id: string) {
    return db.query.videos?.findFirst?.({ where: (t: any, { eq: eqFn }: any) => eqFn(t.id, id) })
  }

  async findByIdAndUserId(id: string, userId: string) {
    const [video] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.userId, userId)))
    return video || null
  }

  async findByJobId(jobId: string) {
    const [video] = await db.select().from(videos).where(eq(videos.jobId, jobId))
    return video || null
  }

  async updateStatus(
    id: string,
    data: {
      status?: string
      progress?: number
      currentStep?: string
      jobId?: string
      errorMessage?: string
      videoUrl?: string
      thumbnailUrl?: string
      narrationUrl?: string
      captionsUrl?: string
      duration?: number
      script?: any
      scenes?: any
      completedAt?: Date
    }
  ) {
    const [video] = await db
      .update(videos)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(videos.id, id))
      .returning()
    return video
  }

  async listByUser(userId: string, filters: VideoFilters) {
    const { page = 1, limit = 20, status, genre, type, search, sort } = filters
    const offset = (page - 1) * limit

    const conditions = [eq(videos.userId, userId)]
    if (status) conditions.push(eq(videos.status, status))
    if (genre) conditions.push(eq(videos.genre, genre))
    if (type) conditions.push(eq(videos.type, type))
    if (search) conditions.push(ilike(videos.topic, `%${search}%`))

    const whereClause = and(...conditions)

    let orderBy
    switch (sort) {
      case 'oldest':
        orderBy = videos.createdAt
        break
      default:
        orderBy = desc(videos.createdAt)
    }

    const [data, countResult] = await Promise.all([
      db.select().from(videos).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(videos).where(whereClause)
    ])

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit
    }
  }

  async delete(id: string, userId: string) {
    const [deleted] = await db
      .delete(videos)
      .where(and(eq(videos.id, id), eq(videos.userId, userId)))
      .returning()
    return deleted || null
  }

  async listAll(filters: VideoFilters & { userId?: string }) {
    const { page = 1, limit = 20, status, search } = filters
    const offset = (page - 1) * limit

    const conditions: any[] = []
    if (filters.userId) conditions.push(eq(videos.userId, filters.userId))
    if (status) conditions.push(eq(videos.status, status))
    if (search) conditions.push(ilike(videos.topic, `%${search}%`))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [data, countResult] = await Promise.all([
      db.select().from(videos).where(whereClause).orderBy(desc(videos.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(videos).where(whereClause)
    ])

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit
    }
  }

  async countByStatus() {
    return db.select({ status: videos.status, count: sql<number>`count(*)` }).from(videos).groupBy(videos.status)
  }
}
