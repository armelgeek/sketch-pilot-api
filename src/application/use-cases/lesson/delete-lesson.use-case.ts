import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'

type Params = {
  id: string
}

type Response = {
  success: boolean
  error?: string
}

export class DeleteLessonUseCase extends IUseCase<Params, Response> {
  constructor(private lessonRepository: LessonRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const lesson = await this.lessonRepository.findById(params.id)
      if (!lesson) {
        return { success: false, error: 'Lesson not found' }
      }
      await this.lessonRepository.delete(params.id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  log(): ActivityType {
    return ActivityType.DELETE_LESSON
  }
}
