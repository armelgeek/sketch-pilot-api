import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { ModuleRepositoryInterface } from '@/domain/repositories/module.repository.interface'

type Params = {
  id: string
}

type Response = {
  success: boolean
  error?: string
}

export class DeleteModuleUseCase extends IUseCase<Params, Response> {
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
          error: 'Module not found'
        }
      }

      const deleted = await this.moduleRepository.delete(params.id)

      if (!deleted) {
        return {
          success: false,
          error: 'Failed to delete module'
        }
      }

      return {
        success: true
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete module'
      }
    }
  }

  log(): ActivityType {
    return ActivityType.DELETE_MODULE
  }
}
