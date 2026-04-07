import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Routes } from '@/domain/types'
import { requireAdmin } from '../middlewares/auth.middleware'
import { PricingRepository } from '../repositories/pricing.repository'

const pricingRepository = new PricingRepository()

export class PricingController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    // GET /v1/pricing/plans
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/pricing/plans',
        tags: ['Pricing'],
        summary: 'Get available subscription plans',
        description: 'Returns a list of all subscription plans available for users.',
        responses: {
          200: {
            description: 'List of plans',
            content: {
              'application/json': {
                schema: z.object({
                  plans: z.array(
                    z.object({
                      id: z.string(),
                      name: z.string(),
                      description: z.string().nullable(),
                      monthlyLimit: z.number(),
                      priceMonthlyId: z.string().nullable(),
                      priceYearlyId: z.string().nullable(),
                      priceMonthlyAmount: z.string().nullable(), // DB numeric is string in JS
                      priceYearlyAmount: z.string().nullable(),
                      currency: z.string().nullable(),
                      isDefault: z.boolean(),
                      isFeatured: z.boolean(),
                      features: z.array(z.string()).nullable()
                    })
                  )
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const plans = await pricingRepository.getPlans()
        return c.json({ plans })
      }
    )

    // GET /v1/pricing/packs
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/pricing/packs',
        tags: ['Pricing'],
        summary: 'Get available credit packs',
        description: 'Returns a list of all one-time credit packs available for purchase.',
        responses: {
          200: {
            description: 'List of packs',
            content: {
              'application/json': {
                schema: z.object({
                  packs: z.array(
                    z.object({
                      id: z.string(),
                      name: z.string(),
                      credits: z.number(),
                      priceAmount: z.string().nullable(),
                      currency: z.string().nullable(),
                      stripePriceId: z.string(),
                      isFeatured: z.boolean(),
                      description: z.string().nullable()
                    })
                  )
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const packs = await pricingRepository.getCreditPacks()
        return c.json({ packs })
      }
    )
  }

  public initAdminRoutes() {
    this.controller.use('/v1/admin/*', requireAdmin)

    // GET /v1/admin/pricing/stripe/prices
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/pricing/stripe/prices',
        tags: ['Admin'],
        summary: 'Get active Stripe prices (admin)',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'List of prices',
            content: {
              'application/json': {
                schema: z.object({
                  prices: z.array(
                    z.object({
                      id: z.string(),
                      productId: z.string(),
                      productName: z.string(),
                      amount: z.string(),
                      currency: z.string(),
                      type: z.string(),
                      interval: z.string().nullable()
                    })
                  )
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const prices = await pricingRepository.getStripePrices()
        return c.json({ prices })
      }
    )

    // POST /v1/admin/pricing/plans
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/pricing/plans',
        tags: ['Admin'],
        summary: 'Create a new subscription plan (admin)',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  id: z.string().optional(),
                  name: z.string(),
                  description: z.string().optional().nullable(),
                  monthlyLimit: z.number(),
                  priceMonthlyId: z.string().optional().nullable(),
                  priceYearlyId: z.string().optional().nullable(),
                  priceMonthlyAmount: z.string().optional().nullable(),
                  priceYearlyAmount: z.string().optional().nullable(),
                  currency: z.string().default('usd'),
                  isDefault: z.boolean().default(false),
                  isFeatured: z.boolean().default(false),
                  features: z.array(z.string()).optional().nullable()
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Plan created',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), plan: z.any() }) }
            }
          }
        }
      }),
      async (c: any) => {
        const data = c.req.valid('json')
        const plan = await pricingRepository.createPlan(data)
        return c.json({ success: true, plan }, 201)
      }
    )

    // PATCH /v1/admin/pricing/plans/:id
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/pricing/plans/{id}',
        tags: ['Admin'],
        summary: 'Update a subscription plan (admin)',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string().optional(),
                  description: z.string().optional().nullable(),
                  monthlyLimit: z.number().optional(),
                  priceMonthlyId: z.string().optional().nullable(),
                  priceYearlyId: z.string().optional().nullable(),
                  priceMonthlyAmount: z.string().optional().nullable(),
                  priceYearlyAmount: z.string().optional().nullable(),
                  currency: z.string().optional(),
                  isDefault: z.boolean().optional(),
                  isFeatured: z.boolean().optional(),
                  features: z.array(z.string()).optional().nullable()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Plan updated',
            content: {
              'application/json': { schema: z.object({ success: z.boolean(), plan: z.any() }) }
            }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const data = c.req.valid('json')
        const plan = await pricingRepository.updatePlan(id, data)
        return c.json({ success: true, plan })
      }
    )

    // DELETE /v1/admin/pricing/plans/:id
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/pricing/plans/{id}',
        tags: ['Admin'],
        summary: 'Delete a subscription plan (admin)',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Plan deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        await pricingRepository.deletePlan(id)
        return c.json({ success: true })
      }
    )

    // Similar routes for Credit Packs
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/pricing/packs',
        tags: ['Admin'],
        summary: 'Create a new credit pack (admin)',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  id: z.string().optional(),
                  name: z.string(),
                  credits: z.number(),
                  priceAmount: z.string().optional().nullable(),
                  currency: z.string().default('usd'),
                  stripePriceId: z.string().optional().nullable(),
                  isFeatured: z.boolean().default(false),
                  description: z.string().optional().nullable()
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Pack created',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), pack: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const data = c.req.valid('json')
        const pack = await pricingRepository.createCreditPack(data)
        return c.json({ success: true, pack }, 201)
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/pricing/packs/{id}',
        tags: ['Admin'],
        summary: 'Update a credit pack (admin)',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string().optional(),
                  credits: z.number().optional(),
                  priceAmount: z.string().optional().nullable(),
                  currency: z.string().optional(),
                  stripePriceId: z.string().optional(),
                  isFeatured: z.boolean().optional(),
                  description: z.string().optional().nullable()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Pack updated',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), pack: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const data = c.req.valid('json')
        const pack = await pricingRepository.updateCreditPack(id, data)
        return c.json({ success: true, pack })
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/pricing/packs/{id}',
        tags: ['Admin'],
        summary: 'Delete a credit pack (admin)',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Pack deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        await pricingRepository.deleteCreditPack(id)
        return c.json({ success: true })
      }
    )
  }
}
