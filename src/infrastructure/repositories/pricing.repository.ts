import { eq } from 'drizzle-orm'
import { stripe } from '../config/stripe.config'
import { db } from '../database/db'
import { creditPacks, subscriptionPlans } from '../database/schema'
import { stripeSyncService } from '../services/stripe-sync.service'

export class PricingRepository {
  private slugify(text: string) {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replaceAll(/\s+/g, '-')
      .replaceAll(/[^\w-]+/g, '')
      .replaceAll(/-{2,}/g, '-')
  }

  async getStripePrices() {
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
      limit: 100
    })

    return prices.data.map((price) => {
      const product = price.product as any
      return {
        id: price.id,
        productId: product.id,
        productName: product.name,
        amount: price.unit_amount ? (price.unit_amount / 100).toFixed(2) : '0.00',
        currency: price.currency,
        type: price.type,
        interval: price.recurring?.interval || null
      }
    })
  }
  getPlans() {
    return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.monthlyLimit)
  }

  async getPlanById(id: string) {
    const results = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id))
    return results[0] || null
  }

  getCreditPacks() {
    return db.select().from(creditPacks).orderBy(creditPacks.credits)
  }

  async getCreditPackById(id: string) {
    const results = await db.select().from(creditPacks).where(eq(creditPacks.id, id))
    return results[0] || null
  }

  async createPlan(data: any) {
    if (!data.id && data.name) {
      data.id = this.slugify(data.name)
    }

    // Always sync with Stripe
    const stripeData = await stripeSyncService.createPlanSync({
      name: data.name,
      monthlyAmount: Number(data.priceMonthlyAmount),
      yearlyAmount: Number(data.priceYearlyAmount),
      currency: data.currency || 'usd'
    })

    data.priceMonthlyId = stripeData.priceIdMonthly
    data.priceYearlyId = stripeData.priceIdYearly

    const results = await db.insert(subscriptionPlans).values(data).returning()
    return results[0]
  }

  async updatePlan(id: string, data: any) {
    const current = await this.getPlanById(id)
    if (!current) throw new Error('Plan not found')

    // Always sync with Stripe (service handles reuse)
    const stripeData = await stripeSyncService.updatePlanSync({
      oldPriceIdMonthly: current.priceMonthlyId,
      oldPriceIdYearly: current.priceYearlyId,
      name: data.name || current.name,
      monthlyAmount: Number(data.priceMonthlyAmount || current.priceMonthlyAmount),
      yearlyAmount: Number(data.priceYearlyAmount || current.priceYearlyAmount),
      currency: data.currency || current.currency || 'usd'
    })

    data.priceMonthlyId = stripeData.priceIdMonthly
    data.priceYearlyId = stripeData.priceIdYearly

    const results = await db.update(subscriptionPlans).set(data).where(eq(subscriptionPlans.id, id)).returning()
    return results[0]
  }

  async deletePlan(id: string) {
    const current = await this.getPlanById(id)
    if (current?.priceMonthlyId && current.priceYearlyId) {
      await stripeSyncService.deletePlanSync(current.priceMonthlyId, current.priceYearlyId)
    }
    return db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id))
  }

  async createCreditPack(data: any) {
    if (!data.id && data.name) {
      data.id = this.slugify(data.name)
    }

    // Always sync with Stripe
    const stripeData = await stripeSyncService.createPackSync({
      name: data.name,
      amount: Number(data.priceAmount),
      currency: data.currency || 'usd'
    })

    data.stripePriceId = stripeData.priceId

    const results = await db.insert(creditPacks).values(data).returning()
    return results[0]
  }

  async updateCreditPack(id: string, data: any) {
    const current = await this.getCreditPackById(id)
    if (!current) throw new Error('Pack not found')

    // Always sync with Stripe
    const stripeData = await stripeSyncService.updatePackSync({
      oldPriceId: current.stripePriceId,
      name: data.name || current.name,
      amount: Number(data.priceAmount || current.priceAmount),
      currency: data.currency || current.currency || 'usd'
    })

    data.stripePriceId = stripeData.priceId

    const results = await db.update(creditPacks).set(data).where(eq(creditPacks.id, id)).returning()
    return results[0]
  }

  async deleteCreditPack(id: string) {
    const current = await this.getCreditPackById(id)
    if (current?.stripePriceId) {
      await stripeSyncService.deletePackSync(current.stripePriceId)
    }
    await db.delete(creditPacks).where(eq(creditPacks.id, id))
  }
}
