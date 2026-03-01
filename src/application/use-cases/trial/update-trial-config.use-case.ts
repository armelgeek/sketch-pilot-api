import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { TrialConfig } from '@/domain/models/trial-config.model'
import type { TrialConfigRepositoryInterface } from '@/domain/repositories/trial-config.repository.interface'

type Params = {
  isEnabled: boolean
  durationInDays: number
}

type Response = {
  success: boolean
  data: TrialConfig | null
  error?: string
}

export class UpdateTrialConfigUseCase extends IUseCase<Params, Response> {
  constructor(private readonly trialConfigRepository: TrialConfigRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      // Validation des paramètres
      if (params.durationInDays < 0 || params.durationInDays > 365) {
        return {
          success: false,
          data: null,
          error: "La durée d'essai doit être comprise entre 0 et 365 jours"
        }
      }

      const config = await this.trialConfigRepository.updateConfig({
        isEnabled: params.isEnabled,
        durationInDays: params.durationInDays
      })

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

  log(): ActivityType {
    return ActivityType.UPDATE_TRIAL_CONFIG
  }
}
