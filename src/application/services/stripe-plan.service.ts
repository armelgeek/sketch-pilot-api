import { stripe } from '@/infrastructure/config/stripe.config'

export class StripePlanService {
  async createPlan({
    name,
    prices,
    currency
  }: {
    name: string
    prices: { monthly: number; yearly: number }
    currency: string
  }) {
    // Crée un produit Stripe
    const product = await stripe.products.create({ name })
    // Crée le prix mensuel
    const priceMonthly = await stripe.prices.create({
      unit_amount: Math.round(prices.monthly * 100),
      currency,
      product: product.id,
      recurring: { interval: 'month' }
    })
    // Crée le prix annuel
    const priceYearly = await stripe.prices.create({
      unit_amount: Math.round(prices.yearly * 100),
      currency,
      product: product.id,
      recurring: { interval: 'year' }
    })
    return { productId: product.id, priceIdMonthly: priceMonthly.id, priceIdYearly: priceYearly.id }
  }

  async updatePlan({
    stripePriceIdMonthly,
    stripePriceIdYearly,
    name,
    prices,
    currency
  }: {
    stripePriceIdMonthly: string
    stripePriceIdYearly: string
    name: string
    prices: { monthly: number; yearly: number }
    currency: string
  }) {
    // Récupère le produit via le prix mensuel
    const priceMonthly = await stripe.prices.retrieve(stripePriceIdMonthly)
    const productId = typeof priceMonthly.product === 'string' ? priceMonthly.product : priceMonthly.product.id
    await stripe.products.update(productId, { name })
    // Crée les nouveaux prix
    const newPriceMonthly = await stripe.prices.create({
      unit_amount: Math.round(prices.monthly * 100),
      currency,
      product: productId,
      recurring: { interval: 'month' }
    })
    const newPriceYearly = await stripe.prices.create({
      unit_amount: Math.round(prices.yearly * 100),
      currency,
      product: productId,
      recurring: { interval: 'year' }
    })
    // Désactive les anciens prix
    await stripe.prices.update(stripePriceIdMonthly, { active: false })
    await stripe.prices.update(stripePriceIdYearly, { active: false })
    return { priceIdMonthly: newPriceMonthly.id, priceIdYearly: newPriceYearly.id }
  }

  async deletePlan(stripePriceIdMonthly: string, stripePriceIdYearly: string) {
    // Désactive les deux prix Stripe
    await stripe.prices.update(stripePriceIdMonthly, { active: false })
    await stripe.prices.update(stripePriceIdYearly, { active: false })
    // Désactive le produit associé (via le prix mensuel)
    const price = await stripe.prices.retrieve(stripePriceIdMonthly)
    if (typeof price.product === 'string') {
      await stripe.products.update(price.product, { active: false })
    }
    return true
  }
}
