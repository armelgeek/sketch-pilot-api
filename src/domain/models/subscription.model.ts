import { z } from 'zod'

export const SubscriptionPlanLegacySchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  description: z.string(),
  prices: z.object({
    monthly: z.number(),
    yearly: z.number()
  }),
  stripeIds: z.object({
    monthly: z.string().nullable(),
    yearly: z.string().nullable()
  })
})

export type SubscriptionPlanLegacy = z.infer<typeof SubscriptionPlanLegacySchema>

export interface UserSubscription {
  plan: string | null
  status: string | null
  isPaid: boolean
  interval: string | null
  isCanceled: boolean
  periodEnd: string | null
}
