import { IUseCase } from '@/domain/types'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { SystemConfigRepositoryInterface } from '@/domain/repositories/system-config.repository.interface'

type GetSystemConfigResponse = {
  success: boolean
  data: {
    isSubscriptionEnabled: boolean
  }
}

export class GetSystemConfigUseCase extends IUseCase<Record<string, never>, GetSystemConfigResponse> {
  constructor(private readonly systemConfigRepository: SystemConfigRepositoryInterface) {
    super()
  }

  async execute(): Promise<GetSystemConfigResponse> {
    const config = await this.systemConfigRepository.findConfig('isSubscriptionEnabled')
    if (!config) {
      return {
        success: false,
        data: { isSubscriptionEnabled: false }
      }
    }
    return {
      success: true,
      data: { isSubscriptionEnabled: config.isSubscriptionEnabled }
    }
  }

  log(): ActivityType {
    return ActivityType.GET_SYSTEM_CONFIG
  }
}
