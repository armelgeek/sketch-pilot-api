import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { DeleteModuleUseCase } from '@/application/use-cases/module/delete-module.use-case'
import { GetModuleByIdUseCase } from '@/application/use-cases/module/get-module-by-id.use-case'
import { UpdateModuleUseCase } from '@/application/use-cases/module/update-module.use-case'
import { Actions, Subjects } from '@/domain/types/permission.type'
import { paginationMiddleware, paginationSchema } from '@/infrastructure/middlewares/pagination.middleware'
import { GameRepository } from '@/infrastructure/repositories/game.repository'
import { LessonRepository } from '@/infrastructure/repositories/lesson.repository'
import { ModuleRepository } from '@/infrastructure/repositories/module.repository'
import type { Routes } from '@/domain/types'
import { ModuleCoverService } from '../../application/services/module-cover.service'
import { CreateModuleUseCase } from '../../application/use-cases/module/create-module.use-case'
import { DeleteModuleCoverUseCase } from '../../application/use-cases/module/delete-module-cover.use-case'
import { ListModulesUseCase } from '../../application/use-cases/module/list-modules.use-case'
import {
  ActivateModuleUseCase,
  DeactivateModuleUseCase
} from '../../application/use-cases/module/update-module-status.use-case'
import { UploadModuleCoverUseCase } from '../../application/use-cases/module/upload-module-cover.use-case'
import { checkPermission } from '../middlewares/permission.middleware'
import { ActivityLogRepository } from '../repositories/activity-log.repository'

export class AdminModuleController implements Routes {
  public controller: OpenAPIHono
  private moduleRepository: ModuleRepository
  private lessonRepository: LessonRepository
  private gameRepository: GameRepository
  private moduleCoverService: ModuleCoverService
  private activityLogRepository: ActivityLogRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.moduleRepository = new ModuleRepository()
    this.lessonRepository = new LessonRepository()
    this.gameRepository = new GameRepository()
    this.moduleCoverService = new ModuleCoverService()
    this.activityLogRepository = new ActivityLogRepository()
    this.initRoutes()
  }

  public initRoutes() {
    // Permissions: MODULE - READ/CREATE/UPDATE/DELETE
    this.controller.use('/v1/admin/modules', (c, next) => {
      switch (c.req.method) {
        case 'GET':
          return checkPermission(Subjects.MODULE, Actions.READ)(c, next)
        case 'POST':
          return checkPermission(Subjects.MODULE, Actions.CREATE)(c, next)
        case 'PUT':
          return checkPermission(Subjects.MODULE, Actions.UPDATE)(c, next)
        case 'PATCH':
          return checkPermission(Subjects.MODULE, Actions.UPDATE)(c, next)
        case 'DELETE':
          return checkPermission(Subjects.MODULE, Actions.DELETE)(c, next)
        default:
          return next()
      }
    })
    this.controller.use('/v1/admin/modules', paginationMiddleware)

    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/modules/cover/{id}',
        tags: ['Modules'],
        summary: 'Get module cover',
        description: 'Get an module cover by its ID.',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Module cover retrieved successfully',
            content: {
              'image/*': {
                schema: z.any()
              }
            }
          },
          404: {
            description: 'Module cover not found',
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
          const moduleCover = await this.moduleCoverService.getModuleCoverFile(id)

          if (!moduleCover) {
            return c.json({ success: false, error: 'module cover not found' }, 404)
          }

          // Redirection vers l'URL MinIO
          return c.redirect(moduleCover.url)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // List modules
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/modules',
        tags: ['Modules'],
        summary: 'List modules',
        description: 'Get a paginated list of modules',
        request: {
          query: paginationSchema.extend({
            search: z.string().optional().describe('Search modules by name')
          })
        },
        responses: {
          200: {
            description: 'Modules retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    items: z.array(
                      z.object({
                        id: z.string(),
                        name: z.string(),
                        coverUrl: z.string().optional(),
                        position: z.number().int().nonnegative().optional(),
                        lessonCount: z.number().optional(),
                        description: z.string().optional(),
                        createdAt: z.string(),
                        updatedAt: z.string()
                      })
                    ),
                    total: z.number(),
                    page: z.number(),
                    limit: z.number(),
                    totalPages: z.number()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        const ipAddress =
          c.req.header('x-forwarded-for') ||
          c.req.header('x-real-ip') ||
          c.req.header('cf-connecting-ip') ||
          c.req.header('x-client-ip') ||
          c.req.header('x-remote-addr') ||
          c.req.header('remote-addr') ||
          undefined
        let activityLogId: string | undefined
        try {
          const pagination = c.get('pagination')
          const { search } = c.req.query()

          const listModulesUseCase = new ListModulesUseCase(this.moduleRepository)
          const { result, activityLogId } = await listModulesUseCase.run({
            ...pagination,
            search,
            currentUserId: user?.id,
            ipAddress,
            resource: 'module'
          })

          if (result.success && result.data?.items) {
            result.data.items = await Promise.all(
              result.data.items.map(async (module) => {
                const lessons = await this.lessonRepository.findByModuleId(module.id)
                return {
                  ...module,
                  lessonCount: lessons.length
                }
              })
            )
          }
          if (activityLogId) {
            await this.activityLogRepository.updateResource(activityLogId, '', 'module', 'success')
          }
          return c.json(result)
        } catch (error: any) {
          if (activityLogId) {
            await this.activityLogRepository.updateResource(activityLogId, '', 'module', 'error')
          }
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Get module by ID
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/modules/{id}',
        tags: ['Modules'],
        summary: 'Get module by ID',
        description: 'Get a module by its ID with lesson and game counts',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Module retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    name: z.string(),
                    coverUrl: z.string().optional(),
                    description: z.string().optional(),
                    createdAt: z.string(),
                    updatedAt: z.string(),
                    stats: z.object({
                      lessonCount: z.number(),
                      gameCount: z.number()
                    })
                  })
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
        const user = c.get('user')
        const ipAddress =
          c.req.header('x-forwarded-for') ||
          c.req.header('x-real-ip') ||
          c.req.header('cf-connecting-ip') ||
          c.req.header('x-client-ip') ||
          c.req.header('x-remote-addr') ||
          c.req.header('remote-addr') ||
          undefined
        const getModuleByIdUseCase = new GetModuleByIdUseCase(
          this.moduleRepository,
          this.lessonRepository,
          this.gameRepository
        )
        try {
          const { id } = c.req.param()
          const { result, activityLogId } = await getModuleByIdUseCase.run({
            id,
            currentUserId: user?.id,
            ipAddress
          })
          if (!result.success) {
            if (activityLogId) {
              await getModuleByIdUseCase.updateActivityResource(activityLogId, id, 'module', 'error')
            }
            return c.json({ success: false, error: result.error || 'Module not found' }, 404)
          }
          if (activityLogId) {
            await getModuleByIdUseCase.updateActivityResource(activityLogId, id, 'module', 'success')
          }
          return c.json({
            success: true,
            data: result.data
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Create module
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/modules',
        tags: ['Modules'],
        summary: 'Create module',
        description: 'Create a new module with optional cover image',
        request: {
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  name: z.string().min(1).describe('Module name'),
                  description: z.string().optional().describe('Module description'),
                  cover: z.any().optional().describe('Cover image file (optional)')
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Module created successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    name: z.string(),
                    coverUrl: z.string().optional(),
                    description: z.string().optional(),
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
          }
        }
      }),
      async (c: any) => {
        try {
          const formData = await c.req.formData()
          const name = formData.get('name') as string
          const description = formData.get('description') as string | null
          const cover = formData.get('cover') as File | null
          const user = c.get('user')
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          if (!name) {
            return c.json({ success: false, error: 'Name is required' }, 400)
          }

          let coverUrl: string | undefined
          if (cover && cover.size > 0) {
            const uploadModuleCoverUseCase = new UploadModuleCoverUseCase(this.moduleCoverService)
            const uploadResult = await uploadModuleCoverUseCase.execute({ file: cover })
            if (!uploadResult.success) {
              return c.json({ success: false, error: uploadResult.error }, 400)
            }
            coverUrl = uploadResult.data?.url
          }

          const createModuleUseCase = new CreateModuleUseCase()
          const { result, activityLogId } = await createModuleUseCase.run({
            name,
            description: description || undefined,
            coverUrl,
            currentUserId: user?.id,
            ipAddress
          })

          // MAJ du log d'activité avec l'id du module et le status
          if (activityLogId) {
            await createModuleUseCase.updateActivityResource(
              activityLogId,
              result.data?.id,
              'module',
              result.success ? 'success' : 'error'
            )
          }

          if (!result.success) {
            return c.json({ success: false, error: '' }, 400)
          }

          return c.json(
            {
              success: true,
              data: {
                ...result.data,
                createdAt: result.data?.createdAt?.toISOString?.() ?? '',
                updatedAt: result.data?.updatedAt?.toISOString?.() ?? ''
              }
            },
            201
          )
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Update module
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/modules/{id}',
        tags: ['Modules'],
        summary: 'Update module',
        description: 'Update an existing module',
        request: {
          params: z.object({
            id: z.string().uuid()
          }),
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  name: z.string().min(1).optional().describe('Module name'),
                  description: z.string().optional().describe('Module description'),
                  cover: z.any().optional().describe('Cover image file (optional)')
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Module updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    name: z.string(),
                    isActive: z.boolean().optional(),
                    coverUrl: z.string().optional(),
                    description: z.string().optional(),
                    createdAt: z.string(),
                    updatedAt: z.string()
                  })
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
          const { id } = c.req.param()
          const formData = await c.req.formData()
          const name = formData.get('name') as string | null
          const description = formData.get('description') as string | null
          const cover = formData.get('cover') as File | null
          const user = c.get('user')
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          // Check if module exists
          const existingModule = await this.moduleRepository.findById(id)
          if (!existingModule) {
            return c.json({ success: false, error: 'Module not found' }, 404)
          }

          const updateData: any = {}
          if (name) updateData.name = name
          if (description !== null) updateData.description = description

          // Handle cover upload
          if (cover && cover.size > 0) {
            // Delete old cover if exists
            if (existingModule.coverUrl) {
              const oldCoverId = existingModule.coverUrl.split('/').pop()?.split('.')[0]
              if (oldCoverId) {
                const deleteModuleCoverUseCase = new DeleteModuleCoverUseCase(this.moduleCoverService)
                await deleteModuleCoverUseCase.execute({ id: oldCoverId })
              }
            }

            // Upload new cover
            const uploadModuleCoverUseCase = new UploadModuleCoverUseCase(this.moduleCoverService)
            const uploadResult = await uploadModuleCoverUseCase.execute({ file: cover })

            if (!uploadResult.success) {
              return c.json({ success: false, error: uploadResult.error }, 400)
            }

            updateData.coverUrl = uploadResult.data?.url
          }

          if (Object.keys(updateData).length === 0) {
            return c.json({ success: false, error: 'No fields to update' }, 400)
          }

          const updateModuleUseCase = new UpdateModuleUseCase(this.moduleRepository)
          const { result, activityLogId } = await updateModuleUseCase.run({
            id,
            data: updateData,
            currentUserId: user?.id,
            ipAddress
          })

          // MAJ du log d'activité avec l'id du module et le status
          if (activityLogId) {
            await updateModuleUseCase.updateActivityResource(
              activityLogId,
              id,
              'module',
              result.success ? 'success' : 'error'
            )
          }

          if (!result.success) {
            return c.json(
              { success: false, error: result.error || '' },
              result.error === 'Module not found' ? 404 : 400
            )
          }

          return c.json({
            success: true,
            data: {
              ...result.data,
              createdAt: result.data?.createdAt?.toISOString?.() ?? '',
              updatedAt: result.data?.updatedAt?.toISOString?.() ?? ''
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Update module status
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/modules/{id}/status',
        tags: ['Modules'],
        summary: 'Update module status',
        description: 'Update the active status of a module',
        request: {
          params: z.object({
            id: z.string().uuid()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  isActive: z.boolean()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Module status updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    name: z.string(),
                    description: z.string().optional(),
                    coverUrl: z.string().optional(),
                    isActive: z.boolean(),
                    createdAt: z.string(),
                    updatedAt: z.string()
                  })
                })
              }
            }
          },
          400: {
            description: 'Invalid request',
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
          const { id } = c.req.param()
          const { isActive } = await c.req.json()
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          let result
          if (isActive) {
            const activateModuleUseCase = new ActivateModuleUseCase(this.moduleRepository)
            result = await activateModuleUseCase.run({ id, currentUserId: c.get('user').id, ipAddress })
          } else {
            const deactivateModuleUseCase = new DeactivateModuleUseCase(this.moduleRepository)
            result = await deactivateModuleUseCase.run({ id, currentUserId: c.get('user').id, ipAddress })
          }
          const { result: activityResult } = result
          if (!activityResult.success) {
            return c.json(
              { success: false, error: activityResult.error },
              activityResult.error === 'Module not found' ? 404 : 400
            )
          }

          return c.json({
            success: true,
            data: {
              id: activityResult.data.id,
              name: activityResult.data.name,
              description: activityResult.data.description,
              coverUrl: activityResult.data.coverUrl,
              isActive: activityResult.data.isActive,
              createdAt: activityResult.data.createdAt.toISOString(),
              updatedAt: activityResult.data.updatedAt.toISOString()
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Delete module
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/modules/{id}',
        tags: ['Modules'],
        summary: 'Delete module',
        description: 'Delete a module and its associated cover image',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Module deleted successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
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
          const { id } = c.req.valid('param')
          const user = c.get('user')
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const existingModule = await this.moduleRepository.findById(id)
          if (!existingModule) {
            return c.json({ success: false, error: 'Module not found' }, 404)
          }

          if (existingModule.coverUrl) {
            const coverId = existingModule.coverUrl.split('/').pop()?.split('.')[0]
            if (coverId) {
              const deleteModuleCoverUseCase = new DeleteModuleCoverUseCase(this.moduleCoverService)
              await deleteModuleCoverUseCase.execute({ id: coverId })
            }
          }

          const deleteModuleUseCase = new DeleteModuleUseCase(this.moduleRepository)
          const { result, activityLogId } = await deleteModuleUseCase.run({
            id,
            currentUserId: user?.id,
            ipAddress
          })

          // MAJ du log d'activité avec l'id du module et le status
          if (activityLogId) {
            await deleteModuleUseCase.updateActivityResource(
              activityLogId,
              id,
              'module',
              result.success ? 'success' : 'error'
            )
          }

          if (!result.success) {
            return c.json(
              { success: false, error: result.error || '' },
              result.error === 'Module not found' ? 404 : 400
            )
          }

          return c.json({ success: true })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
