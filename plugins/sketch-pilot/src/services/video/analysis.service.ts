import * as fs from 'node:fs'
import * as path from 'node:path'
import { extractAudio } from '../../utils/ffmpeg-utils'
import { GoogleDiarizationService, type SpeakerDiarizationService } from '../audio/diarization.service'
import type { VideoAnalysisResult } from '../../types/analysis.types'
import { MediaPipeFaceTrackingService, type FaceTrackingService } from './face-tracking.service'
import { SynchronizerService } from './synchronizer.service'

export class VideoAnalysisService {
  private diarizationService: SpeakerDiarizationService
  private faceTrackingService: FaceTrackingService
  private synchronizerService: SynchronizerService

  constructor() {
    // Utilisation de Google Diarization par défaut (nécessite @google-cloud/speech)
    this.diarizationService = new GoogleDiarizationService(process.env.GOOGLE_CLOUD_API_KEY)
    this.faceTrackingService = new MediaPipeFaceTrackingService()
    this.synchronizerService = new SynchronizerService()
  }

  async analyze(
    videoPath: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<VideoAnalysisResult> {
    const tempDir = path.join(process.cwd(), 'tmp', 'analysis', Date.now().toString())
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const audioPath = path.join(tempDir, 'extracted_audio.mp3')

    try {
      if (onProgress) onProgress(5, 'Extracting audio...')
      await extractAudio(videoPath, audioPath)

      if (onProgress) onProgress(10, 'Running diarization...')
      const segments = await this.diarizationService.diarize(audioPath, (p, m) => {
        if (onProgress) onProgress(10 + p * 0.2, `Diarization: ${m}`)
      })

      if (onProgress) onProgress(30, 'Running face tracking...')
      const tracks = await this.faceTrackingService.trackFaces(videoPath, (p, m) => {
        if (onProgress) onProgress(30 + p * 0.4, `Face tracking: ${m}`)
      })

      if (onProgress) onProgress(70, 'Running synchronization...')
      const mappings = await this.synchronizerService.synchronize(segments, tracks)

      if (onProgress) onProgress(90, 'Finalizing results...')

      // Get total duration (mocked or real)
      const totalDuration = segments.length > 0 ? segments.at(-1).end : 0

      const result: VideoAnalysisResult = {
        segments,
        tracks,
        mappings,
        totalDuration
      }

      if (onProgress) onProgress(100, 'Analysis complete')
      return result
    } finally {
      // Cleanup
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {}
    }
  }
}
