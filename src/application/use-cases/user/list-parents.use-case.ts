import { GetSubscriptionStatusUseCase } from '@/application/use-cases/subscription/get-subscription-status.use-case'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

interface Params {
  page?: number
  limit?: number
  search?: string
}

interface UserWithSubscriptionPlan {
  id: string
  name: string
  firstname?: string
  lastname?: string
  email: string
  emailVerified: boolean
  image?: string
  isAdmin: boolean
  childrenCount: number
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  subscriptionPlan: string
}

interface Response {
  success: boolean
  data: {
    users: UserWithSubscriptionPlan[]
    total: number
    page: number
    limit: number
  }
  error?: string
}

export class ListParentsUseCase extends IUseCase<Params, Response> {
  log(): ActivityType {
    return ActivityType.LIST_PARENTS
  }
  constructor(private readonly userRepository: UserRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const result = await this.userRepository.findPaginatedUsers({
        page: params.page,
        limit: params.limit,
        role: 'user',
        search: params.search
      })

      const getSubscriptionStatusUseCase = new GetSubscriptionStatusUseCase()

      const usersWithSubscriptionPlan = await Promise.all(
        result.users.map(async (user: any) => {
          let subscriptionPlan = 'Aucun'
          try {
            const sub = await getSubscriptionStatusUseCase.execute({ userId: user.id })
            const planName = sub.plan?.title
            subscriptionPlan = planName || 'Aucun'
          } catch {
            // fallback to 'Aucun' if error
          }
          return {
            ...user,
            subscriptionPlan
          }
        })
      )

      return {
        success: true,
        data: {
          users: usersWithSubscriptionPlan,
          total: result.total,
          page: result.page,
          limit: result.limit
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Internal server error',
        data: {
          users: [],
          total: 0,
          page: params.page || 1,
          limit: params.limit || 10
        }
      }
    }
  }
}
