import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import {
  brandingConfigSchema,
  type BrandingConfig,
  type VideoGenerationOptions
} from '../../../../plugins/sketch-pilot/src/types/video-script.types'

export interface ConfigureBrandingInput {
  videoId: string
  userId: string
  brandingConfig: Partial<BrandingConfig>
}

export interface ConfigureBrandingResult {
  success: boolean
  error?: string
  video?: any
}

export class ConfigureBrandingUseCase {
  private videoRepository: VideoRepository

  constructor() {
    this.videoRepository = new VideoRepository()
  }

  async run(input: ConfigureBrandingInput): Promise<ConfigureBrandingResult> {
    const { videoId, userId, brandingConfig } = input

    // Validate the partial config using Zod
    const validationResult = brandingConfigSchema.partial().safeParse(brandingConfig)
    if (!validationResult.success) {
      return {
        success: false,
        error: `Invalid branding configuration: ${validationResult.error.message}`
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

    // Merge existing branding config with the new partial config
    const currentBrandingConfig = currentOptions.branding || {}
    const updatedBrandingConfig: BrandingConfig = {
      position: 'bottom-right',
      opacity: 0.5,
      scale: 0.15,
      ...currentBrandingConfig,
      ...(validConfig as any)
    }

    const updatedOptions: Partial<VideoGenerationOptions> = {
      ...currentOptions,
      branding: updatedBrandingConfig
    }

    const updatedVideo = await this.videoRepository.update(videoId, {
      options: updatedOptions as any
    })

    return {
      success: true,
      video: updatedVideo
    }
  }
}
