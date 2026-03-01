import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'
import type { ModuleRepositoryInterface } from '@/domain/repositories/module.repository.interface'

type Params = {
  childId: string
  search?: string
  page?: number
  limit?: number
}

type ModuleProgress = {
  id: string
  name: string
  coverUrl?: string
  description?: string
  totalGames: number
  completedGames: number
  inProgressGames: number
  notStartedGames: number
  availableGames: number
  blockedGames: number
  progressPercentage: number
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked'
}

type Response = {
  childId: string
  modules: ModuleProgress[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  stats: {
    totalModules: number
    completedModules: number
    totalGames: number
    completedGames: number
    overallPercentage: number
  }
  success: boolean
  error?: string
}

export class GetChildModulesWithProgressUseCase extends IUseCase<Params, Response> {
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
      // 1. Configuration de la pagination
      const page = params.page || 1
      const limit = params.limit || 10
      const skip = (page - 1) * limit

      // 2. Récupérer le nombre total de modules (avec recherche si fournie)
      const totalModules = await this.moduleRepository.countWithSearchWithActiveStatus(params.search, true)

      // 3. Récupérer les modules avec pagination et recherche
      const modules = await this.moduleRepository.findWithSearchWithActiveStatus(params.search, true, {
        skip,
        limit
      })

      // 4. Récupérer toutes les sessions de l'enfant une seule fois
      const childSessions = await this.gameSessionRepository.findByChildId(params.childId)

      // 5. Traiter chaque module
      const modulesProgress: ModuleProgress[] = []
      let overallTotalGames = 0
      let overallCompletedGames = 0
      let completedModules = 0

      for (const module of modules) {
        // Récupérer toutes les leçons du module
        const lessons = await this.lessonRepository.findByModuleId(module.id)

        let totalGames = 0
        let completedGames = 0
        let inProgressGames = 0
        let notStartedGames = 0
        let availableGames = 0
        let blockedGames = 0

        // Traiter chaque leçon
        const hasStartedGames = false
        for (const lesson of lessons.sort((a, b) => a.order - b.order)) {
          const games = await this.gameRepository.findByLessonId(lesson.id)
          totalGames += games.length

          for (const game of games) {
            // Vérifier les prérequis du jeu
            const prerequisites = await this.gameRepository.findPrerequisites(game.id)
            const prerequisitesMet = await this.checkPrerequisitesMet(prerequisites, childSessions)

            // Récupérer toutes les sessions de ce jeu pour cet enfant
            const gameSessions = childSessions.filter((session) => session.gameId === game.id)
            let latestSession = null
            if (gameSessions.length > 0) {
              latestSession = [...gameSessions].sort((a, b) => {
                const aDate = a.endedAt ? new Date(a.endedAt) : new Date(a.startedAt)
                const bDate = b.endedAt ? new Date(b.endedAt) : new Date(b.startedAt)
                return bDate.getTime() - aDate.getTime()
              })[0]
            }

            if (prerequisitesMet) {
              if (latestSession?.status === 'completed') {
                completedGames++
              } else if (latestSession?.status === 'in_progress' || latestSession?.status === 'abandoned') {
                inProgressGames++
              } else {
                notStartedGames++
              }
              availableGames++ // tous les jeux débloqués (inclut in_progress, completed, not_started, abandoned)
            } else {
              blockedGames++
            }
          }
        }

        overallTotalGames += totalGames
        overallCompletedGames += completedGames

        // Calculer le statut et pourcentage du module
        const progressPercentage = totalGames > 0 ? Math.round((completedGames / totalGames) * 100) : 0
        let status: 'not_started' | 'in_progress' | 'completed' | 'blocked' = 'not_started'

        // Debug temporaire

        if (totalGames === 0) {
          status = 'not_started'
        } else if (completedGames === totalGames) {
          status = 'completed'
          completedModules++
        } else if (hasStartedGames || completedGames > 0) {
          // Le module est en cours si l'enfant a commencé au moins un jeu OU il y a des jeux complétés
          status = 'in_progress'
        } else if (availableGames > 0) {
          // Des jeux sont disponibles mais aucun n'a été commencé = à découvrir
          status = 'not_started'
        } else {
          // Aucun jeu disponible = module bloqué
          status = 'blocked'
        }

        modulesProgress.push({
          id: module.id,
          name: module.name,
          coverUrl: module.coverUrl,
          description: module.description,
          totalGames,
          completedGames,
          inProgressGames,
          notStartedGames,
          availableGames,
          blockedGames,
          progressPercentage,
          status
        })
      }

      // 4. Calculer les statistiques globales
      const overallPercentage =
        overallTotalGames > 0 ? Math.round((overallCompletedGames / overallTotalGames) * 100) : 0

      // 5. Calculer les informations de pagination
      const totalPages = Math.ceil(totalModules / limit)

      return {
        childId: params.childId,
        modules: modulesProgress,
        pagination: {
          page,
          limit,
          total: totalModules,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        stats: {
          totalModules,
          completedModules,
          totalGames: overallTotalGames,
          completedGames: overallCompletedGames,
          overallPercentage
        },
        success: true
      }
    } catch (error: any) {
      return {
        childId: params.childId,
        modules: [],
        pagination: {
          page: params.page || 1,
          limit: params.limit || 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        },
        stats: {
          totalModules: 0,
          completedModules: 0,
          totalGames: 0,
          completedGames: 0,
          overallPercentage: 0
        },
        success: false,
        error: error.message || 'Failed to get modules progress'
      }
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

  log(): ActivityType {
    return ActivityType.LIST_MODULES
  }
}
