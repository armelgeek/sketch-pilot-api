import { videoGenerationOptionsSchema, type VideoGenerationOptions } from '@sketch-pilot/types/video-script.types'
import { PromptService } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, redisClient, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type GenerateVideoParams = {
  userId: string
  planId?: string
  topic: string
  options?: Partial<VideoGenerationOptions>
}

type GenerateVideoResponse = {
  success: boolean
  jobId?: string
  videoId?: string
  streamUrl?: string
  estimatedDuration?: number
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

/** Map VideoGenerationOptions to the flat VideoJobData.options shape. */
function toJobOptions(options: Partial<VideoGenerationOptions>, customSpec?: any): VideoJobData['options'] {
  return {
    duration: options.duration,
    sceneCount: options.sceneCount,
    language: options.language,
    voiceProvider: options.audioProvider,
    voiceId: options.kokoroVoicePreset?.toString(),
    llmProvider: options.llmProvider,
    imageProvider: options.imageProvider,
    qualityMode: options.qualityMode,
    repromptSceneIndex: (options as any).repromptSceneIndex,

    customSpec: customSpec || options.customSpec,
    scriptOnly: options.scriptOnly,
    generateOnlyScenes: !options.scriptOnly, // Default to two-pass generation: Stop after scenes
    animationMode: options.animationMode,
    aspectRatio: options.aspectRatio,
    resolution: options.resolution,
    imageStyle: options.imageStyle,
    promptSections: options.promptSections,
    type: options.type,
    isQuotes: options.isQuotes,
    seriesId: options.seriesId,
    episodeNumber: options.episodeNumber || customSpec?.seriesMetadata?.episodeNumber,
    lastCliffhanger: customSpec?.seriesMetadata?.lastCliffhanger || (options as any).lastCliffhanger,
    unresolvedThreads: customSpec?.seriesMetadata?.unresolvedThreads || (options as any).unresolvedThreads
  }
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const promptService = new PromptService(new PromptRepository())
const seriesRepository = new SeriesRepository()

export class GenerateVideoUseCase extends IUseCase<GenerateVideoParams, GenerateVideoResponse> {
  async execute({ userId, planId, topic, options = {} }: GenerateVideoParams): Promise<GenerateVideoResponse> {
    try {
      // 1. Resolve Spec from DB
      let spec = await promptService.resolveSpec(options.promptId)

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

      // 2. If Series, fetch and merge context
      let seriesContext: any = null
      if (options.seriesId) {
        seriesContext = await seriesRepository.getSeriesContext(options.seriesId)
        if (seriesContext) {
          spec = {
            ...spec,
            seriesMetadata: {
              seriesId: seriesContext.seriesId,
              globalContext: seriesContext.globalContext,
              previousEpisodesContext: seriesContext.previousEpisodesContext,
              characterRegistry: seriesContext.characterRegistry,
              locationRegistry: seriesContext.locationRegistry,
              lastCliffhanger: seriesContext.lastCliffhanger,
              unresolvedThreads: seriesContext.unresolvedThreads,

              totalEpisodes: seriesContext.totalEpisodes,
              episodeNumber: options.episodeNumber || seriesContext.lastEpisodeNumber + 1,
              visualStyleModelId: seriesContext.visualStyleModelId
            }
          }

          // INHERIT PREFERENCES
          if (!options.audioProvider) options.audioProvider = seriesContext.audioProvider as any
          if (!options.kokoroVoicePreset) options.kokoroVoicePreset = seriesContext.kokoroVoicePreset as any
          if (!options.characterModelId) options.characterModelId = seriesContext.visualStyleModelId
          if (!options.language) options.language = seriesContext.language
          if (!options.aspectRatio) options.aspectRatio = seriesContext.aspectRatio as any
          if (!options.duration && seriesContext.duration) {
            options.duration = Number(seriesContext.duration)
          }
        }
      }

      // 2. Build options using the schema for validation and transformation
      const videoOptions = videoGenerationOptionsSchema.parse({
        ...options,
        customSpec: {
          ...(spec || {}),
          localCharacterRegistry: seriesContext?.characterRegistry || {},
          localLocationRegistry: seriesContext?.locationRegistry || {}
        }
      })

      const plan = planId || 'free'
      const estimatedScenes = videoOptions.sceneCount // Guaranteed to be computed via schema transform

      const isAIImage = videoOptions.imageProvider === 'gemini'
      const imageCostPerScene = isAIImage ? CREDIT_COSTS.IMAGE_CREATOR : CREDIT_COSTS.IMAGE_FREE

      const exportCost =
        videoOptions.resolution === '1080p' || plan !== 'free' ? CREDIT_COSTS.EXPORT_1080P : CREDIT_COSTS.EXPORT_720P

      const totalCost =
        CREDIT_COSTS.SCRIPT_GENERATION +
        imageCostPerScene * estimatedScenes +
        CREDIT_COSTS.TTS_VOICE +
        CREDIT_COSTS.SUBTITLES +
        exportCost +
        (options.promptId ? CREDIT_COSTS.STUDIO_PASS_SURCHARGE : 0)

      const credits = await creditsRepository.ensureUserCredits(userId)
      await creditsRepository.getActiveSubscription(userId)
      const planLimit = await creditsRepository.getCurrentPlanLimit(userId)

      const consumedThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0

      const availablePlanCredits = planLimit === -1 ? Infinity : Math.max(0, planLimit - consumedThisMonth)
      const totalAvailable = availablePlanCredits + extraCredits

      if (totalAvailable < totalCost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Insufficient credits. This video requires approximately ${totalCost} credits. You have ${totalAvailable}.`
        }
      }

      // 2. Initial balance verification (Check only, don't deduct yet)

      // Create the video record
      const videoId = crypto.randomUUID()
      const jobId = crypto.randomUUID()

      // Generate a preliminary title from the topic
      const preliminaryTitle = topic
        .split(/[.!?\n]/)[0]
        .trim()
        .slice(0, 70)

      await videoRepository.create({
        id: videoId,
        userId,
        topic,
        title: preliminaryTitle,
        characterModelId: options.characterModelId,
        seriesId: spec?.seriesMetadata?.seriesId,
        episodeNumber: spec?.seriesMetadata?.episodeNumber,
        options: { ...videoOptions, creditsUsed: totalCost },
        language: options.language || 'en',
        creditsUsed: totalCost
      })

      await videoRepository.updateStatus(videoId, { jobId, status: 'queued' })

      // CRITICAL: Clear any existing lock for this videoId to prevent 'deferred' jobs
      // if we are starting a fresh generation (e.g. after a deletion or restart)
      const lockKey = `active-video-job:${videoId}`
      await redisClient.del(lockKey)

      // Enqueue the BullMQ job
      // Fix 3: Use videoId as BullMQ jobId for automatic deduplication.
      // If the same video is enqueued twice, BullMQ will deduplicate based on jobId,
      // preventing double processing and double billing.
      const jobData: VideoJobData = {
        jobId: videoId, // use videoId for deduplication
        userId,
        videoId,
        topic,
        cost: totalCost,
        planLimit: planLimit === -1 ? 0 : planLimit, // planLimit needs to be a number
        options: toJobOptions(videoOptions, spec)
      }

      const queue = getVideoQueue()
      await queue.add('generate-video', jobData, {
        jobId, // Unique jobId to allow sequential passes
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      // Credits already deducted upfront

      return {
        success: true,
        jobId,
        videoId,
        streamUrl: `/api/v1/videos/jobs/${jobId}/stream`,
        estimatedDuration: 180,
        creditsRequired: totalCost
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video generation failed to enqueue'
      }
    }
  }
}
