import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'

const PERIODS = {
  '7d': 7,
  '30d': 30,
  '6m': 180
} as const

export type PeriodKey = keyof typeof PERIODS

interface Params {
  childId: string
  period: PeriodKey
}

interface Response {
  success: boolean
  data?: {
    completedModules: number
    completedLessons: number
    avgTimePerDay: number
    successRate: number
    gamesPlayed: number
    sessionsCount: number
    avgSessionDuration: number
  }
  error?: string
}

export class GetChildActivityStatsUseCase {
  constructor(private readonly gameSessionRepository: GameSessionRepositoryInterface) {}

  async execute(params: Params): Promise<Response> {
    const { childId, period } = params
    if (!Object.keys(PERIODS).includes(period)) {
      return { success: false, error: 'Période invalide' }
    }
    const days = PERIODS[period]
    const since = new Date()
    since.setDate(since.getDate() - days)
    try {
      const stats = await this.gameSessionRepository.getChildActivityStats(childId, since)
      return { success: true, data: stats }
    } catch {
      return { success: false, error: 'Données indisponibles' }
    }
  }
}
