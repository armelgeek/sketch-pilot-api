import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { GetChildActivityStatsUseCase } from '@/application/use-cases/child/get-child-activity-stats.use-case'
import { GetChildProgressSummaryUseCase } from '@/application/use-cases/child/get-child-progress-summary.use-case'
import { SearchGamesUseCase } from '@/application/use-cases/game/search-games.use-case'
import { GetChildModuleProgressUseCase } from '@/application/use-cases/module/get-child-module-progress.use-case'
import { GetChildModulesWithProgressUseCase } from '@/application/use-cases/module/get-child-modules-with-progress.use-case'
import { GameSessionRepository } from '@/infrastructure/repositories/game-session.repository'
import { GameRepository } from '@/infrastructure/repositories/game.repository'
import { LessonRepository } from '@/infrastructure/repositories/lesson.repository'
import { ModuleRepository } from '@/infrastructure/repositories/module.repository'
import type { Routes } from '@/domain/types'

export class ChildProgressController implements Routes {
  public controller: OpenAPIHono
  private moduleRepository: ModuleRepository
  private lessonRepository: LessonRepository
  private gameRepository: GameRepository
  private gameSessionRepository: GameSessionRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.moduleRepository = new ModuleRepository()
    this.lessonRepository = new LessonRepository()
    this.gameRepository = new GameRepository()
    this.gameSessionRepository = new GameSessionRepository()
    this.initRoutes()
  }

  public initRoutes() {
    // Get child modules with progress
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/modules',
        tags: ['Child Progress'],
        summary: 'Get child modules with progress',
        description: 'Get all modules with progress information for a specific child',
        request: {
          params: z.object({
            childId: z.string().uuid()
          }),
          query: z.object({
            search: z.string().optional().describe('Search term to filter modules by name or description'),
            page: z
              .string()
              .optional()
              .transform((val) => (val ? Number.parseInt(val, 10) : 1))
              .describe('Page number (default: 1)'),
            limit: z
              .string()
              .optional()
              .transform((val) => (val ? Number.parseInt(val, 10) : 10))
              .describe('Items per page (default: 10, max: 100)')
          })
        },
        responses: {
          200: {
            description: 'Child modules progress retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  childId: z.string(),
                  modules: z.array(
                    z.object({
                      id: z.string(),
                      name: z.string(),
                      coverUrl: z.string().optional(),
                      description: z.string().optional(),
                      totalGames: z.number(),
                      completedGames: z.number(),
                      inProgressGames: z.number(),
                      notStartedGames: z.number(),
                      availableGames: z.number(),
                      blockedGames: z.number(),
                      progressPercentage: z.number(),
                      status: z.enum(['not_started', 'in_progress', 'completed', 'blocked'])
                    })
                  ),
                  pagination: z.object({
                    page: z.number(),
                    limit: z.number(),
                    total: z.number(),
                    totalPages: z.number(),
                    hasNext: z.boolean(),
                    hasPrev: z.boolean()
                  }),
                  stats: z.object({
                    totalModules: z.number(),
                    completedModules: z.number(),
                    totalGames: z.number(),
                    completedGames: z.number(),
                    overallPercentage: z.number()
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
          const { childId } = c.req.param()
          const { search, page, limit } = c.req.query()

          const getChildModulesWithProgressUseCase = new GetChildModulesWithProgressUseCase(
            this.moduleRepository,
            this.lessonRepository,
            this.gameRepository,
            this.gameSessionRepository
          )

          const result = await getChildModulesWithProgressUseCase.execute({
            childId,
            search,
            page,
            limit
          })

          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Get child module detailed progress
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/modules/{moduleId}',
        tags: ['Child Progress'],
        summary: 'Get child module detailed progress',
        description: 'Get detailed progress information for a specific module and child',
        request: {
          params: z.object({
            childId: z.string().uuid(),
            moduleId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Child module progress retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  moduleId: z.string(),
                  moduleName: z.string(),
                  moduleDescription: z.string(),
                  coverUrl: z.string().optional(),
                  status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']),
                  totalLessons: z.number(),
                  totalGames: z.number(),
                  completedGames: z.number(),
                  progressPercentage: z.number(),
                  lessons: z.array(
                    z.object({
                      id: z.string(),
                      title: z.string(),
                      order: z.number(),
                      totalGames: z.number(),
                      completedGames: z.number(),
                      availableGames: z.number(),
                      blockedGames: z.number(),
                      games: z.array(
                        z.object({
                          id: z.string(),
                          title: z.string(),
                          status: z.enum(['available', 'blocked', 'completed', 'in_progress']),
                          completedAt: z.string().optional(),
                          prerequisitesMet: z.boolean(),
                          coverUrl: z.string().optional()
                        })
                      )
                    })
                  )
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
          const { childId, moduleId } = c.req.param()

          const getChildModuleProgressUseCase = new GetChildModuleProgressUseCase(
            this.moduleRepository,
            this.lessonRepository,
            this.gameRepository,
            this.gameSessionRepository
          )

          const result = await getChildModuleProgressUseCase.execute({ childId, moduleId })
          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
    // Check game availability for child
    // this.controller.openapi(
    //   createRoute({
    //     method: 'get',
    //     path: '/v1/children/{childId}/games/{gameId}/availability',
    //     tags: ['Game Availability'],
    //     summary: 'Check game availability for child',
    //     description: 'Check if a game is available for a specific child based on prerequisites',
    //     request: {
    //       params: z.object({
    //         childId: z.string().uuid(),
    //         gameId: z.string().uuid()
    //       })
    //     },
    //     responses: {
    //       200: {
    //         description: 'Game availability checked successfully',
    //         content: {
    //           'application/json': {
    //             schema: z.object({
    //               success: z.boolean(),
    //               gameId: z.string(),
    //               gameTitle: z.string(),
    //               available: z.boolean(),
    //               status: z.enum(['available', 'blocked', 'completed', 'in_progress']),
    //               reason: z.string().optional(),
    //               prerequisites: z.array(
    //                 z.object({
    //                   id: z.string(),
    //                   title: z.string(),
    //                   completed: z.boolean(),
    //                   completedAt: z.string().optional()
    //                 })
    //               ),
    //               missingPrerequisites: z.array(
    //                 z.object({
    //                   id: z.string(),
    //                   title: z.string(),
    //                   completed: z.boolean(),
    //                   completedAt: z.string().optional()
    //                 })
    //               ),
    //               canStart: z.boolean(),
    //               currentSession: z
    //                 .object({
    //                   id: z.string(),
    //                   startedAt: z.string()
    //                 })
    //                 .optional(),
    //               lastCompletion: z
    //                 .object({
    //                   completedAt: z.string(),
    //                   success: z.boolean()
    //                 })
    //                 .optional()
    //             })
    //           }
    //         }
    //       },
    //       400: {
    //         description: 'Bad request',
    //         content: {
    //           'application/json': {
    //             schema: z.object({
    //               success: z.boolean(),
    //               error: z.string()
    //             })
    //           }
    //         }
    //       }
    //     }
    //   }),
    //   async (c: any) => {
    //     try {
    //       const { childId, gameId } = c.req.param()

    //       const checkGameAvailabilityUseCase = new CheckGameAvailabilityUseCase(
    //         this.gameRepository,
    //         this.gameSessionRepository,
    //         this.lessonRepository
    //       )

    //       const result = await checkGameAvailabilityUseCase.execute({ childId, gameId })
    //       return c.json(result)
    //     } catch (error: any) {
    //       return c.json({ success: false, error: error.message }, 400)
    //     }
    //   }
    // )

    // Get all modules with progress for a child
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/modules/progress',
        tags: ['Children Progress'],
        summary: 'Get all modules with progress for a child',
        request: {
          params: z.object({
            childId: z.string().uuid('Child ID must be a valid UUID')
          }),
          query: z.object({
            search: z.string().optional().describe('Search term to filter modules by name or description')
          })
        },
        responses: {
          200: {
            description: 'Modules with progress retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    childId: z.string(),
                    totalModules: z.number(),
                    completedModules: z.number(),
                    inProgressModules: z.number(),
                    notStartedModules: z.number(),
                    overallProgressPercentage: z.number(),
                    nextAvailableGame: z
                      .object({
                        gameId: z.string(),
                        gameTitle: z.string(),
                        lessonTitle: z.string(),
                        moduleTitle: z.string()
                      })
                      .optional(),
                    modules: z.array(
                      z.object({
                        id: z.string(),
                        name: z.string(),
                        coverUrl: z.string().optional(),
                        status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']),
                        totalGames: z.number(),
                        completedGames: z.number(),
                        inProgressGames: z.number(),
                        notStartedGames: z.number(),
                        availableGames: z.number(),
                        blockedGames: z.number(),
                        progressPercentage: z.number()
                      })
                    )
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
          const { childId } = c.req.param()
          const { search } = c.req.query()

          const getChildModulesWithProgressUseCase = new GetChildModulesWithProgressUseCase(
            this.moduleRepository,
            this.lessonRepository,
            this.gameRepository,
            this.gameSessionRepository
          )

          const result = await getChildModulesWithProgressUseCase.execute({ childId, search })
          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Get detailed progress for a specific module for a child
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/modules/{moduleId}/progress',
        tags: ['Children Progress'],
        summary: 'Get detailed progress for a specific module for a child',
        request: {
          params: z.object({
            childId: z.string().uuid('Child ID must be a valid UUID'),
            moduleId: z.string().uuid('Module ID must be a valid UUID')
          })
        },
        responses: {
          200: {
            description: 'Module progress retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  moduleId: z.string(),
                  moduleName: z.string(),
                  coverUrl: z.string().optional(),
                  totalLessons: z.number(),
                  totalGames: z.number(),
                  completedGames: z.number(),
                  progressPercentage: z.number(),
                  lessons: z.array(
                    z.object({
                      id: z.string(),
                      title: z.string(),
                      order: z.number(),
                      totalGames: z.number(),
                      completedGames: z.number(),
                      availableGames: z.number(),
                      blockedGames: z.number(),
                      games: z.array(
                        z.object({
                          id: z.string(),
                          title: z.string(),
                          status: z.enum(['available', 'blocked', 'completed', 'in_progress']),
                          completedAt: z.string().optional(),
                          prerequisitesMet: z.boolean(),
                          coverUrl: z.string().optional()
                        })
                      )
                    })
                  )
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
            description: 'Module not found',
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
          const { childId, moduleId } = c.req.param()

          const getChildModuleProgressUseCase = new GetChildModuleProgressUseCase(
            this.moduleRepository,
            this.lessonRepository,
            this.gameRepository,
            this.gameSessionRepository
          )

          const result = await getChildModuleProgressUseCase.execute({ childId, moduleId })

          if (!result.success) {
            return c.json(result, result.error === 'Module not found' ? 404 : 400)
          }

          return c.json(result)
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Global game search with child context
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/games/search',
        tags: ['Games'],
        summary: 'Search games globally with child context',
        description: 'Search for games across all modules and lessons with child progress and status information',
        request: {
          params: z.object({
            childId: z.string().uuid().describe('Child ID to get progress and status information')
          }),
          query: z.object({
            search: z.string().optional().describe('Search term to filter games by title'),
            page: z
              .string()
              .optional()
              .transform((val) => (val ? Number.parseInt(val, 10) : 1))
              .describe('Page number (default: 1)'),
            limit: z
              .string()
              .optional()
              .transform((val) => (val ? Number.parseInt(val, 10) : 20))
              .describe('Items per page (default: 20, max: 100)')
          })
        },
        responses: {
          200: {
            description: 'Games retrieved successfully',
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
                      bestScore: z.number().optional(),
                      averageScore: z.number().optional(),
                      createdAt: z.string(),
                      updatedAt: z.string()
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
          const { childId } = c.req.param()
          const { search, page, limit } = c.req.query()

          const searchGamesUseCase = new SearchGamesUseCase(
            this.gameRepository,
            this.gameSessionRepository,
            this.lessonRepository
          )

          const result = await searchGamesUseCase.execute({
            search,
            page: page ? Number.parseInt(page, 10) : 1,
            limit: limit ? Number.parseInt(limit, 10) : 20,
            childId
          })

          if (!result.success) {
            return c.json({ success: false, error: result.error }, 400)
          }

          return c.json({
            success: true,
            games: result.games.map((game) => ({
              ...game,
              createdAt: game.createdAt.toISOString(),
              updatedAt: game.updatedAt.toISOString()
            })),
            pagination: result.pagination
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/progress/summary',
        tags: ['Children'],
        summary: 'Résumé de progression d’un enfant',
        request: {
          params: z.object({
            childId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Résumé de progression',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z
                    .object({
                      gamesCompleted: z.number(),
                      gamesInProgress: z.number(),
                      progressPercent: z.number(),
                      totalTimeSpent: z.number(),
                      totalSessions: z.number(),
                      avgSessionDuration: z.number(),
                      statusPie: z.record(z.string(), z.number())
                    })
                    .optional(),
                  error: z.string().optional()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { childId } = c.req.param()
          const getChildProgressSummaryUseCase = new GetChildProgressSummaryUseCase(this.gameSessionRepository)
          const result = await getChildProgressSummaryUseCase.execute({ childId })
          return c.json(result)
        } catch {
          return c.json({ success: false, error: 'Données indisponibles' }, 200)
        }
      }
    )

    // Statistiques d'activité par période (7j, 30j, 6m)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/activity-stats',
        tags: ['Children'],
        summary: 'Statistiques d’activité par période',
        request: {
          params: z.object({
            childId: z.string().uuid()
          }),
          query: z.object({
            period: z.enum(['7d', '30d', '6m'])
          })
        },
        responses: {
          200: {
            description: 'Stats d’activité par période',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z
                    .object({
                      completedModules: z.number(),
                      completedLessons: z.number(),
                      avgTimePerDay: z.number(),
                      successRate: z.number(),
                      gamesPlayed: z.number(),
                      sessionsCount: z.number(),
                      avgSessionDuration: z.number()
                    })
                    .optional(),
                  error: z.string().optional()
                })
              }
            }
          },
          400: {
            description: 'Période invalide',
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
          const { period } = c.req.query()
          const getChildActivityStatsUseCase = new GetChildActivityStatsUseCase(this.gameSessionRepository)
          const result = await getChildActivityStatsUseCase.execute({ childId, period })
          if (!result.success && result.error === 'Période invalide') {
            return c.json(result, 400)
          }
          return c.json(result)
        } catch {
          return c.json({ success: false, error: 'Données indisponibles' }, 200)
        }
      }
    )
  }
}
