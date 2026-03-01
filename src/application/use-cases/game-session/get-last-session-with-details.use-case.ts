import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { LastGameSessionWithDetails } from '@/domain/models/last-game-session-with-details.model'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'

type Params = {
  childId: string
}

type Response = {
  data: LastGameSessionWithDetails | null
  success: boolean
  error?: string
}

export class GetLastSessionWithDetailsUseCase extends IUseCase<Params, Response> {
  constructor(private readonly gameSessionRepository: GameSessionRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const lastSession = await this.gameSessionRepository.findLastSessionWithDetails(params.childId)

      return {
        data: lastSession,
        success: true
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: null
      }
    }
  }

  log(): ActivityType {
    return ActivityType.GET_GAME_SESSION
  }
}
