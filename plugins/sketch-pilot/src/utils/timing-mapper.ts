import type { WordTiming } from '../services/audio'

export interface SceneTiming {
  sceneId: string
  start: number
  end: number
  wordTimings: WordTiming[]
}

/**
 * Utility to map a sequence of transcribed words back to original scene narrations.
 * This handles the "Global Audio" strategy by identifying where each scene begins
 * and ends within the single long audio file.
 */
export class TimingMapper {
  private static normalize(text: string): string {
    if (!text) return ''
    return (
      text
        // Split camelCase or PascalCase (e.g., "QuietMind" -> "Quiet Mind")
        .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
        // Treat hyphens as space separators (e.g., "ill-fitting" -> "ill fitting")
        .replaceAll('-', ' ')
        .toLowerCase()
        .replaceAll("'", "'")
        .replaceAll(/[^a-z0-9\s']/g, '')
        .replaceAll(/\s+/g, ' ')
        .trim()
    )
  }

  /**
   * Maps transcription word timings to scenes.
   */
  static mapScenes(
    sceneNarrations: { sceneId: string; narration: string }[],
    transcribedWords: WordTiming[]
  ): SceneTiming[] {
    if (sceneNarrations.length === 0) return []

    const results: SceneTiming[] = []
    let searchFrom = 0

    // Pass 1: Identifiy anchors (scenes with good matches)
    for (const scene of sceneNarrations) {
      const targetWords = this.normalize(scene.narration).split(' ').filter(Boolean)

      if (targetWords.length === 0 || transcribedWords.length === 0) {
        const previousEnd = results.length > 0 ? results.at(-1)!.end : 0
        results.push({ sceneId: scene.sceneId, start: previousEnd, end: previousEnd, wordTimings: [] })
        continue
      }

      // Find best match in transcription
      let bestScore = -1
      let bestStartIdx = -1
      let bestEndIdx = -1
      const n = targetWords.length

      // Search window optimization: try to find the sequence in transcription
      for (let i = searchFrom; i < transcribedWords.length; i++) {
        let narIdx = 0
        let wIdx = i
        let matchCount = 0
        let gapCount = 0
        const GAP_LIMIT = 8
        const windowEnd = Math.min(i + Math.ceil(n * 1.5) + 5, transcribedWords.length)

        while (narIdx < n && wIdx < windowEnd) {
          const ww = this.normalize(transcribedWords[wIdx].word)
          const nw = targetWords[narIdx]
          if (ww === nw || ww.startsWith(nw) || nw.startsWith(ww)) {
            matchCount++
            narIdx++
            gapCount = 0
          } else {
            gapCount++
            if (gapCount > GAP_LIMIT) break
          }
          wIdx++
        }

        const score = matchCount / n
        if (score > bestScore) {
          bestScore = score
          bestStartIdx = i
          bestEndIdx = wIdx - 1
          if (score > 0.9) break // Optimization: good enough
        }
      }

      const MIN_SCORE = 0.15

      if (bestStartIdx >= 0 && bestScore >= MIN_SCORE) {
        const sceneWordTimings = transcribedWords.slice(bestStartIdx, bestEndIdx + 1)
        results.push({
          sceneId: scene.sceneId,
          start: sceneWordTimings[0].start,
          end: sceneWordTimings.at(-1)!.end,
          wordTimings: sceneWordTimings
        })
        searchFrom = bestEndIdx + 1
      } else {
        const previousEnd = results.length > 0 ? results.at(-1)!.end : 0
        results.push({
          sceneId: scene.sceneId,
          start: previousEnd,
          end: previousEnd + n * 0.4, // Temporary estimation
          wordTimings: []
        })
      }
    }

    // Pass 2: Proportional distribution for unmatched "islands"
    // We look for sequences of scenes with no wordTimings between two "anchors"
    let i = 0
    while (i < results.length) {
      if (results[i].wordTimings.length > 0) {
        // This is an anchor, its internal timing is respected
        i++
        continue
      }

      // Start of a gap
      const gapStartIdx = i
      let gapEndIdx = i
      while (gapEndIdx < results.length && results[gapEndIdx].wordTimings.length === 0) {
        gapEndIdx++
      }
      // Gap is [gapStartIdx, gapEndIdx - 1]

      // Boundary timestamps
      const prevAnchorEnd = gapStartIdx === 0 ? 0 : results[gapStartIdx - 1].end
      let nextAnchorStart: number
      if (gapEndIdx < results.length) {
        nextAnchorStart = results[gapEndIdx].start
      } else {
        // End of script, use transcription end or a safe buffer
        const lastTranscribedEnd = transcribedWords.length > 0 ? transcribedWords.at(-1)!.end : 0
        nextAnchorStart = Math.max(prevAnchorEnd + 5, lastTranscribedEnd)
      }

      const totalGapDuration = Math.max(0.1, nextAnchorStart - prevAnchorEnd)

      // Calculate total words in this gap to distribute time proportionally
      let totalWordsInGap = 0
      for (let k = gapStartIdx; k < gapEndIdx; k++) {
        totalWordsInGap += Math.max(1, this.normalize(sceneNarrations[k].narration).split(' ').length)
      }

      let currentPos = prevAnchorEnd
      for (let k = gapStartIdx; k < gapEndIdx; k++) {
        const sceneWords = Math.max(1, this.normalize(sceneNarrations[k].narration).split(' ').length)
        const sceneDuration = (sceneWords / totalWordsInGap) * totalGapDuration
        results[k].start = currentPos
        results[k].end = currentPos + sceneDuration
        currentPos += sceneDuration
      }

      i = gapEndIdx
    }

    // Final pass: Ensure continuity and anchor starts to word timings if available
    for (let j = 0; j < results.length; j++) {
      if (j === 0) {
        results[j].start = 0
      } else {
        // If this scene is an anchor (has word timings), its start is the first word's start
        // Otherwise, it starts where the previous scene ended
        if (results[j].wordTimings.length > 0) {
          const firstWordStart = results[j].wordTimings[0].start
          results[j].start = firstWordStart
          // Adjust previous scene end to match this start perfectly
          results[j - 1].end = firstWordStart
        } else {
          results[j].start = results[j - 1].end
        }
      }

      // Calculate end for this scene
      if (results[j].wordTimings.length > 0) {
        const lastWordEnd = results[j].wordTimings.at(-1)!.end

        // If there's a next scene, the current scene ends at the next scene's start
        if (j < results.length - 1) {
          const nextSceneStart =
            results[j + 1].wordTimings.length > 0
              ? results[j + 1].wordTimings[0].start
              : results[j + 1].start || lastWordEnd + 0.1 // Fallback
          results[j].end = Math.max(lastWordEnd + 0.1, nextSceneStart)
        } else {
          // Last scene: add a small cushion
          results[j].end = lastWordEnd + 1
        }
      }
      // If not an anchor, results[j].end was already estimated/distributed in Pass 2
    }

    return results
  }
}
