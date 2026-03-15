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
  rules: z.array(z.string()),
  formatting: z.string(),
  outputFormat: z.string(),
  instructions: z.array(z.string()),
  assetSystemInstruction: z.string().optional(),
  assetPromptTemplate: z.string().optional(),
  wordsPerSecondBase: z.number().optional(),
  wordsPerSecondFactors: z.record(z.number()).optional(),
  defaultFontSize: z.number().optional(),
  defaultFontFamily: z.string().optional(),
  defaultBackgroundPrompt: z.string().optional(),
  defaultPoseId: z.string().optional(),
  defaultPoseScale: z.number().optional(),
  defaultPosePosition: z.string().optional()
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
