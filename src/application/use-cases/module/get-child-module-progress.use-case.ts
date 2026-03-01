import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'
import type { ModuleRepositoryInterface } from '@/domain/repositories/module.repository.interface'

type Params = {
  childId: string
  moduleId: string
}

type GameProgress = {
  id: string
  title: string
  status: 'available' | 'blocked' | 'completed' | 'in_progress'
  completedAt?: Date
  prerequisitesMet: boolean
  coverUrl?: string
}

type LessonProgress = {
  id: string
  title: string
  order: number
  totalGames: number
  completedGames: number
  availableGames: number
  blockedGames: number
  games: GameProgress[]
}

type Response = {
  moduleId: string
  moduleName: string
  moduleDescription?: string
  coverUrl?: string
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked'
  totalLessons: number
  totalGames: number
  completedGames: number
  progressPercentage: number
  lessons: LessonProgress[]
  success: boolean
  error?: string
}

export class GetChildModuleProgressUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly moduleRepository: ModuleRepositoryInterface,
    private readonly lessonRepository: LessonRepositoryInterface,
    private readonly gameRepository: GameRepositoryInterface,
    private readonly gameSessionRepository: GameSessionRepositoryInterface
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      // 1. Récupérer le module
      const module = await this.moduleRepository.findById(params.moduleId)
      if (!module) {
        return {
          moduleId: params.moduleId,
          moduleName: 'Module introuvable',
          moduleDescription: '',
          status: 'blocked',
          totalLessons: 0,
          totalGames: 0,
          completedGames: 0,
          progressPercentage: 0,
          lessons: [],
          success: false,
          error: 'Module not found'
        }
      }

      // 2. Récupérer toutes les leçons du module
      const lessons = await this.lessonRepository.findByModuleId(params.moduleId)

      // 3. Traiter chaque leçon
      const lessonsProgress: LessonProgress[] = []
      let totalGames = 0
      let completedGames = 0

      // Récupérer toutes les sessions de l'enfant une seule fois
      const childSessions = await this.gameSessionRepository.findByChildId(params.childId)

      // Trier les leçons par ordre pour vérifier les prérequis de leçon
      const sortedLessons = lessons.sort((a, b) => a.order - b.order)

      for (let lessonIndex = 0; lessonIndex < sortedLessons.length; lessonIndex++) {
        const lesson = sortedLessons[lessonIndex]

        // Récupérer tous les jeux de la leçon
        const games = await this.gameRepository.findByLessonId(lesson.id)
        totalGames += games.length

        // Vérifier si toutes les leçons précédentes sont complètement terminées
        const previousLessons = sortedLessons.slice(0, lessonIndex)
        const lessonPrerequisitesMet = await this.checkPreviousLessonsCompleted(
          previousLessons,
          params.childId,
          childSessions
        )

        // Récupérer les sessions de jeu pour cet enfant dans cette leçon
        const gamesProgress: GameProgress[] = []
        let lessonCompletedGames = 0
        let lessonAvailableGames = 0
        let lessonBlockedGames = 0

        for (const game of games) {
          // Vérifier les prérequis spécifiques du jeu
          const prerequisites = await this.gameRepository.findPrerequisites(game.id)
          const gamePrerequisitesMet = await this.checkPrerequisitesMet(prerequisites, params.childId)

          const gameSession = childSessions.find((session) => session.gameId === game.id)

          let status: 'available' | 'blocked' | 'completed' | 'in_progress' = 'blocked'
          let completedAt: Date | undefined

          // D'abord vérifier les prérequis de leçon, puis les prérequis spécifiques du jeu
          if (!lessonPrerequisitesMet) {
            // Leçons précédentes pas terminées - jeu bloqué
            status = 'blocked'
            lessonBlockedGames++
          } else if (!gamePrerequisitesMet) {
            // Prérequis spécifiques du jeu pas remplis - jeu bloqué
            status = 'blocked'
            lessonBlockedGames++
          } else if (gameSession?.status === 'completed') {
            // Tous les prérequis sont remplis et le jeu est terminé
            status = 'completed'
            completedAt = gameSession.endedAt
            lessonCompletedGames++
            completedGames++
          } else if (gameSession?.status === 'in_progress' || gameSession?.status === 'abandoned') {
            // Tous les prérequis sont remplis et le jeu est en cours ou abandonné
            status = 'in_progress'
            lessonAvailableGames++
          } else {
            // Tous les prérequis sont remplis et le jeu n'a pas été commencé
            status = 'available'
            lessonAvailableGames++
          }

          gamesProgress.push({
            id: game.id,
            title: game.title,
            status,
            completedAt,
            prerequisitesMet: lessonPrerequisitesMet && gamePrerequisitesMet,
            coverUrl: game.coverUrl
          })
        }

        lessonsProgress.push({
          id: lesson.id,
          title: lesson.title,
          order: lesson.order,
          totalGames: games.length,
          completedGames: lessonCompletedGames,
          availableGames: lessonAvailableGames,
          blockedGames: lessonBlockedGames,
          games: gamesProgress
        })
      }

      // 4. Calculer le pourcentage de progression
      const progressPercentage = totalGames > 0 ? Math.round((completedGames / totalGames) * 100) : 0

      // 5. Calculer le statut du module
      const moduleStatus = this.calculateModuleStatus(lessonsProgress, totalGames, completedGames)

      return {
        moduleId: module.id,
        moduleName: module.name,
        moduleDescription: module.description,
        coverUrl: module.coverUrl,
        status: moduleStatus,
        totalLessons: lessons.length,
        totalGames,
        completedGames,
        progressPercentage,
        lessons: lessonsProgress.sort((a, b) => a.order - b.order),
        success: true
      }
    } catch (error: any) {
      return {
        moduleId: params.moduleId,
        moduleName: 'Erreur',
        moduleDescription: '',
        status: 'blocked',
        totalLessons: 0,
        totalGames: 0,
        completedGames: 0,
        progressPercentage: 0,
        lessons: [],
        success: false,
        error: error.message || 'Failed to get module progress'
      }
    }
  }

  /**
   * Calculer le statut du module basé sur l'état des leçons et jeux
   */
  private calculateModuleStatus(
    lessonsProgress: LessonProgress[],
    totalGames: number,
    completedGames: number
  ): 'not_started' | 'in_progress' | 'completed' | 'blocked' {
    // Si aucun jeu dans le module
    if (totalGames === 0) {
      return 'not_started'
    }

    // Si tous les jeux sont complétés
    if (completedGames === totalGames) {
      return 'completed'
    }

    // Vérifier s'il y a des jeux disponibles dans n'importe quelle leçon
    const hasAvailableGames = lessonsProgress.some((lesson) => lesson.availableGames > 0)

    // Si certains jeux sont complétés ou si des jeux sont disponibles
    if (completedGames > 0 || hasAvailableGames) {
      return 'in_progress'
    }

    // Aucun jeu complété et aucun jeu disponible = module bloqué
    return 'not_started'
  }

  private async checkPrerequisitesMet(prerequisites: any[], childId: string): Promise<boolean> {
    if (prerequisites.length === 0) {
      return true // Pas de prérequis, jeu disponible
    }

    const childSessions = await this.gameSessionRepository.findByChildId(childId)

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

  /**
   * Vérifier si toutes les leçons précédentes ont tous leurs jeux complétés
   */
  private async checkPreviousLessonsCompleted(
    previousLessons: any[],
    childId: string,
    childSessions: any[]
  ): Promise<boolean> {
    if (previousLessons.length === 0) {
      return true
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
          return false // Un jeu de cette leçon précédente n'est pas complété
        }
      }
    }

    return true // Toutes les leçons précédentes sont complétées
  }

  log(): ActivityType {
    return ActivityType.LIST_MODULES
  }
}
