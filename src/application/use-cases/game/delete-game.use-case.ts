import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameCoverService } from '@/application/services/game-cover.service'
import type { GameFileService } from '@/application/services/game-file.service'
import type { GameRepository } from '@/infrastructure/repositories/game.repository'
import { DeleteGameCoverUseCase } from './delete-game-cover.use-case'
import { DeleteGameFileUseCase } from './delete-game-file.use-case'

interface Params {
  id: string
}

interface Response {
  success: boolean
  error?: string
}

export class DeleteGameUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly gameFileService: GameFileService,
    private readonly gameCoverService: GameCoverService
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const { id } = params
    const game = await this.gameRepository.findById(id)
    if (!game) {
      return { success: false, error: 'Game not found' }
    }

    // Delete associated file if it exists
    if (game.file) {
      const fileId = game.file.split('/').pop()?.split('.')[0]
      if (fileId) {
        const deleteGameFileUseCase = new DeleteGameFileUseCase(this.gameFileService)
        await deleteGameFileUseCase.execute({ id: fileId })
      }
    }

    // Delete associated cover if it exists
    if (game.coverUrl) {
      const coverId = game.coverUrl.split('/').pop()?.split('.')[0]
      if (coverId) {
        const deleteGameCoverUseCase = new DeleteGameCoverUseCase(this.gameCoverService)
        await deleteGameCoverUseCase.execute({ id: coverId })
      }
    }

    await this.gameRepository.delete(id)
    return { success: true }
  }

  log(): ActivityType {
    return ActivityType.DELETE_GAME
  }
}
