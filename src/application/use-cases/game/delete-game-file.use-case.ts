import { IUseCase } from '@/domain/types'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameFileService } from '@/application/services/game-file.service'

export class DeleteGameFileUseCase extends IUseCase<
  { id: string; currentUserId: string },
  { success: boolean; error?: string }
> {
  constructor(private gameFileService: GameFileService) {
    super()
  }

  async execute(data: { id: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const deleted = await this.gameFileService.deleteGameFile(data.id)

      if (!deleted) {
        return {
          success: false,
          error: 'Game file not found'
        }
      }

      return {
        success: true
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete game file'
      }
    }
  }
  log(): ActivityType {
    return ActivityType.DELETE_GAME_FILE
  }
}
