import { QuotesVideoGenerator } from './quotes-video-generator'
import { SeriesVideoGenerator } from './series-video-generator'
import { StandaloneVideoGenerator } from './standalone-video-generator'
import type { VideoGenerator, VideoGeneratorConfig } from './video-generator.abstract'

export const VideoGeneratorFactory = {
  create(config: VideoGeneratorConfig, extraOptions: Record<string, any> = {}): VideoGenerator {
    // Support both extraOptions (legacy/direct) and config.seriesContext (new preferred)
    const seriesId = extraOptions.seriesId || config.seriesContext?.seriesId
    if (seriesId) {
      const sc = (config.seriesContext || {}) as any
      return new SeriesVideoGenerator(config, {
        seriesId,
        episodeNumber: extraOptions.episodeNumber || sc.episodeNumber || 1,
        globalContext: extraOptions.globalContext || sc.globalContext,
        previousEpisodesContext: extraOptions.previousEpisodesContext || sc.previousEpisodesContext || '',
        characterRegistry: extraOptions.characterRegistry || sc.characterRegistry || {},
        locationRegistry: extraOptions.locationRegistry || sc.locationRegistry || {},
        lastCliffhanger: extraOptions.lastCliffhanger || sc.lastCliffhanger,
        unresolvedThreads: extraOptions.unresolvedThreads || sc.unresolvedThreads,
        totalEpisodes: extraOptions.totalEpisodes || sc.totalEpisodes,
        isFinalEpisode: !!(extraOptions.isFinalEpisode || sc.isFinalEpisode),
        visualStyleModelId: extraOptions.visualStyleModelId || sc.visualStyleModelId
      } as any)
    }

    if (extraOptions.isQuotes || extraOptions.type === 'quotes') {
      return new QuotesVideoGenerator(config)
    }

    return new StandaloneVideoGenerator(config)
  }
}
