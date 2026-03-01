import { z } from 'zod'

// eslint-disable-next-line unused-imports/no-unused-vars
const ModuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  coverUrl: z.string().url().optional(),
  description: z.string().optional(),
  position: z.number().int().nonnegative().optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type Module = z.infer<typeof ModuleSchema>
