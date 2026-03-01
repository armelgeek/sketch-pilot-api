import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameSession } from '@/domain/models/game-session.model'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'

type Params = {
  sessionId: string
  duration: number
  endedAt?: Date
}

type Response = {
  data: GameSession
  success: boolean
  error?: string
}

export class AbandonGameSessionUseCase extends IUseCase<Params, Response> {
  constructor(private readonly gameSessionRepository: GameSessionRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const session = await this.gameSessionRepository.findById(params.sessionId)
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
          data: null as any
        }
      }

      const updatedSession = await this.gameSessionRepository.update(params.sessionId, {
        status: 'abandoned',
        duration: params.duration,
        endedAt: params.endedAt || new Date()
      })

      return {
        success: true,
        data: updatedSession
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: null as any
      }
    }
  }

  log(): ActivityType {
    return ActivityType.ABANDON_GAME_SESSION
  }
}
