import { PromptService } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type GenerateNarrationParams = {
  videoId: string
  userId: string
  planId?: string
}

type GenerateNarrationResponse = {
  success: boolean
  jobId?: string
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const promptService = new PromptService(new PromptRepository())

export class GenerateNarrationUseCase extends IUseCase<GenerateNarrationParams, GenerateNarrationResponse> {
  async execute({ videoId, userId }: GenerateNarrationParams): Promise<GenerateNarrationResponse> {
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

      // 3. Calculate & Check Credits (TTS + Subtitles only)
      const totalCost = CREDIT_COSTS.TTS_VOICE + CREDIT_COSTS.SUBTITLES

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
          error: `Insufficient credits. Narration requires ${totalCost} credits. You have ${totalAvailable}.`
        }
      }

      // 2. Initial balance verification (Check only, don't deduct yet)

      // 4. Update the video record status
      const jobId = crypto.randomUUID()
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        progress: 10,
        currentStep: 'Generating narration and transcription (Step 2.5)'
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
          scriptOnly: false,
          generateOnlyAudio: true, // ONLY NARRATION
          generateFromScript: true, // DONT REGEN SCRIPT
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
        error: error instanceof Error ? error.message : 'Narration job failed to enqueue'
      }
    }
  }
}
