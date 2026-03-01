import { GameBackgroundService } from '@/application/services/game-background.service'
import { ExtractionStatus } from '@/domain/enums/extraction-status.enum'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'

export class CheckGameProcessingStatusUseCase {
  constructor(private gameRepository: GameRepositoryInterface) {}

  async execute(gameId: string): Promise<{
    success: boolean
    data?: {
      status: ExtractionStatus
      error?: string
      canPlay: boolean
      playUrl?: string
      file?: string
      message: string
    }
    error?: string
  }> {
    try {
      const backgroundService = new GameBackgroundService(this.gameRepository)
      const result = await backgroundService.getProcessingStatus(gameId)

      const game = await this.gameRepository.findById(gameId)
      if (!game) {
        return {
          success: false,
          error: 'Jeu introuvable'
        }
      }

      const canPlay = result.status === ExtractionStatus.COMPLETED && !!result.file
      const playUrl = canPlay ? result.file : undefined

      // Messages explicatifs selon le statut
      let message = ''
      switch (result.status) {
        case ExtractionStatus.PENDING:
          message = 'En attente de traitement'
          break
        case ExtractionStatus.PROCESSING:
          message = result.error || 'Upload et extraction en cours...'
          break
        case ExtractionStatus.COMPLETED:
          message = canPlay ? 'Jeu prêt à jouer!' : 'Traitement terminé'
          break
        case ExtractionStatus.FAILED:
          message = `Échec: ${result.error || 'Erreur inconnue'}`
          break
      }

      return {
        success: true,
        data: {
          status: result.status,
          error: result.error,
          canPlay,
          playUrl,
          file: result.file,
          message
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
