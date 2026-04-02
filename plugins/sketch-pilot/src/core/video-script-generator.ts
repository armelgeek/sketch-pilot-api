/* eslint-disable no-control-regex */
import fs from 'node:fs'
import path from 'node:path'
import {
  completeVideoScriptSchema,
  computeSceneCountRange,
  MIN_SCENE_DURATION,
  suggestSceneDuration,
  type CompleteVideoScript,
  type EnrichedScene,
  type SceneContextType,
  type VideoGenerationOptions
} from '../types/video-script.types'
import type { LLMService } from '../services/llm'
import { PromptGenerator } from './prompt-generator'
import { PromptManager } from './prompt-manager'
import { SceneMemoryBuilder } from './scene-memory'

// ─── Types ────────────────────────────────────────────────────────────────────

type RawScene = Omit<EnrichedScene, 'imagePrompt' | 'animationPrompt'> & {
  animationPrompt?: string
  props?: string[]
  narration?: string
  contextType?: string
  sceneNumber?: number
  soundEffects?: Array<{ id?: string; [key: string]: unknown }>
}

// ─── Candidate scoring ───────────────────────────────────────────────────────

interface ScriptCandidate {
  parsed: any
  score: number
  attempt: number
  issues: string[]
}

/**
 * Score a parsed script against the target word count and structural rules.
 *
 * Score breakdown (0–1 scale):
 *   wordProximity      0.35 — how close actual words are to target (linear, capped at ±40%)
 *   noNarrativeGap     0.20 — fullNarration matches sum of scenes (≤5% drift = full points)
 *   noDensityFailure   0.20 — all scenes meet their minimum word density
 *   sceneStructure     0.25 — scenes array exists and has a reasonable count
 *
 * Higher is better. A perfect script scores 1.0.
 */
export function scoreCandidate(
  parsed: any,
  targetWords: number,
  effectiveDuration: number,
  minWordsPerScene: number
): { score: number; issues: string[] } {
  const issues: string[] = []
  let score = 0

  if (!parsed?.scenes || !Array.isArray(parsed.scenes)) {
    return { score: 0, issues: ['Missing scenes array'] }
  }

  // ── 1. Word proximity (0.35) ──────────────────────────────────────────────
  const actualWords: number = parsed.scenes.reduce(
    (acc: number, s: any) => acc + (s.narration || '').trim().split(/\s+/).filter(Boolean).length,
    0
  )
  const ratio = actualWords / Math.max(targetWords, 1)
  // Linear score: 1.0 at ratio=1.0, 0.0 at ratio≤0.60 or ratio≥1.40
  const wordScore = Math.max(0, 1 - Math.abs(ratio - 1) / 0.4)
  score += wordScore * 0.35

  if (ratio < 0.75) issues.push(`Under-generated: ${actualWords}/${targetWords} words (${Math.round(ratio * 100)}%)`)
  if (ratio > 1.15) issues.push(`Over-generated: ${actualWords}/${targetWords} words (${Math.round(ratio * 100)}%)`)

  // ── 2. Narrative consistency (0.20) ───────────────────────────────────────
  const fullNarrationWords = (parsed.fullNarration || '').trim().split(/\s+/).filter(Boolean).length
  const drift = fullNarrationWords > 0 ? Math.abs(actualWords - fullNarrationWords) / Math.max(actualWords, 1) : 0
  const narrativeScore = fullNarrationWords === 0 ? 0.5 : Math.max(0, 1 - drift / 0.02) // ≤2% drift = full score
  score += narrativeScore * 0.2

  if (drift > 0.02 && fullNarrationWords > 0) {
    issues.push(
      `Narrative drift: fullNarration=${fullNarrationWords}w vs scenes sum=${actualWords}w (${Math.round(drift * 100)}% off)`
    )
  }

  // ── 3. Scene density (0.20) ───────────────────────────────────────────────
  let failingScenes = 0
  for (const [index, scene] of parsed.scenes.entries()) {
    const narration = scene.narration || ''
    const sceneWords = narration.trim().split(/\s+/).filter(Boolean).length
    const isHook = scene.preset === 'hook' || index === 0
    const baseThreshold = 0.85
    const effectiveMinWords = isHook
      ? Math.max(20, Math.round(minWordsPerScene * 0.3))
      : Math.round(minWordsPerScene * baseThreshold)

    if (sceneWords < effectiveMinWords) {
      failingScenes++
      issues.push(`Scene ${index + 1} (${scene.preset || 'unknown'}) too short: ${sceneWords}/${effectiveMinWords}w`)
    }
  }
  const densityScore = (1 - failingScenes / Math.max(parsed.scenes.length, 1)) ** 2
  score += densityScore * 0.2

  // ── 4. Scene structure & Variety (0.25) ───────────────────────────────────
  const range = computeSceneCountRange(effectiveDuration)
  const sceneCount = parsed.scenes.length

  // Increased penalty for structure deviation to ensure visual variety
  const sceneDiff = Math.abs(sceneCount - range.ideal)
  const structureScore = Math.max(0, 1 - (sceneDiff / Math.max(range.ideal, 1)) * 1.5) // Higher multiplier = steeper penalty
  score += structureScore * 0.25

  if (sceneCount < range.min) issues.push(`Too few scenes: ${sceneCount} (min=${range.min})`)
  if (sceneCount > range.max) issues.push(`Too many scenes: ${sceneCount} (max=${range.max})`)

  return { score, issues }
}

// ─── VideoScriptGenerator ────────────────────────────────────────────────────

/**
 * Video script generator using Gemini AI
 */
export class VideoScriptGenerator {
  private readonly llmService: LLMService
  private readonly promptGenerator: PromptGenerator
  readonly promptManager: PromptManager

  constructor(llmService: LLMService, promptManager?: PromptManager) {
    this.llmService = llmService
    this.promptManager = promptManager ?? new PromptManager()
    this.promptGenerator = new PromptGenerator(this.promptManager)
  }

  /**
   * Generate a complete video script from a topic.
   */
  async generateCompleteScript(
    topic: string,
    options: VideoGenerationOptions,
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>
  ): Promise<CompleteVideoScript> {
    if (onProgress) await onProgress(2, 'Studio: Initializing script engine...')
    const baseScript = await this.generateVideoStructure(topic, options, onProgress)
    if (onProgress) await onProgress(20, 'Studio: Script structure finalized. Building visuals...')

    const enrichedScenes = await this.enrichScenes(baseScript.scenes, options, onProgress)

    let actualTotal = enrichedScenes.reduce((acc, s) => {
      const end = s.timeRange?.end
      if (typeof end !== 'number' || isNaN(end)) return acc
      return Math.max(acc, end)
    }, 0)

    if (actualTotal < 1) {
      const fallback = options.duration
      console.warn(`[VideoScriptGen] computed totalDuration ${actualTotal} is invalid; falling back to ${fallback}`)
      actualTotal = Math.max(fallback, 1)
    }

    const completeScript: CompleteVideoScript = {
      titles: baseScript.titles,
      fullNarration: baseScript.fullNarration,
      theme: baseScript.theme,
      totalDuration: actualTotal,
      sceneCount: enrichedScenes.length,
      scenes: enrichedScenes,
      aspectRatio: options.aspectRatio || '16:9',
      backgroundMusic: baseScript.backgroundMusic,
      globalAudio: options.globalAudioPath,
      topic: baseScript.topic,
      audience: baseScript.audience,
      emotionalArc: baseScript.emotionalArc
    }

    let validated: CompleteVideoScript
    try {
      validated = completeVideoScriptSchema.parse(completeScript)
    } catch (validationError: any) {
      console.error('[VideoScriptGen] Schema validation failed:', validationError.errors || validationError.message)
      throw new Error(`Script validation failed: ${validationError.message}`)
    }

    // ── Debug: persist generated script JSON ──────────────────────────────
    try {
      const debugDir = path.join(process.cwd(), 'uploads', 'output')
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true })
      const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
      const debugPath = path.join(debugDir, `debug_script_${timestamp}.json`)
      fs.writeFileSync(debugPath, JSON.stringify(validated, null, 2), 'utf-8')
      console.log(`[VideoScriptGen] 📄 Debug script saved → ${debugPath}`)
    } catch (error) {
      console.warn('[VideoScriptGen] Could not save debug script JSON:', error)
    }

    return validated
  }

  // ─── Private: Structure ───────────────────────────────────────────────────

  /**
   * Call the LLM and parse the raw JSON response into a structured object.
   *
   * SCORING STRATEGY (replaces hard-fail on every attempt):
   *   Every attempt is scored and stored as a candidate.
   *   At the end, the best-scoring candidate is used — even if imperfect.
   *   A 500 is only thrown if zero valid JSON was ever produced.
   *
   *   Score weights:
   *     0.40 — word count proximity to target
   *     0.25 — fullNarration ↔ scenes consistency
   *     0.25 — per-scene density (no scenes under minimum)
   *     0.10 — basic structure (scenes array, count in range)
   */
  private async generateVideoStructure(
    topic: string,
    options: VideoGenerationOptions,
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>
  ): Promise<{
    titles: string[]
    fullNarration: string
    theme?: string
    topic?: string
    audience?: string
    emotionalArc?: string[]
    scenes: RawScene[]
    backgroundMusic?: string
  }> {
    const effectiveDuration = this.promptManager.getEffectiveDuration(options)

    // ─── PASS 1: NARRATION ONLY ─────────────────────────────────────────────
    console.log(`[VideoScriptGen] Pass 1: Generating narration only (Targeting ~${effectiveDuration}s)...`)
    if (onProgress) await onProgress(5, 'Studio: Crafting narration flow...')

    const { pass1 } = await this.promptManager.buildTwoPassPrompts(topic, options)
    let narrationText = await this.llmService.generateContent(pass1.user, pass1.system)

    if (!narrationText) {
      throw new Error('[VideoScriptGen] Pass 1 failed: LLM returned empty narration')
    }

    // Pass 1 Validation & Optional Retry loop (Up to 2 expansions)
    const MAX_P1_RETRIES = 2
    for (let attempt = 1; attempt <= MAX_P1_RETRIES; attempt++) {
      const validation = this.promptManager.validateNarrationPass(narrationText, options, pass1.targetWords)
      console.log(
        `[VideoScriptGen] Pass 1 Validation (Attempt ${attempt}): ${validation.ok ? 'OK' : 'TOO SHORT'} (${validation.actualWords}/${validation.targetWords} words)`
      )

      if (validation.ok) break

      console.log(
        `[VideoScriptGen] Narration too short (${validation.actualWords}w). Triggering expansion retry ${attempt}/${MAX_P1_RETRIES}...`
      )
      if (onProgress)
        await onProgress(7 + attempt, `Studio: Expanding narration for better depth (Attempt ${attempt})...`)

      const retryUser = this.promptManager.buildNarrationRetryUserPrompt(
        topic,
        narrationText,
        options,
        pass1.targetWords,
        validation.actualWords,
        2 // Mode '2' is continuation
      )
      const continuation = await this.llmService.generateContent(retryUser, pass1.system)

      if (continuation) {
        narrationText = `${narrationText.trim()} ${continuation.trim()}`
      } else {
        break // No more continuation from LLM
      }
    }

    // ─── PASS 2: STRUCTURING ────────────────────────────────────────────────
    console.log(`[VideoScriptGen] Pass 2: Structuring narration into scenes...`)

    const actualWords = narrationText.trim().split(/\s+/).filter(Boolean).length
    const isLongForm = actualWords > 800
    const chunks = isLongForm ? this.splitNarrationIntoChunks(narrationText, 300) : [narrationText]

    let allScenes: any[] = []
    let finalScript: any = null

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i]

      // [AMÉLIO] Context-aware chunking: pass visual summary of previous chunk to next chunk
      const prevChunkEndScene = allScenes.length > 0 ? allScenes.at(-1) : null
      const visualContext = prevChunkEndScene
        ? {
            prevSceneId: prevChunkEndScene.id,
            prevLocation: prevChunkEndScene.locationPrompt || prevChunkEndScene.locationId,
            prevAction: prevChunkEndScene.animationPrompt,
            prevCharacterState: (prevChunkEndScene as any).characterState || 'neutral'
          }
        : undefined

      const chunkContext = {
        chunkIndex: i,
        totalChunks: chunks.length,
        startSceneNumber: allScenes.length + 1,
        visualSummary: visualContext
      }

      const p2 = await this.promptManager.buildPass2Prompts(chunkText, topic, options, chunkContext)

      const MAX_P2_RETRIES = 3
      let chunkResult: any = null

      let bestCandidate: ScriptCandidate | null = null
      let lastFeedback = ''

      for (let attempt = 1; attempt <= MAX_P2_RETRIES; attempt++) {
        try {
          if (onProgress) {
            const step = 20 + (i / chunks.length) * 50 // 20% to 70%
            const msg =
              chunks.length > 1
                ? `Studio: Sculpting scenes part ${i + 1}/${chunks.length}...`
                : attempt > 1
                  ? `Studio: Sculpting scenes (Attempt ${attempt}/3)...`
                  : 'Studio: Sculpting scenes and visual prompts...'
            await onProgress(Math.round(step), msg)
          }
          const promptOverride =
            attempt > 1 && lastFeedback
              ? `${p2.user}\n\n[WARNING: PREVIOUS ATTEMPT FAILED EVALUATION]\n${lastFeedback}`
              : p2.user
          const jsonText = await this.llmService.generateContent(promptOverride, p2.system, 'application/json')
          if (!jsonText) throw new Error('Empty Pass 2 response')

          const parsed = this.parseJsonResponse(jsonText)
          if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
            throw new Error("Missing 'scenes' array in structured output")
          }

          const actualWords = parsed.scenes.reduce(
            (acc: number, s: any) => acc + (s.narration || '').trim().split(/\s+/).filter(Boolean).length,
            0
          )
          const fullWords = chunkText.trim().split(/\s+/).filter(Boolean).length
          const minWords = Math.max(20, Math.floor(fullWords / Math.max(1, parsed.scenes.length)) * 0.75)

          const { score, issues } = scoreCandidate(parsed, fullWords, effectiveDuration / chunks.length, minWords)
          const candidate: ScriptCandidate = { parsed, score, attempt, issues }

          if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = candidate
          }

          if (score >= 0.85) {
            console.log(`[VideoScriptGen] Pass 2 Evaluation: VERY GOOD (Score ${score.toFixed(2)}). Accepting.`)
            break
          } else {
            console.log(
              `[VideoScriptGen] Pass 2 Evaluation: POOR (Score ${score.toFixed(2)}). Attempt ${attempt}/${MAX_P2_RETRIES}. Issues: ${issues.join(', ')}`
            )
            lastFeedback = this.buildValidationFeedback(
              parsed,
              actualWords,
              fullWords,
              fullWords,
              effectiveDuration / chunks.length,
              minWords
            )
            if (attempt === MAX_P2_RETRIES) break
          }
        } catch (error: any) {
          console.warn(`[VideoScriptGen] Pass 2 (Chunk ${i + 1}) attempt ${attempt} failed: ${error.message}`)
          if (attempt === MAX_P2_RETRIES && !bestCandidate) throw error
        }
      }

      if (bestCandidate) {
        chunkResult = bestCandidate.parsed
        if (bestCandidate.score < 0.85) {
          console.warn(
            `[VideoScriptGen] Accepting IMPERFECT candidate (Score ${bestCandidate.score.toFixed(2)}). Issues: ${bestCandidate.issues.join(', ')}`
          )
        }
      }

      if (chunkResult) {
        allScenes = [...allScenes, ...chunkResult.scenes]
        if (!finalScript) finalScript = chunkResult
      }
    }

    finalScript.scenes = allScenes
    finalScript.fullNarration = narrationText
    finalScript.totalWordCount = actualWords
    finalScript.sceneCount = allScenes.length

    // ─── POST-STRUCTURING INTEGRITY ─────────────────────────────────────────

    // 1. Fix fullNarration drift (locked narration rule enforcement)
    const { script: fixedScript, driftFixed, driftWords } = this.promptManager.fixFullNarrationDrift(finalScript)
    if (driftFixed) {
      console.log(`[VideoScriptGen] Fixed fullNarration drift (${driftWords} words corrected)`)
    }

    // 2. Scene-level validation & Micro-corrections (Fix v5)
    if (onProgress) await onProgress(80, 'Studio: Running micro-corrections and quality checks...')
    const refinement = await this.promptManager.validateAndCorrectAllScenes(fixedScript.scenes, {
      complete: async (prompt: string) => {
        return await this.llmService.generateContent(prompt, '', 'application/json')
      }
    })
    fixedScript.scenes = refinement.correctedScenes

    // 3. Final structural assignments
    if (onProgress) await onProgress(95, 'Studio: Finalizing script structure...')
    fixedScript.scenes = this.postProcessScenes(fixedScript.scenes)
    fixedScript.scenes = this.assignTimeRanges(fixedScript.scenes, options)

    if (onProgress) await onProgress(100, 'Studio: Script generation complete!')
    console.log(`[VideoScriptGen] ✓ Two-pass generation complete. Final word count: ${fixedScript.totalWordCount}`)

    return fixedScript
  }

  /**
   * Build a human-readable feedback string summarising the primary validation
   * failures of a parsed attempt. Used as the ⚠️ PREVIOUS ATTEMPT FAILED block
   * injected into the next attempt's user prompt.
   */
  private buildValidationFeedback(
    parsed: any,
    actualWords: number,
    fullNarrationWords: number,
    targetWords: number,
    effectiveDuration: number,
    minWordsPerScene: number
  ): string {
    const lines: string[] = []

    // Word count
    const ratio = actualWords / Math.max(targetWords, 1)
    if (ratio < 0.75) {
      lines.push(
        `TOTAL NARRATION TOO SHORT: The script has only ${actualWords} words, but for a ${Math.round(effectiveDuration)}s video, we require at least ${Math.round(targetWords * 0.75)} words total. PLEASE ELABORATE extensively on every scene.`
      )
    } else if (ratio > 1.15) {
      lines.push(
        `TOTAL NARRATION TOO LONG: The script has ${actualWords} words, but for a ${Math.round(effectiveDuration)}s video, the maximum allowed is ${Math.round(targetWords * 1.15)} words. PLEASE TRIM and CONDENSE your narration significantly.`
      )
    }

    // Narrative consistency
    const drift = fullNarrationWords > 0 ? Math.abs(actualWords - fullNarrationWords) / Math.max(actualWords, 1) : 0
    if (drift > 0.05 && fullNarrationWords > 0) {
      lines.push(
        `NARRATIVE INCONSISTENCY: The 'fullNarration' (${fullNarrationWords} words) does not match the sum of your scene narrations (${actualWords} words). Please ensure they are identical.`
      )
    }

    // Per-scene density
    if (parsed?.scenes) {
      for (const [index, scene] of parsed.scenes.entries()) {
        const narration = scene.narration || ''
        const sceneWords = narration.trim().split(/\s+/).filter(Boolean).length
        const sentences = narration.split(/[.!?]+/).filter((s: string) => s.trim().length > 0)
        const isHook = scene.preset === 'hook' || index === 0
        const baseThreshold = 0.85
        const effectiveMinWords = isHook
          ? Math.max(20, Math.round(minWordsPerScene * 0.3))
          : Math.round(minWordsPerScene * baseThreshold)
        const effectiveMinSentences = isHook ? 2 : minWordsPerScene < 45 ? 2 : 3

        if (sceneWords < effectiveMinWords) {
          lines.push(
            `SCENE DENSITY FAILURE: Scene ${index + 1} (${scene.preset || 'unknown'} preset) is too short (${sceneWords}/${effectiveMinWords} words). ${isHook ? 'Hooks must be percutant but still descriptive.' : 'You MUST expand this scene narration significantly.'}`
          )
        }
        if (sentences.length < effectiveMinSentences) {
          lines.push(
            `STRUCTURAL FAILURE: Scene ${index + 1} has only ${sentences.length}/${effectiveMinSentences} sentences. ${isHook ? 'Even hooks need at least 2 clear sentences.' : `Each scene's narration MUST contain AT LEAST ${effectiveMinSentences} full sentences.`}`
          )
        }
      }
    }

    return lines.join('\n') || 'Unknown validation failure — please review all scene narrations.'
  }

  /**
   * Parse and clean a raw LLM text response into a JS object.
   * Includes a repair phase for truncated JSON (common in long scripts).
   */
  private splitNarrationIntoChunks(text: string, chunkSize: number = 300): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text]
    const chunks: string[] = []
    let currentChunk = ''

    for (const s of sentences) {
      const prospectiveChunk = (currentChunk + s).trim()
      const wordCount = prospectiveChunk.split(/\s+/).length
      if (wordCount > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim())
        currentChunk = s
      } else {
        currentChunk += s
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim())

    return chunks
  }

  private parseJsonResponse(text: string): any {
    if (typeof text === 'object') return text

    let cleaned = (text as string)
      .replaceAll(/```json\n?|\n?```/g, '')
      .replace(/^\uFEFF/, '')
      .replaceAll(/[\u0000-\u0008\v\f\u000E-\u001F\u007F]/g, '')
      .replaceAll(/,\s*([\]}])/g, '$1')
      .trim()

    try {
      return JSON.parse(cleaned)
    } catch {
      // Step 1: Try to extract a JSON block using regex
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0])
        } catch {
          cleaned = jsonMatch[0]
        }
      }

      // Step 2: Attempt to repair truncated JSON (common at end of long generation)
      try {
        const repaired = this.repairJson(cleaned)
        return JSON.parse(repaired)
      } catch (repairError: any) {
        throw new Error(`JSON parsing failed (Repair also failed): ${repairError.message}`)
      }
    }
  }

  /**
   * Simple state-machine repair for truncated JSON.
   * Hardened to handle truncated arrays by removing the last (partially written) element.
   */
  private repairJson(json: string): string {
    let repaired = json.trim()

    // If we're inside a string, close it
    let openQuotes = 0
    for (const char of repaired) if (char === '"') openQuotes++
    if (openQuotes % 2 !== 0) repaired += '"'

    // Remove any trailing fragments like "scenes": [ { "id": "1", ...
    // If the JSON ends with a comma followed by nothing or whitespace, remove the comma
    repaired = repaired.replaceAll(/,\s*$/g, '')

    // If it looks like we cut off mid-array-element
    // Try to backtrack to the last valid object boundary
    const lastObjectClose = repaired.lastIndexOf('}')
    const lastObjectOpen = repaired.lastIndexOf('{')
    const lastArrayOpen = repaired.lastIndexOf('[')

    // If we have an unclosed object at the end of what looks like an array
    if (lastObjectOpen > lastObjectClose && lastArrayOpen < lastObjectOpen) {
      // Cut off the truncated object and the comma preceding it
      repaired = repaired.substring(0, lastObjectOpen).trim().replaceAll(/,\s*$/g, '')
    }

    // [AMÉLIO] Final cleanup: if we end in a key, comma or open bracket/brace, remove it
    // We assume inString is false because we just closed any open quotes above
    repaired = repaired.trim()
    // Remove trailing comma
    repaired = repaired.replace(/,\s*$/, '')
    // Remove trailing "key": or "key": { or "key": [
    // This is safer than just closing them if they're empty/truncated
    repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*[[{]?\s*$/, '')
    repaired = repaired.replace(/"[^"]*"\s*:\s*[[{]?\s*$/, '')
    // Final comma/bracket cleanup
    repaired = repaired.replace(/,\s*$/, '')
    repaired = repaired.replace(/[[{]\s*$/, '')

    // [AMÉLIO] Recalculate stack AFTER cleanup to avoid syntax errors from removed fragments
    const stack: string[] = []
    let finalInString = false
    let finalEscaped = false

    for (const char of repaired) {
      if (finalEscaped) {
        finalEscaped = false
        continue
      }
      if (char === '\\') {
        finalEscaped = true
        continue
      }
      if (char === '"') {
        finalInString = !finalInString
        continue
      }
      if (!finalInString) {
        if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']')
        else if ((char === '}' || char === ']') && stack.length > 0 && stack.at(-1) === char) stack.pop()
      }
    }

    // Close all open braces/brackets
    while (stack.length > 0) {
      repaired += stack.pop()
    }

    return repaired
  }

  // ─── Private: Post-processing ─────────────────────────────────────────────

  /**
   * Run all editorial post-processing passes on raw scenes.
   */
  private postProcessScenes(scenes: RawScene[]): RawScene[] {
    this.deduplicateNarration(scenes)
    this.ensureRequiredFields(scenes)
    return scenes
  }

  /** Clear narration that is identical to the previous scene. */
  private deduplicateNarration(scenes: RawScene[]): void {
    scenes.forEach((scene, idx) => {
      if (idx > 0 && scene.narration && scenes[idx - 1].narration) {
        const cur = scene.narration.trim().toLowerCase()
        const prev = scenes[idx - 1].narration!.trim().toLowerCase()
        if (cur === prev) {
          console.warn(`[VideoScriptGen] Redundant narration in scene ${idx + 1}; clearing duplicate.`)
          scene.narration = ''
        }
      }
    })
  }

  private ensureRequiredFields(scenes: RawScene[]): void {
    scenes.forEach((scene) => {
      if (!scene.narration) scene.narration = ''
    })
  }

  // ─── Private: Time ranges ─────────────────────────────────────────────────

  /**
   * Assign and validate timeRange for every scene, then rescale if the total
   * falls outside [minDuration, maxDuration].
   */
  public assignTimeRanges(scenes: RawScene[], options: VideoGenerationOptions): RawScene[] {
    const targetTotal = options.duration
    const maxScene = typeof options.maxSceneDuration === 'number' ? options.maxSceneDuration : Number.POSITIVE_INFINITY
    const minScene = MIN_SCENE_DURATION
    const overlap = options.audioOverlap ?? 0
    const wps = this.promptManager.getWordsPerSecond(options)

    // Weighted duration distribution
    const suggestions: number[] = scenes.map((scene, idx) => {
      const words = scene.narration ? scene.narration.trim().split(/\s+/).length : 0
      const ctx = scene.contextType as SceneContextType | undefined
      let sugg = suggestSceneDuration(words, ctx, wps, (scene as any).pacing)
      if (!Number.isFinite(sugg)) {
        console.warn(
          `[VideoScriptGen] scene ${scene.sceneNumber || idx + 1} suggestion resulted in NaN; using MIN_SCENE_DURATION`
        )
        sugg = MIN_SCENE_DURATION
      }
      return sugg
    })

    const fallbackDurations = this.buildWeightedDurations(scenes.length, targetTotal, suggestions, minScene, maxScene)

    let cursor = 0
    scenes.forEach((scene, index) => {
      scene.sceneNumber = index + 1
      if (!scene.id) scene.id = `scene-${index + 1}-${Math.random().toString(36).slice(2, 9)}`
      if (!scene.timeRange || typeof scene.timeRange.start !== 'number' || typeof scene.timeRange.end !== 'number') {
        const start = index === 0 ? cursor : Math.max(0, cursor - overlap)
        const end = start + fallbackDurations[index]
        scene.timeRange = { start, end }
      }
      cursor = scene.timeRange.end
    })

    // Rescale if outside bounds
    const lastScene = scenes.at(-1)
    const total = lastScene ? lastScene.timeRange.end : 0

    if (Math.abs(total - options.duration) > 0.1) {
      const desired = options.duration
      const currentDurations = scenes.map((s) => s.timeRange.end - s.timeRange.start)
      const scaled = this.buildWeightedDurations(
        scenes.length,
        desired + (scenes.length - 1) * overlap,
        currentDurations,
        minScene,
        maxScene
      )
      let acc = 0
      scenes.forEach((scene, idx) => {
        const len = scaled[idx]
        const start = idx === 0 ? acc : Math.max(0, acc - overlap)
        scene.timeRange = { start, end: start + len }
        acc = scene.timeRange.end
      })
    }

    return scenes
  }

  /**
   * Distribute a total duration across N scenes using weighted proportions,
   * clamped to [minScene, maxScene].
   */
  private buildWeightedDurations(
    count: number,
    total: number,
    weights: number[],
    minScene: number,
    maxScene: number
  ): number[] {
    total = Math.round(total)
    if (count === 1) return [total]

    const weightSum = weights.reduce((a, b) => a + b, 0)
    const raw = weights.map((w) => (w / (weightSum || 1)) * total)
    const values = raw.map((v) => Math.floor(v))
    const remainder = total - values.reduce((a, b) => a + b, 0)

    const fractions = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac)

    for (let k = 0; k < remainder; k++) values[fractions[k].i]++

    const clamped = values.map((v) => Math.max(minScene, Math.min(maxScene, v)))

    let diff = Math.round(total - clamped.reduce((a, b) => a + b, 0))
    for (let i = 0; i < clamped.length && diff !== 0; i++) {
      if (diff > 0 && clamped[i] < maxScene) {
        const add = Math.min(diff, maxScene - clamped[i])
        clamped[i] += add
        diff -= add
      } else if (diff < 0 && clamped[i] > minScene) {
        const sub = Math.min(-diff, clamped[i] - minScene)
        clamped[i] -= sub
        diff += sub
      }
    }

    if (diff !== 0) clamped[clamped.length - 1] += diff
    return clamped
  }

  // ─── Private: Scene enrichment ────────────────────────────────────────────

  /**
   * Enrich scenes with image and animation prompts.
   */
  private async enrichScenes(
    baseScenes: RawScene[],
    options: VideoGenerationOptions,
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>
  ): Promise<EnrichedScene[]> {
    console.log(`[VideoScriptGen] Enriching ${baseScenes.length} scenes with prompts...`)

    const aspectRatio = options.aspectRatio || '16:9'
    const imageStyle = options.imageStyle

    // Build inter-scene visual memory progressively
    const memoryBuilder = new SceneMemoryBuilder()
    const sceneMemory: import('./scene-memory').SceneMemory = {
      locations: new Map(),
      timeOfDay: '',
      weather: ''
    }

    // Generate image/animation prompts with progressive memory context
    const enriched: EnrichedScene[] = []
    for (let i = 0; i < baseScenes.length; i++) {
      const resolvedScene = baseScenes[i]
      if (onProgress) {
        // Map 10-100% of enrichment phase to the progress range
        const progressVal = 10 + Math.round((i / baseScenes.length) * 90)
        await onProgress(progressVal, `Studio: Refining visuals for scene ${i + 1}/${baseScenes.length}...`)
      }
      // 1. Process this scene into memory FIRST
      memoryBuilder.processScene(resolvedScene as any, sceneMemory)

      const imagePrompt = await this.promptGenerator.generateImagePrompt(
        resolvedScene as EnrichedScene,
        false,
        aspectRatio,
        imageStyle,
        sceneMemory
      )

      const animationPromptText =
        resolvedScene.animationPrompt != null
          ? resolvedScene.animationPrompt
          : this.promptGenerator.generateAnimationPrompt(resolvedScene as EnrichedScene, imageStyle).instructions

      enriched.push({
        ...resolvedScene,
        imagePrompt: imagePrompt.prompt,
        animationPrompt: animationPromptText
      } as EnrichedScene)
    }

    return enriched
  }

  // ─── Public: Export ───────────────────────────────────────────────────────

  /**
   * Export script to markdown format
   */
  exportToMarkdown(script: CompleteVideoScript): string {
    const lines: string[] = []
    lines.push(`# VIDEO PRODUCTION REPORT: ${script.titles[0]}`)

    if (script.titles.length > 1) {
      lines.push(`**Alternative Titles:**`)
      script.titles.slice(1).forEach((t) => lines.push(`- ${t}`))
    }

    lines.push(
      `**Theme:** ${script.theme}`,
      `**Aspect Ratio:** ${script.aspectRatio}`,
      `**Total Duration:** ${script.totalDuration}s (${script.sceneCount} scenes)`,
      `**Generated At:** ${new Date().toLocaleString()}`,
      '',
      '---\n'
    )

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60)
      const secs = Math.round(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    lines.push('## TECHNICAL BREAKDOWN & LAYOUTS\n')

    script.scenes.forEach((scene) => {
      const timeStr = scene.timeRange
        ? `[${formatTime(scene.timeRange.start)} - ${formatTime(scene.timeRange.end)}]`
        : ''
      const numStr = scene.sceneNumber || '?'

      lines.push(`### Scene ${numStr} ${timeStr}`, `- **Narration:** *"${scene.narration || ''}"*`)

      lines.push(
        '\n#### AI Production Prompts',
        `**🖼️ Image Prompt:**\n> ${scene.imagePrompt}`,
        `**🎬 Animation Prompt:**\n> ${scene.animationPrompt}`,
        '',
        '---'
      )
    })

    if (script.backgroundMusic) {
      lines.push(`\n**🎵 Background Music Recommendation:** ${script.backgroundMusic}`)
    }

    return lines.join('\n')
  }
}
