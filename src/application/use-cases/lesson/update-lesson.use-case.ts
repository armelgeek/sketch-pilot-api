import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Lesson } from '@/domain/models/lesson.model'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'

type Params = {
  id: string
  data: {
    title?: string
    content?: string
    order?: number
  }
}

type Response = {
  success: boolean
  data?: Lesson
  error?: string
}

export class UpdateLessonUseCase extends IUseCase<Params, Response> {
  constructor(private lessonRepository: LessonRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const lesson = await this.lessonRepository.findById(params.id)
      if (!lesson) {
        return { success: false, error: 'Lesson not found' }
      }
      const updatedLesson = await this.lessonRepository.update(params.id, params.data)
      return { success: true, data: updatedLesson }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_LESSON
  }
}
