import { z } from 'zod'

export const VideoTypeSpecificationSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  role: z.string(),
  context: z.string(),
  audienceDefault: z.string(),
  task: z.string(),
  goals: z.array(z.string()),
  structure: z.string(),
  rules: z.array(z.string()).optional(),
  formatting: z.string().optional(),
  instructions: z.array(z.string()).optional(),
  characterDescription: z.string().optional(),
  scenePresets: z.record(z.any()).optional(),
  visualRules: z.array(z.string()).optional(),
  orchestration: z.array(z.string()).optional()
})

export const PromptSchema = VideoTypeSpecificationSchema.extend({
  id: z.string().uuid(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type Prompt = z.infer<typeof PromptSchema>

export const CreatePromptSchema = PromptSchema.omit({ id: true, createdAt: true, updatedAt: true })
export type CreatePromptInput = z.infer<typeof CreatePromptSchema>

export const UpdatePromptSchema = CreatePromptSchema.partial()
export type UpdatePromptInput = z.infer<typeof UpdatePromptSchema>
