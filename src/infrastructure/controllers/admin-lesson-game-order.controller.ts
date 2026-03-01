import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import { ReorderLessonGamesUseCase } from '@/application/use-cases/game/reorder-lesson-games.use-case'
import { GameRepository } from '@/infrastructure/repositories/game.repository'

export class AdminLessonGameOrderController {
  public controller: OpenAPIHono
  private reorderLessonGamesUseCase: ReorderLessonGamesUseCase

  constructor() {
    this.controller = new OpenAPIHono()
    this.reorderLessonGamesUseCase = new ReorderLessonGamesUseCase(new GameRepository())
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/lessons/{lessonId}/games/order',
        tags: ['Games'],
        summary: 'Réordonner les jeux d’une leçon',
        request: {
          params: z.object({
            lessonId: z.string().uuid()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  orderedGameIds: z.array(z.string().uuid())
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Ordre des jeux mis à jour',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string().optional()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { lessonId } = c.req.valid('param')
          const { orderedGameIds } = c.req.valid('json')
          const userId = c.get('user')?.id
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined

          const { result, activityLogId } = await this.reorderLessonGamesUseCase.run({
            lessonId,
            orderedGameIds,
            currentUserId: userId,
            ipAddress
          })

          if (result.success) {
            if (activityLogId) {
              await this.reorderLessonGamesUseCase.updateActivityResource(activityLogId, lessonId, 'game', 'success')
            }
            return c.json(result)
          } else {
            if (activityLogId) {
              await this.reorderLessonGamesUseCase.updateActivityResource(activityLogId, lessonId, 'game', 'error')
            }
            return c.json(result, 400)
          }
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
