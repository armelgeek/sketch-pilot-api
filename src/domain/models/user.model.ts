import { z } from 'zod'

export const User = z.object({
  id: z.string(),
  name: z.string(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().optional(),
  isAdmin: z.boolean().default(false),
  lastLoginAt: z.date().nullable(),
  isTrialActive: z.boolean().default(false),
  hasTrialUsed: z.boolean().default(false),
  trialStartDate: z.date().optional(),
  trialEndDate: z.date().optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  stripePriceId: z.string().optional(),
  stripeCurrentPeriodEnd: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
})
