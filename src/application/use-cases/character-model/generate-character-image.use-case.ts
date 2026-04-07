import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { IUseCase } from '@/domain/types'
import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'

type GenerateCharacterParams = {
  userId: string
  baseModelId: string
  prompt: string
}

type GenerateCharacterResponse = {
  success: boolean
  imageUrl?: string
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const creditsRepository = new CreditsRepository()
const videoGenerationService = new VideoGenerationService()

export class GenerateCharacterImageUseCase extends IUseCase<GenerateCharacterParams, GenerateCharacterResponse> {
  async execute({ userId, baseModelId, prompt }: GenerateCharacterParams): Promise<GenerateCharacterResponse> {
    try {
      const totalCost = CREDIT_COSTS.CHARACTER_GENERATION

      const credits = await creditsRepository.ensureUserCredits(userId)
      // For now, use a fixed plan limit or fetch from sub
      const planLimit = await creditsRepository.getCurrentPlanLimit(userId)

      const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

      if (totalAvailable < totalCost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Credits insuffisants. Requis: ${totalCost}, Disponible: ${totalAvailable}`
        }
      }

      // Prepare for generation (check balance only, don't deduct yet)
      const outputDir = path.join(cwd(), 'uploads', 'temp', `char-${userId}-${Date.now()}`)
      const localPath = await videoGenerationService.generateCharacterImage({
        prompt,
        baseModelId,
        outputDir
      })

      // Upload to MinIO
      const buffer = await fs.readFile(localPath)
      const url = await uploadBuffer(`characters/generated/${userId}/${Date.now()}.webp`, buffer, 'image/webp')
      const publicUrl = `${url}?v=${Date.now()}`

      // Cleanup
      try {
        await fs.rm(outputDir, { recursive: true, force: true })
      } catch (error) {
        console.warn('Failed to cleanup char temp dir:', error)
      }

      // Action succeeded! Now deduct credits.
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, totalCost, planLimit)

      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_character',
        amount: -totalCost,
        metadata: { baseModelId, planConsumed, extraConsumed }
      })

      return {
        success: true,
        imageUrl: publicUrl,
        creditsRequired: totalCost
      }
    } catch (error) {
      console.error('[GenerateCharacterImageUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate character image'
      }
    }
  }
}
