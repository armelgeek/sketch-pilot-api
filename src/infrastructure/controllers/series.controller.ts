import crypto from 'node:crypto'
import process from 'node:process'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { LLMServiceFactory } from '@sketch-pilot/services/llm'
import { SagaProductionService } from '../../../plugins/sketch-pilot/src/plugins/vimax/services/saga-production.service'
import { DeleteSeriesUseCase } from '../../application/use-cases/series/delete-series.use-case'
import { GenerateNextEpisodeUseCase } from '../../application/use-cases/series/generate-next-episode.use-case'
import { PrepareSagaDraftUseCase } from '../../application/use-cases/series/prepare-saga-draft.use-case'
import { PrepareSagaEnrichUseCase } from '../../application/use-cases/series/prepare-saga-enrich.use-case'
import { PrepareSagaPortraitsUseCase } from '../../application/use-cases/series/prepare-saga-portraits.use-case'
import { PrepareSeriesUseCase } from '../../application/use-cases/series/prepare-series.use-case'
import { PromoteRegistryItemUseCase } from '../../application/use-cases/series/promote-registry-item.use-case'
import { RegenerateSeriesAssetImageUseCase } from '../../application/use-cases/series/regenerate-series-asset-image.use-case'
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
  private regenerateSeriesAssetImageUseCase: RegenerateSeriesAssetImageUseCase
  private generateNextEpisodeUseCase: GenerateNextEpisodeUseCase
  private promoteRegistryItemUseCase: PromoteRegistryItemUseCase
  private deleteSeriesUseCase: DeleteSeriesUseCase
  private prepareSagaDraftUseCase: PrepareSagaDraftUseCase
  private prepareSagaEnrichUseCase: PrepareSagaEnrichUseCase
  private prepareSagaPortraitsUseCase: PrepareSagaPortraitsUseCase
  private sagaProductionService?: SagaProductionService

  constructor() {
    this.controller = new OpenAPIHono()
    this.seriesRepository = new SeriesRepository()
    this.suggestSeriesConceptUseCase = new SuggestSeriesConceptUseCase()
    this.regenerateSeriesCharacterImageUseCase = new RegenerateSeriesCharacterImageUseCase()
    this.regenerateSeriesAssetImageUseCase = new RegenerateSeriesAssetImageUseCase()
    this.generateNextEpisodeUseCase = new GenerateNextEpisodeUseCase(null as any) // Will be set lazily
    this.prepareSeriesUseCase = new PrepareSeriesUseCase(null as any) // Will be set lazily
    this.promoteRegistryItemUseCase = new PromoteRegistryItemUseCase()
    this.deleteSeriesUseCase = new DeleteSeriesUseCase()
    this.prepareSagaDraftUseCase = new PrepareSagaDraftUseCase(null as any)
    this.prepareSagaEnrichUseCase = new PrepareSagaEnrichUseCase(null as any)
    this.prepareSagaPortraitsUseCase = new PrepareSagaPortraitsUseCase()
  }

  private async getSagaProductionService(): Promise<SagaProductionService> {
    if (this.sagaProductionService) return this.sagaProductionService

    const llmService = await LLMServiceFactory.create({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || ''
    })

    this.sagaProductionService = new SagaProductionService(llmService, this.seriesRepository)
    // Update use cases with the service
    this.generateNextEpisodeUseCase = new GenerateNextEpisodeUseCase(this.sagaProductionService)
    this.prepareSeriesUseCase = new PrepareSeriesUseCase(this.sagaProductionService)
    this.prepareSagaDraftUseCase = new PrepareSagaDraftUseCase(this.sagaProductionService)
    this.prepareSagaEnrichUseCase = new PrepareSagaEnrichUseCase(this.sagaProductionService)

    return this.sagaProductionService
  }

  public initRoutes() {
    // LEGACY PREPARE API (Removed in favor of sequential draft/enrich/portraits)
    this.controller.get('/v1/series/prepare/stream', (c: any) => {
      return c.json(
        {
          error:
            'Legacy monolithic prepare is no longer supported. Please use the sequential /draft, /enrich, and /portraits endpoints.',
          code: 'LEGACY_PREPARE_NOT_SUPPORTED'
        },
        410
      )
    })

    this.controller.post('/v1/series/prepare', (c: any) => {
      return c.json(
        {
          error:
            'Legacy monolithic prepare is no longer supported. Please use the sequential /draft, /enrich, and /portraits endpoints.',
          code: 'LEGACY_PREPARE_NOT_SUPPORTED'
        },
        410
      )
    })

    // NEW SEQUENTIAL PREPARE APIs
    this.controller.post('/v1/series/prepare/draft', async (c: any) => {
      const user = c.get('user')
      if (!user) return c.json({ error: 'Unauthorized' }, 401)
      const params = await c.req.json()
      await this.getSagaProductionService()
      const result = await this.prepareSagaDraftUseCase.execute({ userId: user.id, ...params })
      return c.json(result)
    })

    this.controller.post('/v1/series/:id/prepare/enrich', async (c: any) => {
      const user = c.get('user')
      if (!user) return c.json({ error: 'Unauthorized' }, 401)
      const seriesId = c.req.param('id')
      const params = await c.req.json()
      await this.getSagaProductionService()
      const result = await this.prepareSagaEnrichUseCase.execute({ userId: user.id, seriesId, ...params })
      return c.json(result)
    })

    this.controller.post('/v1/series/:id/prepare/portraits', async (c: any) => {
      const user = c.get('user')
      if (!user) return c.json({ error: 'Unauthorized' }, 401)
      const seriesId = c.req.param('id')
      const params = (await c.req.json().catch(() => ({}))) || {}
      const result = await this.prepareSagaPortraitsUseCase.execute({ userId: user.id, seriesId, ...params })
      return c.json(result)
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

                  totalEpisodes: z.string().optional(),
                  language: z.string().optional(),
                  aspectRatio: z.string().optional(),
                  duration: z.string().optional(),
                  videoType: z.string().optional(),
                  videoGenre: z.string().optional(),
                  promptId: z.string().optional(),
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

    // GET /v1/series/active
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/series/active',
        tags: ['Series'],
        summary: 'Get the last active (updated) saga for the user',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Active series found',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.any().nullable() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const data = await this.seriesRepository.findLastByUserId(user.id)
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

                  totalEpisodes: z.string().optional(),
                  language: z.string().optional(),
                  aspectRatio: z.string().optional(),
                  duration: z.string().optional(),
                  videoType: z.string().optional(),
                  videoGenre: z.string().optional(),
                  promptId: z.string().optional(),
                  audioProvider: z.string().optional(),
                  kokoroVoicePreset: z.string().optional(),
                  plannedEpisodes: z.array(z.any()).optional(),
                  status: z.enum(['active', 'archived', 'draft']).optional(),
                  locationRegistry: z.record(z.any()).optional(),
                  assetRegistry: z.record(z.any()).optional()
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
                schema: z.object({
                  success: z.boolean(),
                  imageUrl: z.string().optional(),
                  thumbnailUrl: z.string().optional()
                })
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
    // POST /v1/series/{id}/assets/{assetName}/regenerate-image
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/series/{id}/assets/{assetName}/regenerate-image',
        tags: ['Series'],
        summary: 'Regenerate image for a specific series asset',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string(), assetName: z.string() })
        },
        responses: {
          200: {
            description: 'Regenerated asset image',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  imageUrl: z.string().optional(),
                  thumbnailUrl: z.string().optional()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id, assetName } = c.req.valid('param')

        const result = await this.regenerateSeriesAssetImageUseCase.execute({
          userId: user.id,
          seriesId: id,
          assetName: decodeURIComponent(assetName)
        })

        if (!result.success) {
          return c.json({ error: result.error || 'Failed to regenerate image' }, 400)
        }

        return c.json(result)
      }
    )

    // POST /v1/series/{id}/generate-next
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/series/{id}/generate-next',
        tags: ['Series'],
        summary: 'Start generating the next episode from the roadmap',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          202: {
            description: 'Next episode generation started',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), jobId: z.string(), videoId: z.string() }) }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const sagaService = await this.getSagaProductionService()
        const result = await new GenerateNextEpisodeUseCase(sagaService).execute({
          userId: user.id,
          seriesId: id,
          planId: (user as any).planId
        })

        if (!result.success) {
          return c.json({ error: result.error || 'Failed to start generation' }, 400)
        }

        return c.json({ success: true, jobId: result.jobId, videoId: result.videoId }, 202)
      }
    )

    // POST /v1/series/{id}/promote
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/series/{id}/promote',
        tags: ['Series'],
        summary: 'Manually promote a scene image to the character or location registry',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  type: z.enum(['character', 'location']),
                  name: z.string().min(1),
                  thumbnailUrl: z.string().url()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Item promoted successfully',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const body = c.req.valid('json')

        const result = await this.promoteRegistryItemUseCase.execute({
          userId: user.id,
          seriesId: id,
          ...body
        })

        if (!result.success) {
          return c.json({ error: result.error || 'Failed to promote item' }, 400)
        }

        return c.json({ success: true })
      }
    )

    // DELETE /v1/series/{id}
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/series/{id}',
        tags: ['Series'],
        summary: 'Delete a saga',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Series deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
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
        const result = await this.deleteSeriesUseCase.execute({ userId: user.id, seriesId: id })
        if (!result.success) return c.json({ error: result.error }, 404)
        return c.json(result)
      }
    )
  }
}
