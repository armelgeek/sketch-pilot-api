import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'
import type { LessonRepositoryInterface } from '@/domain/repositories/lesson.repository.interface'

export type GameStatus = 'blocked' | 'completed' | 'in_progress' | 'not_started'

export async function getGameStatusForChild({
  game,
  childSessions,
  gameRepository,
  lessonRepository
}: {
  game: any
  childSessions: any[]
  gameRepository: GameRepositoryInterface
  lessonRepository: LessonRepositoryInterface
}): Promise<GameStatus> {
  // Prérequis jeu
  const prerequisites = await gameRepository.findPrerequisites(game.id)
  let gamePrerequisitesMet = true
  if (prerequisites.length > 0) {
    for (const prerequisite of prerequisites) {
      const prereqSession = childSessions.find(
        (session) => session.gameId === prerequisite.id && session.status === 'completed'
      )
      if (!prereqSession) {
        gamePrerequisitesMet = false
      }
    }
  }
  // Prérequis leçon
  let lessonPrerequisitesMet = true
  const currentLesson = await lessonRepository.findById(game.lessonId)
  if (currentLesson) {
    const allLessonsInModule = await lessonRepository.findByModuleId(currentLesson.moduleId)
    const sortedLessons = allLessonsInModule.sort((a, b) => a.order - b.order)
    const currentLessonIndex = sortedLessons.findIndex((lesson) => lesson.id === currentLesson.id)
    const previousLessons = sortedLessons.slice(0, currentLessonIndex)
    for (const lesson of previousLessons) {
      const gamesInLesson = await gameRepository.findByLessonId(lesson.id)
      for (const gameInLesson of gamesInLesson) {
        const gameSession = childSessions.find(
          (session) => session.gameId === gameInLesson.id && session.status === 'completed'
        )
        if (!gameSession) {
          lessonPrerequisitesMet = false
        }
      }
    }
  }
  const prerequisitesMet = gamePrerequisitesMet && lessonPrerequisitesMet
  const gameSessions = childSessions.filter((session) => session.gameId === game.id)
  if (gameSessions.length > 0) {
    // Trier les sessions par date de début ou de fin (la plus récente d'abord)
    const sorted = [...gameSessions].sort((a, b) => {
      const aDate = a.endedAt ? new Date(a.endedAt) : new Date(a.startedAt)
      const bDate = b.endedAt ? new Date(b.endedAt) : new Date(b.startedAt)
      return bDate.getTime() - aDate.getTime()
    })
    const latest = sorted[0]
    if (latest.status === 'completed') {
      return 'completed'
    } else if (latest.status === 'in_progress') {
      return 'in_progress'
    } else if (!prerequisitesMet) {
      return 'blocked'
    } else {
      return 'not_started'
    }
  } else if (!prerequisitesMet) {
    return 'blocked'
  } else {
    return 'not_started'
  }
}
