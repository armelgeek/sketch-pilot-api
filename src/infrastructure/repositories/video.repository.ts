import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm'
import { db } from '../database/db'
import { videos, videoScenes } from '../database/schema'

export interface VideoFilters {
  page?: number
  limit?: number
  status?: string
  search?: string
  sort?: string
}

export class VideoRepository {
  async create(data: {
    id: string
    userId: string
    topic: string
    title?: string
    status?: string
    progress?: number
    options?: any
    language?: string
    script?: any
    scenes?: any
    creditsUsed?: number
    characterModelId?: string
    seriesId?: string
    episodeNumber?: number
    characterRegistry?: Record<string, any>
    locationRegistry?: Record<string, any>
    assetRegistry?: Record<string, any>
    previousEpisodesContext?: string
    globalContext?: string
    lastCliffhanger?: any
    continuityAnalysis?: any
    lastEpisodeFinalImage?: string
    lastEpisodeFinalScene?: any
    narrationLayer?: any
  }) {
    const [video] = await db
      .insert(videos)
      .values({
        id: data.id,
        userId: data.userId,
        topic: data.topic,
        title: data.title,
        status: data.status || 'queued',
        progress: data.progress || 0,
        options: data.options,
        language: data.language || 'en',
        script: data.script,
        scenes: data.scenes,
        creditsUsed: data.creditsUsed !== undefined ? data.creditsUsed : data.status === 'draft' ? 0 : 1,
        characterModelId: data.characterModelId,
        seriesId: data.seriesId,
        episodeNumber: data.episodeNumber,
        characterRegistry: data.characterRegistry || {},
        locationRegistry: data.locationRegistry || {},
        assetRegistry: data.assetRegistry || {},
        previousEpisodesContext: data.previousEpisodesContext,
        globalContext: data.globalContext,
        lastCliffhanger: data.lastCliffhanger,
        continuityAnalysis: data.continuityAnalysis,
        lastEpisodeFinalImage: data.lastEpisodeFinalImage,
        lastEpisodeFinalScene: data.lastEpisodeFinalScene,
        narrationLayer: data.narrationLayer,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()
    return video
  }

  async findById(id: string) {
    const video = await db.query.videos?.findFirst?.({ where: (t: any, { eq: eqFn }: any) => eqFn(t.id, id) })
    if (!video) return null

    // Fetch related scenes from the relational table (Relational Refactor V70)
    const scenes = await db.query.videoScenes?.findMany?.({
      where: (t: any, { eq: eqFn }: any) => eqFn(t.videoId, id),
      orderBy: (t: any, { asc }: any) => [asc(t.sceneNumber)]
    })

    if (scenes && scenes.length > 0) {
      video.scenes = scenes
    }

    return this.processVideoForFrontend(video)
  }

  async findByIdAndUserId(id: string, userId: string) {
    const [video] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.userId, userId)))
    if (!video) return null

    const scenes = await db.query.videoScenes?.findMany?.({
      where: (t: any, { eq: eqFn }: any) => eqFn(t.videoId, id),
      orderBy: (t: any, { asc }: any) => [asc(t.sceneNumber)]
    })
    if (scenes) video.scenes = scenes

    return this.processVideoForFrontend(video) || null
  }

  async findByJobId(jobId: string) {
    const [video] = await db.select().from(videos).where(eq(videos.jobId, jobId))
    if (!video) return null

    const scenes = await db.query.videoScenes?.findMany?.({
      where: (t: any, { eq: eqFn }: any) => eqFn(t.videoId, video.id),
      orderBy: (t: any, { asc }: any) => [asc(t.sceneNumber)]
    })
    if (scenes) video.scenes = scenes

    return this.processVideoForFrontend(video) || null
  }

  async findBySeriesId(seriesId: string) {
    const data = await db.select().from(videos).where(eq(videos.seriesId, seriesId)).orderBy(desc(videos.episodeNumber))
    return data.map((v) => this.processVideoForFrontend(v))
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
      options?: any
      completedAt?: Date
      title?: string
      characterRegistry?: Record<string, any>
      locationRegistry?: Record<string, any>
      assetRegistry?: Record<string, any>
      previousEpisodesContext?: string
      globalContext?: string
      lastCliffhanger?: any
      continuityAnalysis?: any
      lastEpisodeFinalImage?: string
      lastEpisodeFinalScene?: any
      narrationLayer?: any
    }
  ) {
    const updateData: any = { ...data }

    // Safety rounding for integer columns in database
    if (updateData.duration !== undefined && updateData.duration !== null) {
      updateData.duration = Math.round(updateData.duration)
    }
    if (updateData.progress !== undefined && updateData.progress !== null) {
      updateData.progress = Math.round(updateData.progress)
    }

    const [video] = await db
      .update(videos)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(videos.id, id))
      .returning()
    return video
  }

  // --- Scene Relational Methods ---

  async createScene(videoId: string, scene: any) {
    const compositeId = `${videoId}:${scene.id}`
    const [inserted] = await db
      .insert(videoScenes)
      .values({
        id: compositeId,
        videoId,
        sceneNumber: scene.sceneNumber,
        startTime: String(scene.timeRange?.start || 0),
        endTime: String(scene.timeRange?.end || 0),
        duration: String(scene.duration || 0),
        summary: scene.summary,
        justification: scene.justification,
        narration: scene.narration,
        locationId: scene.locationId || scene.location_id || (scene as any).location,
        imagePrompt: scene.imagePrompt,
        imageUrl: scene.imageUrl,
        thumbnailUrl: scene.thumbnailUrl,
        cameraAction: scene.cameraAction,
        animationPrompt: scene.animationPrompt,
        preset: scene.preset,
        transition: scene.transition,
        continueFromPrevious: String(!!scene.continueFromPrevious),
        persistentDecorTokens: scene.persistentDecorTokens || [],
        isEstablishingShot: String(!!scene.isEstablishingShot),
        spatialAnchor: scene.spatialAnchor,
        composition: scene.composition,
        visualEvolution: scene.visualEvolution,
        visualDelta: scene.visualDelta,
        visualBaseState: scene.visualBaseState,
        visualStateLock: scene.visualStateLock,
        frameAnchor: scene.frameAnchor,
        worldStateSnapshot: scene.worldStateSnapshot,
        weatherState: scene.weatherState,
        timeOfDay: scene.timeOfDay,
        colorPalette: scene.colorPalette,
        cameraStyle: scene.cameraStyle,
        sceneDelta: scene.sceneDelta,
        scenePurpose: scene.scenePurpose,
        tensionState: scene.tensionState,
        dramaticFunction: scene.dramaticFunction,
        actPosition: scene.actPosition,
        characterImpacts: scene.characterImpacts,
        metadata: { ...scene },
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()
    return inserted
  }

  async upsertScene(videoId: string, scene: any) {
    const compositeId = `${videoId}:${scene.id}`
    const existing = await db.query.videoScenes?.findFirst?.({
      where: (t: any, { eq: eqFn }: any) => eqFn(t.id, compositeId)
    })

    const values: any = {
      videoId,
      sceneNumber: scene.sceneNumber,
      startTime: String(scene.timeRange?.start || 0),
      endTime: String(scene.timeRange?.end || 0),
      duration: String(scene.duration || 0),
      summary: scene.summary,
      justification: scene.justification,
      narration: scene.narration,
      locationId: scene.locationId || scene.location_id || (scene as any).location,
      imagePrompt: scene.imagePrompt,
      imageUrl: scene.imageUrl,
      thumbnailUrl: scene.thumbnailUrl,
      cameraAction: scene.cameraAction,
      animationPrompt: scene.animationPrompt,
      preset: scene.preset,
      transition: scene.transition,
      continueFromPrevious: String(!!scene.continueFromPrevious),
      persistentDecorTokens: scene.persistentDecorTokens || [],
      isEstablishingShot: String(!!scene.isEstablishingShot),
      spatialAnchor: scene.spatialAnchor,
      composition: scene.composition,
      visualEvolution: scene.visualEvolution,
      visualDelta: scene.visualDelta,
      visualBaseState: scene.visualBaseState,
      visualStateLock: scene.visualStateLock,
      frameAnchor: scene.frameAnchor,
      worldStateSnapshot: scene.worldStateSnapshot,
      weatherState: scene.weatherState,
      timeOfDay: scene.timeOfDay,
      colorPalette: scene.colorPalette,
      cameraStyle: scene.cameraStyle,
      sceneDelta: scene.sceneDelta,
      scenePurpose: scene.scenePurpose,
      tensionState: scene.tensionState,
      dramaticFunction: scene.dramaticFunction,
      actPosition: scene.actPosition,
      characterImpacts: scene.characterImpacts,
      metadata: { ...scene },
      updatedAt: new Date()
    }

    if (existing) {
      const [updated] = await db.update(videoScenes).set(values).where(eq(videoScenes.id, compositeId)).returning()
      return updated
    } else {
      const [inserted] = await db
        .insert(videoScenes)
        .values({ id: compositeId, ...values, createdAt: new Date() })
        .returning()
      return inserted
    }
  }

  async listScenes(videoId: string) {
    return await db.select().from(videoScenes).where(eq(videoScenes.videoId, videoId)).orderBy(videoScenes.sceneNumber)
  }

  async saveScenes(videoId: string, scenes: any[]) {
    if (!scenes || scenes.length === 0) return []
    const results = []
    for (const scene of scenes) {
      results.push(await this.upsertScene(videoId, scene))
    }
    return results
  }

  async update(id: string, data: Partial<typeof videos.$inferInsert>) {
    const [video] = await db
      .update(videos)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(videos.id, id))
      .returning()
    return video
  }

  async listByUser(userId: string, filters: VideoFilters) {
    const { page = 1, limit = 20, status, search, sort } = filters
    const offset = (page - 1) * limit
    const conditions = [eq(videos.userId, userId), isNull(videos.seriesId)]
    if (status) conditions.push(eq(videos.status, status))
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
      db
        .select({ count: sql<number>`count(*)` })
        .from(videos)
        .where(whereClause)
    ])

    return {
      data: data.map((v) => this.processVideoForFrontend(v)),
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

  async adminDelete(id: string) {
    const [deleted] = await db.delete(videos).where(eq(videos.id, id)).returning()
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
      db
        .select({ count: sql<number>`count(*)` })
        .from(videos)
        .where(whereClause)
    ])

    return {
      data: data.map((v) => this.processVideoForFrontend(v)),
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit
    }
  }

  countByStatus() {
    return db
      .select({ status: videos.status, count: sql<number>`count(*)` })
      .from(videos)
      .groupBy(videos.status)
  }

  private processVideoForFrontend(video: any) {
    if (!video) return video

    // 1. Ensure title exists and is not too long
    if (!video.title && video.topic) {
      // Fallback to truncated topic if no title exists
      video.title = video.topic
        .split(/[.!?\n]/)[0]
        .trim()
        .slice(0, 70)
    } else if (video.title && video.title.length > 100) {
      // Emergency truncation if title is too long
      video.title = `${video.title.slice(0, 70)}...`
    }

    // 2. Inject dynamic thumbnail if needed
    if (!video.thumbnailUrl) {
      const scenes = video.scenes || (video.script as any)?.scenes || []
      if (scenes && Array.isArray(scenes) && scenes.length > 0) {
        const scenesWithImages = scenes.filter((s: any) => s.imageUrl)
        if (scenesWithImages.length > 0) {
          // Stable random based on video ID
          const charSum = video.id.split('').reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0)
          const index = charSum % scenesWithImages.length
          video.thumbnailUrl = scenesWithImages[index].imageUrl
        }
      }
    }

    // 3. Flatten Tension State for UI (v8.0 Alignment)
    if (video.narrationLayer?.tensionState) {
      video.tensionState = video.narrationLayer.tensionState
    }

    return video
  }
}
