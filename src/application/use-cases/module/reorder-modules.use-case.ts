import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { ModuleRepository } from '@/infrastructure/repositories/module.repository'

export class ReorderModulesUseCase extends IUseCase<{ moduleIds: string[] }, { success: boolean; error?: string }> {
  constructor(private readonly moduleRepository = new ModuleRepository()) {
    super()
  }

  /**
   * Met à jour la position de chaque module selon l'ordre fourni.
   * @param params Les paramètres de réordonnancement
   * @param params.moduleIds Tableau d'IDs de modules dans l'ordre voulu
   */
  async execute(params: { moduleIds: string[] }): Promise<{ success: boolean; error?: string }> {
    try {
      for (const [i, moduleId] of params.moduleIds.entries()) {
        await this.moduleRepository.updatePosition(moduleId, i + 1)
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  log() {
    return ActivityType.REORDER_MODULES as const
  }
}
