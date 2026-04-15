import { and, eq, notInArray } from 'drizzle-orm'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, redisClient, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { db } from '@/infrastructure/database/db'
import { videos } from '@/infrastructure/database/schema'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'

import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { GenerateScriptOptions } from '@/application/services/script-generation.service'
import type { CompleteVideoScript } from '@sketch-pilot/types/video-script.types'

type GenerateScriptParams = {
  userId: string
  topic: string
  options?: GenerateScriptOptions
}

type GenerateScriptResponse = {
  success: boolean
  script?: CompleteVideoScript
  videoId?: string
  jobId?: string
  metadata?: {
    sceneCount: number
    estimatedDuration: number
    language: string
  }
  error?: string
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const seriesRepository = new SeriesRepository()

export class GenerateScriptUseCase extends IUseCase<GenerateScriptParams, GenerateScriptResponse> {
  async execute({ userId, topic, options = {} }: GenerateScriptParams): Promise<GenerateScriptResponse> {
    try {
      // 1. Check & Deduct Credits for Script Generation
      const cost = CREDIT_COSTS.SCRIPT_GENERATION
      const credits = await creditsRepository.ensureUserCredits(userId)

      await creditsRepository.getActiveSubscription(userId)
      const planLimit = await creditsRepository.getCurrentPlanLimit(userId)

      const consumedThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0

      const availablePlanCredits = planLimit === -1 ? Infinity : Math.max(0, planLimit - consumedThisMonth)
      const totalAvailable = availablePlanCredits + extraCredits

      if (totalAvailable < cost) {
        return {
          success: false,
          error: `Insufficient credits. Script generation requires ${cost} credits. You have ${totalAvailable}.`
        }
      }

      // 1.5. If type is 'series' but no seriesId, try to find the last active series
      if (options.type === 'series' && !options.seriesId) {
        let lastSeries = await seriesRepository.findLastByUserId(userId)

        // If still no series, create a default one on the fly
        if (!lastSeries) {
          const newSeriesId = crypto.randomUUID()
          const defaultTitle =
            topic
              .split(/[.!?\n]/)[0]
              .trim()
              .slice(0, 50) || 'Ma Première Saga'

          lastSeries = await seriesRepository.create({
            id: newSeriesId,
            userId,
            title: `Saga: ${defaultTitle}`,
            description: `Saga générée automatiquement à partir du sujet : ${topic}`
          })
        }

        if (lastSeries) {
          options.seriesId = lastSeries.id
        }
      }

      // 🛡️ NARRATIVE GUARD: Block generation if an episode is already in progress for this series
      if (options.seriesId) {
        const incompleteVideos = await db
          .select()
          .from(videos)
          .where(
            and(eq(videos.seriesId, options.seriesId), notInArray(videos.status, ['completed', 'failed', 'cancelled']))
          )
          .limit(1)

        if (incompleteVideos.length > 0) {
          return {
            success: false,
            error: `Un épisode (${incompleteVideos[0].episodeNumber}) est déjà en cours de génération pour cette saga. Veuillez attendre sa fin.`
          }
        }
      }

      // 1.6. If Series, fetch context for preference inheritance and episode numbering
      let finalEpisodeNumber = options.episodeNumber
      if (options.seriesId) {
        const seriesContext = await seriesRepository.getSeriesContext(options.seriesId)
        if (seriesContext) {
          // Inherit preferences if not explicitly provided
          options.language = options.language || seriesContext.language || 'fr'
          options.duration = options.duration || (seriesContext.duration ? Number(seriesContext.duration) : 60)
          options.promptId = options.promptId || seriesContext.promptId
          options.videoType = options.videoType || seriesContext.videoType || 'series'
          options.videoGenre = options.videoGenre || seriesContext.videoGenre

          if (!options.audioProvider) options.audioProvider = seriesContext.audioProvider as any
          if (!options.kokoroVoicePreset) options.kokoroVoicePreset = seriesContext.kokoroVoicePreset as any
          if (!options.aspectRatio) options.aspectRatio = seriesContext.aspectRatio as any

          if (!finalEpisodeNumber) {
            finalEpisodeNumber = seriesContext.lastEpisodeNumber + 1
          }
        }
      }

      // 2. Prepare Video Record (Don't deduct yet, just mark as queued)
      const videoId = crypto.randomUUID()
      const jobId = crypto.randomUUID()

      // Generate a preliminary title from the topic if no clean title is provided
      const preliminaryTitle =
        (options as any).title ||
        topic
          .split(/[.!?\n]/)[0]
          .trim()
          .slice(0, 70)

      await videoRepository.create({
        id: videoId,
        userId,
        topic,
        title: preliminaryTitle,
        status: 'queued',
        progress: 0,
        options: { ...options, scriptOnly: true, episodeNumber: finalEpisodeNumber },
        language: options.language || 'fr',
        characterModelId: options.characterModelId,
        seriesId: options.seriesId,
        episodeNumber: finalEpisodeNumber
      })

      // Update the status to lock as queued with the jobId
      await videoRepository.updateStatus(videoId, { jobId, status: 'queued' })

      // CRITICAL: Clear any existing active lock in redis
      const lockKey = `active-video-job:${videoId}`
      await redisClient.del(lockKey)

      const jobData: VideoJobData = {
        jobId: videoId, // use videoId for deduplication
        userId,
        videoId,
        topic,
        cost,
        planLimit,
        options: {
          ...options,
          scriptOnly: true,
          generateOnlyScenes: false,
          episodeNumber: finalEpisodeNumber
        }
      }

      await getVideoQueue().add(`generate-${videoId}`, jobData, {
        jobId,
        removeOnComplete: 10,
        removeOnFail: 20
      })

      return {
        success: true,
        jobId,
        videoId,
        metadata: {
          sceneCount: options.sceneCount ?? 6,
          estimatedDuration: options.duration ?? 60,
          language: options.language ?? 'fr'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Script generation failed'
      }
    }
  }
}
