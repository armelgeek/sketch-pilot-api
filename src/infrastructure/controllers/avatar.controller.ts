import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { AvatarService } from '@/application/services/avatar.service'
import { FileService } from '@/application/services/file.service'
import { DeleteAvatarMinIOUseCase } from '@/application/use-cases/file/delete-avatar-minio.use-case'
import { ListAvatarsUseCase } from '@/application/use-cases/file/list-avatars.use-case'
import { UploadAvatarMinIOUseCase } from '@/application/use-cases/file/upload-avatar-minio.use-case'
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

    //this.controller.use('/v1/avatars', checkPermission(Subjects.AVATAR, Actions.READ))

    //this.controller.use('/v1/avatars/upload', checkPermission(Subjects.AVATAR, Actions.CREATE))
    //this.controller.use('/v1/avatars/:id', checkPermission(Subjects.AVATAR, Actions.READ))

    //this.controller.use('/v1/avatars/:id', checkPermission(Subjects.AVATAR, Actions.DELETE))

    //this.controller.use('/v1/avatars/:id', checkPermission(Subjects.AVATAR, Actions.UPDATE))

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
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const pagination = c.get('pagination')
          const listAvatarsUseCase = new ListAvatarsUseCase(this.fileService, this.avatarService)
          const { result } = await listAvatarsUseCase.run({
            ...pagination,
            currentUserId: c.get('user')?.id,
            ipAddress
          })
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
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          // Utiliser MinIO pour l'upload avec log d'activité
          const uploadAvatarUseCase = new UploadAvatarMinIOUseCase(this.avatarService)
          const { result, activityLogId } = await uploadAvatarUseCase.run({
            file,
            currentUserId: c.get('user')?.id,
            ipAddress
          })

          if (!result.success) {
            if (activityLogId) {
              await uploadAvatarUseCase.updateActivityResource(activityLogId, undefined, 'avatar', 'error')
            }
            return c.json({ success: false, error: result.error }, 400)
          }

          if (activityLogId && result.data) {
            await uploadAvatarUseCase.updateActivityResource(activityLogId, result.data.id, 'avatar', 'success')
          }

          return c.json({
            success: true,
            data: {
              id: result.data?.id,
              url: result.data?.url // Retourner l'URL MinIO directement
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

          // Récupérer l'URL signée MinIO
          const url = await this.avatarService.getAvatarUrl(id)

          if (!url) {
            return c.json({ success: false, error: 'Avatar not found' }, 404)
          }

          return c.json({
            success: true,
            data: { url }
          })
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
          401: {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          },
          403: {
            description: 'Forbidden - Admin access required',
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
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          // Utiliser MinIO pour la suppression avec log d'activité
          const deleteAvatarUseCase = new DeleteAvatarMinIOUseCase(this.avatarService)
          const { result, activityLogId } = await deleteAvatarUseCase.run({
            id,
            currentUserId: c.get('user')?.id,
            ipAddress
          })

          if (!result.success) {
            if (activityLogId) {
              await deleteAvatarUseCase.updateActivityResource(activityLogId, id, 'avatar', 'error')
            }
            return c.json({ success: false, error: result.error }, 404)
          }

          if (activityLogId) {
            await deleteAvatarUseCase.updateActivityResource(activityLogId, id, 'avatar', 'success')
          }

          return c.json(result)
        } catch (error: any) {
          if (error.message === 'Avatar not found') {
            return c.json({ success: false, error: error.message }, 404)
          }
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
        description: 'Update an existing avatar. Admin only.',
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
          401: {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          },
          403: {
            description: 'Forbidden - Admin access required',
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
          const file = await c.req.file('file')
          if (!file) {
            return c.json({ success: false, error: 'No file uploaded' }, 400)
          }

          // Utiliser MinIO pour la mise à jour
          const uploadAvatarUseCase = new UploadAvatarMinIOUseCase(this.avatarService)
          const result = await uploadAvatarUseCase.execute({ file })

          if (!result.success) {
            return c.json({ success: false, error: result.error }, 400)
          }

          return c.json({
            success: true,
            data: {
              id: result.data!.id,
              url: result.data!.url // Utiliser l'URL MinIO
            }
          })
        } catch (error: any) {
          if (error.message === 'Avatar not found') {
            return c.json({ success: false, error: error.message }, 404)
          }
          if (error.message.includes('Unauthorized')) {
            return c.json({ success: false, error: error.message }, 403)
          }
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
