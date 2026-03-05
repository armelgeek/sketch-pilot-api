import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { AvatarService } from '@/application/services/avatar.service'
import { FileService } from '@/application/services/file.service'
import { DeleteAvatarUseCase } from '@/application/use-cases/file/delete-avatar.use-case'
import { ListAvatarsUseCase } from '@/application/use-cases/file/list-avatars.use-case'
import { UpdateAvatarUseCase } from '@/application/use-cases/file/update-avatar.use-case'
import { UploadAvatarUseCase } from '@/application/use-cases/file/upload-avatar.use-case'
import { paginationMiddleware, paginationSchema } from '@/infrastructure/middlewares/pagination.middleware'
import { AvatarRepository } from '@/infrastructure/repositories/avatar.repository'
import { UserRepository } from '@/infrastructure/repositories/user.repository'

export class AvatarController {
  public controller: OpenAPIHono
  private fileService: FileService
  private avatarService: AvatarService
  private avatarRepository: AvatarRepository
  private userRepository: UserRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.avatarRepository = new AvatarRepository()
    this.userRepository = new UserRepository()
    this.fileService = new FileService(this.avatarRepository)
    this.avatarService = new AvatarService()
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.use('/v1/avatars', paginationMiddleware)

    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/avatars',
        tags: ['Avatars'],
        summary: 'List avatars',
        description: 'Get a paginated list of avatars',
        request: {
          query: paginationSchema
        },
        responses: {
          200: {
            description: 'Avatars retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    items: z.array(
                      z.object({
                        id: z.string(),
                        url: z.string()
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
          const pagination = c.get('pagination')
          const listAvatarsUseCase = new ListAvatarsUseCase(this.fileService, this.avatarService)
          const { result } = await listAvatarsUseCase.run({ ...pagination })
          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/avatars/upload',
        tags: ['Avatars'],
        summary: 'Upload avatar',
        description: 'Upload a new avatar image.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  file: z.any().describe('The avatar image file to upload')
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Avatar uploaded successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    url: z.string()
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
          const file = formData.get('file') as File

          if (!file) {
            return c.json({ success: false, error: 'No file uploaded' }, 400)
          }

          const uploadAvatarUseCase = new UploadAvatarUseCase(this.fileService, this.userRepository)
          const { result } = await uploadAvatarUseCase.run({
            file,
            currentUserId: c.get('user')?.id
          })

          if (!result.success) {
            return c.json({ success: false, error: result.error }, 400)
          }

          return c.json({
            success: true,
            data: {
              id: result.data?.id,
              url: result.data?.path
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/avatars/{id}',
        tags: ['Avatars'],
        summary: 'Get avatar',
        description: 'Get an avatar by its ID.',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Avatar URL retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    url: z.string()
                  })
                })
              }
            }
          },
          404: {
            description: 'Avatar not found',
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
          const url = await this.avatarService.getAvatarUrl(id)

          if (!url) {
            return c.json({ success: false, error: 'Avatar not found' }, 404)
          }

          return c.json({ success: true, data: { url } })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/avatars/{id}',
        tags: ['Avatars'],
        summary: 'Delete avatar',
        description: 'Delete an avatar. Admin only.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Avatar deleted successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
                })
              }
            }
          },
          404: {
            description: 'Avatar not found',
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
          const deleteAvatarUseCase = new DeleteAvatarUseCase(
            this.fileService,
            this.avatarRepository,
            this.userRepository
          )
          const { result } = await deleteAvatarUseCase.run({
            id,
            currentUserId: c.get('user')?.id
          })

          if (!result.success) {
            return c.json({ success: false, error: result.error }, 404)
          }

          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/avatars/{id}',
        tags: ['Avatars'],
        summary: 'Update avatar',
        description: 'Update an existing avatar.',
        request: {
          params: z.object({
            id: z.string().uuid()
          }),
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  file: z.any().describe('The new avatar image file')
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Avatar updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    url: z.string()
                  })
                })
              }
            }
          },
          404: {
            description: 'Avatar not found',
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
          const file = formData.get('file') as File
          if (!file) {
            return c.json({ success: false, error: 'No file uploaded' }, 400)
          }

          const updateAvatarUseCase = new UpdateAvatarUseCase(this.avatarRepository)
          const { result } = await updateAvatarUseCase.run({
            id,
            file,
            currentUserId: c.get('user')?.id
          })

          if (!result.success) {
            return c.json({ success: false, error: result.error }, 400)
          }

          return c.json({
            success: true,
            data: {
              id: result.data!.id,
              url: result.data!.path
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
