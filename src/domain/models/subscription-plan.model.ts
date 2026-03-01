import { z } from 'zod'

export const SubscriptionPlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  childLimit: z.number().int().positive().optional(),
  priceMonthly: z.number().nonnegative(),
  priceYearly: z.number().nonnegative(),
  displayedYearly: z.number().nonnegative(),
  displayedMonthly: z.number().nonnegative(),
  displayedYearlyBar: z.number().nonnegative(),
  currency: z.string().min(1),
  stripeIds: z.object({
    monthly: z.string().optional(),
    yearly: z.string().optional()
  }),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>
