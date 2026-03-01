import type { SubscriptionPlan } from '../models/subscription-plan.model'

export interface SubscriptionPlanRepositoryInterface {
  findById: (id: string) => Promise<SubscriptionPlan | null>
  findAll: (pagination?: { skip: number; limit: number }) => Promise<SubscriptionPlan[]>
  create: (data: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SubscriptionPlan>
  update: (
    id: string,
    data: Partial<Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>>
  ) => Promise<SubscriptionPlan>
  delete: (id: string) => Promise<boolean>
}
