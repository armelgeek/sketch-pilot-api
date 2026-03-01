import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'
import { GetChildActivityStatsUseCase } from './get-child-activity-stats.use-case'

describe('GetChildActivityStatsUseCase', () => {
  let gameSessionRepository: Partial<GameSessionRepositoryInterface>
  let useCase: GetChildActivityStatsUseCase

  beforeEach(() => {
    gameSessionRepository = {
      getChildActivityStats: vi.fn()
    }
    useCase = new GetChildActivityStatsUseCase(gameSessionRepository as GameSessionRepositoryInterface)
    vi.resetAllMocks()
  })

  it('retourne les stats pour une période valide', async () => {
    const fakeStats = {
      completedModules: 2,
      completedLessons: 5,
      avgTimePerDay: 30,
      successRate: 0.8,
      gamesPlayed: 10,
      sessionsCount: 4,
      avgSessionDuration: 15
    }
    ;(gameSessionRepository.getChildActivityStats as any).mockResolvedValue(fakeStats)
    const result = await useCase.execute({ childId: 'child-1', period: '7d' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual(fakeStats)
  })

  it('retourne une erreur pour une période invalide', async () => {
    const result = await useCase.execute({ childId: 'child-1', period: 'invalid' as any })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Période invalide')
  })

  it('retourne une erreur si le repository échoue', async () => {
    ;(gameSessionRepository.getChildActivityStats as any).mockRejectedValue(new Error('fail'))
    const result = await useCase.execute({ childId: 'child-1', period: '7d' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Données indisponibles')
  })
})
