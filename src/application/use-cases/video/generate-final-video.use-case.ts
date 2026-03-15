import { PromptService } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, type VideoJobData } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type GenerateFinalVideoParams = {
  videoId: string
  userId: string
  planId?: string
  options?: any
}

type GenerateFinalVideoResponse = {
  success: boolean
  jobId?: string
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const promptService = new PromptService(new PromptRepository())

export class GenerateFinalVideoUseCase extends IUseCase<GenerateFinalVideoParams, GenerateFinalVideoResponse> {
  async execute({ videoId, userId, options }: GenerateFinalVideoParams): Promise<GenerateFinalVideoResponse> {
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
      const spec = await promptService.resolveSpec(undefined, videoOptions.videoType)

      // 3. Calculate & Check Credits (Export only)
      // Step 3 cost = Export
      const exportCost = videoOptions.resolution === '1080p' ? CREDIT_COSTS.EXPORT_1080P : CREDIT_COSTS.EXPORT_720P

      const totalCost = exportCost

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
          error: `Insufficient credits. Final export requires ${totalCost} credits. You have ${totalAvailable}.`
        }
      }

      // Deduct with priority
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, totalCost, planLimit)

      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_assemble',
        amount: -totalCost,
        videoId,
        metadata: {
          planConsumed,
          extraConsumed,
          plan: actualPlan,
          phase: 'assembly'
        }
      })

      // 4. Update the video record status
      const jobId = crypto.randomUUID()
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        progress: 10,
        currentStep: 'Starting final video render (Step 3)'
      })

      // 5. Enqueue the BullMQ job
      const jobData: VideoJobData = {
        jobId,
        userId,
        videoId,
        topic: video.topic,
        options: {
          ...videoOptions,
          ...(options || {}),
          generateOnlyAssembly: true, // ONLY ASSEMBLY
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
        error: error instanceof Error ? error.message : 'Final assembly job failed to enqueue'
      }
    }
  }
}
