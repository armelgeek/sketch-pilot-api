import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import { AssistantOpenAIService } from '@/application/services/assistant-openai.service'
import { AssistantMessageUseCase } from '@/application/use-cases/assistant/assistant-message.use-case'

export class AssistantController {
  public controller: OpenAPIHono
  private assistantMessageUseCase: AssistantMessageUseCase

  constructor() {
    this.controller = new OpenAPIHono()
    this.assistantMessageUseCase = new AssistantMessageUseCase(new AssistantOpenAIService())
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/assistant-message',
        tags: ['Assistant'],
        summary: 'Génère un message assistant contextuel pour un jeu',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  game: z.string(),
                  eventType: z.string(),
                  context: z.record(z.unknown()),
                  lang: z.string().default('fr'),
                  persona: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Message assistant généré',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  lines: z.array(z.string()),
                  error: z.string().optional()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const { game, eventType, context, lang, persona } = await c.req.json()
        const result = await this.assistantMessageUseCase.execute({ game, eventType, context, lang, persona })
        if (result.success && result.lines) {
          return c.json({ success: true, lines: result.lines })
        } else {
          return c.json({ success: false, error: result.error ?? 'Erreur inconnue' }, 400)
        }
      }
    )
  }
}
