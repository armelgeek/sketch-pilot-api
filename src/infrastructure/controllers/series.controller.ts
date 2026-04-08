import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Routes } from '@/domain/types'
import { SeriesRepository } from '../repositories/series.repository'

const seriesRepository = new SeriesRepository()

export class SeriesController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    // POST /v1/series — Create a new series
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/series',
        tags: ['Series'],
        summary: 'Create a new series',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  title: z.string().min(1).max(200),
                  description: z.string().max(1000).optional(),
                  characterModelId: z.string().optional(),
                  promptId: z.string().optional(),
                  fullStory: z.string().max(10000).optional(),
                  totalEpisodes: z.number().min(1).max(100).optional(),
                  secondaryCharacterIds: z.array(z.string()).optional()
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Series created',
            content: {
              'application/json': {
                schema: z.object({
                  id: z.string(),
                  title: z.string(),
                  description: z.string().nullable().optional(),
                  characterModelId: z.string().nullable().optional(),
                  promptId: z.string().nullable().optional(),
                  fullStory: z.string().nullable().optional(),
                  totalEpisodes: z.number().nullable().optional(),
                  secondaryCharacterIds: z.array(z.string()).nullable().optional(),
                  createdAt: z.string()
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

        const { title, description, characterModelId, promptId, fullStory, totalEpisodes, secondaryCharacterIds } =
          c.req.valid('json')
        const created = await seriesRepository.create({
          id: crypto.randomUUID(),
          userId: user.id,
          title,
          description,
          characterModelId,
          promptId,
          fullStory,
          totalEpisodes,
          secondaryCharacterIds
        })
        return c.json(created, 201)
      }
    )

    // GET /v1/series — List series for current user
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/series',
        tags: ['Series'],
        summary: 'List all series for current user',
        security: [{ Bearer: [] }],
        request: {
          query: z.object({
            page: z.coerce.number().min(1).default(1).optional(),
            limit: z.coerce.number().min(1).max(50).default(20).optional()
          })
        },
        responses: {
          200: {
            description: 'List of series',
            content: {
              'application/json': {
                schema: z.object({
                  data: z.array(z.any()),
                  total: z.number(),
                  page: z.number(),
                  limit: z.number()
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

        const { page = 1, limit = 20 } = c.req.valid('query')
        const result = await seriesRepository.listByUser(user.id, page, limit)
        return c.json(result)
      }
    )

    // GET /v1/series/:id — Get series details with episodes
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/series/:id',
        tags: ['Series'],
        summary: 'Get series details with episodes',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Series details',
            content: { 'application/json': { schema: z.any() } }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const [found, episodes] = await Promise.all([
          seriesRepository.findByIdAndUserId(id, user.id),
          seriesRepository.getEpisodes(id)
        ])

        if (!found) return c.json({ error: 'Series not found' }, 404)
        return c.json({ ...found, episodes })
      }
    )

    // PATCH /v1/series/:id — Update series metadata
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/series/:id',
        tags: ['Series'],
        summary: 'Update series metadata',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  title: z.string().min(1).max(200).optional(),
                  description: z.string().max(1000).optional(),
                  characterModelId: z.string().optional(),
                  promptId: z.string().optional(),
                  fullStory: z.string().max(10000).optional(),
                  totalEpisodes: z.number().min(1).max(100).optional(),
                  secondaryCharacterIds: z.array(z.string()).optional()
                })
              }
            }
          }
        },
        responses: {
          200: { description: 'Updated series', content: { 'application/json': { schema: z.any() } } },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        const updated = await seriesRepository.update(id, user.id, body)
        if (!updated) return c.json({ error: 'Series not found' }, 404)
        return c.json(updated)
      }
    )

    // DELETE /v1/series/:id — Delete a series (episodes are NOT deleted, just unlinked via DB null)
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/series/:id',
        tags: ['Series'],
        summary: 'Delete a series',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Series deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)
        const { id } = c.req.valid('param')
        const deleted = await seriesRepository.delete(id, user.id)
        if (!deleted) return c.json({ error: 'Series not found' }, 404)
        return c.json({ success: true })
      }
    )
  }
}
