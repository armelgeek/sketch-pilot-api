import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { CreateChildUseCase } from '@/application/use-cases/child/create-child.use-case'
import { DeleteChildUseCase } from '@/application/use-cases/child/delete-child.use-case'
import { GetChildActivityStatsUseCase } from '@/application/use-cases/child/get-child-activity-stats.use-case'
import { GetChildProgressSummaryUseCase } from '@/application/use-cases/child/get-child-progress-summary.use-case'
import { GetChildrenUseCase } from '@/application/use-cases/child/get-children.use-case'
import { UpdateChildAvatarUseCase } from '@/application/use-cases/child/update-child-avatar.use-case'
import { UpdateChildUseCase } from '@/application/use-cases/child/update-child.use-case'
import { verificationCodeTemplate } from '@/infrastructure/config/email-templates/verification-code.template'
import { sendEmail } from '@/infrastructure/config/mail.config'
import { ChildRepository } from '@/infrastructure/repositories/child.repository'
import { GameSessionRepository } from '@/infrastructure/repositories/game-session.repository'
import { GameRepository } from '@/infrastructure/repositories/game.repository'
import { UserRepository } from '@/infrastructure/repositories/user.repository'
import { VerificationCodeRepository } from '@/infrastructure/repositories/verification-code.repository'
import { SubscriptionPlanRepository } from '../repositories/subscription-plan.repository'
export class ChildController {
  public controller: OpenAPIHono
  private childRepository: ChildRepository
  private userRepository: UserRepository
  private verificationCodeRepository: VerificationCodeRepository
  private subscriptionPlanRepository: SubscriptionPlanRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.childRepository = new ChildRepository()
    this.userRepository = new UserRepository()
    this.subscriptionPlanRepository = new SubscriptionPlanRepository()
    this.verificationCodeRepository = new VerificationCodeRepository()
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/children',
        tags: ['Children'],
        summary: 'Create a new child',
        description: 'Create a new child profile for the authenticated parent user.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  firstname: z.string().min(2),
                  lastname: z.string().min(2),
                  birthday: z.string().optional(),
                  avatarUrl: z.string().url().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Child created successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    firstname: z.string(),
                    lastname: z.string(),
                    birthday: z.string().nullable(),
                    avatarUrl: z.string().nullable(),
                    parentId: z.string()
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
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        const createChildUseCase = new CreateChildUseCase(
          this.childRepository,
          this.userRepository,
          this.subscriptionPlanRepository
        )
        try {
          const childData = await c.req.json()
          const child = await createChildUseCase.execute({
            ...childData,
            parentId: user.id
          })
          return c.json({ success: true, data: child })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children',
        tags: ['Children'],
        summary: 'Get children list',
        description: 'Get the list of children for the authenticated parent user.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Children list retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.array(
                    z.object({
                      id: z.string(),
                      firstname: z.string(),
                      lastname: z.string(),
                      birthday: z.string().nullable(),
                      avatarUrl: z.string().nullable(),
                      parentId: z.string()
                    })
                  )
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        const getChildrenUseCase = new GetChildrenUseCase(this.childRepository)
        try {
          const children = await getChildrenUseCase.execute({ parentId: user.id })
          return c.json({ success: true, data: children })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/children/{id}',
        tags: ['Children'],
        summary: 'Update child information',
        description: 'Update the information of a specific child.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            id: z.string()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  firstname: z.string().min(2).optional(),
                  lastname: z.string().min(2).optional(),
                  birthday: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Child updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    firstname: z.string(),
                    lastname: z.string(),
                    birthday: z.string().nullable(),
                    avatarUrl: z.string().nullable(),
                    parentId: z.string()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }
        const ipAddress =
          c.req.header('x-forwarded-for') ||
          c.req.header('x-real-ip') ||
          c.req.header('cf-connecting-ip') ||
          c.req.header('x-client-ip') ||
          c.req.header('x-remote-addr') ||
          c.req.header('remote-addr') ||
          undefined
        const updateChildUseCase = new UpdateChildUseCase(this.childRepository)
        try {
          const { id } = c.req.param()
          const updateData = await c.req.json()
          const { result, activityLogId } = await updateChildUseCase.run({
            id,
            ...updateData,
            parentId: user.id,
            currentUserId: user.id,
            resource: 'child',
            ipAddress
          })
          if (!result.success) {
            if (activityLogId) await updateChildUseCase.updateActivityResource(activityLogId, id, 'child', 'error')
            return c.json({ success: false, error: result.error }, 400)
          }
          if (activityLogId) await updateChildUseCase.updateActivityResource(activityLogId, id, 'child', 'success')
          return c.json({ success: true, data: result.data })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/children/{id}/avatar',
        tags: ['Children'],
        summary: 'Update child avatar',
        description: 'Update the avatar of a specific child.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            id: z.string()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  avatarUrl: z.string().url()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Child avatar updated successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    id: z.string(),
                    firstname: z.string(),
                    lastname: z.string(),
                    birthday: z.string().nullable(),
                    avatarUrl: z.string().nullable(),
                    parentId: z.string()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }
        const ipAddress =
          c.req.header('x-forwarded-for') ||
          c.req.header('x-real-ip') ||
          c.req.header('cf-connecting-ip') ||
          c.req.header('x-client-ip') ||
          c.req.header('x-remote-addr') ||
          c.req.header('remote-addr') ||
          undefined
        const updateChildAvatarUseCase = new UpdateChildAvatarUseCase(this.childRepository)
        try {
          const { id } = c.req.param()
          const { avatarUrl } = await c.req.json()
          const { result, activityLogId } = await updateChildAvatarUseCase.run({
            id,
            avatarUrl,
            currentUserId: user.id,
            resource: 'child',
            ipAddress
          })
          if (!result.success) {
            if (activityLogId) {
              await updateChildAvatarUseCase.updateActivityResource(activityLogId, id, 'child', 'error')
            }
            return c.json({ success: false, error: result.error }, 400)
          }
          if (activityLogId) {
            await updateChildAvatarUseCase.updateActivityResource(activityLogId, id, 'child', 'success')
          }
          return c.json({ success: true, data: result.data })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/parents/children',
        tags: ['Parent'],
        summary: 'Get children list of connected parent ID',
        description: 'Get the list of children for a specific user',
        responses: {
          200: {
            description: 'Children list retrieved successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.array(
                    z.object({
                      id: z.string(),
                      firstname: z.string(),
                      lastname: z.string(),
                      birthday: z.string().nullable(),
                      avatarUrl: z.string().nullable(),
                      parentId: z.string(),
                      firstLogin: z.boolean(),
                      createdAt: z.string(),
                      updatedAt: z.string()
                    })
                  )
                })
              }
            }
          },
          401: {
            description: 'Unauthorized - User must be authenticated',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          },
          403: {
            description: 'Forbidden - User does not have required permissions',
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
            description: 'User not found',
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
          const currentUser = c.get('user')

          if (!currentUser) {
            return c.json({ success: false, error: 'Unauthorized' }, 401)
          }

          const getChildrenUseCase = new GetChildrenUseCase(this.childRepository)
          const children = await getChildrenUseCase.execute({ parentId: currentUser.id })

          return c.json({
            success: true,
            data: children.data.map((child) => ({
              ...child,
              birthday: child.birthday?.toISOString() || null,
              createdAt: child.createdAt.toISOString(),
              updatedAt: child.updatedAt.toISOString()
            }))
          })
        } catch (error: any) {
          console.error('Error fetching children:', error)
          return c.json(
            {
              success: false,
              error: error.message || 'Internal server error'
            },
            500
          )
        }
      }
    )

    // Request verification code endpoint
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/children/{id}/request-delete',
        tags: ['Children'],
        summary: 'Request child deletion verification code',
        description: 'Request a verification code to delete a child profile',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            id: z.string()
          })
        },
        responses: {
          200: {
            description: 'Verification code sent successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  message: z.string()
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
          401: {
            description: 'Unauthorized',
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
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        try {
          const { id } = c.req.param()

          // Verify the child exists and belongs to the parent
          const child = await this.childRepository.findById(id)
          if (!child) {
            return c.json({ success: false, error: 'Child not found' }, 404)
          }

          if (child.parentId !== user.id) {
            return c.json({ success: false, error: 'Not authorized to delete this child profile' }, 403)
          }

          const verificationCode = DeleteChildUseCase.generateVerificationCode()

          // Store the code with a 15-minute expiration in database
          await this.verificationCodeRepository.save({
            id: crypto.randomUUID(),
            code: verificationCode,
            childId: id,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes expiration
            createdAt: new Date(),
            updatedAt: new Date()
          })
          // Send the verification code to the parent's emails
          const template = verificationCodeTemplate(user.firstname, verificationCode)
          await sendEmail({
            to: user.email,
            ...template
          })

          return c.json({
            success: true,
            message: `Verification code: ${verificationCode}`
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // Confirm deletion endpoint
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/children/{id}',
        tags: ['Children'],
        summary: 'Delete child profile',
        description: 'Delete a child profile with verification code',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            id: z.string()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  verificationCode: z.string()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Child profile deleted successfully',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean()
                })
              }
            }
          },
          400: {
            description: 'Bad request or invalid verification code',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
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
        const user = c.get('user')
        if (!user) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        try {
          const { id } = c.req.param()
          const { data } = await c.req.json()

          // Check for valid verification code in database
          const storedVerification = await this.verificationCodeRepository.findLatestByChildId(id)
          if (!storedVerification) {
            return c.json(
              {
                success: false,
                error: 'No verification code requested or code expired. Please request a new code.'
              },
              400
            )
          }
          const ipAddress =
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-client-ip') ||
            c.req.header('x-remote-addr') ||
            c.req.header('remote-addr') ||
            undefined
          // Check if the code has expired
          if (new Date() > storedVerification.expiresAt) {
            await this.verificationCodeRepository.remove(storedVerification.id)
            return c.json(
              {
                success: false,
                error: 'Verification code has expired. Please request a new code.'
              },
              400
            )
          }

          const deleteChildUseCase = new DeleteChildUseCase(this.childRepository, this.userRepository)
          const { result, activityLogId } = await deleteChildUseCase.run({
            id,
            parentId: user.id,
            verificationCode: data.verificationCode,
            storedVerificationCode: storedVerification.code,
            currentUserId: user.id,
            resource: 'child',
            ipAddress
          })

          // Clean up the verification code
          await this.verificationCodeRepository.remove(storedVerification.id)

          if (!result.success) {
            if (activityLogId) await deleteChildUseCase.updateActivityResource(activityLogId, id, 'child', 'error')
            return c.json({ success: false, error: result.error }, 400)
          }
          if (activityLogId) await deleteChildUseCase.updateActivityResource(activityLogId, id, 'child', 'success')
          return c.json({ success: true })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )

    // --- Statistiques de progression par enfant ---
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/progress-summary',
        tags: ['Children'],
        summary: 'Get child progress summary',
        description: 'Récupère les statistiques de progression (nombre de jeux, par status, etc.) pour un enfant',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            childId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Statistiques récupérées',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    gamesCompleted: z.number(),
                    gamesInProgress: z.number(),
                    progressPercent: z.number(),
                    totalTimeSpent: z.number(),
                    statusPie: z.record(z.string(), z.number())
                  })
                })
              }
            }
          },
          400: {
            description: 'Erreur',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), error: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)
        const { childId } = c.req.param()
        const gameSessionRepository = new GameSessionRepository()
        const useCase = new GetChildProgressSummaryUseCase(gameSessionRepository)
        const result = await useCase.execute({ childId })
        if (!result.success) return c.json({ success: false, error: result.error }, 400)
        return c.json({ success: true, data: result.data })
      }
    )

    // --- Statistiques d'activité par enfant ---
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/activity-stats',
        tags: ['Children'],
        summary: 'Get child activity stats',
        description: "Récupère les statistiques d'activité pour un enfant sur une période",
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            childId: z.string().uuid()
          }),
          query: z.object({
            period: z.enum(['7d', '30d', '6m']).default('7d')
          })
        },
        responses: {
          200: {
            description: 'Statistiques récupérées',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    completedModules: z.number(),
                    completedLessons: z.number(),
                    avgTimePerDay: z.number(),
                    successRate: z.number(),
                    gamesPlayed: z.number(),
                    sessionsCount: z.number(),
                    avgSessionDuration: z.number()
                  })
                })
              }
            }
          },
          400: {
            description: 'Erreur',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), error: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)
        const { childId } = c.req.param()
        const { period = '7d' } = c.req.query()
        const gameSessionRepository = new GameSessionRepository()
        const useCase = new GetChildActivityStatsUseCase(gameSessionRepository)
        const result = await useCase.execute({ childId, period })
        if (!result.success) return c.json({ success: false, error: result.error }, 400)
        return c.json({ success: true, data: result.data })
      }
    )

    // --- Statistiques des jeux par status pour un enfant ---
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/children/{childId}/games/stats',
        tags: ['Children'],
        summary: 'Get games stats by status for a child',
        description: 'Retourne le nombre total de jeux et le nombre de jeux par status pour un enfant',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            childId: z.string().uuid()
          })
        },
        responses: {
          200: {
            description: 'Statistiques récupérées',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    total: z.number(),
                    byStatus: z.object({
                      available: z.number(),
                      blocked: z.number(),
                      completed: z.number(),
                      in_progress: z.number()
                    })
                  })
                })
              }
            }
          },
          400: {
            description: 'Erreur',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), error: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)
        const { childId } = c.req.param()
        try {
          // Récupérer tous les jeux
          const gameRepository = new GameRepository()
          const gameSessionRepository = new GameSessionRepository()
          const allGames = await gameRepository.findAll()
          const childSessions = await gameSessionRepository.findByChildId(childId)

          // Utiliser la même logique que GetChildModulesWithProgressUseCase
          const byStatus = {
            available: 0,
            blocked: 0,
            completed: 0,
            in_progress: 0
          }

          for (const game of allGames) {
            // Vérifier les prérequis du jeu
            const prerequisites = await gameRepository.findPrerequisites(game.id)
            const prerequisitesMet = await this.checkPrerequisitesMet(prerequisites, childSessions)

            // Récupérer la session de ce jeu pour cet enfant
            const gameSession = childSessions.find((session) => session.gameId === game.id)

            let status: 'available' | 'blocked' | 'completed' | 'in_progress' = 'available'

            if (prerequisitesMet) {
              if (gameSession?.status === 'completed') {
                status = 'completed'
              } else if (gameSession?.status === 'in_progress' || gameSession?.status === 'abandoned') {
                status = 'in_progress'
              } else {
                status = 'available'
              }
            } else {
              status = 'blocked'
            }

            console.info(
              `Game ${game.id} (${game.title}): status = ${status}, prerequisitesMet = ${prerequisitesMet}, gameSession = ${gameSession?.status || 'none'}`
            )
            byStatus[status]++
          }

          console.info('Final byStatus:', byStatus)
          console.info('Total games:', allGames.length)
          console.info('Child sessions count:', childSessions.length)
          return c.json({
            success: true,
            data: {
              total: allGames.length,
              byStatus
            }
          })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
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
}
