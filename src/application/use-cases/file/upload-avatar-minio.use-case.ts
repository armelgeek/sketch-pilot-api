import { randomUUID } from 'node:crypto'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { AvatarRepository } from '@/infrastructure/repositories/avatar.repository'
import type { AvatarService } from '@/application/services/avatar.service'

type Params = {
  file: File
}

type Response = {
  success: boolean
  data?: { id: string; url: string }
  error?: string
}

export class UploadAvatarMinIOUseCase extends IUseCase<Params, Response> {
  constructor(private avatarService: AvatarService) {
    super()
  }

  async execute(data: Params): Promise<Response> {
    try {
      const avatarRepository = new AvatarRepository()
      const result = await this.avatarService.uploadAvatar(data.file)
      await avatarRepository.save({
        path: result.url,
        id: randomUUID()
      })
      return {
        success: true,
        data: result
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to upload avatar'
      }
    }
  }

  log() {
    return ActivityType.CREATE_AVATAR
  }
}
