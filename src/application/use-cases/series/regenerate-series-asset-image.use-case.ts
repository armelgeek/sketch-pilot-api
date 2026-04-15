import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { ImageServiceFactory } from '@sketch-pilot/services/image'
import { IUseCase } from '@/domain/types'
import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'

type RegenerateSeriesAssetImageParams = {
  userId: string
  seriesId: string
  assetName: string
}

type RegenerateSeriesAssetImageResponse = {
  success: boolean
  imageUrl?: string
  thumbnailUrl?: string
  error?: string
  insufficientCredits?: boolean
}

export class RegenerateSeriesAssetImageUseCase extends IUseCase<
  RegenerateSeriesAssetImageParams,
  RegenerateSeriesAssetImageResponse
> {
  private readonly seriesRepository = new SeriesRepository()
  private readonly creditsRepository = new CreditsRepository()
  private readonly characterModelRepository = new CharacterModelRepository()

  async execute({
    userId,
    seriesId,
    assetName
  }: RegenerateSeriesAssetImageParams): Promise<RegenerateSeriesAssetImageResponse> {
    try {
      const series = await this.seriesRepository.findById(seriesId)
      if (!series || series.userId !== userId) {
        throw new Error('Saga non trouvée ou non autorisée.')
      }

      const registry = series.assetRegistry as Record<string, any>
      if (!registry || !registry[assetName]) {
        throw new Error(`Objet ${assetName} introuvable dans la Saga.`)
      }

      const asset = registry[assetName]
      const description = asset.description

      if (!description) {
        throw new Error('Aucune description visuelle disponible pour cet objet.')
      }

      // Deduct credits (image generation = 2 credits)
      const cost = 2
      const credits = await this.creditsRepository.ensureUserCredits(userId)
      const planLimit = await this.creditsRepository.getCurrentPlanLimit(userId)
      const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

      if (totalAvailable < cost) {
        return { success: false, insufficientCredits: true, error: "Crédits insuffisants pour générer l'image." }
      }

      // Instantiate Gemini Image Service
      const imageService = await ImageServiceFactory.create({
        provider: 'gemini',
        apiKey: process.env.GEMINI_API_KEY || ''
      })

      // Generate temporary filename
      const filename = path.join(os.tmpdir(), `asset-gen-${Date.now()}-${Math.random().toString(36).slice(7)}.png`)

      // Refined asset prompt
      let basePrompt = asset.description || asset.name
      if (series.videoGenre) {
        basePrompt += `, Style: ${series.videoGenre}`
      }

      // Anchoring references
      const referenceImages: { name?: string; data: string }[] = []
      if (series.thumbnailUrl) {
        // @ts-ignore
        referenceImages.push({ name: 'series-dna', data: series.thumbnailUrl })
      }

      const generatedPath = await imageService.generateImage(basePrompt, filename, {
        format: 'png',
        quality: 'medium',
        aspectRatio: '1:1', // Objects are usually square or centered
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined
      })

      if (!generatedPath || !fs.existsSync(generatedPath)) {
        throw new Error("Échec de la génération de l'image.")
      }

      // Upload the image to storage
      const buffer = fs.readFileSync(generatedPath)
      const safeAssetName = assetName.replaceAll(/\s+/g, '-').replaceAll(/[^\w-]/g, '')
      const storagePath = `series/${seriesId}/assets/${safeAssetName}-${Date.now()}.png`
      const newThumbnailUrl = await uploadBuffer(storagePath, buffer, 'image/png')

      // Cleanup local file
      fs.unlinkSync(generatedPath)

      // Update series asset directory
      asset.thumbnailUrl = newThumbnailUrl
      await this.seriesRepository.updateAssetRegistry(seriesId, registry)

      // Consume credits
      const { planConsumed, extraConsumed } = await this.creditsRepository.consumeCredits(userId, cost, planLimit)
      await this.creditsRepository.addTransaction({
        userId,
        type: 'consumption_video_image',
        amount: -cost,
        metadata: { planConsumed, extraConsumed, seriesId, assetName }
      })

      return {
        success: true,
        imageUrl: newThumbnailUrl,
        thumbnailUrl: newThumbnailUrl
      }
    } catch (error) {
      console.error('[RegenerateSeriesAssetImageUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to regenerate asset image'
      }
    }
  }
}
