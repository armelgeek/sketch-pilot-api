import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { and, desc, eq, or } from 'drizzle-orm'
import type { Routes } from '@/domain/types'
import { stripe } from '../config/stripe.config'
import { db } from '../database/db'
import { subscription, subscriptionPlans } from '../database/schema'

export class SubscriptionController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
    this.initRoutes()
  }

  public initRoutes() {
    // GET /v1/subscription/invoices
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription/invoices',
        tags: ['Subscription'],
        summary: 'Get Stripe invoice history for current user',
        description: 'Returns Stripe invoices for the current user.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Invoice history',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.array(
                    z.object({
                      id: z.string(),
                      periodStart: z.string().nullable(),
                      periodEnd: z.string().nullable(),
                      amount: z.number(),
                      currency: z.string(),
                      status: z.string(),
                      paidAt: z.string().nullable(),
                      invoiceUrl: z.string().nullable(),
                      isRefund: z.boolean().optional()
                    })
                  ),
                  error: z.string().optional()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }
        const stripeCustomerId = user.stripeCustomerId
        if (!stripeCustomerId) {
          return c.json({ success: false, error: 'No Stripe customer found' }, 404)
        }
        try {
          const invoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 30 })

          const data = await Promise.all(
            invoices.data.map(async (inv: any) => {
              let planName = null
              const priceId = inv.lines.data[0]?.price?.id
              if (inv.subscription) {
                try {
                  const sub = await stripe.subscriptions.retrieve(inv.subscription)
                  planName = sub.items.data[0]?.price?.nickname || null
                  const productId =
                    typeof sub.items.data[0]?.price?.product === 'string'
                      ? sub.items.data[0].price.product
                      : null
                  if (!planName && productId) {
                    const product = await stripe.products.retrieve(productId)
                    planName = product.name
                  }
                } catch {}
              }
              if (!planName && priceId) {
                const localPlan = await db.query.subscriptionPlans.findFirst({
                  where: eq(subscriptionPlans.stripePriceIdMonthly, priceId)
                })
                if (localPlan) planName = localPlan.name
                if (!planName) {
                  const localPlanYear = await db.query.subscriptionPlans.findFirst({
                    where: eq(subscriptionPlans.stripePriceIdYearly, priceId)
                  })
                  if (localPlanYear) planName = localPlanYear.name
                }
              }

              const periodLine = inv.lines.data.find(
                (line: any) => line.period && line.period.start && line.period.end
              )
              const periodStart = periodLine ? new Date(periodLine.period.start * 1000).toISOString() : null
              const periodEnd = periodLine ? new Date(periodLine.period.end * 1000).toISOString() : null

              let isRefund = false
              if (typeof inv.amount_paid === 'number' && inv.amount_paid < 0) {
                isRefund = true
              } else if (Array.isArray(inv.credit_notes) && inv.credit_notes.length > 0) {
                isRefund = true
              } else if (inv.amount_refunded && inv.amount_refunded > 0) {
                isRefund = true
              }

              return {
                id: inv.id,
                planName,
                periodStart,
                periodEnd,
                amount: typeof inv.total === 'number' ? inv.total / 100 : 0,
                currency: inv.currency,
                status: inv.status,
                interval: inv.lines.data[0]?.plan?.interval || null,
                paidAt: inv.status === 'paid' && inv.paid_at ? new Date(inv.paid_at * 1000).toISOString() : null,
                invoiceUrl: inv.hosted_invoice_url || null,
                isRefund
              }
            })
          )
          return c.json({ success: true, data })
        } catch (error: any) {
          return c.json({ success: false, error: error.message })
        }
      }
    )

    // GET /v1/subscription/payment-method
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription/payment-method',
        tags: ['Subscription'],
        summary: 'Get Stripe payment method info for current user',
        description: 'Returns masked card info for the current Stripe payment method.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Payment method info',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z
                    .object({
                      brand: z.string(),
                      last4: z.string(),
                      expMonth: z.number(),
                      expYear: z.number(),
                      funding: z.string(),
                      country: z.string().nullable()
                    })
                    .nullable(),
                  error: z.string().optional()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }
        try {
          const stripeCustomerId = user.stripeCustomerId
          if (!stripeCustomerId) {
            return c.json({ success: false, error: 'No Stripe customer found' }, 404)
          }
          const paymentMethods = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: 'card'
          })
          if (!paymentMethods.data.length) {
            return c.json({ success: false, error: 'No payment method found', data: null }, 404)
          }
          const card = paymentMethods.data[0].card
          if (!card) {
            return c.json({ success: false, error: 'No card info found', data: null }, 404)
          }
          return c.json({
            success: true,
            data: {
              brand: card.brand,
              last4: card.last4,
              expMonth: card.exp_month,
              expYear: card.exp_year,
              funding: card.funding,
              country: card.country || null
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message, data: null }, 400)
        }
      }
    )

    // GET /v1/subscription/status
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription/status',
        tags: ['Subscription'],
        summary: 'Get subscription status',
        description: 'Get the current subscription status for the authenticated user.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Subscription status',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    plan: z.string().nullable(),
                    status: z.string().nullable(),
                    isPaid: z.boolean(),
                    interval: z.string().nullable(),
                    isCanceled: z.boolean(),
                    periodEnd: z.string().nullable()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        try {
          const now = new Date()
          const gracePeriodMs = 24 * 60 * 60 * 1000

          const activeSub = await db.query.subscription.findFirst({
            where: and(
              eq(subscription.referenceId, user.id),
              or(eq(subscription.status, 'active'), eq(subscription.status, 'trialing'))
            )
          })

          const isPaid = activeSub
            ? activeSub.periodEnd
              ? activeSub.periodEnd.getTime() + gracePeriodMs > now.getTime()
              : true
            : false

          return c.json({
            success: true,
            data: {
              plan: activeSub?.plan || null,
              status: activeSub?.status || null,
              isPaid,
              interval: activeSub?.billingInterval || null,
              isCanceled: activeSub?.cancelAtPeriodEnd ?? false,
              periodEnd: activeSub?.periodEnd?.toISOString() || null
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // GET /v1/subscription/current
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription/current',
        tags: ['Subscription'],
        summary: 'Get current subscription details',
        description: 'Returns detailed info about the current subscription plan.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Current subscription info',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    planName: z.string().nullable(),
                    activeUntil: z.string().nullable(),
                    isExpired: z.boolean(),
                    isCanceled: z.boolean(),
                    interval: z.string().nullable(),
                    status: z.string().nullable()
                  }),
                  error: z.string().optional()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }
        try {
          const now = new Date()

          const activeSub = await db.query.subscription.findFirst({
            where: and(
              eq(subscription.referenceId, user.id),
              or(eq(subscription.status, 'active'), eq(subscription.status, 'trialing'))
            )
          })

          const isCanceled = activeSub?.cancelAtPeriodEnd ?? false
          const activeUntil = activeSub?.periodEnd?.toISOString() || null
          const isExpired = activeSub?.periodEnd ? activeSub.periodEnd.getTime() < now.getTime() : !activeSub

          return c.json({
            success: true,
            data: {
              planName: activeSub?.plan || null,
              interval: activeSub?.billingInterval || null,
              activeUntil,
              isExpired,
              isCanceled,
              status: activeSub?.status || null
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message })
        }
      }
    )

    // GET /v1/subscription/history
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription/history',
        tags: ['Subscription'],
        summary: 'Get subscription history for the current user',
        responses: {
          200: {
            description: 'Subscription history',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.any(),
                  error: z.string().optional()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const user = c.get('user')
          if (!user || !user.id) {
            return c.json({ success: false, error: 'Unauthorized', data: null })
          }

          const subscriptions = await db
            .select()
            .from(subscription)
            .where(eq(subscription.referenceId, user.id))
            .orderBy(desc(subscription.createdAt))

          const activeSub = subscriptions.find((s) => s.status === 'active' || s.status === 'trialing') || null

          const current = activeSub
            ? {
                plan: activeSub.plan,
                stripeSubscriptionId: activeSub.stripeSubscriptionId,
                periodEnd: activeSub.periodEnd,
                isPaid: activeSub.status === 'active',
                interval: activeSub.billingInterval,
                isCanceled: activeSub.cancelAtPeriodEnd,
                status: activeSub.status
              }
            : null

          const history = subscriptions.map((s) => ({
            id: s.id,
            plan: s.plan,
            status: s.status,
            periodStart: s.periodStart,
            periodEnd: s.periodEnd,
            createdAt: s.createdAt,
            billingInterval: s.billingInterval,
            cancelAtPeriodEnd: s.cancelAtPeriodEnd
          }))

          return c.json({ success: true, data: { current, history } })
        } catch (error: any) {
          return c.json({ success: false, error: error.message, data: null })
        }
      }
    )
  }
}
