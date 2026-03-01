import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { ReorderModulesUseCase } from '@/application/use-cases/module/reorder-modules.use-case'
import type { Routes } from '@/domain/types'

export class AdminModuleOrderController implements Routes {
  public controller: OpenAPIHono
  private reorderModulesUseCase: ReorderModulesUseCase

  constructor() {
    this.controller = new OpenAPIHono()
    this.reorderModulesUseCase = new ReorderModulesUseCase()
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/modules/order',
        tags: ['Modules'],
        summary: 'Réordonner les modules',
        description: 'Met à jour la position de chaque module selon l’ordre fourni.',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  moduleIds: z.array(z.string())
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Ordre des modules mis à jour',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
                })
              }
            }
          },
          400: {
            description: 'Erreur lors de la mise à jour',
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
        const { moduleIds } = c.req.valid('json')
        const userId = c.get('user')?.id
        const ipAddress =
          c.req.header('x-forwarded-for') ||
          c.req.header('x-real-ip') ||
          c.req.header('cf-connecting-ip') ||
          c.req.header('x-client-ip') ||
          c.req.header('x-remote-addr') ||
          c.req.header('remote-addr') ||
          undefined

        const { result, activityLogId } = await this.reorderModulesUseCase.run({
          moduleIds,
          currentUserId: userId,
          ipAddress
        })

        if (result.success) {
          if (activityLogId) {
            await this.reorderModulesUseCase.updateActivityResource(activityLogId, undefined, 'module', 'success')
          }
          return c.json({ success: true })
        } else {
          if (activityLogId) {
            await this.reorderModulesUseCase.updateActivityResource(activityLogId, undefined, 'module', 'error')
          }
          return c.json({ success: false, error: result.error }, 400)
        }
      }
    )
  }
}
