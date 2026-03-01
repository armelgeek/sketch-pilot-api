import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { CreateGameWithBackgroundUseCase } from '@/application/use-cases/game/create-game-with-background.use-case'
import { DeleteGameUseCase } from '@/application/use-cases/game/delete-game.use-case'
import { UpdateGameUseCase } from '@/application/use-cases/game/update-game.use-case'
import { Actions, Subjects } from '@/domain/types/permission.type'
import { GameRepository } from '@/infrastructure/repositories/game.repository'
import { LessonRepository } from '@/infrastructure/repositories/lesson.repository'
import type { Routes } from '@/domain/types'
import { GameCoverService } from '../../application/services/game-cover.service'
import { GameFileService } from '../../application/services/game-file.service'
import { checkPermission } from '../middlewares/permission.middleware'

export class AdminGameController implements Routes {
  public controller: OpenAPIHono
  private gameRepository: GameRepository
  private lessonRepository: LessonRepository
  private gameFileService: GameFileService
  private gameCoverService: GameCoverService

  constructor() {
    this.controller = new OpenAPIHono()
    this.gameRepository = new GameRepository()
    this.lessonRepository = new LessonRepository()
    this.gameFileService = new GameFileService()
    this.gameCoverService = new GameCoverService()
    this.initRoutes()
  }

  public initRoutes() {
    // Permissions: MODULE - READ/CREATE/UPDATE/DELETE (Games are part of modules/lessons)
    this.controller.use('/v1/admin/games', (c, next) => {
      switch (c.req.method) {
        case 'GET':
          return checkPermission(Subjects.MODULE, Actions.READ)(c, next)
        case 'POST':
          return checkPermission(Subjects.MODULE, Actions.CREATE)(c, next)
        case 'PUT':
          return checkPermission(Subjects.MODULE, Actions.UPDATE)(c, next)
        case 'DELETE':
          return checkPermission(Subjects.MODULE, Actions.DELETE)(c, next)
        default:
          return next()
      }
    })
    this.controller.use('/v1/admin/lessons', (c, next) => {
      switch (c.req.method) {
        case 'GET':
          return checkPermission(Subjects.MODULE, Actions.READ)(c, next)
        case 'POST':
          return checkPermission(Subjects.MODULE, Actions.CREATE)(c, next)
        default:
          return next()
      }
    })
    // Get game cover
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/games/cover/{id}',
        tags: ['Games'],
        summary: 'Get game cover',
        description: 'Get a game cover by its ID.',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Game cover retrieved successfully',
            content: {
              'image/*': {
                schema: z.any()
              }
            }
          },
          404: {
            description: 'Game cover not found',
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
        try {
          const { id } = c.req.param()
          const gameCover = await this.gameCoverService.getGameCoverFile(id)

          if (!gameCover) {
            return c.json({ success: false, error: 'game cover not found' }, 404)
          }

          // Redirection vers l'URL MinIO
          return c.redirect(gameCover.url)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
    // Get games by lesson
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/lessons/{lessonId}/games',
        tags: ['Games'],
        summary: 'Get games by lesson',
        description: 'Get all games for a specific lesson',
        request: {
          params: z.object({
            lessonId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Games retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.array(
                    z.object({
                      id: z.string(),
                      title: z.string(),
                      file: z.string().optional(),
                      coverUrl: z.string().optional(),
                      lessonId: z.string(),
                      createdAt: z.string(),
                      updatedAt: z.string(),
                      prerequisites: z.array(
                        z.object({
                          id: z.string(),
                          title: z.string(),
                          coverUrl: z.string().optional()
                        })
                      )
                    })
                  )
                })
              }
            }
          },
          404: {
            description: 'Lesson not found',
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
        try {
          const { lessonId } = c.req.param()

          const lesson = await this.lessonRepository.findById(lessonId)
          if (!lesson) {
            return c.json({ success: false, error: 'Lesson not found' }, 404)
          }

          const games = await this.gameRepository.findByLessonId(lessonId)
          const data = await Promise.all(
            games.map(async (game) => {
              const prerequisites = await this.gameRepository.findPrerequisites(game.id)
              return {
                ...game,
                coverUrl: game.coverUrl,
                createdAt: game.createdAt.toISOString(),
                updatedAt: game.updatedAt.toISOString(),
                prerequisites: prerequisites.map((pr) => ({
                  id: pr.id,
                  title: pr.title,
                  coverUrl: pr.coverUrl
                }))
              }
            })
          )

          return c.json({
            success: true,
            data
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Get game by ID
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/games/{id}',
        tags: ['Games'],
        summary: 'Get game by ID',
        description: 'Get a game by its ID',
        request: {
          params: z.object({
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
                    createdAt: z.string(),
                    updatedAt: z.string(),
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
        try {
          const { id } = c.req.param()

          const game = await this.gameRepository.findById(id)
          if (!game) {
            return c.json({ success: false, error: 'Game not found' }, 404)
          }

          const prerequisites = await this.gameRepository.findPrerequisites(id)

          return c.json({
            success: true,
            data: {
              ...game,
              coverUrl: game.coverUrl,
              createdAt: game.createdAt.toISOString(),
              updatedAt: game.updatedAt.toISOString(),
              prerequisites: prerequisites.map((pr) => ({
                id: pr.id,
                title: pr.title,
                coverUrl: pr.coverUrl
              }))
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Create game in lesson
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/lessons/{lessonId}/games',
        tags: ['Games'],
        summary: 'Create game in lesson',
        description: 'Create a new game in a specific lesson',
        request: {
          params: z.object({
            lessonId: z.string().uuid()
          }),
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  title: z.string().min(1).describe('Game title'),
                  file: z.any().optional().describe('Game file (optional)'),
                  cover: z.any().optional().describe('Game cover image (optional)'),
                  prerequisites: z
                    .string()
                    .optional()
                    .describe('Comma-separated list of prerequisite game IDs (optional)')
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Game created successfully',
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
                    createdAt: z.string(),
                    updatedAt: z.string(),
                    extractionStatus: z.string().optional(),
                    processingStatus: z.string().optional(),
                    message: z.string().optional()
                  })
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          },
          404: {
            description: 'Lesson not found',
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
        try {
          console.info('[CREATE GAME] Début de la création du jeu')
          const { lessonId } = c.req.param()
          const formData = await c.req.formData()
          const title = formData.get('title') as string
          const gameFile = formData.get('file') as File | null
          const coverFile = formData.get('cover') as File | null
          const prerequisitesStr = formData.get('prerequisites') as string | null

          console.info(`[CREATE GAME] Données reçues: title=${title}, file=${gameFile?.name}, cover=${coverFile?.name}`)

          if (!title) {
            return c.json({ success: false, error: 'Title is required' }, 400)
          }

          console.info('[CREATE GAME] Vérification de la leçon...')
          const lesson = await this.lessonRepository.findById(lessonId)
          if (!lesson) {
            return c.json({ success: false, error: 'Lesson not found' }, 404)
          }

          // Validate prerequisites if provided
          let prerequisiteIds: string[] = []
          if (prerequisitesStr && prerequisitesStr.trim()) {
            console.info('[CREATE GAME] Validation des prérequis...')
            prerequisiteIds = prerequisitesStr
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id !== '')

            // Validate that all prerequisite games exist
            for (const prereqId of prerequisiteIds) {
              const prereqGame = await this.gameRepository.findById(prereqId)
              if (!prereqGame) {
                return c.json({ success: false, error: `Prerequisite game with ID ${prereqId} not found` }, 400)
              }
            }
          }

          // Utilisation du nouveau use case (cover synchrone, ZIP en background)
          const createGameWithBackgroundUseCase = new CreateGameWithBackgroundUseCase(
            this.gameRepository,
            this.gameCoverService
          )
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const { result, activityLogId } = await createGameWithBackgroundUseCase.run({
            currentUserId: c.get('user').id,
            title,
            file: gameFile ?? undefined,
            coverFile: coverFile ?? undefined,
            lessonId,
            status: 'success',
            ipAddress
          })

          if (!result.success) {
            if (activityLogId) {
              await createGameWithBackgroundUseCase.updateActivityResource(activityLogId, undefined, 'games', 'error')
            }
            console.error('[CREATE GAME] Erreur création jeu (background)')
            return c.json({ success: false, error: result.error || 'Failed to create game' }, 400)
          }

          // Ajout des prérequis si spécifiés
          if (prerequisiteIds.length > 0) {
            console.info('[CREATE GAME] Ajout des prérequis...')
            for (const prereqId of prerequisiteIds) {
              await this.gameRepository.addPrerequisite(result.data.id, prereqId)
            }
          }

          // Mise à jour du log d'activité avec l'id du jeu créé
          if (activityLogId) {
            await createGameWithBackgroundUseCase.updateActivityResource(activityLogId, result.data.id, 'game')
          }

          console.info('[CREATE GAME] Jeu créé avec succès (background):', result.data.id)
          return c.json(
            {
              success: true,
              data: {
                ...result.data,
                createdAt: result.data.createdAt.toISOString(),
                updatedAt: result.data.updatedAt.toISOString()
              }
            },
            201
          )
        } catch (error: any) {
          console.error('[CREATE GAME] Erreur générale (background):', error)
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Update game
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/games/{id}',
        tags: ['Games'],
        summary: 'Update game',
        description: 'Update an existing game',
        request: {
          params: z.object({
            id: z.string().uuid()
          }),
          body: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  title: z.string().min(1).optional().describe('Game title'),
                  file: z.any().optional().describe('Game file (optional - replaces existing file)'),
                  cover: z.any().optional().describe('Game cover image (optional - replaces existing cover)'),
                  prerequisites: z
                    .string()
                    .optional()
                    .describe('Comma-separated list of prerequisite game IDs (optional - replaces all prerequisites)')
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Game updated successfully',
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
                    createdAt: z.string(),
                    updatedAt: z.string()
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
        try {
          const { id } = c.req.param()
          const formData = await c.req.formData()
          const title = formData.get('title') as string | null
          const gameFile = formData.get('file') as File | null
          const coverFile = formData.get('cover') as File | null
          const prerequisitesStr = formData.get('prerequisites') as string | null

          let prerequisites: string[] | undefined = undefined
          if (prerequisitesStr !== null) {
            prerequisites = prerequisitesStr.trim()
              ? prerequisitesStr
                  .split(',')
                  .map((id) => id.trim())
                  .filter((id) => id)
              : []
          }

          const updateGameUseCase = new UpdateGameUseCase(
            this.gameRepository,
            this.gameFileService,
            this.gameCoverService
          )
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const { result, activityLogId } = await updateGameUseCase.run({
            currentUserId: c.get('user').id,
            resource: 'games',
            id,
            title: title || undefined,
            file: gameFile ?? undefined,
            coverFile: coverFile ?? undefined,
            prerequisites,
            status: 'success',
            ipAddress
          })

          if (!result.success) {
            if (activityLogId) {
              await updateGameUseCase.updateActivityResource(activityLogId, id, 'game', 'error')
            }
            return c.json({ success: false, error: result.error }, 400)
          }
          // Mise à jour du log d'activité avec l'id du jeu modifié
          if (activityLogId) {
            await updateGameUseCase.updateActivityResource(activityLogId, id, 'game')
          }
          const updatedGame = result.data
          return c.json({
            success: true,
            data: {
              ...updatedGame,
              createdAt: updatedGame.createdAt.toISOString(),
              updatedAt: updatedGame.updatedAt.toISOString()
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Delete game
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/games/{id}',
        tags: ['Games'],
        summary: 'Delete game',
        description: 'Delete a game',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Game deleted successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
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
        try {
          const { id } = c.req.param()

          const game = await this.gameRepository.findById(id)
          if (!game) {
            return c.json({ success: false, error: 'Game not found' }, 404)
          }

          const deleteGameUseCase = new DeleteGameUseCase(
            this.gameRepository,
            this.gameFileService,
            this.gameCoverService
          )
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          const { result, activityLogId } = await deleteGameUseCase.run({
            currentUserId: c.get('user').id,
            resource: 'games',
            id,
            status: 'success',
            ipAddress
          })

          if (!result.success) {
            if (activityLogId) {
              await deleteGameUseCase.updateActivityResource(activityLogId, id, 'game', 'error')
            }
            return c.json({ success: false, error: result.error }, 404)
          }
          if (activityLogId) {
            await deleteGameUseCase.updateActivityResource(activityLogId, id, 'game')
          }
          return c.json({ success: true })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
