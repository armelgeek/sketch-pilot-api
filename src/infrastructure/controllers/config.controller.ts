import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Routes } from '@/domain/types'
import { CREDIT_PACKS, VIDEO_GENRES, VIDEO_TYPES } from '../config/video.config'
import { AssetsConfigRepository } from '../repositories/assets-config.repository'

const assetsConfigRepository = new AssetsConfigRepository()

export class ConfigController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    // GET /v1/config/video-types
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/config/video-types',
        tags: ['Config'],
        summary: 'Get available video types',
        responses: {
          200: {
            description: 'Video types',
            content: {
              'application/json': {
                schema: z.object({
                  videoTypes: z.array(
                    z.object({
                      id: z.string(),
                      name: z.string(),
                      description: z.string()
                    })
                  )
                })
              }
            }
          }
        }
      }),
      (c: any) => {
        return c.json({ videoTypes: VIDEO_TYPES })
      }
    )

    // GET /v1/config/genres
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/config/genres',
        tags: ['Config'],
        summary: 'Get available video genres',
        responses: {
          200: {
            description: 'Genres',
            content: {
              'application/json': {
                schema: z.object({
                  genres: z.array(
                    z.object({
                      id: z.string(),
                      name: z.string(),
                      description: z.string()
                    })
                  )
                })
              }
            }
          }
        }
      }),
      (c: any) => {
        return c.json({ genres: VIDEO_GENRES })
      }
    )

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
  }
}
