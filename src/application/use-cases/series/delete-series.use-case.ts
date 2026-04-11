import { IUseCase } from '@/domain/types'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'

type DeleteSeriesParams = {
  userId: string
  seriesId: string
}

type DeleteSeriesResponse = {
  success: boolean
  error?: string
}

export class DeleteSeriesUseCase extends IUseCase<DeleteSeriesParams, DeleteSeriesResponse> {
  private readonly repository = new SeriesRepository()

  async execute({ userId, seriesId }: DeleteSeriesParams): Promise<DeleteSeriesResponse> {
    try {
      const deleted = await this.repository.delete(seriesId, userId)
      if (!deleted) {
        return { success: false, error: 'Series not found or unauthorized' }
      }

      return { success: true }
    } catch (error) {
      console.error('[DeleteSeriesUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete series'
      }
    }
  }
}
