import { z } from 'zod'

export const TrialConfigSchema = z.object({
  id: z.string().uuid(),
  isEnabled: z.boolean(),
  durationInDays: z.number().min(0).max(365),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type TrialConfig = z.infer<typeof TrialConfigSchema>
