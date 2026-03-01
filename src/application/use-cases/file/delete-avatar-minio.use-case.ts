import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { AvatarRepository } from '@/infrastructure/repositories/avatar.repository'
import type { AvatarService } from '@/application/services/avatar.service'

type Params = { id: string }
type Response = { success: boolean; error?: string }

export class DeleteAvatarMinIOUseCase extends IUseCase<Params, Response> {
  constructor(private avatarService: AvatarService) {
    super()
  }

  async execute(data: Params): Promise<Response> {
    const avatarRepository = new AvatarRepository()

    try {
      const deleted = await this.avatarService.deleteAvatar(data.id)
      const avatar = await avatarRepository.findById(data.id)
      if (!avatar) {
        return {
          success: false,
          error: 'Avatar not found'
        }
      }

      await avatarRepository.delete(data.id)

      if (!deleted) {
        return {
          success: false,
          error: 'Avatar not found or could not be deleted'
        }
      }
      return {
        success: true
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete avatar'
      }
    }
  }

  log() {
    return ActivityType.DELETE_AVATAR
  }
}
