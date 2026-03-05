import { IUseCase } from '@/domain/types/use-case.type'
import type { FileService } from '@/application/services/file.service'
import type { Avatar } from '@/domain/models/avatar.model'

type Params = {
  id: string
}

type Response = {
  data: Avatar
  success: boolean
  error?: string
}
export class GetAvatarUseCase extends IUseCase<Params, Response> {
  constructor(private readonly fileService: FileService) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const avatarFile = await this.fileService.getAvatarFile(params.id)

    if (!avatarFile) {
      throw new Error('Avatar not found')
    }

    return {
      success: true,
      data: { id: params.id, ...avatarFile, type: avatarFile.type as 'webp' | 'jpeg' | 'png' }
    }
  }
}
