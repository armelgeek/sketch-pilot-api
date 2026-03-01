import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameSession } from '@/domain/models/game-session.model'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'

type Params = {
  childId: string
  gameId: string
}

type Response = {
  data: GameSession
  success: boolean
}

export class StartGameSessionUseCase extends IUseCase<Params, Response> {
  constructor(private readonly gameSessionRepository: GameSessionRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    // Vérifier s'il y a déjà une session active pour cet enfant et ce jeu
    const activeSession = await this.gameSessionRepository.findActiveSessionByChildAndGame(
      params.childId,
      params.gameId
    )

    if (activeSession) {
      return {
        success: true,
        data: activeSession
      }
    }

    // Créer une nouvelle session
    const gameSession = await this.gameSessionRepository.create({
      childId: params.childId,
      gameId: params.gameId,
      startedAt: new Date(),
      status: 'in_progress',
      sessionDate: new Date()
    })

    return {
      success: true,
      data: gameSession
    }
  }

  log(): ActivityType {
    return ActivityType.START_GAME_SESSION
  }
}
