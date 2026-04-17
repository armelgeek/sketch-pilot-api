import * as fs from 'node:fs'
import * as path from 'node:path'
import { extractFrames } from '../../utils/ffmpeg-utils'
import type { FaceTrack } from '../../types/analysis.types'

export interface FaceTrackingService {
  trackFaces: (videoPath: string, onProgress?: (progress: number, message: string) => void) => Promise<FaceTrack[]>
}

export class MediaPipeFaceTrackingService implements FaceTrackingService {
  /**
   * Mock implementation. In real life, this would use MediaPipe or OpenCV
   * to process frames extracted from the video.
   */
  async trackFaces(videoPath: string, onProgress?: (progress: number, message: string) => void): Promise<FaceTrack[]> {
    const tempDir = path.join(process.cwd(), 'tmp', 'analysis', Date.now().toString())

    if (onProgress) onProgress(10, 'Extracting frames...')
    await extractFrames(videoPath, tempDir, 2) // 2 FPS for analysis

    if (onProgress) onProgress(40, 'Detecting faces in frames...')

    // Mock tracking: 2 faces discovered
    const tracks: FaceTrack[] = [
      {
        trackId: 'FACE_00',
        detections: [
          { timestamp: 0, box: { x: 100, y: 100, width: 50, height: 50 }, lipMoveScore: 0.8, confidence: 0.9 },
          { timestamp: 1, box: { x: 105, y: 100, width: 50, height: 50 }, lipMoveScore: 0.9, confidence: 0.9 },
          { timestamp: 2, box: { x: 110, y: 100, width: 50, height: 50 }, lipMoveScore: 0.1, confidence: 0.9 }
        ]
      },
      {
        trackId: 'FACE_01',
        detections: [
          { timestamp: 0, box: { x: 400, y: 100, width: 50, height: 50 }, lipMoveScore: 0.1, confidence: 0.9 },
          { timestamp: 1, box: { x: 405, y: 100, width: 50, height: 50 }, lipMoveScore: 0.1, confidence: 0.9 },
          { timestamp: 2, box: { x: 410, y: 100, width: 50, height: 50 }, lipMoveScore: 0.7, confidence: 0.9 }
        ]
      }
    ]

    // Cleanup frames
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}

    if (onProgress) onProgress(100, 'Face tracking complete')
    return tracks
  }
}
