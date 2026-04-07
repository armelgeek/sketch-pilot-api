import { IUseCase } from '@/domain/types'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type RepromptSceneImageParams = {
  videoId: string
  sceneIndex: number
  userId: string
  newPrompt?: string
}

type RepromptSceneImageResponse = {
  success: boolean
  jobId?: string
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()

export class RepromptSceneImageUseCase extends IUseCase<RepromptSceneImageParams, RepromptSceneImageResponse> {
  async execute({
    videoId,
    sceneIndex,
    userId,
    newPrompt
  }: RepromptSceneImageParams): Promise<RepromptSceneImageResponse> {
    try {
      // 1. Fetch Video
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) return { success: false, error: 'Video not found' }

      const scenes = (video.scenes as any[]) || []
      if (sceneIndex < 0 || sceneIndex >= scenes.length) {
        return { success: false, error: 'Invalid scene index' }
      }

      // 2. Credit Check
      const cost = CREDIT_COSTS.IMAGE_REPROMPT
      const credits = await creditsRepository.ensureUserCredits(userId)
      await creditsRepository.getActiveSubscription(userId)
      const planLimit = await creditsRepository.getCurrentPlanLimit(userId)

      const consumedThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0
      const availablePlanCredits = planLimit === -1 ? Infinity : Math.max(0, planLimit - consumedThisMonth)

      if (availablePlanCredits + extraCredits < cost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Insufficient credits. Re-prompting costs ${cost} credits.`
        }
      }

      // 2. Initial balance verification (Check only, don't deduct yet)

      // 4. Update Scene Prompt (if provided) and set status to queued
      const jobId = crypto.randomUUID()
      if (newPrompt) {
        scenes[sceneIndex].imagePrompt = newPrompt
        if (video.script && (video.script as any).scenes) {
          ;(video.script as any).scenes[sceneIndex].imagePrompt = newPrompt
        }
      }

      // BREAK VISUAL LINK: If the scene is being explicitly reprompted, we must break any visual reuse link
      // so NanoBananaEngine doesn't optimize it away and actually generates the new image.
      delete scenes[sceneIndex].visualReferenceId
      if (video.script && (video.script as any).scenes) {
        delete (video.script as any).scenes[sceneIndex].visualReferenceId
      }

      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        progress: 10,
        currentStep: `Starting image regeneration for scene ${sceneIndex + 1}`,
        script: video.script as any,
        scenes: scenes as any
      })

      // 5. Enqueue the BullMQ job
      const videoOptions = (video.options as any) || {}
      const jobData = {
        jobId,
        userId,
        videoId,
        topic: video.topic,
        cost,
        planLimit: planLimit === -1 ? 0 : planLimit,
        options: {
          ...videoOptions,
          scriptOnly: false,
          generateFromScript: true,
          repromptSceneIndex: sceneIndex
        }
      }

      const { getVideoQueue } = await import('@/infrastructure/config/queue.config')
      const queue = getVideoQueue()
      await queue.add('generate-video', jobData, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      return { success: true, jobId, creditsRequired: cost }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start re-prompt' }
    }
  }
}
