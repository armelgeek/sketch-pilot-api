import { IUseCase } from '@/domain/types'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'

type PromoteRegistryItemParams = {
  userId: string
  seriesId: string
  type: 'character' | 'location'
  name: string
  thumbnailUrl: string
}

type PromoteRegistryItemResponse = {
  success: boolean
  error?: string
}

export class PromoteRegistryItemUseCase extends IUseCase<PromoteRegistryItemParams, PromoteRegistryItemResponse> {
  private readonly seriesRepository = new SeriesRepository()

  async execute({
    userId,
    seriesId,
    type,
    name,
    thumbnailUrl
  }: PromoteRegistryItemParams): Promise<PromoteRegistryItemResponse> {
    try {
      const series = await this.seriesRepository.findByIdAndUserId(seriesId, userId)
      if (!series) {
        return { success: false, error: 'Series not found' }
      }

      if (type === 'character') {
        const registry = (series.characterRegistry as Record<string, any>) || {}
        if (!registry[name]) {
          registry[name] = { description: 'Personnage découvert durant la saga.' }
        }
        registry[name].thumbnailUrl = thumbnailUrl
        await this.seriesRepository.updateCharacterRegistry(seriesId, registry)
      } else {
        const registry = (series.locationRegistry as Record<string, any>) || {}
        if (!registry[name]) {
          registry[name] = { description: 'Lieu découvert durant la saga.' }
        }
        registry[name].thumbnailUrl = thumbnailUrl
        await this.seriesRepository.updateLocationRegistry(seriesId, registry)
      }

      return { success: true }
    } catch (error) {
      console.error('[PromoteRegistryItemUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to promote item'
      }
    }
  }
}
