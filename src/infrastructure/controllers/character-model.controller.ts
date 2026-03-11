import { Buffer } from 'node:buffer'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { requireAdmin } from '@/infrastructure/middlewares/admin.middleware'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { UserRepository } from '@/infrastructure/repositories/user.repository'
import type { Routes } from '@/domain/types'

const characterModelRepository = new CharacterModelRepository()
const userRepository = new UserRepository()

const charModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  isStandard: z.boolean().nullable(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date())
})

export class CharacterModelController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    // Admin-only routes
    this.controller.use('/v1/admin/*', requireAdmin)

    // ─── GET /v1/character-models ─────────────────────────────────────
    // Public: list all available character models (for the user to pick from)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/character-models',
        tags: ['CharacterModels'],
        summary: 'List all character models',
        operationId: 'listCharacterModels',
        responses: {
          200: {
            description: 'List of character models',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(charModelSchema) })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const models = await characterModelRepository.findAll()
          return c.json({ success: true, data: models })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 500)
        }
      }
    )

    // ─── POST /v1/admin/character-models ─────────────────────────────
    // Admin: upload + register a new character model
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/character-models',
        tags: ['CharacterModels'],
        summary: 'Upload and register a new character model (admin)',
        operationId: 'createCharacterModel',
        request: {
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  name: z.string().min(1).openapi({ description: 'Unique model name' }),
                  isStandard: z.string().optional().openapi({ description: 'true/false' }),
                  image: z.instanceof(File).openapi({ description: 'Reference image file' })
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Model created',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: charModelSchema })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), error: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const formData = await c.req.formData()
          const name: string = formData.get('name')
          const isStandardRaw: string | null = formData.get('isStandard')
          const file: File | null = formData.get('image')

          if (!name || !file) {
            return c.json({ success: false, error: 'name and image are required' }, 400)
          }

          // Check unique name
          const existing = await characterModelRepository.findByName(name)
          if (existing) {
            return c.json({ success: false, error: `A model named "${name}" already exists` }, 400)
          }

          // Read file & upload to MinIO
          const arrayBuffer = await file.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const mimeType = file.type || 'image/jpeg'
          const ext = mimeType.split('/')[1] || 'jpg'
          const id = crypto.randomUUID()
          const key = `character-models/${id}.${ext}`
          const imageUrl = await uploadBuffer(key, buffer, mimeType)

          const model = await characterModelRepository.create({
            id,
            name,
            imageUrl,
            mimeType,
            isStandard: isStandardRaw === 'true'
          })

          return c.json({ success: true, data: model }, 201)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 500)
        }
      }
    )

    // ─── PATCH /v1/admin/character-models/:id ────────────────────────
    // Admin: update model metadata
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/character-models/{id}',
        tags: ['CharacterModels'],
        summary: 'Update a character model (admin)',
        operationId: 'updateCharacterModel',
        request: {
          params: z.object({
            id: z.string().openapi({ param: { name: 'id', in: 'path', required: true } })
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string().optional(),
                  isStandard: z.boolean().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Model updated',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: charModelSchema })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { id } = c.req.valid('param')
          const body = c.req.valid('json')
          const model = await characterModelRepository.update(id, body)
          if (!model) return c.json({ success: false, error: 'Not found' }, 404)
          return c.json({ success: true, data: model })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 500)
        }
      }
    )

    // ─── DELETE /v1/admin/character-models/:id ───────────────────────
    // Admin: delete a character model
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/character-models/{id}',
        tags: ['CharacterModels'],
        summary: 'Delete a character model (admin)',
        operationId: 'deleteCharacterModel',
        request: {
          params: z.object({
            id: z.string().openapi({ param: { name: 'id', in: 'path', required: true } })
          })
        },
        responses: {
          200: {
            description: 'Deleted successfully',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), message: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { id } = c.req.valid('param')
          const deleted = await characterModelRepository.delete(id)
          if (!deleted) return c.json({ success: false, error: 'Not found' }, 404)
          return c.json({ success: true, message: 'Character model deleted successfully' })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 500)
        }
      }
    )

    // ─── PATCH /v1/users/me/character-model ─────────────────────────
    // Authenticated user: set their default character model
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/users/me/character-model',
        tags: ['CharacterModels'],
        summary: 'Set user default character model',
        operationId: 'setUserDefaultCharacterModel',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  characterModelId: z.string().nullable().openapi({
                    description: 'ID of the character model to set as default, or null to clear'
                  })
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Default model updated',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), message: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const user = c.get('user') as any
          if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

          const { characterModelId } = c.req.valid('json')

          // If a model ID is given, validate it exists
          if (characterModelId) {
            const model = await characterModelRepository.findById(characterModelId)
            if (!model) {
              return c.json({ success: false, error: 'Character model not found' }, 404)
            }
          }

          await userRepository.update(user.id, { defaultCharacterModelId: characterModelId ?? undefined })
          return c.json({
            success: true,
            message: characterModelId ? 'Default character model updated' : 'Default character model cleared'
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 500)
        }
      }
    )
  }
}
