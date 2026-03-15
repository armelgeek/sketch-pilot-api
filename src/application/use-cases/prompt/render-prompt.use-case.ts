import { PromptService, type PromptVariables } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'
type Params = {
  name?: string
  variables?: PromptVariables
  fallback?: string
}

type Response = { success: boolean; rendered: string | null; error?: string }

export class RenderPromptUseCase extends IUseCase<Params, Response> {
  private readonly promptService: PromptService

  constructor(repository: PromptRepositoryInterface) {
    super()
    this.promptService = new PromptService(repository)
  }

  async execute(params: Params): Promise<Response> {
    try {
      const rendered = await this.promptService.resolve(params)
      return { success: true, rendered }
    } catch (error: any) {
      return { success: false, rendered: null, error: error.message }
    }
  }
}
