import { IUseCase } from '@/domain/types'
import { getVideoQueue } from '@/infrastructure/config/queue.config'
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

      // 4. Update Scene Prompt (if provided)
      if (newPrompt) {
        scenes[sceneIndex].imagePrompt = newPrompt
        await videoRepository.updateStatus(videoId, { scenes })
      }

      // 5. Enqueue Specialized Job (Re-using Render pipeline for simplicity or specialized worker)
      // For now, we'll trigger a full render but flagging it's just for one scene would be better.
      // However, the current engine is optimized for full video.
      // We'll mark the specific scene as "stale" or just re-run render which skips existing assets.

      const jobId = crypto.randomUUID()
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        currentStep: `Regenerating image for scene ${sceneIndex}`
      })

      const queue = getVideoQueue()
      await queue.add(
        'generate-video',
        {
          jobId,
          userId,
          videoId,
          topic: video.topic,
          options: {
            ...((video.options as any) || {}),
            generateFromScript: true,
            repromptSceneIndex: sceneIndex // Backend worker hint
          }
        },
        { jobId }
      )

      return { success: true, jobId, creditsRequired: cost }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to re-prompt' }
    }
  }
}
