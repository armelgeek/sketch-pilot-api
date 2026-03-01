import type { GameCoverService } from '@/application/services/game-cover.service'

export class UploadGameCoverUseCase {
  constructor(private gameCoverService: GameCoverService) {}

  async execute(data: {
    file: File
  }): Promise<{ success: boolean; data?: { id: string; url: string }; error?: string }> {
    try {
      const result = await this.gameCoverService.uploadGameCover(data.file)

      return {
        success: true,
        data: result
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to upload game cover'
      }
    }
  }
}
