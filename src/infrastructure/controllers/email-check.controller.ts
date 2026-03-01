import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { CheckEmailExistsUseCase } from '@/application/use-cases/user/check-email-exists.use-case'
import { UserRepository } from '@/infrastructure/repositories/user.repository'
import type { Routes } from '@/domain/types'

export class EmailCheckController implements Routes {
  public controller: OpenAPIHono
  private userRepository: UserRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.userRepository = new UserRepository()
    this.initRoutes()
  }

  public initRoutes() {
    // Check if email exists
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/auth/check-email',
        tags: ['Authentication'],
        summary: 'Check if email exists',
        description: 'Check if an email address is already registered in the system',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  email: z.string().email('Invalid email format')
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Email check completed successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    exists: z.boolean(),
                    message: z.string().optional()
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
          }
        }
      }),
      async (c: any) => {
        try {
          const body = await c.req.json()

          const checkEmailUseCase = new CheckEmailExistsUseCase(this.userRepository)
          const result = await checkEmailUseCase.execute({ email: body.email })

          if (!result.success) {
            return c.json(
              {
                success: false,
                error: result.error
              },
              400
            )
          }

          return c.json({
            success: true,
            data: {
              exists: result.exists,
              message: result.exists ? 'Email is already registered' : 'Email is available'
            }
          })
        } catch (error: any) {
          return c.json(
            {
              success: false,
              error: error.message || 'Failed to check email'
            },
            400
          )
        }
      }
    )

    // Alternative GET endpoint for checking email (query parameter)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/auth/check-email',
        tags: ['Authentication'],
        summary: 'Check if email exists (GET)',
        description: 'Check if an email address is already registered in the system via query parameter',
        request: {
          query: z.object({
            email: z.string().email('Invalid email format')
          })
        },
        responses: {
          200: {
            description: 'Email check completed successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    exists: z.boolean(),
                    message: z.string().optional()
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
          }
        }
      }),
      async (c: any) => {
        try {
          const query = c.req.valid('query')

          const checkEmailUseCase = new CheckEmailExistsUseCase(this.userRepository)
          const result = await checkEmailUseCase.execute({ email: query.email })

          if (!result.success) {
            return c.json(
              {
                success: false,
                error: result.error
              },
              400
            )
          }

          return c.json({
            success: true,
            data: {
              exists: result.exists,
              message: result.exists ? 'Email is already registered' : 'Email is available'
            }
          })
        } catch (error: any) {
          return c.json(
            {
              success: false,
              error: error.message || 'Failed to check email'
            },
            400
          )
        }
      }
    )
  }
}
