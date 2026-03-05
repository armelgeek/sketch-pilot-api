import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Routes } from '@/domain/types'

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
        description: 'Synchronously generates a script using the LLM. Does not consume video credits.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  topic: z.string().min(1).max(500),
                  options: z
                    .object({
                      duration: z.number().optional(),
                      sceneCount: z.number().optional(),
                      style: z.string().optional(),
                      videoType: z.string().optional(),
                      videoGenre: z.string().optional(),
                      language: z.string().optional(),
                      llmProvider: z.string().optional(),
                      qualityMode: z.string().optional()
                    })
                    .optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Generated script',
            content: {
              'application/json': {
                schema: z.object({
                  topic: z.string(),
                  script: z.object({
                    title: z.string().optional(),
                    description: z.string().optional(),
                    duration: z.number().optional(),
                    language: z.string().optional(),
                    scenes: z.array(z.any()).optional()
                  }),
                  metadata: z.object({
                    sceneCount: z.number(),
                    estimatedDuration: z.number(),
                    language: z.string()
                  })
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

        try {
          // Load the sketch-pilot plugin at runtime using resolved path
          // This avoids TypeScript rootDir constraints while keeping functionality
          const pluginDir = new URL('../../../plugins/sketch-pilot/src', import.meta.url).pathname
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { VideoScriptGenerator } = require(`${pluginDir}/core/video-script-generator`)
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { LLMServiceFactory } = require(`${pluginDir}/services/llm/index`)

          if (!VideoScriptGenerator || !LLMServiceFactory) {
            throw new Error('Script generation plugin not available')
          }

          const llmProvider = options?.llmProvider || 'gemini'
          const llmService = LLMServiceFactory.create({
            provider: llmProvider,
            apiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || ''
          })

          const generator = new VideoScriptGenerator(llmService)

          const script = await generator.generateCompleteScript(topic, {
            maxDuration: options?.duration || 60,
            sceneCount: options?.sceneCount || 6,
            style: options?.style || 'educational',
            videoType: options?.videoType,
            videoGenre: options?.videoGenre,
            language: options?.language || 'en',
            qualityMode: options?.qualityMode
          })

          return c.json({
            topic,
            script: {
              title: script.titles?.main || script.title || topic,
              description: script.titles?.subtitle || script.description || '',
              duration: script.totalDuration,
              language: options?.language || 'en',
              scenes: script.scenes
            },
            metadata: {
              sceneCount: script.scenes?.length || 0,
              estimatedDuration: script.totalDuration || options?.duration || 60,
              language: options?.language || 'en'
            }
          })
        } catch (error) {
          console.error('Script generation error:', error)
          return c.json({ error: 'Failed to generate script' }, 500)
        }
      }
    )

    // POST /v1/scripts/validate
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/scripts/validate',
        tags: ['Scripts'],
        summary: 'Validate a custom script',
        description: 'Validates a custom script before generation.',
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

        try {
          const pluginDir = new URL('../../../plugins/sketch-pilot/src', import.meta.url).pathname
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { ScriptValidator } = require(`${pluginDir}/core/script-validator`)
          const validator = new ScriptValidator()
          const result = validator.validate(script as any)

          return c.json({
            isValid: result.isValid,
            score: result.score,
            totalIssues: result.totalIssues,
            criticalIssues: result.criticalIssues,
            warnings: result.warnings,
            recommendations: result.recommendations,
            metrics: result.metrics
          })
        } catch (error) {
          console.error('Script validation error:', error)
          // Return basic validation result on error
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
      }
    )
  }
}
