import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Child } from '@/domain/models/child.model'
import type { ChildRepositoryInterface } from '@/domain/repositories/child.repository.interface'

type Params = {
  parentId: string
}
type Response = {
  data: Child[]
  success: boolean
  error?: string
}

export class GetChildrenUseCase extends IUseCase<Params, Response> {
  constructor(private readonly childRepository: ChildRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const children = await this.childRepository.findByParentId(params.parentId)
    return {
      data: children,
      success: true
    }
  }

  log(): ActivityType {
    return ActivityType.GET_CHILDREN
  }
}
