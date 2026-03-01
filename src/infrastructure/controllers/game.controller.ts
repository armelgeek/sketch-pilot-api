import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { SearchGamesUseCase } from '@/application/use-cases/game/search-games.use-case'

import { GameSessionRepository } from '@/infrastructure/repositories/game-session.repository'
import { GameRepository } from '@/infrastructure/repositories/game.repository'
import { LessonRepository } from '@/infrastructure/repositories/lesson.repository'
import type { Routes } from '@/domain/types'

export class GameController implements Routes {
  public controller: OpenAPIHono
  private searchGamesUseCase: SearchGamesUseCase

  constructor() {
    this.controller = new OpenAPIHono()
    this.searchGamesUseCase = new SearchGamesUseCase(
      new GameRepository(),
      new GameSessionRepository(),
      new LessonRepository()
    )
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/games/search',
        tags: ['Games'],
        summary: 'Rechercher des jeux pour un enfant',
        description: 'Recherche de jeux par mot-clé pour un enfant, avec statut et contexte.',
        request: {
          params: z.object({
            childId: z.string().uuid()
          }),
          query: z.object({
            search: z.string().optional(),
            page: z.string().optional(),
            limit: z.string().optional()
          })
        },
        responses: {
          200: {
            description: 'Liste des jeux trouvés',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  games: z.array(
                    z.object({
                      id: z.string(),
                      title: z.string(),
                      file: z.string().optional(),
                      coverUrl: z.string().optional(),
                      lessonId: z.string(),
                      lessonTitle: z.string(),
                      lessonOrder: z.number(),
                      moduleId: z.string(),
                      moduleTitle: z.string(),
                      moduleDescription: z.string().optional(),
                      status: z.enum(['available', 'blocked', 'completed', 'in_progress', 'not_started']),
                      prerequisitesMet: z.boolean(),
                      hasPrerequisites: z.boolean(),
                      prerequisitesCount: z.number(),
                      completedPrerequisites: z.number(),
                      canStart: z.boolean(),
                      completedAt: z.string().optional(),
                      lastPlayedAt: z.string().optional(),
                      totalSessions: z.number(),
                      createdAt: z.date(),
                      updatedAt: z.date()
                    })
                  ),
                  pagination: z.object({
                    page: z.number(),
                    limit: z.number(),
                    total: z.number(),
                    totalPages: z.number(),
                    hasNext: z.boolean(),
                    hasPrev: z.boolean()
                  })
                })
              }
            }
          },
          404: {
            description: 'Aucun jeu trouvé',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  games: z.array(z.any()),
                  message: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const { childId } = c.req.valid('param')
        const { search, page, limit } = c.req.valid('query')
        const result = await this.searchGamesUseCase.execute({
          childId,
          search,
          page: page ? Number.parseInt(page) : 1,
          limit: limit ? Number.parseInt(limit) : 20
        })
        if (result.success && result.games.length > 0) {
          return c.json({ success: true, games: result.games, pagination: result.pagination })
        }
        return c.json({ success: false, games: [], message: 'Aucun jeu trouvé' }, 404)
      }
    )
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/games/{id}',
        tags: ['Games'],
        summary: 'Get game by ID for child',
        description: 'Get a game by its ID for a child, with prerequisites',
        request: {
          params: z.object({
            childId: z.string().uuid(),
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Game retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    title: z.string(),
                    file: z.string().optional(),
                    coverUrl: z.string().optional(),
                    lessonId: z.string(),
                    lessonTitle: z.string(),
                    lessonOrder: z.number(),
                    moduleId: z.string(),
                    moduleTitle: z.string(),
                    moduleDescription: z.string().optional(),
                    createdAt: z.date(),
                    updatedAt: z.date(),
                    prerequisites: z.array(
                      z.object({
                        id: z.string(),
                        title: z.string(),
                        coverUrl: z.string().optional()
                      })
                    )
                  })
                })
              }
            }
          },
          404: {
            description: 'Game not found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const gameRepository = new GameRepository()
        const lessonRepository = new LessonRepository()
        const game = await gameRepository.findById(id)
        if (!game) {
          return c.json({ success: false, error: 'Game not found' }, 404)
        }
        const prerequisites = await gameRepository.findPrerequisites(id)
        // Optionally enrich with lesson/module info
        let lessonTitle = ''
        let lessonOrder = 0
        let moduleId = ''
        const moduleTitle = ''
        const moduleDescription = ''
        if (game.lessonId) {
          const lesson = await lessonRepository.findById(game.lessonId)
          if (lesson) {
            lessonTitle = lesson.title
            lessonOrder = lesson.order
            moduleId = lesson.moduleId
            // Get module info if needed
            // ...
          }
        }
        return c.json({
          success: true,
          data: {
            ...game,
            lessonTitle,
            lessonOrder,
            moduleId,
            moduleTitle,
            moduleDescription,
            prerequisites: prerequisites.map((pr) => ({
              id: pr.id,
              title: pr.title,
              coverUrl: pr.coverUrl
            }))
          }
        })
      }
    )
    // Servir les fichiers de jeu Unity extraits
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/games/{gameId}/play',
        tags: ['Games'],
        summary: 'Play game',
        description: 'Serve the extracted Unity game files',
        request: {
          params: z.object({
            gameId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Game content served',
            content: {
              'text/html': {
                schema: z.any()
              }
            }
          },
          404: {
            description: 'Game not found',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const { gameId } = c.req.param()
        const gameRepository = new GameRepository()
        const game = await gameRepository.findById(gameId)
        if (!game) {
          return c.json({ success: false, error: 'Game not found' }, 404)
        }
        if (!game.file || typeof game.file !== 'string' || !game.file.startsWith('http')) {
          return c.json({ success: false, error: 'No MinIO URL found for this game' }, 400)
        }
        // Extraction du nom du dossier parent de index.html ou Build/ dans game.file
        const extractGameFolderName = (url: string): { baseUrl: string; name: string } | null => {
          const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url
          // Cherche le dossier parent de index.html ou Build/
          // Ex: .../bucket/game-slug/Build/index.html
          const match = cleanUrl.match(/^(.*\/)(Build\/)?index\.html$/)
          if (match) {
            let baseUrl = match[1]
            if (baseUrl.endsWith('Build/')) baseUrl = baseUrl.slice(0, -'Build/'.length)
            const parts = baseUrl.split('/').filter(Boolean)
            const name = parts.length > 0 ? (parts.at(-1) as string) : 'game'
            return { baseUrl, name }
          }
          // Cas: .../Build/ (pas d'index.html)
          const buildDirMatch = cleanUrl.match(/^(.*\/)(Build\/)$/)
          if (buildDirMatch) {
            let baseUrl = buildDirMatch[1]
            if (baseUrl.endsWith('Build/')) baseUrl = baseUrl.slice(0, -'Build/'.length)
            const parts = baseUrl.split('/').filter(Boolean)
            const name = parts.length > 0 ? (parts.at(-1) as string) : 'game'
            return { baseUrl, name }
          }
          // Fallback: dernier dossier avant le dernier slash
          const parts = cleanUrl.split('/').filter(Boolean)
          if (parts.length > 1) {
            const name = parts.at(-2) as string
            const baseUrl = `${parts.slice(0, -1).join('/')}/`
            return { baseUrl, name }
          }
          return null
        }
        const parsed = extractGameFolderName(game.file)
        if (!parsed) {
          return c.json({ success: false, error: 'Unable to extract game folder name from MinIO URL' }, 400)
        }
        const { baseUrl, name } = parsed
        const createUnityConfig = (base: string, name: string, game: any) => ({
          name,
          loaderUrl: `${base}Build/${name}.loader.js`,
          dataUrl: `${base}Build/${name}.data.br`,
          frameworkUrl: `${base}Build/${name}.framework.js.br`,
          codeUrl: `${base}Build/${name}.wasm.br`,
          streamingAssetsUrl: `${base}StreamingAssets`,
          id: game.id,
          title: game.title,
          coverUrl: game.coverUrl,
          lessonId: game.lessonId,
          createdAt: game.createdAt,
          updatedAt: game.updatedAt
        })
        return c.json(createUnityConfig(baseUrl, name, game))
      }
    )
  }
}
