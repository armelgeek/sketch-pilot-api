import { IUseCase } from '@/domain/types'
import type { Prompt } from '@/domain/models/prompt.model'
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'

type Params = { id: string }
type Response = { success: boolean; data: Prompt | null; error?: string }

export class GetPromptUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: PromptRepositoryInterface) {
    super()
  }

  async execute({ id }: Params): Promise<Response> {
    try {
      const prompt = await this.repository.findById(id)
      return { success: true, data: prompt }
    } catch (error: any) {
      return { success: false, data: null, error: error.message }
    }
  }
}
