import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { ModuleRepository } from '@/infrastructure/repositories/module.repository'
import type { Module } from '@/domain/models/module.model'
import type { ModuleRepositoryInterface } from '@/domain/repositories/module.repository.interface'

type Params = {
  name: string
  coverUrl?: string
  description?: string
}

type Response = {
  data: Module
  success: boolean
}

export class CreateModuleUseCase extends IUseCase<Params, Response> {
  private moduleRepository: ModuleRepositoryInterface
  constructor() {
    super()
    this.moduleRepository = new ModuleRepository()
  }

  async execute(params: Params): Promise<Response> {
    const module = await this.moduleRepository.create({
      name: params.name,
      coverUrl: params.coverUrl,
      description: params.description,
      isActive: true
    })

    return {
      success: true,
      data: {
        ...module
      }
    }
  }

  log(): ActivityType {
    return ActivityType.CREATE_MODULE
  }
}
