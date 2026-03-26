import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import {
  assCaptionConfigSchema,
  type AssCaptionConfig,
  type VideoGenerationOptions
} from '../../../../plugins/sketch-pilot/src/types/video-script.types'

export interface ConfigureCaptionsInput {
  videoId: string
  userId: string
  captionsConfig: Partial<AssCaptionConfig>
}

export interface ConfigureCaptionsResult {
  success: boolean
  error?: string
  video?: any
}

export class ConfigureCaptionsUseCase {
  private videoRepository: VideoRepository

  constructor() {
    this.videoRepository = new VideoRepository()
  }

  async run(input: ConfigureCaptionsInput): Promise<ConfigureCaptionsResult> {
    const { videoId, userId, captionsConfig } = input

    // Validate the partial config using Zod
    const validationResult = assCaptionConfigSchema.partial().safeParse(captionsConfig)
    if (!validationResult.success) {
      return {
        success: false,
        error: `Invalid caption configuration: ${validationResult.error.message}`
      }
    }

    const validConfig = validationResult.data

    // Get the video
    const video = await this.videoRepository.findByIdAndUserId(videoId, userId)
    if (!video) {
      return { success: false, error: 'Video not found' }
    }

    // Update options
    const currentOptions: VideoGenerationOptions = (video.options || {}) as VideoGenerationOptions

    // Merge existing captions config with the new partial config
    const currentCaptionsConfig: Partial<AssCaptionConfig> = currentOptions.assCaptions || {}
    const updatedCaptionsConfig: AssCaptionConfig = {
      style: 'colored',
      fontFamily: 'Montserrat',
      position: 'bottom',
      highlightColor: '#FFE135',
      ...currentCaptionsConfig,
      ...validConfig
    }

    const updatedOptions: Partial<VideoGenerationOptions> = {
      ...currentOptions,
      assCaptions: updatedCaptionsConfig
    }

    const updatedVideo = await this.videoRepository.updateStatus(videoId, {
      options: updatedOptions as any
    })

    return {
      success: true,
      video: updatedVideo
    }
  }
}
