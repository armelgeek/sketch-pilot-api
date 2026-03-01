import { StripePlanService } from '@/application/services/stripe-plan.service'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { SubscriptionPlanRepositoryInterface } from '@/domain/repositories/subscription-plan.repository.interface'

type Params = { id: string }

type Response = {
  success: boolean
  error?: string
}

export class DeleteSubscriptionPlanUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: SubscriptionPlanRepositoryInterface) {
    super()
    this.stripeService = new StripePlanService()
  }

  private stripeService: StripePlanService

  async execute(params: Params): Promise<Response> {
    try {
      // Récupère le plan pour obtenir les ids Stripe
      const plan = await this.repository.findById(params.id)
      if (plan && plan.stripeIds?.monthly && plan.stripeIds?.yearly) {
        await this.stripeService.deletePlan(plan.stripeIds.monthly, plan.stripeIds.yearly)
      }
      await this.repository.delete(params.id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  log(): ActivityType {
    return ActivityType.DELETE_PLAN
  }
}
