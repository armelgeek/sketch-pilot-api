/* eslint-disable no-control-regex */
import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import {
  completeVideoScriptSchema,
  computeSceneCountRange,
  MIN_SCENE_DURATION,
  QualityMode,
  suggestSceneDuration,
  type CompleteVideoScript,
  type EnrichedScene,
  type SceneContextType,
  type VideoGenerationOptions
} from '../types/video-script.types'
import type { LLMService } from '../services/llm'
import { CinematicControlEngine, type CinematicVisuals } from './cinematic-control-engine'
import { StandaloneVideoGenerator } from './generators/standalone-video-generator'
import { SceneMemoryBuilder } from './scene-memory'
import type { VideoGenerator } from './generators/video-generator.abstract'

// ─── Types ────────────────────────────────────────────────────────────────────

type RawScene = EnrichedScene & {
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
 *   wordProximity       0.35 — actual vs target word count within ±40%
 *   narrativeConsistency 0.25 — fullNarration drift ≤2%
 *   noDensityFailure    0.25 — all scenes meet their minimum word density
 *   sceneStructure      0.15 — scenes count close to ideal (heavily penalized if out of min–max)
 *
 * Higher is better. A perfect script scores 1.0.
 */
function scoreCandidate(
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

  // ── 1. Word proximity (0.40) ──────────────────────────────────────────────
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

  // ── 2. Narrative consistency (0.25) ───────────────────────────────────────
  // REMOVED: Managed automatically by backend, LLM doesn't need to be penalized for drift.
  score += 0.25

  // ── 3. Scene density (0.25) ───────────────────────────────────────────────
  let densityIntegrity = 0
  for (const [index, scene] of parsed.scenes.entries()) {
    const narration = scene.narration || ''
    const sceneWords = narration.trim().split(/\s+/).filter(Boolean).length
    const isHook = scene.preset === 'hook' || index === 0
    const baseThreshold = 0.85
    const effectiveMinWords = isHook
      ? Math.max(15, Math.round(minWordsPerScene * 0.3))
      : Math.round(minWordsPerScene * baseThreshold)

    const sceneRatio = Math.min(1, sceneWords / Math.max(effectiveMinWords, 1))

    // If it's very close (>= 90%), give it a pass or very high score
    // If it's below 90%, start penalizing linearly
    const sceneScore = sceneRatio >= 0.9 ? 1 : sceneRatio
    densityIntegrity += sceneScore

    if (sceneRatio < 0.9) {
      issues.push(`Scene ${index + 1} (${scene.preset || 'unknown'}) too short: ${sceneWords}/${effectiveMinWords}w`)
    }
  }
  const densityScore = (densityIntegrity / Math.max(parsed.scenes.length, 1)) ** 2
  score += densityScore * 0.25

  // ── 4. Scene structure (0.10) ─────────────────────────────────────────────
  const range = computeSceneCountRange(effectiveDuration)
  const sceneCount = parsed.scenes.length

  // Strict structure score: deviation from ideal is penalized harshly outside min–max bounds
  const sceneDiff = Math.abs(sceneCount - range.ideal)
  let structureScore = Math.max(0, 1 - (sceneDiff / Math.max(range.ideal, 1)) * 2)
  // Hard penalty: if count is completely outside min–max, cap at 0.2
  if (sceneCount < range.min || sceneCount > range.max) {
    structureScore = Math.min(structureScore, 0.2)
  }
  score += structureScore * 0.15

  if (sceneCount < range.min) issues.push(`Too few scenes: ${sceneCount} (min=${range.min})`)
  if (sceneCount > range.max) issues.push(`Too many scenes: ${sceneCount} (max=${range.max})`)

  // ── 5. Visual integrity (0.15) ───────────────────────────────────────────
  let visualIntegrity = 0
  for (const [index, scene] of parsed.scenes.entries()) {
    const hasTransition = (scene.transition && scene.transition !== 'none') || index === parsed.scenes.length - 1
    const hasCamera = scene.cameraAction && scene.cameraAction !== 'none' && scene.cameraAction !== 'static'

    if (hasTransition) visualIntegrity += 0.5
    if (hasCamera) visualIntegrity += 0.5

    if (!hasTransition && index < parsed.scenes.length - 1) {
      issues.push(`Scene ${index + 1} missing transition`)
    }
    if (!hasCamera) {
      issues.push(`Scene ${index + 1} missing camera action`)
    }
  }
  const visualScore = visualIntegrity / Math.max(parsed.scenes.length, 1)
  score += visualScore * 0.15

  return { score, issues }
}

// ─── VideoScriptGenerator ────────────────────────────────────────────────────

/**
 * Video script generator using Gemini AI
 */
export class VideoScriptGenerator {
  private readonly llmService: LLMService
  readonly promptManager: VideoGenerator
  private readonly cinematicEngine: CinematicControlEngine

  constructor(llmService: LLMService, promptManager?: VideoGenerator) {
    this.llmService = llmService
    this.promptManager = promptManager ?? new StandaloneVideoGenerator()
    this.cinematicEngine = new CinematicControlEngine()
  }

  /**
   * Helper to periodically increment progress while waiting for an async task.
   */
  private async withPulse(
    start: number,
    end: number,
    message: string,
    onProgress: ((p: number, m: string) => Promise<void>) | undefined,
    task: () => Promise<any>
  ): Promise<any> {
    if (!onProgress) return task()

    let current = start
    const interval = setInterval(() => {
      if (current < end - 1) {
        current += 1
        onProgress(current, message).catch(() => {})
      }
    }, 800)

    try {
      const result = await task()
      return result
    } finally {
      clearInterval(interval)
      await onProgress(end, message)
    }
  }

  /**
   * Generate a complete video script from a topic.
   */
  async generateCompleteScript(
    topic: string,
    options: VideoGenerationOptions,
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>
  ): Promise<CompleteVideoScript> {
    console.log(`[VideoScriptGen] Generating script for topic: "${topic}"`)

    const baseScript = await this.generateVideoStructure(topic, options, onProgress)
    console.log('BASSE SCRIPT', baseScript)
    if (onProgress) await onProgress(10, 'Studio: Script structure finalized. Building visuals...')

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
      type: this.promptManager.getType(),
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
      emotionalArc: baseScript.emotionalArc,
      seriesMetadata: (baseScript as any).seriesMetadata
    }

    // 4. Final safety pass on transitions just before Zod
    this.normalizeTransitions(completeScript.scenes)

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

  // ─── Gemini Vision: Multi-modal Reasoning ───────────────────────────────────

  private async fetchAndEncodeImage(url: string | undefined): Promise<{ data: string; mimeType: string } | undefined> {
    if (!url) return undefined
    try {
      if (url.startsWith('http')) {
        const response = await axios.get(url, { responseType: 'arraybuffer' })
        const mimeType = response.headers['content-type'] || 'image/webp'
        return { data: Buffer.from(response.data, 'binary').toString('base64'), mimeType }
      } else if (url.length < 500 && fs.existsSync(url)) {
        const ext = path.extname(url).slice(1) || 'webp'
        return { data: fs.readFileSync(url).toString('base64'), mimeType: `image/${ext}` }
      }
      return undefined
    } catch (error) {
      console.warn(`[VideoScriptGen] 👁️  Vision: Failed to fetch/encode bridge image:`, error)
      return undefined
    }
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
    seriesMetadata?: any
  }> {
    const isHighQuality = options.qualityMode === QualityMode.HIGH_QUALITY
    const isStandard = options.qualityMode === QualityMode.STANDARD || !options.qualityMode
    const isLowCost = options.qualityMode === QualityMode.LOW_COST
    const effectiveDuration = this.promptManager.getEffectiveDuration(options)

    // ─── OPTION A: UNIFIED SINGLE-PASS (EXPRESS/STANDARD) ─────────────────────
    // For standard or low-cost, we now use a single pass to generate both
    // script structure and visual prompts (image/animation) at once.
    if (isLowCost || isStandard) {
      const modeName = isLowCost ? 'EXPRESS (Low-Cost)' : 'UNIFIED (Standard)'
      console.log(`[VideoScriptGen] 🚀 ${modeName} MODE: Single-pass script generation...`)
      if (onProgress)
        await onProgress(5, `Studio: Generating ${isStandard ? 'standard' : 'express'} script & visuals...`)

      const bridgeImage = (this.promptManager as any).seriesContext?.lastEpisodeFinalImage
      const encodedBridge = await this.fetchAndEncodeImage(bridgeImage)
      if (encodedBridge) {
        console.info(`[VideoScriptGen] 👁️  VISION ACTIVATE: Bridging with final frame of previous episode.`)
      }

      const prompts = await this.promptManager.buildScriptGenerationPrompts(topic, options)
      const jsonText = await this.withPulse(
        5,
        12,
        `Studio: Generating ${isStandard ? 'standard' : 'express'} script & visuals...`,
        onProgress,
        () =>
          this.llmService.generateContent(
            prompts.userPrompt,
            prompts.systemPrompt,
            'application/json',
            encodedBridge ? [encodedBridge] : undefined
          )
      )
      console.log(`[VideoScriptGen] 🔮 RAW AI RESPONSE:\n${jsonText}\n-------------------`)
      const parsed = this.parseJsonResponse(jsonText)

      // Basic structural assignments
      if (!parsed.scenes) {
        console.warn('[VideoScriptGen] ⚠️ AI response is missing "scenes" array. Raw object keys:', Object.keys(parsed))
        parsed.scenes = []
      }
      parsed.scenes = this.postProcessScenes(parsed.scenes, options)

      parsed.scenes = this.assignTimeRanges(parsed.scenes, options)
      return parsed
    }

    // ─── PASS 1: NARRATION ONLY ─────────────────────────────────────────────
    console.log(`[VideoScriptGen] Pass 1: Generating narration only (Targeting ~${effectiveDuration}s)...`)
    if (onProgress) await onProgress(5, 'Studio: Crafting narration flow...')

    const bridgeImage = (this.promptManager as any).seriesContext?.lastEpisodeFinalImage
    const encodedBridge = await this.fetchAndEncodeImage(bridgeImage)

    const { pass1 } = this.promptManager.buildTwoPassPrompts(topic, options)
    if (onProgress) await onProgress(6, 'Studio: Initializing narration pass...')

    let narrationText = await this.withPulse(6, 10, 'Studio: Crafting narration flow...', onProgress, () =>
      this.llmService.generateContent(
        pass1.user,
        pass1.system,
        'application/json',
        encodedBridge ? [encodedBridge] : undefined
      )
    )

    if (!narrationText) {
      throw new Error('[VideoScriptGen] Pass 1 failed: LLM returned empty narration')
    }

    // Attempt to parse if it's supposed to be structured (for Series v18.0)
    let validatedNarration = narrationText
    let visualSegments: any[] | undefined = undefined
    let parsedPass1: any = undefined

    if (this.promptManager.getType() === 'series') {
      try {
        parsedPass1 = this.parseJsonResponse(narrationText)
        if (parsedPass1 && typeof parsedPass1 === 'object' && parsedPass1.fullNarration) {
          validatedNarration = parsedPass1.fullNarration
          visualSegments = parsedPass1.visualSegments
          console.log(`[VideoScriptGen] Pass 1: Semantic Segmentation detected (${visualSegments?.length} segments).`)
        } else if (Array.isArray(parsedPass1)) {
          // Fallback legacy array of beats
          validatedNarration = parsedPass1.join(' ')
        }
      } catch {
        console.warn('[VideoScriptGen] Failed to parse Pass 1 narration as structured JSON, using raw text.')
      }
    }

    // Pass 1 Validation & Optional Retry
    let validation = this.promptManager.validateNarrationPass(validatedNarration, options, pass1.targetWords)
    if (onProgress) await onProgress(7, 'Studio: Validating narration flow...')

    console.log(
      `[VideoScriptGen] Pass 1 Validation: ${validation.ok ? 'OK' : 'TOO SHORT'} (${validation.actualWords}/${validation.targetWords} words)`
    )

    if (!validation.ok) {
      console.log(`[VideoScriptGen] Narration too short. Triggering one-time expansion retry...`)
      if (onProgress) await onProgress(8, 'Studio: Expanding narration for better depth...')

      const retryUser = this.promptManager.buildNarrationRetryUserPrompt(
        topic,
        narrationText,
        options,
        pass1.targetWords,
        validation.actualWords,
        2
      )
      const continuation = await this.llmService.generateContent(retryUser, pass1.system)

      if (continuation) {
        // Append the continuation to the original text
        narrationText = `${narrationText.trim()} ${continuation.trim()}`
        validation = this.promptManager.validateNarrationPass(narrationText, options, pass1.targetWords)
        console.log(
          `[VideoScriptGen] Pass 1 Retry Validation: ${validation.ok ? 'OK' : 'STILL SHORT'} (${validation.actualWords}/${validation.targetWords} words)`
        )

        // Final narration check (Fix v8-no-fail)
        const warningThreshold = pass1.targetWords * 0.9

        if (narrationText.length < 50) {
          // Only warn if it's practically empty
          console.warn(`[VideoScriptGen] ⚠️ Narration is effectively empty. Proceeding anyway.`)
        }

        if (validation.actualWords < warningThreshold) {
          console.warn(
            `[VideoScriptGen] ⚠️ Narration is shorter than target (${validation.actualWords}/${validation.targetWords} words). Proceeding anyway to save tokens.`
          )
          if (onProgress) await onProgress(9, 'Studio: Proceeding with available narration...')
        }
      }
    } else {
      if (onProgress) await onProgress(10, 'Studio: Narration flow approved.')
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
      const chunkContext = isLongForm
        ? {
            chunkIndex: i,
            totalChunks: chunks.length,
            startSceneNumber: allScenes.length + 1
          }
        : undefined

      const p2 = this.promptManager.buildPass2Prompts(
        visualSegments ? JSON.stringify(parsedPass1) : chunkText,
        topic,
        options,
        chunkContext
      )

      const MAX_P2_RETRIES = isHighQuality ? 2 : 1
      let chunkResult: any = null

      let bestCandidate: ScriptCandidate | null = null
      let lastFeedback = ''

      for (let attempt = 1; attempt <= MAX_P2_RETRIES; attempt++) {
        try {
          if (onProgress) {
            const step = 12 + (i / chunks.length) * 50
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

          const stepMsg =
            chunks.length > 1
              ? `Studio: Sculpting scenes part ${i + 1}/${chunks.length}...`
              : attempt > 1
                ? `Studio: Sculpting scenes (Attempt ${attempt}/3)...`
                : 'Studio: Sculpting scenes and visual prompts...'

          const baseStep = 12 + (i / chunks.length) * 50
          const nextStep = 12 + ((i + 1) / chunks.length) * 50

          const jsonText = await this.withPulse(Math.round(baseStep), Math.round(nextStep), stepMsg, onProgress, () =>
            this.llmService.generateContent(
              promptOverride,
              p2.system,
              'application/json',
              encodedBridge ? [encodedBridge] : undefined
            )
          )
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

          const { score: baseScore, issues: structuralIssues } = scoreCandidate(
            parsed,
            fullWords,
            effectiveDuration / chunks.length,
            minWords
          )

          // --- Hardcore Semantic Audit ---
          const auditReport = this.promptManager.auditScript(parsed)
          const semanticIssues = auditReport.issues || []

          // Semantic fail is a heavy penalty (0.4)
          const semanticPenalty = auditReport.isValid ? 0 : 0.4
          const score = Math.max(0, baseScore - semanticPenalty)

          const issues = [...structuralIssues, ...semanticIssues]
          const candidate: ScriptCandidate = { parsed, score, attempt, issues }

          if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = candidate
          }

          if (score >= 0.7 && auditReport.isValid) {
            console.log(`[VideoScriptGen] Pass 2 Evaluation: GOOD (Score ${score.toFixed(2)}). Accepting.`)
            break
          } else {
            console.log(
              `[VideoScriptGen] Pass 2 Evaluation: ${auditReport.isValid ? 'STRUCTURAL POOR' : 'HALLUCINATION'} (Score ${score.toFixed(2)}). Attempt ${attempt}/${MAX_P2_RETRIES}.`
            )

            const baseFeedback = this.buildValidationFeedback(
              parsed,
              actualWords,
              fullWords,
              fullWords,
              effectiveDuration / chunks.length,
              minWords
            )

            // Inject sentinel correction prompt if it exists
            const sentinelFeedback = auditReport.feedback ? `\n\n${auditReport.feedback}` : ''
            lastFeedback = `${baseFeedback}${sentinelFeedback}`

            if (attempt === MAX_P2_RETRIES) break
          }
        } catch (error: any) {
          console.warn(`[VideoScriptGen] Pass 2 (Chunk ${i + 1}) attempt ${attempt} failed: ${error.message}`)
          if (attempt === MAX_P2_RETRIES && !bestCandidate) throw error
        }
      }

      if (bestCandidate) {
        chunkResult = bestCandidate.parsed
        if (bestCandidate.score < 0.7) {
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
    if (onProgress) await onProgress(65, 'Studio: Running micro-corrections...')

    const refinement = await this.promptManager.validateAndCorrectAllScenes(
      fixedScript.scenes,
      options,
      isHighQuality
        ? {
            complete: async (prompt: string) => {
              return await this.llmService.generateContent(prompt, '', 'application/json')
            }
          }
        : undefined
    )
    if (onProgress) await onProgress(85, 'Studio: Refinement complete.')
    fixedScript.scenes = refinement.correctedScenes

    // 3. Final structural assignments
    if (onProgress) await onProgress(90, 'Studio: Finalizing script structure...')

    // Apply cinematic logic (Rule 44/45)
    this.applyCinematicVisuals(fixedScript.scenes)

    fixedScript.scenes = this.postProcessScenes(fixedScript.scenes, options)

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

        const hasTransition = (scene.transition && scene.transition !== 'none') || index === parsed.scenes.length - 1
        const hasCamera = scene.cameraAction && scene.cameraAction !== 'none' && scene.cameraAction !== 'static'
        if (!hasTransition) {
          lines.push(
            `VISUAL FAILURE: Scene ${index + 1} is missing a mandatory transition to the next scene. Use a transition like "fade", "dissolve", "slide-left", etc.`
          )
        }
        if (!hasCamera) {
          lines.push(
            `VISUAL FAILURE: Scene ${index + 1} is missing a mandatory cameraAction. Use a motion like "zoom-in", "pan-right", etc.`
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

    const stack: string[] = []
    let inString = false
    let escaped = false

    for (const char of repaired) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = !inString
        continue
      }
      if (!inString) {
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
  private postProcessScenes(scenes: RawScene[], options: VideoGenerationOptions): RawScene[] {
    this.applyAutoVisuals(scenes)
    this.deduplicateNarration(scenes)
    this.deduplicateVisuals(scenes)
    this.normalizeTransitions(scenes)

    // Map pacing to tension for the VideoAssembler
    scenes.forEach((scene) => {
      if (!(scene as any).tension) {
        ;(scene as any).tension = this.pacingToTension(scene.pacing || 'medium')
      }
    })

    this.ensureRequiredFields(scenes)
    return scenes
  }

  private pacingToTension(pacing: string): number {
    if (pacing === 'fast') return 8
    if (pacing === 'slow') return 2
    return 5
  }

  /**
   * Automatically assign transitions and camera movements to scenes that lack them
   * using the specialized CinematicControlEngine.
   */
  private applyCinematicVisuals(scenes: RawScene[]): void {
    const history: CinematicVisuals[] = []

    scenes.forEach((scene, idx) => {
      const visuals = this.cinematicEngine.suggestVisuals(scene as any, idx, scenes.length, history)

      // Update scene with suggested visuals if they are missing
      const currentCam = (this.cinematicEngine as any).getCameraType(scene.cameraAction)
      if (!scene.cameraAction || currentCam === 'none' || currentCam === 'static') {
        scene.cameraAction = visuals.cameraAction as any
      }

      if (!scene.transition || scene.transition === 'none') {
        scene.transition = visuals.transition as any
      }

      history.push(visuals)
    })

    // Final deduplication pass
    this.cinematicEngine.deduplicate(scenes as any)
  }

  private applyAutoVisuals(scenes: RawScene[]): void {
    // Legacy mapping - now handled by applyCinematicVisuals
    this.applyCinematicVisuals(scenes)
  }

  /** Algorithmic safety: ensure variety in camera moves and transitions. */
  private deduplicateVisuals(scenes: RawScene[]): void {
    this.cinematicEngine.deduplicate(scenes as any)
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

  private normalizeTransitions(scenes: RawScene[]): void {
    scenes.forEach((scene) => {
      if (!scene.transition) return
      let t = String(scene.transition).toLowerCase().trim()
      // Normalize common separators
      t = t.replaceAll('-', ' ').replaceAll('_', ' ').replaceAll(/\s+/g, ' ')

      const mapping: Record<string, string> = {
        cut: 'none',
        'cut to black': 'fade-black',
        'cut to white': 'fade-white',
        'fade black': 'fade-black',
        'fade white': 'fade-white',
        'cross fade': 'crossfade',
        crossfade: 'crossfade',
        'swipe left': 'wipe-left',
        'swipe right': 'wipe-right',
        'swipe up': 'wipe-up',
        'swipe down': 'wipe-down',
        'push left': 'slide-left',
        'push right': 'slide-right',
        'push up': 'slide-up',
        'push down': 'slide-down',
        zoom: 'zoom-in',
        zoomin: 'zoom-in',
        'zoom in': 'zoom-in',
        'zoom out': 'zoom-out',
        zoomout: 'zoom-out',
        slideright: 'slide-right',
        slideleft: 'slide-left',
        wiperight: 'wipe-right',
        wipeleft: 'wipe-left',
        fadeblack: 'fade-black',
        fadewhite: 'fade-white'
      }

      if (mapping[t]) {
        console.log(`[VideoScriptGen] 🩹 Normalizing transition: "${scene.transition}" -> "${mapping[t]}"`)
        scene.transition = mapping[t] as any
      }
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
      if (!scene.id) scene.id = `scene-${index + 1}-${Date.now().toString(36)}-${index}`
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

    // 1. Process ALL scenes into memory FIRST (synchronous and fast)
    baseScenes.forEach((s) => memoryBuilder.processScene(s as any, sceneMemory))

    // 2. Generate prompts in PARALLEL (only for scenes lacking them)
    const enriched = await Promise.all(
      baseScenes.map(async (resolvedScene, i) => {
        // If the scene already has prompts (Unified Pass), skip LLM/Template generation
        if (resolvedScene.imagePrompt && resolvedScene.animationPrompt) {
          return resolvedScene as EnrichedScene
        }

        if (onProgress) {
          const progressVal = 10 + Math.round((i / baseScenes.length) * 90)
          await onProgress(progressVal, `Studio: Refining visuals for scene ${i + 1}/${baseScenes.length}...`)
        }

        const imagePrompt = resolvedScene.imagePrompt
          ? { prompt: resolvedScene.imagePrompt }
          : await this.promptManager.buildImagePrompt(resolvedScene as EnrichedScene, false, aspectRatio, sceneMemory)

        const animationPromptText =
          resolvedScene.animationPrompt != null
            ? resolvedScene.animationPrompt
            : this.promptManager.buildAnimationPrompt(resolvedScene as EnrichedScene, imageStyle).instructions

        return {
          ...resolvedScene,
          imagePrompt: imagePrompt.prompt,
          animationPrompt: animationPromptText
        } as EnrichedScene
      })
    )

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
        `**🎥 Camera Action:** ${
          scene.cameraAction
            ? typeof scene.cameraAction === 'object'
              ? (scene.cameraAction as any).type
              : scene.cameraAction
            : 'static'
        }`,
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
