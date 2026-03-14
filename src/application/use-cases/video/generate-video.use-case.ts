import { PromptService } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { UserRepository } from '@/infrastructure/repositories/user.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { VideoGenerationOptions } from '@sketch-pilot/types/video-script.types'

type GenerateVideoParams = {
  userId: string
  planId?: string
  topic: string
  options?: Partial<VideoGenerationOptions>
  characterModelId?: string
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
    duration: options.maxDuration,
    sceneCount: options.sceneCount,
    style: options.style,
    videoType: options.videoType,
    videoGenre: options.videoGenre,
    language: options.language,
    voiceProvider: options.audioProvider,
    voiceId: options.kokoroVoicePreset?.toString(),
    llmProvider: options.llmProvider,
    imageProvider: options.imageProvider,
    qualityMode: options.qualityMode,
    characterConsistency: options.characterConsistency,
    autoTransitions: options.autoTransitions,
    repromptSceneIndex: (options as any).repromptSceneIndex,
    customSpec: customSpec || options.customSpec,
    characterModelId: options.characterModelId,
    scriptOnly: options.scriptOnly,
    animationMode: options.animationMode,
    aspectRatio: options.aspectRatio,
    resolution: options.resolution,
    localOnlyImages: options.localOnlyImages,
    imageStyle: options.imageStyle,
    globalTextStyle: options.globalTextStyle,
    promptSections: options.promptSections
  }
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const promptService = new PromptService(new PromptRepository())
const userRepository = new UserRepository()

export class GenerateVideoUseCase extends IUseCase<GenerateVideoParams, GenerateVideoResponse> {
  async execute({ userId, planId, topic, options = {} }: GenerateVideoParams): Promise<GenerateVideoResponse> {
    try {
      // 1. Resolve Spec (Prompt Config) from DB
      const spec = await promptService.resolveSpec({
        promptType: 'system_prompt',
        videoType: options.videoType,
        videoGenre: options.videoGenre,
        language: options.language
      })

      // 2. Calculate Estimated Total Cost
      const videoOptions: Partial<VideoGenerationOptions> = {
        ...options,
        sceneCount: options.sceneCount || spec?.defaultSceneCount,
        style: options.style || spec?.style
      }
      const plan = planId || 'free'
      const duration = videoOptions.maxDuration || 30
      const estimatedScenes = videoOptions.sceneCount || Math.ceil(duration / 7)

      const isAIImage = videoOptions.localOnlyImages === false && videoOptions.imageProvider === 'gemini'
      const imageCostPerScene = isAIImage ? CREDIT_COSTS.IMAGE_CREATOR : CREDIT_COSTS.IMAGE_FREE

      const exportCost =
        videoOptions.resolution === '1080p' || plan !== 'free' ? CREDIT_COSTS.EXPORT_1080P : CREDIT_COSTS.EXPORT_720P

      const totalCost =
        CREDIT_COSTS.SCRIPT_GENERATION +
        imageCostPerScene * estimatedScenes +
        CREDIT_COSTS.TTS_VOICE +
        CREDIT_COSTS.SUBTITLES +
        exportCost

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
          error: `Insufficient credits. This video requires approximately ${totalCost} credits. You have ${totalAvailable}.`
        }
      }

      // Deduct with priority
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, totalCost, planLimit)

      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_full',
        amount: -totalCost,
        metadata: {
          estimatedScenes,
          imageProvider: videoOptions.imageProvider,
          localOnlyImages: videoOptions.localOnlyImages,
          resolution: videoOptions.resolution,
          planConsumed,
          extraConsumed,
          plan
        }
      })

      // Resolve Character Model
      let finalCharacterModelId = options.characterModelId
      if (!finalCharacterModelId) {
        const userRec = await userRepository.findById(userId)
        finalCharacterModelId = userRec?.defaultCharacterModelId || undefined
      }

      // Create the video record
      const videoId = crypto.randomUUID()
      const jobId = crypto.randomUUID()

      await videoRepository.create({
        id: videoId,
        userId,
        topic,
        options,
        genre: options.videoGenre,
        type: options.videoType,
        language: options.language || 'en',
        characterModelId: finalCharacterModelId
      })

      await videoRepository.updateStatus(videoId, { jobId, status: 'queued' })

      // Enqueue the BullMQ job
      const jobData: VideoJobData = {
        jobId,
        userId,
        videoId,
        topic,
        options: toJobOptions({ ...options, characterModelId: finalCharacterModelId }, spec)
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
