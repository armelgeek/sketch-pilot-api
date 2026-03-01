import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { PermissionService } from '@/application/services/permission.service'
import { AssignRoleToUserUseCase } from '@/application/use-cases/permission/assign-role-to-user.use-case'
import { CreateRoleUseCase } from '@/application/use-cases/permission/create-role.use-case'
import { DeleteRoleUseCase } from '@/application/use-cases/permission/delete-role.use-case'
import { GetRoleDetailsByIdUseCase } from '@/application/use-cases/permission/get-role-details-by-id.use-case'
import { ListRoleDetailsUseCase } from '@/application/use-cases/permission/list-role-details.use-case'
import { UpdateRoleUseCase } from '@/application/use-cases/permission/update-role.use-case'
import { Actions, Subjects } from '@/domain/types/permission.type'

const actionEnum = z.enum([Actions.CREATE, Actions.READ, Actions.UPDATE, Actions.DELETE])

const subjectEnum = z.enum([
  Subjects.MODULE,
  Subjects.CHAPTER,
  Subjects.SUBSCRIPTION,
  Subjects.PARENT,
  Subjects.ADMIN,
  Subjects.STAT,
  Subjects.AVATAR,
  Subjects.ACTIVITY,
  Subjects.AVATAR
])

export class PermissionController {
  public controller: OpenAPIHono
  private readonly permissionService: PermissionService
  private readonly createRoleUseCase: CreateRoleUseCase
  private readonly assignRoleToUserUseCase: AssignRoleToUserUseCase
  private readonly listRoleDetailsUseCase: ListRoleDetailsUseCase
  private readonly updateRoleUseCase: UpdateRoleUseCase
  private readonly deleteRoleUseCase: DeleteRoleUseCase
  private readonly getRoleDetailsByIdUseCase: GetRoleDetailsByIdUseCase

  constructor() {
    this.controller = new OpenAPIHono()
    this.permissionService = new PermissionService()
    this.createRoleUseCase = new CreateRoleUseCase(this.permissionService)
    this.assignRoleToUserUseCase = new AssignRoleToUserUseCase(this.permissionService)
    this.listRoleDetailsUseCase = new ListRoleDetailsUseCase(this.permissionService)
    this.updateRoleUseCase = new UpdateRoleUseCase(this.permissionService)
    this.deleteRoleUseCase = new DeleteRoleUseCase(this.permissionService)
    this.getRoleDetailsByIdUseCase = new GetRoleDetailsByIdUseCase(this.permissionService)
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/roles',
        tags: ['Roles'],
        summary: 'Create a new role',
        description: 'Create a new role with specific permissions for each module',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string().min(1),
                  description: z.string(),
                  permissions: z.array(
                    z.object({
                      subject: subjectEnum,
                      actions: z.array(actionEnum)
                    })
                  )
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Role created successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string().uuid()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { name, description, permissions } = await c.req.json()

          const resources = permissions.map((p: any) => ({
            resourceType: p.subject,
            actions: p.actions
          }))
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const roleId = await this.createRoleUseCase.run({
            currentUserId: c.get('user').id,
            name,
            description,
            resources,
            ipAddress
          })

          return c.json(
            {
              success: true,
              data: { id: roleId }
            },
            201
          )
        } catch (error: any) {
          return c.json(
            {
              success: false,
              error: error.message
            },
            400
          )
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/users/:userId/roles/:roleId',
        tags: ['Roles'],
        summary: 'Assign a role to a user',
        description: 'Assign a role to a specific user. Admin only.',
        request: {
          params: z.object({
            userId: z.string().uuid(),
            roleId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Role assigned successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
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
          const { userId, roleId } = c.req.param()
          const currentUser = c.get('user')
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          await this.assignRoleToUserUseCase.run({
            userId,
            roleId,
            currentUserId: currentUser.id,
            ipAddress
          })

          return c.json({ success: true })
        } catch (error: any) {
          return c.json(
            {
              success: false,
              error: error.message
            },
            400
          )
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/roles/:roleId/details',
        tags: ['Roles'],
        summary: 'Get role details by ID',
        description: 'Get a single role with its permissions and users',
        request: {
          params: z.object({
            roleId: z.string().uuid(),
            recordActivity: z.boolean().optional().default(false)
          })
        },
        responses: {
          200: {
            description: 'Role details retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z
                    .object({
                      id: z.string(),
                      name: z.string(),
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
                    .nullable(),
                  error: z.string().optional()
                })
              }
            }
          },
          404: {
            description: 'Role not found',
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
          const { roleId, recordActivity } = c.req.param()
          const currentUser = c.get('user')
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          let resultData
          if (recordActivity === 'true' || recordActivity === true) {
            const { result } = await this.getRoleDetailsByIdUseCase.run({
              roleId,
              currentUserId: currentUser?.id,
              ipAddress
            })
            resultData = result
          } else {
            resultData = await this.getRoleDetailsByIdUseCase.execute({
              roleId
            })
          }

          if (!resultData.success) {
            return c.json({ success: false, error: resultData.error }, 404)
          }
          return c.json(resultData)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/roles/{roleId}',
        tags: ['Roles'],
        security: [{ Bearer: [] }],
        summary: 'Update a role',
        description: 'Update a role and its permissions',
        request: {
          params: z.object({
            roleId: z.string().uuid()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string().min(1).optional(),
                  description: z.string().optional(),
                  permissions: z
                    .array(
                      z.object({
                        subject: subjectEnum,
                        actions: z.array(actionEnum)
                      })
                    )
                    .optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Role updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string().uuid()
                  })
                })
              }
            }
          },
          404: {
            description: 'Role not found',
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
          const { roleId } = c.req.param()
          const currentUser = c.get('user')
          const body = await c.req.json()
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const { result } = await this.updateRoleUseCase.run({
            roleId,
            currentUserId: currentUser.id,
            ipAddress,
            ...body
          })

          return c.json(result)
        } catch (error: any) {
          if (error.message === 'Role not found') {
            return c.json(
              {
                success: false,
                error: error.message
              },
              404
            )
          }
          return c.json(
            {
              success: false,
              error: error.message
            },
            400
          )
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/roles/{roleId}',
        tags: ['Roles'],
        security: [{ Bearer: [] }],
        summary: 'Delete a role',
        description: 'Delete a role and all its permissions. Cannot delete system roles.',
        request: {
          params: z.object({
            roleId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Role deleted successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
                })
              }
            }
          },
          403: {
            description: 'Cannot delete system role',
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
            description: 'Role not found',
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
          const { roleId } = c.req.param()
          const currentUser = c.get('user')
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const { result } = await this.deleteRoleUseCase.run({
            roleId,
            currentUserId: currentUser.id,
            ipAddress
          })

          return c.json(result)
        } catch (error: any) {
          if (error.message === 'Role not found') {
            return c.json(
              {
                success: false,
                error: error.message
              },
              404
            )
          }
          if (error.message === 'Cannot delete super admin role') {
            return c.json(
              {
                success: false,
                error: error.message
              },
              403
            )
          }
          return c.json(
            {
              success: false,
              error: error.message
            },
            400
          )
        }
      }
    )
  }

  public getRouter() {
    return this.controller
  }
}
