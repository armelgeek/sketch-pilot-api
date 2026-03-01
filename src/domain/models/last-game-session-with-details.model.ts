import { z } from 'zod'

export const LastGameSessionWithDetailsSchema = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  startedAt: z.date(),
  endedAt: z.date().optional(),
  success: z.boolean().optional(),
  status: z.enum(['in_progress', 'completed', 'blocked', 'abandoned']),
  sessionDate: z.date().optional(),
  totalTime: z.number().optional(), // Temps total en minutes
  game: z.object({
    id: z.string().uuid(),
    title: z.string(),
    coverUrl: z.string().optional()
  }),
  lesson: z.object({
    id: z.string().uuid(),
    title: z.string(),
    order: z.number()
  }),
  module: z.object({
    id: z.string().uuid(),
    name: z.string(),
    coverUrl: z.string().optional()
  }),
  duration: z.number().optional(), // Durée de la session en secondes
  createdAt: z.date(),
  updatedAt: z.date()
})

export type LastGameSessionWithDetails = z.infer<typeof LastGameSessionWithDetailsSchema>
