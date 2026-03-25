/**
 * Video Checkpoint Service
 *
 * Manages checkpoints for video generation to enable resumption from failures.
 * Checkpoints track which phases have been completed and their artifacts.
 */

import { redisClient } from '../../infrastructure/config/queue.config'

export interface CheckpointPhase {
  name: string
  completed: boolean
  completedAt?: Date
  _details?: Record<string, any>
}

export interface VideoCheckpoint {
  videoId: string
  jobId: string
  phases: Record<string, CheckpointPhase>
  lastError?: {
    phase: string
    message: string
    timestamp: Date
  }
  createdAt: Date
  updatedAt: Date
}

export interface RemovalData {
  script?: any
  scenes?: any
  outputPath?: string
  package?: any
}

export const CHECKPOINT_PHASES = {
  SCRIPT_GENERATION: 'script_generation',
  ASSET_GENERATION: 'asset_generation',
  NARRATION_GENERATION: 'narration_generation',
  VIDEO_ASSEMBLY: 'video_assembly',
  UPLOAD: 'upload',
  COMPLETED: 'completed'
} as const

export class VideoCheckpointService {
  private readonly CHECKPOINT_KEY_PREFIX = 'video-checkpoint:'

  /**
   * Initialize checkpoint for a video job
   */
  initializeCheckpoint(videoId: string, jobId: string): VideoCheckpoint {
    return {
      videoId,
      jobId,
      phases: {
        [CHECKPOINT_PHASES.SCRIPT_GENERATION]: { name: CHECKPOINT_PHASES.SCRIPT_GENERATION, completed: false },
        [CHECKPOINT_PHASES.ASSET_GENERATION]: { name: CHECKPOINT_PHASES.ASSET_GENERATION, completed: false },
        [CHECKPOINT_PHASES.NARRATION_GENERATION]: { name: CHECKPOINT_PHASES.NARRATION_GENERATION, completed: false },
        [CHECKPOINT_PHASES.VIDEO_ASSEMBLY]: { name: CHECKPOINT_PHASES.VIDEO_ASSEMBLY, completed: false },
        [CHECKPOINT_PHASES.UPLOAD]: { name: CHECKPOINT_PHASES.UPLOAD, completed: false },
        [CHECKPOINT_PHASES.COMPLETED]: { name: CHECKPOINT_PHASES.COMPLETED, completed: false }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * Mark a phase as completed
   */
  markPhaseCompleted(checkpoint: VideoCheckpoint, phaseName: string, details?: Record<string, any>): VideoCheckpoint {
    const phase = checkpoint.phases[phaseName]
    if (phase) {
      phase.completed = true
      phase.completedAt = new Date()
      if (details) {
        phase._details = details
      }
    }
    checkpoint.updatedAt = new Date()
    return checkpoint
  }

  /**
   * Record an error in a phase
   */
  recordPhaseError(checkpoint: VideoCheckpoint, phaseName: string, error: Error): VideoCheckpoint {
    checkpoint.lastError = {
      phase: phaseName,
      message: error.message,
      timestamp: new Date()
    }
    checkpoint.updatedAt = new Date()
    return checkpoint
  }

  /**
   * Get the next phase to process based on what's completed
   */
  getNextPhase(checkpoint: VideoCheckpoint): string | null {
    const phases = [
      CHECKPOINT_PHASES.SCRIPT_GENERATION,
      CHECKPOINT_PHASES.ASSET_GENERATION,
      CHECKPOINT_PHASES.NARRATION_GENERATION,
      CHECKPOINT_PHASES.VIDEO_ASSEMBLY,
      CHECKPOINT_PHASES.UPLOAD,
      CHECKPOINT_PHASES.COMPLETED
    ]

    for (const phase of phases) {
      if (!checkpoint.phases[phase]?.completed) {
        return phase
      }
    }

    return null
  }

  /**
   * Check if we can skip a phase based on checkpoint
   */
  canSkipPhase(checkpoint: VideoCheckpoint, phaseName: string): boolean {
    return checkpoint.phases[phaseName]?.completed ?? false
  }

  /**
   * Get checkpoint key for Redis storage
   */
  getCheckpointKey(videoId: string): string {
    return `${this.CHECKPOINT_KEY_PREFIX}${videoId}`
  }

  /**
   * Delete checkpoint from Redis storage
   */
  async deleteCheckpoint(videoId: string): Promise<void> {
    const key = this.getCheckpointKey(videoId)
    await redisClient.del(key)
  }

  /**
   * Serialize checkpoint to JSON (for storage)
   */
  serialize(checkpoint: VideoCheckpoint): string {
    // Clean up details that might contain large objects
    const cleaned = {
      ...checkpoint,
      phases: Object.entries(checkpoint.phases).reduce(
        (acc, [key, phase]) => {
          acc[key] = {
            name: phase.name,
            completed: phase.completed,
            completedAt: phase.completedAt
          }
          return acc
        },
        {} as Record<string, any>
      )
    }
    return JSON.stringify(cleaned)
  }

  /**
   * Deserialize checkpoint from JSON
   */
  deserialize(json: string): VideoCheckpoint {
    return JSON.parse(json)
  }

  /**
   * Get summary of checkpoint progress
   */
  getProgressSummary(checkpoint: VideoCheckpoint): {
    completedCount: number
    totalCount: number
    percentage: number
    completedPhases: string[]
  } {
    const phases = Object.values(checkpoint.phases)
    const completed = phases.filter((p) => p.completed)
    return {
      completedCount: completed.length,
      totalCount: phases.length,
      percentage: Math.round((completed.length / phases.length) * 100),
      completedPhases: completed.map((p) => p.name)
    }
  }
}

export const checkpointService = new VideoCheckpointService()
