import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { checkpointService } from '@/application/services/video-checkpoint.service'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { ChooseBackgroundMusicUseCase } from '@/application/use-cases/video/choose-background-music.use-case'
import { ChooseVoiceoverUseCase } from '@/application/use-cases/video/choose-voiceover.use-case'
import { ConfigureBrandingUseCase } from '@/application/use-cases/video/configure-branding.use-case'
import { ConfigureCaptionsUseCase } from '@/application/use-cases/video/configure-captions.use-case'
import { GenerateFinalVideoUseCase } from '@/application/use-cases/video/generate-final-video.use-case'
import { GenerateNarrationUseCase } from '@/application/use-cases/video/generate-narration.use-case'
import { GenerateScenesUseCase } from '@/application/use-cases/video/generate-scenes.use-case'
import { GenerateScriptFromTitleUseCase } from '@/application/use-cases/video/generate-script-from-title.use-case'
import { GenerateVideoUseCase } from '@/application/use-cases/video/generate-video.use-case'
import { RegenerateVideoUseCase } from '@/application/use-cases/video/regenerate-video.use-case'
import { RenderVideoUseCase } from '@/application/use-cases/video/render-video.use-case'
import { RepromptSceneImageUseCase } from '@/application/use-cases/video/reprompt-scene-image.use-case'
import { SuggestTopicsUseCase } from '@/application/use-cases/video/suggest-topics.use-case'
import { UpdateVideoUseCase } from '@/application/use-cases/video/update-video.use-case'
import type { Routes } from '@/domain/types'
import { getVideoQueue, getVideoQueueEvents, redisClient } from '../config/queue.config'
import { deleteVideoAssets, getSignedDownloadUrl, listVideoAssets } from '../config/storage.config'
import { VideoRepository } from '../repositories/video.repository'
import { VideoOptionsSchema } from './video-options.schema'

const videoRepository = new VideoRepository()
const generateVideoUseCase = new GenerateVideoUseCase()
const regenerateVideoUseCase = new RegenerateVideoUseCase()
const renderVideoUseCase = new RenderVideoUseCase()
const generateFinalVideoUseCase = new GenerateFinalVideoUseCase()
const generateNarrationUseCase = new GenerateNarrationUseCase()
const repromptSceneImageUseCase = new RepromptSceneImageUseCase()
const generateScenesUseCase = new GenerateScenesUseCase()
const chooseVoiceoverUseCase = new ChooseVoiceoverUseCase()
const chooseBackgroundMusicUseCase = new ChooseBackgroundMusicUseCase()
const configureCaptionsUseCase = new ConfigureCaptionsUseCase()
const configureBrandingUseCase = new ConfigureBrandingUseCase()
const suggestTopicsUseCase = new SuggestTopicsUseCase()
const generateScriptFromTitleUseCase = new GenerateScriptFromTitleUseCase()
const updateVideoUseCase = new UpdateVideoUseCase()
const videoGenerationService = new VideoGenerationService()

export class VideosController implements Routes {
  public controller: OpenAPIHono

  // Global registry for SSE streams mapped by JobId to prevent memory leaks from duplicate BullMQ listeners
  private sseStreamsByJobId = new Map<string, Set<(event: string, data: any) => void>>()
  private isGlobalQueueListenerInitialized = false
  private pruningInterval: any = null

  /**
   * Safely cleanup and close all SSE streams for a specific Job ID or Video ID.
   */
  private cleanupJobStreams(jobId: string) {
    const streams = this.sseStreamsByJobId.get(jobId)
    if (streams && streams.size > 0) {
      console.info(`[SSE] Force cleaning up ${streams.size} streams for job ${jobId}`)
      for (const enqueue of streams) {
        try {
          // Send a final "done" event if appropriate? Or just close.
          // For safety, we just let them disconnect naturally or trigger our cleanup
          enqueue('error', { jobId, status: 'aborted', error: 'Connection closed (Job archived)' })
        } catch {
          // ignore
        }
      }
      streams.clear()
    }
    this.sseStreamsByJobId.delete(jobId)
  }

  /**
   * Periodically check the map for entries that should no longer be there.
   */
  private startPruningTask() {
    if (this.pruningInterval) return
    console.info('[SSE] Starting periodic SSE map pruning task (1 hour interval)')
    this.pruningInterval = setInterval(
      async () => {
        const jobIds = Array.from(this.sseStreamsByJobId.keys())
        if (jobIds.length === 0) return

        console.info(`[SSE] Pruning check: ${jobIds.length} active jobs in map`)
        for (const jobId of jobIds) {
          try {
            const video = await videoRepository.findByJobId(jobId)
            // If job is finished in DB but still in Map, and NOBODY is connected, clean it up.
            // Note: cleanupStreamResources already deletes keys when Set is empty.
            // So if a key exists here, it means there is at least one listener in the Set.
            const streams = this.sseStreamsByJobId.get(jobId)
            if (
              video &&
              (video.status === 'completed' || video.status === 'failed' || video.status === 'cancelled') &&
              streams
            ) {
              this.cleanupJobStreams(jobId)
              console.info(`[SSE] Pruned finished job ${jobId} from map`)
            }
          } catch (error) {
            console.error(`[SSE] Failed to prune job ${jobId}:`, error)
          }
        }
      },
      60 * 60 * 1000
    ) // 1 hour
  }

  private initGlobalQueueListener() {
    if (this.isGlobalQueueListenerInitialized) return
    this.isGlobalQueueListenerInitialized = true

    try {
      const queueEvents = getVideoQueueEvents()

      queueEvents.on('progress', async ({ jobId, data }) => {
        const streams = this.sseStreamsByJobId.get(jobId)
        console.info(
          `[SSE Controller] BullMQ progress event for job ${jobId}. Has Streams: ${!!streams}. Data type: ${typeof data}`
        )

        if (streams && streams.size > 0) {
          let parsedData: any = data
          if (typeof data === 'string') {
            try {
              parsedData = JSON.parse(data)
            } catch {
              // Not JSON, keep as is
            }
          }

          try {
            const progressPayload: any =
              typeof parsedData === 'object' && parsedData !== null
                ? { jobId, ...parsedData }
                : { jobId, progress: parsedData }

            // Fallback: Only fetch the latest state from DB if we are currently generating scenes
            // and the `scene` object is missing from the payload for whatever reason
            if (progressPayload.step === 'composing_scene' && !progressPayload.scene) {
              const video = await videoRepository.findByJobId(jobId)
              const scenes = video?.scenes || (video?.script as any)?.scenes || []

              let currentSceneIndex = progressPayload.currentSceneIndex

              if (video && scenes.length > 0) {
                // If parsedData didn't have currentSceneIndex, find the highest index with an image
                if (currentSceneIndex === undefined) {
                  for (let i = scenes.length - 1; i >= 0; i--) {
                    if (scenes[i].imageUrl) {
                      currentSceneIndex = i
                      progressPayload.scene = scenes[i]
                      progressPayload.currentSceneIndex = i
                      break
                    }
                  }
                } else if (scenes[currentSceneIndex]) {
                  // If we have index but no scene data, pull it from DB
                  progressPayload.scene = scenes[currentSceneIndex]
                }
              }
            }

            for (const enqueue of streams) {
              enqueue('progress', progressPayload)
            }
          } catch (error) {
            console.error(`[SSE Controller] Failed to process progress payload:`, error)
            // Ultimate fallback
            const progressPayload =
              typeof parsedData === 'object' && parsedData !== null
                ? { jobId, ...parsedData }
                : { jobId, progress: parsedData }
            for (const enqueue of streams) enqueue('progress', progressPayload)
          }
        }
      })

      queueEvents.on('completed', async ({ jobId }) => {
        const streams = this.sseStreamsByJobId.get(jobId)
        if (streams && streams.size > 0) {
          try {
            const completedVideo = await videoRepository.findByJobId(jobId)
            for (const enqueue of streams) {
              enqueue('completed', {
                jobId,
                status: 'completed',
                progress: 100,
                videoId: completedVideo?.id,
                videoUrl: completedVideo?.videoUrl,
                thumbnailUrl: completedVideo?.thumbnailUrl,
                duration: completedVideo?.duration
              })
            }
          } catch {
            for (const enqueue of streams) enqueue('completed', { jobId, status: 'completed', progress: 100 })
          }
        }
      })

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        const streams = this.sseStreamsByJobId.get(jobId)
        if (streams) {
          for (const enqueue of streams)
            enqueue('error', { jobId, status: 'failed', error: failedReason, retryable: true })

          // Cleanup map after a small delay to ensure events are sent
          setTimeout(() => this.cleanupJobStreams(jobId), 5000)
        }
      })

      queueEvents.on('stalled', ({ jobId }) => {
        console.warn(`[SSE] Job ${jobId} STALLED. Cleaning up streams.`)
        this.cleanupJobStreams(jobId)
      })

      queueEvents.on('removed', ({ jobId }) => {
        console.info(`[SSE] Job ${jobId} REMOVED from queue. Cleaning up streams.`)
        this.cleanupJobStreams(jobId)
      })
    } catch (error) {
      console.error('[SSE] Failed to init global queue events listener:', error)
    }
  }

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
                  topic: z.string().min(1).max(5000),
                  options: VideoOptionsSchema.optional()
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

    // POST /v1/videos/suggest-topics
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/suggest-topics',
        tags: ['Videos'],
        summary: 'Suggest video topics',
        description: 'Generates 3 creative video ideas based on configuration.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  options: z.object({
                    language: z.string().optional(),
                    videoType: z.string().optional(),
                    videoGenre: z.string().optional(),
                    aspectRatio: z.string().optional(),
                    themeName: z.string().optional(),
                    themeDescription: z.string().optional(),
                    goals: z.array(z.string()).optional(),
                    duration: z.number().optional()
                  })
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Topics suggested',
            content: {
              'application/json': {
                schema: z.object({
                  topics: z.array(z.object({ title: z.string(), script: z.string() }))
                })
              }
            }
          },
          400: {
            description: 'Bad request',
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

        const { options } = c.req.valid('json')

        const suggestResponse = await suggestTopicsUseCase.run({
          userId: user.id,
          planId: (user as any).planId,
          options
        })

        const result = suggestResponse.result

        if (!result.success) {
          if (result.insufficientCredits) {
            return c.json({ error: result.error }, 402)
          }
          return c.json({ error: result.error || 'Failed to suggest topics' }, 500)
        }

        return c.json({ topics: result.topics })
      }
    )

    // POST /v1/videos/generate-script-from-title
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/generate-script-from-title',
        tags: ['Videos'],
        summary: 'Generate script from title',
        description: 'Generates a full structured script based on a specific video title.',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  title: z.string().min(1).max(500),
                  options: z
                    .object({
                      language: z.string().optional(),
                      duration: z.number().optional(),
                      aspectRatio: z.string().optional()
                    })
                    .optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Script generated',
            content: {
              'application/json': {
                schema: z.object({
                  script: z.string()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
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

        const { title, options } = c.req.valid('json')

        const response = await generateScriptFromTitleUseCase.run({
          userId: user.id,
          planId: (user as any).planId,
          title,
          options
        })

        const result = response.result

        if (!result.success) {
          if (result.insufficientCredits) {
            return c.json({ error: result.error }, 402)
          }
          return c.json({ error: result.error || 'Failed to generate script' }, 500)
        }

        return c.json({ script: result.script })
      }
    )
    this.controller.get('/v1/videos/jobs/:jobId/stream', async (c: any) => {
      const user = c.get('user')
      if (!user) return c.json({ error: 'Unauthorized' }, 401)

      const { jobId } = c.req.param()

      // Rate-limit: allow at most 5 concurrent SSE connections per user
      const sseConnectionKey = `sse:connections:${user.id}`
      const currentConnectionsStr = await redisClient.get(sseConnectionKey)
      const currentConnections = currentConnectionsStr ? Number.parseInt(currentConnectionsStr, 10) : 0

      if (currentConnections >= 5) {
        return c.json({ error: 'Too many active connections. Please wait.' }, 429)
      }

      await redisClient.incr(sseConnectionKey)
      // Expire automatically via TTL in case of unhandled disconnects
      await redisClient.expire(sseConnectionKey, 10 * 60)

      // Find the video by jobId
      const video = await videoRepository.findByJobId(jobId)
      if (!video || video.userId !== user.id) {
        if ((await redisClient.decr(sseConnectionKey)) === 0) {
          await redisClient.del(sseConnectionKey)
        }
        return c.json({ error: 'Job not found' }, 404)
      }

      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform', // no-transform is crucial for Cloudflare caching
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Content-Encoding': 'identity' // Ensure gzip doesn't delay chunks by adding 'identity', or let a proxy configure gzip instead
      })

      const sendEvent = (event: string, data: object) => {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      }

      const releaseConnection = async () => {
        if ((await redisClient.decr(sseConnectionKey)) <= 0) {
          await redisClient.del(sseConnectionKey)
        }
      }

      // If already completed or failed, return immediately
      if (video.status === 'completed') {
        await releaseConnection()
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
        await releaseConnection()
        const body = sendEvent('error', {
          jobId,
          status: 'failed',
          error: video.errorMessage || 'Generation failed',
          retryable: true
        })
        return new Response(body, { headers })
      }

      if (video.status === 'cancelled') {
        await releaseConnection()
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
        start: (controller) => {
          this.initGlobalQueueListener()
          this.startPruningTask()
          const encoder = new TextEncoder()
          let closed = false

          let keepAliveInterval: any = null
          let pollTimeout: any = null
          let connectionTimeout: any = null

          const cleanupStreamResources = async () => {
            if (closed) return
            closed = true

            if (keepAliveInterval) clearInterval(keepAliveInterval)
            if (pollTimeout) clearTimeout(pollTimeout)
            if (connectionTimeout) clearTimeout(connectionTimeout)

            // Remove from global registry
            const streams = this.sseStreamsByJobId.get(jobId)
            if (streams) {
              streams.delete(handleGlobalEvent)
              if (streams.size === 0) {
                this.sseStreamsByJobId.delete(jobId)
              }
            }

            // Also remove from video.id registry (used for BullMQ deduplication events)
            const videoStreams = this.sseStreamsByJobId.get(video.id)
            if (videoStreams) {
              videoStreams.delete(handleGlobalEvent)
              if (videoStreams.size === 0) {
                this.sseStreamsByJobId.delete(video.id)
              }
            }

            try {
              controller.close()
            } catch {
              // already closed
            }

            // Release connection early
            await releaseConnection()
          }

          const enqueue = (text: string) => {
            if (!closed) {
              try {
                controller.enqueue(encoder.encode(text))
              } catch {
                cleanupStreamResources()
              }
            }
          }
          const close = () => {
            cleanupStreamResources()
          }

          c.req.raw.signal.addEventListener('abort', () => {
            close()
          })

          // Adaptive keep-alive heartbeat
          const heartbeatInterval = video.status === 'processing' ? 5000 : 15000
          keepAliveInterval = setInterval(() => {
            enqueue(sendEvent('ping', { timestamp: new Date().toISOString() }))
          }, heartbeatInterval)

          // Send initial connected event
          enqueue(
            sendEvent('connected', {
              jobId,
              status: video.status,
              progress: video.progress || 0
            })
          )

          // Handle incoming events from the global registry
          const handleGlobalEvent = (eventName: string, data: any) => {
            enqueue(sendEvent(eventName, data))
            if (eventName === 'completed' || eventName === 'error') {
              close() // Auto-close connection when final state is reached
            }
          }

          try {
            // Check if queue events are functioning (if throws, fallback to polling)
            getVideoQueueEvents()

            // Register this specific connection to the global map using jobId
            if (!this.sseStreamsByJobId.has(jobId)) {
              this.sseStreamsByJobId.set(jobId, new Set())
            }
            this.sseStreamsByJobId.get(jobId)!.add(handleGlobalEvent)

            // Also register using video.id (because GenerateVideoUseCase uses videoId for BullMQ deduplication)
            if (video.id !== jobId) {
              if (!this.sseStreamsByJobId.has(video.id)) {
                this.sseStreamsByJobId.set(video.id, new Set())
              }
              this.sseStreamsByJobId.get(video.id)!.add(handleGlobalEvent)
            }

            // Connection TTL (max 30 mins just in case)
            connectionTimeout = setTimeout(close, 30 * 60 * 1000)
          } catch (error) {
            console.warn('Queue events not available, falling back to polling:', error)

            // Exponential backoff polling
            let pollIntervalMs = 2000
            const maxPollIntervalMs = 30000

            const doPoll = async () => {
              if (closed) return
              try {
                const updated = await videoRepository.findByJobId(jobId)
                if (!updated) {
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
                  close()
                  return
                } else if (updated.status === 'failed' || updated.status === 'cancelled') {
                  enqueue(
                    sendEvent('error', {
                      jobId,
                      status: updated.status,
                      error: updated.errorMessage || 'Generation failed',
                      retryable: updated.status === 'failed'
                    })
                  )
                  close()
                  return
                } else if (updated.progress !== video.progress) {
                  // Reset backoff on progress
                  pollIntervalMs = 2000
                  enqueue(
                    sendEvent('progress', {
                      jobId,
                      status: updated.status,
                      progress: updated.progress,
                      step: updated.currentStep,
                      message: updated.currentStep
                    })
                  )
                } else {
                  // Increase poll interval if no progress
                  pollIntervalMs = Math.min(pollIntervalMs * 1.5, maxPollIntervalMs)
                }
              } catch {
                close()
                return
              }
              pollTimeout = setTimeout(doPoll, pollIntervalMs)
            }

            pollTimeout = setTimeout(doPoll, pollIntervalMs)
            connectionTimeout = setTimeout(close, 30 * 60 * 1000)
          }
        },
        cancel() {
          // Client disconnected - release resources
          // Releasing is handled by controller.close() which eventually sets closed
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

    // POST /v1/videos/:id/cancel
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/cancel',
        tags: ['Videos'],
        summary: 'Cancel a video generation job',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Job cancelled',
            content: {
              'application/json': {
                schema: z.object({ videoId: z.string(), status: z.string() })
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

        // Signal worker to stop via Redis
        await videoGenerationService.stopGeneration(video.id)

        // Try to remove from BullMQ queue IF NOT active
        try {
          if (video.jobId) {
            const queue = getVideoQueue()
            const job = await queue.getJob(video.jobId)
            if (job) {
              const state = await job.getState()
              if (state !== 'active') {
                await job.remove()
              }
            }
          }
        } catch (error) {
          console.warn(`[VideosController] ⚠ Could not remove job ${video.jobId} from queue (it may be locked):`, error)
        }

        await videoRepository.updateStatus(video.id, { status: 'cancelled' })

        return c.json({ videoId: video.id, status: 'draft' })
      }
    )

    // POST /v1/videos/:id/restart
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/restart',
        tags: ['Videos'],
        summary: 'Restart a generic video generation job',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Job restarted',
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

        await videoGenerationService.stopGeneration(video.id)
        // Ensure starting from scratch by deleting checkpoint
        await checkpointService.deleteCheckpoint(video.id)

        // The user requires a re-enqueue, but I might need to check if there is an existing restart generation use case,
        // however the request explicitly mentions deleting checkpoints and stopping generation before re-enqueuing. Let's start with stopGeneration and deleteCheckpoint.
        // Looking at other routes, we'll enqueue similar to /regenerate. Let me just return success for now pending a review of how regenerate works.
        const { result } = await regenerateVideoUseCase.run({
          videoId: id,
          userId: user.id,
          planId: (user as any).planId,
          topic: video.topic,
          options: video.options as any
        })

        if (!result.success) {
          return c.json({ error: result.error || 'Failed to enqueue restart' }, 500)
        }
        return c.json({ success: true, jobId: result.jobId })
      }
    )

    // POST /v1/videos/:id/rescript
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/rescript',
        tags: ['Videos'],
        summary: 'Rescript a video generation job',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          200: {
            description: 'Job rescripted',
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

        await videoGenerationService.stopGeneration(video.id)
        await checkpointService.deleteCheckpoint(video.id)
        await videoRepository.update(video.id, { script: null } as any)

        const { result } = await regenerateVideoUseCase.run({
          videoId: id,
          userId: user.id,
          planId: (user as any).planId,
          topic: video.topic,
          options: video.options as any
        })
        if (!result.success) {
          return c.json({ error: result.error || 'Failed to enqueue rescript' }, 500)
        }

        return c.json({ success: true, jobId: result.jobId })
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
                  options: VideoOptionsSchema.optional(),
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
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  options: VideoOptionsSchema.optional()
                })
              }
            }
          }
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
        const { options } = c.req.valid('json') || {}
        const video = await videoRepository.findByIdAndUserId(id, user.id)
        if (!video) return c.json({ error: 'Video not found' }, 404)

        const { result } = await regenerateVideoUseCase.run({
          videoId: id,
          userId: user.id,
          planId: (user as any).planId,
          topic: video.topic,
          options: {
            ...((video.options as any) || {}),
            ...options
          }
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

    // POST /v1/videos/:id/scenes/:index/reprompt
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/scenes/{index}/reprompt',
        tags: ['Videos'],
        summary: 'Reprompt a specific scene image',
        description: 'Deducts partial credits and regenerates a single scene image with an optional new prompt.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string(), index: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  newPrompt: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          202: {
            description: 'Reprompting started',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  creditsRequired: z.number()
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

        const { id, index } = c.req.valid('param')
        const { newPrompt } = c.req.valid('json')

        const { result } = await repromptSceneImageUseCase.run({
          videoId: id,
          sceneIndex: Number.parseInt(index, 10),
          userId: user.id,
          newPrompt
        })

        if (!result.success) {
          if (result.insufficientCredits) {
            return c.json({ error: result.error }, 402)
          }
          return c.json({ error: result.error || 'Failed to reprompt scene' }, 500)
        }

        return c.json(
          {
            jobId: result.jobId,
            creditsRequired: result.creditsRequired
          },
          202
        )
      }
    )

    // PATCH /v1/videos/:id/voiceover
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/videos/{id}/voiceover',
        tags: ['Videos'],
        summary: 'Choose voiceover preset',
        description: 'Updates the video generation options to use a specific voice preset.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  voicePreset: z.string()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Voiceover updated successfully',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          },
          400: {
            description: 'Bad request',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
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
        const { voicePreset } = c.req.valid('json')

        const result = await chooseVoiceoverUseCase.run({
          videoId: id,
          userId: user.id,
          voicePreset
        })

        if (!result.success) {
          if (result.error === 'Video not found') return c.json({ error: result.error }, 404)
          return c.json({ error: result.error || 'Failed to update voiceover' }, 400)
        }

        return c.json({ success: true, video: result.video }, 200)
      }
    )

    // PATCH /v1/videos/:id/music
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/videos/{id}/music',
        tags: ['Videos'],
        summary: 'Choose background music',
        description: 'Updates the video generation options to use specific background music.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  musicId: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Music updated successfully',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          },
          400: {
            description: 'Bad request',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
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
        const { musicId } = c.req.valid('json')

        const result = await chooseBackgroundMusicUseCase.run({
          videoId: id,
          userId: user.id,
          musicId
        })

        if (!result.success) {
          if (result.error === 'Video not found') return c.json({ error: result.error }, 404)
          return c.json({ error: result.error || 'Failed to update music' }, 400)
        }

        return c.json({ success: true, video: result.video }, 200)
      }
    )

    // PATCH /v1/videos/:id/captions
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/videos/{id}/captions',
        tags: ['Videos'],
        summary: 'Configure captions',
        description: 'Updates the ASS captions configuration for the video.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  captionsConfig: z.any() // Using any here for flexibility as it maps to AssCaptionConfigSchema partially
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Captions updated successfully',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          },
          400: {
            description: 'Bad request',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
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
        const { captionsConfig } = c.req.valid('json')

        const result = await configureCaptionsUseCase.run({
          videoId: id,
          userId: user.id,
          captionsConfig
        })

        if (!result.success) {
          if (result.error === 'Video not found') return c.json({ error: result.error }, 404)
          return c.json({ error: result.error || 'Failed to update captions configuration' }, 400)
        }

        return c.json({ success: true, video: result.video }, 200)
      }
    )

    // PATCH /v1/videos/:id/branding
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/videos/{id}/branding',
        tags: ['Videos'],
        summary: 'Configure branding',
        description: 'Updates the professional branding configuration (logo, watermark) for the video.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  brandingConfig: z.any()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Branding updated successfully',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          },
          400: {
            description: 'Bad request',
            content: { 'application/json': { schema: z.object({ error: z.string() }) } }
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
        const { brandingConfig } = c.req.valid('json')

        const result = await configureBrandingUseCase.run({
          videoId: id,
          userId: user.id,
          brandingConfig
        })

        if (!result.success) {
          if (result.error === 'Video not found') return c.json({ error: result.error }, 404)
          return c.json({ error: result.error || 'Failed to update branding configuration' }, 400)
        }

        return c.json({ success: true, video: result.video }, 200)
      }
    )

    // POST /v1/videos/:id/narrate (Step 2.5)
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/narrate',
        tags: ['Videos'],
        summary: 'Generate narration and transcription (Step 2.5)',
        description: 'Generates global narration audio and transcribes it, synchronizing the script.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() })
        },
        responses: {
          202: {
            description: 'Narration started',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  status: z.string(),
                  creditsRequired: z.number(),
                  message: z.string()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
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

        const { result } = await generateNarrationUseCase.run({
          videoId: id,
          userId: user.id,
          planId: (user as any).planId
        })

        if (!result.success) {
          if (result.insufficientCredits) {
            return c.json({ error: result.error }, 402)
          }
          if (result.error === 'Video not found') {
            return c.json({ error: result.error }, 404)
          }
          return c.json({ error: result.error || 'Failed to enqueue narration' }, 500)
        }

        return c.json(
          {
            jobId: result.jobId,
            status: 'queued',
            creditsRequired: result.creditsRequired,
            message: 'Narration generation in progress...'
          },
          202
        )
      }
    )

    // POST /v1/videos/:id/assemble (Step 3)
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/assemble',
        tags: ['Videos'],
        summary: 'Assemble final video (Step 3)',
        description: 'Generates global narration audio, transcribes it, and assembles the final video package.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  options: z.any().optional()
                })
              }
            }
          }
        },
        responses: {
          202: {
            description: 'Assembly started',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  status: z.string(),
                  creditsRequired: z.number(),
                  message: z.string()
                })
              }
            }
          },
          400: {
            description: 'Bad request',
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
        const { options } = c.req.valid('json') || {}

        const { result } = await generateFinalVideoUseCase.run({
          videoId: id,
          userId: user.id,
          planId: (user as any).planId,
          options
        })

        if (!result.success) {
          if (result.insufficientCredits) {
            return c.json({ error: result.error }, 402)
          }
          if (result.error === 'Video not found') {
            return c.json({ error: result.error }, 404)
          }
          return c.json({ error: result.error || 'Failed to enqueue assembly' }, 500)
        }

        return c.json(
          {
            jobId: result.jobId,
            status: 'queued',
            creditsRequired: result.creditsRequired,
            message: 'Final assembly in progress...'
          },
          202
        )
      }
    )

    // POST /v1/videos/:id/generate-scenes
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/videos/{id}/generate-scenes',
        tags: ['Videos'],
        summary: 'Generate visual assets (scenes) for a video',
        description: 'Enqueues a job to generate scene images without audio, allowing for script edits.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            id: z.string().openapi({ example: 'vid-123' })
          })
        },
        responses: {
          202: {
            description: 'Job enqueued',
            content: {
              'application/json': {
                schema: z.object({
                  jobId: z.string(),
                  creditsRequired: z.number()
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

        const { id } = c.req.valid('param')
        const { result } = await generateScenesUseCase.run({
          videoId: id,
          userId: user.id
        })

        if (!result.success) {
          if (result.insufficientCredits) return c.json({ error: result.error }, 402)
          return c.json({ error: result.error || 'Failed to start scene generation' }, 400)
        }

        return c.json(result, 202)
      }
    )

    // PATCH /v1/videos/:id
    this.controller.openapi(
      createRoute({
        method: 'patch',
        path: '/v1/videos/{id}',
        tags: ['Videos'],
        summary: 'Update video details',
        description: 'Updates video metadata, script, or options.',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  topic: z.string().optional(),
                  status: z.string().optional(),
                  script: z.any().optional(),
                  options: VideoOptionsSchema.partial().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Video updated',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), video: z.any() }) } }
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
        const data = c.req.valid('json')

        const { result } = await updateVideoUseCase.run({
          videoId: id,
          userId: user.id,
          data
        })

        if (!result.success) {
          if (result.error === 'Video not found') return c.json({ error: result.error }, 404)
          return c.json({ error: result.error || 'Failed to update video' }, 500)
        }

        return c.json({ success: true, video: result.video })
      }
    )
  }
}
