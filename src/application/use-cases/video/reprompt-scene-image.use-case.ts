import { IUseCase } from '@/domain/types'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
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
      const sub = await creditsRepository.getActiveSubscription(userId)
      const actualPlan = sub?.plan || 'free'
      const planLimit = PLAN_MONTHLY_LIMITS[actualPlan] ?? PLAN_MONTHLY_LIMITS.free

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

      // 3. Deduct Credits
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, cost, planLimit)
      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_reprompt',
        amount: -cost,
        videoId,
        metadata: { sceneIndex, planConsumed, extraConsumed, plan: actualPlan }
      })

      // 4. Update Scene Prompt (if provided) and set status to queued
      const jobId = crypto.randomUUID()
      if (newPrompt) {
        scenes[sceneIndex].imagePrompt = newPrompt
        if (video.script && (video.script as any).scenes) {
          ;(video.script as any).scenes[sceneIndex].imagePrompt = newPrompt
        }
      }

      await videoRepository.update(videoId, {
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
        options: {
          ...videoOptions,
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
