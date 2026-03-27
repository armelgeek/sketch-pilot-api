import { Buffer } from 'node:buffer'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Routes } from '@/domain/types'
import { CREDIT_PACKS } from '../config/video.config'
import { requireAdmin } from '../middlewares/admin.middleware'
import { AssetsConfigRepository } from '../repositories/assets-config.repository'

const assetsConfigRepository = new AssetsConfigRepository()

export class ConfigController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    this.controller.use('/v1/admin/*', requireAdmin)

    // GET /v1/config/voices  (DB-backed)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/config/voices',
        tags: ['Config'],
        summary: 'Get available voices grouped by provider',
        description:
          'Returns all active voice presets from the database, grouped by provider (e.g. kokoro, elevenlabs).',
        responses: {
          200: {
            description: 'Voices grouped by provider',
            content: {
              'application/json': {
                schema: z.object({
                  voices: z.record(
                    z.array(
                      z.object({
                        id: z.string(),
                        presetId: z.string(),
                        provider: z.string(),
                        name: z.string(),
                        language: z.string(),
                        gender: z.string(),
                        description: z.string().nullable(),
                        previewUrl: z.string().nullable()
                      })
                    )
                  )
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const voices = await assetsConfigRepository.getAllVoicesGroupedByProvider()
        return c.json({ voices })
      }
    )

    // GET /v1/subscription-plans (Frontend alias)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription-plans',
        tags: ['Config'],
        summary: 'Get pricing plans (Frontend alias)',
        responses: {
          200: {
            description: 'List of pricing plans',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.array(
                    z.object({
                      id: z.string(),
                      name: z.string(),
                      price: z.number(),
                      credits: z.number(),
                      features: z.array(z.string())
                    })
                  )
                })
              }
            }
          }
        }
      }),
      (c: any) => {
        const plans = [
          {
            id: 'plan_starter',
            name: 'Starter',
            price: 5,
            credits: 1000,
            features: ['1000 credits/mo', '720p Export', 'Basic Voices']
          },
          {
            id: 'creator',
            name: 'Creator',
            price: 15,
            credits: 500,
            features: ['500 high-quality credits/mo', '1080p Export', 'All Voices', 'No Watermark']
          }
        ]

        return c.json({ success: true, data: plans })
      }
    )

    // GET /v1/config/plans
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/config/plans',
        tags: ['Config'],
        summary: 'Get pricing plans and credit packs',
        responses: {
          200: {
            description: 'Plans and credit packs',
            content: {
              'application/json': {
                schema: z.object({
                  plans: z.array(z.any()),
                  creditPacks: z.array(
                    z.object({
                      id: z.string(),
                      credits: z.number(),
                      price: z.number(),
                      currency: z.string(),
                      stripePriceId: z.string()
                    })
                  )
                })
              }
            }
          }
        }
      }),
      (c: any) => {
        const creditPacks = Object.values(CREDIT_PACKS).map((pack) => ({
          id: pack.id,
          credits: pack.credits,
          price: pack.price,
          currency: pack.currency,
          stripePriceId: pack.priceId
        }))

        return c.json({ creditPacks })
      }
    )

    // GET /v1/config/music  (DB-backed)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/config/music',
        tags: ['Config'],
        summary: 'Get available background music tracks',
        description: 'Returns all active background music tracks from the database.',
        responses: {
          200: {
            description: 'Music tracks',
            content: {
              'application/json': {
                schema: z.object({
                  music: z.array(
                    z.object({
                      id: z.string(),
                      trackId: z.string(),
                      name: z.string(),
                      tags: z.array(z.string()),
                      previewUrl: z.string().nullable()
                    })
                  )
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const tracks = await assetsConfigRepository.getAllMusicTracks()
        const music = tracks.map((t) => ({
          id: t.id,
          trackId: t.trackId,
          name: t.name,
          tags: t.tags,
          previewUrl: t.previewUrl
        }))
        return c.json({ music })
      }
    )

    // ─── Admin Assets Management ──────────────────────────────────────────────
    // GET /v1/admin/config/voices
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/config/voices',
        tags: ['Admin'],
        summary: 'Get all voice presets (admin)',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'All voices',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(z.any()) })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const voices = await assetsConfigRepository.findAllVoices()
        return c.json({ success: true, data: voices })
      }
    )

    // GET /v1/admin/config/music
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/config/music',
        tags: ['Admin'],
        summary: 'Get all music tracks (admin)',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'All music tracks',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(z.any()) })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const music = await assetsConfigRepository.findAllMusicTracks()
        return c.json({ success: true, data: music })
      }
    )

    // POST /v1/admin/config/voices
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/config/voices',
        tags: ['Admin'],
        summary: 'Create a new voice preset',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  id: z.string().optional(),
                  presetId: z.string(),
                  provider: z.string(),
                  name: z.string(),
                  language: z.string(),
                  gender: z.string(),
                  description: z.string().optional(),
                  previewUrl: z.string().optional(),
                  isActive: z.boolean().default(true)
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Voice created',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const data = c.req.valid('json')
        if (!data.id) {
          data.id = crypto.randomUUID()
        }
        const voice = await assetsConfigRepository.createVoice(data)
        return c.json({ success: true, data: voice }, 201)
      }
    )

    // PATCH /v1/admin/config/voices/{id}
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/config/voices/{id}',
        tags: ['Admin'],
        summary: 'Update a voice preset',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  presetId: z.string().optional(),
                  provider: z.string().optional(),
                  name: z.string().optional(),
                  language: z.string().optional(),
                  gender: z.string().optional(),
                  description: z.string().optional().nullable(),
                  previewUrl: z.string().optional().nullable(),
                  isActive: z.boolean().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Voice updated',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const data = c.req.valid('json')
        const voice = await assetsConfigRepository.updateVoice(id, data)
        return c.json({ success: true, data: voice })
      }
    )

    // DELETE /v1/admin/config/voices/{id}
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/config/voices/{id}',
        tags: ['Admin'],
        summary: 'Delete a voice preset',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Voice deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        await assetsConfigRepository.deleteVoice(id)
        return c.json({ success: true })
      }
    )

    // POST /v1/admin/config/music
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/config/music',
        tags: ['Admin'],
        summary: 'Create a new music track',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  id: z.string().optional(),
                  trackId: z.string(),
                  name: z.string(),
                  path: z.string(),
                  tags: z.array(z.string()).default([]),
                  previewUrl: z.string().optional(),
                  isActive: z.boolean().default(true)
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Music track created',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const data = c.req.valid('json')
        if (!data.id) {
          data.id = crypto.randomUUID()
        }
        const track = await assetsConfigRepository.createMusicTrack(data)
        return c.json({ success: true, data: track }, 201)
      }
    )

    // PATCH /v1/admin/config/music/{id}
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/config/music/{id}',
        tags: ['Admin'],
        summary: 'Update a music track',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  trackId: z.string().optional(),
                  name: z.string().optional(),
                  path: z.string().optional(),
                  tags: z.array(z.string()).optional(),
                  previewUrl: z.string().optional().nullable(),
                  isActive: z.boolean().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Music track updated',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const data = c.req.valid('json')
        const track = await assetsConfigRepository.updateMusicTrack(id, data)
        return c.json({ success: true, data: track })
      }
    )

    // DELETE /v1/admin/config/music/{id}
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/config/music/{id}',
        tags: ['Admin'],
        summary: 'Delete a music track',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Music track deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        await assetsConfigRepository.deleteMusicTrack(id)
        return c.json({ success: true })
      }
    )

    // POST /v1/admin/config/upload
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/config/upload',
        tags: ['Admin'],
        summary: 'Upload an asset file (voice/music)',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  file: z.instanceof(File).openapi({ description: 'Asset file to upload' }),
                  type: z.enum(['voice', 'music', 'image']).openapi({ description: 'Type of asset' })
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Asset uploaded',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), url: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        try {
          const formData = await c.req.formData()
          const file = formData.get('file') as File
          const type = formData.get('type') as string

          if (!file) {
            return c.json({ success: false, error: 'No file provided' }, 400)
          }

          const arrayBuffer = await file.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const mimeType = file.type || 'application/octet-stream'
          const ext = file.name.split('.').pop() || 'tmp'
          const id = crypto.randomUUID()

          const folder = type === 'voice' ? 'voices' : type === 'image' ? 'characters' : 'music'
          const key = `config/${folder}/${id}.${ext}`

          const { uploadBuffer } = await import('@/infrastructure/config/storage.config')
          const url = await uploadBuffer(key, buffer, mimeType)

          return c.json({ success: true, url })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 500)
        }
      }
    )
  }
}
