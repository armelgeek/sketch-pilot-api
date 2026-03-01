import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'

interface Params {
  lessonId: string
  orderedGameIds: string[]
}

interface Response {
  success: boolean
  error?: string
}

export class ReorderLessonGamesUseCase extends IUseCase<Params, Response> {
  constructor(private readonly gameRepository: GameRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      await this.gameRepository.updateGamesOrder(params.lessonId, params.orderedGameIds)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  log(): ActivityType {
    return ActivityType.REORDER_LESSON_GAMES
  }
}
