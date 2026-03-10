import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Routes } from '@/domain/types'
import { CREDIT_PACKS, VIDEO_GENRES, VIDEO_TYPES, VOICES } from '../config/video.config'
import { db } from '../database/db'
import { subscriptionPlans } from '../database/schema'

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

    // GET /v1/config/voices
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/config/voices',
        tags: ['Config'],
        summary: 'Get available voices by provider',
        responses: {
          200: {
            description: 'Voices',
            content: {
              'application/json': {
                schema: z.object({
                  voices: z.record(
                    z.array(
                      z.object({
                        id: z.string(),
                        name: z.string(),
                        language: z.string(),
                        gender: z.string()
                      })
                    )
                  )
                })
              }
            }
          }
        }
      }),
      (c: any) => {
        return c.json({ voices: VOICES })
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
      async (c: any) => {
        const plans = await db.select().from(subscriptionPlans)

        const creditPacks = Object.values(CREDIT_PACKS).map((pack) => ({
          id: pack.id,
          credits: pack.credits,
          price: pack.price,
          currency: pack.currency,
          stripePriceId: pack.priceId
        }))

        return c.json({ plans, creditPacks })
      }
    )
  }
}
