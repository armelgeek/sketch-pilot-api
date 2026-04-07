import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { DelayedError, Worker, type Job } from 'bullmq'
import { checkpointStorage } from '@/application/services/checkpoint-storage.service'
import { CHECKPOINT_PHASES, checkpointService } from '@/application/services/video-checkpoint.service'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { redisClient, type VideoJobData } from '@/infrastructure/config/queue.config'
import { uploadBuffer, uploadFile, uploadVideoToMinio } from '@/infrastructure/config/storage.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { CompleteVideoPackage } from '@/domain/types/video-script.types'

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
const OUTPUT_DIR = path.join(process.cwd(), 'uploads', 'output')

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
 * Helper to map local phase progress (0-100) to global video lifecycle progress (0-100).
 */
function getGlobalProgress(localProgress: number, options: any): number {
  const p = Math.max(0, Math.min(100, localProgress))

  // Phase 1: Script & Scenes (0-70%)
  if (options.generateOnlyScenes || !options.generateFromScript) {
    return Math.round((p / 100) * 70)
  }

  // Phase 2: Assembly/Rendering (70-100%)
  if (options.generateOnlyAssembly) {
    return Math.round(70 + (p / 100) * 30)
  }

  // All-in-one or legacy
  return p
}

/**
 * Upload scene images and thumbnails to MinIO.
 * This is crucial for UI to display scenes before assembly.
 * Returns the updated scenes array with imageUrl and thumbnailUrl set.
 */
async function uploadSceneImages(videoId: string, scenes: any[], outputPath: string): Promise<any[]> {
  const scenesDir = path.join(outputPath, 'scenes')
  console.info(`[VideoWorker] Checking for scene images to upload in: ${scenesDir}`)
  if (!fs.existsSync(scenesDir)) {
    console.warn(`[VideoWorker] Scenes directory not found: ${scenesDir}`)
    return scenes
  }

  let uploadCount = 0
  for (const scene of scenes) {
    const sceneDir = path.join(scenesDir, scene.id)
    if (!fs.existsSync(sceneDir)) {
      console.info(`[VideoWorker] Scene directory not found: ${sceneDir}, skipping upload for ${scene.id}`)
      continue
    }

    const sceneWebp = path.join(sceneDir, 'scene.webp')
    if (fs.existsSync(sceneWebp)) {
      try {
        console.info(`[VideoWorker] Uploading scene image: ${scene.id}`)
        const buffer = await fsPromises.readFile(sceneWebp)
        const url = await uploadBuffer(`videos/${videoId}/scenes/${scene.id}/scene.webp`, buffer, 'image/webp')
        scene.imageUrl = `${url}?v=${Date.now()}`
        console.info(`[VideoWorker] ✓ Scene image uploaded for ${scene.id}: ${scene.imageUrl}`)
        uploadCount++
      } catch (error) {
        console.error(`[VideoWorker] Failed to upload scene image ${scene.id}:`, error)
      }
    } else {
      console.warn(`[VideoWorker] Scene image file not found: ${sceneWebp}`)
    }

    const thumbnailJpg = path.join(sceneDir, 'thumbnail.jpg')
    if (fs.existsSync(thumbnailJpg)) {
      try {
        console.info(`[VideoWorker] Uploading scene thumbnail: ${scene.id}`)
        const buffer = await fsPromises.readFile(thumbnailJpg)
        const url = await uploadBuffer(`videos/${videoId}/scenes/${scene.id}/thumbnail.jpg`, buffer, 'image/jpeg')
        scene.thumbnailUrl = `${url}?v=${Date.now()}`
        console.info(`[VideoWorker] ✓ Scene thumbnail uploaded for ${scene.id}: ${scene.thumbnailUrl}`)
        uploadCount++
      } catch (error) {
        console.error(`[VideoWorker] Failed to upload scene thumbnail ${scene.id}:`, error)
      }
    } else {
      console.warn(`[VideoWorker] Scene thumbnail file not found: ${thumbnailJpg}`)
    }
  }
  console.info(`[VideoWorker] uploadSceneImages completed. Uploaded ${uploadCount} files for video ${videoId}`)
  return scenes
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

// Uses Redis instead of local memory to track active jobs
// and prevent concurrent processing across multiple workers.

/**
 * Centralized handler for scene generation events.
 * 1. Uploads generated assets to MinIO.
 * 2. Updates the in-memory script with the new MinIO URLs.
 * 3. Persists the entire script and scenes to the database (JSONB-safe).
 * 4. Reports progress to BullMQ and the local map for SSE.
 */
async function handleSceneGenerated(
  job: Job<VideoJobData>,
  videoId: string,
  scene: any,
  script: any,
  index: number,
  progress: number,
  effectiveProjectId: string
) {
  console.info(`[VideoWorker] Scene ${index} generated. Processing assets for video ${videoId}...`)
  const absoluteOutputPath = path.join(OUTPUT_DIR, effectiveProjectId)

  try {
    // 1. Upload to MinIO and get updated scene object with imageUrl
    const [updatedScene] = await uploadSceneImages(videoId, [scene], absoluteOutputPath)

    // 2. Synchronize the SHARED script object in memory
    const sceneIdx = script.scenes.findIndex((s: any) => s.id === scene.id)
    if (sceneIdx !== -1) {
      script.scenes[sceneIdx] = updatedScene
    }

    // 3. Prepare payload for DB
    // Deep clone to ensure Drizzle/Postgres detects JSONB collection changes
    const scenesToSave = JSON.parse(JSON.stringify(script.scenes))
    const scriptToSave = JSON.parse(JSON.stringify(script))

    const updatePayload: any = {
      script: scriptToSave,
      scenes: scenesToSave
    }

    // If it's the first scene, use it as the video-level thumbnail
    if (index === 1 && scene.thumbnailUrl) {
      updatePayload.thumbnailUrl = scene.thumbnailUrl
      console.info(`[VideoWorker] Initial video thumbnail set for ${videoId}`)
    }

    // 4. Report progress first (important for SSE visibility)
    const globalProgress = getGlobalProgress(progress, job.data.options)
    await reportProgress(job, videoId, 'composing_scene', globalProgress, `Scene ${index} generated`, {
      currentSceneIndex: index - 1,
      scene: updatedScene
    })

    // 5. Update DB
    await videoRepository.updateStatus(videoId, updatePayload)
    console.info(`[VideoWorker] Scene ${index} persisted successfully.`)
  } catch (error: any) {
    console.error(`[VideoWorker] Error in handleSceneGenerated for scene ${index}:`, error)
  }
}

/**
 * Deduct credits from user account upon successful task completion.
 */
async function deductCredits(userId: string, videoId: string, cost?: number, planLimit?: number, jobId?: string) {
  if (!cost || cost <= 0) return

  try {
    const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, cost, planLimit || 0)
    await creditsRepository.addTransaction({
      userId,
      type: 'consumption_video',
      amount: -cost,
      videoId,
      metadata: {
        planConsumed,
        extraConsumed,
        jobId
      }
    })
    console.info(`[VideoWorker] Successfully deducted ${cost} credits for video ${videoId}`)
  } catch (error) {
    console.error(`[VideoWorker] FAILED to deduct credits on success for video ${videoId}:`, error)
  }
}

/**
 * Process a single video generation job.
 */
async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { videoId, userId, topic, options } = job.data

  const lockKey = `active-video-job:${videoId}`

  // Defer if another job is already processing this videoId
  const existingJobId = await redisClient.get(lockKey)
  if (existingJobId && existingJobId !== job.id) {
    console.warn(`[VideoWorker] Job ${job.id} deferred — videoId ${videoId} already processing in job ${existingJobId}`)
    await job.moveToDelayed(Date.now() + 15_000, job.token)
    throw new DelayedError()
  }

  if (job.id) {
    // Set lock valid for 2 hours just in case worker crashes
    await redisClient.set(lockKey, job.id, 'EX', 2 * 3600)
  }

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
      duration: options.duration || storedOptions.duration || DEFAULT_VIDEO_DURATION,
      sceneCount: options.sceneCount || storedOptions.sceneCount || 6,
      language: options.language || storedOptions.language || 'en',
      llmProvider: options.llmProvider || storedOptions.llmProvider || 'gemini',
      imageProvider: options.imageProvider || storedOptions.imageProvider || 'gemini',
      audioProvider: options.voiceProvider || storedOptions.audioProvider || 'elevenlabs',
      qualityMode: options.qualityMode || storedOptions.qualityMode || 'standard',
      kokoroVoicePreset: options.kokoroVoicePreset || storedOptions.kokoroVoicePreset || options.voiceId,
      localProjectId: effectiveProjectId,
      projectId: effectiveProjectId
    }

    // 3b. AUDIO-ONLY PATH — Lightweight initialization for audio/transcription step.
    // Sets generateOnlyAudio: true in genOptions, which tells NanoBanana to skip image generation.
    if (options.generateOnlyAudio) {
      if (!videoRecord.script) throw new Error('No script found for audio generation. Run storyboard first.')
      await reportProgress(job, videoId, 'audio_generation', 5, 'Initializing audio generation...')
      // `generateOnlyAudio: true` in genOptions instructs NanoBanana to skip all visual/scene generation
      genOptions.generateOnlyAudio = true
      genOptions.skipImageGeneration = true
      const audioResult = await videoGenerationService.renderVideoFromScript({
        videoId,
        topic,
        userId,
        script: videoRecord.script as any,
        options: genOptions,
        projectId: effectiveProjectId,
        onProgress: async (p: number, m: string, meta?: any) =>
          await reportProgress(job, videoId, 'audio_generation', Math.round(5 + (p / 100) * 90), m, meta),
        onTimingSync: async (syncedScript: any) => {
          console.info(`[VideoWorker] Audio timing sync complete. Updating DB...`)
          const scriptToSave = JSON.parse(JSON.stringify(syncedScript))
          await videoRepository.updateStatus(videoId, {
            script: scriptToSave,
            scenes: scriptToSave.scenes
          })
        },
        onSceneGenerated: undefined
      })
      pkg = {
        script: audioResult?.script ?? videoRecord.script,
        outputPath: path.join(OUTPUT_DIR, effectiveProjectId)
      } as any
    } else if (options.generateFromScript && videoRecord.script) {
      // Ensure effectiveProjectId is always persisted to DB so subsequent jobs can find it
      if (!effectiveProjectId) {
        effectiveProjectId = `video-${videoId}-${Date.now()}`
        await videoRepository.updateStatus(videoId, {
          options: { ...((videoRecord.options as any) || {}), localProjectId: effectiveProjectId }
        })
        console.info(`[VideoWorker] Created new effectiveProjectId: ${effectiveProjectId}`)
      }
      const skipScript = checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)
      if (!skipScript) {
        await reportProgress(job, videoId, 'rendering', 70, 'Initializing video assembly...')
        pkg = await videoGenerationService.renderVideoFromScript({
          videoId,
          topic,
          userId,
          script: videoRecord.script as any,
          options: genOptions,
          projectId: effectiveProjectId,
          onProgress: async (p, m, meta) =>
            await reportProgress(job, videoId, 'rendering', Math.round(70 + (p / 100) * 25), m, meta),
          onTimingSync: async (syncedScript) => {
            console.info(`[VideoWorker] Transcription sync complete. Updating DB with accurate timings.`)
            const scriptToSave = JSON.parse(JSON.stringify(syncedScript))
            await videoRepository.updateStatus(videoId, {
              script: scriptToSave,
              scenes: scriptToSave.scenes
            })
          },
          onSceneGenerated: async (scene, script, index, progress) => {
            await handleSceneGenerated(job, videoId, scene, script, index, progress, effectiveProjectId)
          }
        })
        if (pkg.script && options.repromptSceneIndex === undefined) {
          const validScript = pkg.script as any
          let title = videoId
          if (validScript.titles && validScript.titles.length > 0) {
            title = validScript.titles[0]
          }
          await videoRepository.updateStatus(videoId, { script: validScript, scenes: validScript.scenes, title })
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
            await reportProgress(job, videoId, 'rendering', Math.round(70 + (p / 100) * 25), m, meta),
          onTimingSync: async (syncedScript) => {
            console.info(`[VideoWorker] Transcription sync complete. Updating DB with accurate timings.`)
            const scriptToSave = JSON.parse(JSON.stringify(syncedScript))
            await videoRepository.updateStatus(videoId, {
              script: scriptToSave,
              scenes: scriptToSave.scenes
            })
          },
          onSceneGenerated: async (scene, script, index, progress) => {
            await handleSceneGenerated(job, videoId, scene, script, index, progress, effectiveProjectId)
          }
        })
        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.ASSET_GENERATION)
        const serialized = checkpointStorage.save(checkpoint)
        await videoRepository.updateStatus(videoId, {
          options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
        })
      }
    } else if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)) {
      await reportProgress(job, videoId, 'script_generation', 5, 'Studio: Initializing pipeline...')
      pkg = await videoGenerationService.generateVideo({
        videoId,
        topic,
        userId,
        options: genOptions,
        projectId: effectiveProjectId,
        onProgress: async (p, m, meta) => {
          // p is 0-100 from NanoBananaEngine
          // Map to 0-95% to leave room for the upload phase
          await reportProgress(job, videoId, 'generation', Math.round((p / 100) * 95), m, meta)
        },
        onTimingSync: async (syncedScript) => {
          console.info(`[VideoWorker] Transcription sync complete. Updating DB with accurate timings.`)
          const scriptToSave = JSON.parse(JSON.stringify(syncedScript))
          await videoRepository.updateStatus(videoId, {
            script: scriptToSave,
            scenes: scriptToSave.scenes
          })
        },
        onSceneGenerated: async (scene, script, index, progress) => {
          await handleSceneGenerated(job, videoId, scene, script, index, progress, effectiveProjectId)
        }
      })
      if (pkg.script) {
        if (pkg.script.scenes) await uploadSceneImages(videoId, pkg.script.scenes, pkg.outputPath)

        const validScript = pkg.script as any
        let title = videoId
        if (validScript.titles && validScript.titles.length > 0) {
          title = validScript.titles[0]
        }
        await videoRepository.updateStatus(videoId, { script: validScript, scenes: validScript.scenes, title })
      }
      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.SCRIPT_GENERATION)
      const serialized = checkpointStorage.save(checkpoint)
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
      })

      if (genOptions.scriptOnly) {
        await videoRepository.updateStatus(videoId, { status: 'draft', progress: 15, currentStep: 'done' })
        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
        const serialized = checkpointStorage.save(checkpoint)
        await videoRepository.updateStatus(videoId, {
          options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
        })
        await job.updateProgress({ step: 'completed', progress: 15, status: 'completed', videoId })
        return
      }
    } else if (videoRecord.script) {
      pkg = { script: videoRecord.script, outputPath: path.join(OUTPUT_DIR, effectiveProjectId) } as any
      const scenesDir = path.join(pkg!.outputPath, 'scenes')
      genOptions.resumeFromSceneIndex = findLastCompletedSceneIndex(scenesDir, pkg!.script)
    }

    if (!pkg) throw new Error('Video package failed to initialize.')

    // 4. NARRATION PERSISTENCE (If only audio requested)
    if (options.generateOnlyAudio) {
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

      console.info(`[VideoWorker] Audio generation complete for ${videoId}. Setting status to narration_generated.`)
      await videoRepository.updateStatus(videoId, {
        status: 'narration_generated',
        progress: 100, // Narration only can hit 100 if it's the requested goal
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

      // DEDUCT CREDITS ON SUCCESS
      await deductCredits(userId, videoId, job.data.cost, job.data.planLimit, job.id)
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
        progress: 70, // Storyboard phase ends at 70%
        scenes: updatedScenes as any,
        script: pkg.script as any,
        completedAt: new Date()
      })
      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      const serialized = checkpointStorage.save(checkpoint)
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
      })
      await job.updateProgress({ step: 'completed', progress: 70, status: 'completed', videoId })

      // DEDUCT CREDITS ON SUCCESS
      await deductCredits(userId, videoId, job.data.cost, job.data.planLimit, job.id)
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
        progress: getGlobalProgress(100, options),
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
      await job.updateProgress({
        step: 'completed',
        progress: getGlobalProgress(100, options),
        status: 'completed',
        videoId
      })
      console.info(`[VideoWorker] Reprompt completed for video ${videoId}`)

      // DEDUCT CREDITS ON SUCCESS
      await deductCredits(userId, videoId, job.data.cost, job.data.planLimit, job.id)
      return
    }

    // 7. FINAL UPLOAD (Full Video)
    if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.UPLOAD)) {
      await reportProgress(job, videoId, 'upload', 96, 'Uploading final video to storage...')
      const finalMp4 = path.join(pkg.outputPath, 'final_video.mp4')
      const assembledMp4 = path.join(pkg.outputPath, 'assembled_video.mp4')
      const videoFilePath = fs.existsSync(finalMp4) ? finalMp4 : fs.existsSync(assembledMp4) ? assembledMp4 : null

      const videoUrl = videoFilePath ? await uploadVideoToMinio(videoId, videoFilePath) : undefined
      const thumbnailJpgRoot = path.join(pkg.outputPath, 'thumbnail.jpg')
      let thumbnailUrl = fs.existsSync(thumbnailJpgRoot)
        ? await uploadBuffer(`videos/${videoId}/thumbnail.jpg`, fs.readFileSync(thumbnailJpgRoot), 'image/jpeg')
        : undefined

      // Fallback: If no global thumbnail, pick the first scene's thumbnail
      if (!thumbnailUrl && pkg.script?.scenes?.length > 0) {
        const firstScene = pkg.script.scenes[0]
        if (firstScene.thumbnailUrl) {
          // Use existing scene thumbnail URL with cache buster
          thumbnailUrl = `${firstScene.thumbnailUrl.split('?')[0]}?v=${Date.now()}`
          console.info(`[VideoWorker] Fallback video thumbnail used from Scene 0 for ${videoId}`)
        }
      }

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

      // 8. FINAL SUCCESS: DEDUCT CREDITS (User's request: only on success)
      await deductCredits(userId, videoId, job.data.cost, job.data.planLimit, job.id)
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
        // Protect against premature cleanup if another job is still active for this videoId
        const currentLock = await redisClient.get(lockKey)
        const stillActive = currentLock && currentLock !== job.id

        if (stillActive) {
          console.warn(`[VideoWorker] Skipping cleanup — another job may still need ${pkg.outputPath}`)
        } else {
          fs.rmSync(pkg.outputPath, { recursive: true, force: true })
          console.info(`[VideoWorker] Cleanup successful project: ${pkg.outputPath}`)
        }
      } catch (error) {
        console.warn(`[VideoWorker] Cleanup failed:`, error)
      }
    } else {
      console.info(
        `[VideoWorker] Retaining temporary assets for ${videoId} to allow resumption (Status: ${finalVideoRecord?.status})`
      )
    }
    if (job.id) jobProgressMap.delete(job.id)
    if (job.id) {
      const lockOwner = await redisClient.get(lockKey)
      if (lockOwner === job.id) {
        await redisClient.del(lockKey)
      }
    }
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

  worker.on('failed', (job, err) => {
    console.error(`[VideoWorker] Job ${job?.id} FAILED:`, err.message)
    // NOTE: Credit refund logic removed here because credits are now only deducted ON SUCCESS.
  })

  console.info('[VideoWorker] Video generation worker started')
  return worker
}
