import { IUseCase } from '@/domain/types'
import type { Prompt, CreatePromptInput } from '@/domain/models/prompt.model'
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'

type Params = CreatePromptInput
type Response = { success: boolean; data: Prompt | null; error?: string }

export class CreatePromptUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: PromptRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const prompt = await this.repository.create(params)
      return { success: true, data: prompt }
    } catch (error: any) {
      return { success: false, data: null, error: error.message }
    }
  }
}
