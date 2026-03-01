import { Buffer } from 'node:buffer'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import { CancelSubscriptionUseCase } from '@/application/use-cases/subscription/cancel-subscription.use-case'
import { ChangeSubscriptionPlanUseCase } from '@/application/use-cases/subscription/change-subscription.use-case'
import { CreateSubscriptionUseCase } from '@/application/use-cases/subscription/create-subscription.use-case'
import { GetParentSubscriptionWithHistoryUseCase } from '@/application/use-cases/subscription/get-parent-subscription-history.use-case'
import { GetSubscriptionStatusUseCase } from '@/application/use-cases/subscription/get-subscription-status.use-case'
import { HandleStripeWebhookUseCase } from '@/application/use-cases/subscription/handle-stripe-webhook.use-case'
import { GetTrialConfigUseCase } from '@/application/use-cases/trial/get-trial-config.use-case'
import { UpdateTrialConfigUseCase } from '@/application/use-cases/trial/update-trial-config.use-case'
import type { Routes } from '@/domain/types'
import { stripe } from '../config/stripe.config'
import { db } from '../database/db'
import { subscriptionPlans } from '../database/schema'
import { TrialConfigRepository } from '../repositories/trial-config.repository'

export class SubscriptionController implements Routes {
  public controller: OpenAPIHono
  private getParentSubscriptionWithHistoryUseCase: GetParentSubscriptionWithHistoryUseCase

  constructor() {
    this.controller = new OpenAPIHono()
    this.getParentSubscriptionWithHistoryUseCase = new GetParentSubscriptionWithHistoryUseCase()
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
        description:
          'Returns Stripe invoices (period, payment date, amount, status, invoice URL) for the current user.',
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
                      periodStart: z.string(),
                      periodEnd: z.string(),
                      amount: z.number(),
                      currency: z.string(),
                      status: z.string(),
                      paidAt: z.string().nullable(),
                      invoiceUrl: z.string().nullable(),
                      isTrial: z.boolean().optional(),
                      isRefund: z.boolean().optional()
                    })
                  ),
                  error: z.string().optional()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                isExpired: z.boolean(),
                schema: z.object({ success: z.boolean(), error: z.string() })
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

          // On récupère les infos trial de l'utilisateur pour injecter les bonnes dates de période
          const trialStartDate = user.trialStartDate ? new Date(user.trialStartDate) : null
          const trialEndDate = user.trialEndDate ? new Date(user.trialEndDate) : null

          const data = await Promise.all(
            invoices.data.map(async (inv: any) => {
              let planName = null
              const priceId = inv.lines.data[0]?.price?.id
              let subscription = null
              if (inv.subscription) {
                try {
                  subscription = await stripe.subscriptions.retrieve(inv.subscription)
                  planName = subscription.items.data[0]?.price?.nickname || null
                  const productId =
                    typeof subscription.items.data[0]?.price?.product === 'string'
                      ? subscription.items.data[0].price.product
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

              const isTrialInvoice = (!inv.amount_paid || inv.amount_paid === 0) && trialStartDate && trialEndDate

              let periodStart: string | null = null
              let periodEnd: string | null = null

              if (isTrialInvoice) {
                periodStart = trialStartDate.toISOString()
                periodEnd = trialEndDate.toISOString()
              } else {
                const periodLine = inv.lines.data.find(
                  (line: any) => line.period && line.period.start && line.period.end
                )
                if (periodLine) {
                  periodStart = new Date(periodLine.period.start * 1000).toISOString()
                  periodEnd = new Date(periodLine.period.end * 1000).toISOString()
                } else {
                  periodStart = null
                  periodEnd = null
                }
              }

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
                isTrial: !!isTrialInvoice,
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
        description:
          'Returns masked card info (brand, last4, exp_month, exp_year, etc.) for the current Stripe payment method.',
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
          },
          404: {
            description: 'No payment method found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
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
          // Get Stripe customer ID from user
          const stripeCustomerId = user.stripeCustomerId
          if (!stripeCustomerId) {
            return c.json({ success: false, error: 'No Stripe customer found' }, 404)
          }
          // List payment methods
          const paymentMethods = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: 'card'
          })
          if (!paymentMethods.data.length) {
            return c.json({ success: false, error: 'No payment method found', data: null }, 404)
          }
          // Use the first card (default)
          const card = paymentMethods.data[0].card
          if (!card) {
            return c.json({ success: false, error: 'No card info found', data: null }, 404)
          }
          const info = {
            brand: card.brand,
            last4: card.last4,
            expMonth: card.exp_month,
            expYear: card.exp_year,
            funding: card.funding,
            country: card.country || null
          }
          return c.json({ success: true, data: info })
        } catch (error: any) {
          return c.json({ success: false, error: error.message, data: null }, 400)
        }
      }
    )
    // Auth required for parent endpoints
    this.controller.use('/v1/parent/*', (c, next) => {
      // Assume auth middleware is globally applied or add here if needed
      return next()
    })

    // GET /v1/parent/subscription-history
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/parent/subscription-history',
        tags: ['Subscription'],
        summary: 'Get current subscription and payment history for parent',
        responses: {
          200: {
            description: 'Subscription and payment history',
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
      async (c) => {
        // Always return 200, error in body if unauthorized, to match OpenAPI expectations
        try {
          const user = c.get('user')
          if (!user || !user.id) {
            return c.json({ success: false, error: 'Unauthorized', data: null })
          }
          const result = await this.getParentSubscriptionWithHistoryUseCase.execute({ parentId: user.id })
          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message, data: null })
        }
      }
    )
    // Ajout du middleware trialEligibilityMiddleware sur la route d'activation du trial
    //this.controller.use('/v1/subscription/create', trialEligibilityMiddleware)
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/subscription/create',
        tags: ['Subscription'],
        summary: 'Create Stripe subscription',
        description: 'Create a new subscription for a user.',
        security: [{ Bearer: [] }],

        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  planId: z.string(),
                  interval: z.enum(['month', 'year']),
                  successUrl: z.string(),
                  cancelUrl: z.string()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Subscription checkout session created',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  sessionId: z.string(),
                  paymentUrl: z.string().optional()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
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

        const { planId, interval, successUrl, cancelUrl } = await c.req.json()
        console.log('ici', 'ici')
        // Récupérer la configuration des essais
        const getTrialConfigUseCase = new GetTrialConfigUseCase(new TrialConfigRepository())
        const trialConfig = await getTrialConfigUseCase.execute()

        if (!trialConfig.data) {
          return c.json({ success: false, error: 'Trial configuration not found' }, 400)
        }

        const createSubscriptionUseCase = new CreateSubscriptionUseCase()
        const result = await createSubscriptionUseCase.execute({
          userId: user.id,
          planId,
          interval,
          successUrl,
          cancelUrl,
          trialEnabled: trialConfig.data.isEnabled,
          trialDuration: trialConfig.data.durationInDays
        })

        if (result.success) {
          return c.json({
            success: true,
            sessionId: result.sessionId,
            paymentUrl: result.paymentUrl
          })
        } else {
          return c.json({ success: false, error: result.error }, 400)
        }
      }
    )
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription/status',
        tags: ['Subscription'],
        summary: 'Get subscription status',
        description: 'Get the current subscription status and details for a user',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Subscription details retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    isTrialActive: z.boolean(),
                    trialStartDate: z.string().nullable(),
                    trialEndDate: z.string().nullable(),
                    plan: z.object({
                      title: z.string(),
                      description: z.string(),
                      benefits: z.array(z.string()),
                      isPaid: z.boolean(),
                      interval: z.enum(['month', 'year']).nullable(),
                      isCanceled: z.boolean(),
                      accessEndsAt: z.string().nullable()
                    })
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

        const getSubscriptionStatusUseCase = new GetSubscriptionStatusUseCase()
        try {
          const subscription = await getSubscriptionStatusUseCase.execute({ userId: user.id })
          return c.json({
            success: true,
            data: {
              ...subscription,
              isCanceled: subscription.isCanceled,
              accessEndsAt: subscription.accessEndsAt
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/subscription/payment-method/update',
        tags: ['Subscription'],
        summary: 'Open Stripe billing portal for card modification',
        description: 'Returns a Stripe billing portal session URL for the user to update their payment method/card.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  returnUrl: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Billing portal session created',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  url: z.string().optional(),
                  error: z.string().optional()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
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
        const { returnUrl } = await c.req.json()
        try {
          const stripeCustomerId = user.stripeCustomerId
          if (!stripeCustomerId) {
            return c.json({ success: false, error: 'No Stripe customer found' }, 404)
          }

          const session = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: returnUrl
          })
          return c.json({ success: true, url: session.url })
        } catch (error: any) {
          let message = error.message || 'Stripe error'
          if (error.raw && error.raw.message) message = error.raw.message
          return c.json({ success: false, error: message }, 400)
        }
      }
    )
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/stripe/webhook',
        tags: ['Subscription'],
        summary: 'Stripe Webhook',
        description: 'Handle Stripe webhook events.',
        operationId: 'stripeWebhook',
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
                })
              }
            }
          }
        }
      }),
      async (ctx: any) => {
        const sig = ctx.req.header('stripe-signature')
        const rawBody = Buffer.from(await ctx.req.raw.arrayBuffer())
        try {
          const event = await stripe.webhooks.constructEventAsync(rawBody, sig!, Bun.env.STRIPE_WEBHOOK_SECRET!)

          const handleStripeWebhookUseCase = new HandleStripeWebhookUseCase()
          const result = await handleStripeWebhookUseCase.execute({ event })

          if (result.success) {
            return ctx.json({ success: true })
          } else {
            return ctx.json({ success: false }, 400)
          }
        } catch (error) {
          console.error('[Stripe Webhook Error]', error)
          return ctx.json({ success: false, error: 'Webhook Error' }, 400)
        }
      }
    )
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/subscription/change',
        tags: ['Subscription'],
        summary: 'Change subscription plan',
        description: 'Change the current subscription plan for the user.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  planId: z.string(),
                  interval: z.enum(['month', 'year'])
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Subscription plan changed successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
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

        const { planId, interval } = await c.req.json()

        const changeSubscriptionPlanUseCase = new ChangeSubscriptionPlanUseCase()
        try {
          const result = await changeSubscriptionPlanUseCase.execute({
            userId: user.id,
            planId,
            interval
          })

          if (result.success) {
            return c.json({ success: true })
          } else {
            return c.json({ success: false, error: result.error }, 400)
          }
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // GET /v1/subscription/trial-config - Récupérer la configuration de la période d'essai
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription/trial-config',
        tags: ['Subscription'],
        summary: 'Get trial configuration',
        description: 'Get the current trial period configuration.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Trial configuration retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    isEnabled: z.boolean(),
                    durationInDays: z.number()
                  })
                })
              }
            }
          },
          401: {
            description: 'Unauthorized - Admin access required',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const currentUser = c.get('user')

        if (!currentUser && currentUser.role !== 'admin') {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        const getTrialConfigUseCase = new GetTrialConfigUseCase(new TrialConfigRepository())
        try {
          const result = await getTrialConfigUseCase.execute()
          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // PUT /v1/subscription/trial-config - Mettre à jour la configuration de la période d'essai
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/subscription/trial-config',
        tags: ['Subscription'],
        summary: 'Update trial configuration',
        description: 'Update the trial period configuration.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  isEnabled: z.boolean(),
                  durationInDays: z.number().min(0).max(365)
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Trial configuration updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    isEnabled: z.boolean(),
                    durationInDays: z.number()
                  })
                })
              }
            }
          },
          401: {
            description: 'Unauthorized - Admin access required',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const currentUser = c.get('user')

        if (!currentUser && currentUser.role !== 'admin') {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        const { isEnabled, durationInDays } = await c.req.json()
        const updateTrialConfigUseCase = new UpdateTrialConfigUseCase(new TrialConfigRepository())
        try {
          const { result } = await updateTrialConfigUseCase.run({
            isEnabled,
            durationInDays
          })
          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/subscription/cancel',
        tags: ['Subscription'],
        summary: 'Cancel subscription',
        description: 'Cancel the current subscription of the user.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Subscription canceled successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
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

        const cancelSubscriptionUseCase = new CancelSubscriptionUseCase()
        try {
          const result = await cancelSubscriptionUseCase.execute({
            userId: user.id
          })

          if (result.success) {
            return c.json({ success: true })
          } else {
            return c.json({ success: false, error: result.error }, 400)
          }
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription/current',
        tags: ['Subscription'],
        summary: 'Get current subscription info for user',
        description: 'Returns the current subscription plan, max children allowed, active until, and trial info.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Current subscription info',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    planName: z.string(),
                    maxChildren: z.number(),
                    activeUntil: z.string().nullable(),
                    isTrial: z.boolean(),
                    currentChildrenCount: z.number(),
                    trialEndDate: z.string().nullable(),
                    trialDaysLeft: z.number().nullable()
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
          const getSubscriptionStatusUseCase = new GetSubscriptionStatusUseCase()
          const sub = await getSubscriptionStatusUseCase.execute({ userId: user.id })

          const planName = sub.plan?.title
          const maxChildren = sub.plan?.maxChildren || 1
          const isTrial = sub.isTrialActive || false

          let activeUntil = null // Toujours null pour les nouveaux utilisateurs
          let trialEndDate = null
          let trialDaysLeft = null
          if (isTrial && sub.trialEndDate) {
            // Pour les trials, utiliser directement la date ISO string
            activeUntil = sub.trialEndDate
            trialEndDate = sub.trialEndDate
            const now = new Date()
            const trialEnd = new Date(sub.trialEndDate)

            // Validation de la date de fin de trial
            if (Number.isNaN(trialEnd.getTime())) {
              console.error(`[Subscription] Invalid trial end date for user ${user.id}: ${sub.trialEndDate}`)
              activeUntil = null
              trialEndDate = null
              trialDaysLeft = null
            } else {
              // Calcul précis des jours restants en utilisant les millisecondes
              const timeDiff = trialEnd.getTime() - now.getTime()
              trialDaysLeft = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)))
            }
          } else if (!isTrial && sub.accessEndsAt) {
            activeUntil = sub.accessEndsAt
            trialEndDate = null
          }

          if (!isTrial && sub.stripeCurrentPeriodEnd) {
            activeUntil = sub.stripeCurrentPeriodEnd
            trialEndDate = null
          }
          let isExpired = false
          const now = new Date()
          let endDate = null

          if (isTrial && sub.trialEndDate) {
            endDate = new Date(sub.trialEndDate)
          } else if (!isTrial && sub.stripeCurrentPeriodEnd) {
            endDate = new Date(sub.stripeCurrentPeriodEnd)
          } else if (sub.accessEndsAt) {
            endDate = new Date(sub.accessEndsAt)
          }

          if (endDate) {
            isExpired = endDate.getTime() < now.getTime()
          } else {
            isExpired = true
          }
          const hasNeverSubscribed =
            !sub?.plan && !sub?.isTrialActive && !sub?.accessEndsAt && !sub?.stripeCurrentPeriodEnd

          if (hasNeverSubscribed) {
            isExpired = false
            activeUntil = null
          }

          return c.json({
            success: true,
            data: {
              planName,
              maxChildren,
              interval: sub.plan?.interval || null,
              activeUntil,
              isTrial,
              trialEndDate,
              trialDaysLeft,
              isExpired,
              isCanceled: sub.isCanceled,
              accessEndsAt: sub.accessEndsAt,
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message })
        }
      }
    )

  }
}