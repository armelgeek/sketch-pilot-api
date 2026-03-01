import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { games, gameSessions, lessons, modules } from '@/infrastructure/database/schema/schema'
import type { GameSession } from '@/domain/models/game-session.model'
import type { LastGameSessionWithDetails } from '@/domain/models/last-game-session-with-details.model'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'
import { GameRepository } from './game.repository'

export class GameSessionRepository implements GameSessionRepositoryInterface {
  async findById(id: string): Promise<GameSession | null> {
    const result = await db.query.gameSessions.findFirst({
      where: eq(gameSessions.id, id)
    })
    if (!result) return null

    return {
      id: result.id,
      childId: result.childId,
      gameId: result.gameId,
      startedAt: result.startedAt,
      endedAt: result.endedAt || undefined,
      success: result.success || undefined,
      status: result.status as 'in_progress' | 'completed' | 'blocked',
      sessionDate: result.sessionDate || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      duration: typeof result.duration === 'number' ? result.duration : 0
    }
  }

  async findAll(pagination?: { skip: number; limit: number }): Promise<GameSession[]> {
    const results = await db.query.gameSessions.findMany({
      limit: pagination?.limit,
      offset: pagination?.skip,
      orderBy: (gameSessions, { desc }) => [desc(gameSessions.startedAt)]
    })

    return results.map((result) => ({
      id: result.id,
      childId: result.childId,
      gameId: result.gameId,
      startedAt: result.startedAt,
      endedAt: result.endedAt || undefined,
      success: result.success || undefined,
      status: result.status as 'in_progress' | 'completed' | 'blocked',
      sessionDate: result.sessionDate || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      duration: typeof result.duration === 'number' ? result.duration : 0
    }))
  }

  async findByChildId(childId: string, pagination?: { skip: number; limit: number }): Promise<GameSession[]> {
    const results = await db.query.gameSessions.findMany({
      where: eq(gameSessions.childId, childId),
      limit: pagination?.limit,
      offset: pagination?.skip,
      orderBy: (gameSessions, { desc }) => [desc(gameSessions.startedAt)]
    })

    return results.map((result) => ({
      id: result.id,
      childId: result.childId,
      gameId: result.gameId,
      startedAt: result.startedAt,
      endedAt: result.endedAt || undefined,
      success: result.success || undefined,
      status: result.status as 'in_progress' | 'completed' | 'blocked',
      sessionDate: result.sessionDate || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      duration: typeof result.duration === 'number' ? result.duration : 0
    }))
  }

  async findByGameId(gameId: string, pagination?: { skip: number; limit: number }): Promise<GameSession[]> {
    const results = await db.query.gameSessions.findMany({
      where: eq(gameSessions.gameId, gameId),
      limit: pagination?.limit,
      offset: pagination?.skip,
      orderBy: (gameSessions, { desc }) => [desc(gameSessions.startedAt)]
    })

    return results.map((result) => ({
      id: result.id,
      childId: result.childId,
      gameId: result.gameId,
      startedAt: result.startedAt,
      endedAt: result.endedAt || undefined,
      success: result.success || undefined,
      status: result.status as 'in_progress' | 'completed' | 'blocked',
      sessionDate: result.sessionDate || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      duration: typeof result.duration === 'number' ? result.duration : 0
    }))
  }

  async findActiveSessionByChildAndGame(childId: string, gameId: string): Promise<GameSession | null> {
    const result = await db.query.gameSessions.findFirst({
      where: and(
        eq(gameSessions.childId, childId),
        eq(gameSessions.gameId, gameId),
        eq(gameSessions.status, 'abandoned')
      )
    })

    if (!result) return null

    return {
      id: result.id,
      childId: result.childId,
      gameId: result.gameId,
      startedAt: result.startedAt,
      endedAt: result.endedAt || undefined,
      success: result.success || undefined,
      status: result.status as 'in_progress' | 'completed' | 'blocked',
      sessionDate: result.sessionDate || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      duration: typeof result.duration === 'number' ? result.duration : 0
    }
  }

  async create(data: Omit<GameSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameSession> {
    const id = crypto.randomUUID()
    const now = new Date()

    const [result] = await db
      .insert(gameSessions)
      .values({
        id,
        childId: data.childId,
        gameId: data.gameId,
        startedAt: data.startedAt,
        endedAt: data.endedAt || null,
        success: data.success || null,
        status: data.status,
        sessionDate: data.sessionDate || null,
        createdAt: now,
        updatedAt: now,
        duration: data.duration || null
      })
      .returning()

    return {
      id: result.id,
      childId: result.childId,
      gameId: result.gameId,
      startedAt: result.startedAt,
      endedAt: result.endedAt || undefined,
      success: result.success || undefined,
      status: result.status as 'in_progress' | 'completed' | 'blocked',
      sessionDate: result.sessionDate || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      duration: typeof result.duration === 'number' ? result.duration : 0
    }
  }

  async update(id: string, data: Partial<Omit<GameSession, 'id' | 'createdAt' | 'updatedAt'>>): Promise<GameSession> {
    const [result] = await db
      .update(gameSessions)
      .set({
        ...data,
        updatedAt: new Date(),
        duration: data.duration ?? undefined
      })
      .where(eq(gameSessions.id, id))
      .returning()

    return {
      id: result.id,
      childId: result.childId,
      gameId: result.gameId,
      startedAt: result.startedAt,
      endedAt: result.endedAt || undefined,
      success: result.success || undefined,
      status: result.status as 'in_progress' | 'completed' | 'blocked' | 'abandoned',
      sessionDate: result.sessionDate || undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      duration: typeof result.duration === 'number' ? result.duration : 0
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(gameSessions).where(eq(gameSessions.id, id))
    return result.length > 0
  }

  async count(): Promise<number> {
    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(gameSessions)
    return Number(result[0].count)
  }

  async findLastSessionWithDetails(childId: string): Promise<LastGameSessionWithDetails | null> {
    const result = await db
      .select({
        id: gameSessions.id,
        childId: gameSessions.childId,
        startedAt: gameSessions.startedAt,
        endedAt: gameSessions.endedAt,
        success: gameSessions.success,
        status: gameSessions.status,
        sessionDate: gameSessions.sessionDate,
        createdAt: gameSessions.createdAt,
        updatedAt: gameSessions.updatedAt,
        gameId: games.id,
        gameTitle: games.title,
        gameCoverUrl: games.coverUrl,
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        lessonOrder: lessons.order,
        moduleId: modules.id,
        moduleName: modules.name,
        duration: gameSessions.duration,
        moduleCoverUrl: modules.coverUrl
      })
      .from(gameSessions)
      .innerJoin(games, eq(gameSessions.gameId, games.id))
      .innerJoin(lessons, eq(games.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(gameSessions.childId, childId))
      .orderBy(sql`${gameSessions.startedAt} DESC`)
      .limit(1)

    if (result.length === 0) return null

    const session = result[0]

    // Calculer le temps total en minutes si la session est terminée
    let totalTime: number | undefined = undefined
    if (session.endedAt && session.startedAt) {
      const diffMs = session.endedAt.getTime() - session.startedAt.getTime()
      totalTime = Math.round(diffMs / (1000 * 60)) // Conversion en minutes
    }

    return {
      id: session.id,
      childId: session.childId,
      startedAt: session.startedAt,
      endedAt: session.endedAt || undefined,
      success: session.success || undefined,
      status: session.status as 'in_progress' | 'completed' | 'blocked' | 'abandoned',
      sessionDate: session.sessionDate || undefined,
      totalTime,
      game: {
        id: session.gameId,
        title: session.gameTitle,
        coverUrl: session.gameCoverUrl || undefined
      },
      lesson: {
        id: session.lessonId,
        title: session.lessonTitle,
        order: session.lessonOrder
      },
      module: {
        id: session.moduleId,
        name: session.moduleName,
        coverUrl: session.moduleCoverUrl || undefined
      },
      duration: typeof session.duration === 'number' ? session.duration : 0,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }
  }

  /**
   * Calcule le temps moyen passé par jeu (en minutes) sur toutes les sessions complétées,
   * avec possibilité de filtrer par date de début et de fin.
   *
   * Étapes :
   * 1. On filtre les sessions complétées (status = 'completed') avec dates valides.
   * 2. On applique les bornes startDate/endDate si fournies.
   * 3. On calcule la moyenne de (ended_at - started_at) en minutes sur ces sessions.
   * 4. On retourne 0 si aucune session trouvée.
   */
  async avgTimePerGame({ startDate, endDate }: { startDate?: Date; endDate?: Date } = {}): Promise<number> {
    // Moyenne du temps passé par jeu (en secondes)
    let where = sql`status = 'completed' `
    if (startDate) where = sql`${where} AND started_at >= ${startDate}`
    if (endDate) where = sql`${where} AND started_at <= ${endDate}`
    const result = await db
      .select({ avg: sql`AVG(duration)` })
      .from(gameSessions)
      .where(where)
    return Number(result[0].avg) || 0
  }

  /**
   * Calcule la durée moyenne des sessions (en minutes),
   * avec possibilité de filtrer par date de début et de fin.
   *
   * Étapes :
   * 1. On filtre toutes les sessions avec dates valides.
   * 2. On applique les bornes startDate/endDate si fournies.
   * 3. On calcule la moyenne de (ended_at - started_at) en minutes.
   * 4. On retourne 0 si aucune session trouvée.
   */
  async avgSessionDuration({ startDate, endDate }: { startDate?: Date; endDate?: Date } = {}): Promise<number> {
    // Moyenne de la durée des sessions (en secondes)
    let where = sql`1=1`
    if (startDate) where = sql`${where} AND started_at >= ${startDate}`
    if (endDate) where = sql`${where} AND started_at <= ${endDate}`
    const result = await db
      .select({ avg: sql`AVG(duration)` })
      .from(gameSessions)
      .where(where)
    return Number(result[0].avg) || 0
  }

  /**
   * Calcule le taux de réussite (%) sur les sessions complétées,
   * avec possibilité de filtrer par date de début et de fin.
   * Taux = (sessions complétées avec success = true) / (sessions complétées)
   *
   * Étapes :
   * 1. On filtre les sessions complétées (status = 'completed') avec dates valides.
   * 2. On applique les bornes startDate/endDate si fournies.
   * 3. On compte le total de sessions complétées.
   * 4. On compte celles avec success = true.
   * 5. On retourne 0 si aucune session trouvée, sinon (succès/total)*100 arrondi.
   */
  async successRate({ startDate, endDate }: { startDate?: Date; endDate?: Date } = {}): Promise<number> {
    // Taux de réussite = sessions complétées avec success = true / sessions complétées
    let where = sql`status = 'completed'`
    if (startDate) where = sql`${where} AND started_at >= ${startDate}`
    if (endDate) where = sql`${where} AND started_at <= ${endDate}`
    const totalResult = await db
      .select({ count: sql`COUNT(*)` })
      .from(gameSessions)
      .where(where)
    const successResult = await db
      .select({ count: sql`COUNT(*)` })
      .from(gameSessions)
      .where(and(where, eq(gameSessions.success, true)))
    const total = Number(totalResult[0].count) || 0
    const success = Number(successResult[0].count) || 0
    return total === 0 ? 0 : Math.round((success / total) * 100)
  }

  async getChildProgressSummary(childId: string): Promise<{
    gamesCompleted: number
    gamesInProgress: number
    progressPercent: number
    totalTimeSpent: number
    statusPie: Record<string, number>
    totalSessions: number
    avgSessionDuration: number
  }> {
    const sessions = await db
      .select({
        status: gameSessions.status,
        startedAt: gameSessions.startedAt,
        endedAt: gameSessions.endedAt,
        gameId: gameSessions.gameId,
        duration: gameSessions.duration
      })
      .from(gameSessions)
      .where(eq(gameSessions.childId, childId))

    const latestByGame: Record<string, (typeof sessions)[0]> = {}
    for (const s of sessions) {
      const key = s.gameId
      if (!latestByGame[key]) {
        latestByGame[key] = s
      } else {
        const prev = latestByGame[key]
        const prevDate = prev.endedAt ? prev.endedAt : prev.startedAt
        const currDate = s.endedAt ? s.endedAt : s.startedAt
        if (currDate > prevDate) {
          latestByGame[key] = s
        }
      }
    }

    let gamesCompleted = 0
    let gamesInProgress = 0
    let totalTimeSpent = 0

    // Récupérer tous les jeux
    const gameRepository = new GameRepository()
    const gameSessionRepository = new GameSessionRepository()
    const allGames = await gameRepository.findAll()
    const childSessions = await gameSessionRepository.findByChildId(childId)

    // Utiliser la même logique que GetChildModulesWithProgressUseCase
    const byStatus = {
      available: 0,
      blocked: 0,
      completed: 0,
      in_progress: 0
    }

    for (const game of allGames) {
      // Vérifier les prérequis du jeu
      const prerequisites = await gameRepository.findPrerequisites(game.id)
      const prerequisitesMet = await this.checkPrerequisitesMet(prerequisites, childSessions)

      // Récupérer la session de ce jeu pour cet enfant
      const gameSession = childSessions.find((session) => session.gameId === game.id)

      let status: 'available' | 'blocked' | 'completed' | 'in_progress' = 'available'

      if (prerequisitesMet) {
        if (gameSession?.status === 'completed') {
          status = 'completed'
        } else if (gameSession?.status === 'in_progress' || gameSession?.status === 'abandoned') {
          status = 'in_progress'
        } else {
          status = 'available'
        }
      } else {
        status = 'blocked'
      }

      console.info(
        `Game ${game.id} (${game.title}): status = ${status}, prerequisitesMet = ${prerequisitesMet}, gameSession = ${gameSession?.status || 'none'}`
      )
      byStatus[status]++
    }

    const statusPie: Record<string, number> = {}
    const latestSessions = Object.values(latestByGame)
    for (const s of latestSessions) {
      statusPie[s.status] = (statusPie[s.status] || 0) + 1
      if (s.status === 'completed') gamesCompleted++
      if (s.status === 'abandoned') gamesInProgress++
      totalTimeSpent += typeof s.duration === 'number' ? s.duration : 0
    }

    const totalGames = latestSessions.length
    const progressPercent = totalGames > 0 ? Math.round((gamesCompleted / totalGames) * 100) : 0

    // Calcul du nombre total de sessions et de la durée moyenne des sessions
    const totalSessions = sessions.length
    const avgSessionDuration = totalSessions > 0 ? Math.round(totalTimeSpent / totalSessions) : 0

    return {
      gamesCompleted,
      gamesInProgress,
      progressPercent,
      totalTimeSpent,
      statusPie: byStatus,
      totalSessions,
      avgSessionDuration
    }
  }

  async getChildActivityStats(
    childId: string,
    since: Date
  ): Promise<{
    completedModules: number
    completedLessons: number
    avgTimePerDay: number
    successRate: number
    gamesPlayed: number
    sessionsCount: number
    avgSessionDuration: number
  }> {
    // Sessions filtrées par date
    const sessions = await db
      .select({
        status: gameSessions.status,
        startedAt: gameSessions.startedAt,
        endedAt: gameSessions.endedAt,
        gameId: gameSessions.gameId,
        duration: gameSessions.duration
      })
      .from(gameSessions)
      .where(and(eq(gameSessions.childId, childId), gte(gameSessions.startedAt, since)))

    const gamesPlayedSet = new Set<string>()
    // TODO: completedLessons et completedModules à calculer via d'autres repo si besoin
    // Pour l'exemple, on met 0

    let totalTime = 0
    let successGames = 0
    let totalSessionDuration = 0
    const sessionsCount = sessions.length
    const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / (1000 * 60 * 60 * 24)))

    // Calcul des leçons complétées
    const completedLessonIds = new Set<string>()
    const completedModuleIds = new Set<string>()
    // Récupérer toutes les leçons et modules
    const allLessons = await db
      .select({
        id: lessons.id,
        moduleId: lessons.moduleId
      })
      .from(lessons)
    const allModules = await db
      .select({
        id: modules.id
      })
      .from(modules)
    // Pour chaque leçon, vérifier si tous ses jeux sont complétées par l'enfant dans la période
    for (const lesson of allLessons) {
      const lessonGameIds = (await db.select({ id: games.id }).from(games).where(eq(games.lessonId, lesson.id))).map(
        (g) => g.id
      )
      if (lessonGameIds.length === 0) continue
      const completedGamesInLesson = sessions.filter(
        (s) => lessonGameIds.includes(s.gameId) && s.status === 'completed'
      )
      if (completedGamesInLesson.length === lessonGameIds.length) {
        completedLessonIds.add(lesson.id)
        completedModuleIds.add(lesson.moduleId)
      }
    }
    // Pour chaque module, vérifier si toutes ses leçons sont dans completedLessonIds
    let completedModules = 0
    for (const module of allModules) {
      const moduleLessonIds = allLessons.filter((l) => l.moduleId === module.id).map((l) => l.id)
      if (moduleLessonIds.length === 0) continue
      const allLessonsCompleted = moduleLessonIds.every((lid) => completedLessonIds.has(lid))
      if (allLessonsCompleted) completedModules++
    }
    const completedLessons = completedLessonIds.size
    // const completedModules = completedModuleIds.size

    for (const s of sessions) {
      gamesPlayedSet.add(s.gameId)
      if (s.status === 'completed') {
        successGames++
        totalTime += typeof s.duration === 'number' ? s.duration : 0
        totalSessionDuration += typeof s.duration === 'number' ? s.duration : 0
      } else if (s.status === 'in_progress' || s.status === 'abandoned') {
        totalSessionDuration += typeof s.duration === 'number' ? s.duration : 0
      }
    }

    return {
      completedModules,
      completedLessons,
      avgTimePerDay: Math.round(totalTime / days),
      successRate: sessionsCount > 0 ? Math.round((successGames / sessionsCount) * 100) : 0,
      gamesPlayed: gamesPlayedSet.size,
      sessionsCount,
      avgSessionDuration: sessionsCount > 0 ? Math.round(totalSessionDuration / sessionsCount) : 0
    }
  }
  private checkPrerequisitesMet(prerequisites: any[], childSessions: any[]): boolean {
    if (prerequisites.length === 0) {
      return true // Pas de prérequis, jeu disponible
    }

    // Vérifier que tous les prérequis sont complétés
    for (const prerequisite of prerequisites) {
      const prereqSession = childSessions.find(
        (session) => session.gameId === prerequisite.id && session.status === 'completed'
      )

      if (!prereqSession) {
        return false // Un prérequis n'est pas complété
      }
    }

    return true // Tous les prérequis sont remplis
  }
}
