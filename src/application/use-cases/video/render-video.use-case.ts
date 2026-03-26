import { PromptService } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type RenderVideoParams = {
  videoId: string
  userId: string
  planId?: string
  script: any
}

type RenderVideoResponse = {
  success: boolean
  jobId?: string
  streamUrl?: string
  estimatedDuration?: number
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const promptService = new PromptService(new PromptRepository())

export class RenderVideoUseCase extends IUseCase<RenderVideoParams, RenderVideoResponse> {
  async execute({ videoId, userId, planId, script }: RenderVideoParams): Promise<RenderVideoResponse> {
    try {
      // 1. Check if video exists and belongs to user
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) {
        return { success: false, error: 'Video not found' }
      }

      // 2. Resolve Spec from DB
      const videoOptions = (video.options as any) || {}
      const spec = await promptService.resolveSpec(videoOptions.videoType)

      // 2. Calculate & Check Credits
      const plan = planId || 'free'
      const numScenes = script.scenes?.length || 0

      const imageCostPerScene =
        videoOptions.imageProvider === 'gemini' ? CREDIT_COSTS.IMAGE_CREATOR : CREDIT_COSTS.IMAGE_FREE

      const exportCost =
        videoOptions.resolution === '1080p' || plan !== 'free' ? CREDIT_COSTS.EXPORT_1080P : CREDIT_COSTS.EXPORT_720P

      const totalCost = imageCostPerScene * numScenes + CREDIT_COSTS.TTS_VOICE + CREDIT_COSTS.SUBTITLES + exportCost

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
          error: `Insufficient credits. Rendering requires ${totalCost} credits. You have ${totalAvailable}.`
        }
      }

      // Deduct with priority
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, totalCost, planLimit)

      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_render',
        amount: -totalCost,
        videoId,
        metadata: {
          scenes: numScenes,
          imageProvider: videoOptions.imageProvider,
          resolution: videoOptions.resolution,
          planConsumed,
          extraConsumed,
          plan
        }
      })

      // 3. Update the video record with the new script and status
      const jobId = crypto.randomUUID()
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        script,
        scenes: script.scenes,
        progress: 10,
        currentStep: 'Starting rendering from script'
      })

      // 4. Enqueue the BullMQ job with generateFromScript flag
      const jobData: VideoJobData = {
        jobId,
        userId,
        videoId,
        topic: video.topic,
        options: {
          duration: videoOptions.maxDuration,
          sceneCount: videoOptions.sceneCount,
          videoType: videoOptions.videoType,
          videoGenre: videoOptions.videoGenre,
          language: videoOptions.language,
          voiceProvider: videoOptions.audioProvider,
          voiceId: videoOptions.kokoroVoicePreset?.toString(),
          llmProvider: videoOptions.llmProvider,
          imageProvider: videoOptions.imageProvider,
          qualityMode: videoOptions.qualityMode,
          characterConsistency: videoOptions.characterConsistency,
          autoTransitions: videoOptions.autoTransitions,
          generateFromScript: true, // FLAG indicating to skip LLM
          customSpec: spec || videoOptions.customSpec
        }
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
        error: error instanceof Error ? error.message : 'Render job failed to enqueue'
      }
    }
  }
}
