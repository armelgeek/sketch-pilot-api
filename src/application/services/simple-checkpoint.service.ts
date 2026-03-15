/**
 * Simple checkpoint manager that stores state in video record options.
 * Avoids complex file I/O by leveraging existing database layer.
 */

export interface SimpleCheckpoint {
  version: number
  phases: Record<string, boolean>
  lastError?: string
  timestamp: number
}

export function createCheckpoint(): SimpleCheckpoint {
  return {
    version: 1,
    phases: {
      script_generation: false,
      asset_generation: false,
      narration_generation: false,
      video_assembly: false,
      upload: false
    },
    timestamp: Date.now()
  }
}

export function markPhaseComplete(checkpoint: SimpleCheckpoint, phase: string): SimpleCheckpoint {
  checkpoint.phases[phase] = true
  checkpoint.timestamp = Date.now()
  return checkpoint
}

export function isPhaseComplete(checkpoint: SimpleCheckpoint, phase: string): boolean {
  return checkpoint.phases[phase] ?? false
}

export function canResume(checkpoint: SimpleCheckpoint): boolean {
  return Object.values(checkpoint.phases).includes(true)
}

export function getCheckpointFromOptions(options: any): SimpleCheckpoint | null {
  if (options && options._checkpoint) {
    try {
      const checkpoint = JSON.parse(
        typeof options._checkpoint === 'string' ? options._checkpoint : JSON.stringify(options._checkpoint)
      )
      return checkpoint as SimpleCheckpoint
    } catch {
      return null
    }
  }
  return null
}

export function storeCheckpointInOptions(checkpoint: SimpleCheckpoint, options: any): any {
  return {
    ...options,
    _checkpoint: JSON.stringify(checkpoint)
  }
}
