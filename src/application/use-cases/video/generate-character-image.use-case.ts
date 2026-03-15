import { VideoGenerationService } from '@/application/services/video-generation.service'
import { IUseCase } from '@/domain/types'
import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type GenerateCharacterImageParams = {
  videoId: string
  characterId: string
  userId: string
  prompt: string
  modelId?: string
}

type GenerateCharacterImageResponse = {
  success: boolean
  imageUrl?: string
  updatedCharacterSheet?: any
  error?: string
  creditsRequired?: number
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const videoGenerationService = new VideoGenerationService()

export class GenerateCharacterImageUseCase extends IUseCase<
  GenerateCharacterImageParams,
  GenerateCharacterImageResponse
> {
  async execute({
    videoId,
    characterId,
    userId,
    prompt,
    modelId
  }: GenerateCharacterImageParams): Promise<GenerateCharacterImageResponse> {
    try {
      // 1. Fetch Video
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) return { success: false, error: 'Video not found' }

      if (!video.script || !(video.script as any).characterSheets) {
        return { success: false, error: 'Character sheets not found in video script' }
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
          error: `Insufficient credits. Character generation costs ${cost} credits.`
        }
      }

      // 3. Deduct Credits
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, cost, planLimit)
      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_reprompt',
        amount: -cost,
        videoId,
        metadata: { characterId, planConsumed, extraConsumed, plan: actualPlan }
      })

      // 4. Generate Image via VideoGenerationService
      console.log(
        `[GenerateCharacterImageUseCase] Generating character visual for ${characterId} with prompt: "${prompt}"...`
      )
      const imageBuffer = await videoGenerationService.generateCharacterImage(prompt, modelId)

      // 5. Upload to Storage
      const key = `videos/${videoId}/characters/${characterId}-${Date.now()}.png`
      const imageUrl = await uploadBuffer(key, imageBuffer, 'image/png')

      // 6. Update Video Script's character sheet with referenceImageUrl
      let updatedCharacterSheet = null
      const characterSheets = (video.script as any).characterSheets.map((sheet: any) => {
        // Fuzzy matching: exact ID, or name match (case-insensitive)
        const isMatch =
          sheet.id === characterId ||
          sheet.name?.toLowerCase() === characterId.toLowerCase() ||
          (characterId.includes('CHAR-') && sheet.id === characterId)

        if (isMatch) {
          updatedCharacterSheet = { ...sheet, referenceImageUrl: imageUrl, modelId: modelId || sheet.modelId }
          return updatedCharacterSheet
        }
        return sheet
      })

      if (!updatedCharacterSheet) {
        console.warn(
          `[GenerateCharacterImageUseCase] No character found matching ID/Name: ${characterId}. Updating first sheet as fallback.`
        )
        // If not found, update the first one as fallback to avoid silent failure if only one character exists
        if (characterSheets.length > 0) {
          updatedCharacterSheet = {
            ...characterSheets[0],
            referenceImageUrl: imageUrl,
            modelId: modelId || characterSheets[0].modelId
          }
          characterSheets[0] = updatedCharacterSheet
        }
      }

      const updatedScript = {
        ...(video.script as any),
        characterSheets
      }

      await videoRepository.updateStatus(videoId, { script: updatedScript })

      return {
        success: true,
        imageUrl,
        updatedCharacterSheet,
        creditsRequired: cost
      }
    } catch (error: any) {
      console.error(`[GenerateCharacterImageUseCase] Failed: ${error.message}`)
      return { success: false, error: error.message }
    }
  }
}
