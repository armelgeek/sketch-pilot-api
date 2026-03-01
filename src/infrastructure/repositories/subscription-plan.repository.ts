import { eq } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { subscriptionPlans } from '@/infrastructure/database/schema/subscription-plan.schema'
import type { SubscriptionPlan } from '@/domain/models/subscription-plan.model'
import type { SubscriptionPlanRepositoryInterface } from '@/domain/repositories/subscription-plan.repository.interface'

export class SubscriptionPlanRepository implements SubscriptionPlanRepositoryInterface {
  async findById(id: string): Promise<SubscriptionPlan | null> {
    const result = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id))
    if (!result[0]) return null
    const plan = result[0]
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description || undefined,
      childLimit: plan.childLimit ? Number(plan.childLimit) : undefined,
      priceMonthly: Number(plan.priceMonthly),
      priceYearly: Number(plan.priceYearly),
      displayedYearly: Number(plan.displayedYearly),
      displayedMonthly: Number(plan.displayedMonthly),
      displayedYearlyBar: Number(plan.displayedYearlyBar),
      currency: plan.currency,
      stripeIds: {
        monthly: plan.stripePriceIdMonthly || undefined,
        yearly: plan.stripePriceIdYearly || undefined
      },
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    }
  }

  async findAll(pagination?: { skip: number; limit: number }): Promise<SubscriptionPlan[]> {
    const { skip = 0, limit = 20 } = pagination || {}
    const results = await db.select().from(subscriptionPlans).offset(skip).limit(limit)
    return results.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description || undefined,
      childLimit: plan.childLimit ? Number(plan.childLimit) : undefined,
      priceMonthly: Number(plan.priceMonthly),
      priceYearly: Number(plan.priceYearly),
      displayedYearly: Number(plan.displayedYearly),
      displayedMonthly: Number(plan.displayedMonthly),
      displayedYearlyBar: Number(plan.displayedYearlyBar),
      currency: plan.currency,
      stripeIds: {
        monthly: plan.stripePriceIdMonthly || undefined,
        yearly: plan.stripePriceIdYearly || undefined
      },
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    }))
  }

  async create(data: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<SubscriptionPlan> {
    const now = new Date()
    const id = crypto.randomUUID()
    await db.insert(subscriptionPlans).values({
      id,
      name: data.name,
      description: data.description,
      childLimit: data.childLimit !== undefined ? String(data.childLimit) : undefined,
      priceMonthly: String(data.priceMonthly),
      priceYearly: String(data.priceYearly),
      displayedYearly: String(data.displayedYearly),
      displayedMonthly: String(data.displayedMonthly),
      displayedYearlyBar: String(data.displayedYearlyBar),
      currency: data.currency,
      stripePriceIdMonthly: data.stripeIds?.monthly,
      stripePriceIdYearly: data.stripeIds?.yearly,
      createdAt: now,
      updatedAt: now
    })
    return (await this.findById(id)) as SubscriptionPlan
  }

  async update(
    id: string,
    data: Partial<Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<SubscriptionPlan> {
    const now = new Date()
    await db
      .update(subscriptionPlans)
      .set({
        name: data.name,
        description: data.description,
        childLimit: data.childLimit !== undefined ? String(data.childLimit) : undefined,
        priceMonthly: data.priceMonthly !== undefined ? String(data.priceMonthly) : undefined,
        priceYearly: data.priceYearly !== undefined ? String(data.priceYearly) : undefined,
        displayedYearly: data.displayedYearly !== undefined ? String(data.displayedYearly) : undefined,
        displayedMonthly: data.displayedMonthly !== undefined ? String(data.displayedMonthly) : undefined,
        displayedYearlyBar: data.displayedYearlyBar !== undefined ? String(data.displayedYearlyBar) : undefined,
        currency: data.currency,
        stripePriceIdMonthly: data.stripeIds?.monthly,
        stripePriceIdYearly: data.stripeIds?.yearly,
        updatedAt: now
      })
      .where(eq(subscriptionPlans.id, id))
    return (await this.findById(id)) as SubscriptionPlan
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id))
    return Array.isArray(result) ? result.length > 0 : true
  }
}
