import * as fs from 'node:fs'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { IUseCase } from '@/domain/types'
import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'

type PrepareSagaPortraitsParams = {
  userId: string
  seriesId: string
  characterModelId?: string
}

export class PrepareSagaPortraitsUseCase extends IUseCase<PrepareSagaPortraitsParams, any> {
  private readonly seriesRepository = new SeriesRepository()
  private readonly characterModelRepository = new CharacterModelRepository()
  private readonly videoGenerationService = new VideoGenerationService()

  constructor() {
    super()
  }

  async execute(params: PrepareSagaPortraitsParams) {
    try {
      console.info(`[PrepareSagaPortraits] Generating portraits for series ${params.seriesId}...`)
      const series = await this.seriesRepository.findById(params.seriesId)
      if (!series) throw new Error('Series not found')

      const characterRegistry = (series.characterRegistry as Record<string, any>) || {}
      const charactersToGenerate = Object.entries(characterRegistry).filter(
        ([, data]: [string, any]) => !data.thumbnailUrl
      )

      if (charactersToGenerate.length === 0) {
        return { success: true, message: 'All portraits already exist', characterRegistry }
      }

      const standardModels = await this.characterModelRepository.findAllStandard()
      const baseModelId = params.characterModelId || standardModels[0]?.id || 'default-model'
      const seriesReferenceImage = series.thumbnailUrl || undefined

      for (const [name, data] of charactersToGenerate) {
        const charData = data as any
        try {
          const portraitPrompt =
            (charData.portraitPrompt || charData.description || name).replace(/^undefined\s*/i, '').trim() || name
          const imagePath = await this.videoGenerationService.generateCharacterImage({
            prompt: portraitPrompt,
            baseModelId,
            referenceImages: seriesReferenceImage ? [{ name: 'series-style', data: seriesReferenceImage }] : []
          })

          if (imagePath && fs.existsSync(imagePath)) {
            const buffer = fs.readFileSync(imagePath)
            const safeName = name.replaceAll(/\s+/g, '-').replaceAll(/[^\w-]/g, '')
            const storagePath = `series/previews/characters/${safeName}-${Date.now()}.webp`
            const url = await uploadBuffer(storagePath, buffer, 'image/webp')

            charData.thumbnailUrl = url
            fs.unlinkSync(imagePath)
          }
        } catch (error) {
          console.error(`[PrepareSagaPortraits] ❌ Failed for ${name}:`, error)
        }
      }

      // Update series with updated registry (including new thumbnail URLs)
      await this.seriesRepository.update(params.seriesId, {
        characterRegistry,
        thumbnailUrl: series.thumbnailUrl || Object.values(characterRegistry)[0]?.thumbnailUrl
      })

      return {
        success: true,
        seriesId: params.seriesId,
        characterRegistry
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate portraits'
      }
    }
  }
}
