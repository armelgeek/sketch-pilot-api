import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Worker, type Job } from 'bullmq'
import { checkpointStorage } from '@/application/services/checkpoint-storage.service'
import { CHECKPOINT_PHASES, checkpointService } from '@/application/services/video-checkpoint.service'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { uploadBuffer, uploadFile, uploadVideoToMinio } from '@/infrastructure/config/storage.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { CompleteVideoPackage } from '@/domain/types/video-script.types'
import type { VideoJobData } from '@/infrastructure/config/queue.config'

/**
 * FIXED Video Generation Worker
 * ----------------------------
 * 1. Manages video generation lifecycle via jobs.
 * 2. Uses the NanoBananaEngine (via VideoGenerationService) to produce the video.
 * 3. Handles checkpoints to allow resumption of interrupted jobs.
 * 4. Persists the final video, narration, and captions to MinIO storage.
 * 5. Updates the database record with the final URLs and status.
 */

const videoGenerationService = new VideoGenerationService()
const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()

const VIDEO_QUEUE_NAME = 'video-generation'
const DEFAULT_VIDEO_DURATION = 60 // 1 minute default if not specified

// Use a simple global map to track progress for SSE reporting
const jobProgressMap = new Map<string, any>()

/**
 * Report job progress to both BullMQ and the local progress map.
 * Accumulates metadata to prevent BullMQ throttling from dropping critical scene objects.
 */
async function reportProgress(
  job: Job<VideoJobData>,
  videoId: string,
  step: string,
  progress: number,
  message: string,
  metadata?: Record<string, any>
) {
  const previousStatus = job.id ? jobProgressMap.get(job.id) || {} : {}
  const accumulatedMetadata = {
    ...previousStatus,
    ...metadata
  }

  // Clean up previous step internals so they don't override the mandatory ones
  delete accumulatedMetadata.step
  delete accumulatedMetadata.progress
  delete accumulatedMetadata.status
  delete accumulatedMetadata.videoId
  delete accumulatedMetadata.message

  const status = { step, progress, status: 'processing', videoId, message, ...accumulatedMetadata }

  if (job.id) {
    jobProgressMap.set(job.id, status)
  }
  await job.updateProgress(status)
}

/**
 * Upload scene images and thumbnails to MinIO.
 * This is crucial for UI to display scenes before assembly.
 */
async function uploadSceneImages(videoId: string, scenes: any[], outputPath: string) {
  const scenesDir = path.join(outputPath, 'scenes')
  console.info(`[VideoWorker] Checking for scene images to upload in: ${scenesDir}`)
  if (!fs.existsSync(scenesDir)) {
    console.warn(`[VideoWorker] Scenes directory not found: ${scenesDir}`)
    return
  }

  let uploadCount = 0
  for (const scene of scenes) {
    const sceneDir = path.join(scenesDir, scene.id)
    if (!fs.existsSync(sceneDir)) {
      // For reprompts, we expect only the target scene directory to exist
      continue
    }

    const sceneWebp = path.join(sceneDir, 'scene.webp')
    if (fs.existsSync(sceneWebp)) {
      try {
        console.info(`[VideoWorker] Uploading scene image: ${scene.id}`)
        const buffer = await fsPromises.readFile(sceneWebp)
        const url = await uploadBuffer(`videos/${videoId}/scenes/${scene.id}/scene.webp`, buffer, 'image/webp')
        // Add cache buster to force frontend refresh
        scene.imageUrl = `${url}?v=${Date.now()}`
        uploadCount++
      } catch (error) {
        console.error(`[VideoWorker] Failed to upload scene image ${scene.id}:`, error)
      }
    }

    const thumbnailJpg = path.join(sceneDir, 'thumbnail.jpg')
    if (fs.existsSync(thumbnailJpg)) {
      try {
        console.info(`[VideoWorker] Uploading scene thumbnail: ${scene.id}`)
        const buffer = await fsPromises.readFile(thumbnailJpg)
        const url = await uploadBuffer(`videos/${videoId}/scenes/${scene.id}/thumbnail.jpg`, buffer, 'image/jpeg')
        // Add cache buster to force frontend refresh
        scene.thumbnailUrl = `${url}?v=${Date.now()}`
        uploadCount++
      } catch (error) {
        console.error(`[VideoWorker] Failed to upload scene thumbnail ${scene.id}:`, error)
      }
    }
  }
  console.info(`[VideoWorker] uploadSceneImages completed. Uploaded ${uploadCount} files for video ${videoId}`)
}

/**
 * Initialize or resume a checkpoint for a specific video.
 */
async function initializeCheckpoint(videoId: string, jobId: string, dbCheckpoint?: any) {
  let checkpoint = await checkpointStorage.load(videoId, dbCheckpoint)
  if (!checkpoint) {
    checkpoint = checkpointService.initializeCheckpoint(videoId, jobId)
    const serialized = checkpointStorage.save(checkpoint)
    // Update DB with the initial checkpoint
    await videoRepository.updateStatus(videoId, {
      options: { ...(dbCheckpoint ? { _checkpoint: serialized } : {}), _checkpoint: serialized }
    })
  } else {
    // Resume from existing checkpoint
    console.info(
      `[VideoWorker] Resuming from checkpoint for video ${videoId} (Phase: ${checkpointService.getNextPhase(checkpoint)})`
    )
  }
  return checkpoint
}

/**
 * Simple helper to find the last completed scene in the local output directory.
 */
function findLastCompletedSceneIndex(scenesDir: string, script: any): number {
  if (!script?.scenes) return 0
  let lastIndex = 0
  for (let i = 0; i < script.scenes.length; i++) {
    const sceneWebp = path.join(scenesDir, script.scenes[i].id, 'scene.webp')
    if (fs.existsSync(sceneWebp)) {
      lastIndex = i + 1
    } else {
      break
    }
  }
  return lastIndex
}

/**
 * Process a single video generation job.
 */
async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { videoId, userId, topic, options } = job.data
  let pkg: CompleteVideoPackage | null = null
  let effectiveProjectId = ''

  try {
    // 2. Fetch video record
    const videoRecord = await videoRepository.findByIdAndUserId(videoId, userId)
    if (!videoRecord) throw new Error('Video not found.')

    // 1. Initialize checkpoint (passing DB checkpoint if exists)
    let checkpoint = await initializeCheckpoint(videoId, job.id || 'unknown', (videoRecord.options as any)?._checkpoint)

    effectiveProjectId = (videoRecord.options as any)?.localProjectId
    if (!effectiveProjectId) {
      effectiveProjectId = `video-${Date.now()}-${Math.random().toString(36).slice(7)}`
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), localProjectId: effectiveProjectId }
      })
    }

    const storedOptions = (videoRecord.options as any) || {}
    const genOptions: Record<string, any> = {
      ...options,
      maxDuration: options.duration || storedOptions.maxDuration || DEFAULT_VIDEO_DURATION,
      sceneCount: options.sceneCount || storedOptions.sceneCount || 6,
      language: options.language || storedOptions.language || 'en',
      llmProvider: options.llmProvider || storedOptions.llmProvider || 'gemini',
      imageProvider: options.imageProvider || storedOptions.imageProvider || 'gemini',
      audioProvider: options.voiceProvider || storedOptions.audioProvider || 'kokoro',
      qualityMode: options.qualityMode || storedOptions.qualityMode || 'standard',
      kokoroVoicePreset: options.kokoroVoicePreset || storedOptions.kokoroVoicePreset || options.voiceId,
      localProjectId: effectiveProjectId,
      projectId: effectiveProjectId
    }

    // 3. SCRIPT & RENDER PHASE
    if (options.generateFromScript && videoRecord.script) {
      const skipScript = checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)
      if (!skipScript) {
        await reportProgress(job, videoId, 'rendering', 15, 'Rendering video...')
        pkg = await videoGenerationService.renderVideoFromScript({
          videoId,
          topic,
          userId,
          script: videoRecord.script as any,
          options: genOptions,
          projectId: effectiveProjectId,
          onProgress: async (p, m, meta) =>
            await reportProgress(job, videoId, 'rendering', Math.round(15 + (p / 100) * 70), m, meta),
          onTimingSync: async (syncedScript) => {
            console.info(`[VideoWorker] Transcription sync complete. Updating DB with accurate timings.`)
            await videoRepository.updateStatus(videoId, {
              script: syncedScript as any,
              scenes: syncedScript.scenes as any
            })
          },
          onSceneGenerated: async (scene, script, index, progress) => {
            console.info(`[VideoWorker] Scene ${index} generated. Uploading and updating DB...`)
            await uploadSceneImages(videoId, [scene], effectiveProjectId)
            await reportProgress(job, videoId, 'composing_scene', Math.round(progress), `Scene ${index} generated`, {
              currentSceneIndex: index - 1, // Store 0-based index for frontend
              scene
            })
            await videoRepository.updateStatus(videoId, {
              script: script as any,
              scenes: script.scenes as any
            })
          }
        })
        if (pkg.script && options.repromptSceneIndex === undefined) {
          await videoRepository.updateStatus(videoId, { script: pkg.script as any, scenes: pkg.script.scenes as any })
        }
        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)
        const serialized = checkpointStorage.save(checkpoint)
        await videoRepository.updateStatus(videoId, {
          options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
        })
      } else {
        console.info(`[VideoWorker] Skipping script generation phase (already completed)`)
        pkg = await videoGenerationService.renderVideoFromScript({
          videoId,
          topic,
          userId,
          script: videoRecord.script as any,
          options: genOptions,
          projectId: effectiveProjectId,
          onProgress: async (p, m, meta) =>
            await reportProgress(job, videoId, 'rendering', Math.round(15 + (p / 100) * 70), m, meta),
          onTimingSync: async (syncedScript) => {
            console.info(`[VideoWorker] Transcription sync complete. Updating DB with accurate timings.`)
            await videoRepository.updateStatus(videoId, {
              script: syncedScript as any,
              scenes: syncedScript.scenes as any
            })
          },
          onSceneGenerated: async (scene, script, index, progress) => {
            console.info(`[VideoWorker] Scene ${index} generated. Uploading and updating DB...`)
            await uploadSceneImages(videoId, [scene], effectiveProjectId)
            await reportProgress(job, videoId, 'composing_scene', Math.round(progress), `Scene ${index} generated`, {
              currentSceneIndex: index - 1, // Store 0-based index for frontend
              scene
            })
            await videoRepository.updateStatus(videoId, {
              script: script as any,
              scenes: script.scenes as any
            })
          }
        })
      }
    } else if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)) {
      await reportProgress(job, videoId, 'script_generation', 10, 'Generating script...')
      pkg = await videoGenerationService.generateVideo({
        videoId,
        topic,
        userId,
        options: genOptions,
        projectId: effectiveProjectId,
        onProgress: async (p, m, meta) =>
          await reportProgress(job, videoId, 'asset_generation', Math.round(25 + (p / 100) * 60), m, meta),
        onTimingSync: async (syncedScript) => {
          console.info(`[VideoWorker] Transcription sync complete. Updating DB with accurate timings.`)
          await videoRepository.updateStatus(videoId, {
            script: syncedScript as any,
            scenes: syncedScript.scenes as any
          })
        },
        onSceneGenerated: async (scene, script, index, progress) => {
          console.info(`[VideoWorker] Scene ${index} generated. Uploading and updating DB...`)
          await uploadSceneImages(videoId, [scene], effectiveProjectId)
          await reportProgress(job, videoId, 'composing_scene', Math.round(progress), `Scene ${index} generated`, {
            currentSceneIndex: index - 1, // Store 0-based index for frontend
            scene
          })
          await videoRepository.updateStatus(videoId, {
            script: script as any,
            scenes: script.scenes as any
          })
        }
      })
      if (pkg.script) {
        if (pkg.script.scenes) await uploadSceneImages(videoId, pkg.script.scenes, pkg.outputPath)
        await videoRepository.updateStatus(videoId, { script: pkg.script as any, scenes: pkg.script.scenes as any })
      }
      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)
      const serialized = checkpointStorage.save(checkpoint)
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
      })

      if (genOptions.scriptOnly) {
        await videoRepository.updateStatus(videoId, { status: 'draft', progress: 100, currentStep: 'done' })
        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
        const serialized = checkpointStorage.save(checkpoint)
        await videoRepository.updateStatus(videoId, {
          options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
        })
        await job.updateProgress({ step: 'completed', progress: 100, status: 'completed', videoId })
        return
      }
    } else if (videoRecord.script) {
      pkg = { script: videoRecord.script, outputPath: path.join(process.cwd(), 'output', effectiveProjectId) } as any
      const scenesDir = path.join(pkg!.outputPath, 'scenes')
      genOptions.resumeFromSceneIndex = findLastCompletedSceneIndex(scenesDir, pkg!.script)
    }

    if (!pkg) throw new Error('Video package failed to initialize.')

    // 4. NARRATION PERSISTENCE (If only audio requested)
    if (
      options.generateOnlyAudio &&
      !checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.NARRATION_GENERATION)
    ) {
      await reportProgress(job, videoId, 'upload_audio', 90, 'Uploading audio results...')
      const narrationMp3 = fs.existsSync(path.join(pkg.outputPath, 'global_narration.mp3'))
        ? path.join(pkg.outputPath, 'global_narration.mp3')
        : path.join(pkg.outputPath, 'narration.mp3')
      const transcriptionJson = path.join(pkg.outputPath, 'transcription.json')

      const narrationUrl = fs.existsSync(narrationMp3)
        ? await uploadFile(videoId, narrationMp3, `videos/${videoId}/narration.mp3`, 'audio/mpeg')
        : undefined
      const captionsUrl = fs.existsSync(transcriptionJson)
        ? await uploadBuffer(
            `videos/${videoId}/transcription.json`,
            fs.readFileSync(transcriptionJson),
            'application/json'
          )
        : undefined

      await videoRepository.updateStatus(videoId, {
        status: 'narration_generated',
        progress: 100,
        narrationUrl,
        captionsUrl,
        completedAt: new Date()
      })
      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      const serialized = checkpointStorage.save(checkpoint)
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
      })
      await job.updateProgress({ step: 'completed', progress: 100, status: 'completed', videoId, narrationUrl })
      return
    }

    // 5. ASSET PERSISTENCE (If only scenes requested)
    if (options.generateOnlyScenes && !checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.ASSET_GENERATION)) {
      await reportProgress(job, videoId, 'upload_scenes', 90, 'Uploading scene visuals...')
      const updatedScenes = [...(pkg.script?.scenes || [])]
      await uploadSceneImages(videoId, updatedScenes, pkg.outputPath)

      // Sync script column too
      if (pkg.script) pkg.script.scenes = updatedScenes

      await videoRepository.updateStatus(videoId, {
        status: 'scenes_generated',
        progress: 100,
        scenes: updatedScenes as any,
        script: pkg.script as any,
        completedAt: new Date()
      })
      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      const serialized = checkpointStorage.save(checkpoint)
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
      })
      await job.updateProgress({ step: 'completed', progress: 100, status: 'completed', videoId })
      return
    }

    // 6. REPROMPT PERSISTENCE
    if (options.repromptSceneIndex !== undefined) {
      // Phase 28 : ALWAYS process reprompt completion, ignore previous asset checkpoints.
      await reportProgress(
        job,
        videoId,
        'upload_reprompt',
        90,
        `Uploading reprompted scene ${options.repromptSceneIndex}...`
      )

      const updatedScenes = [...(pkg.script?.scenes || [])]
      await uploadSceneImages(videoId, updatedScenes, pkg.outputPath)

      // Deep clone to ensure database update is triggered for JSONB columns
      const scenesToSave = JSON.parse(JSON.stringify(updatedScenes))
      const scriptToSave = pkg.script ? JSON.parse(JSON.stringify(pkg.script)) : null
      if (scriptToSave) {
        scriptToSave.scenes = scenesToSave
      }

      const updatePayload: any = {
        status: 'scenes_generated',
        progress: 100,
        currentStep: 'done',
        scenes: scenesToSave,
        script: scriptToSave,
        completedAt: new Date()
      }

      // If scene 0 was reprompted, update the video-level thumbnailUrl
      if (options.repromptSceneIndex === 0 && scenesToSave[0]?.thumbnailUrl) {
        // Main video thumbnail also needs cache busting
        updatePayload.thumbnailUrl = `${scenesToSave[0].thumbnailUrl.split('?')[0]}?v=${Date.now()}`
        console.info(`[VideoWorker] Video thumbnail updated for ${videoId} (Scene 0 reprompt)`)
      }

      await videoRepository.updateStatus(videoId, updatePayload)
      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      const serialized = checkpointStorage.save(checkpoint)
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
      })
      await job.updateProgress({ step: 'completed', progress: 100, status: 'completed', videoId })
      console.info(`[VideoWorker] Reprompt completed for video ${videoId}`)
      return
    }

    // 7. FINAL UPLOAD (Full Video)
    if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.UPLOAD)) {
      await reportProgress(job, videoId, 'upload', 85, 'Uploading final video to storage...')
      const finalMp4 = path.join(pkg.outputPath, 'final_video.mp4')
      const assembledMp4 = path.join(pkg.outputPath, 'assembled_video.mp4')
      const videoFilePath = fs.existsSync(finalMp4) ? finalMp4 : fs.existsSync(assembledMp4) ? assembledMp4 : null

      const videoUrl = videoFilePath ? await uploadVideoToMinio(videoId, videoFilePath) : undefined
      const thumbnailJpg = path.join(pkg.outputPath, 'thumbnail.jpg')
      const thumbnailUrl = fs.existsSync(thumbnailJpg)
        ? await uploadBuffer(`videos/${videoId}/thumbnail.jpg`, fs.readFileSync(thumbnailJpg), 'image/jpeg')
        : undefined

      const duration = Math.round(pkg.script?.totalDuration ?? DEFAULT_VIDEO_DURATION)
      await videoRepository.updateStatus(videoId, {
        status: 'completed',
        progress: 100,
        currentStep: 'done',
        videoUrl,
        thumbnailUrl,
        duration,
        script: pkg.script as any,
        scenes: pkg.script?.scenes as any,
        completedAt: new Date()
      })

      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      const serialized = checkpointStorage.save(checkpoint)
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
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
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Job failed'
    console.error(`[VideoWorker] Error during job ${job.id}:`, error)
    const isLast = job.attemptsMade >= (job.opts.attempts || 1)
    if (isLast) await videoRepository.updateStatus(videoId, { status: 'failed', errorMessage: msg })
    throw error
  } finally {
    // 8. Dynamic Cleanup Logic
    // ONLY cleanup if the job was successfully completed.
    // If it failed, keep the temporary assets for resumption.
    const finalVideoRecord = await videoRepository.findByIdAndUserId(videoId, userId).catch(() => null)
    const isCompleted = finalVideoRecord?.status === 'completed' || finalVideoRecord?.status === 'scenes_generated'

    if (isCompleted && pkg?.outputPath && fs.existsSync(pkg.outputPath)) {
      try {
        fs.rmSync(pkg.outputPath, { recursive: true, force: true })
        console.info(`[VideoWorker] Cleanup successful project: ${pkg.outputPath}`)
      } catch (error) {
        console.warn(`[VideoWorker] Cleanup failed:`, error)
      }
    } else {
      console.info(
        `[VideoWorker] Retaining temporary assets for ${videoId} to allow resumption (Status: ${finalVideoRecord?.status})`
      )
    }
    if (job.id) jobProgressMap.delete(job.id)
  }
}

/**
 * Start the video generation worker.
 */
export function startVideoGenerationWorker(): Worker<VideoJobData> {
  const worker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAME,
    async (job) => {
      console.info(`[VideoWorker] Processing job ${job.id} \u2014 videoId: ${job.data.videoId}`)
      await processVideoJob(job)
    },
    {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10)
      },
      concurrency: Number.parseInt(process.env.VIDEO_WORKER_CONCURRENCY || '4', 10),
      lockDuration: 20 * 60 * 1000 // Increased lock duration for long renders
    }
  )

  worker.on('failed', async (job, err) => {
    console.error(`[VideoWorker] Job ${job?.id} FAILED:`, err.message)

    if (job) {
      const { videoId, userId } = job.data
      const isFinalFailure = job.attemptsMade >= (job.opts.attempts || 1)

      if (isFinalFailure) {
        try {
          const video = await videoRepository.findByIdAndUserId(videoId, userId)
          if (video && video.creditsUsed && video.creditsUsed > 0) {
            console.info(`[VideoWorker] Final failure for ${videoId}. Refunding ${video.creditsUsed} credits.`)
            const opts = (video.options as any) || {}
            await creditsRepository.refundCredits(userId, video.creditsUsed, videoId, {
              planConsumed: opts.planConsumed || 0,
              extraConsumed: opts.extraConsumed || 0
            })
          }
        } catch (refundError) {
          console.error(`[VideoWorker] Failed to refund credits for ${videoId}:`, refundError)
        }
      }
    }
  })

  console.info('[VideoWorker] Video generation worker started')
  return worker
}
