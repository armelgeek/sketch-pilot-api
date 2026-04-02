import { IUseCase } from '@/domain/types/use-case.type'
import { getVideoQueue } from '@/infrastructure/config/queue.config'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { GenerateScriptOptions } from '@/application/services/script-generation.service'
import type { CompleteVideoScript } from '@sketch-pilot/types/video-script.types'

type GenerateScriptParams = {
  userId: string
  topic: string
  options?: GenerateScriptOptions
}

type GenerateScriptResponse = {
  success: boolean
  script?: CompleteVideoScript
  videoId?: string
  jobId?: string
  metadata?: {
    sceneCount: number
    estimatedDuration: number
    language: string
  }
  error?: string
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()

export class GenerateScriptUseCase extends IUseCase<GenerateScriptParams, GenerateScriptResponse> {
  async execute({ userId, topic, options = {} }: GenerateScriptParams): Promise<GenerateScriptResponse> {
    try {
      // 1. Check & Deduct Credits for Script Generation
      const cost = CREDIT_COSTS.SCRIPT_GENERATION
      const credits = await creditsRepository.ensureUserCredits(userId)

      const sub = await creditsRepository.getActiveSubscription(userId)
      const plan = sub?.plan || 'free'
      const planLimit = PLAN_MONTHLY_LIMITS[plan] ?? PLAN_MONTHLY_LIMITS.free

      const consumedThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0

      const availablePlanCredits = planLimit === -1 ? Infinity : Math.max(0, planLimit - consumedThisMonth)
      const totalAvailable = availablePlanCredits + extraCredits

      if (totalAvailable < cost) {
        return {
          success: false,
          error: `Insufficient credits. Script generation requires ${cost} credits. You have ${totalAvailable}.`
        }
      }

      // Deduct with priority
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, cost, planLimit)

      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_script',
        amount: -cost,
        metadata: {
          planConsumed,
          extraConsumed,
          plan
        }
      })

      // 2. Create Video and Job record
      const videoId = crypto.randomUUID()
      const jobId = crypto.randomUUID()

      await videoRepository.create({
        id: videoId,
        userId,
        topic,
        status: 'queued',
        progress: 0,
        options: { ...options, scriptOnly: true, creditsUsed: cost, planConsumed, extraConsumed },
        language: options.language || 'en',
        characterModelId: options.characterModelId,
        creditsUsed: cost
      })

      await videoRepository.updateStatus(videoId, { jobId, status: 'queued' })

      // 3. Enqueue the BullMQ job
      const queue = getVideoQueue()
      await queue.add(
        'generate-video',
        {
          jobId,
          userId,
          videoId,
          topic,
          options: {
            ...options,
            scriptOnly: true
          }
        },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 }
        }
      )

      return {
        success: true,
        videoId,
        jobId,
        metadata: {
          sceneCount: 0, // Will be updated by worker
          estimatedDuration: options.duration ?? 60,
          language: options.language ?? 'en'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Script generation failed to enqueue'
      }
    }
  }
}
