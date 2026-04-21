import { and, eq, notInArray } from 'drizzle-orm'
import { IUseCase } from '@/domain/types'
import { db } from '@/infrastructure/database/db'
import { videos } from '@/infrastructure/database/schema'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import { GenerateVideoUseCase } from '../video/generate-video.use-case'
import type { SagaProductionService } from '../../../../plugins/sketch-pilot/src/plugins/vimax/services/saga-production.service'

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

  constructor(private readonly sagaProductionService: SagaProductionService) {
    super()
  }

  async execute({ userId, seriesId, planId }: GenerateNextEpisodeParams): Promise<GenerateNextEpisodeResponse> {
    try {
      const series = await this.seriesRepository.findByIdAndUserId(seriesId, userId)
      if (!series) {
        return { success: false, error: 'Series not found' }
      }

      const latestContext = await this.seriesRepository.getSeriesContext(seriesId)
      if (!latestContext) {
        return { success: false, error: 'Failed to retrieve series context' }
      }

      // 🛡️ NARRATIVE GUARD: Check if an episode is already generating
      const incompleteVideos = await db
        .select()
        .from(videos)
        .where(and(eq(videos.seriesId, seriesId), notInArray(videos.status, ['completed', 'failed', 'cancelled'])))
        .limit(1)

      if (incompleteVideos.length > 0) {
        return {
          success: false,
          error: `Un épisode (${incompleteVideos[0].episodeNumber}) est déjà en cours de génération. Veuillez attendre sa fin pour garantir la continuité narrative.`
        }
      }

      const nextEpisodeNumber = latestContext.episodeNumber
      const plannedEpisodes = (series.plannedEpisodes as any[]) || []

      // Try to find the planned episode in the roadmap
      const planned = plannedEpisodes.find((e) => e.number === nextEpisodeNumber)

      let topic = ''
      let displayTitle = `Épisode ${nextEpisodeNumber}`

      if (planned) {
        displayTitle = planned.title
        const isFirst = nextEpisodeNumber === 1
        const intensityInstr = isFirst
          ? "🚨 OUVERTURE SAGA : Ne commencez pas par un résumé. Plongez dans l'action avec une intensité sensorielle maximale (froid, bruit, odeur, tension)."
          : '🚨 REPRISE : Maintenez le momentum du cliffhanger précédent.'

        topic = `MISSION NARRATIVE : Suivez scrupuleusement le plan prévu pour cet épisode. ${intensityInstr}
          TITRE PRÉVU : ${planned.title}
          PITCH / INTRIGUE : ${planned.hook}`
      } else {
        topic = `Épisode ${nextEpisodeNumber}`
      }

      console.info(`[GenerateNextEpisode] Starting episode ${nextEpisodeNumber} for series ${seriesId}: ${topic}`)

      // --- [VIMAX INTEGRATION] ---
      // We use the SagaProductionService to produce the high-fidelity script and scenes
      console.info(`[GenerateNextEpisode] ⚡ Orchestrating Vimax for episode ${nextEpisodeNumber}...`)
      const vimaxEpisode = await this.sagaProductionService.generateEpisode(userId, seriesId, nextEpisodeNumber)

      const result = await this.generateVideoUseCase.execute({
        userId,
        planId,
        topic,
        options: {
          seriesId,
          type: 'series',
          title: displayTitle,
          episodeNumber: nextEpisodeNumber,
          scriptOnly: false, // Now we have a real script from Vimax
          vimaxData: vimaxEpisode // Pass the generated episode data if needed
        } as any
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
