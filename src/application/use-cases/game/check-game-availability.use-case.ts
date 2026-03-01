import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'

type Params = {
  childId: string
  gameId: string
}

type PrerequisiteInfo = {
  id: string
  title: string
  completed: boolean
  completedAt?: Date
}

type Response = {
  gameId: string
  gameTitle: string
  available: boolean
  status: 'available' | 'blocked' | 'completed' | 'in_progress'
  reason?: string
  prerequisites: PrerequisiteInfo[]
  missingPrerequisites: PrerequisiteInfo[]
  canStart: boolean
  currentSession?: {
    id: string
    startedAt: Date
  }
  lastCompletion?: {
    completedAt: Date
    success: boolean
  }
  success: boolean
  error?: string
}

export class CheckGameAvailabilityUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly gameRepository: GameRepositoryInterface,
    private readonly gameSessionRepository: GameSessionRepositoryInterface,
    private readonly lessonRepository: LessonRepositoryInterface
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      // 1. Récupérer le jeu
      const game = await this.gameRepository.findById(params.gameId)
      if (!game) {
        return {
          gameId: params.gameId,
          gameTitle: 'Jeu introuvable',
          available: false,
          status: 'blocked',
          reason: 'Game not found',
          prerequisites: [],
          missingPrerequisites: [],
          canStart: false,
          success: false,
          error: 'Game not found'
        }
      }

      // 2. Récupérer les prérequis du jeu
      const prerequisites = await this.gameRepository.findPrerequisites(params.gameId)

      // 3. Récupérer toutes les sessions de l'enfant
      const childSessions = await this.gameSessionRepository.findByChildId(params.childId)

      // 4. Vérifier l'état des prérequis spécifiques du jeu
      const prerequisitesInfo: PrerequisiteInfo[] = []
      const missingPrerequisites: PrerequisiteInfo[] = []

      for (const prereq of prerequisites) {
        const prereqSession = childSessions.find(
          (session) => session.gameId === prereq.id && session.status === 'completed'
        )

        const prereqInfo: PrerequisiteInfo = {
          id: prereq.id,
          title: prereq.title,
          completed: !!prereqSession,
          completedAt: prereqSession?.endedAt
        }

        prerequisitesInfo.push(prereqInfo)

        if (!prereqSession) {
          missingPrerequisites.push(prereqInfo)
        }
      }

      // 5. Vérifier les prérequis au niveau des leçons (nouvelle logique)
      const currentLesson = await this.lessonRepository.findById(game.lessonId)
      if (!currentLesson) {
        return {
          gameId: params.gameId,
          gameTitle: game.title,
          available: false,
          status: 'blocked',
          reason: 'Lesson not found',
          prerequisites: [],
          missingPrerequisites: [],
          canStart: false,
          success: false,
          error: 'Lesson not found'
        }
      }

      // Récupérer toutes les leçons du même module, triées par ordre
      const allLessonsInModule = await this.lessonRepository.findByModuleId(currentLesson.moduleId)
      const sortedLessons = allLessonsInModule.sort((a, b) => a.order - b.order)

      // Vérifier si toutes les leçons précédentes sont complétées
      const currentLessonIndex = sortedLessons.findIndex((lesson) => lesson.id === currentLesson.id)
      const lessonPrerequisitesMet = await this.checkPreviousLessonsCompleted(
        sortedLessons.slice(0, currentLessonIndex),
        params.childId,
        childSessions
      )

      if (!lessonPrerequisitesMet.met) {
        return {
          gameId: game.id,
          gameTitle: game.title,
          available: false,
          status: 'blocked',
          reason: lessonPrerequisitesMet.reason,
          prerequisites: prerequisitesInfo,
          missingPrerequisites,
          canStart: false,
          success: true
        }
      }

      // 6. Vérifier l'état actuel du jeu pour cet enfant
      const completedSession = childSessions.find(
        (session) => session.gameId === params.gameId && session.status === 'completed'
      )
      const activeSession = childSessions.find(
        (session) => session.gameId === params.gameId && session.status === 'in_progress'
      )

      // 6. Déterminer le statut et la disponibilité
      let status: 'available' | 'blocked' | 'completed' | 'in_progress' = 'blocked'
      let available = false
      let canStart = false
      let reason: string | undefined

      const prerequisitesMet = missingPrerequisites.length === 0

      if (prerequisitesMet) {
        if (completedSession) {
          status = 'completed'
          available = true
          canStart = true // Peut rejouer
          reason = 'Game already completed, can be replayed'
        } else if (activeSession) {
          status = 'in_progress'
          available = true
          canStart = false // Session déjà en cours
          reason = 'Game session already in progress'
        } else {
          status = 'available'
          available = true
          canStart = true
          reason = 'All prerequisites met, can start game'
        }
      } else {
        status = 'blocked'
        available = false
        canStart = false
        reason = `Missing ${missingPrerequisites.length} prerequisite(s): ${missingPrerequisites.map((p) => p.title).join(', ')}`
      }

      return {
        gameId: game.id,
        gameTitle: game.title,
        available,
        status,
        reason,
        prerequisites: prerequisitesInfo,
        missingPrerequisites,
        canStart,
        currentSession: activeSession
          ? {
              id: activeSession.id,
              startedAt: activeSession.startedAt
            }
          : undefined,
        lastCompletion: completedSession
          ? {
              completedAt: completedSession.endedAt!,
              success: completedSession.success || false
            }
          : undefined,
        success: true
      }
    } catch (error: any) {
      return {
        gameId: params.gameId,
        gameTitle: 'Erreur',
        available: false,
        status: 'blocked',
        reason: 'Error checking game availability',
        prerequisites: [],
        missingPrerequisites: [],
        canStart: false,
        success: false,
        error: error.message || 'Failed to check game availability'
      }
    }
  }

  /**
   * Vérifier si toutes les leçons précédentes ont tous leurs jeux complétés
   */
  private async checkPreviousLessonsCompleted(
    previousLessons: any[],
    childId: string,
    childSessions: any[]
  ): Promise<{ met: boolean; reason?: string }> {
    if (previousLessons.length === 0) {
      return { met: true }
    }

    for (const lesson of previousLessons) {
      // Récupérer tous les jeux de cette leçon
      const gamesInLesson = await this.gameRepository.findByLessonId(lesson.id)

      if (gamesInLesson.length === 0) {
        continue // Pas de jeux dans cette leçon, on passe à la suivante
      }

      // Vérifier que tous les jeux de cette leçon sont complétés
      for (const gameInLesson of gamesInLesson) {
        const gameSession = childSessions.find(
          (session) => session.gameId === gameInLesson.id && session.status === 'completed'
        )

        if (!gameSession) {
          return {
            met: false,
            reason: `Vous devez terminer tous les jeux de la leçon "${lesson.title}" avant d'accéder à cette leçon`
          }
        }
      }
    }

    return { met: true }
  }

  log(): ActivityType {
    return ActivityType.LIST_MODULES
  }
}
