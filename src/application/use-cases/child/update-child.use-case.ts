import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Child } from '@/domain/models/child.model'
import type { ChildRepositoryInterface } from '@/domain/repositories/child.repository.interface'

type Params = {
  id: string
  firstname: string
  lastname: string
  birthday?: string
  avatarUrl?: string
  parentId: string
}

type Response = {
  data: Child
  success: boolean
  error?: string
}

export class UpdateChildUseCase extends IUseCase<Params, Response> {
  constructor(private readonly childRepository: ChildRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const existingChild = await this.childRepository.findById(params.id)
    if (!existingChild) {
      throw new Error('Child not found')
    }

    const updateData: any = {}
    if (params.firstname) updateData.firstname = params.firstname
    if (params.lastname) updateData.lastname = params.lastname
    if (params.birthday) updateData.birthday = new Date(params.birthday)
    if (params.avatarUrl) updateData.avatarUrl = params.avatarUrl

    const updatedChild = await this.childRepository.update(params.id, updateData)
    return {
      data: updatedChild,
      success: true
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_CHILD
  }
}
