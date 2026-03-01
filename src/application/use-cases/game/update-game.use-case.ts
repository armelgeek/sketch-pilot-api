import { GameBackgroundService } from '@/application/services/game-background.service'
import { ExtractionStatus } from '@/domain/enums/extraction-status.enum'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameCoverService } from '@/application/services/game-cover.service'
import type { GameFileService } from '@/application/services/game-file.service'
import type { GameRepository } from '@/infrastructure/repositories/game.repository'
import { DeleteGameCoverUseCase } from './delete-game-cover.use-case'
import { DeleteGameFileUseCase } from './delete-game-file.use-case'
import { UploadGameCoverUseCase } from './upload-game-cover.use-case'

interface Params {
  id: string
  title?: string
  file?: File | null
  coverFile?: File | null
  prerequisites?: string[]
}

interface Response {
  success: boolean
  data?: any
  error?: string
}

export class UpdateGameUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly gameFileService: GameFileService,
    private readonly gameCoverService: GameCoverService
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const { id, title, file, coverFile, prerequisites } = params
    try {
      const game = await this.gameRepository.findById(id)
      if (!game) {
        return { success: false, error: 'Game not found' }
      }
      const updateData: any = {}
      if (title) updateData.title = title

      // Handle prerequisites
      if (prerequisites !== undefined) {
        // Validate that all prerequisite games exist
        for (const prereqId of prerequisites) {
          const prereqGame = await this.gameRepository.findById(prereqId)
          if (!prereqGame) {
            return { success: false, error: `Prerequisite game with ID ${prereqId} not found` }
          }
        }
        // Remove all existing prerequisites
        const currentPrerequisites = await this.gameRepository.findPrerequisites(id)
        for (const prereq of currentPrerequisites) {
          await this.gameRepository.removePrerequisite(id, prereq.id)
        }
        // Add new prerequisites
        for (const prereqId of prerequisites) {
          await this.gameRepository.addPrerequisite(id, prereqId)
        }
      }

      // Handle file upload
      if (file && file.size > 0) {
        if (game.file) {
          const fileId = game.file.split('/').pop()?.split('.')[0]
          if (fileId) {
            const deleteGameFileUseCase = new DeleteGameFileUseCase(this.gameFileService)
            await deleteGameFileUseCase.execute({ id: fileId })
          }
        }
        // Upload new file using the same background process as creation
        const backgroundService = new GameBackgroundService(this.gameRepository)
        await this.gameRepository.update(id, {
          extractionStatus: ExtractionStatus.PENDING,
          file: undefined
        })
        backgroundService.startUploadAndExtraction(id, file)
        updateData.extractionStatus = ExtractionStatus.PENDING
      }

      // Handle cover upload
      if (coverFile && coverFile.size > 0) {
        if (game.coverUrl) {
          const coverId = game.coverUrl.split('/').pop()?.split('.')[0]
          if (coverId) {
            const deleteGameCoverUseCase = new DeleteGameCoverUseCase(this.gameCoverService)
            await deleteGameCoverUseCase.execute({ id: coverId })
          }
        }
        const uploadGameCoverUseCase = new UploadGameCoverUseCase(this.gameCoverService)
        const uploadResult = await uploadGameCoverUseCase.execute({ file: coverFile })
        if (!uploadResult.success) {
          return { success: false, error: uploadResult.error }
        }
        updateData.coverUrl = uploadResult.data?.url
      }

      if (Object.keys(updateData).length === 0) {
        return { success: false, error: 'No fields to update' }
      }

      const updatedGame = await this.gameRepository.update(id, updateData)
      return {
        success: true,
        data: updatedGame
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_GAME
  }
}
