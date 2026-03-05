import { eq } from 'drizzle-orm'
import { TrialService } from '@/application/services/trial.service'
import { IUseCase } from '@/domain/types'
import { emailTemplates, sendEmail } from '@/infrastructure/config/mail.config'
import { stripe } from '@/infrastructure/config/stripe.config'
import { db } from '@/infrastructure/database/db'
import { subscriptionHistory, subscriptionPlans, users } from '@/infrastructure/database/schema'
import type Stripe from 'stripe'

export class HandleStripeWebhookUseCase extends IUseCase<{ event: Stripe.Event }, { success: boolean }> {
  async execute({ event }: { event: Stripe.Event }): Promise<{ success: boolean }> {
    console.info(`[StripeWebhook] Received event: ${event.type}`)
    try {
      let user
      switch (event.type) {
        case 'checkout.session.completed': {
          try {
            const session = event.data.object as any

            if (session.subscription && session.customer) {
              const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription)
              user = await db
                .select()
                .from(users)
                .where(eq(users.id, session.metadata?.userId))
                .then((rows) => rows[0])

              // Utilise directement la date de fin de période fournie par Stripe
              const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000)
              const interval =
                session.metadata?.interval || stripeSubscription.items.data[0]?.price?.recurring?.interval

              console.info(
                `[StripeWebhook] Processing subscription - interval: ${interval}, current_period_end: ${currentPeriodEnd.toISOString()}`
              )
              await db
                .update(users)
                .set({
                  planId: session.metadata?.planId,
                  stripeSubscriptionId: session.subscription,
                  stripeCustomerId: session.customer,
                  stripeCurrentPeriodEnd: currentPeriodEnd,
                  subscriptionInterval: interval
                })
                .where(eq(users.id, session.metadata?.userId))

              // Add subscription history record
              let invoiceUrl = null
              if (session.invoice) {
                const invoice = await stripe.invoices.retrieve(session.invoice)
                invoiceUrl = invoice.hosted_invoice_url || null
              }
              await db.insert(subscriptionHistory).values({
                id: crypto.randomUUID(),
                userId: user.id,
                action: 'created',
                oldPlan: null,
                newPlan: session.display_items?.[0]?.custom?.name || 'unknown',
                amount: session.amount_total ? String(session.amount_total / 100) : null,
                currency: session.currency || 'eur',
                status: 'active',
                stripeInvoiceUrl: invoiceUrl,
                timestamp: new Date()
              })

              // Trial logic: interrupt trial if subscription is now active
              if (user?.isTrialActive) {
                const trialService = new TrialService()
                await trialService.interruptTrial(user.id)
                // Add trial interruption to history
                await db.insert(subscriptionHistory).values({
                  id: crypto.randomUUID(),
                  userId: user.id,
                  action: 'trial_interrupted',
                  oldPlan: 'trial',
                  newPlan: session.display_items?.[0]?.custom?.name || 'unknown',
                  amount: null,
                  currency: session.currency || 'eur',
                  status: 'interrupted',
                  timestamp: new Date()
                })
              }

              // Trial logic: start local trial ONLY if no Stripe subscription is active
              // and user is eligible. Note: Stripe trials are handled via stripeCurrentPeriodEnd.
              if (!session.subscription && !user?.hasTrialUsed && !user?.isTrialActive) {
                const trialService = new TrialService()
                await trialService.startTrial(user.id)
                // Add trial start to history
                await db.insert(subscriptionHistory).values({
                  id: crypto.randomUUID(),
                  userId: user.id,
                  action: 'trial_started',
                  oldPlan: null,
                  newPlan: 'trial',
                  amount: null,
                  currency: session.currency || 'eur',
                  status: 'started',
                  timestamp: new Date()
                })
              }

              const emailTemplate = await emailTemplates.subscriptionCreated(user.name, 'Pro')
              await sendEmail({
                to: user.email,
                ...emailTemplate
              })
            }
          } catch (error) {
            if (error instanceof RangeError) {
              console.error('[StripeWebhook][checkout.session.completed] RangeError: Invalid Date', error)
              return { success: false }
            }
            console.error('[StripeWebhook][checkout.session.completed] Error:', error)
            return { success: false }
          }
          break
        }

        case 'invoice.paid': {
          try {
            const invoice = event.data.object as any
            if (invoice.subscription) {
              user = await db
                .select()
                .from(users)
                .where(eq(users.stripeSubscriptionId, invoice.subscription))
                .then((rows) => rows[0])

              if (user) {
                // Ajoute l'URL de la facture à l'historique
                await db.insert(subscriptionHistory).values({
                  id: crypto.randomUUID(),
                  userId: user.id,
                  action: 'invoice_paid',
                  oldPlan: null,
                  newPlan: null,
                  amount: invoice.total ? String(invoice.total / 100) : null,
                  currency: invoice.currency || 'eur',
                  status: 'paid',
                  stripeInvoiceUrl: invoice.hosted_invoice_url || null,
                  timestamp: new Date()
                })

                // Update stripeCurrentPeriodEnd from subscription
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
                const currentPeriodEnd = new Date(subscription.current_period_end * 1000)
                const interval = subscription.items.data[0]?.price?.recurring?.interval || null

                await db
                  .update(users)
                  .set({
                    stripeCurrentPeriodEnd: currentPeriodEnd,
                    subscriptionInterval: interval
                  })
                  .where(eq(users.id, user.id))

                const emailTemplate = await emailTemplates.paymentSucceeded(user.name)
                await sendEmail({
                  to: user.email,
                  ...emailTemplate
                })
              }
            }
          } catch (error) {
            if (error instanceof RangeError) {
              console.error('[StripeWebhook][invoice.paid] RangeError: Invalid Date', error)
              return { success: false }
            }
            console.error('[StripeWebhook][invoice.paid] Error:', error)
            return { success: false }
          }
          break
        }

        case 'invoice.payment_failed': {
          try {
            const invoice = event.data.object as any
            if (invoice.subscription) {
              user = await db
                .select()
                .from(users)
                .where(eq(users.stripeSubscriptionId, invoice.subscription))
                .then((rows) => rows[0])

              const emailTemplate = await emailTemplates.paymentFailed(user.name)
              await sendEmail({
                to: user.email,
                ...emailTemplate
              })
            }
          } catch (error) {
            if (error instanceof RangeError) {
              console.error('[StripeWebhook][invoice.payment_failed] RangeError: Invalid Date', error)
              return { success: false }
            }
            console.error('[StripeWebhook][invoice.payment_failed] Error:', error)
            return { success: false }
          }
          break
        }

        case 'customer.subscription.updated': {
          try {
            const subscription = event.data.object as Stripe.Subscription
            const subscriptionId = subscription.id
            const stripeCustomerId = subscription.customer as string
            let currentPeriodEnd: Date | null = null
            if (subscription.current_period_end) {
              currentPeriodEnd = new Date(subscription.current_period_end * 1000)
            } else {
              // Si absent, récupère la souscription complète depuis Stripe
              const fullSubscription = await stripe.subscriptions.retrieve(subscriptionId)
              if (fullSubscription.current_period_end) {
                currentPeriodEnd = new Date(fullSubscription.current_period_end * 1000)
              }
            }
            const priceId = subscription.items.data[0]?.price.id
            if (!stripeCustomerId || !subscriptionId || !currentPeriodEnd || !priceId) {
              console.error('[StripeWebhook][customer.subscription.updated] Missing required fields')
              return { success: false }
            }
            const user = await db
              .select()
              .from(users)
              .where(eq(users.stripeCustomerId, stripeCustomerId))
              .then((rows) => rows[0])

            let plan = await db
              .select()
              .from(subscriptionPlans)
              .where(eq(subscriptionPlans.stripePriceIdMonthly, priceId))
              .then((rows) => rows[0])
            if (!plan) {
              plan = await db
                .select()
                .from(subscriptionPlans)
                .where(eq(subscriptionPlans.stripePriceIdYearly, priceId))
                .then((rows) => rows[0])
            }

            await db
              .update(users)
              .set({
                stripeSubscriptionId: subscriptionId,
                stripeCurrentPeriodEnd: currentPeriodEnd,
                subscriptionInterval: subscription.items.data[0]?.price?.recurring?.interval || null,
                planId: plan ? plan.id : null
              })
              .where(eq(users.id, user.id))

            // Add subscription change to history
            await db.insert(subscriptionHistory).values({
              id: crypto.randomUUID(),
              userId: user.id,
              action: 'changed',
              oldPlan: user.planId,
              newPlan: plan ? plan.name : null,
              amount: subscription.items.data[0]?.price.unit_amount
                ? String(subscription.items.data[0].price.unit_amount / 100)
                : null,
              currency: subscription.items.data[0]?.price.currency || 'eur',
              status: subscription.status,
              timestamp: new Date()
            })
            // If trial is active, interrupt it and log history
            if (user?.isTrialActive) {
              const trialService = new TrialService()
              await trialService.interruptTrial(user.id)
              await db.insert(subscriptionHistory).values({
                id: crypto.randomUUID(),
                userId: user.id,
                action: 'trial_interrupted',
                oldPlan: 'trial',
                newPlan: plan ? plan.name : null,
                amount: null,
                currency: subscription.items.data[0]?.price.currency || 'eur',
                status: 'interrupted',
                timestamp: new Date()
              })
            }
          } catch (error) {
            if (error instanceof RangeError) {
              console.error('[StripeWebhook][customer.subscription.updated] RangeError: Invalid Date', error)
              return { success: false }
            }
            console.error('[StripeWebhook][customer.subscription.updated] Error:', error)
            return { success: false }
          }
          break
        }

        case 'customer.subscription.deleted': {
          try {
            const subscription = event.data.object as Stripe.Subscription
            const stripeCustomerId = subscription.customer as string

            const user = await db
              .select()
              .from(users)
              .where(eq(users.stripeCustomerId, stripeCustomerId))
              .then((rows) => rows[0])

            await db
              .update(users)
              .set({
                stripeSubscriptionId: null,
                stripeCurrentPeriodEnd: null,
                planId: null
              })
              .where(eq(users.id, user.id))
          } catch (error) {
            if (error instanceof RangeError) {
              console.error('[StripeWebhook][customer.subscription.deleted] RangeError: Invalid Date', error)
              return { success: false }
            }
            console.error('[StripeWebhook][customer.subscription.deleted] Error:', error)
            return { success: false }
          }
          break
        }

        case 'customer.subscription.trial_will_end': {
          try {
            const subscription = event.data.object as Stripe.Subscription
            const stripeCustomerId = subscription.customer as string
            const user = await db
              .select()
              .from(users)
              .where(eq(users.stripeCustomerId, stripeCustomerId))
              .then((rows) => rows[0])
            if (user && subscription.trial_end) {
              // Calcule le nombre de jours restants
              const now = new Date()
              const trialEnd = new Date(subscription.trial_end * 1000)
              const daysLeft = Math.max(1, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
              const emailTemplate = await emailTemplates.trialEnding(user.name, daysLeft)
              await sendEmail({
                to: user.email,
                ...emailTemplate
              })
            }
          } catch (error) {
            if (error instanceof RangeError) {
              console.error('[StripeWebhook][customer.subscription.trial_will_end] RangeError: Invalid Date', error)
              return { success: false }
            }
            console.error('[StripeWebhook][customer.subscription.trial_will_end] Error:', error)
            return { success: false }
          }
          break
        }
      }

      return { success: true }
    } catch (error) {
      console.error(error)
      return { success: false }
    }
  }}
