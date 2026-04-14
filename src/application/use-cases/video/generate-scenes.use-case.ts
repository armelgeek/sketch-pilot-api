import { PromptService } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type GenerateScenesParams = {
  videoId: string
  userId: string
  planId?: string
  force?: boolean
}

type GenerateScenesResponse = {
  success: boolean
  jobId?: string
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const promptService = new PromptService(new PromptRepository())

export class GenerateScenesUseCase extends IUseCase<GenerateScenesParams, GenerateScenesResponse> {
  async execute({ videoId, userId, force }: GenerateScenesParams): Promise<GenerateScenesResponse> {
    try {
      // 1. Check if video exists and belongs to user
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) {
        return { success: false, error: 'Video not found' }
      }

      if (!video.script) {
        return { success: false, error: 'Video script not found. Please generate a script first.' }
      }

      // 2. Resolve Spec from DB
      const videoOptions = (video.options as any) || {}
      const spec = await promptService.resolveSpec(videoOptions.videoType)

      // 3. Force Regeneration Logic: Clear existing images from scenes
      if (force) {
        console.info(
          `[GenerateScenes] Forced regeneration requested for video ${videoId}. Clearing existing scene images...`
        )
        const script = video.script as any
        if (script.scenes) {
          for (const scene of script.scenes) {
            delete scene.imageUrl
            delete scene.thumbnailUrl
          }
        }
        // Also reset localProjectId to ensure a fresh session and folder if possible,
        // or just rely on NanoBanana's internal overwrite logic.
        // We'll keep localProjectId for now to avoid breaking path lookups,
        // but removing image URLs in scenes is enough to trigger regeneration in NanoBanana.
        await videoRepository.updateStatus(videoId, {
          script,
          scenes: script.scenes,
          thumbnailUrl: undefined, // Reset main thumbnail too
          status: 'draft' // Reset status to allow re-queueing
        })
      }

      // 4. Calculate & Check Credits (Images only)
      const numScenes = (video.script as any)?.scenes?.length || 0
      const imageCostPerScene =
        videoOptions.imageProvider === 'gemini' ? CREDIT_COSTS.IMAGE_CREATOR : CREDIT_COSTS.IMAGE_FREE

      const totalCost = imageCostPerScene * numScenes

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
          error: `Insufficient credits. Scene generation requires ${totalCost} credits. You have ${totalAvailable}.`
        }
      }

      // 2. Initial balance verification (Check only, don't deduct yet)

      // 4. Update the video record status
      const jobId = crypto.randomUUID()
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        progress: 5,
        currentStep: 'Starting scene generation'
      })

      // 5. Enqueue the BullMQ job
      const jobData: VideoJobData = {
        jobId,
        userId,
        videoId,
        topic: video.topic,
        cost: totalCost,
        planLimit: planLimit === -1 ? 0 : planLimit,
        options: {
          ...videoOptions,
          characterModelId: video.characterModelId,
          seriesId: video.seriesId,
          episodeNumber: video.episodeNumber,
          scriptOnly: false,
          generateOnlyScenes: true,
          skipAudio: true,
          generateFromScript: true,
          customSpec: spec || videoOptions.customSpec
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
        creditsRequired: totalCost
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Scene generation job failed to enqueue'
      }
    }
  }
}
