import { videoGenerationOptionsSchema, type VideoGenerationOptions } from '@sketch-pilot/types/video-script.types'
import { PromptService } from '@/application/services/prompt.service'
import { SeriesManager, type SeriesContext } from '@/application/services/series-manager.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, redisClient, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
type GenerateVideoParams = {
  userId: string
  planId?: string
  topic: string
  options?: Partial<VideoGenerationOptions>
  seriesId?: string
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
    autoTransitions: options.autoTransitions,
    repromptSceneIndex: (options as any).repromptSceneIndex,
    customSpec: customSpec || options.customSpec,
    scriptOnly: options.scriptOnly,
    generateOnlyScenes: !options.scriptOnly, // Default to two-pass generation: Stop after scenes
    animationMode: options.animationMode,
    aspectRatio: options.aspectRatio,
    resolution: options.resolution,
    imageStyle: options.imageStyle,
    promptSections: options.promptSections
  }
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const promptService = new PromptService(new PromptRepository())

export class GenerateVideoUseCase extends IUseCase<GenerateVideoParams, GenerateVideoResponse> {
  private readonly seriesManager = new SeriesManager()
  constructor() {
    super()
  }

  async execute({
    userId,
    planId,
    topic,
    options = {},
    seriesId
  }: GenerateVideoParams): Promise<GenerateVideoResponse> {
    try {
      // 1. Resolve Spec from DB
      const spec = await promptService.resolveSpec(options.promptId)

      // 2. Build options using the schema for validation and transformation
      const videoOptions = videoGenerationOptionsSchema.parse({
        ...options,
        customSpec: spec
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

      // Create the IDs
      const videoId = crypto.randomUUID()
      const jobId = crypto.randomUUID()

      let finalTopic = topic.trim()
      if (!finalTopic && !seriesId) {
        return { success: false, error: 'Un sujet est requis pour générer une vidéo.' }
      }

      // 3. Series context resolution
      let seriesContext: SeriesContext | undefined
      if (seriesId) {
        seriesContext = await this.seriesManager.resolveContext(seriesId)
      }

      // 4. Handle Auto-continuation instruction
      if ((!finalTopic || finalTopic === 'AUTO_CONTINUE') && seriesContext) {
        finalTopic = this.seriesManager.getAutoContinuationPrompt(seriesContext)
      } else if (!finalTopic || finalTopic === 'AUTO_CONTINUE') {
        finalTopic = 'Imaginez une histoire courte et captivante.'
      }

      const effectiveTopic = finalTopic

      // 5. Generate a preliminary title from the topic
      const preliminaryTitle = effectiveTopic
        .split(/[.!?\n]/)[0]
        .trim()
        .slice(0, 70)

      await videoRepository.create({
        id: videoId,
        userId,
        topic: effectiveTopic,
        title: preliminaryTitle,
        characterModelId: options.characterModelId,
        options: { ...videoOptions, creditsUsed: totalCost },
        language: options.language || 'en',
        creditsUsed: totalCost,
        seriesId: seriesId ?? null,
        episodeNumber: seriesContext?.episodeNumber ?? 1
      })

      await videoRepository.updateStatus(videoId, { jobId, status: 'queued' })

      const lockKey = `active-video-job:${videoId}`
      await redisClient.del(lockKey)

      const jobData: VideoJobData = {
        jobId: videoId,
        userId,
        videoId,
        topic: effectiveTopic,
        cost: totalCost,
        planLimit: planLimit === -1 ? 0 : planLimit,
        options: {
          ...toJobOptions(videoOptions, spec),
          seriesId,
          seriesTitle: seriesContext?.seriesTitle,
          seriesDescription: seriesContext?.seriesDescription,
          fullStory: seriesContext?.fullStory,
          totalEpisodes: seriesContext?.totalEpisodes,
          cast: seriesContext?.cast,
          episodeNumber: seriesContext?.episodeNumber ?? 1,
          previousEpisodeScript: seriesContext?.previousEpisodeScript
        }
      }

      const queue = getVideoQueue()
      await queue.add('generate-video', jobData, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

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
