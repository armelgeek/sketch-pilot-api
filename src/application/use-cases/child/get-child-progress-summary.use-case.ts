import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'

interface Params {
  childId: string
}

interface Response {
  success: boolean
  data?: {
    gamesCompleted: number
    gamesInProgress: number
    progressPercent: number
    totalTimeSpent: number
    statusPie: Record<string, number>
    totalSessions: number
    avgSessionDuration: number
  }
  error?: string
}

export class GetChildProgressSummaryUseCase {
  constructor(private readonly gameSessionRepository: GameSessionRepositoryInterface) {}

  async execute(params: Params): Promise<Response> {
    try {
      const stats = await this.gameSessionRepository.getChildProgressSummary(params.childId)
      return { success: true, data: stats }
    } catch {
      return { success: false, error: 'Données indisponibles' }
    }
  }
}
