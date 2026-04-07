import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Routes } from '@/domain/types'
import { stripe as stripeClient } from '../config/stripe.config'
import { CreditsRepository } from '../repositories/credits.repository'
import { PricingRepository } from '../repositories/pricing.repository'
import type Stripe from 'stripe'

const creditsRepository = new CreditsRepository()
const pricingRepository = new PricingRepository()

export class CreditsController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    // GET /v1/credits
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/credits',
        tags: ['Credits'],
        summary: 'Get credit balance',
        description: 'Returns the monthly quota from the plan plus additional purchased credits.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Credit balance',
            content: {
              'application/json': {
                schema: z.object({
                  plan: z.string(),
                  videosThisMonth: z.number(),
                  videosMonthlyLimit: z.number(),
                  extraCredits: z.number(),
                  totalAvailable: z.number(),
                  resetDate: z.string()
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

        const credits = await creditsRepository.ensureUserCredits(user.id)
        const sub = await creditsRepository.getActiveSubscription(user.id)
        const planId = sub?.plan || 'free'

        // Fetch plan limit from DB
        const planInfo = await pricingRepository.getPlanById(planId)
        const monthlyLimit = planInfo?.monthlyLimit ?? 0

        const videosThisMonth = credits?.videosThisMonth ?? 0
        const extraCredits = credits?.extraCredits ?? 0
        const totalAvailable = monthlyLimit === -1 ? -1 : Math.max(0, monthlyLimit - videosThisMonth) + extraCredits
        const resetDate = credits?.resetDate
          ? credits.resetDate.toISOString().split('T')[0]
          : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0]

        return c.json({
          plan: planId,
          videosThisMonth,
          videosMonthlyLimit: monthlyLimit,
          extraCredits,
          totalAvailable,
          resetDate
        })
      }
    )

    // POST /v1/credits/checkout
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/credits/checkout',
        tags: ['Credits'],
        summary: 'Buy additional credits',
        description: 'Creates a Stripe Checkout session (one-time payment) for additional video credits.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  packId: z.string(),
                  successUrl: z.string().url(),
                  cancelUrl: z.string().url()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Checkout session created',
            content: {
              'application/json': {
                schema: z.object({
                  checkoutUrl: z.string(),
                  sessionId: z.string(),
                  pack: z.object({
                    id: z.string(),
                    credits: z.number(),
                    price: z.number(),
                    currency: z.string()
                  })
                })
              }
            }
          },
          400: {
            description: 'Invalid pack',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
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

        const { packId, successUrl, cancelUrl } = c.req.valid('json')
        const pack = await pricingRepository.getCreditPackById(packId)
        if (!pack) return c.json({ error: 'Invalid pack' }, 400)

        if (!pack.stripePriceId) {
          return c.json({ error: 'Pack price not configured' }, 400)
        }

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
          mode: 'payment',
          line_items: [{ price: pack.stripePriceId, quantity: 1 }],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            type: 'credit_topup',
            userId: user.id,
            packId,
            creditsAmount: String(pack.credits)
          }
        }

        if ((user as any).stripeCustomerId) {
          sessionParams.customer = (user as any).stripeCustomerId
        }

        const session = await stripeClient.checkout.sessions.create(sessionParams)

        return c.json({
          checkoutUrl: session.url,
          sessionId: session.id,
          pack: {
            id: pack.id,
            credits: pack.credits,
            price: Number(pack.priceAmount),
            currency: pack.currency || 'usd'
          }
        })
      }
    )

    // GET /v1/credits/history
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/credits/history',
        tags: ['Credits'],
        summary: 'Get credit transaction history (paginated)',
        description: 'Returns paginated credit purchase and consumption history with full details.',
        security: [{ Bearer: [] }],
        request: {
          query: z.object({
            page: z.coerce.number().min(1).default(1).optional(),
            limit: z.coerce.number().min(1).max(100).default(10).optional()
          })
        },
        responses: {
          200: {
            description: 'Paginated transaction history',
            content: {
              'application/json': {
                schema: z.object({
                  transactions: z.array(
                    z.object({
                      id: z.string(),
                      type: z.string(),
                      description: z.string(),
                      amount: z.number(),
                      price: z.number().nullable().optional(),
                      currency: z.string().nullable().optional(),
                      stripeSessionId: z.string().nullable().optional(),
                      packId: z.string().nullable().optional(),
                      videoId: z.string().nullable().optional(),
                      metadata: z.any().nullable().optional(),
                      createdAt: z.string()
                    })
                  ),
                  total: z.number(),
                  page: z.number(),
                  pages: z.number(),
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

        const { page = 1, limit = 10 } = c.req.valid('query')
        const total = await creditsRepository.countCreditTransactions(user.id)
        const transactions = await creditsRepository.getCreditTransactions(user.id, page, limit)

        const descriptionMap: Record<string, string> = {
          topup: 'Achat de crédits',
          welcome_bonus: 'Bonus de bienvenue',
          refund: 'Remboursement',
          debit: 'Consommation vidéo',
          admin_adjustment: 'Ajustement administrateur',
          subscription_reset: 'Renouvellement mensuel'
        }

        return c.json({
          transactions: transactions.map((t) => ({
            id: t.id,
            type: t.type,
            description: descriptionMap[t.type] ?? t.type,
            amount: t.amount,
            price: t.price ? Number(t.price) : null,
            currency: t.currency,
            stripeSessionId: t.stripeSessionId,
            packId: t.packId,
            videoId: t.videoId,
            metadata: t.metadata ?? null,
            createdAt: t.createdAt.toISOString()
          })),
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        })
      }
    )
  }
}
