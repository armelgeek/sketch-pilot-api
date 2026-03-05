import { IUseCase } from '@/domain/types'
import type { Prompt, UpdatePromptInput } from '@/domain/models/prompt.model'
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'

type Params = { id: string } & UpdatePromptInput
type Response = { success: boolean; data: Prompt | null; error?: string }

export class UpdatePromptUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: PromptRepositoryInterface) {
    super()
  }

  async execute({ id, ...data }: Params): Promise<Response> {
    try {
      const prompt = await this.repository.update(id, data)
      if (!prompt) return { success: false, data: null, error: 'Prompt not found' }
      return { success: true, data: prompt }
    } catch (error: any) {
      return { success: false, data: null, error: error.message }
    }
  }
}
