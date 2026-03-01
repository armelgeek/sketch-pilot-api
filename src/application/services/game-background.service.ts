import { ExtractionStatus } from '@/domain/enums/extraction-status.enum'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'
import { GameExtractionService } from './game-extraction.service'
import { GameFileService } from './game-file.service'

export class GameBackgroundService {
  private gameFileService: GameFileService
  private gameExtractionService: GameExtractionService
  private gameRepository: GameRepositoryInterface

  constructor(gameRepository: GameRepositoryInterface) {
    this.gameFileService = new GameFileService()
    this.gameExtractionService = new GameExtractionService(gameRepository)
    this.gameRepository = gameRepository
  }

  /**
   * Lance l'upload et l'extraction d'un fichier de jeu en arrière-plan
   */
  startUploadAndExtraction(gameId: string, file: File): void {
    // Lancer le processus en arrière-plan sans bloquer
    this.processUploadAndExtractionAsync(gameId, file).catch((error) => {
      console.error(`Erreur lors du traitement arrière-plan pour le jeu ${gameId}:`, error)
    })
  }

  /**
   * Traite l'upload et l'extraction de manière asynchrone
   */
  private async processUploadAndExtractionAsync(gameId: string, file: File): Promise<void> {
    try {
      console.info(`[BACKGROUND] Début du traitement pour le jeu ${gameId}`)

      // Étape 1: Upload du fichier
      await this.updateGameStatus(gameId, ExtractionStatus.PROCESSING, 'Upload du fichier en cours...')

      console.info(`[BACKGROUND] Upload du fichier pour le jeu ${gameId}`)
      const uploadResult = await this.gameFileService.uploadGameFile(file)

      // Étape 2: Mettre à jour le jeu avec l'URL du fichier uploadé
      await this.gameRepository.update(gameId, {
        file: uploadResult.url
      })

      console.info(`[BACKGROUND] Fichier uploadé pour le jeu ${gameId}: ${uploadResult.url}`)

      // Étape 3: Si c'est un ZIP, lancer l'extraction
      if (uploadResult.isZip) {
        console.info(`[BACKGROUND] Lancement de l'extraction pour le jeu ${gameId}`)

        // Créer un callback pour mettre à jour le statut
        const updateStatus = async (status: ExtractionStatus, error?: string) => {
          await this.updateGameStatus(gameId, status, error)
        }

        // Lancer l'extraction
        const extractResult = await this.gameFileService.extractGameFileBackground(
          gameId,
          uploadResult.url,
          updateStatus
        )

        // Mettre à jour l'URL du fichier si index.html trouvé
        if (extractResult.indexHtmlUrl) {
          await this.gameRepository.update(gameId, {
            file: extractResult.indexHtmlUrl
          })
          console.info(`[BACKGROUND] Jeu ${gameId} mis à jour avec l'URL index.html: ${extractResult.indexHtmlUrl}`)
        }
      } else {
        // Si ce n'est pas un ZIP, marquer comme terminé
        await this.updateGameStatus(gameId, ExtractionStatus.COMPLETED)
      }

      console.info(`[BACKGROUND] Traitement terminé avec succès pour le jeu ${gameId}`)
    } catch (error) {
      console.error(`[BACKGROUND] Échec du traitement pour le jeu ${gameId}:`, error)
      await this.updateGameStatus(
        gameId,
        ExtractionStatus.FAILED,
        error instanceof Error ? error.message : 'Erreur inconnue lors du traitement'
      )
    }
  }

  /**
   * Met à jour le statut d'un jeu
   */
  private async updateGameStatus(gameId: string, status: ExtractionStatus, error?: string): Promise<void> {
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
      console.info(`[BACKGROUND] Statut mis à jour pour le jeu ${gameId}: ${status}`)
    } catch (updateError) {
      console.error(`[BACKGROUND] Erreur lors de la mise à jour du statut pour le jeu ${gameId}:`, updateError)
    }
  }

  /**
   * Obtient le statut de traitement d'un jeu
   */
  async getProcessingStatus(gameId: string): Promise<{
    status: ExtractionStatus
    error?: string
    file?: string
  }> {
    try {
      const game = await this.gameRepository.findById(gameId)

      if (!game) {
        throw new Error('Jeu introuvable')
      }

      return {
        status: game.extractionStatus || ExtractionStatus.PENDING,
        error: game.extractionError,
        file: game.file
      }
    } catch (error) {
      console.error(`[BACKGROUND] Erreur lors de la récupération du statut pour le jeu ${gameId}:`, error)
      return {
        status: ExtractionStatus.FAILED,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      }
    }
  }
}
