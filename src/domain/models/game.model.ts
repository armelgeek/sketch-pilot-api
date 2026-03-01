import { z } from 'zod'
import { ExtractionStatus } from '../enums/extraction-status.enum'

// eslint-disable-next-line unused-imports/no-unused-vars
const GameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  file: z.string().optional(),
  coverUrl: z.string().optional(),
  position: z.number().int().nonnegative().optional(),
  lessonId: z.string().uuid(),
  extractionStatus: z.nativeEnum(ExtractionStatus).default(ExtractionStatus.PENDING),
  extractionError: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type Game = z.infer<typeof GameSchema>
