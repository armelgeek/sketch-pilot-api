import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { GenerateScriptUseCase } from '@/application/use-cases/video/generate-script.use-case'
import { ValidateScriptUseCase } from '@/application/use-cases/video/validate-script.use-case'
import type { Routes } from '@/domain/types'
import { VideoOptionsSchema } from './video-options.schema'

const generateScriptUseCase = new GenerateScriptUseCase()
const validateScriptUseCase = new ValidateScriptUseCase()

export class ScriptsController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    // POST /v1/scripts/generate
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/scripts/generate',
        tags: ['Scripts'],
        summary: 'Generate a video script',
        description: 'Synchronously generates a script using the LLM engine. Does not consume video credits.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  topic: z.string().min(1).max(5000),
                  options: VideoOptionsSchema.optional()
                })
              }
            }
          }
        },
        responses: {
          202: {
            description: 'Generation enqueued',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  videoId: z.string().optional(),
                  status: z.string(),
                  message: z.string(),
                  streamUrl: z.string()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          500: {
            description: 'Generation failed',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { topic, options } = c.req.valid('json')

        const { result } = await generateScriptUseCase.run({ userId: user.id, topic, options })

        if (!result.success || !result.jobId) {
          return c.json({ error: result.error || 'Failed to enqueue script generation' }, 500)
        }

        return c.json(
          {
            jobId: result.jobId,
            videoId: result.videoId,
            status: 'queued',
            message: 'Script generation in progress...',
            streamUrl: `/api/v1/videos/jobs/${result.jobId}/stream`
          },
          202
        )
      }
    )

    // POST /v1/scripts/validate
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/scripts/validate',
        tags: ['Scripts'],
        summary: 'Validate a custom script',
        description: 'Validates a custom video script before submission to the generation queue.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  script: z.object({
                    title: z.string().optional(),
                    description: z.string().optional(),
                    duration: z.number().optional(),
                    scenes: z.array(z.any())
                  })
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Validation result',
            content: {
              'application/json': {
                schema: z.object({
                  isValid: z.boolean(),
                  score: z.number(),
                  totalIssues: z.number(),
                  criticalIssues: z.array(z.string()),
                  warnings: z.array(z.string()),
                  recommendations: z.array(z.string()),
                  metrics: z.object({
                    narrativeCoherence: z.number(),
                    timingAccuracy: z.number(),
                    visualConsistency: z.number(),
                    sceneBalance: z.number()
                  })
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { script } = c.req.valid('json')

        const { result } = await validateScriptUseCase.run({ script: script as any })

        if (!result.success || !result.validation) {
          return c.json({
            isValid: false,
            score: 0,
            totalIssues: 1,
            criticalIssues: ['Script validation could not be completed'],
            warnings: [],
            recommendations: [],
            metrics: { narrativeCoherence: 0, timingAccuracy: 0, visualConsistency: 0, sceneBalance: 0 }
          })
        }

        const v = result.validation
        return c.json({
          isValid: v.isValid,
          score: v.score,
          totalIssues: v.totalIssues,
          criticalIssues: v.criticalIssues,
          warnings: v.warnings,
          recommendations: v.recommendations,
          metrics: v.metrics
        })
      }
    )
  }
}
