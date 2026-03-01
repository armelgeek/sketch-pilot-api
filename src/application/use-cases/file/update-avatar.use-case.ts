import { AvatarService } from '@/application/services/avatar.service'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { AvatarRepositoryInterface } from '@/domain/repositories/avatar.repository.interface'

type Params = {
  id: string
  file: File
  currentUserId: string
}

type Response = {
  success: boolean
  data?: {
    id: string
    path: string
  }
  error?: string
}

export class UpdateAvatarUseCase extends IUseCase<Params, Response> {
  constructor(private readonly avatarRepository: AvatarRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const existingAvatar = await this.avatarRepository.findById(params.id)
    if (!existingAvatar) {
      throw new Error('Avatar not found')
    }
    const avatarService = new AvatarService()
    const result = await avatarService.uploadAvatar(params.file)
    const updatedAvatar = await this.avatarRepository.save({
      id: existingAvatar.id,
      path: result.url
    })

    return {
      success: true,
      data: updatedAvatar
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_AVATAR
  }
}
