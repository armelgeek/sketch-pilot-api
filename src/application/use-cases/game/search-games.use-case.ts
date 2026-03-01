import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { GameSessionRepositoryInterface } from '@/domain/repositories/game-session.repository.interface'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'

type Params = {
  search?: string
  page?: number
  limit?: number
  childId?: string
}

type GameWithContext = {
  id: string
  title: string
  file?: string
  coverUrl?: string
  lessonId: string
  lessonTitle: string
  lessonOrder: number
  moduleId: string
  moduleTitle: string
  moduleDescription?: string
  status: 'available' | 'blocked' | 'completed' | 'in_progress' | 'not_started'
  prerequisitesMet: boolean
  hasPrerequisites: boolean
  prerequisitesCount: number
  completedPrerequisites: number
  canStart: boolean
  completedAt?: string
  lastPlayedAt?: string
  totalSessions: number
  bestScore?: number
  averageScore?: number
  createdAt: Date
  updatedAt: Date
}

type Response = {
  games: GameWithContext[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  success: boolean
  error?: string
}

export class SearchGamesUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly gameRepository: GameRepositoryInterface,
    private readonly gameSessionRepository: GameSessionRepositoryInterface,
    private readonly lessonRepository: LessonRepositoryInterface
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      // 1. Configuration de la pagination
      const page = params.page || 1
      const limit = Math.min(params.limit || 20, 100) // Max 100 items par page
      const skip = (page - 1) * limit

      // 2. Récupérer le nombre total de jeux (avec recherche si fournie)
      const totalGames = await this.gameRepository.countWithSearch(params.search)

      // 3. Récupérer les jeux avec pagination et recherche
      const games = await this.gameRepository.findWithSearch(params.search, {
        skip,
        limit
      })

      // 4. Si childId fourni, récupérer les sessions de l'enfant
      let childSessions: any[] = []
      if (params.childId) {
        childSessions = await this.gameSessionRepository.findByChildId(params.childId)
      }

      // 5. Traiter chaque jeu pour ajouter les informations de statut et prérequis
      const enrichedGames: GameWithContext[] = await Promise.all(
        games.map(async (game) => {
          // Récupérer les prérequis du jeu
          const prerequisites = await this.gameRepository.findPrerequisites(game.id)

          // Vérifier si les prérequis spécifiques du jeu sont remplis
          let gamePrerequisitesMet = true
          let completedPrerequisites = 0

          if (params.childId && prerequisites.length > 0) {
            for (const prerequisite of prerequisites) {
              const prereqSession = childSessions.find(
                (session) => session.gameId === prerequisite.id && session.status === 'completed'
              )
              if (prereqSession) {
                completedPrerequisites++
              } else {
                gamePrerequisitesMet = false
              }
            }
          }

          // Vérifier les prérequis au niveau des leçons
          let lessonPrerequisitesMet = true
          if (params.childId) {
            // Récupérer la leçon du jeu
            const currentLesson = await this.lessonRepository.findById(game.lessonId)
            if (currentLesson) {
              // Récupérer toutes les leçons du même module, triées par ordre
              const allLessonsInModule = await this.lessonRepository.findByModuleId(currentLesson.moduleId)
              const sortedLessons = allLessonsInModule.sort((a, b) => a.order - b.order)

              // Vérifier si toutes les leçons précédentes sont complétées
              const currentLessonIndex = sortedLessons.findIndex((lesson) => lesson.id === currentLesson.id)
              const previousLessons = sortedLessons.slice(0, currentLessonIndex)

              lessonPrerequisitesMet = await this.checkPreviousLessonsCompleted(
                previousLessons,
                params.childId,
                childSessions
              )
            }
          }

          // Les prérequis sont remplis si TOUS les types de prérequis sont remplis
          const prerequisitesMet = gamePrerequisitesMet && lessonPrerequisitesMet

          // Récupérer les sessions de ce jeu pour cet enfant
          const gameSessions = childSessions.filter((session) => session.gameId === game.id)
          const completedSessions = gameSessions.filter((session) => session.status === 'completed')
          const inProgressSession = gameSessions.find(
            (session) => session.status === 'in_progress' || session.status === 'abandoned'
          )

          // Calculer le statut du jeu
          let status: 'available' | 'blocked' | 'completed' | 'in_progress' | 'not_started' = 'not_started'

          if (params.childId) {
            if (completedSessions.length > 0) {
              status = 'completed'
            } else if (inProgressSession) {
              status = 'in_progress'
            } else if (prerequisitesMet) {
              status = 'available'
            } else {
              status = 'blocked'
            }
          } else {
            // Si pas d'enfant spécifié, considérer comme disponible si pas de prérequis
            status = prerequisites.length === 0 ? 'available' : 'blocked'
          }

          // Calculer les statistiques de session (sans score car pas disponible dans le modèle)
          const lastSession = gameSessions.sort(
            (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          )[0]
          const completedSession = completedSessions.sort(
            (a, b) => new Date(b.endedAt!).getTime() - new Date(a.endedAt!).getTime()
          )[0]

          return {
            id: game.id,
            title: game.title,
            file: game.file,
            coverUrl: game.coverUrl,
            lessonId: game.lessonId,
            lessonTitle: game.lessonTitle,
            lessonOrder: game.lessonOrder,
            moduleId: game.moduleId,
            moduleTitle: game.moduleTitle,
            moduleDescription: game.moduleDescription || undefined,
            status,
            prerequisitesMet,
            hasPrerequisites: prerequisites.length > 0,
            prerequisitesCount: prerequisites.length,
            completedPrerequisites,
            canStart: status === 'available' || status === 'in_progress',
            completedAt: completedSession?.endedAt?.toISOString(),
            lastPlayedAt: lastSession?.startedAt?.toISOString(),
            totalSessions: gameSessions.length,
            bestScore: undefined, // Score non disponible dans le modèle
            averageScore: undefined, // Score non disponible dans le modèle
            createdAt: game.createdAt,
            updatedAt: game.updatedAt,
            prerequisites: prerequisites.map((pr) => ({
              id: pr.id,
              title: pr.title,
              coverUrl: pr.coverUrl
            }))
          }
        })
      )

      // 6. Calculer les informations de pagination
      const totalPages = Math.ceil(totalGames / limit)

      return {
        games: enrichedGames,
        pagination: {
          page,
          limit,
          total: totalGames,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        success: true
      }
    } catch (error: any) {
      return {
        games: [],
        pagination: {
          page: params.page || 1,
          limit: params.limit || 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        },
        success: false,
        error: error.message || 'Failed to search games'
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
    return ActivityType.LIST_GAMES
  }
}
