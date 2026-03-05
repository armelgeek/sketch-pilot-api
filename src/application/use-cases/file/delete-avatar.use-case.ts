import { IUseCase } from '@/domain/types/use-case.type'
import type { FileService } from '@/application/services/file.service'
import type { AvatarRepositoryInterface } from '@/domain/repositories/avatar.repository.interface'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

type Params = {
  id: string
  currentUserId: string
}

type Response = {
  success: boolean
  error?: string
}

export class DeleteAvatarUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly fileService: FileService,
    private readonly avatarRepository: AvatarRepositoryInterface,
    private readonly userRepository: UserRepositoryInterface
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const user = await this.userRepository.findById(params.currentUserId)
    if (!user) {
      return {
        success: false,
        error: 'User not found'
      }
    }
    const avatar = await this.avatarRepository.findById(params.id)
    if (!avatar) {
      return {
        success: false,
        error: 'Avatar not found'
      }
    }

    await this.avatarRepository.delete(params.id)

    return {
      success: true
    }
  }
}
