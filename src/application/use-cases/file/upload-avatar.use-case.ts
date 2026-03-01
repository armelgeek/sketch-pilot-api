import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { FileService } from '@/application/services/file.service'
import type { Avatar } from '@/domain/models/avatar.model'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

type Params = {
  file: File
  currentUserId: string
}

type Response = {
  data: Avatar
  success: boolean
  error?: string
}

export class UploadAvatarUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly fileService: FileService,
    private readonly userRepository: UserRepositoryInterface
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const user = await this.userRepository.findById(params.currentUserId)
    if (!user) {
      throw new Error('Unauthorized')
    }

    this.fileService.validateFile({ size: params.file.size, mimetype: params.file.type })

    const arrayBuffer = await params.file.arrayBuffer()

    const avatar = await this.fileService.saveAvatar({
      buffer: arrayBuffer,
      mimetype: params.file.type
    })

    return {
      success: true,
      data: avatar
    }
  }

  log(): ActivityType {
    return ActivityType.CREATE_AVATAR
  }
}
