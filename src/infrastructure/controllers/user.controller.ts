import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { CreateAdminUserUseCase } from '@/application/use-cases/user/create-admin-user.use-case'
import { DeleteUserUseCase } from '@/application/use-cases/user/delete-user.use-case'
import { UpdateUserUseCase } from '@/application/use-cases/user/update-user.use-case'
import { auth } from '../config/auth.config'
import { sendEmail } from '../config/mail.config'
import { requireAdmin } from '../middlewares/admin.middleware'
import { UserRepository } from '../repositories/user.repository'
import type { Routes } from '../../domain/types'

export class UserController implements Routes {
  public controller: OpenAPIHono
  private userRepository: UserRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.userRepository = new UserRepository()
  }

  public initRoutes() {
    // All /v1/admin/* routes require admin role
    this.controller.use('/v1/admin/*', requireAdmin)

    // GET /v1/users/session
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/users/session',
        tags: ['User'],
        summary: 'Retrieve the user session information',
        description: 'Retrieve the session info of the currently logged in user.',
        operationId: 'getUserSession',
        responses: {
          200: {
            description: 'Session information successfully retrieved',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({ user: z.any() })
                })
              }
            }
          }
        }
      }),
      (ctx: any) => {
        const user = ctx.get('user')
        if (!user) {
          return ctx.json({ error: 'Unauthorized' }, 401)
        }
        return ctx.json({ success: true, data: { user } })
      }
    )

    // GET /v1/users/{id}
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/users/{id}',
        tags: ['User'],
        summary: 'Get user by ID',
        description: 'Retrieve a user by their unique identifier.',
        request: {
          params: z.object({
            id: z.string().openapi({ description: 'User ID' })
          })
        },
        responses: {
          200: {
            description: 'User found',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.any() })
              }
            }
          },
          404: {
            description: 'User not found',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), error: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const user = await this.userRepository.findById(id)
        if (!user) {
          return c.json({ success: false, error: 'User not found' }, 404)
        }
        return c.json({ success: true, data: user })
      }
    )

    // GET /v1/admin/users
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/users',
        tags: ['Admin'],
        summary: 'List users (paginated)',
        request: {
          query: z.object({
            page: z
              .string()
              .transform(Number)
              .optional()
              .openapi({ param: { name: 'page', in: 'query' } }),
            limit: z
              .string()
              .transform(Number)
              .optional()
              .openapi({ param: { name: 'limit', in: 'query' } }),
            search: z
              .string()
              .optional()
              .openapi({ param: { name: 'search', in: 'query' } }),
            role: z
              .string()
              .optional()
              .openapi({ param: { name: 'role', in: 'query' } })
          })
        },
        responses: {
          200: {
            description: 'List of users',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    users: z.array(z.any()),
                    total: z.number(),
                    page: z.number(),
                    limit: z.number()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const query = c.req.valid('query')
          const result = await this.userRepository.findPaginatedUsers({
            page: query.page,
            limit: query.limit,
            search: query.search,
            role: query.role
          })
          return c.json({ success: true, data: result })
        } catch (error: any) {
          return c.json({ success: false, error: error.message || 'Internal server error' }, 500)
        }
      }
    )

    // GET /v1/admin/users/{id}
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/users/{id}',
        tags: ['Admin'],
        summary: 'Get user by ID (admin)',
        description: 'Retrieve a user by their unique identifier for admin purposes.',
        request: {
          params: z.object({
            id: z.string().openapi({ description: 'User ID' })
          })
        },
        responses: {
          200: {
            description: 'User found',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.any() })
              }
            }
          },
          404: {
            description: 'User not found',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), error: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const user = await this.userRepository.findById(id)
        if (!user) {
          return c.json({ success: false, error: 'Utilisateur non trouvé' }, 404)
        }
        return c.successResponse(user)
      }
    )

    // POST /v1/admin/users
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/users',
        tags: ['Admin'],
        summary: 'Create a new admin user',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  firstname: z.string().nullable(),
                  lastname: z.string().nullable(),
                  email: z.string().email()
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'User created successfully',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), error: z.string() }) }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { firstname, lastname, email } = await c.req.json()
          const useCase = new CreateAdminUserUseCase(auth, sendEmail)
          const { result } = await useCase.run({ firstname, lastname, email })
          if (!result.success) {
            return c.json({ success: false, error: result.error }, 400)
          }
          return c.json({ success: true, data: result.data }, 201)
        } catch (error: any) {
          return c.json({ success: false, error: error.message || 'Internal server error' }, 500)
        }
      }
    )

    // PUT /v1/admin/users/{id}
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/users/{id}',
        tags: ['Admin'],
        summary: 'Update user information',
        request: {
          params: z.object({
            id: z.string().openapi({ param: { name: 'id', in: 'path', required: true } })
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  firstname: z.string().min(1).optional(),
                  lastname: z.string().min(1).optional(),
                  email: z.string().email().optional(),
                  role: z.enum(['admin', 'user']).optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'User updated successfully',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), error: z.string() }) }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const currentUser = c.get('user')
          const { id: userId } = c.req.valid('param')
          const { firstname, lastname, email } = c.req.valid('json')

          const useCase = new UpdateUserUseCase(this.userRepository)
          const { result } = await useCase.run({
            userId,
            currentUserId: currentUser.id,
            firstname,
            lastname,
            email
          })

          if (!result.success) {
            return c.json({ success: false, error: result.error }, result.error?.includes('non trouvé') ? 404 : 400)
          }
          return c.json({ success: true, data: result.data })
        } catch (error: any) {
          return c.json({ success: false, error: error.message || 'Internal server error' }, 500)
        }
      }
    )

    // DELETE /v1/admin/users/{id}
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/users/{id}',
        tags: ['Admin'],
        summary: 'Delete user account',
        request: {
          params: z.object({
            id: z.string().openapi({ param: { name: 'id', in: 'path', required: true } })
          })
        },
        responses: {
          200: {
            description: 'User deleted successfully',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), message: z.string().optional() }) }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), error: z.string() }) }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const currentUser = c.get('user')
          const { id: userId } = c.req.valid('param')
          const useCase = new DeleteUserUseCase(this.userRepository)
          const { result } = await useCase.run({ userId, currentUserId: currentUser.id })
          if (!result.success) {
            return c.json({ success: false, error: result.error }, result.error?.includes('non trouvé') ? 404 : 400)
          }
          return c.json({ success: true, message: 'Utilisateur supprimé avec succès' })
        } catch (error: any) {
          return c.json({ success: false, error: error.message || 'Internal server error' }, 500)
        }
      }
    )

    // PATCH /v1/admin/users/{id}/ban
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/users/{id}/ban',
        tags: ['Admin'],
        summary: 'Ban user',
        request: {
          params: z.object({
            id: z.string().openapi({ param: { name: 'id', in: 'path', required: true } })
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  reason: z.string().optional(),
                  expiresAt: z.string().datetime().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'User banned successfully',
            content: {
              'application/json': { schema: z.object({ success: z.boolean() }) }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { id } = c.req.valid('param')
          const { reason, expiresAt } = c.req.valid('json')
          await this.userRepository.banUser(id, reason, expiresAt ? new Date(expiresAt) : undefined)
          return c.json({ success: true })
        } catch (error: any) {
          return c.json({ success: false, error: error.message || 'Internal server error' }, 500)
        }
      }
    )

    // PATCH /v1/admin/users/{id}/unban
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/users/{id}/unban',
        tags: ['Admin'],
        summary: 'Unban user',
        request: {
          params: z.object({
            id: z.string().openapi({ param: { name: 'id', in: 'path', required: true } })
          })
        },
        responses: {
          200: {
            description: 'User unbanned successfully',
            content: {
              'application/json': { schema: z.object({ success: z.boolean() }) }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { id } = c.req.valid('param')
          await this.userRepository.unbanUser(id)
          return c.json({ success: true })
        } catch (error: any) {
          return c.json({ success: false, error: error.message || 'Internal server error' }, 500)
        }
      }
    )
  }
}
