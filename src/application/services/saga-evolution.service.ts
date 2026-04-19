import { SeriesVideoGenerator } from '@sketch-pilot/core/generators/series-video-generator'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

/**
 * SagaEvolutionService
 *
 * Centralise l'évolution de la Saga (registres, cliffhanger, contexte global)
 * après la génération d'un script.
 */
export class SagaEvolutionService {
  private seriesRepository = new SeriesRepository()
  private videoRepository = new VideoRepository()

  /**
   * Synchronise le contexte de la saga à partir d'un nouveau script généré.
   */
  async syncContext(seriesId: string, videoId: string, script: any) {
    console.info(`[SagaEvolutionService] Syncing context for series ${seriesId} / video ${videoId}...`)

    const currentContext = await this.seriesRepository.getSeriesContext(seriesId)
    if (!currentContext) {
      console.warn(`[SagaEvolutionService] Series ${seriesId} not found.`)
      return
    }

    const updatedContext = SeriesVideoGenerator.updateContext(currentContext as any, script)

    // 1. Propagate narrative state
    await this.seriesRepository.updateNarrativeContext(seriesId, {
      lastCliffhanger: updatedContext.lastCliffhanger,
      unresolvedThreads: updatedContext.unresolvedThreads
    })

    // 2. Update Series record with registries and evolutions
    await this.seriesRepository.update(seriesId, {
      characterRegistry: updatedContext.characterRegistry,
      locationRegistry: updatedContext.locationRegistry,
      assetRegistry: updatedContext.assetRegistry,
      visualEvolution: updatedContext.visualEvolution,
      relationshipMap: updatedContext.relationshipMap,
      assetEvolution: updatedContext.assetEvolution,
      lastCliffhanger: updatedContext.lastCliffhanger,
      weatherState: updatedContext.weatherState,
      timeOfDay: updatedContext.timeOfDay,
      unresolvedThreads: updatedContext.unresolvedThreads,
      threads: updatedContext.threads,
      roadmap: updatedContext.roadmap,
      globalContext: updatedContext.globalContext,
      previousEpisodesContext: updatedContext.previousEpisodesContext,
      lastEpisodeNumber: String(updatedContext.episodeNumber),
      narrationLayer: updatedContext.narrationLayer
    })

    // 3. Update video record for UI consistency
    const episodeTitle = script.titles?.[0] || (script.seriesMetadata as any)?.title
    await this.videoRepository.updateStatus(videoId, {
      title: episodeTitle,
      characterRegistry: updatedContext.characterRegistry,
      locationRegistry: updatedContext.locationRegistry,
      assetRegistry: updatedContext.assetRegistry,
      previousEpisodesContext: updatedContext.previousEpisodesContext,
      globalContext: updatedContext.globalContext,
      lastCliffhanger: updatedContext.lastCliffhanger,
      narrationLayer: updatedContext.narrationLayer
    })

    console.info(`[SagaEvolutionService] Context sync complete for ${seriesId}.`)
    return updatedContext
  }
}
