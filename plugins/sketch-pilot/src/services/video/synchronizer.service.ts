import type { FaceTrack, SpeakerSegment, SpeakerToFaceMapping } from '../../types/analysis.types'

export class SynchronizerService {
  /**
   * Matches audio speakers to face tracks using lip-sync scores and timing overlap.
   */
  async synchronize(segments: SpeakerSegment[], tracks: FaceTrack[]): Promise<SpeakerToFaceMapping[]> {
    const mappings: SpeakerToFaceMapping[] = []

    // Group segments by speaker
    const speakerSegments = new Map<string, SpeakerSegment[]>()
    for (const seg of segments) {
      if (!speakerSegments.has(seg.speakerId)) {
        speakerSegments.set(seg.speakerId, [])
      }
      speakerSegments.get(seg.speakerId)!.push(seg)
    }

    // For each speaker, find the face track that has the highest average lipMoveScore
    // during the times when the speaker is talking.
    for (const [speakerId, segs] of speakerSegments) {
      let bestTrackId = ''
      let bestScore = -1

      for (const track of tracks) {
        const score = this.calculateMatchScore(segs, track)
        if (score > bestScore) {
          bestScore = score
          bestTrackId = track.trackId
        }
      }

      if (bestTrackId) {
        mappings.push({
          speakerId,
          trackId: bestTrackId,
          confidence: Math.min(1, bestScore)
        })
      }
    }

    return mappings
  }

  private calculateMatchScore(segments: SpeakerSegment[], track: FaceTrack): number {
    let totalScore = 0
    let samples = 0

    for (const seg of segments) {
      // Find detections within this segment's time range
      const relevantDetections = track.detections.filter((d) => d.timestamp >= seg.start && d.timestamp <= seg.end)

      for (const d of relevantDetections) {
        totalScore += d.lipMoveScore
        samples++
      }
    }

    return samples > 0 ? totalScore / samples : 0
  }
}
