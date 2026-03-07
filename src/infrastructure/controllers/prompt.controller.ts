import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Routes } from '@/domain/types'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { CreatePromptUseCase } from '@/application/use-cases/prompt/create-prompt.use-case'
import { GetPromptUseCase } from '@/application/use-cases/prompt/get-prompt.use-case'
import { ListPromptsUseCase } from '@/application/use-cases/prompt/list-prompts.use-case'
import { UpdatePromptUseCase } from '@/application/use-cases/prompt/update-prompt.use-case'
import { DeletePromptUseCase } from '@/application/use-cases/prompt/delete-prompt.use-case'
import { RenderPromptUseCase } from '@/application/use-cases/prompt/render-prompt.use-case'
import { PROMPT_TYPES } from '@/infrastructure/database/schema/prompt.schema'

const PromptResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional().nullable(),
  promptType: z.enum(PROMPT_TYPES),
  videoType: z.string().optional().nullable(),
  videoGenre: z.string().optional().nullable(),
  template: z.string(),
  variables: z.array(z.string()),
  language: z.string().optional().nullable(),
  isActive: z.boolean(),
  role: z.string().optional().nullable(),
  context: z.string().optional().nullable(),
  audienceDefault: z.string().optional().nullable(),
  character: z.string().optional().nullable(),
  task: z.string().optional().nullable(),
  goals: z.array(z.string()).optional().nullable(),
  structure: z.string().optional().nullable(),
  visualStyle: z.string().optional().nullable(),
  rules: z.array(z.string()).optional().nullable(),
  formatting: z.string().optional().nullable(),
  outputFormat: z.string().optional().nullable(),
  instructions: z.array(z.string()).optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreatePromptBodySchema = z.object({
  name: z.string().min(1).describe('Human-readable name for this prompt'),
  description: z.string().optional().describe('Optional notes'),
  promptType: z.enum(PROMPT_TYPES).describe('Category of prompt'),
  videoType: z.string().optional().describe('Scoped video type (null = all)'),
  videoGenre: z.string().optional().describe('Scoped video genre (null = all)'),
  template: z.string().min(1).describe('Template string with {{variable}} placeholders'),
  variables: z.array(z.string()).optional().describe('Expected variable names in the template'),
  language: z.string().optional().describe('Target language (null = language-agnostic)'),
  isActive: z.boolean().optional().default(true),
  role: z.string().optional().describe('LLM persona / role description'),
  context: z.string().optional().describe('Domain context that frames the LLM expertise'),
  audienceDefault: z.string().optional().describe('Default target audience description'),
  character: z.string().optional().describe('Visual character description used across all scenes'),
  task: z.string().optional().describe('High-level task the LLM must accomplish'),
  goals: z.array(z.string()).optional().describe('Ordered list of creative / narrative goals'),
  structure: z.string().optional().describe('Narrative structure blueprint'),
  visualStyle: z.string().optional().describe('Visual style description'),
  rules: z.array(z.string()).optional().describe('Hard rules the LLM must follow during generation'),
  formatting: z.string().optional().describe('Output formatting notes'),
  outputFormat: z.string().optional().describe('JSON output format template string'),
  instructions: z.array(z.string()).optional().describe('Step-by-step instructions for the generation process'),
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
          body: { content: { 'application/json': { schema: CreatePromptBodySchema } } },
        },
        responses: {
          201: {
            description: 'Created prompt',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: PromptResponseSchema }) } },
          },
        },
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
            promptType: z.enum(PROMPT_TYPES).optional(),
            videoType: z.string().optional(),
            videoGenre: z.string().optional(),
            language: z.string().optional(),
            isActive: z.enum(['true', 'false']).optional(),
            page: z.string().optional(),
            limit: z.string().optional(),
          }),
        },
        responses: {
          200: {
            description: 'Prompt list',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(PromptResponseSchema), total: z.number() }),
              },
            },
          },
        },
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user?.isAdmin) return c.json({ success: false, error: 'Forbidden' }, 403)

        const q = c.req.query()
        const useCase = new ListPromptsUseCase(this.repository)
        const { result } = await useCase.run({
          promptType: q.promptType,
          videoType: q.videoType,
          videoGenre: q.videoGenre,
          language: q.language,
          isActive: q.isActive !== undefined ? q.isActive === 'true' : undefined,
          page: q.page ? Number(q.page) : 1,
          limit: q.limit ? Number(q.limit) : 20,
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
            promptType: z.enum(PROMPT_TYPES).optional(),
            videoType: z.string().optional(),
            videoGenre: z.string().optional(),
            language: z.string().optional(),
            page: z.string().optional(),
            limit: z.string().optional(),
          }),
        },
        responses: {
          200: {
            description: 'Active prompt list',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(PromptResponseSchema), total: z.number() }),
              },
            },
          },
        },
      }),
      async (c: any) => {
        const q = c.req.query()
        const useCase = new ListPromptsUseCase(this.repository)
        const { result } = await useCase.run({
          promptType: q.promptType,
          videoType: q.videoType,
          videoGenre: q.videoGenre,
          language: q.language,
          isActive: true, // public route: active only
          page: q.page ? Number(q.page) : 1,
          limit: q.limit ? Number(q.limit) : 20,
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
                schema: z.object({ success: z.boolean(), data: PromptResponseSchema.nullable() }),
              },
            },
          },
        },
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
          body: { content: { 'application/json': { schema: CreatePromptBodySchema.partial() } } },
        },
        responses: {
          200: {
            description: 'Updated prompt',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), data: PromptResponseSchema.nullable() }) },
            },
          },
        },
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
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
          },
        },
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
                  promptType: z.enum(PROMPT_TYPES),
                  videoType: z.string().optional(),
                  videoGenre: z.string().optional(),
                  language: z.string().optional(),
                  variables: z.record(z.string()).optional().describe('Key-value pairs to inject into the template'),
                  fallback: z.string().optional().describe('Fallback template if no DB prompt is found'),
                }),
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Rendered prompt',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), rendered: z.string().nullable() }) },
            },
          },
        },
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
  return {
    ...prompt,
    createdAt: prompt.createdAt instanceof Date ? prompt.createdAt.toISOString() : prompt.createdAt,
    updatedAt: prompt.updatedAt instanceof Date ? prompt.updatedAt.toISOString() : prompt.updatedAt,
  }
}
