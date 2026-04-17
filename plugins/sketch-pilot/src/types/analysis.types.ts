export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface SpeakerSegment {
  speakerId: string
  start: number
  end: number
  text?: string
  confidence?: number
}

export interface FaceDetection {
  timestamp: number
  box: Box
  lipMoveScore: number
  confidence: number
}

export interface FaceTrack {
  trackId: string
  detections: FaceDetection[]
}

export interface SpeakerToFaceMapping {
  speakerId: string
  trackId: string
  confidence: number
}

export interface VideoAnalysisResult {
  segments: SpeakerSegment[]
  tracks: FaceTrack[]
  mappings: SpeakerToFaceMapping[]
  totalDuration: number
}
