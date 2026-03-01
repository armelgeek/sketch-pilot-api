import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Child } from '@/domain/models/child.model'
import type { ChildRepositoryInterface } from '@/domain/repositories/child.repository.interface'

type Params = {
  id: string
  avatarUrl: string
}
type Response = {
  data: Child
  success: boolean
  error?: string
}

export class UpdateChildAvatarUseCase extends IUseCase<Params, Response> {
  constructor(private readonly childRepository: ChildRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const existingChild = await this.childRepository.findById(params.id)
    if (!existingChild) {
      throw new Error('Child not found')
    }

    const updatedChild = await this.childRepository.update(params.id, {
      avatarUrl: params.avatarUrl
    })
    return {
      data: updatedChild,
      success: true
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_CHILD_AVATAR
  }
}
