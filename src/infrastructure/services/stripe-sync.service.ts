import { stripe } from '../config/stripe.config'

export class StripeSyncService {
  /**
   * Helper to find or create a product by name
   */
  private async findOrCreateProduct(name: string) {
    const products = await stripe.products.list({ limit: 100, active: true })
    let product = products.data.find((p) => p.name.toLowerCase() === name.toLowerCase())

    if (!product) {
      product = await stripe.products.create({ name })
    } else if (product.name !== name) {
      await stripe.products.update(product.id, { name })
    }

    return product
  }

  /**
   * Helper to find or create a price for a product
   */
  private async findOrCreatePrice({
    productId,
    amount,
    currency,
    interval
  }: {
    productId: string
    amount: number
    currency: string
    interval?: 'month' | 'year'
  }) {
    const unitAmount = Math.round(amount * 100)

    // List existing active prices for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100
    })

    let price = prices.data.find(
      (p) =>
        p.unit_amount === unitAmount &&
        p.currency.toLowerCase() === currency.toLowerCase() &&
        (interval ? p.recurring?.interval === interval : !p.recurring)
    )

    if (!price) {
      price = await stripe.prices.create({
        unit_amount: unitAmount,
        currency,
        product: productId,
        ...(interval ? { recurring: { interval } } : {})
      })
    }

    return price
  }

  async createPlanSync({
    name,
    monthlyAmount,
    yearlyAmount,
    currency = 'usd'
  }: {
    name: string
    monthlyAmount: number
    yearlyAmount: number
    currency?: string
  }) {
    const product = await this.findOrCreateProduct(name)

    const priceMonthly = await this.findOrCreatePrice({
      productId: product.id,
      amount: monthlyAmount,
      currency,
      interval: 'month'
    })

    const priceYearly = await this.findOrCreatePrice({
      productId: product.id,
      amount: yearlyAmount,
      currency,
      interval: 'year'
    })

    return {
      productId: product.id,
      priceIdMonthly: priceMonthly.id,
      priceIdYearly: priceYearly.id
    }
  }

  async updatePlanSync({
    oldPriceIdMonthly,
    oldPriceIdYearly,
    name,
    monthlyAmount,
    yearlyAmount,
    currency = 'usd'
  }: {
    oldPriceIdMonthly?: string | null
    oldPriceIdYearly?: string | null
    name: string
    monthlyAmount: number
    yearlyAmount: number
    currency?: string
  }) {
    const product = await this.findOrCreateProduct(name)

    const newPriceMonthly = await this.findOrCreatePrice({
      productId: product.id,
      amount: monthlyAmount,
      currency,
      interval: 'month'
    })

    const newPriceYearly = await this.findOrCreatePrice({
      productId: product.id,
      amount: yearlyAmount,
      currency,
      interval: 'year'
    })

    // Optional: Deactivate old prices if they are different from new ones
    if (oldPriceIdMonthly && oldPriceIdMonthly !== newPriceMonthly.id) {
      try {
        await stripe.prices.update(oldPriceIdMonthly, { active: false })
      } catch {}
    }
    if (oldPriceIdYearly && oldPriceIdYearly !== newPriceYearly.id) {
      try {
        await stripe.prices.update(oldPriceIdYearly, { active: false })
      } catch {}
    }

    return {
      priceIdMonthly: newPriceMonthly.id,
      priceIdYearly: newPriceYearly.id
    }
  }

  async deletePlanSync(priceIdMonthly: string, priceIdYearly: string) {
    try {
      await stripe.prices.update(priceIdMonthly, { active: false })
    } catch {}
    try {
      await stripe.prices.update(priceIdYearly, { active: false })
    } catch {}

    const price = await stripe.prices.retrieve(priceIdMonthly)
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    await stripe.products.update(productId, { active: false })

    return true
  }

  async createPackSync({ name, amount, currency = 'usd' }: { name: string; amount: number; currency?: string }) {
    const product = await this.findOrCreateProduct(name)
    const price = await this.findOrCreatePrice({
      productId: product.id,
      amount,
      currency
    })

    return { productId: product.id, priceId: price.id }
  }

  async updatePackSync({
    oldPriceId,
    name,
    amount,
    currency = 'usd'
  }: {
    oldPriceId?: string | null
    name: string
    amount: number
    currency?: string
  }) {
    const product = await this.findOrCreateProduct(name)
    const newPrice = await this.findOrCreatePrice({
      productId: product.id,
      amount,
      currency
    })

    if (oldPriceId && oldPriceId !== newPrice.id) {
      try {
        await stripe.prices.update(oldPriceId, { active: false })
      } catch {}
    }

    return { priceId: newPrice.id }
  }

  async deletePackSync(priceId: string) {
    try {
      await stripe.prices.update(priceId, { active: false })
    } catch {}

    const price = await stripe.prices.retrieve(priceId)
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    await stripe.products.update(productId, { active: false })

    return true
  }
}

export const stripeSyncService = new StripeSyncService()
