import { z } from 'zod'
import { PROMPT_TYPES } from '@/infrastructure/database/schema/prompt.schema'

export const PromptTypeSchema = z.enum(PROMPT_TYPES)

export const PromptSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  promptType: PromptTypeSchema,
  videoType: z.string().optional(),
  videoGenre: z.string().optional(),
  template: z.string().min(1),
  variables: z.array(z.string()).default([]),
  language: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type Prompt = z.infer<typeof PromptSchema>

export const CreatePromptSchema = PromptSchema.omit({ id: true, createdAt: true, updatedAt: true })
export type CreatePromptInput = z.infer<typeof CreatePromptSchema>

export const UpdatePromptSchema = CreatePromptSchema.partial()
export type UpdatePromptInput = z.infer<typeof UpdatePromptSchema>
