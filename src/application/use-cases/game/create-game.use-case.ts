import { ExtractionStatus } from '@/domain/enums/extraction-status.enum'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Game } from '@/domain/models/game.model'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'

type Params = {
  title: string
  file?: string
  coverUrl?: string
  lessonId: string
}

type Response = {
  data: Game
  success: boolean
}

export class CreateGameUseCase extends IUseCase<Params, Response> {
  constructor(private readonly gameRepository: GameRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const game = await this.gameRepository.create({
      title: params.title,
      file: params.file,
      coverUrl: params.coverUrl,
      lessonId: params.lessonId,
      extractionStatus: ExtractionStatus.PENDING
    })

    return {
      success: true,
      data: game
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_GAME
  }
}
