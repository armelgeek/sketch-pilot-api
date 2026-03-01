import { z } from 'zod'

export const VerificationCodeSchema = z.object({
  id: z.string(),
  code: z.string().length(6),
  childId: z.string(),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type VerificationCode = z.infer<typeof VerificationCodeSchema>
