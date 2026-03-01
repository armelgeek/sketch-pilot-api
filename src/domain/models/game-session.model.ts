import { z } from 'zod'

const GameSessionStatusSchema = z.enum(['in_progress', 'completed', 'blocked', 'abandoned'])

// eslint-disable-next-line unused-imports/no-unused-vars
const GameSessionSchema = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  gameId: z.string().uuid(),
  startedAt: z.date(),
  endedAt: z.date().optional(),
  success: z.boolean().optional(),
  status: GameSessionStatusSchema,
  sessionDate: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  duration: z.number().optional()
})

export type GameSession = z.infer<typeof GameSessionSchema>
export type GameSessionStatus = z.infer<typeof GameSessionStatusSchema>
