import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { SubscriptionPlan } from '@/domain/models/subscription-plan.model'
import type { SubscriptionPlanRepositoryInterface } from '@/domain/repositories/subscription-plan.repository.interface'

type Params = { skip?: number; limit?: number }

type Response = {
  data: SubscriptionPlan[]
  success: boolean
  error?: string
}

export class ListSubscriptionPlansUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: SubscriptionPlanRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const plans = await this.repository.findAll({
        skip: params.skip ?? 0,
        limit: params.limit ?? 20
      })
      return { data: plans, success: true }
    } catch (error: any) {
      return { success: false, error: error.message, data: [] }
    }
  }

  log(): ActivityType {
    return ActivityType.LIST_SUBSCRIPTION_PLAN
  }
}
