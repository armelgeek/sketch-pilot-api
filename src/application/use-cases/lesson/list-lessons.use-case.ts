import type { Lesson } from '@/domain/models/lesson.model'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'

export class ListLessonsUseCase {
  constructor(private lessonRepository: LessonRepositoryInterface) {}

  async execute(params: { page?: number; limit?: number; skip?: number; moduleId?: string }): Promise<{
    success: boolean
    data?: {
      items: Lesson[]
      total: number
      page: number
      limit: number
      totalPages: number
    }
    error?: string
  }> {
    try {
      const page = params.page || 1
      const limit = params.limit || 10
      const skip = params.skip || (page - 1) * limit

      let lessons: Lesson[]

      if (params.moduleId) {
        lessons = await this.lessonRepository.findByModuleId(params.moduleId)
      } else {
        lessons = await this.lessonRepository.findAll({ skip, limit })
      }

      const total = await this.lessonRepository.count()
      const totalPages = Math.ceil(total / limit)

      return {
        success: true,
        data: {
          items: lessons,
          total,
          page,
          limit,
          totalPages
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to list lessons'
      }
    }
  }
}
