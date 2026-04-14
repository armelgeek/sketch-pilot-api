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

type GenerateLocationImageParams = {
  userId: string
  seriesId: string
  locationName: string
  visualStyleGuide?: string
  visualStyleModelId?: string
  seriesThumbnailUrl?: string
  videoGenre?: string
}

type GenerateLocationImageResponse = {
  success: boolean
  thumbnailUrl?: string
  error?: string
  insufficientCredits?: boolean
}

export class GenerateLocationImageUseCase extends IUseCase<GenerateLocationImageParams, GenerateLocationImageResponse> {
  private readonly seriesRepository = new SeriesRepository()
  private readonly creditsRepository = new CreditsRepository()
  private readonly characterModelRepository = new CharacterModelRepository()

  async execute({
    userId,
    seriesId,
    locationName,
    visualStyleGuide,
    visualStyleModelId,
    seriesThumbnailUrl,
    videoGenre
  }: GenerateLocationImageParams): Promise<GenerateLocationImageResponse> {
    try {
      const series = await this.seriesRepository.findById(seriesId)
      if (!series || (series.userId !== userId && userId !== 'system')) {
        throw new Error('Saga non trouvée ou non autorisée.')
      }

      const registry = series.locationRegistry as Record<string, any>
      if (!registry || !registry[locationName]) {
        throw new Error(`Lieu ${locationName} introuvable dans la Saga.`)
      }

      const location = registry[locationName]
      const description = location.description

      if (!description) {
        throw new Error('Aucune description visuelle disponible pour ce lieu.')
      }

      // Deduct credits (landscape generation = 2 credits)
      const cost = 2
      // skip credit check if system (e.g. during preparation if already paid)
      if (userId !== 'system') {
        const credits = await this.creditsRepository.ensureUserCredits(userId)
        const planLimit = await this.creditsRepository.getCurrentPlanLimit(userId)
        const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

        if (totalAvailable < cost) {
          return { success: false, insufficientCredits: true, error: "Crédits insuffisants pour générer l'image." }
        }
      }

      // Instantiate Gemini Image Service
      const imageService = await ImageServiceFactory.create({
        provider: 'gemini',
        apiKey: process.env.GEMINI_API_KEY || ''
      })

      // Generate temporary filename
      const filename = path.join(os.tmpdir(), `loc-gen-${Date.now()}-${Math.random().toString(36).slice(7)}.png`)

      // Refined location prompt for Master Asset
      let basePrompt = `Landscape orientation, cinematic master shot of: ${description}`
      const effectiveStyleGuide = visualStyleGuide || series.visualStyleGuide
      const effectiveGenre = videoGenre || series.videoGenre

      if (effectiveStyleGuide) {
        basePrompt += `\n\nStyle Guide: ${effectiveStyleGuide}`
      }
      if (effectiveGenre) {
        basePrompt += `, Style: ${effectiveGenre}`
      }

      // Anchoring references
      const referenceImages: { name?: string; data: string }[] = []
      const effectiveSeriesThumbnail = seriesThumbnailUrl || series.thumbnailUrl
      if (effectiveSeriesThumbnail) {
        referenceImages.push({ name: 'series-dna', data: effectiveSeriesThumbnail })
      }

      const effectiveStyleModelId = visualStyleModelId || series.visualStyleModelId
      if (effectiveStyleModelId) {
        const styleModel = await this.characterModelRepository.findById(effectiveStyleModelId)
        const styleImageUrl = styleModel?.images?.[0] || styleModel?.thumbnailUrl
        if (styleImageUrl) {
          referenceImages.push({ name: 'global-style', data: styleImageUrl })
        }
      }

      const generatedPath = await imageService.generateImage(basePrompt, filename, {
        format: 'png',
        quality: 'medium',
        aspectRatio: '16:9', // Locations are always landscape
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined
      })

      if (!generatedPath || !fs.existsSync(generatedPath)) {
        throw new Error("Échec de la génération de l'image.")
      }

      // Upload the image to storage
      const buffer = fs.readFileSync(generatedPath)
      const safeLocName = locationName.replaceAll(/\s+/g, '-').replaceAll(/[^\w-]/g, '')
      const storagePath = `series/${seriesId}/locations/${safeLocName}-${Date.now()}.png`
      const newThumbnailUrl = await uploadBuffer(storagePath, buffer, 'image/png')

      // Cleanup local file
      fs.unlinkSync(generatedPath)

      // Update series location registry
      location.thumbnailUrl = newThumbnailUrl
      await this.seriesRepository.updateLocationRegistry(seriesId, registry)

      // Consume credits
      if (userId !== 'system') {
        const planLimit = await this.creditsRepository.getCurrentPlanLimit(userId)
        const { planConsumed, extraConsumed } = await this.creditsRepository.consumeCredits(userId, cost, planLimit)
        await this.creditsRepository.addTransaction({
          userId,
          type: 'consumption_video_image',
          amount: -cost,
          metadata: { planConsumed, extraConsumed, seriesId, locationName }
        })
      }

      return {
        success: true,
        thumbnailUrl: newThumbnailUrl
      }
    } catch (error) {
      console.error('[GenerateLocationImageUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate location image'
      }
    }
  }
}
