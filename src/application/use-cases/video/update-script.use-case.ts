import { IUseCase } from '@/domain/types'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type UpdateScriptParams = {
  videoId: string
  userId: string
  scriptUpdates: Record<string, any> // The modified CompleteVideoScript object
}

type UpdateScriptResponse = {
  success: boolean
  error?: string
}

const videoRepository = new VideoRepository()

export class UpdateScriptUseCase extends IUseCase<UpdateScriptParams, UpdateScriptResponse> {
  async execute({ videoId, userId, scriptUpdates }: UpdateScriptParams): Promise<UpdateScriptResponse> {
    try {
      // 1. Validate video exists and belongs to user
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) {
        return { success: false, error: 'Video not found or unauthorized' }
      }

      // 2. We only allow script updates if the video is in a state where it's safe to edit
      const editableStatuses = ['scenes_generated', 'script_generated', 'failed']
      if (!editableStatuses.includes(video.status)) {
        return {
          success: false,
          error: `Cannot update script while video is in '${video.status}' state.`
        }
      }

      // 3. Ensure we have scenes to update
      if (!scriptUpdates || !Array.isArray(scriptUpdates.scenes)) {
        return { success: false, error: 'Invalid script format: missing scenes array.' }
      }

      // 4. Clean up any potential dangerous fields or perform specific scene-level validations here if needed
      // (e.g. recalculating totalDuration based on individual scene durations)

      const scenes = scriptUpdates.scenes

      // 5. Update BOTH script and scenes columns to maintain sync
      // The video repository updateStatus method handles jsonb deep merges if structured properly,
      // but passing the full object replaces the column at the top level
      await videoRepository.updateStatus(videoId, {
        script: scriptUpdates,
        scenes
      })

      return { success: true }
    } catch (error) {
      console.error('[UpdateScriptUseCase] Failed to update script:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update video script'
      }
    }
  }
}
