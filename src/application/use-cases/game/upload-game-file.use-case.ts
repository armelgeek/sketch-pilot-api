import { GameExtractionService } from '@/application/services/game-extraction.service'
import { ExtractionStatus } from '@/domain/enums/extraction-status.enum'
import type { GameFileService } from '@/application/services/game-file.service'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'

export class UploadGameFileUseCase {
  constructor(
    private gameFileService: GameFileService,
    private gameRepository: GameRepositoryInterface
  ) {}

  async execute(data: {
    file: File
    gameId?: string // ID du jeu pour l'extraction en arrière-plan
  }): Promise<{
    success: boolean
    data?: {
      id: string
      url: string
      extractionStatus: ExtractionStatus
      isZip: boolean
    }
    error?: string
  }> {
    try {
      const result = await this.gameFileService.uploadGameFile(data.file)

      // Si c'est un fichier ZIP et qu'on a un gameId, lancer l'extraction en arrière-plan
      if (result.isZip && data.gameId) {
        console.info(`Lancement de l'extraction en arrière-plan pour le jeu ${data.gameId}`)
        const extractionService = new GameExtractionService(this.gameRepository)
        extractionService.startExtractionBackground(data.gameId, result.url)
      }

      return {
        success: true,
        data: {
          id: result.id,
          url: result.url,
          extractionStatus: result.isZip ? ExtractionStatus.PROCESSING : ExtractionStatus.COMPLETED,
          isZip: result.isZip
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to upload game file'
      }
    }
  }
}
