import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { stripe } from '@/infrastructure/config/stripe.config'
import { db } from '@/infrastructure/database/db'
import { subscriptionHistory, users } from '@/infrastructure/database/schema'

type Params = {
  userId: string
}

type Response = {
  success: boolean
  error?: string
}

export class CancelSubscriptionUseCase extends IUseCase<Params, Response> {
  async execute({ userId }: Params): Promise<Response> {
    try {
      const userData = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .then((rows) => rows[0])

      if (!userData) {
        return { success: false, error: 'User not found' }
      }

      const subscriptionId = userData.stripeSubscriptionId
      // If user is in trial and has no Stripe subscription, allow trial cancellation
      if (!subscriptionId && userData.isTrialActive) {
        // Annulation différée du trial : flag trialCanceled, accès premium maintenu jusqu'à trialEndDate
        await db
          .update(users)
          .set({
            trialCanceled: true
          })
          .where(eq(users.id, userId))
        // Add history record
        await db.insert(subscriptionHistory).values({
          id: crypto.randomUUID(),
          userId,
          action: 'trial_canceled',
          oldPlan: 'trial',
          newPlan: null,
          amount: null,
          currency: null,
          status: 'canceled',
          timestamp: new Date()
        })
        return { success: true }
      }

      if (!subscriptionId) {
        return { success: false, error: 'No active subscription found for the user' }
      }

      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      })
      // NOTE: We do NOT clear stripeSubscriptionId here.
      // The user should keep access until the end of the period.
      // The customer.subscription.deleted webhook will handle clearing it.
      // Add history record for paid subscription cancellation
      await db.insert(subscriptionHistory).values({
        id: crypto.randomUUID(),
        userId,
        action: 'subscription_canceled',
        oldPlan: userData.planId,
        newPlan: null,
        amount: null,
        currency: null,
        status: 'canceled',
        timestamp: new Date()
      })
      return { success: true }
    } catch (error) {
      console.error('[Cancel Subscription Error]', error)
      return { success: false, error: 'Error cancelling subscription' }
    }
  }

  log(): ActivityType {
    return ActivityType.CANCEL_SUBSCRIPTION
  }
}
