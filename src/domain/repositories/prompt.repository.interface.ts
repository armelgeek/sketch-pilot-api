import type { CreatePromptInput, Prompt, UpdatePromptInput } from '@/domain/models/prompt.model'
import type { PromptType } from '@/infrastructure/database/schema/prompt.schema'

export interface PromptFilters {
  promptType?: PromptType
  videoType?: string
  videoGenre?: string
  language?: string
  isActive?: boolean
  page?: number
  limit?: number
}

export interface PromptRepositoryInterface {
  findById: (id: string) => Promise<Prompt | null>
  findAll: (filters?: PromptFilters) => Promise<{ data: Prompt[]; total: number }>
  /**
   * Find the best-matching active prompt for the given lookup criteria.
   * Resolution order (most specific wins):
   *   1. promptType + videoType + videoGenre + language
   *   2. promptType + videoType + videoGenre
   *   3. promptType + videoType
   *   4. promptType + videoGenre
   *   5. promptType (fallback)
   */
  findBestMatch: (criteria: {
    promptType: PromptType
    videoType?: string
    videoGenre?: string
    language?: string
  }) => Promise<Prompt | null>
  create: (data: CreatePromptInput) => Promise<Prompt>
  update: (id: string, data: UpdatePromptInput) => Promise<Prompt | null>
  delete: (id: string) => Promise<boolean>
}
