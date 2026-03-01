import { z } from 'zod'

// eslint-disable-next-line unused-imports/no-unused-vars
const LessonSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  content: z.string().optional(),
  moduleId: z.string().uuid(),
  order: z.number().int().min(1),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type Lesson = z.infer<typeof LessonSchema>
