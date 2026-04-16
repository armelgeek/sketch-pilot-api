import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { SeriesVideoGenerator } from '@sketch-pilot/core/generators/series-video-generator'
import { DelayedError, UnrecoverableError, Worker, type Job } from 'bullmq'
import { checkpointStorage } from '@/application/services/checkpoint-storage.service'
import { CHECKPOINT_PHASES, checkpointService } from '@/application/services/video-checkpoint.service'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { getVideoQueue, redisClient, type VideoJobData } from '@/infrastructure/config/queue.config'
import { uploadBuffer, uploadFile, uploadVideoToMinio } from '@/infrastructure/config/storage.config'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
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
const seriesRepository = new SeriesRepository()
const characterModelRepository = new CharacterModelRepository()

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

  // Automate credit disclosure
  const isSaga = !!job.data.options.seriesId
  const creditsMetadata = {
    totalCost: job.data.cost || 0,
    isSaga,
    includedBackgroundServices: isSaga
      ? ['visual_identity_fixation', 'scene_bridging', 'bible_sync']
      : ['scene_consistency']
  }

  const accumulatedMetadata = {
    ...previousStatus,
    ...metadata,
    credits: creditsMetadata
  }

  // Clean up previous step internals so they don't override the mandatory ones
  delete accumulatedMetadata.step
  delete accumulatedMetadata.progress
  delete accumulatedMetadata.status
  delete accumulatedMetadata.videoId
  delete accumulatedMetadata.message

  const status = {
    step,
    progress: progress === -1 ? previousStatus.progress || 0 : progress,
    status: 'processing',
    videoId,
    message,
    ...accumulatedMetadata
  }

  if (job.id) {
    jobProgressMap.set(job.id, status)
  }
  await job.updateProgress(status)
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
      console.warn(`[VideoWorker] Scene image file not found (.webp or .avif) in ${sceneDir}`)
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

    const narrationMp3 = path.join(sceneDir, 'narration.mp3')
    if (fs.existsSync(narrationMp3)) {
      try {
        console.info(`[VideoWorker] Uploading scene audio: ${scene.id}`)
        const buffer = await fsPromises.readFile(narrationMp3)
        const url = await uploadBuffer(`videos/${videoId}/scenes/${scene.id}/narration.mp3`, buffer, 'audio/mpeg')
        scene.audioUrl = `${url}?v=${Date.now()}`
        console.info(`[VideoWorker] ✓ Scene audio uploaded for ${scene.id}: ${scene.audioUrl}`)
        uploadCount++
      } catch (error) {
        console.error(`[VideoWorker] Failed to upload scene audio ${scene.id}:`, error)
      }
    }
  }
  console.info(`[VideoWorker] Cleanup of temporary files completed.`)
  console.info(`[VideoWorker] Uploaded ${uploadCount} files for video ${videoId}`)
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
    const sceneAvif = path.join(scenesDir, script.scenes[i].id, 'scene.avif')
    if (fs.existsSync(sceneWebp) || fs.existsSync(sceneAvif)) {
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

    // 4. Update DB FIRST (Crucial for visual sync if user navigates/reloads)
    // Part A: Relational Scenes Table (V70 Relational Refactor)
    await videoRepository.upsertScene(videoId, updatedScene)

    // Part B: Legacy JSONB safe sync
    await videoRepository.updateStatus(videoId, updatePayload)
    console.info(`[VideoWorker] Scene ${index} persisted successfully (relational + legacy).`)

    // 4b. REAL-TIME REGISTRY EVOLUTION (Location/Characters)
    // This allows subsequent scenes to pick up reference images immediately
    const seriesId = (job.data.options as any)?.seriesId
    if (seriesId) {
      console.info(`[VideoWorker] Checking for real-time promotion for series ${seriesId}...`)
      const currentContext = await seriesRepository.getSeriesContext(seriesId)
      if (currentContext) {
        let registryChanged = false
        const updatedRegistry = { ...(currentContext.characterRegistry || {}) }
        const updatedLocationRegistry = { ...(currentContext.locationRegistry || {}) }
        const updatedAssetRegistry = { ...(currentContext.assetRegistry || {}) }

        const modifiedCharacters: { key: string; data: any }[] = []
        const modifiedLocations: { key: string; data: any }[] = []

        // Promotion Characters
        const chars = scene.charactersInScene || []
        if (chars.length > 0 && updatedScene.thumbnailUrl) {
          for (const charName of chars) {
            const key = SeriesVideoGenerator.findKeyInRegistry(updatedRegistry, charName)
            const existing = key ? updatedRegistry[key] : undefined
            if (existing && (!existing.thumbnailUrl || existing.isNew)) {
              console.info(`[VideoWorker] ✨ Promoting scene image for character: ${charName} (Real-time)`)
              existing.thumbnailUrl = updatedScene.thumbnailUrl
              existing.referenceSceneId = updatedScene.id
              existing.referenceEpisode = currentContext.episodeNumber
              modifiedCharacters.push({ key: key!, data: existing })
              registryChanged = true
            }
          }
        }

        // Promotion Locations
        if (
          scene.locationId &&
          updatedScene.thumbnailUrl &&
          updatedLocationRegistry[scene.locationId] &&
          !updatedLocationRegistry[scene.locationId].thumbnailUrl
        ) {
          console.info(`[VideoWorker] ✨ Promoting scene image for location: ${scene.locationId} (Real-time)`)
          const loc = updatedLocationRegistry[scene.locationId]
          loc.thumbnailUrl = updatedScene.thumbnailUrl
          loc.referenceSceneId = updatedScene.id
          loc.referenceEpisode = currentContext.episodeNumber
          modifiedLocations.push({ key: scene.locationId, data: loc })
          registryChanged = true
        }

        // Promotion Assets
        if (updatedScene.thumbnailUrl) {
          for (const [assetName, assetData] of Object.entries(updatedAssetRegistry)) {
            const assetRef = assetData as any
            const inPrompt = (scene.summary || scene.imagePrompt || '').toLowerCase().includes(assetName.toLowerCase())
            if (!assetRef.thumbnailUrl && inPrompt) {
              console.info(`[VideoWorker] ✨ Promoting scene image for asset: ${assetName} (Real-time)`)
              assetRef.thumbnailUrl = updatedScene.thumbnailUrl
              assetRef.referenceSceneId = updatedScene.id
              assetRef.referenceEpisode = currentContext.episodeNumber
              registryChanged = true
            }
          }
        }

        // ATOMIC SYNC: Update each modified entity individually to avoid race conditions (V68 Fix)
        if (modifiedCharacters.length > 0 || modifiedLocations.length > 0) {
          console.info(
            `[VideoWorker] 🔄 Atomic Registry Sync for ${videoId}: ${modifiedCharacters.length} chars, ${modifiedLocations.length} locations.`
          )
          const updatePromises: Promise<any>[] = []

          for (const mod of modifiedCharacters) {
            updatePromises.push(seriesRepository.updateRegistryItem(seriesId, 'characterRegistry', mod.key, mod.data))
          }

          for (const mod of modifiedLocations) {
            updatePromises.push(seriesRepository.updateRegistryItem(seriesId, 'locationRegistry', mod.key, mod.data))
          }

          await Promise.all(updatePromises)
        }

        if (registryChanged) {
          await seriesRepository.updateAssetRegistry(seriesId, updatedAssetRegistry)
          console.info(`[VideoWorker] ✓ Registry updated in real-time for series ${seriesId}`)
        }
      }
    } else {
      // Standalone evolution
      const video = await videoRepository.findById(videoId)
      if (video) {
        let registryChanged = false
        const updatedRegistry = { ...(video.characterRegistry || {}) } as any
        const updatedLocationRegistry = { ...(video.locationRegistry || {}) } as any
        const updatedAssetRegistry = { ...(video.assetRegistry || {}) } as any

        const chars = scene.charactersInScene || []
        if (chars.length > 0 && updatedScene.thumbnailUrl) {
          for (const charName of chars) {
            const existing = SeriesVideoGenerator.findInRegistry<any>(updatedRegistry, charName) as any
            if (existing && !existing.thumbnailUrl) {
              existing.thumbnailUrl = updatedScene.thumbnailUrl
              registryChanged = true
            }
          }
        }
        if (
          scene.locationId &&
          updatedScene.thumbnailUrl &&
          updatedLocationRegistry[scene.locationId] &&
          !updatedLocationRegistry[scene.locationId].thumbnailUrl
        ) {
          updatedLocationRegistry[scene.locationId].thumbnailUrl = updatedScene.thumbnailUrl
          updatedLocationRegistry[scene.locationId].referenceSceneId = updatedScene.id
          registryChanged = true
        }

        // Evolution Assets
        if (updatedScene.thumbnailUrl) {
          for (const [assetName, assetData] of Object.entries(updatedAssetRegistry)) {
            const assetRef = assetData as any
            const inPrompt = (scene.summary || scene.imagePrompt || '').toLowerCase().includes(assetName.toLowerCase())
            if (!assetRef.thumbnailUrl && inPrompt) {
              assetRef.thumbnailUrl = updatedScene.thumbnailUrl
              assetRef.referenceSceneId = updatedScene.id
              registryChanged = true
            }
          }
        }

        if (registryChanged) {
          await videoRepository.update(videoId, {
            characterRegistry: updatedRegistry,
            locationRegistry: updatedLocationRegistry,
            assetRegistry: updatedAssetRegistry
          })
          console.info(`[VideoWorker] ✓ Local registry updated in real-time for video ${videoId}`)
        }
      }
    }

    // 5. Report progress second (triggers SSE so UI fetches the now-updated DB)
    const globalProgress = Math.max(0, Math.min(100, progress))
    await reportProgress(job, videoId, 'composing_scene', globalProgress, `step.composing_scene:${index}`, {
      currentSceneIndex: index - 1,
      scene: updatedScene
    })
  } catch (error: any) {
    console.error(`[VideoWorker] Error in handleSceneGenerated for scene ${index}:`, error)
  }
}

/**
 * Evolves the Saga "Bible" by persisting AI-generated metadata (cliffhangers, characters, summaries)
 * back to the Series record for the next episode.
 */
/**
 * Phase 1 of Saga Evolution: Syncs narrative and registry state immediately after script generation.
 */
async function syncNarrativeSagaContext(seriesId: string, videoId: string, script: any) {
  try {
    console.info(`[VideoWorker] [Pre-Sync] Syncing Narrative Saga context for series ${seriesId}...`)
    const currentContext = await seriesRepository.getSeriesContext(seriesId)
    if (!currentContext) {
      console.warn(`[VideoWorker] Series ${seriesId} not found, skipping narrative sync.`)
      return
    }

    const updatedContext = SeriesVideoGenerator.updateContext(currentContext as any, script)

    // 1. Propagate narrative state
    await seriesRepository.updateNarrativeContext(seriesId, {
      lastCliffhanger: updatedContext.lastCliffhanger,
      unresolvedThreads: updatedContext.unresolvedThreads
    })

    console.info('[................UPDATE................]', updatedContext)
    // 2. Update Series record with narrative evolutions (Registry/State only)
    await seriesRepository.update(seriesId, {
      characterRegistry: updatedContext.characterRegistry,
      locationRegistry: updatedContext.locationRegistry,
      assetRegistry: updatedContext.assetRegistry,
      visualEvolution: updatedContext.visualEvolution,
      relationshipMap: updatedContext.relationshipMap,
      assetEvolution: updatedContext.assetEvolution,
      lastCliffhanger: updatedContext.lastCliffhanger,
      weatherState: updatedContext.weatherState,
      timeOfDay: updatedContext.timeOfDay,
      unresolvedThreads: updatedContext.unresolvedThreads,
      threads: updatedContext.threads,
      roadmap: updatedContext.roadmap,
      globalContext: updatedContext.globalContext,
      previousEpisodesContext: updatedContext.previousEpisodesContext,
      lastEpisodeNumber: String(updatedContext.episodeNumber),
      narrationLayer: updatedContext.narrationLayer
    })

    // 2.5. Update Video Title based on intrigue (V43)
    const episodeTitle = script.titles?.[0] || script.metadata?.title
    if (episodeTitle) {
      console.info(`[VideoWorker] ✨ Updating video title to intrigue-based one: "${episodeTitle}"`)
      await videoRepository.update(videoId, { title: episodeTitle })
    }

    // 3. Update video record for UI consistency + History Snapshot
    await videoRepository.updateStatus(videoId, {
      characterRegistry: updatedContext.characterRegistry,
      locationRegistry: updatedContext.locationRegistry,
      assetRegistry: updatedContext.assetRegistry,
      previousEpisodesContext: updatedContext.previousEpisodesContext,
      globalContext: updatedContext.globalContext,
      lastCliffhanger: updatedContext.lastCliffhanger,
      narrationLayer: updatedContext.narrationLayer,
      continuityAnalysis: script.seriesMetadata?.continuityAnalysis
    })

    // 4. Save Narrative Audit (V20) - Early save
    saveNarrationAudit(seriesId, updatedContext.episodeNumber, script)

    console.info(`[VideoWorker] [Pre-Sync] Narrative saga context sync successful for ${seriesId}.`)
    return updatedContext
  } catch (error) {
    console.error(`[VideoWorker] [Pre-Sync] Narrative sync failed:`, error)
  }
}

/**
 * Phase 2 of Saga Evolution: Promotes generated images to portraits and saves final bridge.
 */
async function promoteVisualSagaContext(seriesId: string, videoId: string, script: any) {
  try {
    console.info(`[VideoWorker] [Final] Promoting Visual assets to Saga Bible for ${seriesId}...`)
    const currentContext = await seriesRepository.getSeriesContext(seriesId)
    if (!currentContext) return

    const updatedRegistry = { ...currentContext.characterRegistry }
    const updatedLocationRegistry = { ...currentContext.locationRegistry }
    const updatedAssetRegistry = { ...(currentContext.assetRegistry || {}) }

    // 🔄 SAGA BIBLE MERGE: Capture new entities discovered by the LLM
    const metadata = script.seriesMetadata || {}

    // 1. Merge New Characters
    if (metadata.newCharacters) {
      const newCharsEntries = Object.entries(metadata.newCharacters)
      if (newCharsEntries.length > 0) {
        console.info(`[VideoWorker] 🆕 Discovering ${newCharsEntries.length} new characters in script metadata...`)
        const standardModels = await characterModelRepository.findAllStandard()
        const baseModelId = (currentContext as any).characterModelId || standardModels[0]?.id || 'default-model'

        for (const [rawName, desc] of newCharsEntries) {
          // Strip @ for DB storage consistency
          const name = rawName.replace(/^@/, '')
          const existing = SeriesVideoGenerator.findInRegistry(updatedRegistry, name)
          if (!existing) {
            console.info(`[VideoWorker] 🆕 Registering and generating portrait for: ${name}`)

            let thumbnailUrl: string | undefined = undefined

            try {
              // Automatically generate a portrait for the newly discovered character
              const imagePath = await videoGenerationService.generateCharacterImage({
                prompt: desc as string,
                baseModelId,
                videoId
              })

              if (imagePath && fs.existsSync(imagePath)) {
                const buffer = await fsPromises.readFile(imagePath)
                const safeName = name.replaceAll(/\s+/g, '-').replaceAll(/[^\w-]/g, '')
                const storagePath = `series/${seriesId}/characters/${safeName}-${Date.now()}.webp`
                thumbnailUrl = await uploadBuffer(storagePath, buffer, 'image/webp')

                console.info(
                  `[VideoWorker] ✓ Automatic portrait generated for discovered character ${name}: ${thumbnailUrl}`
                )
                fs.unlinkSync(imagePath)
              }
            } catch (error) {
              console.error(`[VideoWorker] ❌ Failed to generate automatic portrait for ${name}:`, error)
            }

            updatedRegistry[name] = {
              description: desc as string,
              isNew: true,
              thumbnailUrl,
              discoveredInEpisode: currentContext.episodeNumber
            }
          }
        }
      }
    }

    // 2. Merge New Locations
    if (metadata.newLocations) {
      for (const [rawId, desc] of Object.entries(metadata.newLocations)) {
        const id = rawId.replace(/^@/, '')
        if (!updatedLocationRegistry[id]) {
          console.info(`[VideoWorker] 🆕 Registering new location discovered in saga: ${id}`)
          updatedLocationRegistry[id] = {
            description: desc as string,
            isNew: true,
            discoveredInEpisode: currentContext.episodeNumber
          }
        }
      }
    }

    // 3. Update Continuity (Descriptions evolution)
    if (metadata.characterContinuity) {
      for (const [rawName, data] of Object.entries(metadata.characterContinuity)) {
        const name = rawName.replace(/^@/, '')
        const registryItem = SeriesVideoGenerator.findInRegistry(updatedRegistry, name)
        if (registryItem && (data as any).description) {
          registryItem.description = (data as any).description
        }
      }
    }

    if (metadata.locationContinuity) {
      for (const [rawId, data] of Object.entries(metadata.locationContinuity)) {
        const id = rawId.replace(/^@/, '')
        if (updatedLocationRegistry[id] && (data as any).description) {
          updatedLocationRegistry[id].description = (data as any).description
        }
      }
    }

    const scenes = script.scenes || []
    let lastLocId = ''
    for (const scene of scenes) {
      // Character Portrait Promotion
      const chars = scene.charactersInScene || []
      if (chars.length > 0 && scene.thumbnailUrl) {
        for (const charName of chars) {
          const existing = SeriesVideoGenerator.findInRegistry(updatedRegistry, charName)
          if (existing && (!existing.thumbnailUrl || existing.isNew || !existing.referenceSceneId)) {
            console.info(`[VideoWorker] Promoting character portrait: ${charName}`)
            existing.thumbnailUrl = scene.thumbnailUrl
            existing.referenceSceneId = scene.id
            existing.referenceEpisode = currentContext.episodeNumber
            existing.isNew = false // Locked once promoted
          }
        }
      }

      // Location Portrait Promotion (Dynamic Change Tracking)
      const currentLocId = scene.locationId ? SeriesVideoGenerator.normalizeId(scene.locationId) : ''
      const isLocationChange = currentLocId && currentLocId !== lastLocId

      if (
        currentLocId &&
        scene.thumbnailUrl &&
        updatedLocationRegistry[currentLocId] &&
        (isLocationChange || !updatedLocationRegistry[currentLocId].thumbnailUrl)
      ) {
        console.info(
          `[VideoWorker] Promoting location portrait (${isLocationChange ? 'CHANGE' : 'FIRST'}): ${currentLocId}`
        )
        updatedLocationRegistry[currentLocId].thumbnailUrl = scene.thumbnailUrl
        updatedLocationRegistry[currentLocId].referenceSceneId = scene.id
        updatedLocationRegistry[currentLocId].referenceEpisode = currentContext.episodeNumber
      }
      lastLocId = currentLocId

      // Asset Promotion (Heuristic)
      if (scene.thumbnailUrl) {
        for (const [assetName, assetData] of Object.entries(updatedAssetRegistry)) {
          const assetRef = assetData as any
          const inPrompt = (scene.summary || scene.imagePrompt || '').toLowerCase().includes(assetName.toLowerCase())
          if ((!assetRef.thumbnailUrl || !assetRef.referenceSceneId) && inPrompt) {
            console.info(`[VideoWorker] Promoting asset portrait: ${assetName}`)
            assetRef.thumbnailUrl = scene.thumbnailUrl
            assetRef.referenceSceneId = scene.id
            assetRef.referenceEpisode = currentContext.episodeNumber
          }
        }
      }
    }

    // Capture final weather/time if they changed by the end (unlikely but safe)
    const lastScene = scenes.at(-1)

    // Save promoted registries
    await seriesRepository.update(seriesId, {
      characterRegistry: updatedRegistry,
      locationRegistry: updatedLocationRegistry,
      assetRegistry: updatedAssetRegistry,
      weatherState: lastScene?.weatherState !== 'None' ? lastScene?.weatherState : currentContext.weatherState,
      timeOfDay: lastScene?.timeOfDay || currentContext.timeOfDay
    })

    // Final bridge for next episode (Visual phase)
    if (scenes.length > 0) {
      const finalScene = scenes.at(-1)
      const finalImageUrl = finalScene.thumbnailUrl || finalScene.imageUrl || (finalScene as any).image

      if (finalImageUrl) {
        const finalBridge = {
          lastEpisodeFinalImage: finalImageUrl,
          lastEpisodeFinalScene: {
            summary: finalScene.summary,
            narration: finalScene.narration,
            imagePrompt: finalScene.imagePrompt,
            locationId: finalScene.locationId,
            persistentDecorTokens: finalScene.persistentDecorTokens,
            emotionalTokens: finalScene.emotionalTokens,
            interactions: finalScene.interactions,
            charactersInScene: finalScene.charactersInScene || []
          }
        }

        // 1. Snapshot into video (Source of Truth)
        await videoRepository.updateStatus(videoId, finalBridge)

        // 2. Update series record (Bible)
        await seriesRepository.updateFinalBridge(seriesId, finalBridge)
      }
    }

    console.info(`[VideoWorker] [Final] Visual promotion successful for series ${seriesId}.`)

    // Save audit if it hasn't been saved yet (as fallback, though syncNarrative handles it)
    const episodeNum = (currentContext.lastEpisodeNumber || 0) + 1
    saveNarrationAudit(seriesId, episodeNum, script)
  } catch (error) {
    console.error(`[VideoWorker] [Final] Visual promotion failed:`, error)
  }
}

/**
 * Saves a human-readable text file of the episode narration for auditing.
 */
export function saveNarrationAudit(seriesId: string, episodeNumber: number, script: any) {
  try {
    const dir = path.join(process.cwd(), 'storage', 'narrations', seriesId)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    let fullText = `EPISODE N°${episodeNumber}\n`
    fullText += `TITRE: ${script.metadata?.title || 'Sans titre'}\n`
    fullText += `SAGA ID: ${seriesId}\n`
    fullText += `GÉNÉRÉ LE: ${new Date().toLocaleString()}\n`
    fullText += `==================================================\n\n`

    const scenes = script.scenes || []
    for (const scene of scenes) {
      const sceneNum = scene.sceneNumber || scenes.indexOf(scene) + 1
      fullText += `SCÈNE ${sceneNum} [Lieu: ${scene.locationId || 'Inconnu'}]\n`
      fullText += `--------------------------------------------------\n`
      fullText += `${scene.narration}\n\n`
    }

    const filePath = path.join(dir, `episode_${episodeNumber}.txt`)
    fs.writeFileSync(filePath, fullText, 'utf8')
    console.info(`[VideoWorker] ✓ Narrative audit saved: ${filePath}`)
  } catch (error) {
    console.warn(`[VideoWorker] Failed to save narrative audit for series ${seriesId}:`, error)
  }
}

/**
          changed = true
        }
      }
    }

    if (changed) {
      await videoRepository.update(videoId, {
        characterRegistry: updatedRegistry,
        locationRegistry: updatedLocationRegistry,
        assetRegistry: updatedAssetRegistry
      })
      console.info(`[VideoWorker] ✓ Pre-composition registry sync successful for standalone ${videoId}`)
    }
  } catch (error) {
    console.error(`[VideoWorker] Pre-sync (Standalone) failed:`, error)
  }
}

/**
 * Evolves the local context for a standalone video (visual registries)
 */
async function evolveStandaloneContext(videoId: string, script: any) {
  try {
    console.info(`[VideoWorker] Evolving local context for video ${videoId}...`)
    const video = await videoRepository.findById(videoId)
    if (!video) return

    const metadata = script.videoMetadata || script.seriesMetadata || {}
    const updatedRegistry = { ...(video.characterRegistry || {}) }
    const updatedLocationRegistry = { ...(video.locationRegistry || {}) }
    const updatedAssetRegistry = { ...(video.assetRegistry || {}) }

    // 1. Discover new entries
    if (metadata.newCharacters) {
      for (const [name, desc] of Object.entries(metadata.newCharacters)) {
        if (!updatedRegistry[name]) updatedRegistry[name] = { description: desc as string }
      }
    }
    if (metadata.newLocations) {
      for (const [name, desc] of Object.entries(metadata.newLocations)) {
        if (!updatedLocationRegistry[name]) updatedLocationRegistry[name] = { description: desc as string }
      }
    }
    if (metadata.newAssets) {
      for (const [name, desc] of Object.entries(metadata.newAssets)) {
        if (!updatedAssetRegistry[name]) {
          updatedAssetRegistry[name] = { description: desc as string, type: 'other' }
        }
      }
    }

    // 2. Promote visual portraits from scenes
    console.info('[....................SCENES...............]', script)
    if (script.scenes) {
      for (const scene of script.scenes) {
        const chars = scene.charactersInScene || []
        if (chars.length > 0 && scene.thumbnailUrl) {
          for (const charName of chars) {
            if (updatedRegistry[charName] && !updatedRegistry[charName].thumbnailUrl) {
              updatedRegistry[charName].thumbnailUrl = scene.thumbnailUrl
              updatedRegistry[charName].referenceSceneId = scene.id
            }
          }
        }
        if (
          scene.locationId &&
          scene.thumbnailUrl &&
          updatedLocationRegistry[scene.locationId] &&
          !updatedLocationRegistry[scene.locationId].thumbnailUrl
        ) {
          updatedLocationRegistry[scene.locationId].thumbnailUrl = scene.thumbnailUrl
          updatedLocationRegistry[scene.locationId].referenceSceneId = scene.id
        }

        // Asset Promotion
        if (scene.thumbnailUrl) {
          for (const [assetName, assetData] of Object.entries(updatedAssetRegistry)) {
            const assetRef = assetData as any
            const inPrompt = (scene.summary || scene.imagePrompt || '').toLowerCase().includes(assetName.toLowerCase())
            if (!assetRef.thumbnailUrl && inPrompt) {
              assetRef.thumbnailUrl = scene.thumbnailUrl
              assetRef.referenceSceneId = scene.id
            }
          }
        }
      }
    }

    // 3. Persist
    await videoRepository.update(videoId, {
      characterRegistry: updatedRegistry,
      locationRegistry: updatedLocationRegistry,
      assetRegistry: updatedAssetRegistry
    })

    console.info(`[VideoWorker] Local context evolution successful for video ${videoId}.`)
  } catch (error) {
    console.error(`[VideoWorker] Local evolution failed for video ${videoId}:`, error)
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
  const masterAssetsCost = 0
  //console.info(`[ACTIVE VIDEO JOB]`, options)
  const lockKey = `active-video-job:${videoId}`
  const videoRecord = await videoRepository.findByIdAndUserId(videoId, userId).catch(() => null)
  // Defer if another job is already processing this videoId
  const existingJobId = await redisClient.get(lockKey)

  if (existingJobId && existingJobId !== job.id) {
    // 1. Check if the holding job is still physically in the BullMQ waiting/active states
    const holdingJob = await getVideoQueue().getJob(existingJobId)
    const state = holdingJob ? await holdingJob.getState() : 'unknown'
    const isBullMQStuck = !holdingJob || state === 'failed' || state === 'completed'

    // 2. STALE LOCK DETECTION (Cross-reference with Database)
    // If the holding jobId is NOT what the database thinks is current, it's stale (leftover from a previous crashed run or cancelled job)
    const isStaleLock = videoRecord && videoRecord.jobId !== existingJobId

    // 3. CANCELLATION SIGNAL DETECTION
    // If there's a cancel-video flag in Redis, the holding job is marked for death
    const wasMarkedForCancellation = await redisClient.get(`cancel-video-${videoId}`)

    if (!isBullMQStuck && !isStaleLock && !wasMarkedForCancellation) {
      console.warn(
        `[VideoWorker] Job ${job.id} deferred — videoId ${videoId} already processing in job ${existingJobId} (State: ${state})`
      )
      await job.moveToDelayed(Date.now() + 15_000, job.token)
      throw new DelayedError()
    }

    console.warn(
      `[VideoWorker] Reclaiming lock for videoId ${videoId} from job ${existingJobId} (Stale: ${!!isStaleLock}, Cancelled: ${!!wasMarkedForCancellation}, BullMQ Stuck: ${!!isBullMQStuck})`
    )
    await redisClient.del(lockKey)
  }

  if (job.id) {
    // Initialize or reclaim the lock
    await redisClient.set(lockKey, job.id, 'EX', 1800)
  }

  let pkg: CompleteVideoPackage | null = null
  let effectiveProjectId = ''

  try {
    if (!videoRecord) throw new Error('Video not found.')

    if (videoRecord.status === 'completed') {
      console.info(`[VideoWorker] Video ${videoId} is already completed. Skipping job ${job.id}.`)
      return
    }

    // 1. Initialize checkpoint (passing DB checkpoint if exists)
    let checkpoint = await initializeCheckpoint(videoId, job.id || 'unknown', (videoRecord.options as any)?._checkpoint)

    effectiveProjectId = (videoRecord.options as any)?.localProjectId
    if (!effectiveProjectId) {
      effectiveProjectId = `video-${Date.now()}-${Math.random().toString(36).slice(7)}`
    }

    const storedOptions = (videoRecord.options as any) || {}
    const genOptions: Record<string, any> = {
      ...options,
      duration: options.duration || storedOptions.duration || DEFAULT_VIDEO_DURATION,
      sceneCount: options.sceneCount || storedOptions.sceneCount || 6,
      language: options.language || storedOptions.language || 'en',
      llmProvider: options.llmProvider || storedOptions.llmProvider || 'gemini',
      imageProvider: 'gemini',
      //imageProvider: options.imageProvider || storedOptions.imageProvider || 'gemini',
      audioProvider: options.voiceProvider || storedOptions.audioProvider || 'elevenlabs',
      qualityMode: options.qualityMode || storedOptions.qualityMode || 'standard',
      kokoroVoicePreset: options.kokoroVoicePreset || storedOptions.kokoroVoicePreset || options.voiceId,
      localProjectId: effectiveProjectId,
      projectId: effectiveProjectId,
      seriesId: options.seriesId || storedOptions.seriesId || (videoRecord as any).seriesId,
      characterModelId:
        options.characterModelId ||
        storedOptions.characterModelId ||
        videoRecord.options?.characterModelId ||
        'gemini-2.5-flash'
    }

    // 3b. AUDIO-ONLY PATH — Lightweight initialization for audio/transcription step.
    // Sets generateOnlyAudio: true in genOptions, which tells NanoBanana to skip image generation.
    if (options.generateOnlyAudio) {
      if (!videoRecord.script) throw new Error('No script found for audio generation. Run storyboard first.')
      await reportProgress(job, videoId, 'audio_generation', 5, 'step.audio_init')
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
        await reportProgress(job, videoId, 'rendering', 70, 'step.assembly_init')
        pkg = await videoGenerationService.renderVideoFromScript({
          videoId,
          topic,
          userId,
          script: { ...((videoRecord.script as any) || {}), narrationUrl: videoRecord.narrationUrl },
          options: genOptions,
          projectId: effectiveProjectId,
          onProgress: async (p, m, meta) => await reportProgress(job, videoId, 'rendering', Math.round(p), m, meta),
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

        // EARLY EXIT: If only script is requested and we just loaded it from checkpoint/DB
        if (genOptions.scriptOnly) {
          console.info(`[VideoWorker] Script-only generation (resumed/skipped) completed for video ${videoId}`)
          await videoRepository.updateStatus(videoId, {
            status: 'script_generated',
            progress: 100,
            currentStep: 'done'
          })
          await reportProgress(job, videoId, 'script_generation', 100, 'step.script_ready')
          // DEDUCT CREDITS (Only script cost)
          await deductCredits(userId, videoId, job.data.cost, job.data.planLimit, job.id)
          return
        }
      } else {
        console.info(`[VideoWorker] Skipping script generation phase (already completed)`)
        pkg = await videoGenerationService.renderVideoFromScript({
          videoId,
          topic,
          userId,
          script: { ...((videoRecord.script as any) || {}), narrationUrl: videoRecord.narrationUrl },
          options: genOptions,
          projectId: effectiveProjectId,
          onProgress: async (p, m, meta) => await reportProgress(job, videoId, 'rendering', Math.round(p), m, meta),
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
      await reportProgress(job, videoId, 'script_generation', 5, 'step.pipeline_init')

      // Phase 1: Generate Script only
      const script = await videoGenerationService.generateScriptOnly({
        videoId,
        topic,
        userId,
        options: genOptions,
        onProgress: async (p, m) => await reportProgress(job, videoId, 'script_generation', p, m)
      })

      console.info('[...........SCRIPT............]', script)

      // Phase 2: PRE-SYNC (Project Sequel) - Lock in surging characters/locations before they are drawn
      await reportProgress(job, videoId, 'pre_sync', 0, 'step.analyzing_assets')
      const metadata = script.seriesMetadata || {}
      const seriesId = genOptions.seriesId || (videoRecord as any).seriesId
      if (seriesId) {
        await syncNarrativeSagaContext(seriesId, videoId, script)
      } else {
        // Handle standalone surging entities (New Characters/Locations)
        const updatedCharRegistry = { ...(videoRecord.characterRegistry || {}) }
        const updatedLocRegistry = { ...(videoRecord.locationRegistry || {}) }
        let changed = false

        if (metadata.newCharacters) {
          for (const [name, desc] of Object.entries(metadata.newCharacters)) {
            if (!updatedCharRegistry[name]) {
              updatedCharRegistry[name] = { description: desc as string, isNew: true }
              changed = true
            }
          }
        }
        if (metadata.newLocations) {
          for (const [name, desc] of Object.entries(metadata.newLocations)) {
            if (!updatedLocRegistry[name]) {
              updatedLocRegistry[name] = { description: desc as string }
              changed = true
            }
          }
        }

        if (changed) {
          await videoRepository.updateStatus(videoId, {
            characterRegistry: updatedCharRegistry,
            locationRegistry: updatedLocRegistry
          })
        }
      }

      // [V68 Hardening] REFRESH videoRecord immediately after Pre-Sync to ensure registries are hydrated
      const preSyncRefresh = await videoRepository.findById(videoId)
      if (preSyncRefresh) {
        videoRecord.characterRegistry = preSyncRefresh.characterRegistry
        videoRecord.locationRegistry = preSyncRefresh.locationRegistry
        videoRecord.assetRegistry = preSyncRefresh.assetRegistry
        videoRecord.script = preSyncRefresh.script || script
      }

      // Phase 2.1: Narrative Checkpoint Sync
      await reportProgress(job, videoId, 'pre_sync', 100, 'step.assets_locked')

      // REFRESH videoRecord to get the hydrated registries (surged during preSync)
      const refreshedRecord = await videoRepository.findById(videoId)
      if (refreshedRecord) {
        console.info(
          `[VideoWorker] 🔄 Refreshed video record after preSync. Registries: ${Object.keys(refreshedRecord.characterRegistry || {}).length} characters.`
        )
        // Update local variables for the next phases
        videoRecord.characterRegistry = refreshedRecord.characterRegistry
        videoRecord.locationRegistry = refreshedRecord.locationRegistry
        videoRecord.assetRegistry = refreshedRecord.assetRegistry
        videoRecord.script = refreshedRecord.script || script
      }

      // EARLY EXIT: If only script is requested, stop here.
      if (genOptions.scriptOnly) {
        console.info(`[VideoWorker] Script-only generation completed for video ${videoId}`)
        await videoRepository.updateStatus(videoId, {
          status: 'script_generated',
          progress: 100,
          currentStep: 'done',
          script,
          scenes: script.scenes,
          title: script.titles?.[0] || videoRecord.title
        })
        await reportProgress(job, videoId, 'script_generation', 100, 'step.script_ready')
        // DEDUCT CREDITS (Script cost + master assets)
        const totalFinalCost = (job.data.cost || 0) + masterAssetsCost
        await deductCredits(userId, videoId, totalFinalCost, job.data.planLimit, job.id)
        return
      }

      // Phase 3: Composition & Rendering
      pkg = await videoGenerationService.renderVideoFromScript({
        videoId,
        topic,
        userId,
        script: { ...script, narrationUrl: videoRecord.narrationUrl },
        options: genOptions,
        projectId: effectiveProjectId,
        onProgress: async (p, m, meta) => {
          // p is 0-100 from NanoBananaEngine internal phases (Images then Assembly)
          const message = m?.toLowerCase() || ''
          const isPhase3 =
            message.includes('step.step_3') ||
            message.includes('assembly') ||
            message.includes('étape 3') ||
            message.includes('montage')

          const stepName = isPhase3 ? 'rendering' : 'image_generation'
          await reportProgress(job, videoId, stepName, p, m, meta)
        },
        onTimingSync: async (syncedScript) => {
          console.info(`[VideoWorker] Transcription sync complete. Updating DB with accurate timings.`)
          const scriptToSave = JSON.parse(JSON.stringify(syncedScript))
          await videoRepository.updateStatus(videoId, {
            script: scriptToSave,
            scenes: scriptToSave.scenes,
            options: { ...((videoRecord.options as any) || {}), localProjectId: effectiveProjectId }
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
        await videoRepository.updateStatus(videoId, {
          script: validScript,
          scenes: validScript.scenes,
          title,
          options: { ...((videoRecord.options as any) || {}), localProjectId: effectiveProjectId }
        })
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
        await job.updateProgress({ step: 'completed', progress: 15, status: 'draft', videoId })
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
      await reportProgress(job, videoId, 'upload_audio', 90, 'step.upload_audio')
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
      await job.updateProgress({
        step: 'completed',
        progress: 100,
        status: 'narration_generated',
        videoId,
        narrationUrl
      })

      // DEDUCT CREDITS ON SUCCESS
      await deductCredits(userId, videoId, job.data.cost, job.data.planLimit, job.id)
      return
    }

    // 5. ASSET PERSISTENCE (If only scenes requested)
    if (options.generateOnlyScenes) {
      if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.COMPLETED)) {
        await reportProgress(job, videoId, 'upload_scenes', 90, 'step.upload_scenes')
        const updatedScenes = [...(pkg.script?.scenes || [])]
        await uploadSceneImages(videoId, updatedScenes, pkg.outputPath)

        // Sync script column too
        if (pkg.script) pkg.script.scenes = updatedScenes

        // Part A: Relational Scenes Table
        await videoRepository.saveScenes(videoId, updatedScenes)

        // Part B: Legacy JSONB
        await videoRepository.updateStatus(videoId, {
          status: 'scenes_generated',
          progress: 100, // Storyboard phase is finished for this job
          scenes: updatedScenes as any,
          script: pkg.script as any,
          completedAt: new Date()
        })
        checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
        const serialized = checkpointStorage.save(checkpoint)
        await videoRepository.updateStatus(videoId, {
          options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
        })
      }

      await job.updateProgress({ step: 'completed', progress: 100, status: 'scenes_generated', videoId })

      // DEDUCT CREDITS ON SUCCESS
      await deductCredits(userId, videoId, job.data.cost, job.data.planLimit, job.id)
      return
    }

    // 6. REPROMPT PERSISTENCE
    if (options.repromptSceneIndex !== undefined) {
      // Phase 28 : ALWAYS process reprompt completion, ignore previous asset checkpoints.
      await reportProgress(job, videoId, 'upload_reprompt', 90, `step.upload_reprompt:${options.repromptSceneIndex}`)

      const updatedScenes = [...(pkg.script?.scenes || [])]
      await uploadSceneImages(videoId, updatedScenes, pkg.outputPath)

      // Deep clone to ensure database update is triggered for JSONB columns
      const scenesToSave = JSON.parse(JSON.stringify(updatedScenes))
      const scriptToSave = pkg.script ? JSON.parse(JSON.stringify(pkg.script)) : null
      if (scriptToSave) {
        scriptToSave.scenes = scenesToSave
      }

      // Part A: Relational Scenes Table
      await videoRepository.saveScenes(videoId, scenesToSave)

      // Part B: Legacy JSONB
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

      // 🔄 SAGA SYNC: If the LAST scene was reprompted, we MUST update the visual bridge
      const lastIndex = scenesToSave.length - 1
      if (options.repromptSceneIndex === lastIndex && scenesToSave[lastIndex]) {
        const finalScene = scenesToSave[lastIndex]
        const finalImageUrl = finalScene.thumbnailUrl || finalScene.imageUrl
        const seriesId = (videoRecord as any).seriesId

        if (finalImageUrl) {
          console.info(`[VideoWorker] 🔄 Syncing Visual Bridge after final scene reprompt for video ${videoId}`)
          const finalBridge = {
            lastEpisodeFinalImage: finalImageUrl,
            lastEpisodeFinalScene: {
              summary: finalScene.summary,
              imagePrompt: finalScene.imagePrompt,
              locationId: finalScene.locationId,
              persistentDecorTokens: finalScene.persistentDecorTokens,
              emotionalTokens: finalScene.emotionalTokens,
              interactions: finalScene.interactions,
              charactersInScene: finalScene.charactersInScene || []
            }
          }
          // Update Video payload
          Object.assign(updatePayload, finalBridge)
          // Update Series Bible if applicable
          if (seriesId) {
            await seriesRepository.updateFinalBridge(seriesId, finalBridge)
          }
        }
      }

      await videoRepository.updateStatus(videoId, updatePayload)
      checkpoint = checkpointService.markPhaseCompleted(checkpoint, CHECKPOINT_PHASES.COMPLETED)
      const serialized = checkpointStorage.save(checkpoint)
      await videoRepository.updateStatus(videoId, {
        options: { ...((videoRecord.options as any) || {}), _checkpoint: serialized }
      })
      await job.updateProgress({
        step: 'completed',
        progress: 100,
        status: 'scenes_generated',
        videoId
      })
      console.info(`[VideoWorker] Reprompt completed for video ${videoId}`)

      // DEDUCT CREDITS ON SUCCESS (Standard cost + master assets)
      const currentMasterCost = (videoRecord.options as any)?.masterAssetsCost || masterAssetsCost || 0
      const totalFinalCost = (job.data.cost || 0) + currentMasterCost
      await deductCredits(userId, videoId, totalFinalCost, job.data.planLimit, job.id)
      return
    }

    // 7. FINAL UPLOAD (Full Video)
    if (!checkpointService.canSkipPhase(checkpoint, CHECKPOINT_PHASES.UPLOAD)) {
      await reportProgress(job, videoId, 'upload', 94, 'step.upload_prepare')
      const finalMp4 = path.join(pkg.outputPath, 'final_video.mp4')
      const assembledMp4 = path.join(pkg.outputPath, 'assembled_video.mp4')
      const videoFilePath = fs.existsSync(finalMp4) ? finalMp4 : fs.existsSync(assembledMp4) ? assembledMp4 : null

      await reportProgress(job, videoId, 'upload', 96, 'step.upload_video')

      const videoUrl = videoFilePath ? await uploadVideoToMinio(videoId, videoFilePath) : undefined

      // STRICT VALIDATION: If we reach this point but have no video URL, the generation FAILED.
      // Do not mark as completed.
      if (!videoUrl) {
        throw new Error(
          `Final video upload failed for ${videoId}: No video file found or upload returned empty URL. Check engine logs for assembly errors.`
        )
      }

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

      // Part A: Relational Scenes Table
      if (pkg.script?.scenes) {
        await videoRepository.saveScenes(videoId, pkg.script.scenes)
      }

      // Part B: Legacy JSONB
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
      // EVOLVE SAGA CONTEXT
      const seriesId = job.data.options.seriesId
      if (seriesId) {
        await promoteVisualSagaContext(seriesId, videoId, pkg.script)
        // [V67] FINAL BIBLE SYNC: Increment episode counter ONLY after total success
        await seriesRepository.incrementEpisodeNumber(seriesId)
      } else {
        await evolveStandaloneContext(videoId, pkg.script)
      }

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
      const currentMasterCost = (videoRecord.options as any)?.masterAssetsCost || masterAssetsCost || 0
      const totalFinalCost = (job.data.cost || 0) + currentMasterCost
      await deductCredits(userId, videoId, totalFinalCost, job.data.planLimit, job.id)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Job failed'
    console.error(`[VideoWorker] Error during job ${job.id}:`, error)

    if (msg === 'Generation cancelled by user') {
      throw new UnrecoverableError('Generation cancelled by user')
    }

    const isLast = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1)
    if (isLast) {
      // PERMANENT FAILURE: Ensure clear error message in database for support
      await videoRepository.updateStatus(videoId, {
        status: 'failed',
        errorMessage: `Critical Error: ${msg}`,
        progress: 0
      })
    }
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
