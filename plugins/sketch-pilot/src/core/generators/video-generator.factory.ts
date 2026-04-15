import { QuotesVideoGenerator } from './quotes-video-generator'
import { SeriesVideoGenerator } from './series-video-generator'
import { StandaloneVideoGenerator } from './standalone-video-generator'
import type { VideoGenerator, VideoGeneratorConfig } from './video-generator.abstract'

export const VideoGeneratorFactory = {
  create(config: VideoGeneratorConfig, extraOptions: Record<string, any> = {}): VideoGenerator {
    // Support both extraOptions (legacy/direct) and config.seriesContext (new preferred)
    const seriesId = extraOptions.seriesId || config.seriesContext?.seriesId
    if (seriesId) {
      console.log(`[VideoGeneratorFactory] Creating SeriesVideoGenerator for series ${seriesId}`)
      const sc = (config.seriesContext || {}) as any
      const charCount = Object.keys(
        extraOptions.characterRegistry || sc.characterRegistry || config.characterRegistry || {}
      ).length
      const assetCount = Object.keys(
        extraOptions.assetRegistry || sc.assetRegistry || config.assetRegistry || {}
      ).length
      return new SeriesVideoGenerator(config, {
        ...sc,
        seriesId,
        episodeNumber: extraOptions.episodeNumber || sc.episodeNumber || 1,
        globalContext: extraOptions.globalContext || sc.globalContext,
        previousEpisodesContext: extraOptions.previousEpisodesContext || sc.previousEpisodesContext || '',
        characterRegistry: extraOptions.characterRegistry || sc.characterRegistry || config.characterRegistry || {},
        locationRegistry: extraOptions.locationRegistry || sc.locationRegistry || config.locationRegistry || {},
        assetRegistry: extraOptions.assetRegistry || sc.assetRegistry || config.assetRegistry || {},
        lastCliffhanger: extraOptions.lastCliffhanger || sc.lastCliffhanger,
        unresolvedThreads: extraOptions.unresolvedThreads || sc.unresolvedThreads,
        totalEpisodes: extraOptions.totalEpisodes || sc.totalEpisodes,
        isFinalEpisode: !!(extraOptions.isFinalEpisode || sc.isFinalEpisode),
        characterModelId: extraOptions.characterModelId || sc.characterModelId,
        lastEpisodeFinalImage: extraOptions.lastEpisodeFinalImage || sc.lastEpisodeFinalImage,
        lastEpisodeFinalScene: extraOptions.lastEpisodeFinalScene || sc.lastEpisodeFinalScene
      } as any)
    }

    if (extraOptions.isQuotes || extraOptions.type === 'quotes') {
      return new QuotesVideoGenerator(config)
    }

    return new StandaloneVideoGenerator(config)
  }
}
