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
import * as fs from 'node:fs'
import { Worker, Job } from 'bullmq'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { uploadVideoToMinio, uploadBuffer } from '@/infrastructure/config/storage.config'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import { VIDEO_QUEUE_NAME, redisConnectionOptions, type VideoJobData } from '@/infrastructure/config/queue.config'

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
    await videoRepository.updateStatus(videoId, { status: 'processing', progress: 5, currentStep: 'script_generation' })
    await reportProgress(job, videoId, 'script_generation', 10, 'Generating script...')

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
      userId
    }

    if (options.voiceId) {
      genOptions.kokoroVoicePreset = options.voiceId
    }

    await reportProgress(job, videoId, 'script_generation', 25, 'Script generated, starting asset generation...')

    // Run the full generation pipeline
    const pkg = await videoGenerationService.generateVideo({
      topic,
      userId,
      options: genOptions
    })

    await reportProgress(job, videoId, 'upload', 85, 'Uploading video to storage...')

    // Look for the final video in the output directory
    const outputPath = pkg.outputPath
    const finalMp4 = path.join(outputPath, 'final_video.mp4')
    const assembledMp4 = path.join(outputPath, 'assembled_video.mp4')
    const thumbnailJpg = path.join(outputPath, 'thumbnail.jpg')
    const narrationMp3 = path.join(outputPath, 'narration.mp3')
    const captionsAss = path.join(outputPath, 'captions.ass')

    const videoFilePath = fs.existsSync(finalMp4)
      ? finalMp4
      : fs.existsSync(assembledMp4)
        ? assembledMp4
        : null

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
    const duration = pkg.script?.totalDuration ?? (genOptions.maxDuration as number | undefined) ?? DEFAULT_VIDEO_DURATION

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
      completedAt: new Date()
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
      concurrency: parseInt(process.env.VIDEO_WORKER_CONCURRENCY || '2', 10)
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
