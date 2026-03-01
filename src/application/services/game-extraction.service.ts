import { ExtractionStatus } from '../../domain/enums/extraction-status.enum'
import type { GameRepositoryInterface } from '../../domain/repositories/game.repository.interface'
import { GameFileService } from './game-file.service'

export class GameExtractionService {
  private gameFileService: GameFileService
  private gameRepository: GameRepositoryInterface

  constructor(gameRepository: GameRepositoryInterface) {
    this.gameFileService = new GameFileService()
    this.gameRepository = gameRepository
  }

  /**
   * Lance l'extraction d'un fichier ZIP en arrière-plan
   */
  startExtractionBackground(gameId: string, zipUrl: string): void {
    // Lancer l'extraction en arrière-plan sans bloquer
    this.processExtractionAsync(gameId, zipUrl).catch((error) => {
      console.error(`Erreur lors de l'extraction arrière-plan pour le jeu ${gameId}:`, error)
    })
  }

  /**
   * Traite l'extraction de manière asynchrone
   */
  private async processExtractionAsync(gameId: string, zipUrl: string): Promise<void> {
    try {
      // Créer un callback pour mettre à jour le statut
      const updateStatus = async (status: ExtractionStatus, error?: string) => {
        await this.updateGameExtractionStatus(gameId, status, error)
      }

      // Lancer l'extraction
      const result = await this.gameFileService.extractGameFileBackground(gameId, zipUrl, updateStatus)

      // Mettre à jour l'URL du fichier si index.html trouvé
      if (result.indexHtmlUrl) {
        await this.gameRepository.update(gameId, {
          file: result.indexHtmlUrl
        })
        console.info(`Jeu ${gameId} mis à jour avec l'URL index.html: ${result.indexHtmlUrl}`)
      }

      console.info(`Extraction terminée avec succès pour le jeu ${gameId}`)
    } catch (error) {
      console.error(`Échec de l'extraction pour le jeu ${gameId}:`, error)
      // Le statut FAILED a déjà été mis à jour par le callback
    }
  }

  /**
   * Met à jour le statut d'extraction d'un jeu
   */
  private async updateGameExtractionStatus(gameId: string, status: ExtractionStatus, error?: string): Promise<void> {
    try {
      const updateData: any = {
        extractionStatus: status,
        updatedAt: new Date()
      }

      if (error) {
        updateData.extractionError = error
      } else if (status === ExtractionStatus.COMPLETED) {
        updateData.extractionError = null
      }

      await this.gameRepository.update(gameId, updateData)
      console.info(`Statut d'extraction mis à jour pour le jeu ${gameId}: ${status}`)
    } catch (updateError) {
      console.error(`Erreur lors de la mise à jour du statut pour le jeu ${gameId}:`, updateError)
    }
  }

  /**
   * Obtient le statut d'extraction d'un jeu
   */
  async getExtractionStatus(gameId: string): Promise<{
    status: ExtractionStatus
    error?: string
  }> {
    try {
      const game = await this.gameRepository.findById(gameId)

      if (!game) {
        throw new Error('Jeu introuvable')
      }

      return {
        status: game.extractionStatus || ExtractionStatus.PENDING,
        error: game.extractionError
      }
    } catch (error) {
      console.error(`Erreur lors de la récupération du statut pour le jeu ${gameId}:`, error)
      return {
        status: ExtractionStatus.FAILED,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      }
    }
  }
}
