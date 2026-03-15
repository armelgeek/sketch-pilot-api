import type { CreatePromptInput, Prompt, UpdatePromptInput } from '@/domain/models/prompt.model'
export interface PromptFilters {
  name?: string
  isActive?: boolean
  page?: number
  limit?: number
}

export interface PromptRepositoryInterface {
  findById: (id: string) => Promise<Prompt | null>
  findAll: (filters?: PromptFilters) => Promise<{ data: Prompt[]; total: number }>
  findBestMatch: (criteria: { id?: string; name?: string }) => Promise<Prompt | null>
  create: (data: CreatePromptInput) => Promise<Prompt>
  update: (id: string, data: UpdatePromptInput) => Promise<Prompt | null>
  delete: (id: string) => Promise<boolean>
}
