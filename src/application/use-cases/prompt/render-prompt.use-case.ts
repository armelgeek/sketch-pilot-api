import { IUseCase } from '@/domain/types'
import { PromptService, type PromptVariables } from '@/application/services/prompt.service'
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'
import type { PromptType } from '@/infrastructure/database/schema/prompt.schema'

type Params = {
  promptType: PromptType
  videoType?: string
  videoGenre?: string
  language?: string
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
