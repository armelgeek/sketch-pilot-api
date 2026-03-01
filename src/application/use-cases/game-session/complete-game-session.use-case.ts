import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameSession } from '@/domain/models/game-session.model'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'

type Params = {
  sessionId: string
  success: boolean
  duration: number
  endedAt?: Date
}

type Response = {
  data: GameSession
  success: boolean
}

export class CompleteGameSessionUseCase extends IUseCase<Params, Response> {
  constructor(private readonly gameSessionRepository: GameSessionRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const session = await this.gameSessionRepository.findById(params.sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    if (session.status !== 'in_progress') {
      throw new Error('Session is not in progress')
    }

    const updatedSession = await this.gameSessionRepository.update(params.sessionId, {
      status: 'completed',
      success: params.success,
      duration: params.duration,
      endedAt: params.endedAt || new Date()
    })

    return {
      success: true,
      data: updatedSession
    }
  }

  log(): ActivityType {
    return ActivityType.COMPLETE_GAME_SESSION
  }
}
