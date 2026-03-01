import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { AbandonGameSessionUseCase } from '@/application/use-cases/game-session/abandon-game-session.use-case'
import { CompleteGameSessionUseCase } from '@/application/use-cases/game-session/complete-game-session.use-case'
import { GetLastSessionWithDetailsUseCase } from '@/application/use-cases/game-session/get-last-session-with-details.use-case'
import { StartGameSessionUseCase } from '@/application/use-cases/game-session/start-game-session.use-case'
import { paginationMiddleware, paginationSchema } from '@/infrastructure/middlewares/pagination.middleware'
import { GameSessionRepository } from '@/infrastructure/repositories/game-session.repository'
import { GameRepository } from '@/infrastructure/repositories/game.repository'
import type { Routes } from '@/domain/types'

const gameSessionStatusEnum = z.enum(['in_progress', 'completed', 'abandoned'])

export class GameSessionController implements Routes {
  public controller: OpenAPIHono
  private gameSessionRepository: GameSessionRepository
  private gameRepository: GameRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.gameSessionRepository = new GameSessionRepository()
    this.gameRepository = new GameRepository()
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.use('/v1/game-sessions', paginationMiddleware)

    // List game sessions
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/game-sessions',
        tags: ['Game Sessions'],
        summary: 'List game sessions',
        description: 'Get a paginated list of game sessions',
        request: {
          query: paginationSchema.extend({
            childId: z.string().uuid().optional(),
            gameId: z.string().uuid().optional(),
            status: gameSessionStatusEnum.optional()
          })
        },
        responses: {
          200: {
            description: 'Game sessions retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    items: z.array(
                      z.object({
                        id: z.string(),
                        childId: z.string(),
                        gameId: z.string(),
                        status: gameSessionStatusEnum,
                        score: z.number().optional(),
                        duration: z.number().optional(),
                        startedAt: z.string(),
                        completedAt: z.string().optional(),
                        createdAt: z.string(),
                        updatedAt: z.string()
                      })
                    ),
                    total: z.number(),
                    page: z.number(),
                    limit: z.number(),
                    totalPages: z.number()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const pagination = c.get('pagination')
          const query = c.req.valid('query')

          let sessions = await this.gameSessionRepository.findAll(pagination)

          // Filter by childId if specified
          if (query.childId) {
            sessions = sessions.filter((session) => session.childId === query.childId)
          }

          // Filter by gameId if specified
          if (query.gameId) {
            sessions = sessions.filter((session) => session.gameId === query.gameId)
          }

          // Filter by status if specified
          if (query.status) {
            sessions = sessions.filter((session) => session.status === query.status)
          }

          const total = sessions.length
          const totalPages = Math.ceil(total / pagination.limit)

          return c.json({
            success: true,
            data: {
              items: sessions.map((session) => ({
                ...session,
                duration: session.duration || 0,
                startedAt: session.startedAt.toISOString(),
                completedAt: session.endedAt?.toISOString(),
                createdAt: session.createdAt.toISOString(),
                updatedAt: session.updatedAt.toISOString()
              })),
              total,
              page: pagination.page,
              limit: pagination.limit,
              totalPages
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Get sessions by child ID
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/game-sessions',
        tags: ['Game Sessions'],
        summary: 'Get sessions by child',
        description: 'Get all game sessions for a specific child',
        request: {
          params: z.object({
            childId: z.string().uuid()
          }),
          query: z.object({
            status: gameSessionStatusEnum.optional()
          })
        },
        responses: {
          200: {
            description: 'Game sessions retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.array(
                    z.object({
                      id: z.string(),
                      childId: z.string(),
                      gameId: z.string(),
                      status: gameSessionStatusEnum,
                      score: z.number().optional(),
                      timeSpent: z.number().optional(),
                      startedAt: z.string(),
                      completedAt: z.string().optional(),
                      createdAt: z.string(),
                      updatedAt: z.string(),
                      game: z.object({
                        id: z.string(),
                        name: z.string(),
                        type: z.string()
                      })
                    })
                  )
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { childId } = c.req.param()
          const query = c.req.valid('query')

          let sessions = await this.gameSessionRepository.findByChildId(childId)

          // Filter by status if specified
          if (query.status) {
            sessions = sessions.filter((session) => session.status === query.status)
          }

          // Get game details for each session
          const sessionsWithGames = await Promise.all(
            sessions.map(async (session) => {
              const game = await this.gameRepository.findById(session.gameId)
              return {
                ...session,
                startedAt: session.startedAt.toISOString(),
                completedAt: session.endedAt?.toISOString(),
                createdAt: session.createdAt.toISOString(),
                updatedAt: session.updatedAt.toISOString(),
                game: game
                  ? {
                      id: game.id,
                      name: game.title
                    }
                  : null
              }
            })
          )

          return c.json({
            success: true,
            data: sessionsWithGames.filter((session) => session.game !== null)
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Get session by ID
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/game-sessions/{id}',
        tags: ['Game Sessions'],
        summary: 'Get session by ID',
        description: 'Get a game session by its ID',
        request: {
          params: z.object({
            id: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Game session retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    childId: z.string(),
                    gameId: z.string(),
                    status: gameSessionStatusEnum,
                    score: z.number().optional(),
                    timeSpent: z.number().optional(),
                    startedAt: z.string(),
                    completedAt: z.string().optional(),
                    createdAt: z.string(),
                    updatedAt: z.string()
                  })
                })
              }
            }
          },
          404: {
            description: 'Game session not found',
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

          const session = await this.gameSessionRepository.findById(id)
          if (!session) {
            return c.json({ success: false, error: 'Game session not found' }, 404)
          }

          return c.json({
            success: true,
            data: {
              ...session,
              startedAt: session.startedAt.toISOString(),
              completedAt: session.endedAt?.toISOString(),
              createdAt: session.createdAt.toISOString(),
              updatedAt: session.updatedAt.toISOString()
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Start game session
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/game-sessions/start',
        tags: ['Game Sessions'],
        summary: 'Start game session',
        description: 'Start a new game session for a child',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  childId: z.string().uuid(),
                  gameId: z.string().uuid()
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Game session started successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    childId: z.string(),
                    gameId: z.string(),
                    status: gameSessionStatusEnum,
                    startedAt: z.string(),
                    createdAt: z.string(),
                    updatedAt: z.string()
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
          }
        }
      }),
      async (c: any) => {
        try {
          const body = await c.req.json()
          const startGameSessionUseCase = new StartGameSessionUseCase(this.gameSessionRepository)
          const result = await startGameSessionUseCase.execute(body)
          return c.json(result, 201)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Complete game session
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/game-sessions/{id}/complete',
        tags: ['Game Sessions'],
        summary: 'Complete game session',
        description: 'Complete a game session with score and time',
        request: {
          params: z.object({
            id: z.string().uuid()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  score: z.number().min(0).optional(),
                  duration: z.number().min(0).optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Game session completed successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    childId: z.string(),
                    gameId: z.string(),
                    status: gameSessionStatusEnum,
                    score: z.number().optional(),
                    timeSpent: z.number().optional(),
                    startedAt: z.string(),
                    completedAt: z.string(),
                    createdAt: z.string(),
                    updatedAt: z.string()
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
            description: 'Game session not found',
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
          const body = await c.req.json()

          const completeGameSessionUseCase = new CompleteGameSessionUseCase(this.gameSessionRepository)
          const result = await completeGameSessionUseCase.execute({
            sessionId: id,
            ...body
          })

          return c.json(result)
        } catch (error: any) {
          if (error.message === 'Game session not found') {
            return c.json({ success: false, error: error.message }, 404)
          }
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Abandon game session
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/game-sessions/{id}/abandon',
        tags: ['Game Sessions'],
        summary: 'Abandon game session',
        description: 'Mark a game session as abandoned',
        request: {
          params: z.object({
            id: z.string().uuid()
          }),

          body: {
            content: {
              'application/json': {
                schema: z.object({
                  duration: z.number().min(0).optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Game session abandoned successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    status: gameSessionStatusEnum
                  })
                })
              }
            }
          },
          404: {
            description: 'Game session not found',
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
          const body = await c.req.json()

          const abandonGameSessionUseCase = new AbandonGameSessionUseCase(this.gameSessionRepository)
          const result = await abandonGameSessionUseCase.execute({ sessionId: id, duration: body.duration })

          if (!result.success) {
            if (result.error === 'Session not found') {
              return c.json({ success: false, error: result.error }, 404)
            }
            return c.json({ success: false, error: result.error }, 400)
          }

          return c.json({
            success: true,
            data: {
              id: result.data.id,
              status: result.data.status
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Get last session with details for a child
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/last-session',
        tags: ['Game Sessions'],
        summary: 'Get last session with details',
        description:
          'Get the last game session of a child with complete details (module, lesson, game, and session time)',
        request: {
          params: z.object({
            childId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Last session retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z
                    .object({
                      id: z.string(),
                      childId: z.string(),
                      startedAt: z.string(),
                      endedAt: z.string().optional(),
                      success: z.boolean().optional(),
                      status: z.enum(['in_progress', 'completed', 'blocked', 'abandoned']),
                      sessionDate: z.string().optional(),
                      totalTime: z.number().optional().describe('Total session time in minutes'),
                      game: z.object({
                        id: z.string(),
                        title: z.string(),
                        coverUrl: z.string().optional()
                      }),
                      lesson: z.object({
                        id: z.string(),
                        title: z.string(),
                        order: z.number()
                      }),
                      module: z.object({
                        id: z.string(),
                        name: z.string(),
                        coverUrl: z.string().optional()
                      }),
                      duration: z.number(),
                      createdAt: z.string(),
                      updatedAt: z.string()
                    })
                    .nullable()
                })
              }
            }
          },
          400: {
            description: 'Invalid request',
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
            description: 'No sessions found for this child',
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
          const { childId } = c.req.param()

          const getLastSessionUseCase = new GetLastSessionWithDetailsUseCase(this.gameSessionRepository)
          const result = await getLastSessionUseCase.execute({ childId })

          if (!result.success) {
            return c.json({ success: false, error: result.error }, 400)
          }

          if (!result.data) {
            return c.json({
              success: true,
              data: null
            })
          }

          return c.json({
            success: true,
            data: {
              id: result.data.id,
              childId: result.data.childId,
              startedAt: result.data.startedAt.toISOString(),
              endedAt: result.data.endedAt?.toISOString(),
              success: result.data.success,
              status: result.data.status,
              sessionDate: result.data.sessionDate?.toISOString(),
              totalTime: result.data.totalTime,
              game: {
                id: result.data.game.id,
                title: result.data.game.title,
                coverUrl: result.data.game.coverUrl ? result.data.game.coverUrl : undefined
              },
              lesson: {
                id: result.data.lesson.id,
                title: result.data.lesson.title,
                order: result.data.lesson.order
              },
              module: {
                id: result.data.module.id,
                name: result.data.module.name,
                coverUrl: result.data.module.coverUrl ? result.data.module.coverUrl : undefined
              },
              duration: result.data.duration || 0,
              createdAt: result.data.createdAt.toISOString(),
              updatedAt: result.data.updatedAt.toISOString()
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
