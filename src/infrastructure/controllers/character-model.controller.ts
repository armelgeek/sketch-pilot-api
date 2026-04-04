import { Buffer } from 'node:buffer'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { v4 as uuidv4 } from 'uuid'
import type { Routes } from '@/domain/types'
import { uploadBuffer } from '../config/storage.config'
import { requireAdmin } from '../middlewares/admin.middleware'
import { authMiddleware } from '../middlewares/auth.middleware'
import { CharacterModelRepository } from '../repositories/character-model.repository'

const CharacterModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  gender: z.string().nullable(),
  age: z.string().nullable(),
  voiceId: z.string().nullable(),
  isStandard: z.string(),
  stylePrefix: z.string().nullable(),
  artistPersona: z.string().nullable(),
  images: z.array(z.string()).default([]),
  thumbnailUrl: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export class CharacterModelController implements Routes {
  private repository = new CharacterModelRepository()
  public controller = new OpenAPIHono()

  constructor() {
    this.initRoutes()
  }

  public initRoutes() {
    // ─── Admin routes ────────────────────────────────────────────────────────
    this.controller.use('/v1/admin/*', authMiddleware, requireAdmin)

    // GET /v1/admin/character-models – list all (admin view)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/character-models',
        tags: ['Admin'],
        summary: 'List all character models (admin)',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'All character models',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(CharacterModelSchema) })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const models = await this.repository.findAll()
        return c.json({ success: true, data: models })
      }
    )

    // POST /v1/admin/character-models – create a base character (with optional image upload)
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/character-models',
        tags: ['Admin'],
        summary: 'Create a base character model',
        description: 'Upload image and register a new base character model manageable from the backoffice.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  name: z.string().openapi({ description: 'Character name' }),
                  description: z.string().optional().openapi({ description: 'Character description' }),
                  gender: z.string().optional().openapi({ description: 'Character gender' }),
                  age: z.string().optional().openapi({ description: 'Character age range' }),
                  voiceId: z.string().optional().openapi({ description: 'Default voice preset ID' }),
                  stylePrefix: z.string().optional().openapi({ description: 'Style prefix for image prompts' }),
                  artistPersona: z.string().optional().openapi({ description: 'Artist persona description' }),
                  isStandard: z
                    .string()
                    .optional()
                    .default('true')
                    .openapi({ description: 'Whether this is a standard base character' }),
                  image: z.instanceof(File).optional().openapi({ description: 'Reference image for the character' })
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Character model created',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: CharacterModelSchema })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const formData = await c.req.formData()
          const name = formData.get('name') as string
          const description = formData.get('description') as string | null
          const gender = (formData.get('gender') as string) || 'unknown'
          const age = (formData.get('age') as string) || 'unknown'
          const voiceId = formData.get('voiceId') as string | null
          const stylePrefix = formData.get('stylePrefix') as string | null
          const artistPersona = formData.get('artistPersona') as string | null
          const isStandard = (formData.get('isStandard') as string) || 'true'
          const imageFile = formData.get('image') as File | null

          if (!name) {
            return c.json({ success: false, error: 'name is required' }, 400)
          }

          let thumbnailUrl: string | null = null
          const images: string[] = []

          if (imageFile) {
            const arrayBuffer = await imageFile.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            const mimeType = imageFile.type || 'image/jpeg'
            const ext = imageFile.name.split('.').pop() || 'jpg'
            const id = uuidv4()
            const key = `character-models/${id}.${ext}`
            thumbnailUrl = await uploadBuffer(key, buffer, mimeType)
            images.push(thumbnailUrl)
          }

          const newModel = await this.repository.create({
            id: uuidv4(),
            userId: null,
            name,
            description: description || null,
            gender,
            age,
            voiceId: voiceId || null,
            isStandard,
            stylePrefix: stylePrefix || null,
            artistPersona: artistPersona || null,
            thumbnailUrl,
            images,
            createdAt: new Date(),
            updatedAt: new Date()
          })

          return c.json({ success: true, data: newModel }, 201)
        } catch (error: any) {
          console.error('[CharacterModel] Failed to create character model:', error)
          return c.json({ success: false, error: 'Failed to create character model' }, 500)
        }
      }
    )

    // PATCH /v1/admin/character-models/{id} – update metadata or replace image
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/character-models/{id}',
        tags: ['Admin'],
        summary: 'Update a base character model',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  name: z.string().optional(),
                  description: z.string().optional(),
                  gender: z.string().optional(),
                  age: z.string().optional(),
                  voiceId: z.string().optional(),
                  stylePrefix: z.string().optional(),
                  artistPersona: z.string().optional(),
                  isStandard: z.string().optional(),
                  image: z.instanceof(File).optional().openapi({ description: 'New reference image' })
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Character model updated',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: CharacterModelSchema })
              }
            }
          },
          404: {
            description: 'Character model not found',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        try {
          const { id } = c.req.valid('param')
          const existing = await this.repository.findById(id)
          if (!existing) {
            return c.json({ success: false, error: 'Character model not found' }, 404)
          }

          const formData = await c.req.formData()
          const updates: Record<string, any> = {}

          const fields = [
            'name',
            'description',
            'gender',
            'age',
            'voiceId',
            'stylePrefix',
            'artistPersona',
            'isStandard'
          ]
          for (const field of fields) {
            const val = formData.get(field)
            if (val !== null) updates[field] = val as string
          }

          const imageFile = formData.get('image') as File | null
          if (imageFile) {
            const arrayBuffer = await imageFile.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            const mimeType = imageFile.type || 'image/jpeg'
            const ext = imageFile.name.split('.').pop() || 'jpg'
            const key = `character-models/${id}.${ext}`
            const thumbnailUrl = await uploadBuffer(key, buffer, mimeType)
            updates.thumbnailUrl = thumbnailUrl
            updates.images = [
              thumbnailUrl,
              ...(existing.images || []).filter((u: string) => u !== existing.thumbnailUrl)
            ]
          }

          const updated = await this.repository.update(id, updates)
          return c.json({ success: true, data: updated })
        } catch (error: any) {
          console.error('[CharacterModel] Failed to update character model:', error)
          return c.json({ success: false, error: 'Failed to update character model' }, 500)
        }
      }
    )

    // DELETE /v1/admin/character-models/{id}
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/character-models/{id}',
        tags: ['Admin'],
        summary: 'Delete a base character model',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Character model deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          },
          404: {
            description: 'Character model not found',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const existing = await this.repository.findById(id)
        if (!existing) {
          return c.json({ success: false, error: 'Character model not found' }, 404)
        }
        await this.repository.delete(id)
        return c.json({ success: true })
      }
    )

    // ─── Public route ────────────────────────────────────────────────────────

    // GET /v1/character-models – list standard base characters (public)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/character-models',
        tags: ['Characters'],
        summary: 'List standard base characters',
        description: 'Returns all standard base characters available for users to select from.',
        responses: {
          200: {
            description: 'Standard base characters',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(CharacterModelSchema) })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const models = await this.repository.findAllStandard()
        return c.json({ success: true, data: models })
      }
    )

    // ─── Authenticated user routes ───────────────────────────────────────────
    this.controller.use('/v1/characters*', authMiddleware)

    // GET /v1/characters – list user's personal characters
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/characters',
        tags: ['Characters'],
        summary: "List the current user's personal characters",
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: "User's personal characters",
            content: {
              'application/json': {
                schema: z.object({ data: z.array(CharacterModelSchema) })
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
        const models = await this.repository.findAllByUserId(user.id)
        return c.json({ data: models })
      }
    )

    // POST /v1/characters – create a personal character
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/characters',
        tags: ['Characters'],
        summary: 'Create a personal character',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string(),
                  description: z.string().optional(),
                  gender: z.string().optional(),
                  age: z.string().optional(),
                  voiceId: z.string().optional(),
                  stylePrefix: z.string().optional(),
                  artistPersona: z.string().optional(),
                  images: z.array(z.string()).optional(),
                  thumbnailUrl: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Personal character created',
            content: { 'application/json': { schema: CharacterModelSchema } }
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
        const newModel = await this.repository.create({
          id: uuidv4(),
          userId: user.id,
          name: body.name,
          description: body.description || null,
          gender: body.gender || 'unknown',
          age: body.age || 'unknown',
          voiceId: body.voiceId || null,
          isStandard: 'false',
          stylePrefix: body.stylePrefix || null,
          artistPersona: body.artistPersona || null,
          thumbnailUrl: body.thumbnailUrl || null,
          images: body.images || [],
          createdAt: new Date(),
          updatedAt: new Date()
        })
        return c.json(newModel, 201)
      }
    )

    // PATCH /v1/characters/{id} – update a personal character
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/characters/{id}',
        tags: ['Characters'],
        summary: 'Update a personal character',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string().optional(),
                  description: z.string().optional(),
                  gender: z.string().optional(),
                  age: z.string().optional(),
                  voiceId: z.string().optional(),
                  stylePrefix: z.string().optional(),
                  artistPersona: z.string().optional(),
                  images: z.array(z.string()).optional(),
                  thumbnailUrl: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Personal character updated',
            content: { 'application/json': { schema: CharacterModelSchema } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        const updated = await this.repository.update(id, body)
        return c.json(updated)
      }
    )

    // DELETE /v1/characters/{id} – delete a personal character
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/characters/{id}',
        tags: ['Characters'],
        summary: 'Delete a personal character',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Personal character deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        await this.repository.delete(id)
        return c.json({ success: true })
      }
    )
  }
}
