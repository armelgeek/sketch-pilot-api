import * as fs from 'node:fs'
import process from 'node:process'
import '@/utils/polyfills'

/**
 * Video Generation Worker — BullMQ worker that executes video generation jobs.
 *
 * This worker:
 * 1. Picks up jobs from the 'video-generation' BullMQ queue
 * 2. Uses the NanoBananaEngine (via VideoGenerationService) to produce the video
 * 3. Uploads the result to MinIO
 * 4. Updates the video record in the database
 * 5. Reports progress back via BullMQ job.updateProgress()
 */
import * as path from 'node:path'
import { Worker, type Job } from 'bullmq'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { redisConnectionOptions, VIDEO_QUEUE_NAME, type VideoJobData } from '@/infrastructure/config/queue.config'
import { uploadBuffer, uploadFile, uploadVideoToMinio } from '@/infrastructure/config/storage.config'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { CompleteVideoPackage } from '@sketch-pilot/types/video-script.types'

const DEFAULT_VIDEO_DURATION = 60 // seconds

const videoRepository = new VideoRepository()
const videoGenerationService = new VideoGenerationService()

/**
 * Emit a progress update for a job.
 */
async function reportProgress(
  job: Job<VideoJobData>,
  videoId: string,
  step: string,
  progress: number,
  message: string
): Promise<void> {
  await job.updateProgress({ step, progress, message, status: 'processing' })
  await videoRepository.updateStatus(videoId, { status: 'processing', progress, currentStep: step })
}

/**
 * Process a single video generation job.
 */
async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { videoId, userId, topic, options } = job.data

  try {
    // 0. Fetch the video record early to access options (like localProjectId)
    const videoRecord = await videoRepository.findByIdAndUserId(videoId, userId)
    if (!videoRecord) {
      throw new Error('Video not found.')
    }

    // Determine the fixed folder name for this video
    let effectiveProjectId = (videoRecord.options as any)?.localProjectId
    if (!effectiveProjectId) {
      effectiveProjectId = `video-${Date.now()}-${Math.random().toString(36).slice(7)}`
      // LOCK IT IN DB IMMEDIATELY
      await videoRepository.updateStatus(videoId, {
        options: {
          ...((videoRecord.options as any) || {}),
          localProjectId: effectiveProjectId
        }
      })
    }

    let pkg: CompleteVideoPackage

    // Build generation options from job data
    const genOptions: Record<string, any> = {
      maxDuration: options.duration || DEFAULT_VIDEO_DURATION,
      sceneCount: options.sceneCount || 6,
      style: options.style || 'educational',
      videoType: options.videoType,
      videoGenre: options.videoGenre,
      language: options.language || 'en',
      llmProvider: options.llmProvider || 'gemini',
      imageProvider: options.imageProvider || 'gemini',
      audioProvider: options.voiceProvider || 'kokoro',
      qualityMode: options.qualityMode || 'standard',
      characterConsistency: options.characterConsistency !== false,
      autoTransitions: options.autoTransitions !== false,
      skipAudio: options.skipAudio || false,
      generateOnlyScenes: options.generateOnlyScenes || false,
      generateFromScript: options.generateFromScript || false,
      customSpec: options.customSpec,
      characterModelId: options.characterModelId,
      userId
    }

    if (options.voiceId) {
      genOptions.kokoroVoicePreset = options.voiceId
    }

    if (options.generateFromScript && videoRecord.script) {
      await videoRepository.updateStatus(videoId, {
        status: 'processing',
        progress: 10,
        currentStep: options.generateOnlyAudio ? 'narration_generation' : 'rendering'
      })

      const stepLabel = options.generateOnlyAudio ? 'Generating narration...' : 'Rendering video...'
      await reportProgress(job, videoId, options.generateOnlyAudio ? 'narration' : 'rendering', 15, stepLabel)

      // Run the specialized rendering pipeline
      pkg = await videoGenerationService.renderVideoFromScript({
        topic: videoRecord.topic,
        userId,
        script: videoRecord.script as any,
        options: {
          ...genOptions,
          generateOnlyAudio: options.generateOnlyAudio,
          generateOnlyAssembly: options.generateOnlyAssembly
        },
        projectId: effectiveProjectId
      })

      // Persist synced script to DB immediately
      if (pkg.script) {
        await videoRepository.updateStatus(videoId, {
          script: pkg.script as any,
          scenes: pkg.script.scenes as any
        })
      }
    } else {
      await videoRepository.updateStatus(videoId, {
        status: 'processing',
        progress: 5,
        currentStep: 'script_generation'
      })
      await reportProgress(job, videoId, 'script_generation', 10, 'Generating script...')

      await reportProgress(job, videoId, 'script_generation', 25, 'Script generated, starting asset generation...')

      // Run the full generation pipeline
      pkg = await videoGenerationService.generateVideo({
        topic,
        userId,
        options: genOptions,
        projectId: effectiveProjectId
      })

      // Persist script to DB
      if (pkg.script) {
        await videoRepository.updateStatus(videoId, {
          script: pkg.script as any,
          scenes: pkg.script.scenes as any
        })
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // NEW: Handle Narration-Only Phase (Step 2.5)
    // ─────────────────────────────────────────────────────────────────────────────
    if (options.generateOnlyAudio) {
      await reportProgress(job, videoId, 'upload_audio', 90, 'Uploading narration and transcription...')

      const narrationMp3 = path.join(pkg.outputPath, 'global_narration.mp3')
      const transcriptionJson = path.join(pkg.outputPath, 'transcription.json')

      let narrationUrl: string | undefined
      if (fs.existsSync(narrationMp3)) {
        narrationUrl = await uploadFile(videoId, narrationMp3, `videos/${videoId}/narration.mp3`, 'audio/mpeg')
      }

      let captionsUrl: string | undefined
      if (fs.existsSync(transcriptionJson)) {
        const buffer = fs.readFileSync(transcriptionJson)
        captionsUrl = await uploadBuffer(`videos/${videoId}/transcription.json`, buffer, 'application/json')
      }

      // Update script with public URL
      if (pkg.script && narrationUrl) {
        ;(pkg.script as any).globalAudio = narrationUrl
      }

      await videoRepository.updateStatus(videoId, {
        status: 'narration_generated',
        progress: 100,
        currentStep: 'done',
        narrationUrl,
        captionsUrl,
        script: pkg.script as any,
        scenes: pkg.script?.scenes as any,
        completedAt: new Date()
      })

      await job.updateProgress({
        step: 'completed',
        progress: 100,
        status: 'completed',
        videoId,
        narrationUrl
      })

      console.info(`[VideoWorker] Narration generated & persisted for videoId: ${videoId}`)
      return
    }

    if (options.generateOnlyScenes) {
      await reportProgress(job, videoId, 'upload_scenes', 90, 'Uploading scene images and updating database...')

      const updatedScenes = [...(pkg.script?.scenes || [])]

      for (const scene of updatedScenes as any[]) {
        const sceneDir = path.join(pkg.outputPath, 'scenes', scene.id)
        const sceneWebp = path.join(sceneDir, 'scene.webp')
        const thumbnailJpg = path.join(sceneDir, 'thumbnail.jpg')

        if (fs.existsSync(sceneWebp)) {
          const buffer = fs.readFileSync(sceneWebp)
          scene.imageUrl = await uploadBuffer(`videos/${videoId}/scenes/${scene.id}/scene.webp`, buffer, 'image/webp')
        }

        if (fs.existsSync(thumbnailJpg)) {
          const buffer = fs.readFileSync(thumbnailJpg)
          scene.thumbnailUrl = await uploadBuffer(
            `videos/${videoId}/scenes/${scene.id}/thumbnail.jpg`,
            buffer,
            'image/jpeg'
          )
        }
      }

      await videoRepository.updateStatus(videoId, {
        status: 'scenes_generated',
        progress: 100,
        currentStep: 'done',
        script: pkg.script as any,
        scenes: updatedScenes as any,
        completedAt: new Date(),
        options: {
          ...((videoRecord.options as any) || {}),
          localProjectId: pkg.projectId
        }
      })

      await job.updateProgress({
        step: 'completed',
        progress: 100,
        status: 'completed',
        videoId
      })

      console.info(`[VideoWorker] Scene generation completed for videoId: ${videoId}`)
      return
    }

    await reportProgress(job, videoId, 'upload', 85, 'Uploading video to storage...')

    // Look for the final video in the output directory
    const outputPath = pkg.outputPath
    const finalMp4 = path.join(outputPath, 'final_video.mp4')
    const assembledMp4 = path.join(outputPath, 'assembled_video.mp4')
    const thumbnailJpg = path.join(outputPath, 'thumbnail.jpg')
    const narrationMp3 = path.join(outputPath, 'narration.mp3')
    const captionsAss = path.join(outputPath, 'captions.ass')

    const videoFilePath = fs.existsSync(finalMp4) ? finalMp4 : fs.existsSync(assembledMp4) ? assembledMp4 : null

    let videoUrl: string | undefined
    let thumbnailUrl: string | undefined
    let narrationUrl: string | undefined
    let captionsUrl: string | undefined

    if (videoFilePath) {
      videoUrl = await uploadVideoToMinio(videoId, videoFilePath)
    }

    if (fs.existsSync(thumbnailJpg)) {
      const buffer = fs.readFileSync(thumbnailJpg)
      thumbnailUrl = await uploadBuffer(`videos/${videoId}/thumbnail.jpg`, buffer, 'image/jpeg')
    }

    if (fs.existsSync(narrationMp3)) {
      const buffer = fs.readFileSync(narrationMp3)
      narrationUrl = await uploadBuffer(`videos/${videoId}/narration.mp3`, buffer, 'audio/mpeg')
    }

    if (fs.existsSync(captionsAss)) {
      const buffer = fs.readFileSync(captionsAss)
      captionsUrl = await uploadBuffer(`videos/${videoId}/captions.ass`, buffer, 'text/plain')
    }

    // Derive duration from script
    const duration = Math.round(
      pkg.script?.totalDuration ?? (genOptions.maxDuration as number | undefined) ?? DEFAULT_VIDEO_DURATION
    )

    await videoRepository.updateStatus(videoId, {
      status: 'completed',
      progress: 100,
      currentStep: 'done',
      videoUrl: videoUrl ?? undefined,
      thumbnailUrl: thumbnailUrl ?? undefined,
      narrationUrl: narrationUrl ?? undefined,
      captionsUrl: captionsUrl ?? undefined,
      duration,
      script: pkg.script as any,
      scenes: pkg.script?.scenes as any,
      completedAt: new Date(),
      options: {
        ...((videoRecord.options as any) || {}),
        localProjectId: pkg.projectId
      }
    })

    await job.updateProgress({
      step: 'completed',
      progress: 100,
      status: 'completed',
      videoId,
      videoUrl,
      thumbnailUrl,
      duration
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video generation failed'
    await videoRepository.updateStatus(videoId, {
      status: 'failed',
      errorMessage: message
    })
    throw error // Let BullMQ handle retries
  }
}

/**
 * Start the video generation worker.
 * Call this once at application startup.
 */
export function startVideoGenerationWorker(): Worker<VideoJobData> {
  const worker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAME,
    async (job) => {
      console.info(`[VideoWorker] Processing job ${job.id} — videoId: ${job.data.videoId}`)
      await processVideoJob(job)
    },
    {
      connection: redisConnectionOptions,
      concurrency: Number.parseInt(process.env.VIDEO_WORKER_CONCURRENCY || '2', 10)
    }
  )

  worker.on('completed', (job) => {
    console.info(`[VideoWorker] Job ${job.id} completed — videoId: ${job.data.videoId}`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[VideoWorker] Job ${job?.id} failed — videoId: ${job?.data?.videoId}:`, err.message)
  })

  worker.on('error', (err) => {
    console.error('[VideoWorker] Worker error:', err)
  })

  console.info('[VideoWorker] Video generation worker started')
  return worker
}
