import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'
import { subscriptionPlans } from '@/infrastructure/database/schema/subscription-plan.schema'

export class GetSubscriptionStatusUseCase extends IUseCase<{ userId: string }, any> {
  async execute({ userId }: { userId: string }): Promise<any> {
    try {
      const result = await db
        .select({
          isTrialActive: users.isTrialActive,
          trialStartDate: users.trialStartDate,
          trialEndDate: users.trialEndDate,
          trialCanceled: users.trialCanceled,
          stripeSubscriptionId: users.stripeSubscriptionId,
          stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
          subscriptionInterval: users.subscriptionInterval,
          plan: {
            title: subscriptionPlans.name,
            maxChildren: subscriptionPlans.childLimit,
            description: subscriptionPlans.description
          }
        })
        .from(users)
        .leftJoin(subscriptionPlans, eq(users.planId, subscriptionPlans.id))
        .where(eq(users.id, userId))
        .then((rows) => rows[0])

      if (!result) {
        throw new Error('No subscription data found for user')
      }

      // Compute isPaid, isCanceled and accessEndsAt
      const now = new Date()
      const gracePeriodMs = 24 * 60 * 60 * 1000 // 24h grace period

      let isPaid = false
      if (result.stripeCurrentPeriodEnd) {
        isPaid = result.stripeCurrentPeriodEnd.getTime() + gracePeriodMs > now.getTime()
      }

      let isCanceled = false
      const accessEndsAt = result.stripeCurrentPeriodEnd || result.trialEndDate

      if (result.trialCanceled && result.isTrialActive) {
        isCanceled = true
      } else if (!result.stripeSubscriptionId && result.stripeCurrentPeriodEnd) {
        // Stripe subscription canceled, access until end of paid period
        isCanceled = true
      }

      return {
        isTrialActive: result.isTrialActive,
        trialStartDate: result.trialStartDate,
        trialEndDate: result.trialEndDate,
        isCanceled,
        accessEndsAt,
        plan: {
          title: result.plan?.title || 'Free',
          description: result.plan?.description || '',
          benefits: [], // TODO: Add benefits if available in schema
          isPaid,
          interval: result.subscriptionInterval as 'month' | 'year' | null,
          isCanceled,
          accessEndsAt
        }
      }
    } catch (error) {
      console.error('[Get Stripe Status  Error]', error)
    }
  }}
