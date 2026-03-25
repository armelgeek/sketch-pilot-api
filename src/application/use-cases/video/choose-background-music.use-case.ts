import { AssetsConfigRepository } from '@/infrastructure/repositories/assets-config.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { VideoGenerationOptions } from '../../../../plugins/sketch-pilot/src/types/video-script.types'

export interface ChooseBackgroundMusicInput {
  videoId: string
  userId: string
  musicId: string // The trackId (e.g. 'lofi-1'), or empty string to clear music
}

export interface ChooseBackgroundMusicResult {
  success: boolean
  error?: string
  video?: any
}

const videoRepository = new VideoRepository()
const assetsConfigRepository = new AssetsConfigRepository()

export class ChooseBackgroundMusicUseCase {
  async run(input: ChooseBackgroundMusicInput): Promise<ChooseBackgroundMusicResult> {
    const { videoId, userId, musicId } = input

    let validTrackId: string | undefined

    if (musicId) {
      // Validate track against the database
      const track = await assetsConfigRepository.getMusicTrackById(musicId)
      if (!track || !track.isActive) {
        return {
          success: false,
          error: `Invalid music track ID: "${musicId}". Use GET /v1/config/music to retrieve available options.`
        }
      }
      validTrackId = track.trackId
    }
    // If musicId is empty, validTrackId stays undefined → clears music

    // Get the video
    const video = await videoRepository.findByIdAndUserId(videoId, userId)
    if (!video) {
      return { success: false, error: 'Video not found' }
    }

    // Update options
    const currentOptions = (video.options || {}) as unknown as VideoGenerationOptions
    const updatedOptions: Partial<VideoGenerationOptions> = {
      ...currentOptions,
      backgroundMusic: validTrackId
    }

    const updatedVideo = await videoRepository.update(videoId, {
      options: updatedOptions as any
    })

    return {
      success: true,
      video: updatedVideo
    }
  }
}
