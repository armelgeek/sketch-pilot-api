import * as fs from 'node:fs'
import process from 'node:process'
import sharp from 'sharp'
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
 * 6. Manages checkpoints for resumption on failure/timeout
 */
import * as path from 'node:path'
import { MetricsTime, Queue, Worker, type Job } from 'bullmq'
import { checkpointStorage } from '@/application/services/checkpoint-storage.service'
import { checkpointService } from '@/application/services/video-checkpoint.service'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { redisConnectionOptions, VIDEO_QUEUE_NAME, type VideoJobData } from '@/infrastructure/config/queue.config'
import { uploadBuffer, uploadFile, uploadVideoToMinio } from '@/infrastructure/config/storage.config'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { CompleteVideoPackage } from '@sketch-pilot/types/video-script.types'

const DEFAULT_VIDEO_DURATION = 60 // seconds

const videoRepository = new VideoRepository()
const videoGenerationService = new VideoGenerationService()

const CHECKPOINT_PHASES = {
  SCRIPT_GENERATION: 'script_generation',
  ASSET_GENERATION: 'asset_generation',
  NARRATION_GENERATION: 'narration_generation',
  VIDEO_ASSEMBLY: 'video_assembly',
  UPLOAD: 'upload',
  COMPLETED: 'completed'
} as const

/**
 * Emit a progress update for a job and save checkpoint.
 * DB writes are debounced: only persist to DB when progress jumps >= 5%
 * to avoid excessive SQL writes during long-running generation.
 */
let lastPersistedProgress = 0
async function reportProgress(
  job: Job<VideoJobData>,
  videoId: string,
  step: string,
  progress: number,
  message: string,
  checkpoint?: any
): Promise<void> {
  // Always emit to BullMQ (fast, Redis-based)
  await job.updateProgress({ step, progress, message, status: 'processing' })

  // Only write to DB if progress jumped >= 5% or it's a terminal step
  const isTerminalStep = step === 'completed' || step === 'failed'
  const shouldPersist = isTerminalStep || progress - lastPersistedProgress >= 5
  if (shouldPersist) {
    await videoRepository.updateStatus(videoId, { status: 'processing', progress, currentStep: step })
    lastPersistedProgress = progress
  }

  if (checkpoint) {
    checkpointStorage.save(checkpoint)
  }
}

/**
 * Initialize or load checkpoint for a job
 */
function initializeCheckpoint(videoId: string, jobId: string): any {
  const existing = checkpointStorage.load(videoId)
  if (existing) {
    // ✅ Only resume the checkpoint if it belongs to the SAME job run.
    // If jobId differs, this is a new job (e.g., a new assemble after scenes were done).
    // Reusing a stale checkpoint would skip phases (like UPLOAD) that should run again.
    if (existing.jobId === jobId) {
      const completedPhases = Object.values(existing.phases)
        .filter((p: any) => p.completed)
        .map((p: any) => p.name)
        .join(', ')
      console.info(
        `[VideoWorker] Resumed from checkpoint for videoId: ${videoId}, completed phases: ${completedPhases}`
      )
      return existing
    } else {
      console.info(
        `[VideoWorker] Stale checkpoint detected for videoId: ${videoId} (old jobId: ${existing.jobId}, new jobId: ${jobId}). Starting fresh.`
      )
      checkpointStorage.delete(videoId)
    }
  }

  const checkpoint = checkpointService.initializeCheckpoint(videoId, jobId)
  checkpointStorage.save(checkpoint)
  return checkpoint
}

/**
 * Find the last completed scene index by checking for existing scene.webp files
 */
function findLastCompletedSceneIndex(scenesDir: string, script: any): number | undefined {
  if (!fs.existsSync(scenesDir)) {
    return undefined
  }

  let lastIndex = -1
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]
    const sceneImagePath = path.join(scenesDir, scene.id, 'scene.webp')
    if (fs.existsSync(sceneImagePath)) {
      lastIndex = i
    } else {
      break // Stop at first missing scene
    }
  }

  return lastIndex >= 0 ? lastIndex + 1 : undefined
}

/**
 * Upload each individual scene's images from local path to MinIO and update URLs in-place.
 */
async function uploadSceneImages(videoId: string, scenes: any[], outputPath: string): Promise<void> {
  console.info(`[VideoWorker] Uploading scene images for video ${videoId}...`)

  for (const scene of scenes) {
    const sceneDir = path.join(outputPath, 'scenes', scene.id)
    const sceneWebp = path.join(sceneDir, 'scene.webp')
    const thumbnailJpg = path.join(sceneDir, 'thumbnail.jpg')

    if (fs.existsSync(sceneWebp)) {
      const buffer = fs.readFileSync(sceneWebp)
      scene.imageUrl = await uploadBuffer(`videos/${videoId}/scenes/${scene.id}/scene.webp`, buffer, 'image/webp')

      // Always regenerate thumbnail from the newest image to ensure sync
      try {
        console.info(`[VideoWorker] Regenerating thumbnail for scene ${scene.id}...`)
        const thumbnailBuffer = await sharp(buffer).resize(480, 270, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer()

        scene.thumbnailUrl = await uploadBuffer(
          `videos/${videoId}/scenes/${scene.id}/thumbnail.jpg`,
          thumbnailBuffer,
          'image/jpeg'
        )
        // Also save it locally
        if (!fs.existsSync(path.dirname(thumbnailJpg))) {
          fs.mkdirSync(path.dirname(thumbnailJpg), { recursive: true })
        }
        fs.writeFileSync(thumbnailJpg, thumbnailBuffer)
      } catch (error) {
        console.error(`[VideoWorker] Failed to generate thumbnail for scene ${scene.id}:`, error)
        // Fallback to existing thumbnail if generation fails
        if (fs.existsSync(thumbnailJpg)) {
          const fallbackBuffer = fs.readFileSync(thumbnailJpg)
          scene.thumbnailUrl = await uploadBuffer(
            `videos/${videoId}/scenes/${scene.id}/thumbnail.jpg`,
            fallbackBuffer,
            'image/jpeg'
          )
        }
      }
    } else if (fs.existsSync(thumbnailJpg)) {
      const buffer = fs.readFileSync(thumbnailJpg)
      scene.thumbnailUrl = await uploadBuffer(
        `videos/${videoId}/scenes/${scene.id}/thumbnail.jpg`,
        buffer,
        'image/jpeg'
      )
    }
  }
}

/**
 * Process a single video generation job.
 */
async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { videoId, userId, topic, options } = job.data
  // Hoist pkg here so the finally block can check if the job succeeded
  let pkg: CompleteVideoPackage | null = null

  try {
    // Initialize checkpoint for resumption
    let checkpoint = await initializeCheckpoint(videoId, job.id || 'unknown')

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

    // Build generation options from job data
    // Pull persisted customization options from the stored video record
    const storedOptions = (videoRecord.options as any) || {}

    const genOptions: Record<string, any> = {
      maxDuration: options.duration || DEFAULT_VIDEO_DURATION,
      sceneCount: options.sceneCount || 6,
      videoType: options.videoType,
      videoGenre: options.videoGenre,
      language: options.language || 'en',
      llmProvider: options.llmProvider || storedOptions.llmProvider || 'gemini',
      imageProvider: options.imageProvider || storedOptions.imageProvider || 'gemini',
      audioProvider: options.voiceProvider || storedOptions.audioProvider || 'kokoro',
      qualityMode: options.qualityMode || storedOptions.qualityMode || 'standard',
      characterConsistency: options.characterConsistency !== false,
      autoTransitions: options.autoTransitions !== false,
      skipAudio: options.skipAudio || false,
      generateOnlyScenes: options.generateOnlyScenes || false,
      generateOnlyAssembly: options.generateOnlyAssembly || false,
      generateFromScript: options.generateFromScript || false,
      repromptSceneIndex: options.repromptSceneIndex,
      customSpec: options.customSpec,
      characterModelId: options.characterModelId,
      userId,
      // Carry persisted customization options: voiceover, music, captions
      kokoroVoicePreset: options.kokoroVoicePreset || storedOptions.kokoroVoicePreset,
      backgroundMusic: options.backgroundMusic || storedOptions.backgroundMusic,
      assCaptions: options.assCaptions || storedOptions.assCaptions,
      scriptOnly: options.scriptOnly || false,

      // Missing options mapping
      animationMode: options.animationMode || storedOptions.animationMode || 'static',
      aspectRatio: options.aspectRatio || storedOptions.aspectRatio || '16:9',
      resolution: options.resolution || storedOptions.resolution || '720p',
      promptSections: options.promptSections || storedOptions.promptSections,
      narrationVolume: options.narrationVolume ?? storedOptions.narrationVolume,
      backgroundMusicVolume: options.backgroundMusicVolume ?? storedOptions.backgroundMusicVolume,
      audioOverlap: options.audioOverlap ?? storedOptions.audioOverlap,
      backgroundColor: options.backgroundColor || storedOptions.backgroundColor
    }

    if (options.voiceId && !genOptions.kokoroVoicePreset) {
      genOptions.kokoroVoicePreset = options.voiceId
    }

    // CHECKPOINT: Script Generation Phase
    if (options.generateFromScript && videoRecord.script) {
      if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)) {
        await videoRepository.updateStatus(videoId, {
          status: 'processing',
          progress: 10,
          currentStep: options.generateOnlyAudio ? 'narration_generation' : 'rendering'
        })

        const stepLabel = options.generateOnlyAudio ? 'Generating narration...' : 'Rendering video...'
        await reportProgress(
          job,
          videoId,
          options.generateOnlyAudio ? 'narration' : 'rendering',
          15,
          stepLabel,
          checkpoint
        )

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
          projectId: effectiveProjectId,
          onProgress: async (p, m) => {
            // Engine gives [0, 100], we map to [15, 85]
            const mappedProgress = 15 + (p / 100) * 70
            await reportProgress(job, videoId, 'rendering', Math.round(mappedProgress), m)
          }
        })

        // Persist synced script to DB immediately
        if (pkg.script) {
          await videoRepository.updateStatus(videoId, {
            script: pkg.script as any,
            scenes: pkg.script.scenes as any
          })
        }

        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)
        checkpointStorage.save(checkpoint)
      } else if (checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)) {
        console.info(`[VideoWorker] Skipping script generation (already completed) for videoId: ${videoId}`)
        pkg = await videoGenerationService.renderVideoFromScript({
          topic: videoRecord.topic,
          userId,
          script: videoRecord.script as any,
          options: {
            ...genOptions,
            generateOnlyAudio: options.generateOnlyAudio,
            generateOnlyAssembly: options.generateOnlyAssembly
          },
          projectId: effectiveProjectId,
          onProgress: async (p, m) => {
            // Engine gives [0, 100], we map to [15, 85]
            const mappedProgress = 15 + (p / 100) * 70
            await reportProgress(job, videoId, 'rendering', Math.round(mappedProgress), m)
          }
        })
      }
    } else if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)) {
      await videoRepository.updateStatus(videoId, {
        status: 'processing',
        progress: 5,
        currentStep: 'script_generation'
      })
      await reportProgress(job, videoId, 'script_generation', 10, 'Generating script...', checkpoint)

      await reportProgress(
        job,
        videoId,
        'script_generation',
        25,
        'Script generated, starting asset generation...',
        checkpoint
      )

      // Run the full generation pipeline
      pkg = await videoGenerationService.generateVideo({
        topic,
        userId,
        options: genOptions,
        projectId: effectiveProjectId,
        onProgress: async (p, m) => {
          // Script generation is [0, 15] in engine usually, then scenes.
          // Since we already reported 25% for starting asset generation, let's map [0,100] -> [25, 85]
          const mappedProgress = 25 + (p / 100) * 60
          await reportProgress(job, videoId, 'asset_generation', Math.round(mappedProgress), m)
        }
      })

      // Persist script to DB
      if (pkg.script) {
        // NEW: Ensure scene images are also uploaded in full generation flow!
        if (pkg.script.scenes && pkg.script.scenes.length > 0) {
          await uploadSceneImages(videoId, pkg.script.scenes, pkg.outputPath)
        }

        await videoRepository.updateStatus(videoId, {
          script: pkg.script as any,
          scenes: pkg.script.scenes as any
        })
      }

      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)
      await checkpointStorage.save(checkpoint)

      // Handle Script-Only Mode (Stop here)
      if (genOptions.scriptOnly) {
        await reportProgress(job, videoId, 'script_generation', 100, 'Script generation complete.', checkpoint)
        await videoRepository.updateStatus(videoId, {
          status: 'draft',
          progress: 100,
          currentStep: 'done'
        })

        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
        await checkpointStorage.save(checkpoint)

        await job.updateProgress({
          step: 'completed',
          progress: 100,
          status: 'completed',
          videoId
        })
        console.info(`[VideoWorker] Script-only generation complete for videoId: ${videoId}`)
        return
      }
    } else {
      console.info(`[VideoWorker] Skipping script generation (already completed) for videoId: ${videoId}`)
      // Use stored script if available
      if (videoRecord.script) {
        pkg = {
          script: videoRecord.script,
          outputPath: path.join(process.cwd(), 'output', effectiveProjectId)
        } as any

        // Calculate resume point from existing scene files
        if (pkg && pkg.script && pkg.script.scenes && pkg.script.scenes.length > 0) {
          const scenesDir = path.join(pkg.outputPath, 'scenes')
          const resumeFromSceneIndex = findLastCompletedSceneIndex(scenesDir, pkg.script)
          if (resumeFromSceneIndex !== undefined && resumeFromSceneIndex > 0) {
            console.info(
              `[VideoWorker] Scene generation checkpoint: resuming from scene index ${resumeFromSceneIndex} (${pkg.script.scenes.length - resumeFromSceneIndex} scenes remaining)`
            )
            genOptions.resumeFromSceneIndex = resumeFromSceneIndex
          }
        }
      }
    }

    // Ensure pkg is initialized before proceeding
    if (!pkg) {
      throw new Error(`[VideoWorker] Video package failed to initialize for videoId: ${videoId}`)
    }

    // CHECKPOINT: Asset Generation Phase
    if (
      options.generateOnlyAudio &&
      !checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.NARRATION_GENERATION)
    ) {
      await reportProgress(job, videoId, 'upload_audio', 90, 'Uploading narration and transcription...', checkpoint)

      // Use robust path resolution for narration
      const narrationMp3 = fs.existsSync(path.join(pkg.outputPath, 'global_narration.mp3'))
        ? path.join(pkg.outputPath, 'global_narration.mp3')
        : path.join(pkg.outputPath, 'narration.mp3')

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

      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.NARRATION_GENERATION)
      checkpointStorage.save(checkpoint)

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

      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      checkpointStorage.save(checkpoint)

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

    if (options.generateOnlyScenes && !checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.ASSET_GENERATION)) {
      await reportProgress(
        job,
        videoId,
        'upload_scenes',
        90,
        'Uploading scene images and updating database...',
        checkpoint
      )

      const updatedScenes = [...(pkg.script?.scenes || [])]
      await uploadSceneImages(videoId, updatedScenes, pkg.outputPath)

      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.ASSET_GENERATION)
      checkpointStorage.save(checkpoint)

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

      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      checkpointStorage.save(checkpoint)

      await job.updateProgress({
        step: 'completed',
        progress: 100,
        status: 'completed',
        videoId
      })

      console.info(`[VideoWorker] Scene generation completed for videoId: ${videoId}`)
      return
    }

    if (options.repromptSceneIndex !== undefined) {
      const idx = options.repromptSceneIndex
      if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.ASSET_GENERATION)) {
        await reportProgress(
          job,
          videoId,
          'upload_scene_image',
          90,
          `Uploading reprompted image for scene ${idx}...`,
          checkpoint
        )

        const updatedScenes = [...(pkg.script?.scenes || [])]
        await uploadSceneImages(videoId, updatedScenes, pkg.outputPath)

        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.ASSET_GENERATION)
        checkpointStorage.save(checkpoint)

        await videoRepository.updateStatus(videoId, {
          status: 'scenes_generated',
          progress: 100,
          currentStep: 'done',
          script: pkg.script as any,
          scenes: updatedScenes as any,
          completedAt: new Date()
        })

        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
        await checkpointStorage.save(checkpoint)

        await job.updateProgress({
          step: 'completed',
          progress: 100,
          status: 'completed',
          videoId
        })

        console.info(`[VideoWorker] Scene reprompt completed for videoId: ${videoId}, sceneIndex: ${idx}`)
        return
      }
    }

    // CHECKPOINT: Upload Phase
    if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.UPLOAD)) {
      await reportProgress(job, videoId, 'upload', 85, 'Uploading video to storage...', checkpoint)

      // Look for the final video in the output directory
      const outputPath = pkg.outputPath
      const finalMp4 = path.join(outputPath, 'final_video.mp4')
      const assembledMp4 = path.join(outputPath, 'assembled_video.mp4')
      const thumbnailJpg = path.join(outputPath, 'thumbnail.jpg')
      // Check both 'narration.mp3' (old) and 'global_narration.mp3' (new global audio pipeline)
      const narrationMp3 = fs.existsSync(path.join(outputPath, 'global_narration.mp3'))
        ? path.join(outputPath, 'global_narration.mp3')
        : path.join(outputPath, 'narration.mp3')

      // Check both 'captions.ass' (old) and 'global_subtitles.ass' (new)
      const captionsAss = fs.existsSync(path.join(outputPath, 'global_subtitles.ass'))
        ? path.join(outputPath, 'global_subtitles.ass')
        : path.join(outputPath, 'captions.ass')

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

      // Only update videoUrl if it was actually generated (avoid overwriting a previously uploaded URL)
      const updatePayload: Record<string, any> = {
        status: 'completed',
        progress: 100,
        currentStep: 'done',
        duration,
        script: pkg.script as any,
        scenes: pkg.script?.scenes as any,
        completedAt: new Date(),
        options: {
          ...((videoRecord.options as any) || {}),
          localProjectId: pkg.projectId
        }
      }

      if (videoUrl) updatePayload.videoUrl = videoUrl
      if (thumbnailUrl) updatePayload.thumbnailUrl = thumbnailUrl
      if (narrationUrl) updatePayload.narrationUrl = narrationUrl
      if (captionsUrl) updatePayload.captionsUrl = captionsUrl

      await videoRepository.updateStatus(videoId, updatePayload)

      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.UPLOAD)
      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      checkpointStorage.save(checkpoint)

      await job.updateProgress({
        step: 'completed',
        progress: 100,
        status: 'completed',
        videoId,
        videoUrl,
        thumbnailUrl,
        duration
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video generation failed'
    console.error(`[VideoWorker] Job failed for videoId: ${videoId}:`, message)

    await videoRepository.updateStatus(videoId, {
      status: 'failed',
      errorMessage: message
    })
    throw error // Let BullMQ handle retries
  } finally {
    // Fix 5: Cleanup temp project directory to avoid disk leaks on final failure
    const jobAttempts = job.opts.attempts || 1
    const isLastAttempt = job.attemptsMade >= jobAttempts
    if (isLastAttempt && pkg === null) {
      // pkg is null means the job failed to produce output — safe to clean up
      try {
        const engineOutputDir = path.join(process.cwd(), 'plugins', 'sketch-pilot', 'output', videoId)
        if (fs.existsSync(engineOutputDir)) {
          fs.rmSync(engineOutputDir, { recursive: true, force: true })
          console.info(`[VideoWorker] Cleaned temp directory: ${engineOutputDir}`)
        }
      } catch (error) {
        console.warn(`[VideoWorker] Failed to clean temp dir for ${videoId}:`, error)
      }
    }
    // Reset per-job debounce counter
    lastPersistedProgress = 0
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
      concurrency: Number.parseInt(process.env.VIDEO_WORKER_CONCURRENCY || '2', 10),
      lockDuration: 10 * 60 * 1000, // 10 minutes (video generation can be lengthy)
      stalledInterval: 30 * 1000, // Check stalled status every 30 seconds
      maxStalledCount: 5, // Allow up to 5 stall checks before failing
      metrics: {
        maxDataPoints: MetricsTime.ONE_WEEK // Add monitoring metrics
      }
    }
  )

  worker.on('completed', (job) => {
    console.info(`[VideoWorker] Job ${job.id} completed — videoId: ${job.data.videoId}`)
  })

  worker.on('failed', async (job, err) => {
    console.error(`[VideoWorker] Job ${job?.id} failed — videoId: ${job?.data?.videoId}:`, err.message)

    // DLQ Policy: if job failed and reached max attempts, move to Dead Letter Queue
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      console.warn(`[VideoWorker] Job ${job.id} exhausted retries. Moving to Dead Letter Queue.`)
      try {
        const dlqName = `${VIDEO_QUEUE_NAME}-dlq`
        const dlq = new Queue(dlqName, { connection: redisConnectionOptions })
        await dlq.add(job.name, job.data, {
          jobId: job.id, // maintain original job ID for tracing
          removeOnComplete: true, // avoid cluttering DLQ
          removeOnFail: false // keep failed DLQ jobs indefinitely
        })
        console.info(`[VideoWorker] Job ${job.id} successfully moved to ${dlqName}.`)
      } catch (error) {
        console.error(`[VideoWorker] Failed to move Job ${job.id} to DLQ:`, error)
      }
    }
  })

  worker.on('error', (err) => {
    console.error('[VideoWorker] Worker error:', err)
  })

  console.info('[VideoWorker] Video generation worker started')
  return worker
}
