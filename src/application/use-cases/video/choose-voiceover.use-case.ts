import { AssetsConfigRepository } from '@/infrastructure/repositories/assets-config.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { VideoGenerationOptions } from '../../../../plugins/sketch-pilot/src/types/video-script.types'

export interface ChooseVoiceoverInput {
  videoId: string
  userId: string
  voicePreset: string
}

export interface ChooseVoiceoverResult {
  success: boolean
  error?: string
  video?: any
}

const videoRepository = new VideoRepository()
const assetsConfigRepository = new AssetsConfigRepository()

export class ChooseVoiceoverUseCase {
  async run(input: ChooseVoiceoverInput): Promise<ChooseVoiceoverResult> {
    const { videoId, userId, voicePreset } = input

    // Validate the voice preset against the database
    const voice = await assetsConfigRepository.getVoiceByPresetId(voicePreset)
    if (!voice || !voice.isActive) {
      return {
        success: false,
        error: `Invalid voice preset: "${voicePreset}". Use GET /v1/config/voices to retrieve available options.`
      }
    }

    // Get the video
    const video = await videoRepository.findByIdAndUserId(videoId, userId)
    if (!video) {
      return { success: false, error: 'Video not found' }
    }

    // Update options
    const currentOptions = (video.options || {}) as unknown as VideoGenerationOptions
    const updatedOptions: Partial<VideoGenerationOptions> = {
      ...currentOptions,
      kokoroVoicePreset: voice.presetId as any,
      audioProvider: voice.provider as any
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
