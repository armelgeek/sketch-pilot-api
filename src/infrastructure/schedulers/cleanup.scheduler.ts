import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { eq } from 'drizzle-orm'
import cron from 'node-cron'
import { redisClient } from '../config/queue.config'
import { db } from '../database/db'
import { videos } from '../database/schema'

/**
 * Cleanup Scheduler
 * Periodically purges stale files from uploads/temp and uploads/output.
 */

const TEMP_DIR = path.join(process.cwd(), 'uploads', 'temp')
const OUTPUT_DIR = path.join(process.cwd(), 'uploads', 'output')

const STALE_TEMP_MS = 1 * 3600 * 1000 // 1 hour for temp files
const STALE_OUTPUT_MS = 48 * 3600 * 1000 // 48 hours for project residues

async function cleanupDirectory(dir: string, staleMs: number, type: 'temp' | 'output') {
  if (!fs.existsSync(dir)) return

  const now = Date.now()
  const items = fs.readdirSync(dir)

  for (const item of items) {
    const itemPath = path.join(dir, item)
    try {
      const stats = fs.statSync(itemPath)
      const age = now - stats.mtimeMs

      if (age > staleMs) {
        // SAFETY CHECKS for project output
        if (type === 'output') {
          // 1. Check Redis Lock
          const lockKey = `active-video-job:${item}`
          const isLocked = await redisClient.get(lockKey)
          if (isLocked) {
            console.info(`[Cleanup] Skipping active project: ${item} (Locked by job ${isLocked})`)
            continue
          }

          // 2. Check Database Status (if item looks like a video UUID)
          if (item.length > 20) {
            const video = await db.query.videos?.findFirst?.({
              where: eq(videos.id, item)
            })
            if (video && video.status === 'processing') {
              console.info(`[Cleanup] Skipping active project: ${item} (Status: processing)`)
              continue
            }
          }
        }

        console.info(`[Cleanup] Removing stale item: ${itemPath} (Age: ${Math.round(age / 3600000)}h)`)
        fs.rmSync(itemPath, { recursive: true, force: true })
      }
    } catch (error: any) {
      console.warn(`[Cleanup] Failed to process ${itemPath}:`, error.message)
    }
  }
}

// Run every night at 3 AM
export const cleanupScheduler = cron.schedule('0 3 * * *', async () => {
  console.info('[Cleanup] Starting scheduled disk cleanup...')

  // 1. Clean uploads/temp
  await cleanupDirectory(TEMP_DIR, STALE_TEMP_MS, 'temp')

  // 2. Clean uploads/output (projects residues)
  await cleanupDirectory(OUTPUT_DIR, STALE_OUTPUT_MS, 'output')

  console.info('[Cleanup] Scheduled cleanup completed.')
})
