import { StripePlanService } from '@/application/services/stripe-plan.service'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { SubscriptionPlan } from '@/domain/models/subscription-plan.model'
import type { SubscriptionPlanRepositoryInterface } from '@/domain/repositories/subscription-plan.repository.interface'

type Params = { id: string } & Partial<Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>>

type Response = {
  data: SubscriptionPlan
  success: boolean
  error?: string
}

export class UpdateSubscriptionPlanUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: SubscriptionPlanRepositoryInterface) {
    super()
    this.stripeService = new StripePlanService()
  }

  private stripeService: StripePlanService

  async execute(params: Params): Promise<Response> {
    try {
      const { id, ...updateData } = params
      // Récupère le plan existant
      const current = await this.repository.findById(id)
      if (!current || !current.stripeIds?.monthly || !current.stripeIds?.yearly)
        throw new Error('Plan Stripe introuvable')
      const { priceIdMonthly, priceIdYearly } = await this.stripeService.updatePlan({
        stripePriceIdMonthly: current.stripeIds.monthly,
        stripePriceIdYearly: current.stripeIds.yearly,
        name: updateData.name ?? current.name,
        prices: {
          monthly: updateData.priceMonthly ?? current.priceMonthly,
          yearly: updateData.priceYearly ?? current.priceYearly
        },
        currency: updateData.currency ?? current.currency
      })
      // Met à jour la base avec les nouveaux ids Stripe
      const plan = await this.repository.update(id, {
        ...updateData,
        stripeIds: { monthly: priceIdMonthly, yearly: priceIdYearly }
      })
      return { data: plan, success: true }
    } catch (error: any) {
      return { success: false, error: error.message, data: null as any }
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_PLAN
  }
}
