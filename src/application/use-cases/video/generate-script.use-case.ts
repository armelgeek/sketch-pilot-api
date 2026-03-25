import { ScriptGenerationService, type GenerateScriptOptions } from '@/application/services/script-generation.service'
import { IUseCase } from '@/domain/types'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
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
  metadata?: {
    sceneCount: number
    estimatedDuration: number
    language: string
  }
  error?: string
}

const scriptGenerationService = new ScriptGenerationService()
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

      const script = await scriptGenerationService.generateScript(topic, options)

      const videoId = crypto.randomUUID()
      await videoRepository.create({
        id: videoId,
        userId,
        topic,
        status: 'draft',
        progress: 100,
        options,

        language: options.language || 'en',
        script,
        scenes: script.scenes,
        characterModelId: options.characterModelId
      })

      return {
        success: true,
        script,
        videoId,
        metadata: {
          sceneCount: script.scenes?.length ?? 0,
          estimatedDuration: script.totalDuration ?? options.maxDuration ?? 60,
          language: options.language ?? 'en'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Script generation failed'
      }
    }
  }
}
