import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import { PermissionService } from '@/application/services/permission.service'
import { CreateAdminUserUseCase } from '@/application/use-cases/user/create-admin-user.use-case'
import { DeleteUserUseCase } from '@/application/use-cases/user/delete-user.use-case'
import { ListRolesWithDetailsUseCase } from '@/application/use-cases/user/list-roles-with-details.use-case'
import { ListUsersWithRolesUseCase } from '@/application/use-cases/user/list-users-with-roles.use-case'
import { UpdateUserUseCase } from '@/application/use-cases/user/update-user.use-case'
import { Actions, Subjects } from '@/domain/types/permission.type'
import { auth } from '../config/auth.config'
import { sendEmail } from '../config/mail.config'
import { db } from '../database/db'
import { userRoles } from '../database/schema'
import { checkPermission } from '../middlewares/permission.middleware'
import { UserRepository } from '../repositories/user.repository'
import type { Routes } from '../../domain/types'

export class UserController implements Routes {
  public controller: OpenAPIHono
  private userRepository: UserRepository
  private permissionService: PermissionService

  constructor() {
    this.controller = new OpenAPIHono()
    this.userRepository = new UserRepository()
    this.permissionService = new PermissionService()
  }

  public initRoutes() {
    // Permissions: ADMIN - READ
    this.controller.use('/v1/admin/users', checkPermission(Subjects.ADMIN, Actions.READ))
    // Permissions: ADMIN - CREATE
    this.controller.use('/v1/admin/users', (c, next) =>
      c.req.method === 'POST' ? checkPermission(Subjects.ADMIN, Actions.CREATE)(c, next) : next()
    )
    // Permissions: ADMIN - UPDATE
    this.controller.use('/v1/admin/users', (c, next) =>
      c.req.method === 'PUT' ? checkPermission(Subjects.ADMIN, Actions.UPDATE)(c, next) : next()
    )
    // Permissions: ADMIN - DELETE
    this.controller.use('/v1/admin/users', (c, next) =>
      c.req.method === 'DELETE' ? checkPermission(Subjects.ADMIN, Actions.DELETE)(c, next) : next()
    )
    // Permissions: ROLES - READ
    this.controller.use('/v1/admin/roles', checkPermission(Subjects.ADMIN, Actions.READ))
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/users/{id}',
        tags: ['User'],
        summary: 'Get user by ID',
        description: 'Retrieve a user by their unique identifier.',
        request: {
          params: z.object({
            id: z.string().openapi({
              description: 'User ID'
            })
          })
        },
        responses: {
          200: {
            description: 'User found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    name: z.string(),
                    firstname: z.string().optional(),
                    lastname: z.string().optional(),
                    email: z.string(),
                    emailVerified: z.boolean(),
                    image: z.string().optional(),
                    isAdmin: z.boolean(),
                    lastLoginAt: z.string().nullable(),
                    createdAt: z.string(),
                    updatedAt: z.string(),
                    roleIds: z.array(z.string())
                  })
                })
              }
            }
          },
          404: {
            description: 'User not found',
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
        const { id } = c.req.valid('param')
        const user = await this.userRepository.findById(id)
        if (!user) {
          return c.json({ success: false, error: 'User not found' }, 404)
        }
        // Récupérer les rôles de l'utilisateur
        const userRolesRows = await db.select().from(userRoles).where(eq(userRoles.userId, id))
        const roleIds = userRolesRows.map((r) => r.roleId)
        return c.json({ success: true, data: { ...user, roleIds } })
      }
    )
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
                  success: z.boolean().openapi({
                    description: 'Indicates whether the operation was successful',
                    type: 'boolean',
                    example: true
                  }),
                  data: z.object({
                    user: z.object({
                      id: z.string().openapi({
                        description: 'User identifier',
                        type: 'string',
                        example: 'user_ABC123'
                      }),
                      name: z.string().openapi({
                        description: 'User name',
                        type: 'string',
                        example: 'Armel Wanes'
                      }),
                      email: z.string().openapi({
                        description: 'User email',
                        type: 'string',
                        example: 'armelgeek5@gmail.com'
                      }),
                      emailVerified: z.boolean().openapi({
                        description: 'User email verification status',
                        type: 'boolean',
                        example: false
                      }),
                      image: z.string().nullable().openapi({
                        description: 'User image URL',
                        type: 'string',
                        example: null
                      }),
                      createdAt: z.string().openapi({
                        description: 'User creation timestamp',
                        type: 'string',
                        example: '2025-05-06T16:34:49.937Z'
                      }),
                      updatedAt: z.string().openapi({
                        description: 'User update timestamp',
                        type: 'string',
                        example: '2025-05-06T16:34:49.937Z'
                      }),
                      isAdmin: z.boolean().openapi({
                        description: 'Flag indicating if the user has admin privileges',
                        type: 'boolean',
                        example: false
                      }),
                      c: z.boolean().openapi({
                        description: 'Flag indicating if the user has an active trial',
                        type: 'boolean',
                        example: false
                      }),
                      trialStartDate: z.string().nullable().openapi({
                        description: 'Trial start date',
                        type: 'string',
                        example: '2025-05-06T16:34:49.937Z'
                      }),
                      trialEndDate: z.string().nullable().openapi({
                        description: 'Trial end date',
                        type: 'string',
                        example: '2025-05-20T16:34:49.937Z'
                      })
                    })
                  })
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
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/users',
        tags: ['Admin'],
        summary: 'List users with roles (excluding regular users)',
        description: 'Get a list of users who have specific roles assigned, excluding regular users.',
        request: {
          query: z.object({
            page: z
              .string()
              .transform(Number)
              .optional()
              .openapi({
                param: {
                  name: 'page',
                  in: 'query',
                  description: 'Page number for pagination',
                  schema: {
                    type: 'integer',
                    default: 1,
                    minimum: 1
                  }
                }
              }),
            limit: z
              .string()
              .transform(Number)
              .optional()
              .openapi({
                param: {
                  name: 'limit',
                  in: 'query',
                  description: 'Number of items per page',
                  schema: {
                    type: 'integer',
                    default: 10,
                    minimum: 1,
                    maximum: 100
                  }
                }
              }),
            search: z
              .string()
              .optional()
              .openapi({
                param: {
                  name: 'search',
                  in: 'query',
                  description: 'Search by name or email',
                  schema: {
                    type: 'string'
                  }
                }
              })
          })
        },
        responses: {
          200: {
            description: 'List of users with their roles and permissions',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    users: z.array(
                      z.object({
                        id: z.string(),
                        name: z.string(),
                        firstname: z.string(),
                        lastname: z.string(),
                        email: z.string(),
                        roles: z.array(
                          z.object({
                            id: z.string(),
                            name: z.string(),
                            lastLoginAt: z.string().nullable(),
                            permissions: z.array(
                              z.object({
                                subject: z.string(),
                                actions: z.array(z.string())
                              })
                            )
                          })
                        )
                      })
                    ),
                    total: z.number(),
                    page: z.number(),
                    limit: z.number()
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
          }
        }
      }),
      async (c: any) => {
        try {
          const query = c.req.valid('query')
          const currentUser = c.get('user')
          if (!currentUser && currentUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized' }, 401)
          }
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const listUsersWithRolesUseCase = new ListUsersWithRolesUseCase(this.userRepository, this.permissionService)
          const { result } = await listUsersWithRolesUseCase.run({
            page: query.page,
            limit: query.limit,
            search: query.search
          })
          return c.json(result)
        } catch (error: any) {
          console.error('Error listing users with roles:', error)
          return c.json(
            {
              success: false,
              error: error.message || 'Internal server error'
            },
            500
          )
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/users',
        tags: ['Admin'],
        summary: 'Create a new user with roles',
        description: 'Create a new user and assign specified roles to them.',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  firstname: z.string().nullable(),
                  lastname: z.string().nullable(),
                  email: z.string().email(),
                  roleIds: z.array(z.string().uuid()).min(1)
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    firstname: z.string(),
                    lastname: z.string(),
                    email: z.string(),
                    lastLoginAt: z.string().nullable(),
                    createdAt: z.string(),
                    updatedAt: z.string(),
                    tempPassword: z.string().optional()
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
          }
        }
      }),
      async (c: any) => {
        const currentUser = c.get('user')
        if (!currentUser && currentUser.role !== 'admin') {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }
        try {
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const { firstname, lastname, email, roleIds } = await c.req.json()
          const useCase = new CreateAdminUserUseCase(db, auth, sendEmail)
          const { result } = await useCase.run({
            firstname,
            lastname,
            email,
            roleIds
          })
          if (!result.success) {
            return c.json({ success: false, error: result.error }, 400)
          }
          return c.json({ success: true, data: result.data }, 201)
        } catch (error: any) {
          console.error('Error creating user:', error)
          return c.json(
            {
              success: false,
              error: error.message || 'Internal server error'
            },
            500
          )
        }
      }
    )
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/roles',
        tags: ['Roles'],
        summary: 'List all available roles',
        description: 'Get a list of all available roles with their permissions.',
        responses: {
          200: {
            description: 'List of roles successfully retrieved',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.array(
                    z.object({
                      id: z.string(),
                      name: z.string(),
                      firstname: z.string(),
                      lastname: z.string(),
                      description: z.string(),
                      permissions: z.array(
                        z.object({
                          subject: z.string(),
                          actions: z.array(z.string())
                        })
                      ),
                      stats: z.object({
                        totalUsers: z.number(),
                        users: z.array(
                          z.object({
                            id: z.string(),
                            name: z.string(),
                            email: z.string(),
                            lastLoginAt: z.string().nullable()
                          })
                        )
                      })
                    })
                  )
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
          }
        }
      }),
      async (c: any) => {
        try {
          const currentUser = c.get('user')
          if (!currentUser) {
            return c.json({ success: false, error: 'Unauthorized' }, 401)
          }
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const useCase = new ListRolesWithDetailsUseCase(this.permissionService)
          const { result } = await useCase.run({})
          return c.json(result)
        } catch (error: any) {
          console.error('Error listing roles:', error)
          return c.json(
            {
              success: false,
              error: error.message || 'Internal server error'
            },
            500
          )
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/users/{id}',
        tags: ['Admin'],
        summary: 'Update user information',
        description:
          'Update user information including name, email, and roles. Only super admins can perform this action.',
        request: {
          params: z.object({
            id: z.string().openapi({
              param: {
                name: 'id',
                in: 'path',
                description: 'User ID to update',
                required: true
              }
            })
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  firstname: z.string().min(1).optional().openapi({
                    description: 'User first name'
                  }),
                  lastname: z.string().min(1).optional().openapi({
                    description: 'User last name'
                  }),
                  email: z.string().email().optional().openapi({
                    description: 'User email address'
                  }),
                  roleIds: z.array(z.string().uuid()).optional().openapi({
                    description: 'Array of role IDs to assign to the user'
                  })
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'User updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    firstname: z.string(),
                    lastname: z.string(),
                    name: z.string(),
                    email: z.string(),
                    roles: z.array(
                      z.object({
                        id: z.string(),
                        name: z.string()
                      })
                    )
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
          404: {
            description: 'User not found',
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
          const currentUser = c.get('user')
          if (!currentUser) {
            return c.json({ success: false, error: 'Unauthorized' }, 401)
          }

          const { id: userId } = c.req.valid('param')
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const { firstname, lastname, email, roleIds } = c.req.valid('json')

          const updateUserUseCase = new UpdateUserUseCase(this.userRepository, this.permissionService)
          const { result } = await updateUserUseCase.run({
            userId,
            currentUserId: currentUser.id,
            firstname,
            lastname,
            name: `${firstname} ${lastname}`,
            email,
            roleIds
          })

          if (!result.success) {
            const statusCode = result.error?.includes('non trouvé') ? 404 : 400
            return c.json(
              {
                success: false,
                error: result.error
              },
              statusCode
            )
          }
          return c.json({
            success: true,
            data: result.data
          })
        } catch (error: any) {
          console.error('Error updating user:', error)
          return c.json(
            {
              success: false,
              error: error.message || 'Internal server error'
            },
            500
          )
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/users/{id}',
        tags: ['Admin'],
        summary: 'Delete user account',
        description:
          'Delete a user account and all associated data. Only super admins can perform this action. Cannot delete own account or other super admin accounts.',
        request: {
          params: z.object({
            id: z.string().openapi({
              param: {
                name: 'id',
                in: 'path',
                description: 'User ID to delete',
                required: true
              }
            })
          })
        },
        responses: {
          200: {
            description: 'User deleted successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  message: z.string().optional()
                })
              }
            }
          },
          400: {
            description: 'Bad request - Cannot delete user',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized - Must be super admin',
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
            description: 'User not found',
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
          const currentUser = c.get('user')
          if (!currentUser) {
            return c.json({ success: false, error: 'Unauthorized' }, 401)
          }

          const { id: userId } = c.req.valid('param')
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const deleteUserUseCase = new DeleteUserUseCase(this.userRepository, this.permissionService)
          const { result } = await deleteUserUseCase.run({
            userId,
            currentUserId: currentUser.id
          })

          if (!result.success) {
            const statusCode = result.error?.includes('non trouvé') ? 404 : 400
            return c.json(
              {
                success: false,
                error: result.error
              },
              statusCode
            )
          }
          return c.json({
            success: true,
            message: 'Utilisateur supprimé avec succès'
          })
        } catch (error: any) {
          console.error('Error deleting user:', error)
          return c.json(
            {
              success: false,
              error: error.message || 'Internal server error'
            },
            500
          )
        }
      }
    )
  }
}
