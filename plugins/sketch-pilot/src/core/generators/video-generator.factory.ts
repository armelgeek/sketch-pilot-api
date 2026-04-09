import { QuotesVideoGenerator } from './quotes-video-generator'
import { SeriesVideoGenerator } from './series-video-generator'
import { StandaloneVideoGenerator } from './standalone-video-generator'
import type { VideoGenerator, VideoGeneratorConfig } from './video-generator.abstract'

export const VideoGeneratorFactory = {
  create(config: VideoGeneratorConfig, extraOptions: Record<string, any> = {}): VideoGenerator {
    if (extraOptions.seriesId) {
      return new SeriesVideoGenerator(config, {
        seriesId: extraOptions.seriesId,
        episodeNumber: extraOptions.episodeNumber || 1,
        previousEpisodesContext: extraOptions.previousEpisodesContext || '',
        characterRegistry: extraOptions.characterRegistry || {},
        totalEpisodes: extraOptions.totalEpisodes,
        isFinalEpisode: !!extraOptions.isFinalEpisode
      })
    }

    if (extraOptions.isQuotes || extraOptions.type === 'quotes') {
      return new QuotesVideoGenerator(config)
    }

    return new StandaloneVideoGenerator(config)
  }
}
