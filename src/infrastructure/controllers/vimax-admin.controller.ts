import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { LLMServiceFactory } from '@sketch-pilot/services/llm'
import type { Routes } from '@/domain/types'
import { VimaxUniversalCriticAgent } from '../../../plugins/sketch-pilot/src/plugins/vimax/agents/vimax-universal-critic.agent'
import { VimaxVisionAuditor } from '../../../plugins/sketch-pilot/src/plugins/vimax/agents/vimax-vision-auditor.agent'
import { VimaxAgent } from '../../../plugins/sketch-pilot/src/plugins/vimax/pipeline/vimax.agent'
import { SagaProductionService } from '../../../plugins/sketch-pilot/src/plugins/vimax/services/saga-production.service'
import { requireAdmin } from '../middlewares/admin.middleware'
import { SeriesRepository } from '../repositories/series.repository'
import { VideoRepository } from '../repositories/video.repository'

export class VimaxAdminController implements Routes {
  public controller: OpenAPIHono
  private seriesRepository: SeriesRepository
  private videoRepository: VideoRepository
  private sagaProductionService?: SagaProductionService
  private vimaxAgent?: VimaxAgent

  constructor() {
    this.controller = new OpenAPIHono()
    this.seriesRepository = new SeriesRepository()
    this.videoRepository = new VideoRepository()
  }

  private async getSagaProductionService(): Promise<SagaProductionService> {
    if (this.sagaProductionService) return this.sagaProductionService
    const llmService = await LLMServiceFactory.create({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || ''
    })
    this.sagaProductionService = new SagaProductionService(llmService, this.seriesRepository, this.videoRepository)
    return this.sagaProductionService
  }

  private async getVimaxAgent(): Promise<VimaxAgent> {
    if (this.vimaxAgent) return this.vimaxAgent
    const llmService = await LLMServiceFactory.create({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || ''
    })
    this.vimaxAgent = new VimaxAgent(llmService)
    return this.vimaxAgent
  }

  public initRoutes() {
    this.controller.use('/v1/admin/vimax/*', requireAdmin)

    // POST /v1/admin/vimax/sync-logs/{id}
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/sync-logs/{id}',
        tags: ['Vimax Admin'],
        summary: 'Synchronize saga logs from database to filesystem',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Logs synchronized',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const service = await this.getSagaProductionService()
        await service.syncLogsFromDatabase(id)
        return c.json({ success: true })
      }
    )

    // POST /v1/admin/vimax/learn
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/learn',
        tags: ['Vimax Admin'],
        summary: 'Trigger autonomous learning cycle',
        security: [{ Bearer: [] }],
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({ seriesId: z.string().optional() })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Learning cycle triggered',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), newLessons: z.number() }) } }
          }
        }
      }),
      async (c: any) => {
        const { seriesId } = await c.req.json().catch(() => ({}))
        const agent = await this.getVimaxAgent()
        const newCount = await agent.brain.autonomousLearning({ seriesId })
        return c.json({ success: true, newLessons: newCount })
      }
    )

    // GET /v1/admin/vimax/stats
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/vimax/stats',
        tags: ['Vimax Admin'],
        summary: 'Get brain performance analytics',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Brain stats',
            content: { 'application/json': { schema: z.any() } }
          }
        }
      }),
      async (c: any) => {
        const agent = await this.getVimaxAgent()
        const stats = await agent.brain.getPerformanceStats()
        return c.json({ success: true, stats })
      }
    )

    // GET /v1/admin/vimax/learning-episodes
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/vimax/learning-episodes',
        tags: ['Vimax Admin'],
        summary: 'List learning episodes',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'List of episodes',
            content: { 'application/json': { schema: z.array(z.any()) } }
          }
        }
      }),
      async (c: any) => {
        const agent = await this.getVimaxAgent()
        const episodes = await agent.brain.loadEpisodes()

        // Sort and map episodes with fallbacks for missing metadata
        const mapped = episodes
          .slice(-40) // Take last 40 entries
          .map((e: any) => ({
            id: e.id,
            agentName: e.agentName || 'VimaxAgent',
            title:
              e.userPrompt?.slice(0, 50) ||
              e.summary?.slice(0, 50) ||
              e.narration?.slice(0, 50) ||
              'Épisode sans prompt',
            seriesId: e.seriesId || e.id?.split('-ep')[0] || 'Inconnue',
            score: e.evaluation?.score !== undefined ? e.evaluation.score : e.id ? 5 : 0,
            defectsCount: e.evaluation?.feedbacks?.length || 0,
            timestamp: e.timestamp || Date.now() // Fallback to current time if missing
          }))
          .reverse() // Most recent first

        return c.json({ success: true, episodes: mapped })
      }
    )

    // NEW: GET /v1/admin/vimax/lessons
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/vimax/lessons',
        tags: ['Vimax Admin'],
        summary: 'List all brain lessons (Cortex & Hippocampus)',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'List of lessons',
            content: { 'application/json': { schema: z.array(z.any()) } }
          }
        }
      }),
      async (c: any) => {
        const agent = await this.getVimaxAgent()
        const store = (agent.brain as any).store
        await store.load()
        return c.json({ success: true, lessons: store.getAllLessons() })
      }
    )

    // NEW: POST /v1/admin/vimax/lessons/{id}/validate
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/lessons/{id}/validate',
        tags: ['Vimax Admin'],
        summary: 'Promote lesson to Cortex',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Lesson validated',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const agent = await this.getVimaxAgent()
        const store = (agent.brain as any).store
        const success = await store.promoteLesson(id)
        return c.json({ success })
      }
    )

    // NEW: DELETE /v1/admin/vimax/lessons/{id}
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/vimax/lessons/{id}',
        tags: ['Vimax Admin'],
        summary: 'Remove lesson',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Lesson removed',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const agent = await this.getVimaxAgent()
        const store = (agent.brain as any).store
        await store.deleteLesson(id)
        return c.json({ success: true })
      }
    )

    // NEW: POST /v1/admin/vimax/rollback
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/rollback',
        tags: ['Vimax Admin'],
        summary: 'Rollback brain state',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Rollback successful',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const agent = await this.getVimaxAgent()
        const success = await agent.brain.rollbackLessons()
        return c.json({ success })
      }
    )

    // NEW: POST /v1/admin/vimax/consolidate
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/consolidate',
        tags: ['Vimax Admin'],
        summary: 'Maintenance: Consolidate lessons',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'Consolidation complete',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const agent = await this.getVimaxAgent()
        await agent.brain.consolidateLessons()
        return c.json({ success: true })
      }
    )
    // NEW: GET /v1/admin/vimax/sagas
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/vimax/sagas',
        tags: ['Vimax Admin'],
        summary: 'List all cinematic sagas',
        security: [{ Bearer: [] }],
        responses: {
          200: {
            description: 'List of sagas',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), sagas: z.array(z.any()) }) } }
          }
        }
      }),
      async (c: any) => {
        const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas')
        const entries = await fs.readdir(sagaDir, { withFileTypes: true }).catch(() => [])
        const sagas = []

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const planPath = path.join(sagaDir, entry.name, 'plan.json')
            const planExists = await fs
              .access(planPath)
              .then(() => true)
              .catch(() => false)
            const metadata = { id: entry.name, title: 'Saga sans titre', status: 'unknown' }

            if (planExists) {
              const planContent = JSON.parse(await fs.readFile(planPath, 'utf8'))
              metadata.title = planContent.title || planContent.theme || metadata.title
              metadata.status = planContent.status || 'stable'
            }

            const episodesDir = path.join(sagaDir, entry.name, 'episodes')
            const files = await fs.readdir(episodesDir).catch(() => [])
            const epCount = files.filter((f) => f.startsWith('episode-') && f.endsWith('.json')).length

            sagas.push({ ...metadata, episodeCount: epCount })
          }
        }

        return c.json({ success: true, sagas })
      }
    )

    // NEW: GET /v1/admin/vimax/sagas/{id}
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/vimax/sagas/{id}',
        tags: ['Vimax Admin'],
        summary: 'Get full saga state',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Saga state',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), saga: z.any() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', id)

        const planPath = path.join(sagaDir, 'plan.json')
        const plan = await fs
          .readFile(planPath, 'utf8')
          .then(JSON.parse)
          .catch(() => null)

        if (!plan) return c.json({ success: false, message: 'Saga not found' }, 404)

        const videoRepo = new VideoRepository()
        const dbVideos = await videoRepo.findBySeriesId(id)

        const episodesDir = path.join(sagaDir, 'episodes')
        const epFiles = await fs.readdir(episodesDir).catch(() => [])
        const episodes = []
        for (const file of epFiles) {
          if (file.startsWith('episode-') && file.endsWith('.json')) {
            const ep = JSON.parse(await fs.readFile(path.join(episodesDir, file), 'utf8'))

            // Enrich with DB data (images, status)
            const dbVideo = dbVideos.find((v) => v.episodeNumber === ep.episodeNumber)
            if (dbVideo) {
              ep.thumbnailUrl = dbVideo.thumbnailUrl
              ep.videoUrl = dbVideo.videoUrl
              ep.status = dbVideo.status

              // Load scenes if possible
              const fullVideo = await videoRepo.findById(dbVideo.id)
              if (fullVideo && fullVideo.scenes) {
                ep.scenes = ep.scenes.map((s: any, idx: number) => {
                  const dbScene = fullVideo.scenes.find((ds: any) => ds.sceneNumber === idx + 1)
                  return dbScene ? { ...s, imageUrl: dbScene.imageUrl, thumbnailUrl: dbScene.thumbnailUrl } : s
                })
              }
            }

            episodes.push(ep)
          }
        }

        const audits = []

        // Load from root saga directory (legacy/mixed)
        const rootFiles = await fs.readdir(sagaDir).catch(() => [])
        for (const file of rootFiles) {
          if (file.startsWith('audit-') && file.endsWith('.json')) {
            const audit = JSON.parse(await fs.readFile(path.join(sagaDir, file), 'utf8'))
            audits.push({ file, ...audit })
          }
        }

        // Load from specialized audits/ directory
        const auditsDir = path.join(sagaDir, 'audits')
        const auditFiles = await fs.readdir(auditsDir).catch(() => [])
        for (const file of auditFiles) {
          if (file.startsWith('audit-') && file.endsWith('.json')) {
            const audit = JSON.parse(await fs.readFile(path.join(auditsDir, file), 'utf8'))
            // Éviter les doublons si déjà chargé depuis le root
            if (!audits.some((a: any) => a.file === file)) {
              audits.push({ file: `audits/${file}`, ...audit })
            }
          }
        }

        return c.json({ success: true, saga: { ...plan, episodes, audits } })
      }
    )

    // NEW: POST /v1/admin/vimax/sagas/{id}/audit
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/sagas/{id}/audit',
        tags: ['Vimax Admin'],
        summary: 'Trigger granular audit for a saga',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  section: z.enum(['plan', 'all']).default('all')
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Audit triggered',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const { section } = await c.req.json()
        const agent = await this.getVimaxAgent()

        // This is a long-running process, we'll run it async
        this.runGranularAudit(agent, id, section).catch((error) => console.error(`[Admin] Audit failed:`, error))

        return c.json({ success: true, message: 'Audit triggered in background' })
      }
    )

    // NEW: POST /v1/admin/vimax/sagas/{id}/fix-all
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/sagas/{id}/fix-all',
        tags: ['Vimax Admin'],
        summary: 'Apply all pending feedbacks to a saga',
        security: [{ Bearer: [] }],
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'Fix-all complete',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const agent = await this.getVimaxAgent()

        const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', id)
        const files = await fs.readdir(sagaDir).catch(() => [])
        const auditFiles = files.filter((f) => f.startsWith('audit-') && f.endsWith('.json'))

        if (auditFiles.length === 0) {
          return c.json({ success: false, message: 'No audits found' }, 404)
        }

        for (const file of auditFiles) {
          const auditPath = path.join(sagaDir, file)
          const parts = file.replace('.json', '').split('-')
          const type = parts[1]
          const aId = parts.slice(2).join('-')

          let filePath: string
          if (type === 'plan') filePath = path.join(sagaDir, 'plan.json')
          else if (type === 'episode') filePath = path.join(sagaDir, 'episodes', `episode-${aId}.json`)
          else continue

          try {
            const rawAudit = await fs.readFile(auditPath, 'utf8')
            const audit = JSON.parse(rawAudit)
            const pendingFeedbacks = audit.feedbacks.filter((f: any) => !f.processed)
            if (pendingFeedbacks.length === 0) continue

            const originalData = JSON.parse(await fs.readFile(filePath, 'utf8'))
            const refined = await agent.refineItemFromFeedbacks(type, originalData, pendingFeedbacks)

            for (const f of pendingFeedbacks) {
              await agent.brain.registerLessonFromFeedback(f)
              f.processed = true
            }

            await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
            await fs.writeFile(filePath, JSON.stringify(refined, null, 2), 'utf8')
          } catch (error) {
            console.error(`[FixAll] Error on ${file}:`, error)
          }
        }

        return c.json({ success: true })
      }
    )

    // NEW: POST /v1/admin/vimax/episodes/{id}/learn
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/episodes/{id}/learn',
        tags: ['Vimax Admin'],
        summary: 'Manually critique and learn from a specific episode',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({ critique: z.string() })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Learning successful',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const { critique } = await c.req.json()
        const agent = await this.getVimaxAgent()
        const success = await agent.brain.processHumanFeedback(id, critique)
        return c.json({ success })
      }
    )

    // NEW: POST /v1/admin/vimax/lessons/{id}/refine
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/lessons/{id}/refine',
        tags: ['Vimax Admin'],
        summary: 'Refine an existing brain lesson',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({ feedback: z.string() })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Lesson refined',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const { feedback } = await c.req.json()
        const agent = await this.getVimaxAgent()
        await agent.brain.refineLesson(id, feedback)
        return c.json({ success: true })
      }
    )

    // NEW: POST /v1/admin/vimax/sagas/{id}/episodes/{num}/audit-visual
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/sagas/{id}/episodes/{num}/audit-visual',
        tags: ['Vimax Admin'],
        summary: 'Trigger visual audit for a specific episode',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string(), num: z.string() })
        },
        responses: {
          200: {
            description: 'Visual audit successful',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), audits: z.array(z.any()) }) } }
          }
        }
      }),
      async (c: any) => {
        const { id, num } = c.req.valid('param')
        const episodeNumber = Number.parseInt(num)
        const agent = await this.getVimaxAgent()
        const visualAuditor = new VimaxVisionAuditor(agent.llm)

        const videoRepo = new VideoRepository()
        const dbVideos = await videoRepo.findBySeriesId(id)
        const dbVideo = dbVideos.find((v) => v.episodeNumber === episodeNumber)

        if (!dbVideo) return c.json({ error: 'Episode not found in database' }, 404)

        const fullVideo = await videoRepo.findById(dbVideo.id)
        if (!fullVideo || !fullVideo.scenes) return c.json({ error: 'Scenes not found' }, 404)

        const episodesDir = path.join(process.cwd(), 'vimax-logs', 'sagas', id, 'episodes')
        const files = await fs.readdir(episodesDir).catch(() => [])
        const epFileName = files.find((f) => f === `episode-${episodeNumber}.json`)
        if (!epFileName) return c.json({ error: 'Episode log not found' }, 404)

        const epLog = JSON.parse(await fs.readFile(path.join(episodesDir, epFileName), 'utf8'))

        const audits = []
        for (const scene of fullVideo.scenes) {
          if (scene.imageUrl) {
            const report = await visualAuditor.auditImage(
              scene.imageUrl,
              scene.narration,
              epLog.characterProfiles?.map((p: any) => p.identifier) || []
            )
            audits.push({ sceneNumber: scene.sceneNumber, imageUrl: scene.imageUrl, ...report })
          }
        }

        // Save visual audit report
        const auditPath = path.join(
          process.cwd(),
          'vimax-logs',
          'sagas',
          id,
          'audits',
          `audit-visual-ep${episodeNumber}-${Date.now()}.json`
        )
        await fs.writeFile(
          auditPath,
          JSON.stringify(
            {
              type: 'visual',
              episodeNumber,
              timestamp: new Date().toISOString(),
              audits
            },
            null,
            2
          ),
          'utf8'
        )

        return c.json({ success: true, audits })
      }
    )

    // NEW: POST /v1/admin/vimax/sagas/{id}/episodes/{num}/scenes/{sceneNum}/learn
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/sagas/{id}/episodes/{num}/scenes/{sceneNum}/learn',
        tags: ['Vimax Admin'],
        summary: 'Learn from a specific scene critique',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string(), num: z.string(), sceneNum: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({ critique: z.string() })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Learning successful',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id, num, sceneNum } = c.req.valid('param')
        const { critique } = await c.req.json()
        const agent = await this.getVimaxAgent()
        const success = await agent.brain.processSceneFeedback(
          id,
          Number.parseInt(num),
          Number.parseInt(sceneNum),
          critique
        )
        return c.json({ success })
      }
    )

    // NEW: POST /v1/admin/vimax/sagas/{id}/audits/{fileName}/scenes/{sceneNum}/processed
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/sagas/{id}/audits/{fileName}/scenes/{sceneNum}/processed',
        tags: ['Vimax Admin'],
        summary: 'Mark a scene in an audit report as processed',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            id: z.string(),
            fileName: z.string(),
            sceneNum: z.string()
          })
        },
        responses: {
          200: {
            description: 'Success',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id, fileName, sceneNum } = c.req.valid('param')
        const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', id)
        const auditPath = path.join(sagaDir, fileName)

        try {
          const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'))
          if (audit.audits) {
            const sceneAudit = audit.audits.find((s: any) => s.sceneNumber === Number.parseInt(sceneNum))
            if (sceneAudit) {
              sceneAudit.processed = true
              await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
              return c.json({ success: true })
            }
          }
          return c.json({ success: false, message: 'Scene not found in audit' }, 404)
        } catch {
          return c.json({ success: false, message: 'Audit file not found' }, 404)
        }
      }
    )

    // NEW: POST /v1/admin/vimax/sagas/{id}/learn-narrative
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/sagas/{id}/learn-narrative',
        tags: ['Vimax Admin'],
        summary: 'Learn from a narrative feedback',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({ id: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  feedback: z.any()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Success',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.valid('param')
        const { feedback } = await c.req.json()
        const agent = await this.getVimaxAgent()
        const success = await agent.brain.processNarrativeFeedback(id, feedback)
        return c.json({ success })
      }
    )

    // NEW: POST /v1/admin/vimax/sagas/{id}/audits/{fileName}/narrative/processed
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/vimax/sagas/{id}/audits/{fileName}/narrative/processed',
        tags: ['Vimax Admin'],
        summary: 'Mark a narrative feedback in an audit report as processed',
        security: [{ Bearer: [] }],
        request: {
          params: z.object({
            id: z.string(),
            fileName: z.string()
          }),
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  issue: z.string()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Success',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
          }
        }
      }),
      async (c: any) => {
        const { id, fileName } = c.req.valid('param')
        const { issue } = await c.req.json()
        const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', id)
        const auditPath = path.join(sagaDir, fileName)

        try {
          const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'))
          if (audit.feedbacks) {
            const feedback = audit.feedbacks.find((f: any) => f.issue === issue)
            if (feedback) {
              feedback.processed = true
              await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
              return c.json({ success: true })
            }
          }
          return c.json({ success: false, message: 'Feedback not found in audit' }, 404)
        } catch {
          return c.json({ success: false, message: 'Audit file not found' }, 404)
        }
      }
    )
  }

  private async runGranularAudit(agent: VimaxAgent, seriesId: string, section: 'plan' | 'all') {
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
    const critic = new VimaxUniversalCriticAgent(agent.llm)
    critic.setSeriesId(seriesId)

    if (section === 'plan' || section === 'all') {
      const planPath = path.join(sagaDir, 'plan.json')
      const planExists = await fs
        .access(planPath)
        .then(() => true)
        .catch(() => false)
      if (planExists) {
        const plan = JSON.parse(await fs.readFile(planPath, 'utf8'))
        const audit = await critic.auditSagaPlan(plan)
        const auditPath = path.join(sagaDir, 'audits', `audit-plan-${Date.now()}.json`)
        await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
      }
    }

    if (section === 'all') {
      const episodesDir = path.join(sagaDir, 'episodes')
      const rootFiles = await fs.readdir(sagaDir).catch(() => [])
      const subFiles = await fs.readdir(episodesDir).catch(() => [])

      const allFiles = [
        ...rootFiles.map((f) => ({ path: path.join(sagaDir, f), name: f })),
        ...subFiles.map((f) => ({ path: path.join(episodesDir, f), name: f }))
      ]

      for (const file of allFiles) {
        if (file.name.startsWith('episode-') && file.name.endsWith('.json')) {
          const ep = JSON.parse(await fs.readFile(file.path, 'utf8'))
          const audit = await critic.auditEpisode(ep)
          const epId = file.name.replace('episode-', '').replace('.json', '')
          const auditPath = path.join(sagaDir, 'audits', `audit-episode-${epId}-${Date.now()}.json`)
          await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
        }
      }
    }
  }
}
