import type { GameSession } from '../models/game-session.model'
import type { LastGameSessionWithDetails } from '../models/last-game-session-with-details.model'

export interface GameSessionRepositoryInterface {
  findById: (id: string) => Promise<GameSession | null>
  findAll: (pagination?: { skip: number; limit: number }) => Promise<GameSession[]>
  findByChildId: (childId: string, pagination?: { skip: number; limit: number }) => Promise<GameSession[]>
  findByGameId: (gameId: string, pagination?: { skip: number; limit: number }) => Promise<GameSession[]>
  findActiveSessionByChildAndGame: (childId: string, gameId: string) => Promise<GameSession | null>
  findLastSessionWithDetails: (childId: string) => Promise<LastGameSessionWithDetails | null>
  create: (data: Omit<GameSession, 'id' | 'createdAt' | 'updatedAt'>) => Promise<GameSession>
  update: (id: string, data: Partial<Omit<GameSession, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<GameSession>
  delete: (id: string) => Promise<boolean>
  count: () => Promise<number>

  /**
   * Résumé de progression d'un enfant (jeux complétés, en cours, % progression, temps total, camembert statuts)
   */
  getChildProgressSummary: (childId: string) => Promise<{
    gamesCompleted: number
    gamesInProgress: number
    progressPercent: number
    totalTimeSpent: number
    totalSessions: number
    avgSessionDuration: number
    statusPie: Record<string, number>
  }>

  /**
   * Statistiques d'activité d'un enfant sur une période (modules/leçons complétés, temps/jour, taux de réussite, etc.)
   */
  getChildActivityStats: (
    childId: string,
    since: Date
  ) => Promise<{
    completedModules: number
    completedLessons: number
    avgTimePerDay: number
    successRate: number
    gamesPlayed: number
    sessionsCount: number
    avgSessionDuration: number
  }>
}
