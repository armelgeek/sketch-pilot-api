import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'

export interface SeriesContext {
  seriesId: string
  seriesTitle?: string
  seriesDescription?: string
  fullStory?: string
  totalEpisodes?: number
  episodeNumber: number
  previousEpisodeScript?: any
  cast: Array<{ name: string; description: string }>
}

export class SeriesManager {
  private readonly seriesRepository = new SeriesRepository()
  private readonly characterRepository = new CharacterModelRepository()

  constructor() {}

  /**
   * Resolves the full narrative context for a given series episode.
   */
  async resolveContext(seriesId: string): Promise<SeriesContext> {
    const [lastEpisode, nextNum, seriesData] = await Promise.all([
      this.seriesRepository.getLastEpisode(seriesId),
      this.seriesRepository.getNextEpisodeNumber(seriesId),
      this.seriesRepository.findById(seriesId)
    ])

    if (!seriesData) {
      throw new Error(`Série introuvable: ${seriesId}`)
    }

    const secondaryCharacterIds = (seriesData as any)?.secondaryCharacterIds || []
    let cast: Array<{ name: string; description: string }> = []

    if (secondaryCharacterIds.length > 0) {
      const characters = await this.characterRepository.findByIds(secondaryCharacterIds)
      cast = characters.map((c) => ({
        name: c.name,
        description: c.description || ''
      }))
    }

    return {
      seriesId,
      seriesTitle: seriesData.title,
      seriesDescription: seriesData.description ?? undefined,
      fullStory: seriesData.fullStory ?? undefined,
      totalEpisodes: seriesData.totalEpisodes ?? undefined,
      episodeNumber: nextNum,
      previousEpisodeScript: lastEpisode?.script ?? null,
      cast
    }
  }

  /**
   * Generates a dynamic instruction prompt for auto-continuation.
   */
  getAutoContinuationPrompt(context: SeriesContext): string {
    if (context.episodeNumber === 1) {
      return "Écrivez le PILOT (Épisode 1) de cette saga. Introduisez l'univers, les enjeux et les personnages principaux de manière captivante. Ne résolvez pas tout : posez les fondations d'une grande aventure."
    }

    return `Écrivez l'épisode ${context.episodeNumber} de cette saga. 
        IMPORTANT : Reprenez EXACTEMENT là où l'épisode précédent s'est arrêté. 
        Développez l'intrigue en introduisant un nouveau défi, une révélation ou un rebondissement qui force les personnages à agir. 
        Respectez scrupuleusement le ton et les faits établis.`
  }
}
