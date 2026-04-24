import process from 'node:process'
import { VimaxBrain } from '@sketch-pilot/plugins/vimax/core/vimax-brain'
import { VimaxLLMAdapter } from '@sketch-pilot/plugins/vimax/core/vimax-llm-adapter'
import { LLMServiceFactory } from '@sketch-pilot/services/llm'
import { Worker, type Job } from 'bullmq'
import { v4 as uuidv4 } from 'uuid'
import {
  BRAIN_LEARNING_QUEUE_NAME,
  redisConnectionOptions,
  type BrainLearningJobData
} from '@/infrastructure/config/queue.config'
import { db } from '@/infrastructure/database/db'
import { vimaxLearningTransactions } from '@/infrastructure/database/schema/vimax.schema'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

const videoRepository = new VideoRepository()

export function startBrainLearningWorker() {
  console.info(`[BrainLearning] Starting worker on queue: ${BRAIN_LEARNING_QUEUE_NAME}`)

  const worker = new Worker(
    BRAIN_LEARNING_QUEUE_NAME,
    async (job: Job<BrainLearningJobData>) => {
      const { videoId, seriesId, userId } = job.data
      console.info(`[BrainLearning] 🧠 Processing learning job for video ${videoId} (Series: ${seriesId})`)

      try {
        // 1. Initialize VimaxBrain with LLM Adapter
        const llmService = await LLMServiceFactory.create({
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY || ''
        })
        const adapter = new VimaxLLMAdapter(llmService)
        const brain = new VimaxBrain(adapter)
        brain.setSeriesId(seriesId)

        // 2. Perform Video Audit & Scoring
        console.info(`[BrainLearning] ⚖️ Auditing video quality for ${videoId}...`)
        const video = await videoRepository.findById(videoId)
        if (!video) throw new Error(`Video ${videoId} not found`)

        // On cherche le log de l'épisode pour l'audit
        const episodes = await brain.loadEpisodes()
        const episode = episodes.find((e) => e.id === videoId || e.seriesId === seriesId) // Simplifié pour le moment

        let auditResult: any = { score: 0, rationale: '', issues: [] }

        if (episode) {
          auditResult = await (brain as any).visionAuditor.scoreEpisode(episode)
          console.info(`[BrainLearning] ⭐ Video Score: ${auditResult.score}/100`)

          // 3. Persist Score to Database
          await videoRepository.update(videoId, {
            score: auditResult.score,
            feedback: {
              rationale: auditResult.rationale,
              issues: auditResult.issues,
              auditedAt: new Date().toISOString()
            }
          })
        } else {
          console.warn(`[BrainLearning] ⚠️ No episode log found for video ${videoId}, skipping scoring.`)
        }

        // 4. Trigger Autonomous Learning (Shadow Loop)
        console.info(`[BrainLearning] 🎓 Running autonomous learning cycle for series ${seriesId}...`)
        const startTime = Date.now()
        const learningResult = await brain.autonomousLearning({ seriesId })
        const durationMs = Date.now() - startTime

        // 5. Persist Learning Transaction
        try {
          await db.insert(vimaxLearningTransactions).values({
            id: uuidv4(),
            seriesId,
            videoId,
            userId,
            narrativeScore: learningResult.narrativeScore,
            visualScore: learningResult.visualScore,
            logicScore: learningResult.logicScore,
            totalScore: learningResult.totalScore,
            newLessonsCount: learningResult.newLessonsCount,
            tokenUsage: learningResult.tokenUsage,
            estimatedCost: ((learningResult.tokenUsage * 0.000003) as any).toFixed(4),
            durationMs,
            lessons: learningResult.lessons as any,
            auditReport: {
              videoId,
              initialScore: auditResult.score,
              initialIssues: auditResult.issues
            }
          })
          console.info(`[BrainLearning] ✅ Learning transaction logged for video ${videoId}`)
        } catch (error) {
          console.error(`[BrainLearning] ❌ Failed to log learning transaction:`, error)
        }

        console.info(`[BrainLearning] ✅ Learning complete. ${learningResult.newLessonsCount} new lessons distilled.`)

        return { success: true, score: auditResult.score, newLessons: learningResult.newLessonsCount }
      } catch (error) {
        console.error(`[BrainLearning] ❌ Job failed for video ${videoId}:`, error)
        throw error
      }
    },
    {
      connection: redisConnectionOptions,
      concurrency: 1, // One learning cycle at a time to avoid DB/File conflicts
      limiter: {
        max: 5,
        duration: 60000 // Max 5 learning cycles per minute
      }
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[BrainLearning] Job ${job?.id} failed:`, err)
  })

  return worker
}
