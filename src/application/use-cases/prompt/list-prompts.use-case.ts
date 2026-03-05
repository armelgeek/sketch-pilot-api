import { IUseCase } from '@/domain/types'
import type { Prompt } from '@/domain/models/prompt.model'
import type { PromptFilters, PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'

type Params = PromptFilters
type Response = { success: boolean; data: Prompt[]; total: number; error?: string }

export class ListPromptsUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: PromptRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const { data, total } = await this.repository.findAll(params)
      return { success: true, data, total }
    } catch (error: any) {
      return { success: false, data: [], total: 0, error: error.message }
    }
  }
}
