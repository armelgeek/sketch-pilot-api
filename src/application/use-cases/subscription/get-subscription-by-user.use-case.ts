import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types'
import { stripe } from '@/infrastructure/config/stripe.config'
import { pricingData } from '@/infrastructure/config/subscription.config'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'

export interface GetUserSubscriptionByUserArgs {
  userId: string
}

export class GetUserSubscriptionByUserUseCase extends IUseCase<GetUserSubscriptionByUserArgs, any> {
  async execute({ userId }: GetUserSubscriptionByUserArgs): Promise<any> {
    if (!userId) throw new Error('Missing parameters')

    const [user] = await db
      .select({
        isTrialActive: users.isTrialActive,
        trialStartDate: users.trialStartDate,
        trialEndDate: users.trialEndDate,
        stripeSubscriptionId: users.stripeSubscriptionId,
        stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
        subscriptionInterval: users.subscriptionInterval,
        stripeCustomerId: users.stripeCustomerId,
        stripePriceId: users.planId,
        hasTrialUsed: users.hasTrialUsed
      })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      throw new Error('User not found')
    }

    const isPaid =
      user.stripePriceId &&
      user.stripeCurrentPeriodEnd &&
      user.stripeCurrentPeriodEnd.getTime() + 86_400_000 > Date.now()

    if (!isPaid && !user.isTrialActive) {
      throw new Error('Subscription required')
    }

    const userPlan =
      pricingData.find((plan) => plan.stripeIds.monthly === user.stripePriceId) ||
      pricingData.find((plan) => plan.stripeIds.yearly === user.stripePriceId)

    if (isPaid && !userPlan) {
      throw new Error('Invalid subscription plan')
    }

    const plan = userPlan || pricingData[0]

    const interval = (user.subscriptionInterval as 'month' | 'year' | null) || null

    let isCanceled = false
    if (isPaid && user.stripeSubscriptionId) {
      const stripePlan = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
      isCanceled = stripePlan.cancel_at_period_end
    }

    return {
      ...plan,
      stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd?.getTime(),
      isTrialActive: user.isTrialActive,
      trialStartDate: user.trialStartDate,
      trialEndDate: user.trialEndDate,
      hasTrialUsed: user.hasTrialUsed,
      isPaid,
      interval,
      isCanceled
    }
  }
}
