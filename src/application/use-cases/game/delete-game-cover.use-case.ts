import type { GameCoverService } from '@/application/services/game-cover.service'

export class DeleteGameCoverUseCase {
  constructor(private gameCoverService: GameCoverService) {}

  async execute(data: { id: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const deleted = await this.gameCoverService.deleteGameCover(data.id)

      if (!deleted) {
        return {
          success: false,
          error: 'Game cover not found'
        }
      }

      return {
        success: true
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete game cover'
      }
    }
  }
}
