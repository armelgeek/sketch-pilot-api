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
        // Support Unicode letters and numbers across languages (French, etc.)
        .replaceAll(/[^\p{L}\p{N}\s']/gu, '')
        .replaceAll(/\s+/g, ' ')
        .trim()
    )
  }

  private static levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length
    const lenA = a.length
    const lenB = b.length
    const matrix = Array.from({ length: lenA + 1 }, () => new Int32Array(lenB + 1))
    for (let i = 0; i <= lenA; i++) matrix[i][0] = i
    for (let j = 0; j <= lenB; j++) matrix[0][j] = j

    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
      }
    }
    return matrix[lenA][lenB]
  }

  private static wordDistance(w1: string, w2: string): number {
    if (w1 === w2) return 0
    if (w1.length >= 3 && w2.length >= 3) {
      if (w1.startsWith(w2) || w2.startsWith(w1)) return 0.2
      if (w1.endsWith(w2) || w2.endsWith(w1)) return 0.2
      if (w1.includes(w2) || w2.includes(w1)) return 0.3
    }
    const maxLen = Math.max(w1.length, w2.length)
    if (maxLen === 0) return 0
    return this.levenshtein(w1, w2) / maxLen
  }

  static mapScenes(
    sceneNarrations: { sceneId: string; narration: string }[],
    transcribedWords: WordTiming[]
  ): SceneTiming[] {
    if (sceneNarrations.length === 0) return []

    // 1. Flatten all target words with their assigned scene ID
    interface TargetWord {
      word: string
      sceneId: string
    }
    const targetWords: TargetWord[] = []
    for (const scene of sceneNarrations) {
      const words = this.normalize(scene.narration).split(' ').filter(Boolean)
      for (const w of words) {
        targetWords.push({ word: w, sceneId: scene.sceneId })
      }
    }

    if (targetWords.length === 0 || transcribedWords.length === 0) {
      return sceneNarrations.map((s, idx) => ({
        sceneId: s.sceneId,
        start: idx * 5,
        end: (idx + 1) * 5,
        wordTimings: []
      }))
    }

    const N = transcribedWords.length
    const M = targetWords.length

    // Use Float32Array to avoid massive objects / memory overhead.
    const dp = new Float32Array((N + 1) * (M + 1))

    // Gap penalty is slightly higher than 1 to strongly encourage substitutions
    // even with bad matches (e.g. "effort" vs "est fort" is better substituted than 2 insertions).
    const GAP_PENALTY = 1.2

    for (let i = 0; i <= N; i++) dp[i * (M + 1) + 0] = i * GAP_PENALTY
    for (let j = 0; j <= M; j++) dp[0 * (M + 1) + j] = j * GAP_PENALTY

    // Precompute transposed distances for speed if M*N is large
    const distCache = new Map<string, number>()

    for (let i = 1; i <= N; i++) {
      const transWord = this.normalize(transcribedWords[i - 1].word)
      for (let j = 1; j <= M; j++) {
        const targWord = targetWords[j - 1].word
        const cacheKey = `${transWord}|${targWord}`
        let dist = distCache.get(cacheKey)
        if (dist === undefined) {
          dist = this.wordDistance(transWord, targWord)
          distCache.set(cacheKey, dist)
        }

        const del = dp[(i - 1) * (M + 1) + j] + GAP_PENALTY // insertion in transcript (transcribed word not in target)
        const ins = dp[i * (M + 1) + (j - 1)] + GAP_PENALTY // deletion in transcript (target word skipped by TTS)
        const sub = dp[(i - 1) * (M + 1) + (j - 1)] + dist // substitution/match

        dp[i * (M + 1) + j] = Math.min(del, ins, sub)
      }
    }

    // Backtrack to find optimal path
    const assignedSceneMap: (string | null)[] = Array.from({ length: N }, () => null)
    let currI = N
    let currJ = M

    while (currI > 0 && currJ > 0) {
      const currentCost = dp[currI * (M + 1) + currJ]

      const transWord = this.normalize(transcribedWords[currI - 1].word)
      const targWord = targetWords[currJ - 1].word
      const cacheKey = `${transWord}|${targWord}`
      const dist = distCache.get(cacheKey)!

      const del = dp[(currI - 1) * (M + 1) + currJ] + GAP_PENALTY
      const ins = dp[currI * (M + 1) + (currJ - 1)] + GAP_PENALTY
      const sub = dp[(currI - 1) * (M + 1) + (currJ - 1)] + dist

      // Notice rounding issues with floating points? Using arbitrary small epsilon for comparison.
      if (Math.abs(currentCost - sub) < 0.0001) {
        // Paired A[currI-1] to B[currJ-1]
        assignedSceneMap[currI - 1] = targetWords[currJ - 1].sceneId
        currI--
        currJ--
      } else if (Math.abs(currentCost - del) < 0.0001) {
        // Deletion (unmatched transcribed word)
        assignedSceneMap[currI - 1] = null // Will fill in post-processing
        currI--
      } else {
        // Insertion (skipped target word)
        currJ--
      }
    }
    // Any remaining currI > 0 means they are unmatched
    while (currI > 0) {
      assignedSceneMap[currI - 1] = null
      currI--
    }

    // Forward fill `null` values with nearest scene ID
    let currentValidScene: string | null = null
    for (let i = 0; i < N; i++) {
      if (assignedSceneMap[i]) {
        currentValidScene = assignedSceneMap[i]
      } else if (currentValidScene) {
        assignedSceneMap[i] = currentValidScene
      }
    }
    // Backward fill for any leading nulls
    currentValidScene = null
    for (let i = N - 1; i >= 0; i--) {
      if (assignedSceneMap[i]) {
        currentValidScene = assignedSceneMap[i]
      } else if (currentValidScene) {
        assignedSceneMap[i] = currentValidScene
      }
    }

    // In rare case where nothing matched at all
    if (!currentValidScene) {
      return sceneNarrations.map((s, idx) => ({
        sceneId: s.sceneId,
        start: idx * 5,
        end: (idx + 1) * 5,
        wordTimings: []
      }))
    }

    // Build the final array
    const results: SceneTiming[] = []
    let lastEnd = 0

    for (const scene of sceneNarrations) {
      const timings = transcribedWords.filter((tw, i) => assignedSceneMap[i] === scene.sceneId)
      if (timings.length > 0) {
        const start = timings[0].start
        const end = timings.at(-1)!.end
        results.push({
          sceneId: scene.sceneId,
          start,
          end: Math.max(end, start + 0.1),
          wordTimings: timings
        })
        lastEnd = end
      } else {
        results.push({
          sceneId: scene.sceneId,
          start: lastEnd,
          end: lastEnd + 2, // fallback
          wordTimings: []
        })
        lastEnd += 2
      }
    }

    // Final borders cleanup to ensure strict contiguity
    for (let j = 0; j < results.length; j++) {
      if (j > 0) {
        if (results[j].wordTimings.length > 0 && results[j - 1].wordTimings.length > 0) {
          const borderTime = results[j].wordTimings[0].start
          results[j - 1].end = borderTime
          results[j].start = borderTime
        } else {
          results[j].start = results[j - 1].end
        }
      }
      // Cushion the absolute final scene so it doesn't cut prematurely
      if (j === results.length - 1 && results[j].wordTimings.length > 0) {
        results[j].end = results[j].wordTimings.at(-1)!.end + 0.2
      }
    }

    return results
  }
}
