import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { IUseCase } from '@/domain/types'
import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type GenerateThumbnailParams = {
  userId: string
  videoId: string
  title: string
  inspirationUrl?: string
  characterId?: string
}

type GenerateThumbnailResponse = {
  success: boolean
  variations?: string[]
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const videoGenerationService = new VideoGenerationService()

export class GenerateThumbnailUseCase extends IUseCase<GenerateThumbnailParams, GenerateThumbnailResponse> {
  async execute({
    userId,
    videoId,
    title,
    inspirationUrl,
    characterId
  }: GenerateThumbnailParams): Promise<GenerateThumbnailResponse> {
    try {
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) return { success: false, error: 'Video not found' }

      const totalCost = CREDIT_COSTS.THUMBNAIL_GENERATION

      const credits = await creditsRepository.ensureUserCredits(userId)
      //const sub = await creditsRepository.getActiveSubscription(userId)
      const planLimit = 100 // Fallback or compute based on plan

      const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

      if (totalAvailable < totalCost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Credits insuffisants. Requis: ${totalCost}, Disponible: ${totalAvailable}`
        }
      }

      // 2. Initial balance verification (Check only, don't deduct yet)

      // Generate thumbnails
      const outputDir = path.join(cwd(), 'uploads', 'temp', `thumb-${videoId}-${Date.now()}`)
      const variations = await videoGenerationService.generateThumbnails({
        title,
        inspirationUrl,
        options: { characterModelId: characterId || (video.options as any)?.characterModelId },
        outputDir,
        count: 1,
        videoId: video.id
      })

      // Upload to MinIO - Limiting to 1 variation
      const uploadedUrls: string[] = []
      if (variations.length > 0) {
        const localPath = variations[0]
        const buffer = await fs.readFile(localPath)
        const url = await uploadBuffer(`videos/${videoId}/thumbnails/variation_0.webp`, buffer, 'image/webp')
        uploadedUrls.push(`${url}?v=${Date.now()}`)
      }

      const options = (video.options || {}) as any
      await videoRepository.update(videoId, {
        options: {
          ...options,
          thumbnailVariations: uploadedUrls
        }
      })

      // Cleanup
      await fs.rm(outputDir, { recursive: true, force: true })

      // 4. Success! Deduct credits now.
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, totalCost, planLimit)
      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_thumbnail',
        amount: -totalCost,
        metadata: { videoId, planConsumed, extraConsumed }
      })

      return {
        success: true,
        variations: uploadedUrls,
        creditsRequired: totalCost
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate thumbnails'
      }
    }
  }
}
