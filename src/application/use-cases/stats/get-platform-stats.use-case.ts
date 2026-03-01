import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { GameSessionRepository } from '@/infrastructure/repositories/game-session.repository'
import { GameRepository } from '@/infrastructure/repositories/game.repository'
import { ModuleRepository } from '@/infrastructure/repositories/module.repository'
import { SubscriptionPlanRepository } from '@/infrastructure/repositories/subscription-plan.repository'
import { UserRepository } from '@/infrastructure/repositories/user.repository'

export class GetPlatformStatsUseCase extends IUseCase<{ startDate?: Date; endDate?: Date }, any> {
  constructor(
    private readonly moduleRepository = new ModuleRepository(),
    private readonly subscriptionPlanRepository = new SubscriptionPlanRepository(),
    private readonly gameRepository = new GameRepository(),
    private readonly gameSessionRepository = new GameSessionRepository(),
    private readonly userRepository = new UserRepository()
  ) {
    super()
  }

  async execute(params: { startDate?: Date; endDate?: Date } = {}): Promise<any> {
    const { startDate, endDate } = params
    const modulesCount = await this.moduleRepository.count()
    const subscriptionTypesCount = (await this.subscriptionPlanRepository.findAll()).length
    const gamesCount = await this.gameRepository.count()
    const avgTimePerGame = await this.gameSessionRepository.avgTimePerGame({ startDate, endDate })
    const avgSessionDuration = await this.gameSessionRepository.avgSessionDuration({ startDate, endDate })
    const successRate = await this.gameSessionRepository.successRate({ startDate, endDate })
    const parentAccountsHistogram = await this.userRepository.parentAccountsHistogram({ startDate, endDate })
    const parentsCount = await this.userRepository.countParents()
    const lastUpdated = new Date()

    return {
      modulesCount,
      subscriptionTypesCount,
      gamesCount,
      avgTimePerGame,
      avgSessionDuration,
      successRate,
      parentAccountsHistogram,
      parentsCount,
      lastUpdated
    }
  }

  log(): ActivityType {
    return ActivityType.GET_STATS
  }
}
