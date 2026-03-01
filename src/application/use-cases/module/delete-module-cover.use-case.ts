import type { ModuleCoverService } from '@/application/services/module-cover.service'

export class DeleteModuleCoverUseCase {
  constructor(private moduleCoverService: ModuleCoverService) {}

  async execute(data: { id: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const deleted = await this.moduleCoverService.deleteModuleCover(data.id)

      if (!deleted) {
        return {
          success: false,
          error: 'Module cover not found'
        }
      }

      return {
        success: true
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete module cover'
      }
    }
  }
}
