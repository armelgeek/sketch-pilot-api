import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { CreatePromptUseCase } from '@/application/use-cases/prompt/create-prompt.use-case'
import { DeletePromptUseCase } from '@/application/use-cases/prompt/delete-prompt.use-case'
import { GetPromptUseCase } from '@/application/use-cases/prompt/get-prompt.use-case'
import { ListPromptsUseCase } from '@/application/use-cases/prompt/list-prompts.use-case'
import { RenderPromptUseCase } from '@/application/use-cases/prompt/render-prompt.use-case'
import { UpdatePromptUseCase } from '@/application/use-cases/prompt/update-prompt.use-case'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import type { Routes } from '@/domain/types'

const PromptResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional().nullable(),
  role: z.string(),
  context: z.string(),
  audienceDefault: z.string(),
  task: z.string(),
  goals: z.array(z.string()),
  structure: z.string(),
  rules: z.array(z.string()),
  formatting: z.string(),
  instructions: z.array(z.string()),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const CreatePromptBodySchema = z.object({
  name: z.string().min(1).describe('Human-readable name for this prompt'),
  description: z.string().optional().describe('Optional notes'),
  role: z.string(),
  context: z.string(),
  audienceDefault: z.string(),
  task: z.string(),
  goals: z.array(z.string()),
  structure: z.string(),
  rules: z.array(z.string()),
  formatting: z.string(),
  instructions: z.array(z.string()),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional().default(true)
})

export class PromptController implements Routes {
  public controller: OpenAPIHono
  private repository: PromptRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.repository = new PromptRepository()
  }

  public initRoutes() {
    // POST /v1/admin/prompts — Create
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/prompts',
        tags: ['Prompts'],
        summary: 'Create a dynamic prompt',
        security: [{ Bearer: [] }],
        request: {
          body: { content: { 'application/json': { schema: CreatePromptBodySchema } } }
        },
        responses: {
          201: {
            description: 'Created prompt',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: PromptResponseSchema }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user?.isAdmin) return c.json({ success: false, error: 'Forbidden' }, 403)

        const body = c.req.valid('json')
        const useCase = new CreatePromptUseCase(this.repository)
        const { result } = await useCase.run(body)

        if (!result.success) return c.json({ success: false, error: result.error }, 400)
        return c.json({ success: true, data: serializePrompt(result.data) }, 201)
      }
    )

    // GET /v1/admin/prompts — List (admin)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/prompts',
        tags: ['Prompts'],
        summary: 'List prompts (admin)',
        security: [{ Bearer: [] }],
        request: {
          query: z.object({
            isActive: z.enum(['true', 'false']).optional(),
            page: z.string().optional(),
            limit: z.string().optional()
          })
        },
        responses: {
          200: {
            description: 'Prompt list',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(PromptResponseSchema), total: z.number() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user?.isAdmin) return c.json({ success: false, error: 'Forbidden' }, 403)

        const q = c.req.query()
        const useCase = new ListPromptsUseCase(this.repository)
        const { result } = await useCase.run({
          isActive: q.isActive !== undefined ? q.isActive === 'true' : undefined,
          page: q.page ? Number(q.page) : 1,
          limit: q.limit ? Number(q.limit) : 20
        })

        return c.json({ success: result.success, data: result.data.map(serializePrompt), total: result.total })
      }
    )

    // GET /v1/prompts — List (public, active only)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/prompts',
        tags: ['Prompts'],
        summary: 'List active prompts (public)',
        request: {
          query: z.object({
            page: z.string().optional(),
            limit: z.string().optional()
          })
        },
        responses: {
          200: {
            description: 'Active prompt list',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(PromptResponseSchema), total: z.number() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const q = c.req.query()
        const useCase = new ListPromptsUseCase(this.repository)
        const { result } = await useCase.run({
          isActive: true, // public route: active only
          page: q.page ? Number(q.page) : 1,
          limit: q.limit ? Number(q.limit) : 20
        })

        return c.json({ success: result.success, data: result.data.map(serializePrompt), total: result.total })
      }
    )

    // GET /v1/admin/prompts/:id
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/prompts/{id}',
        tags: ['Prompts'],
        summary: 'Get a prompt by ID',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string().uuid() }) },
        responses: {
          200: {
            description: 'Prompt',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: PromptResponseSchema.nullable() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user?.isAdmin) return c.json({ success: false, error: 'Forbidden' }, 403)

        const { id } = c.req.param()
        const useCase = new GetPromptUseCase(this.repository)
        const { result } = await useCase.run({ id })

        return c.json({ success: result.success, data: result.data ? serializePrompt(result.data) : null })
      }
    )

    // PUT /v1/admin/prompts/:id
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/prompts/{id}',
        tags: ['Prompts'],
        summary: 'Update a prompt',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string().uuid() }),
          body: { content: { 'application/json': { schema: CreatePromptBodySchema.partial() } } }
        },
        responses: {
          200: {
            description: 'Updated prompt',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), data: PromptResponseSchema.nullable() }) }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user?.isAdmin) return c.json({ success: false, error: 'Forbidden' }, 403)

        const { id } = c.req.param()
        const body = c.req.valid('json')
        const useCase = new UpdatePromptUseCase(this.repository)
        const { result } = await useCase.run({ id, ...body })

        if (!result.success) return c.json({ success: false, error: result.error }, 400)
        return c.json({ success: true, data: result.data ? serializePrompt(result.data) : null })
      }
    )

    // DELETE /v1/admin/prompts/:id
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/prompts/{id}',
        tags: ['Prompts'],
        summary: 'Delete a prompt',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string().uuid() }) },
        responses: {
          200: {
            description: 'Deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user?.isAdmin) return c.json({ success: false, error: 'Forbidden' }, 403)

        const { id } = c.req.param()
        const useCase = new DeletePromptUseCase(this.repository)
        const { result } = await useCase.run({ id })

        return c.json({ success: result.success })
      }
    )

    // POST /v1/prompts/render — Render a prompt with variable injection
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/prompts/render',
        tags: ['Prompts'],
        summary: 'Render a prompt by resolving and injecting variables',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string().optional().describe('Name of the prompt to match (optional)'),
                  variables: z.record(z.string()).optional().describe('Key-value pairs to inject into the template'),
                  fallback: z.string().optional().describe('Fallback template if no DB prompt is found')
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Rendered prompt',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), rendered: z.string().nullable() }) }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ success: false, rendered: null, error: 'Unauthorized' }, 401)

        const body = c.req.valid('json')
        const useCase = new RenderPromptUseCase(this.repository)
        const { result } = await useCase.run(body)

        return c.json({ success: result.success, rendered: result.rendered })
      }
    )
  }
}

function serializePrompt(prompt: any) {
  if (!prompt) return null
  return {
    ...prompt,
    category: prompt.category || null,
    tags: Array.isArray(prompt.tags) ? prompt.tags : [],
    createdAt: prompt.createdAt instanceof Date ? prompt.createdAt.toISOString() : prompt.createdAt,
    updatedAt: prompt.updatedAt instanceof Date ? prompt.updatedAt.toISOString() : prompt.updatedAt
  }
}
