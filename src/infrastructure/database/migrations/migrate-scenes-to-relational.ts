import process from 'node:process'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db'
import { videos, videoScenes } from '../schema/video.schema'

async function migrateScenes() {
  console.info('🚀 Starting migration: JSONB scenes to relational table...')

  const allVideos = await db.select().from(videos)
  console.info(`Found ${allVideos.length} videos to check.`)

  let migratedCount = 0
  let skippedCount = 0

  console.info('🗑️ Clearing existing video_scenes table to avoid corrupted data...')
  await db.delete(videoScenes)

  for (const video of allVideos) {
    const scenes = (video.scenes || (video.script as any)?.scenes || []) as any[]

    if (scenes.length === 0) {
      skippedCount++
      continue
    }

    console.info(`Migrating ${scenes.length} scenes for video: ${video.id} (${video.title || video.topic})`)

    for (const scene of scenes) {
      // Ensure scene has a valid ID
      const sceneId = scene.id || `scene-${uuidv4().slice(0, 8)}`

      try {
        await db
          .insert(videoScenes)
          .values({
            id: `${video.id}:${sceneId}`,
            videoId: video.id,
            sceneNumber: scene.sceneNumber || 0,
            startTime: String(scene.timeRange?.start || 0),
            endTime: String(scene.timeRange?.end || 0),
            duration: String(scene.duration || 0),
            summary: scene.summary,
            justification: scene.justification,
            narration: scene.narration || '',
            locationId: scene.locationId,
            imagePrompt: scene.imagePrompt,
            imageUrl: scene.imageUrl,
            thumbnailUrl: scene.thumbnailUrl,
            cameraAction: scene.cameraAction,
            animationPrompt: scene.animationPrompt,
            preset: scene.preset,
            transition: scene.transition,
            continueFromPrevious: String(!!scene.continueFromPrevious),
            persistentDecorTokens: scene.persistentDecorTokens || [],
            isEstablishingShot: String(!!scene.isEstablishingShot),
            spatialAnchor: scene.spatialAnchor,
            composition: scene.composition,
            visualEvolution: scene.visualEvolution,
            weatherState: scene.weatherState,
            timeOfDay: scene.timeOfDay,
            colorPalette: scene.colorPalette,
            cameraStyle: scene.cameraStyle,
            metadata: { ...scene },
            createdAt: video.createdAt || new Date(),
            updatedAt: new Date()
          })
          .onConflictDoUpdate({
            target: videoScenes.id,
            set: {
              updatedAt: new Date()
            }
          })
        migratedCount++
      } catch (error: any) {
        console.error(`Failed to migrate scene ${sceneId} for video ${video.id}:`, error.message)
      }
    }
  }

  console.info(`✅ Migration finished!`)
  console.info(`- Scenes migrated: ${migratedCount}`)
  console.info(`- Videos skipped (no scenes): ${skippedCount}`)
}

migrateScenes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
