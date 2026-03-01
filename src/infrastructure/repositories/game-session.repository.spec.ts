import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as dbModule from '@/infrastructure/database/db'
import { GameSessionRepository } from './game-session.repository'

// On mock le module db et les tables utilisées
vi.mock('@/infrastructure/database/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      gameSessions: {
        findMany: vi.fn(),
        findFirst: vi.fn()
      }
    },
    delete: vi.fn(),
    insert: vi.fn(),
    update: vi.fn()
  }
}))

// On mock aussi les tables lessons, modules, games
vi.mock('@/infrastructure/database/schema/schema', () => ({
  gameSessions: {},
  lessons: {},
  modules: {},
  games: {}
}))

describe('GameSessionRepository', () => {
  let repo: GameSessionRepository
  let db: any

  beforeEach(() => {
    repo = new GameSessionRepository()
    db = dbModule.db
    vi.clearAllMocks()
  })

  it('getChildActivityStats retourne des stats cohérentes (sessions simples)', async () => {
    // Simule des sessions pour un enfant
    const now = new Date()
    const sessions = [
      { status: 'completed', startedAt: now, endedAt: now, gameId: 'g1', duration: 30 },
      { status: 'completed', startedAt: now, endedAt: now, gameId: 'g2', duration: 20 },
      { status: 'in_copprogress', startedAt: now, endedAt: null, gameId: 'g3', duration: 10 }
    ]
    db.select.mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(sessions) })
    // Mock lessons et modules pour completedLessons/completedModules
    db.select.mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }) // lessons
    db.select.mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }) // modules

    const result = await repo.getChildActivityStats('child-1', new Date('2023-01-01'))
    expect(result.successRate).toBeGreaterThanOrEqual(0)
    expect(result.gamesPlayed).toBe(3)
    expect(result.sessionsCount).toBe(3)
    expect(result.avgSessionDuration).toBeGreaterThanOrEqual(0)
  })

  it('getChildActivityStats retourne 0 si aucune session', async () => {
    db.select.mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) })
    db.select.mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }) // lessons
    db.select.mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }) // modules
    const result = await repo.getChildActivityStats('child-1', new Date('2023-01-01'))
    expect(result.gamesPlayed).toBe(0)
    expect(result.sessionsCount).toBe(0)
    expect(result.avgSessionDuration).toBe(0)
  })
})
