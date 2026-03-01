import type { Game } from '../models/game.model'

export interface GameRepositoryInterface {
  findById: (id: string) => Promise<Game | null>
  findAll: (pagination?: { skip: number; limit: number }) => Promise<Game[]>
  findByLessonId: (lessonId: string) => Promise<Game[]>
  findWithSearch: (
    search?: string,
    pagination?: { skip: number; limit: number }
  ) => Promise<
    Array<
      Game & {
        lessonTitle: string
        lessonOrder: number
        moduleId: string
        moduleTitle: string
        moduleDescription: string | null
      }
    >
  >
  countWithSearch: (search?: string) => Promise<number>
  findPrerequisites: (gameId: string) => Promise<Game[]>
  addPrerequisite: (gameId: string, prerequisiteGameId: string) => Promise<void>
  removePrerequisite: (gameId: string, prerequisiteGameId: string) => Promise<void>
  create: (data: Omit<Game, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Game>
  update: (id: string, data: Partial<Omit<Game, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Game>
  delete: (id: string) => Promise<boolean>
  count: () => Promise<number>
  updateGamesOrder: (lessonId: string, orderedGameIds: string[]) => Promise<void>
}
