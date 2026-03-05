import { eq } from 'drizzle-orm'

import { IUseCase } from '@/domain/types'
import { stripe } from '@/infrastructure/config/stripe.config'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'
import { subscriptionPlans } from '@/infrastructure/database/schema/subscription-plan.schema'

type CreateSubscriptionParams = {
  userId: string
  planId: string
  interval: 'month' | 'year'
  successUrl: string
  cancelUrl: string
  trialEnabled: boolean
  trialDuration: number
}

type CreateSubscriptionResponse = {
  success: boolean
  sessionId?: string
  paymentUrl?: string
  error?: string
}

export class CreateSubscriptionUseCase extends IUseCase<CreateSubscriptionParams, CreateSubscriptionResponse> {
  async execute({
    userId,
    planId,
    interval,
    successUrl,
    cancelUrl,
    trialEnabled,
    trialDuration
  }: CreateSubscriptionParams): Promise<CreateSubscriptionResponse> {
    try {
      // 1. Récupérer les données utilisateur
      const userData = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .then((rows) => rows[0])

      if (!userData) {
        return { success: false, error: 'User not found' }
      }

      // 2. Gérer le customer Stripe
      let customerId = userData.stripeCustomerId
      let customerValid = false

      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId)
          customerValid = true
        } catch (error: any) {
          if (error?.code === 'resource_missing' || error?.raw?.code === 'resource_missing') {
            customerValid = false
          } else {
            return { success: false, error: error.message || 'Stripe error' }
          }
        }
      }

      if (!customerId || !customerValid) {
        const customer = await stripe.customers.create({
          email: userData.email,
          name: userData.name
        })
        customerId = customer.id
        await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId))
      }

      // 3. Récupérer le plan et le prix approprié
      const plan = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .then((rows) => rows[0])

      if (!plan) {
        return { success: false, error: 'Subscription plan not found' }
      }

      // Sélectionner le bon priceId selon l'intervalle
      const priceId = interval === 'month' ? plan.stripePriceIdMonthly : plan.stripePriceIdYearly

      if (!priceId) {
        return { success: false, error: `No ${interval}ly price configured for this plan` }
      }

      // 4. Gérer la réactivation si un abonnement existe déjà
      if (userData.stripeSubscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId)

          // Si l'abonnement est actif ou en essai mais annulé, on le réactive
          if (
            (subscription.status === 'active' || subscription.status === 'trialing') &&
            subscription.cancel_at_period_end
          ) {
            console.info(
              `[CreateSubscription] Reactivating canceled subscription ${subscription.id} for user ${userId}`
            )

            const updateParams: any = {
              cancel_at_period_end: false,
              proration_behavior: 'create_prorations'
            }

            // Si le plan ou l'intervalle a changé, on met à jour l'item
            const currentPriceId = subscription.items.data[0].price.id
            if (currentPriceId !== priceId) {
              updateParams.items = [
                {
                  id: subscription.items.data[0].id,
                  price: priceId,
                  quantity: 1
                }
              ]
            }

            await stripe.subscriptions.update(subscription.id, updateParams)

            // Mettre à jour le planId en base
            await db.update(users).set({ planId: plan.id }).where(eq(users.id, userId))

            return {
              success: true,
              paymentUrl: successUrl // Redirection directe vers le succès car déjà payé/actif
            }
          }
        } catch (error) {
          console.warn(
            `[CreateSubscription] Could not retrieve/reactivate subscription ${userData.stripeSubscriptionId}:`,
            error
          )
          // On continue pour créer une nouvelle session si la réactivation échoue
        }
      }

      // 5. Calculer la période d'essai
      const trialDays = this.calculateTrialDays(userData, trialEnabled, trialDuration)

      // 5. Créer la session Stripe Checkout
      const sessionConfig: any = {
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1 // ✅ Toujours 1 pour les abonnements
          }
        ],
        metadata: {
          userId,
          planId: plan.id,
          interval
        },
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl
      }

      // Ajouter l'essai seulement s'il y en a un
      if (trialDays > 0) {
        console.info(`[CreateSubscription] Adding trial period: ${trialDays} days for user ${userId}`)
        sessionConfig.subscription_data = {
          trial_period_days: trialDays
        }

        // Validation : Stripe accepte entre 1 et 365 jours
        if (trialDays < 1 || trialDays > 365) {
          console.error(`[CreateSubscription] Invalid trial duration: ${trialDays} days`)
          return { success: false, error: 'Invalid trial duration' }
        }
      } else {
        console.info(`[CreateSubscription] No trial period for user ${userId}`)
      }

      const session = await stripe.checkout.sessions.create(sessionConfig)

      return {
        success: true,
        sessionId: session.id,
        paymentUrl: session.url ?? undefined
      }
    } catch (error) {
      console.error('[Stripe Checkout Error]', error)
      return { success: false, error: 'Error occurred creating subscription' }
    }
  }

  /**
   * Calcule les jours d'essai selon la logique métier
   */
  private calculateTrialDays(userData: any, trialEnabled: boolean, trialDuration: number): number {
    console.info(
      `[CreateSubscription] Calculating trial days - enabled: ${trialEnabled}, duration: ${trialDuration}, hasTrialUsed: ${userData.hasTrialUsed}, isTrialActive: ${userData.isTrialActive}`
    )

    // Si l'utilisateur a déjà utilisé son essai, pas d'essai
    if (userData.hasTrialUsed) {
      console.info('[CreateSubscription] Trial already used, no trial period')
      return 0
    }

    // Si l'essai n'est pas activé pour cette souscription, pas d'essai
    if (!trialEnabled || trialDuration <= 0) {
      console.info('[CreateSubscription] Trial not enabled or invalid duration')
      return 0
    }

    // Si l'utilisateur a déjà un essai actif, utiliser le temps restant
    if (userData.isTrialActive && userData.trialEndDate && userData.trialEndDate > new Date()) {
      const remainingDays = Math.ceil((userData.trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      const adjustedDays = Math.max(0, remainingDays)
      console.info(`[CreateSubscription] Trial active, remaining days: ${adjustedDays}`)
      return adjustedDays
    }

    // Sinon, utiliser la durée d'essai configurée
    console.info(`[CreateSubscription] Using configured trial duration: ${trialDuration} days`)
    return trialDuration
  }
}
