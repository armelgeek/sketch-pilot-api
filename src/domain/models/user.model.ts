import { z } from 'zod'

export const User = z.object({
  id: z.string(),
  name: z.string(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().optional(),
  role: z.string().default('user'),
  isAdmin: z.boolean().default(false),
  banned: z.boolean().default(false),
  banReason: z.string().optional().nullable(),
  banExpires: z.date().optional().nullable(),
  lastLoginAt: z.date().nullable(),
  stripeCustomerId: z.string().optional(),
  defaultCharacterId: z.string().optional().nullable(),
  defaultPromptId: z.string().optional().nullable(),
  language: z.string().optional().default('fr-FR'),
  createdAt: z.date(),
  updatedAt: z.date()
})
