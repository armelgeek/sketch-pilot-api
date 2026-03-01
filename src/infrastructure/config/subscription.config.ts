import type { SubscriptionPlan } from '@/domain/types/subscription.type'

export const pricingData: SubscriptionPlan[] = [
  {
    id: 1,
    title: 'Pro',
    description: 'Unlock Advanced Features',
    childLimit: 3,
    prices: {
      monthly: 9.99,
      yearly: 99.99
    },
    stripeIds: {
      monthly: 'price_1RL8UtGybU5KCr5wDLxG8upB',
      yearly: 'price_1RLUxOGybU5KCr5wWiFRyD6a'
    }
  }
]
