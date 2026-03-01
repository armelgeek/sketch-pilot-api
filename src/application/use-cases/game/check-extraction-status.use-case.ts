import { GameExtractionService } from '@/application/services/game-extraction.service'
import { ExtractionStatus } from '@/domain/enums/extraction-status.enum'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'

export class CheckExtractionStatusUseCase {
  constructor(private gameRepository: GameRepositoryInterface) {}

  async execute(gameId: string): Promise<{
    success: boolean
    data?: {
      status: ExtractionStatus
      error?: string
      canPlay: boolean
      playUrl?: string
    }
    error?: string
  }> {
    try {
      const extractionService = new GameExtractionService(this.gameRepository)
      const result = await extractionService.getExtractionStatus(gameId)

      const game = await this.gameRepository.findById(gameId)
      if (!game) {
        return {
          success: false,
          error: 'Jeu introuvable'
        }
      }

      const canPlay = result.status === ExtractionStatus.COMPLETED
      const playUrl = canPlay && game.file ? game.file : undefined

      return {
        success: true,
        data: {
          status: result.status,
          error: result.error,
          canPlay,
          playUrl
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Erreur lors de la vérification du statut'
      }
    }
  }
}
