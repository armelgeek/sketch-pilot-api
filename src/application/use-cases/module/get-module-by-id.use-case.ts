import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameRepository } from '@/infrastructure/repositories/game.repository'
import type { LessonRepository } from '@/infrastructure/repositories/lesson.repository'
import type { ModuleRepository } from '@/infrastructure/repositories/module.repository'

export class GetModuleByIdUseCase extends IUseCase<
  { id: string; currentUserId?: string; ipAddress?: string },
  { success: boolean; data?: any; error?: string }
> {
  constructor(
    private readonly moduleRepository: ModuleRepository,
    private readonly lessonRepository: LessonRepository,
    private readonly gameRepository: GameRepository
  ) {
    super()
  }

  async execute(params: { id: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    const { id } = params
    const module = await this.moduleRepository.findById(id)
    if (!module) {
      return { success: false, error: 'Module not found' }
    }
    const lessons = await this.lessonRepository.findByModuleId(id)
    const lessonCount = lessons.length
    let gameCount = 0
    for (const lesson of lessons) {
      const games = await this.gameRepository.findByLessonId(lesson.id)
      gameCount += games.length
    }
    return {
      success: true,
      data: {
        ...module,
        createdAt: module.createdAt.toISOString(),
        updatedAt: module.updatedAt.toISOString(),
        stats: {
          lessonCount,
          gameCount
        }
      }
    }
  }
  log(): ActivityType {
    return ActivityType.GET_MODULE
  }
}
