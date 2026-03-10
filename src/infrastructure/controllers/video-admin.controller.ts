import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq, sql } from 'drizzle-orm'
import type { Routes } from '@/domain/types'
import { db } from '../database/db'
import { creditTransactions, userCredits, users, videos } from '../database/schema'
import { requireAdmin } from '../middlewares/admin.middleware'
import { CreditsRepository } from '../repositories/credits.repository'
import { VideoRepository } from '../repositories/video.repository'

const creditsRepository = new CreditsRepository()
const videoRepository = new VideoRepository()

export class VideoAdminController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    // Apply admin permission check
    this.controller.use('/v1/admin/*', requireAdmin)

    // GET /v1/admin/stats
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/stats',
        tags: ['Admin'],
        summary: 'Get platform statistics',
        description: 'Returns overall stats: users, videos generated, credit usage.',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Platform stats',
            content: {
              'application/json': {
                schema: z.object({
                  totalUsers: z.number(),
                  totalVideos: z.number(),
                  videosByStatus: z.array(z.object({ status: z.string(), count: z.number() })),
                  totalCreditsUsed: z.number(),
                  totalExtraCredits: z.number()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const [userCountResult, videoCountResult, videosByStatus, creditsUsedResult, extraCreditsResult] =
          await Promise.all([
            db.select({ count: sql<number>`count(*)` }).from(users),
            db.select({ count: sql<number>`count(*)` }).from(videos),
            videoRepository.countByStatus(),
            db
              .select({ total: sql<number>`sum(abs(amount))` })
              .from(creditTransactions)
              .where(eq(creditTransactions.type, 'consumption')),
            db.select({ total: sql<number>`sum(extra_credits)` }).from(userCredits)
          ])

        return c.json({
          totalUsers: Number(userCountResult[0]?.count ?? 0),
          totalVideos: Number(videoCountResult[0]?.count ?? 0),
          videosByStatus: videosByStatus.map((v) => ({ status: v.status, count: Number(v.count) })),
          totalCreditsUsed: Number(creditsUsedResult[0]?.total ?? 0),
          totalExtraCredits: Number(extraCreditsResult[0]?.total ?? 0)
        })
      }
    )

    // GET /v1/admin/jobs
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/jobs',
        tags: ['Admin'],
        summary: 'Get BullMQ job queue status',
        description: 'Returns pending, processing, and failed video generation jobs.',
        security: [{ Bearer: [] }],
        request: {
          query: z.object({
            page: z.string().optional(),
            limit: z.string().optional(),
            status: z.string().optional()
          })
        },
        responses: {
          200: {
            description: 'Job queue status',
            content: {
              'application/json': {
                schema: z.object({
                  data: z.array(
                    z.object({
                      id: z.string(),
                      jobId: z.string().nullable().optional(),
                      userId: z.string(),
                      topic: z.string(),
                      status: z.string(),
                      progress: z.number(),
                      currentStep: z.string().nullable().optional(),
                      errorMessage: z.string().nullable().optional(),
                      createdAt: z.string()
                    })
                  ),
                  total: z.number(),
                  page: z.number(),
                  limit: z.number()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const query = c.req.valid('query')
        const page = query.page ? Number.parseInt(query.page, 10) : 1
        const limit = Math.min(query.limit ? Number.parseInt(query.limit, 10) : 20, 100)
        const status = query.status || undefined

        const result = await videoRepository.listAll({ page, limit, status })

        return c.json({
          data: result.data.map((v) => ({
            id: v.id,
            jobId: v.jobId,
            userId: v.userId,
            topic: v.topic,
            status: v.status,
            progress: v.progress,
            currentStep: v.currentStep,
            errorMessage: v.errorMessage,
            createdAt: v.createdAt.toISOString()
          })),
          total: result.total,
          page: result.page,
          limit: result.limit
        })
      }
    )

    // PATCH /v1/admin/users/:id/credits
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/admin/users/{id}/credits',
        tags: ['Admin'],
        summary: 'Adjust user credits',
        description: 'Manually adjust extra credits for a user.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  extraCredits: z.number().int().min(0),
                  reason: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Credits updated',
            content: {
              'application/json': {
                schema: z.object({
                  userId: z.string(),
                  extraCredits: z.number(),
                  success: z.boolean()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'User not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const { extraCredits, reason } = c.req.valid('json')

        // Verify user exists
        const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, id))
        if (!targetUser) return c.json({ error: 'User not found' }, 404)

        await creditsRepository.setExtraCredits(id, extraCredits)

        // Record the admin adjustment as a transaction
        if (reason) {
          const credits = await creditsRepository.getUserCredits(id)
          const previousCredits = credits?.extraCredits ?? 0
          const diff = extraCredits - previousCredits
          if (diff !== 0) {
            await creditsRepository.addTransaction({
              userId: id,
              type: diff > 0 ? 'admin_adjustment' : 'admin_deduction',
              amount: diff,
              currency: 'usd'
            })
          }
        }

        return c.json({ userId: id, extraCredits, success: true })
      }
    )
  }
}
