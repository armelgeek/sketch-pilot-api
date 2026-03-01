import { z } from 'zod'

export const Children = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid(),
  firstname: z.string().min(2),
  lastname: z.string().min(2).optional(),
  birthday: z.date().optional(),
  avatarUrl: z.string().url().optional(),
  firstLogin: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type Child = z.infer<typeof Children>
