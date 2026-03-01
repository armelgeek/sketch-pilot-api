import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { AssistantOpenAIService } from '@/application/services/assistant-openai.service'

type Params = {
  game: string
  eventType: string
  context: Record<string, unknown>
  lang?: string
  persona?: string
}

type Response = {
  success: boolean
  lines?: string[]
  error?: string
}

export class AssistantMessageUseCase extends IUseCase<Params, Response> {
  constructor(private readonly openaiService: AssistantOpenAIService) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const lines = await this.openaiService.generateMessage(params)
      return { success: true, lines }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  log(): ActivityType {
    return ActivityType.TEST
  }
}
