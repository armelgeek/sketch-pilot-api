import { IUseCase } from '@/domain/types/use-case.type'
import type { TrialConfig } from '@/domain/models/trial-config.model'
import type { TrialConfigRepositoryInterface } from '@/domain/repositories/trial-config.repository.interface'

type Response = {
  success: boolean
  data: TrialConfig | null
  error?: string
}

export class GetTrialConfigUseCase extends IUseCase<any, Response> {
  constructor(private readonly trialConfigRepository: TrialConfigRepositoryInterface) {
    super()
  }

  async execute(): Promise<Response> {
    try {
      const config = await this.trialConfigRepository.getConfig()
      return {
        success: true,
        data: config
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message
      }
    }
  }
}
