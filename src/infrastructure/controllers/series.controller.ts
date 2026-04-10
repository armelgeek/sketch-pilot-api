import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'
import { PrepareSeriesUseCase } from '../../application/use-cases/series/prepare-series.use-case'
import { RegenerateSeriesCharacterImageUseCase } from '../../application/use-cases/series/regenerate-series-character-image.use-case'
import { SuggestSeriesConceptUseCase } from '../../application/use-cases/series/suggest-series-concept.use-case'
import { SeriesRepository } from '../repositories/series.repository'
import { VideoRepository } from '../repositories/video.repository'
import type { Routes } from '../../domain/types'

export class SeriesController implements Routes {
  public controller: OpenAPIHono
  private seriesRepository: SeriesRepository
  private prepareSeriesUseCase: PrepareSeriesUseCase
  private suggestSeriesConceptUseCase: SuggestSeriesConceptUseCase
  private regenerateSeriesCharacterImageUseCase: RegenerateSeriesCharacterImageUseCase

  constructor() {
    this.controller = new OpenAPIHono()
    this.seriesRepository = new SeriesRepository()
    this.prepareSeriesUseCase = new PrepareSeriesUseCase()
    this.suggestSeriesConceptUseCase = new SuggestSeriesConceptUseCase()
    this.regenerateSeriesCharacterImageUseCase = new RegenerateSeriesCharacterImageUseCase()
  }

  public initRoutes() {
    // POST /v1/series/prepare
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/series/prepare',
        tags: ['Series'],
        summary: 'Prepare series context using AI',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  title: z.string().min(1),
                  description: z.string().optional(),
                  language: z.string().optional(),
                  promptId: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Series prepared',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const body = c.req.valid('json')
        const result = await this.prepareSeriesUseCase.execute({
          userId: user.id,
          ...body
        })

        return c.json(result)
      }
    )

    // GET /v1/series/suggest-idea
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/series/suggest-idea',
        tags: ['Series'],
        summary: 'Suggest a random saga concept (idea)',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Concept suggested',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const result = await this.suggestSeriesConceptUseCase.execute(user.id)
        return c.json(result)
      }
    )

    this.controller.get('/v1/series/prepare/stream', (c: any) => {
      const user = c.get('user')
      if (!user) return c.json({ error: 'Unauthorized' }, 401)

      const title = c.req.query('title')
      const description = c.req.query('description')
      const language = c.req.query('language') || 'fr'
      const promptId = c.req.query('promptId')

      if (!title) return c.json({ error: 'Title is required' }, 400)

      return streamSSE(c, async (stream) => {
        const generator = this.prepareSeriesUseCase.streamExecute({
          userId: user.id,
          title,
          description,
          language,
          promptId
        })

        for await (const event of generator) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data)
          })
        }
      })
    })

    // POST /v1/series
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/series',
        tags: ['Series'],
        summary: 'Create a new video series (saga)',
        description: 'Initializes a new series with global context and narrative bible.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  title: z.string().min(1).max(200),
                  description: z.string().max(1000).optional(),
                  globalContext: z
                    .string()
                    .max(10000)
                    .optional()
                    .openapi({ description: 'The narrative bible for the saga' }),
                  characterRegistry: z.record(z.any()).optional(),
                  seed: z.string().optional(),
                  totalEpisodes: z.string().optional(),
                  language: z.string().optional(),
                  aspectRatio: z.string().optional(),
                  duration: z.string().optional(),
                  videoType: z.string().optional(),
                  videoGenre: z.string().optional(),
                  promptId: z.string().optional(),
                  visualStyleModelId: z.string().optional(),
                  audioProvider: z.string().optional(),
                  kokoroVoicePreset: z.string().optional(),
                  locationRegistry: z.record(z.any()).optional()
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Series created successfully',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.any() })
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

        const body = c.req.valid('json')
        const seriesId = crypto.randomUUID()

        const data = await this.seriesRepository.create({
          id: seriesId,
          userId: user.id,
          ...body
        })

        return c.json({ success: true, data }, 201)
      }
    )

    // GET /v1/series
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/series',
        tags: ['Series'],
        summary: 'List user series',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'List of series',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(z.any()) })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const data = await this.seriesRepository.findByUserId(user.id)
        return c.json({ success: true, data })
      }
    )

    // GET /v1/series/{id}
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/series/{id}',
        tags: ['Series'],
        summary: 'Get series details',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Series details',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.any() })
              }
            }
          },
          404: {
            description: 'Series not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const data = await this.seriesRepository.findById(id)

        if (!data || data.userId !== user.id) {
          return c.json({ error: 'Series not found' }, 404)
        }

        return c.json({ success: true, data })
      }
    )
    // PATCH /v1/series/{id}
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/series/{id}',
        tags: ['Series'],
        summary: 'Update series details',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  title: z.string().min(1).max(200).optional(),
                  description: z.string().max(1000).optional(),
                  globalContext: z.string().max(10000).optional(),
                  characterRegistry: z.record(z.any()).optional(),
                  seed: z.string().optional(),
                  totalEpisodes: z.string().optional(),
                  language: z.string().optional(),
                  aspectRatio: z.string().optional(),
                  duration: z.string().optional(),
                  videoType: z.string().optional(),
                  videoGenre: z.string().optional(),
                  promptId: z.string().optional(),
                  visualStyleModelId: z.string().optional(),
                  audioProvider: z.string().optional(),
                  kokoroVoicePreset: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Series updated',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const body = c.req.valid('json')

        const data = await this.seriesRepository.update(id, body)
        return c.json({ success: true, data })
      }
    )

    // DELETE /v1/series/{id}
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/series/{id}',
        tags: ['Series'],
        summary: 'Delete a series',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Series deleted',
            content: {
              'application/json': { schema: z.object({ success: z.boolean() }) }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        await this.seriesRepository.delete(id, user.id)

        return c.json({ success: true })
      }
    )

    // GET /v1/series/{id}/episodes
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/series/{id}/episodes',
        tags: ['Series'],
        summary: 'Get all episodes in a series',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'List of episodes',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(z.any()) })
              }
            }
          },
          404: {
            description: 'Series not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const series = await this.seriesRepository.findById(id)

        if (!series || series.userId !== user.id) {
          return c.json({ error: 'Series not found' }, 404)
        }

        const videoRepo = new VideoRepository()
        const data = await videoRepo.findBySeriesId(id)

        return c.json({ success: true, data })
      }
    )
    // POST /v1/series/{id}/characters/{characterName}/regenerate-image
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/series/{id}/characters/{characterName}/regenerate-image',
        tags: ['Series'],
        summary: 'Regenerate image for a specific series character',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string(), characterName: z.string() })
        },
        responses: {
          200: {
            description: 'Regenerated character image',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), thumbnailUrl: z.string().optional() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id, characterName } = c.req.valid('param')

        const result = await this.regenerateSeriesCharacterImageUseCase.execute({
          userId: user.id,
          seriesId: id,
          characterName: decodeURIComponent(characterName)
        })

        if (!result.success) {
          return c.json({ error: result.error || 'Failed to regenerate image' }, 400)
        }

        return c.json(result)
      }
    )
  }
}
