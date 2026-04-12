import { IUseCase } from '@/domain/types'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import { GenerateVideoUseCase } from '../video/generate-video.use-case'

type GenerateNextEpisodeParams = {
  userId: string
  seriesId: string
  planId?: string
}

type GenerateNextEpisodeResponse = {
  success: boolean
  jobId?: string
  videoId?: string
  error?: string
  episodeNumber?: number
  topic?: string
}

export class GenerateNextEpisodeUseCase extends IUseCase<GenerateNextEpisodeParams, GenerateNextEpisodeResponse> {
  private readonly seriesRepository = new SeriesRepository()
  private readonly generateVideoUseCase = new GenerateVideoUseCase()

  async execute({ userId, seriesId, planId }: GenerateNextEpisodeParams): Promise<GenerateNextEpisodeResponse> {
    try {
      const series = await this.seriesRepository.findByIdAndUserId(seriesId, userId)
      if (!series) {
        return { success: false, error: 'Series not found' }
      }

      const nextEpisodeNumber = Number(series.lastEpisodeNumber || 0) + 1
      const plannedEpisodes = (series.plannedEpisodes as any[]) || []

      // Try to find the planned episode in the roadmap
      const planned = plannedEpisodes.find((e) => e.number === nextEpisodeNumber)

      let topic = ''
      if (planned) {
        topic = `${planned.title}: ${planned.hook}`
      } else {
        // Fallback: If no planned episode found, ask AI to generate the logical next one
        // For now, we simple-default or fail if the user wants strict management
        topic = `Épisode ${nextEpisodeNumber}`
      }

      console.info(`[GenerateNextEpisode] Starting episode ${nextEpisodeNumber} for series ${seriesId}: ${topic}`)

      const result = await this.generateVideoUseCase.execute({
        userId,
        planId,
        topic,
        options: {
          seriesId,
          type: 'series',
          episodeNumber: nextEpisodeNumber,
          scriptOnly: true
        }
      })

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        jobId: result.jobId,
        videoId: result.videoId,
        episodeNumber: nextEpisodeNumber,
        topic
      }
    } catch (error) {
      console.error('[GenerateNextEpisodeUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate next episode'
      }
    }
  }
}
