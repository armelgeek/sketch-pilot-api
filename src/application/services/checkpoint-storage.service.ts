/**
 * Checkpoint Storage
 *
 * Manages storing and retrieving video generation checkpoints.
 * Uses in-memory cache with optional persistent storage.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { checkpointService, type VideoCheckpoint } from './video-checkpoint.service'

const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR || path.join(process.cwd(), '.checkpoints')

// Ensure checkpoint directory exists
if (!fs.existsSync(CHECKPOINT_DIR)) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true })
}

const checkpointCache = new Map<string, VideoCheckpoint>()

export class CheckpointStorage {
  /**
   * Load checkpoint from storage (file or memory)
   */
  load(videoId: string): VideoCheckpoint | null {
    // Try memory first
    if (checkpointCache.has(videoId)) {
      return checkpointCache.get(videoId)!
    }

    // Try disk
    const filePath = this.getFilePath(videoId)
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf-8')
        const checkpoint = checkpointService.deserialize(data)
        checkpointCache.set(videoId, checkpoint)
        return checkpoint
      } catch (error) {
        console.warn(`[CheckpointStorage] Failed to load checkpoint for ${videoId}:`, error)
      }
    }

    return null
  }

  /**
   * Save checkpoint to storage
   */
  save(checkpoint: VideoCheckpoint): void {
    checkpointCache.set(checkpoint.videoId, checkpoint)

    const filePath = this.getFilePath(checkpoint.videoId)
    try {
      fs.writeFileSync(filePath, checkpointService.serialize(checkpoint), 'utf-8')
    } catch (error) {
      console.error(`[CheckpointStorage] Failed to save checkpoint for ${checkpoint.videoId}:`, error)
      throw error
    }
  }

  /**
   * Delete checkpoint
   */
  delete(videoId: string): void {
    checkpointCache.delete(videoId)

    const filePath = this.getFilePath(videoId)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch (error) {
        console.error(`[CheckpointStorage] Failed to delete checkpoint for ${videoId}:`, error)
      }
    }
  }

  /**
   * Get file path for checkpoint
   */
  private getFilePath(videoId: string): string {
    return path.join(CHECKPOINT_DIR, `${videoId}.checkpoint.json`)
  }

  /**
   * List all saved checkpoints
   */
  listAll(): string[] {
    try {
      const files = fs.readdirSync(CHECKPOINT_DIR)
      return files.filter((f) => f.endsWith('.checkpoint.json')).map((f) => f.replace('.checkpoint.json', ''))
    } catch {
      return []
    }
  }

  /**
   * Clean up old checkpoints (older than TTL)
   */
  cleanupOldCheckpoints(ttlMs: number = 24 * 60 * 60 * 1000): number {
    let count = 0
    const now = Date.now()

    try {
      const files = fs.readdirSync(CHECKPOINT_DIR)
      for (const file of files) {
        if (!file.endsWith('.checkpoint.json')) continue

        const filePath = path.join(CHECKPOINT_DIR, file)
        const stats = fs.statSync(filePath)
        if (now - stats.mtimeMs > ttlMs) {
          fs.unlinkSync(filePath)
          count++
        }
      }
    } catch (error) {
      console.error('[CheckpointStorage] Failed to cleanup old checkpoints:', error)
    }

    return count
  }
}

export const checkpointStorage = new CheckpointStorage()
