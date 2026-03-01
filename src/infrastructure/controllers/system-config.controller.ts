import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { GetSystemConfigUseCase } from '@/application/use-cases/system-config/get-system-config.use-case'
import { SystemConfigRepository } from '@/infrastructure/repositories/system-config.repository'
import type { Routes } from '@/domain/types'

export class SystemConfigController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
    this.initRoutes()
  }

  public initRoutes() {
    // GET /v1/admin/system/config - Récupérer la configuration système (isSubscriptionEnabled uniquement)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/system/config',
        tags: ['System Configuration'],
        summary: 'Get system configuration',
        responses: {
          200: {
            description: 'System configuration retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    isSubscriptionEnabled: z.boolean()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const useCase = new GetSystemConfigUseCase(new SystemConfigRepository())
          const result = await useCase.execute()
          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 500)
        }
      }
    )

    // PUT /v1/admin/system/config - Mettre à jour la configuration système (isSubscriptionEnabled uniquement)
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/system/config',
        tags: ['System Configuration'],
        summary: 'Update system configuration',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  isSubscriptionEnabled: z.boolean().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'System configuration updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    isSubscriptionEnabled: z.boolean()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const updates = await c.req.json()
          const { UpdateSystemConfigUseCase } = await import(
            '@/application/use-cases/system-config/update-system-config.use-case'
          )
          const { SystemConfigRepository } = await import('@/infrastructure/repositories/system-config.repository')
          const useCase = new UpdateSystemConfigUseCase(new SystemConfigRepository())
          const result = await useCase.execute(updates)
          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
