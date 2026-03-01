import { GameBackgroundService } from '@/application/services/game-background.service'
import { ExtractionStatus } from '@/domain/enums/extraction-status.enum'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameCoverService } from '@/application/services/game-cover.service'
import type { Game } from '@/domain/models/game.model'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'

type Params = {
  title: string
  file?: File // Fichier de jeu (peut être un ZIP)
  coverFile?: File // Fichier de couverture
  lessonId: string
}

type Response = {
  data: Game & {
    processingStatus: 'immediate' | 'background'
    message: string
  }
  success: boolean
  error?: string
}

export class CreateGameWithBackgroundUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly gameRepository: GameRepositoryInterface,
    private readonly gameCoverService: GameCoverService
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      // 1. Upload immédiat de la couverture si fournie
      let coverUrl: string | undefined
      if (params.coverFile) {
        console.info('[CREATE_GAME] Upload de la couverture...')
        const coverResult = await this.gameCoverService.uploadGameCover(params.coverFile)
        coverUrl = coverResult.url
        console.info('[CREATE_GAME] Couverture uploadée:', coverUrl)
      }

      // 2. Créer le jeu en base avec le statut initial
      let initialStatus = ExtractionStatus.COMPLETED
      let initialFile: string | undefined

      if (params.file) {
        // Si un fichier est fourni, on va le traiter en arrière-plan
        initialStatus = ExtractionStatus.PENDING
        // Pas de fichier initial, il sera mis à jour en arrière-plan
      }

      console.info('[CREATE_GAME] Création du jeu en base...')
      const game = await this.gameRepository.create({
        title: params.title,
        file: initialFile,
        coverUrl,
        lessonId: params.lessonId,
        extractionStatus: initialStatus
      })

      console.info('[CREATE_GAME] Jeu créé avec ID:', game.id)

      // 3. Si un fichier est fourni, lancer le traitement en arrière-plan
      if (params.file) {
        console.info('[CREATE_GAME] Lancement du traitement en arrière-plan...')
        const backgroundService = new GameBackgroundService(this.gameRepository)
        backgroundService.startUploadAndExtraction(game.id, params.file)

        return {
          success: true,
          data: {
            ...game,
            processingStatus: 'background' as const,
            message: 'Jeu créé. Upload et extraction en cours en arrière-plan.'
          }
        }
      }

      // 4. Si pas de fichier, retour immédiat
      return {
        success: true,
        data: {
          ...game,
          processingStatus: 'immediate' as const,
          message: 'Jeu créé avec succès.'
        }
      }
    } catch (error: any) {
      console.error('[CREATE_GAME] Erreur:', error)
      return {
        success: false,
        error: error.message || 'Erreur lors de la création du jeu',
        data: null as any
      }
    }
  }

  log(): ActivityType {
    return ActivityType.CREATE_GAME
  }
}
