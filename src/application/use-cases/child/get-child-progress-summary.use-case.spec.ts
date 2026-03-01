import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'
import { GetChildProgressSummaryUseCase } from './get-child-progress-summary.use-case'

describe('GetChildProgressSummaryUseCase', () => {
  let gameSessionRepository: Partial<GameSessionRepositoryInterface>
  let useCase: GetChildProgressSummaryUseCase

  beforeEach(() => {
    gameSessionRepository = {
      getChildProgressSummary: vi.fn()
    }
    useCase = new GetChildProgressSummaryUseCase(gameSessionRepository as GameSessionRepositoryInterface)
    vi.resetAllMocks()
  })

  it('retourne le résumé de progression', async () => {
    const fakeSummary = {
      gamesCompleted: 5,
      gamesInProgress: 2,
      progressPercent: 80,
      totalTimeSpent: 120,
      statusPie: { completed: 5, inProgress: 2 },
      totalSessions: 7,
      avgSessionDuration: 17
    }
    ;(gameSessionRepository.getChildProgressSummary as any).mockResolvedValue(fakeSummary)
    const result = await useCase.execute({ childId: 'child-1' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual(fakeSummary)
  })

  it('retourne une erreur si le repository échoue', async () => {
    ;(gameSessionRepository.getChildProgressSummary as any).mockRejectedValue(new Error('fail'))
    const result = await useCase.execute({ childId: 'child-1' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Données indisponibles')
  })
})
