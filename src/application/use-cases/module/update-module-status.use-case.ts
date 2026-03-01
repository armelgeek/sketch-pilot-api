import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Module } from '@/domain/models/module.model'
import type { ModuleRepositoryInterface } from '@/domain/repositories/module.repository.interface'

type Params = {
  id: string
  isActive: boolean
}

type Response = {
  data: Module
  success: boolean
  error?: string
}

export class ActivateModuleUseCase extends IUseCase<Omit<Params, 'isActive'>, Response> {
  constructor(private readonly moduleRepository: ModuleRepositoryInterface) {
    super()
  }

  async execute(params: Omit<Params, 'isActive'>): Promise<Response> {
    try {
      const existingModule = await this.moduleRepository.findById(params.id)
      if (!existingModule) {
        return {
          success: false,
          error: 'Module not found',
          data: null as any
        }
      }
      const updatedModule = await this.moduleRepository.updateStatus(params.id, true)
      return {
        data: updatedModule,
        success: true
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: null as any
      }
    }
  }

  log(): ActivityType {
    return ActivityType.ACTIVATE_MODULE
  }
}

export class DeactivateModuleUseCase extends IUseCase<Omit<Params, 'isActive'>, Response> {
  constructor(private readonly moduleRepository: ModuleRepositoryInterface) {
    super()
  }

  async execute(params: Omit<Params, 'isActive'>): Promise<Response> {
    try {
      const existingModule = await this.moduleRepository.findById(params.id)
      if (!existingModule) {
        return {
          success: false,
          error: 'Module not found',
          data: null as any
        }
      }
      const updatedModule = await this.moduleRepository.updateStatus(params.id, false)
      return {
        data: updatedModule,
        success: true
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: null as any
      }
    }
  }

  log(): ActivityType {
    return ActivityType.DEACTIVATE_MODULE
  }
}
