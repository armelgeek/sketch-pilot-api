import { desc, eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { db } from '@/infrastructure/database/db'
import { subscriptionHistory, users } from '@/infrastructure/database/schema/schema'
import { subscriptionPlans } from '@/infrastructure/database/schema/subscription-plan.schema'

export type ParentSubscriptionHistory = {
  current: {
    plan: {
      id: string
      name: string
      prices: { monthly: number; yearly: number }
      currency: string
      discountPercent?: number
    }
    stripeSubscriptionId?: string
    stripeCurrentPeriodEnd?: Date
    isTrialActive?: boolean
    trialStartDate?: Date | null
    trialEndDate?: Date | null
    hasTrialUsed?: boolean
    isPaid?: boolean
    interval?: 'month' | 'year' | null
    isCanceled?: boolean
  } | null
  history: Array<{
    id: string
    amount: number
    currency: string
    status: string
    paidAt: Date
    plan: {
      id: string
      name: string
      prices: { monthly: number; yearly: number }
      currency: string
      discountPercent?: number
    } | null
    stripeInvoiceId?: string
  }>
}

type Params = { parentId: string }

type Response = {
  data: ParentSubscriptionHistory
  success: boolean
  error?: string
}

export class GetParentSubscriptionWithHistoryUseCase extends IUseCase<Params, Response> {
  async execute({ parentId }: Params): Promise<Response> {
    try {
      // Récupère l'utilisateur (parent)
      const userRows = await db.select().from(users).where(eq(users.id, parentId))
      const user = userRows[0]
      let current = null
      if (user && user.stripeSubscriptionId) {
        let plan: any = null
        if (user.planId) {
          const planRows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, user.planId))
          plan = planRows[0]
        }
        if (plan) {
          current = {
            plan: {
              id: plan.id,
              name: plan.name,
              prices: {
                monthly: Number(plan.priceMonthly),
                yearly: Number(plan.priceYearly)
              },
              currency: plan.currency,
              discountPercent: plan.discountPercent ? Number(plan.discountPercent) : undefined
            },
            stripeSubscriptionId: user.stripeSubscriptionId,
            stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd ?? undefined,
            isTrialActive: user.isTrialActive,
            trialStartDate: user.trialStartDate ?? undefined,
            trialEndDate: user.trialEndDate ?? undefined,
            hasTrialUsed: user.hasTrialUsed,
            isPaid: !!user.stripeSubscriptionId,
            interval: undefined, // à compléter si stocké
            isCanceled: undefined // à compléter si stocké
          }
        }
      }
      // Historique des paiements (subscriptionHistory)
      const historyRows = await db
        .select()
        .from(subscriptionHistory)
        .where(eq(subscriptionHistory.userId, parentId))
        .orderBy(desc(subscriptionHistory.timestamp))
      const history = await Promise.all(
        historyRows.map(async (h) => {
          let plan: any = null
          if (h.newPlan) {
            const planRows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, h.newPlan))
            plan = planRows[0]
          }
          return {
            id: h.id,
            action: h.action,
            oldPlan: h.oldPlan,
            newPlan: h.newPlan,
            amount: h.amount ? Number(h.amount) : 0,
            currency: h.currency || '',
            adjustmentType: h.adjustmentType || 'none',
            status: h.status,
            paidAt: h.timestamp,
            plan: plan
              ? {
                  id: plan.id,
                  name: plan.name,
                  prices: {
                    monthly: Number(plan.priceMonthly),
                    yearly: Number(plan.priceYearly)
                  },
                  currency: plan.currency,
                  discountPercent: plan.discountPercent ? Number(plan.discountPercent) : undefined
                }
              : null,
            stripeInvoiceId: undefined // à compléter si stocké
          }
        })
      )
      return { data: { current, history }, success: true }
    } catch (error: any) {
      return { success: false, error: error.message, data: { current: null, history: [] } }
    }
  }

  log(): ActivityType {
    return ActivityType.GET_SUBSCRIBE_STATUS
  }
}
