export type SubscriptionPlan = {
  id: string | number
  title: string
  description: string
  childLimit: number
  prices: {
    monthly: number
    yearly: number
  }
  stripeIds: {
    monthly: string | null
    yearly: string | null
  }
}

export type UserSubscriptionPlan = SubscriptionPlan & {
  stripeCurrentPeriodEnd: number
  isTrialActive: boolean
  trialStartDate: string | null
  trialEndDate: string | null
  hasTrialUsed: boolean
  isPaid: boolean
  interval: 'month' | 'year' | null
  isCanceled?: boolean
}
