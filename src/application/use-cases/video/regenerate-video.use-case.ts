import { PromptService } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { VideoGenerationOptions } from '@sketch-pilot/types/video-script.types'

type RegenerateVideoParams = {
  videoId: string
  userId: string
  planId?: string
  topic: string
  options?: Partial<VideoGenerationOptions>
}

type RegenerateVideoResponse = {
  success: boolean
  jobId?: string
  streamUrl?: string
  estimatedDuration?: number
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

/** Map VideoGenerationOptions to the flat VideoJobData.options shape. */
function toJobOptions(options: Partial<VideoGenerationOptions>, customSpec?: any): VideoJobData['options'] {
  return {
    duration: options.maxDuration,
    sceneCount: options.sceneCount,
    language: options.language,
    voiceProvider: options.audioProvider,
    voiceId: options.kokoroVoicePreset?.toString(),
    llmProvider: options.llmProvider,
    imageProvider: options.imageProvider,
    qualityMode: options.qualityMode,
    characterConsistency: options.characterConsistency,
    autoTransitions: options.autoTransitions,
    repromptSceneIndex: (options as any).repromptSceneIndex,
    customSpec: customSpec || options.customSpec
  }
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const promptService = new PromptService(new PromptRepository())

export class RegenerateVideoUseCase extends IUseCase<RegenerateVideoParams, RegenerateVideoResponse> {
  async execute({
    videoId,
    userId,
    planId,
    topic,
    options = {}
  }: RegenerateVideoParams): Promise<RegenerateVideoResponse> {
    try {
      // 1. Resolve Spec from DB
      const spec = await promptService.resolveSpec(options.promptId)

      // 2. Calculate & Check Credits
      const video = await videoRepository.findByIdAndUserId(videoId, userId)

      if (!video) {
        return { success: false, error: 'Video not found' }
      }

      const videoOptions: Partial<VideoGenerationOptions> = {
        ...(video.options || {}),
        ...options,
        sceneCount:
          options.sceneCount ||
          (video.options as any)?.sceneCount ||
          (video as any).scenes?.length ||
          spec?.defaultSceneCount
      }
      const plan = planId || 'free'

      // If we are regenerating a whole video, we need to know the scene count.
      // We look for it in the video record or options.
      const sceneCount =
        videoOptions.sceneCount ||
        (video.options as any)?.sceneCount ||
        (video as any).scenes?.length ||
        spec?.defaultSceneCount ||
        5

      const isAIImage = videoOptions.imageProvider === 'gemini'
      const imageCostPerScene = isAIImage ? CREDIT_COSTS.IMAGE_CREATOR : CREDIT_COSTS.IMAGE_FREE

      const exportCost =
        videoOptions.resolution === '1080p' || plan !== 'free' ? CREDIT_COSTS.EXPORT_1080P : CREDIT_COSTS.EXPORT_720P

      const totalCost = imageCostPerScene * sceneCount + CREDIT_COSTS.TTS_VOICE + CREDIT_COSTS.SUBTITLES + exportCost

      const credits = await creditsRepository.ensureUserCredits(userId)
      const sub = await creditsRepository.getActiveSubscription(userId)
      const actualPlan = sub?.plan || 'free'
      const planLimit = PLAN_MONTHLY_LIMITS[actualPlan] ?? PLAN_MONTHLY_LIMITS.free

      const consumedThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0

      const availablePlanCredits = planLimit === -1 ? Infinity : Math.max(0, planLimit - consumedThisMonth)
      const totalAvailable = availablePlanCredits + extraCredits

      if (totalAvailable < totalCost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Insufficient credits. Regeneration requires ${totalCost} credits. You have ${totalAvailable}.`
        }
      }

      // Deduct with priority
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, totalCost, planLimit)

      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_regenerate',
        amount: -totalCost,
        videoId,
        metadata: {
          sceneCount,
          imageProvider: videoOptions.imageProvider,
          resolution: videoOptions.resolution,
          planConsumed,
          extraConsumed,
          plan
        }
      })

      const jobId = crypto.randomUUID()

      // Reset the existing video record in-place (no new record created)
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        progress: 0,
        currentStep: null as any,
        errorMessage: null as any,
        videoUrl: null as any,
        thumbnailUrl: null as any,
        narrationUrl: null as any,
        captionsUrl: null as any,
        completedAt: null as any
      })

      // Enqueue the BullMQ job pointing to the same videoId
      const jobData: VideoJobData = {
        jobId,
        userId,
        videoId,
        topic,
        options: toJobOptions(options, spec)
      }

      const queue = getVideoQueue()
      await queue.add('generate-video', jobData, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      // Credits already deducted upfront

      return {
        success: true,
        jobId,
        streamUrl: `/api/v1/videos/jobs/${jobId}/stream`,
        estimatedDuration: 180,
        creditsRequired: totalCost
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Regeneration failed to enqueue'
      }
    }
  }
}
