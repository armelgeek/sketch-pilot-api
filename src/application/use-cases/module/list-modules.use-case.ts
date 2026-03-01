import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Module } from '@/domain/models/module.model'
import type { ModuleRepositoryInterface } from '@/domain/repositories/module.repository.interface'
import type { PaginationParams } from '@/infrastructure/middlewares/pagination.middleware'

type Params = PaginationParams & { search?: string }

type Response = {
  data: {
    items: Module[]
    total: number
    page: number
    limit: number
    totalPages: number
  }
  success: boolean
}

export class ListModulesUseCase extends IUseCase<Params, Response> {
  constructor(private readonly moduleRepository: ModuleRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const modules = await this.moduleRepository.findWithSearch(params.search, {
      skip: params.skip,
      limit: params.limit
    })
    const total = await this.moduleRepository.countWithSearch(params.search)

    return {
      success: true,
      data: {
        items: modules,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit)
      }
    }
  }

  log(): ActivityType {
    return ActivityType.LIST_MODULES
  }
}
