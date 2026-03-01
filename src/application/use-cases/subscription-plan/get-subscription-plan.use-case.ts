import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { SubscriptionPlan } from '@/domain/models/subscription-plan.model'
import type { SubscriptionPlanRepositoryInterface } from '@/domain/repositories/subscription-plan.repository.interface'

type Params = { id: string }

type Response = {
  data: SubscriptionPlan | null
  success: boolean
  error?: string
}

export class GetSubscriptionPlanUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: SubscriptionPlanRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const plan = await this.repository.findById(params.id)
      return { data: plan, success: true }
    } catch (error: any) {
      return { success: false, error: error.message, data: null }
    }
  }

  log(): ActivityType {
    return ActivityType.CHANGE_SUBSCRIPTION_PLAN
  }
}
