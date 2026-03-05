import { IUseCase } from '@/domain/types'
import type { SystemConfigInterface } from '@/application/services/system-config.service'
import type { SystemConfigRepositoryInterface } from '@/domain/repositories/system-config.repository.interface'

type UpdateSystemConfigParams = Partial<SystemConfigInterface>

type UpdateSystemConfigResponse = {
  success: boolean
  data: SystemConfigInterface
}

export class UpdateSystemConfigUseCase extends IUseCase<UpdateSystemConfigParams, UpdateSystemConfigResponse> {
  constructor(private readonly systemConfigRepository: SystemConfigRepositoryInterface) {
    super()
  }

  async execute(params: UpdateSystemConfigParams): Promise<UpdateSystemConfigResponse> {
    if (typeof params.isSubscriptionEnabled !== 'boolean') {
      throw new TypeError('Missing isSubscriptionEnabled')
    }
    const updated = await this.systemConfigRepository.updateConfig(
      'isSubscriptionEnabled',
      params.isSubscriptionEnabled ? 'true' : 'false'
    )
    return {
      success: true,
      data: updated
    }
  }
}
