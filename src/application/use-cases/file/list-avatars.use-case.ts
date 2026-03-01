import { IUseCase } from '@/domain/types/use-case.type'
import type { AvatarService } from '@/application/services/avatar.service'
import type { FileService } from '@/application/services/file.service'
import type { PaginationParams } from '@/infrastructure/middlewares/pagination.middleware'

interface ListAvatarsResponse {
  success: boolean
  data: {
    items: Array<{
      id: string
      url: string
    }>
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export class ListAvatarsUseCase extends IUseCase<PaginationParams, ListAvatarsResponse> {
  constructor(
    private readonly fileService: FileService,
    private readonly avatarService: AvatarService
  ) {
    super()
  }

  async execute(pagination: PaginationParams): Promise<ListAvatarsResponse> {
    const { items, total } = await this.fileService.listAvatars(pagination)

    const itemsWithUrls = await Promise.all(
      items.map(async (avatar) => {
        const url = await this.avatarService.getAvatarUrl(avatar.id)
        return {
          id: avatar.id,
          url: url || `/api/v1/avatars/${avatar.id}`
        }
      })
    )

    return {
      success: true,
      data: {
        items: itemsWithUrls,
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit)
      }
    }
  }
}
