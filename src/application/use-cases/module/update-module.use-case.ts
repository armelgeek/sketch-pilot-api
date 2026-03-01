import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Module } from '@/domain/models/module.model'
import type { ModuleRepositoryInterface } from '@/domain/repositories/module.repository.interface'

type Params = {
  id: string
  data: {
    name?: string
    coverUrl?: string
    description?: string
  }
}

type Response = {
  data: Module
  success: boolean
  error?: string
}

export class UpdateModuleUseCase extends IUseCase<Params, Response> {
  constructor(private readonly moduleRepository: ModuleRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      // Check if module exists
      const existingModule = await this.moduleRepository.findById(params.id)
      if (!existingModule) {
        return {
          success: false,
          error: 'Module not found',
          data: null as any
        }
      }

      const module = await this.moduleRepository.update(params.id, params.data)

      return {
        success: true,
        data: module
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update module',
        data: null as any
      }
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_MODULE
  }
}
