import { SystemConfigService } from '@/application/services/system-config.service'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { Child } from '@/domain/models/child.model'
import type { ChildRepositoryInterface } from '@/domain/repositories/child.repository.interface'
import type { SubscriptionPlanRepositoryInterface } from '@/domain/repositories/subscription-plan.repository.interface'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

type Params = {
  firstname: string
  lastname: string
  birthday?: string
  avatarUrl?: string
  parentId: string
}

type Response = {
  data: Child
  success: boolean
  error?: string
}

export class CreateChildUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly childRepository: ChildRepositoryInterface,
    private readonly userRepository: UserRepositoryInterface,
    private readonly subscriptionPlanRepository: SubscriptionPlanRepositoryInterface
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const parent = (await this.userRepository.findById(params.parentId)) as any as { planId?: string }
    if (!parent) {
      throw new Error('Parent not found')
    }

    // Vérifier la configuration système
    const systemConfig = SystemConfigService.getInstance()
    const isSubscriptionEnabled = await systemConfig.isSubscriptionEnabled()

    // Si l'abonnement est activé, appliquer la limitation (ex: 3 enfants max)
    if (isSubscriptionEnabled) {
      const childrenCount = await this.childRepository.countByParentId(params.parentId)
      // Récupérer la limite d'enfants du plan du parent
      let maxChildren = 3 // valeur par défaut
      if (parent.planId) {
        const plan = await this.subscriptionPlanRepository.findById(parent.planId)
        if (plan && plan.childLimit) {
          maxChildren = plan.childLimit
        }
      }
      if (childrenCount >= maxChildren) {
        throw new Error('Maximum number of children reached for your plan')
      }
    }

    const child = await this.childRepository.save({
      id: crypto.randomUUID(),
      parentId: params.parentId,
      firstname: params.firstname,
      lastname: params.lastname,
      birthday: params.birthday ? new Date(params.birthday) : undefined,
      avatarUrl: params.avatarUrl,
      firstLogin: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    return {
      data: child,
      success: true
    }
  }

  log(): ActivityType {
    return ActivityType.CREATE_CHILD
  }
}
