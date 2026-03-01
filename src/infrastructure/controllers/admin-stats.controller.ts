import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Actions, Subjects } from '@/domain/types/permission.type'
import { checkPermission } from '../middlewares/permission.middleware'
//import { AdminAuthMiddleware } from '@/infrastructure/middlewares/auth.middleware'
import { GetPlatformStatsUseCase } from '@/application/use-cases/stats/get-platform-stats.use-case'
import type { Routes } from '@/domain/types'

export class AdminStatsController implements Routes {
  public controller: OpenAPIHono
  private getPlatformStatsUseCase: GetPlatformStatsUseCase

  constructor() {
    this.controller = new OpenAPIHono()
    this.getPlatformStatsUseCase = new GetPlatformStatsUseCase()
    this.initRoutes()
  }

  public initRoutes() {
    // Permissions: STAT - READ
    this.controller.use('/v1/admin/stats', checkPermission(Subjects.STAT, Actions.READ))
    //this.controller.use('/v1/admin/stats', AdminAuthMiddleware)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/stats',
        tags: ['Stats'],
        summary: 'Obtenir les statistiques globales de la plateforme',
        description: 'Retourne les KPI principaux et les données pour les graphiques. Filtrage possible par date.',
        request: {
          query: z.object({
            startDate: z.string().datetime().optional(),
            endDate: z.string().datetime().optional()
          })
        },
        responses: {
          200: {
            description: 'Statistiques de la plateforme',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  modulesCount: z.number(),
                  subscriptionTypesCount: z.number(),
                  gamesCount: z.number(),
                  avgTimePerGame: z.number(),
                  avgSessionDuration: z.number(),
                  successRate: z.number(),
                  parentAccountsHistogram: z.array(
                    z.object({
                      date: z.string(),
                      count: z.number()
                    })
                  ),
                  lastUpdated: z.string()
                })
              }
            }
          }
        }
      }),
      async (c) => {
        const userId = c.get('user')?.id
        const { startDate, endDate } = c.req.valid('query')
        const ipAddress =
          c.req.header('x-forwarded-for') ||
          c.req.header('x-real-ip') ||
          c.req.header('cf-connecting-ip') ||
          c.req.header('x-client-ip') ||
          c.req.header('x-remote-addr') ||
          c.req.header('remote-addr') ||
          undefined
        const { result } = await this.getPlatformStatsUseCase.run({
          currentUserId: userId,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          ipAddress
        })
        return c.json({ success: true, ...result })
      }
    )
  }
}
