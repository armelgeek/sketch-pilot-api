import { IUseCase } from '@/domain/types'
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'

type Params = { id: string }
type Response = { success: boolean; error?: string }

export class DeletePromptUseCase extends IUseCase<Params, Response> {
  constructor(private readonly repository: PromptRepositoryInterface) {
    super()
  }

  async execute({ id }: Params): Promise<Response> {
    try {
      await this.repository.delete(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}
