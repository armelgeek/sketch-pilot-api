import { StripePlanService } from '@/application/services/stripe-plan.service'
import { IUseCase } from '@/domain/types/use-case.type'
import type { SubscriptionPlan } from '@/domain/models/subscription-plan.model'
import type { SubscriptionPlanRepositoryInterface } from '@/domain/repositories/subscription-plan.repository.interface'

type Params = Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>

type Response = {
  data: SubscriptionPlan
  success: boolean
  error?: string
}

export class CreateSubscriptionPlanUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: SubscriptionPlanRepositoryInterface) {
    super()
    this.stripeService = new StripePlanService()
  }

  private stripeService: StripePlanService

  async execute(params: Params): Promise<Response> {
    try {
      // Crée les deux prix Stripe (mensuel/annuel)
      const { priceIdMonthly, priceIdYearly } = await this.stripeService.createPlan({
        name: params.name,
        prices: { monthly: params.priceMonthly, yearly: params.priceYearly },
        currency: params.currency
      })
      const plan = await this.repository.create({
        ...params,
        stripeIds: { monthly: priceIdMonthly, yearly: priceIdYearly }
      })
      return { data: plan, success: true }
    } catch (error: any) {
      return { success: false, error: error.message, data: null as any }
    }
  }
}
