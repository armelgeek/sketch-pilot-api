import { IUseCase } from '@/domain/types'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type UpdateVideoParams = {
  videoId: string
  userId: string
  data: {
    script?: any
    options?: any
    topic?: string
    status?: string
  }
}

type UpdateVideoResponse = {
  success: boolean
  video?: any
  error?: string
}

const videoRepository = new VideoRepository()

export class UpdateVideoUseCase extends IUseCase<UpdateVideoParams, UpdateVideoResponse> {
  async execute({ videoId, userId, data }: UpdateVideoParams): Promise<UpdateVideoResponse> {
    try {
      // 1. Check if video exists and belongs to user
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) {
        return { success: false, error: 'Video not found' }
      }

      // 2. Update the video
      const updatedVideo = await videoRepository.update(videoId, data)

      return {
        success: true,
        video: updatedVideo
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update video'
      }
    }
  }
}
