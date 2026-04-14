import { SeriesRepository } from '../../../infrastructure/repositories/series.repository'
import { VideoGenerationService } from '../../services/video-generation.service'

export interface RegenerateSeriesVisualsParams {
  userId: string
  seriesId: string
  regenerateScenes?: boolean
}

export class RegenerateSeriesVisualsUseCase {
  private seriesRepository: SeriesRepository
  private videoGenerationService: VideoGenerationService

  constructor() {
    this.seriesRepository = new SeriesRepository()
    this.videoGenerationService = new VideoGenerationService()
  }

  async execute(params: RegenerateSeriesVisualsParams) {
    const { userId, seriesId } = params
    const series = await this.seriesRepository.findById(seriesId)

    if (!series || series.userId !== userId) {
      return { success: false, error: 'Series not found' }
    }

    const visualStyleGuide = series.visualStyleGuide
    const visualStyleModelId = series.visualStyleModelId

    // 1. Regenerate Characters
    const updatedCharacterRegistry = { ...(series.characterRegistry || {}) }
    for (const [name, data] of Object.entries(updatedCharacterRegistry)) {
      if (data.portraitPrompt) {
        try {
          const imageUrl = await this.videoGenerationService.generateCharacterImage({
            prompt: data.portraitPrompt,
            baseModelId: (visualStyleModelId as string) || '',
            visualStyleGuide: (visualStyleGuide as string) || undefined
          })
          updatedCharacterRegistry[name].thumbnailUrl = imageUrl
        } catch (error) {
          console.error(`Failed to regenerate portrait for ${name}:`, error)
        }
      }
    }

    // 2. Regenerate Locations
    const updatedLocationRegistry = { ...(series.locationRegistry || {}) }
    for (const [name, data] of Object.entries(updatedLocationRegistry)) {
      if (data.description) {
        try {
          const imageUrl = await this.videoGenerationService.generateLocationImage({
            name,
            description: data.description,
            visualStyleGuide: (visualStyleGuide as string) || undefined,
            options: {
              characterModelId: (visualStyleModelId as string) || undefined
            }
          })
          updatedLocationRegistry[name].thumbnailUrl = imageUrl
        } catch (error) {
          console.error(`Failed to regenerate location for ${name}:`, error)
        }
      }
    }

    // 3. Regenerate Assets
    const updatedAssetRegistry = { ...(series.assetRegistry || {}) }
    for (const [name, data] of Object.entries(updatedAssetRegistry)) {
      if (data.description) {
        try {
          const imageUrl = await this.videoGenerationService.generateCharacterImage({
            prompt: `Master asset orientation, cinematic shot of: ${data.description}`,
            baseModelId: (visualStyleModelId as string) || '',
            visualStyleGuide: (visualStyleGuide as string) || undefined
          })
          updatedAssetRegistry[name].thumbnailUrl = imageUrl
        } catch (error) {
          console.error(`Failed to regenerate asset for ${name}:`, error)
        }
      }
    }

    // Update Series
    await this.seriesRepository.update(seriesId, {
      characterRegistry: updatedCharacterRegistry,
      locationRegistry: updatedLocationRegistry,
      assetRegistry: updatedAssetRegistry
    })

    return {
      success: true,
      characterRegistry: updatedCharacterRegistry,
      locationRegistry: updatedLocationRegistry,
      assetRegistry: updatedAssetRegistry
    }
  }
}
