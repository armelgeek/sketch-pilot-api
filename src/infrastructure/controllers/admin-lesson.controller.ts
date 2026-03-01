import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Actions, Subjects } from '@/domain/types/permission.type'
import { GameRepository } from '@/infrastructure/repositories/game.repository'
import { LessonRepository } from '@/infrastructure/repositories/lesson.repository'
import { ModuleRepository } from '@/infrastructure/repositories/module.repository'
import type { Routes } from '@/domain/types'
import { CreateLessonUseCase } from '../../application/use-cases/lesson/create-lesson.use-case'
import { DeleteLessonUseCase } from '../../application/use-cases/lesson/delete-lesson.use-case'
import { UpdateLessonUseCase } from '../../application/use-cases/lesson/update-lesson.use-case'
import { checkPermission } from '../middlewares/permission.middleware'

export class AdminLessonController implements Routes {
  public controller: OpenAPIHono
  private lessonRepository: LessonRepository
  private gameRepository: GameRepository
  private moduleRepository: ModuleRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.lessonRepository = new LessonRepository()
    this.gameRepository = new GameRepository()
    this.moduleRepository = new ModuleRepository()
    this.initRoutes()
  }

  public initRoutes() {
    // Permissions: CHAPTER - READ/CREATE/UPDATE/DELETE (lessons)
    this.controller.use('/v1/admin/lessons', (c, next) => {
      switch (c.req.method) {
        case 'GET':
          return checkPermission(Subjects.CHAPTER, Actions.READ)(c, next)
        case 'POST':
          return checkPermission(Subjects.CHAPTER, Actions.CREATE)(c, next)
        case 'PUT':
          return checkPermission(Subjects.CHAPTER, Actions.UPDATE)(c, next)
        case 'DELETE':
          return checkPermission(Subjects.CHAPTER, Actions.DELETE)(c, next)
        default:
          return next()
      }
    })
    this.controller.use('/v1/admin/modules', (c, next) => {
      if (c.req.method === 'POST') {
        return checkPermission(Subjects.CHAPTER, Actions.CREATE)(c, next)
      }
      return next()
    })
    // Get lessons by module
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/modules/{moduleId}/lessons',
        tags: ['Lessons'],
        summary: 'Get lessons by module',
        description: 'Get all lessons for a specific module with game counts',
        request: {
          params: z.object({
            moduleId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Lessons retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.array(
                    z.object({
                      id: z.string(),
                      title: z.string(),
                      content: z.string().optional(),
                      moduleId: z.string(),
                      order: z.number(),
                      createdAt: z.string(),
                      updatedAt: z.string(),
                      gameCount: z.number()
                    })
                  )
                })
              }
            }
          },
          404: {
            description: 'Module not found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { moduleId } = c.req.param()

          const module = await this.moduleRepository.findById(moduleId)
          if (!module) {
            return c.json({ success: false, error: 'Module not found' }, 404)
          }

          const lessons = await this.lessonRepository.findByModuleId(moduleId)

          const lessonsWithStats = await Promise.all(
            lessons.map(async (lesson) => {
              const games = await this.gameRepository.findByLessonId(lesson.id)
              return {
                ...lesson,
                createdAt: lesson.createdAt.toISOString(),
                updatedAt: lesson.updatedAt.toISOString(),
                gameCount: games.length
              }
            })
          )

          return c.json({
            success: true,
            data: lessonsWithStats
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Get lesson by ID
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/lessons/{id}',
        tags: ['Lessons'],
        summary: 'Get lesson by ID',
        description: 'Get a lesson by its ID with game count',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Lesson retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    title: z.string(),
                    content: z.string().optional(),
                    moduleId: z.string(),
                    order: z.number(),
                    createdAt: z.string(),
                    updatedAt: z.string(),
                    gameCount: z.number()
                  })
                })
              }
            }
          },
          404: {
            description: 'Lesson not found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { id } = c.req.param()

          const lesson = await this.lessonRepository.findById(id)
          if (!lesson) {
            return c.json({ success: false, error: 'Lesson not found' }, 404)
          }

          const games = await this.gameRepository.findByLessonId(id)

          return c.json({
            success: true,
            data: {
              ...lesson,
              createdAt: lesson.createdAt.toISOString(),
              updatedAt: lesson.updatedAt.toISOString(),
              gameCount: games.length
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Create lesson in module
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/modules/{moduleId}/lessons',
        tags: ['Lessons'],
        summary: 'Create lesson in module',
        description: 'Create a new lesson in a specific module',
        request: {
          params: z.object({
            moduleId: z.string().uuid()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  title: z.string().min(1),
                  content: z.string().optional(),
                  order: z.number().int().min(1).optional()
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Lesson created successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    title: z.string(),
                    content: z.string().optional(),
                    moduleId: z.string(),
                    order: z.number(),
                    createdAt: z.string(),
                    updatedAt: z.string()
                  })
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          },
          404: {
            description: 'Module not found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { moduleId } = c.req.param()
          const body = await c.req.json()

          const module = await this.moduleRepository.findById(moduleId)
          if (!module) {
            return c.json({ success: false, error: 'Module not found' }, 404)
          }
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const createLessonUseCase = new CreateLessonUseCase(this.lessonRepository)
          const { result, activityLogId } = await createLessonUseCase.run({
            ...body,
            moduleId,
            currentUserId: c.get('user')?.id,
            ipAddress
          })

          if (!result.success) {
            // Update log with error status if activityLogId exists
            if (activityLogId) {
              await createLessonUseCase.updateActivityResource(activityLogId, undefined, 'lesson', 'error')
            }
            return c.json({ success: false, error: result.error }, 400)
          }

          // Tag the log with the created lesson id
          if (activityLogId && result.data) {
            await createLessonUseCase.updateActivityResource(activityLogId, result.data.id, 'lesson', 'success')
          }

          return c.json(
            {
              success: true,
              data: {
                ...result.data!,
                createdAt: result.data!.createdAt.toISOString(),
                updatedAt: result.data!.updatedAt.toISOString()
              }
            },
            201
          )
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Update lesson
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/lessons/{id}',
        tags: ['Lessons'],
        summary: 'Update lesson',
        description: 'Update an existing lesson',
        request: {
          params: z.object({
            id: z.string().uuid()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  title: z.string().min(1).optional(),
                  content: z.string().optional(),
                  order: z.number().int().min(1).optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Lesson updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    title: z.string(),
                    content: z.string().optional(),
                    moduleId: z.string(),
                    order: z.number(),
                    createdAt: z.string(),
                    updatedAt: z.string()
                  })
                })
              }
            }
          },
          404: {
            description: 'Lesson not found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { id } = c.req.param()
          const body = await c.req.json()
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const updateLessonUseCase = new UpdateLessonUseCase(this.lessonRepository)
          const { result, activityLogId } = await updateLessonUseCase.run({
            id,
            data: body,
            currentUserId: c.get('user')?.id,
            ipAddress
          })
          if (!result.success) {
            if (activityLogId) {
              await updateLessonUseCase.updateActivityResource(activityLogId, id, 'lesson', 'error')
            }
            return c.json({ success: false, error: result.error }, result.error === 'Lesson not found' ? 404 : 400)
          }
          if (activityLogId && result.data) {
            await updateLessonUseCase.updateActivityResource(activityLogId, result.data.id, 'lesson', 'success')
          }
          return c.json({
            success: true,
            data: {
              ...result.data!,
              createdAt: result.data!.createdAt.toISOString(),
              updatedAt: result.data!.updatedAt.toISOString()
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Delete lesson
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/lessons/{id}',
        tags: ['Lessons'],
        summary: 'Delete lesson',
        description: 'Delete a lesson',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Lesson deleted successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
                })
              }
            }
          },
          404: {
            description: 'Lesson not found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { id } = c.req.param()
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const deleteLessonUseCase = new DeleteLessonUseCase(this.lessonRepository)
          const { result, activityLogId } = await deleteLessonUseCase.run({
            id,
            currentUserId: c.get('user')?.id,
            ipAddress
          })
          if (!result.success) {
            if (activityLogId) {
              await deleteLessonUseCase.updateActivityResource(activityLogId, id, 'lesson', 'error')
            }
            return c.json({ success: false, error: result.error }, result.error === 'Lesson not found' ? 404 : 400)
          }
          if (activityLogId) {
            await deleteLessonUseCase.updateActivityResource(activityLogId, id, 'lesson', 'success')
          }
          return c.json({ success: true })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
