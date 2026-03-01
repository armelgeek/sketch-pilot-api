import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Lesson } from '@/domain/models/lesson.model'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'

type Params = {
  title: string
  content?: string
  moduleId: string
  order?: number
}

type Response = {
  success: boolean
  data?: Lesson
  error?: string
}

export class CreateLessonUseCase extends IUseCase<Params, Response> {
  constructor(private lessonRepository: LessonRepositoryInterface) {
    super()
  }

  async execute(data: Params): Promise<Response> {
    try {
      let order = data.order
      if (!order) {
        const maxOrder = await this.lessonRepository.findMaxOrderByModuleId(data.moduleId)
        order = maxOrder + 1
      }

      const lesson = await this.lessonRepository.create({
        title: data.title,
        content: data.content,
        moduleId: data.moduleId,
        order
      })

      return {
        success: true,
        data: lesson
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create lesson'
      }
    }
  }

  log(): ActivityType {
    return ActivityType.CREATE_LESSON
  }
}
