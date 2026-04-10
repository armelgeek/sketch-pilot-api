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

type RegenerateSeriesCharacterImageParams = {
  userId: string
  seriesId: string
  characterName: string
}

type RegenerateSeriesCharacterImageResponse = {
  success: boolean
  thumbnailUrl?: string
  error?: string
  insufficientCredits?: boolean
}

export class RegenerateSeriesCharacterImageUseCase extends IUseCase<
  RegenerateSeriesCharacterImageParams,
  RegenerateSeriesCharacterImageResponse
> {
  private readonly seriesRepository = new SeriesRepository()
  private readonly creditsRepository = new CreditsRepository()
  private readonly characterModelRepository = new CharacterModelRepository()

  async execute({
    userId,
    seriesId,
    characterName
  }: RegenerateSeriesCharacterImageParams): Promise<RegenerateSeriesCharacterImageResponse> {
    try {
      const series = await this.seriesRepository.findById(seriesId)
      if (!series || series.userId !== userId) {
        throw new Error('Saga non trouvée ou non autorisée.')
      }

      const registry = series.characterRegistry as Record<string, any>
      if (!registry || !registry[characterName]) {
        throw new Error(`Personnage ${characterName} introuvable dans la Saga.`)
      }

      const character = registry[characterName]
      const portraitPrompt = character.portraitPrompt || character.description

      if (!portraitPrompt) {
        throw new Error('Aucune description visuelle (portraitPrompt) disponible pour ce personnage.')
      }

      // Deduct credits for character generation (cost = 2 credits as per usual)
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
      const filename = path.join(os.tmpdir(), `char-gen-${Date.now()}-${Math.random().toString(36).slice(7)}.png`)

      // We augment the prompt with the global rules of the series if available
      let basePrompt = portraitPrompt
      if (series.videoGenre) {
        basePrompt += `, Style: ${series.videoGenre}`
      }

      // Build reference images — priority: global visual style model > individual character thumbnail
      const referenceImages: { name?: string; data: string }[] = []

      // 1. Global visual style from the saga's visualStyleModelId (e.g. stickman)
      if (series.visualStyleModelId) {
        const styleModel = await this.characterModelRepository.findById(series.visualStyleModelId)
        const styleImageUrl = styleModel?.images?.[0] || styleModel?.thumbnailUrl
        if (styleImageUrl) {
          referenceImages.push({ name: 'global-style', data: styleImageUrl })
        }
      }

      // 2. Existing character portrait as secondary consistency anchor
      if (character.thumbnailUrl) {
        referenceImages.push({ name: characterName, data: character.thumbnailUrl })
      }

      const generatedPath = await imageService.generateImage(basePrompt, filename, {
        format: 'png',
        quality: 'medium',
        aspectRatio: '1:1',
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined
      })

      if (!generatedPath || !fs.existsSync(generatedPath)) {
        throw new Error("Échec de la génération de l'image.")
      }

      // Upload the image to storage
      const buffer = fs.readFileSync(generatedPath)
      const safeCharName = characterName.replaceAll(/\s+/g, '-').replaceAll(/[^\w-]/g, '')
      const storagePath = `series/${seriesId}/characters/${safeCharName}-${Date.now()}.png`
      const newThumbnailUrl = await uploadBuffer(storagePath, buffer, 'image/png')

      // Cleanup local file
      fs.unlinkSync(generatedPath)

      // Update series character directory
      character.thumbnailUrl = newThumbnailUrl
      await this.seriesRepository.updateCharacterRegistry(seriesId, registry)

      // Consume credits
      const { planConsumed, extraConsumed } = await this.creditsRepository.consumeCredits(userId, cost, planLimit)
      await this.creditsRepository.addTransaction({
        userId,
        type: 'consumption_video_image',
        amount: -cost,
        metadata: { planConsumed, extraConsumed, seriesId, characterName }
      })

      return {
        success: true,
        thumbnailUrl: newThumbnailUrl
      }
    } catch (error) {
      console.error('[RegenerateSeriesCharacterImageUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to regenerate character image'
      }
    }
  }
}
