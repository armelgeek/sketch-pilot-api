import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { GenerateVideoUseCase } from '@/application/use-cases/video/generate-video.use-case'
import { RegenerateVideoUseCase } from '@/application/use-cases/video/regenerate-video.use-case'
import { RenderVideoUseCase } from '@/application/use-cases/video/render-video.use-case'
import type { Routes } from '@/domain/types'
import { getVideoQueue, getVideoQueueEvents } from '../config/queue.config'
import { deleteVideoAssets, getSignedDownloadUrl, listVideoAssets } from '../config/storage.config'
import { VideoRepository } from '../repositories/video.repository'

const videoRepository = new VideoRepository()
const generateVideoUseCase = new GenerateVideoUseCase()
const regenerateVideoUseCase = new RegenerateVideoUseCase()
const renderVideoUseCase = new RenderVideoUseCase()

export class VideosController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    // POST /v1/videos/generate
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/generate',
        tags: ['Videos'],
        summary: 'Start video generation',
        description: 'Enqueues an async video generation job via BullMQ after checking quota.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  topic: z.string().min(1).max(500),
                  options: z
                    .object({
                      duration: z.number().optional(),
                      sceneCount: z.number().optional(),
                      style: z.string().optional(),
                      videoType: z.string().optional(),
                      videoGenre: z.string().optional(),
                      language: z.string().optional(),
                      voiceProvider: z.string().optional(),
                      voiceId: z.string().optional(),
                      animationProvider: z.string().optional(),
                      llmProvider: z.string().optional(),
                      imageProvider: z.string().optional(),
                      qualityMode: z.string().optional(),
                      textOverlay: z.object({ enabled: z.boolean(), position: z.string() }).optional(),
                      characterConsistency: z.boolean().optional(),
                      autoTransitions: z.boolean().optional()
                    })
                    .optional()
                })
              }
            }
          }
        },
        responses: {
          202: {
            description: 'Job enqueued',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  status: z.string(),
                  estimatedDuration: z.number(),
                  creditsRequired: z.number(),
                  message: z.string(),
                  streamUrl: z.string()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          402: {
            description: 'Insufficient credits',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { topic, options } = c.req.valid('json')

        const { result } = await generateVideoUseCase.run({
          userId: user.id,
          planId: (user as any).planId,
          topic,
          options
        })

        if (!result.success) {
          if (result.insufficientCredits) {
            return c.json({ error: result.error }, 402)
          }
          return c.json({ error: result.error || 'Failed to enqueue video generation' }, 500)
        }

        return c.json(
          {
            jobId: result.jobId,
            status: 'queued',
            estimatedDuration: result.estimatedDuration,
            creditsRequired: result.creditsRequired,
            message: 'Generation in progress...',
            streamUrl: result.streamUrl
          },
          202
        )
      }
    )

    // GET /v1/videos/jobs/:jobId/stream (SSE)
    this.controller.get('/v1/videos/jobs/:jobId/stream', async (c: any) => {
      const user = c.get('user')
      if (!user) return c.json({ error: 'Unauthorized' }, 401)

      const { jobId } = c.req.param()

      // Find the video by jobId
      const video = await videoRepository.findByJobId(jobId)
      if (!video || video.userId !== user.id) {
        return c.json({ error: 'Job not found' }, 404)
      }

      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      })

      const sendEvent = (event: string, data: object) => {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      }

      // If already completed or failed, return immediately
      if (video.status === 'completed') {
        const body = sendEvent('completed', {
          jobId,
          status: 'completed',
          progress: 100,
          videoId: video.id,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl,
          duration: video.duration
        })
        return new Response(body, { headers })
      }

      if (video.status === 'failed') {
        const body = sendEvent('error', {
          jobId,
          status: 'failed',
          error: video.errorMessage || 'Generation failed',
          retryable: true
        })
        return new Response(body, { headers })
      }

      if (video.status === 'cancelled') {
        const body = sendEvent('error', {
          jobId,
          status: 'cancelled',
          error: 'Job was cancelled',
          retryable: false
        })
        return new Response(body, { headers })
      }

      // Stream events
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          let closed = false

          const enqueue = (text: string) => {
            if (!closed) {
              try {
                controller.enqueue(encoder.encode(text))
              } catch {
                closed = true
              }
            }
          }

          const close = () => {
            if (!closed) {
              closed = true
              try {
                controller.close()
              } catch {
                // already closed
              }
            }
          }

          // Send initial connected event
          enqueue(
            sendEvent('connected', {
              jobId,
              status: video.status,
              progress: video.progress || 0
            })
          )

          // Listen for BullMQ events
          let queueEvents: ReturnType<typeof getVideoQueueEvents> | null = null
          try {
            queueEvents = getVideoQueueEvents()

            const onProgress = ({ jobId: jId, data }: { jobId: string; data: any }) => {
              if (jId !== jobId) return
              enqueue(sendEvent('progress', { jobId, ...data }))
            }

            const onCompleted = async ({ jobId: jId }: { jobId: string }) => {
              if (jId !== jobId) return
              try {
                const completedVideo = await videoRepository.findByJobId(jobId)
                enqueue(
                  sendEvent('completed', {
                    jobId,
                    status: 'completed',
                    progress: 100,
                    videoId: completedVideo?.id,
                    videoUrl: completedVideo?.videoUrl,
                    thumbnailUrl: completedVideo?.thumbnailUrl,
                    duration: completedVideo?.duration
                  })
                )
              } catch {
                enqueue(sendEvent('completed', { jobId, status: 'completed', progress: 100 }))
              }
              cleanup()
            }

            const onFailed = ({ jobId: jId, failedReason }: { jobId: string; failedReason: string }) => {
              if (jId !== jobId) return
              enqueue(sendEvent('error', { jobId, status: 'failed', error: failedReason, retryable: true }))
              cleanup()
            }

            queueEvents.on('progress', onProgress)
            queueEvents.on('completed', onCompleted)
            queueEvents.on('failed', onFailed)

            const cleanup = () => {
              if (queueEvents) {
                queueEvents.off('progress', onProgress)
                queueEvents.off('completed', onCompleted)
                queueEvents.off('failed', onFailed)
              }
              close()
            }

            // Timeout: 10 minutes
            setTimeout(cleanup, 10 * 60 * 1000)
          } catch (error) {
            console.error('Queue events not available:', error)
            // Fall back to polling
            const poll = setInterval(async () => {
              try {
                const updated = await videoRepository.findByJobId(jobId)
                if (!updated) {
                  clearInterval(poll)
                  close()
                  return
                }
                if (updated.status === 'completed') {
                  enqueue(
                    sendEvent('completed', {
                      jobId,
                      status: 'completed',
                      progress: 100,
                      videoId: updated.id,
                      videoUrl: updated.videoUrl,
                      thumbnailUrl: updated.thumbnailUrl,
                      duration: updated.duration
                    })
                  )
                  clearInterval(poll)
                  close()
                } else if (updated.status === 'failed' || updated.status === 'cancelled') {
                  enqueue(
                    sendEvent('error', {
                      jobId,
                      status: updated.status,
                      error: updated.errorMessage || 'Generation failed',
                      retryable: updated.status === 'failed'
                    })
                  )
                  clearInterval(poll)
                  close()
                } else if (updated.progress !== video.progress) {
                  enqueue(
                    sendEvent('progress', {
                      jobId,
                      status: updated.status,
                      progress: updated.progress,
                      step: updated.currentStep,
                      message: updated.currentStep
                    })
                  )
                }
              } catch {
                clearInterval(poll)
                close()
              }
            }, 3000)

            setTimeout(
              () => {
                clearInterval(poll)
                close()
              },
              10 * 60 * 1000
            )
          }
        }
      })

      return new Response(stream, { headers })
    })

    // GET /v1/videos/jobs/:jobId (polling fallback)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/videos/jobs/{jobId}',
        tags: ['Videos'],
        summary: 'Get job status (polling fallback)',
        description: 'Returns the current status of a video generation job.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ jobId: z.string() })
        },
        responses: {
          200: {
            description: 'Job status',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  status: z.string(),
                  progress: z.number(),
                  step: z.string().nullable().optional(),
                  currentStep: z.string().nullable().optional(),
                  queuePosition: z.number().nullable().optional(),
                  startedAt: z.string().nullable().optional(),
                  estimatedCompletion: z.string().nullable().optional(),
                  videoId: z.string().nullable().optional()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { jobId } = c.req.valid('param')
        const video = await videoRepository.findByJobId(jobId)
        if (!video || video.userId !== user.id) return c.json({ error: 'Job not found' }, 404)

        return c.json({
          jobId,
          status: video.status,
          progress: video.progress,
          step: video.currentStep,
          currentStep: video.currentStep,
          queuePosition: video.status === 'queued' ? 1 : null,
          startedAt: video.createdAt.toISOString(),
          estimatedCompletion:
            video.status === 'processing' ? new Date(video.createdAt.getTime() + 3 * 60 * 1000).toISOString() : null,
          videoId: video.status === 'completed' ? video.id : null
        })
      }
    )

    // POST /v1/videos/jobs/:jobId/cancel
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/jobs/{jobId}/cancel',
        tags: ['Videos'],
        summary: 'Cancel a video generation job',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ jobId: z.string() })
        },
        responses: {
          200: {
            description: 'Job cancelled',
            content: {
              'application/json': {
                schema: z.object({ jobId: z.string(), status: z.string() })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { jobId } = c.req.valid('param')
        const video = await videoRepository.findByJobId(jobId)
        if (!video || video.userId !== user.id) return c.json({ error: 'Job not found' }, 404)

        // Try to remove from BullMQ queue
        try {
          const queue = getVideoQueue()
          const job = await queue.getJob(jobId)
          if (job) {
            await job.remove()
          }
        } catch (error) {
          console.error('Failed to remove job from queue:', error)
        }

        await videoRepository.updateStatus(video.id, { status: 'cancelled' })

        return c.json({ jobId, status: 'cancelled' })
      }
    )

    // GET /v1/videos
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/videos',
        tags: ['Videos'],
        summary: 'List user videos',
        description: "Returns a paginated list of the current user's videos.",
        security: [{ Bearer: [] }],
        request: {
          query: z.object({
            page: z.string().optional(),
            limit: z.string().optional(),
            status: z.string().optional(),
            genre: z.string().optional(),
            type: z.string().optional(),
            search: z.string().optional(),
            sort: z.string().optional()
          })
        },
        responses: {
          200: {
            description: 'Video list',
            content: {
              'application/json': {
                schema: z.object({
                  data: z.array(
                    z.object({
                      id: z.string(),
                      topic: z.string(),
                      status: z.string(),
                      thumbnailUrl: z.string().nullable().optional(),
                      videoUrl: z.string().nullable().optional(),
                      duration: z.number().nullable().optional(),
                      genre: z.string().nullable().optional(),
                      type: z.string().nullable().optional(),
                      createdAt: z.string(),
                      creditsUsed: z.number()
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
        const filters = {
          page: query.page ? Number.parseInt(query.page, 10) : 1,
          limit: Math.min(query.limit ? Number.parseInt(query.limit, 10) : 20, 100),
          status: query.status,
          genre: query.genre,
          type: query.type,
          search: query.search,
          sort: query.sort
        }

        const result = await videoRepository.listByUser(user.id, filters)

        return c.json({
          data: result.data.map((v) => ({
            id: v.id,
            topic: v.topic,
            status: v.status,
            thumbnailUrl: v.thumbnailUrl,
            videoUrl: v.videoUrl,
            duration: v.duration,
            genre: v.genre,
            type: v.type,
            createdAt: v.createdAt.toISOString(),
            creditsUsed: v.creditsUsed
          })),
          total: result.total,
          page: result.page,
          limit: result.limit
        })
      }
    )

    // GET /v1/videos/:id
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/videos/{id}',
        tags: ['Videos'],
        summary: 'Get video details',
        description: 'Returns full details of a video including script and scenes.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Video details',
            content: {
              'application/json': {
                schema: z.object({
                  id: z.string(),
                  topic: z.string(),
                  status: z.string(),
                  progress: z.number(),
                  currentStep: z.string().nullable().optional(),
                  jobId: z.string().nullable().optional(),
                  errorMessage: z.string().nullable().optional(),
                  videoUrl: z.string().nullable().optional(),
                  thumbnailUrl: z.string().nullable().optional(),
                  narrationUrl: z.string().nullable().optional(),
                  captionsUrl: z.string().nullable().optional(),
                  duration: z.number().nullable().optional(),
                  genre: z.string().nullable().optional(),
                  type: z.string().nullable().optional(),
                  language: z.string().nullable().optional(),
                  options: z.any().optional(),
                  script: z.any().optional(),
                  scenes: z.any().optional(),
                  creditsUsed: z.number(),
                  createdAt: z.string(),
                  updatedAt: z.string(),
                  completedAt: z.string().nullable().optional()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const video = await videoRepository.findByIdAndUserId(id, user.id)
        if (!video) return c.json({ error: 'Video not found' }, 404)

        return c.json({
          id: video.id,
          topic: video.topic,
          status: video.status,
          progress: video.progress,
          currentStep: video.currentStep,
          jobId: video.jobId,
          errorMessage: video.errorMessage,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl,
          narrationUrl: video.narrationUrl,
          captionsUrl: video.captionsUrl,
          duration: video.duration,
          genre: video.genre,
          type: video.type,
          language: video.language,
          options: video.options,
          script: video.script,
          scenes: video.scenes,
          creditsUsed: video.creditsUsed,
          createdAt: video.createdAt.toISOString(),
          updatedAt: video.updatedAt.toISOString(),
          completedAt: video.completedAt?.toISOString() ?? null
        })
      }
    )

    // DELETE /v1/videos/:id
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/videos/{id}',
        tags: ['Videos'],
        summary: 'Delete a video',
        description: 'Deletes the video from the database and all its MinIO assets.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Video deleted',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const video = await videoRepository.findByIdAndUserId(id, user.id)
        if (!video) return c.json({ error: 'Video not found' }, 404)

        // Delete MinIO assets
        try {
          await deleteVideoAssets(id)
        } catch (error) {
          console.error('Failed to delete video assets from storage:', error)
        }

        await videoRepository.delete(id, user.id)

        return c.json({ success: true })
      }
    )

    // POST /v1/videos/:id/regenerate
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/regenerate',
        tags: ['Videos'],
        summary: 'Regenerate a video',
        description: 'Creates a new generation job with the same options.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          202: {
            description: 'Regeneration started',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  status: z.string(),
                  estimatedDuration: z.number(),
                  creditsRequired: z.number(),
                  message: z.string(),
                  streamUrl: z.string()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          402: {
            description: 'Insufficient credits',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const video = await videoRepository.findByIdAndUserId(id, user.id)
        if (!video) return c.json({ error: 'Video not found' }, 404)

        const { result } = await regenerateVideoUseCase.run({
          videoId: id,
          userId: user.id,
          planId: (user as any).planId,
          topic: video.topic,
          options: (video.options as any) || {}
        })

        if (!result.success) {
          if (result.insufficientCredits) {
            return c.json({ error: result.error }, 402)
          }
          return c.json({ error: result.error || 'Failed to enqueue regeneration' }, 500)
        }

        return c.json(
          {
            jobId: result.jobId,
            status: 'queued',
            estimatedDuration: result.estimatedDuration,
            creditsRequired: result.creditsRequired,
            message: 'Regeneration in progress...',
            streamUrl: result.streamUrl
          },
          202
        )
      }
    )

    // POST /v1/videos/:id/render
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/render',
        tags: ['Videos'],
        summary: 'Render a video from a script',
        description: 'Updates a manually modified script and starts the video rendering process.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  script: z.any()
                })
              }
            }
          }
        },
        responses: {
          202: {
            description: 'Rendering started',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  status: z.string(),
                  estimatedDuration: z.number(),
                  creditsRequired: z.number(),
                  message: z.string(),
                  streamUrl: z.string()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          402: {
            description: 'Insufficient credits',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const { script } = c.req.valid('json')

        // Using the new RenderVideoUseCase
        const { result } = await renderVideoUseCase.run({
          videoId: id,
          userId: user.id,
          planId: (user as any).planId,
          script
        })

        if (!result.success) {
          if (result.insufficientCredits) {
            return c.json({ error: result.error }, 402)
          }
          if (result.error === 'Video not found') {
            return c.json({ error: result.error }, 404)
          }
          return c.json({ error: result.error || 'Failed to enqueue rendering' }, 500)
        }

        return c.json(
          {
            jobId: result.jobId,
            status: 'queued',
            estimatedDuration: result.estimatedDuration,
            creditsRequired: result.creditsRequired,
            message: 'Rendering in progress...',
            streamUrl: result.streamUrl
          },
          202
        )
      }
    )

    // GET /v1/videos/:id/download
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/videos/{id}/download',
        tags: ['Videos'],
        summary: 'Get signed download URL',
        description: 'Returns a signed MinIO URL valid for 1 hour.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Download URL',
            content: {
              'application/json': {
                schema: z.object({
                  downloadUrl: z.string(),
                  expiresAt: z.string()
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const video = await videoRepository.findByIdAndUserId(id, user.id)
        if (!video) return c.json({ error: 'Video not found' }, 404)
        if (video.status !== 'completed') return c.json({ error: 'Video is not yet completed' }, 400)

        const downloadUrl = await getSignedDownloadUrl(id)
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()

        return c.json({ downloadUrl, expiresAt })
      }
    )

    // GET /v1/videos/:id/assets
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/videos/{id}/assets',
        tags: ['Videos'],
        summary: 'List video assets',
        description: 'Lists all assets stored in MinIO for the given video.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Asset list',
            content: {
              'application/json': {
                schema: z.object({
                  assets: z.array(
                    z.object({
                      key: z.string(),
                      size: z.number().optional(),
                      lastModified: z.string().optional()
                    })
                  )
                })
              }
            }
          },
          401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          },
          404: {
            description: 'Not found',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user) return c.json({ error: 'Unauthorized' }, 401)

        const { id } = c.req.valid('param')
        const video = await videoRepository.findByIdAndUserId(id, user.id)
        if (!video) return c.json({ error: 'Video not found' }, 404)

        const assets = await listVideoAssets(id)

        return c.json({
          assets: assets.map((a) => ({
            key: a.key,
            size: a.size,
            lastModified: a.lastModified?.toISOString()
          }))
        })
      }
    )
  }
}
