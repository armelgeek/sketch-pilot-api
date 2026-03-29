/* eslint-disable no-control-regex */
import {
  completeVideoScriptSchema,
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
    console.log(`[VideoScriptGen] Generating script for topic: "${topic}"`)

    const baseScript = await this.generateVideoStructure(topic, options, onProgress)
    if (onProgress) await onProgress(10, 'Studio: Script structure finalized. Building visuals...')

    const enrichedScenes = await this.enrichScenes(baseScript.scenes, options, onProgress)

    let actualTotal = enrichedScenes.reduce((acc, s) => {
      const end = s.timeRange?.end
      if (typeof end !== 'number' || isNaN(end)) return acc
      return Math.max(acc, end)
    }, 0)

    if (actualTotal < 1) {
      const fallback = options.minDuration ?? options.maxDuration ?? 1
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

    try {
      return completeVideoScriptSchema.parse(completeScript)
    } catch (validationError: any) {
      console.error('[VideoScriptGen] Schema validation failed:', validationError.errors || validationError.message)
      throw new Error(`Script validation failed: ${validationError.message}`)
    }
  }

  // ─── Private: Structure ───────────────────────────────────────────────────

  /**
   * Call the LLM and parse the raw JSON response into a structured object.
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
    const { systemPrompt, userPrompt } = await this.promptManager.buildScriptGenerationPrompts(topic, options)

    console.log(`[VideoScriptGen] Calling LLM for structure...`)

    const MAX_RETRIES = 5
    let latestParsed: any = null
    let lastError: Error | null = null
    let feedback = ''

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[VideoScriptGen] Generation attempt ${attempt}/${MAX_RETRIES}...`)
        if (onProgress) await onProgress(5, `Studio: Generation progress (Attempt ${attempt}/${MAX_RETRIES})...`)

        const currentUserPrompt =
          attempt === 1
            ? userPrompt
            : `${userPrompt}\n\n⚠️ PREVIOUS ATTEMPT FAILED VALIDATION:\n${feedback}\n\nPlease try again and ENSURE you meet all the requirements, especially the word count and sentence count per scene. You MUST expand each scene narration to meet the minimum word count.`

        const text = await this.llmService.generateContent(currentUserPrompt, systemPrompt, 'application/json')
        if (!text) throw new Error('API returned empty generated content or timeout')

        if (onProgress) await onProgress(8, 'Studio: Validating script structure...')

        const parsed = this.parseJsonResponse(text)

        if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
          throw new Error("Generated script JSON is missing 'scenes' array")
        }

        // --- BREVITY CHECK ---
        const effectiveDuration = this.promptManager.getEffectiveDuration(options)
        const wps = this.promptManager.getWordsPerSecond(options)
        const REAL_TTS_WPS = wps
        // Use the provider-aware safety factor (e.g. 1.05 for Gemini, 1.15 for Kokoro)
        const SAFETY_FACTOR = this.promptManager.getPublicSafetyFactor(options)
        const targetWords = Math.round(effectiveDuration * REAL_TTS_WPS * SAFETY_FACTOR)
        const minSentencesPerScene = 3

        const actualWords = parsed.scenes.reduce(
          (acc: number, s: any) => acc + (s.narration || '').trim().split(/\s+/).filter(Boolean).length,
          0
        )

        const minWordsPerScene = Math.min(150, Math.floor(targetWords / (parsed.scenes.length || 1)))

        console.log(
          `[VideoScriptGen] [VAL_DEBUG] scenes_count=${parsed.scenes.length}, actual_words=${actualWords}, target_words=${targetWords}, min_words/scene=${minWordsPerScene}`
        )

        // 1. Validate density per scene
        for (const [index, scene] of parsed.scenes.entries()) {
          const narration = scene.narration || ''
          const sceneWords = narration.trim().split(/\s+/).filter(Boolean).length
          const sentences = narration.split(/[.!?]+/).filter((s: string) => s.trim().length > 0)
          const isHook = scene.preset === 'hook' || index === 0

          // Preset-aware density validation
          const baseThreshold = effectiveDuration > 300 ? 0.5 : 0.6
          const effectiveMinWords = isHook
            ? Math.max(20, Math.round(minWordsPerScene * 0.3)) // Hooks can be very short (min 20 words)
            : Math.round(minWordsPerScene * baseThreshold)

          if (sceneWords < effectiveMinWords) {
            const errorMsg = `SCENE DENSITY FAILURE: Scene ${index + 1} (${scene.preset || 'unknown'} preset) is too short (${sceneWords}/${effectiveMinWords} words). ${isHook ? 'Hooks must be percutant but still descriptive.' : 'You MUST expand this scene narration significantly.'}`
            console.warn(`[VideoScriptGen] 🚨 [VAL_DEBUG] ${errorMsg}`)
            throw new Error(errorMsg)
          }

          const effectiveMinSentences = isHook ? 2 : minSentencesPerScene
          if (sentences.length < effectiveMinSentences) {
            const errorMsg = `STRUCTURAL FAILURE: Scene ${index + 1} has only ${sentences.length}/${effectiveMinSentences} sentences. ${isHook ? 'Even hooks need at least 2 clear sentences.' : `Each scene's narration MUST contain AT LEAST ${minSentencesPerScene} full sentences.`}`
            console.warn(`[VideoScriptGen] 🚨 [VAL_DEBUG] ${errorMsg}`)
            throw new Error(errorMsg)
          }
        }

        // 2. Validate total word count
        // Thresholds are relaxed vs OpenAI because Gemini tends to be more concise.
        // The goal is catching egregiously short scripts, not micro-optimising density.
        let totalThreshold = 0.75
        if (effectiveDuration > 300) totalThreshold = 0.65
        else if (effectiveDuration > 60) totalThreshold = 0.7

        if (actualWords < targetWords * totalThreshold && effectiveDuration > 30) {
          const errorMsg = `TOTAL NARRATION TOO SHORT: The script has only ${actualWords} words, but for a ${Math.round(effectiveDuration)}s video, we require at least ${Math.round(targetWords * totalThreshold)} words total. PLEASE ELABORATE extensively on every scene.`
          console.warn(`[VideoScriptGen] 🚨 [VAL_DEBUG] ${errorMsg}`)
          throw new Error(errorMsg)
        }

        console.log(`[VideoScriptGen] ✓ Script accepted: ${actualWords}/${targetWords} words.`)
        latestParsed = parsed
        break
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error))
        feedback = lastError.message
        console.warn(`[VideoScriptGen] Attempt ${attempt} failed: ${feedback}`)

        if (attempt < MAX_RETRIES) {
          const delay = 1000 // Fixed short delay for retries to keep it snappy
          console.log(`[VideoScriptGen] Retrying with feedback in ${delay}ms...`)
          await new Promise((res) => setTimeout(res, delay))
        }
      }
    }

    if (!latestParsed) {
      console.error('[VideoScriptGen] All retry attempts failed.')
      throw lastError || new Error('Failed to generate video structure after multiple attempts')
    }

    latestParsed.scenes = this.postProcessScenes(latestParsed.scenes)
    latestParsed.scenes = this.assignTimeRanges(latestParsed.scenes, options)

    return latestParsed
  }

  /**
   * Parse and clean a raw LLM text response into a JS object.
   * Includes a repair phase for truncated JSON (common in long scripts).
   */
  private parseJsonResponse(text: unknown): any {
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
    const targetTotal = options.duration ?? options.maxDuration ?? 30
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
    const minDuration = options.minDuration ?? options.duration ?? targetTotal
    const maxDuration = options.maxDuration ?? options.duration ?? targetTotal

    if (total < minDuration || total > maxDuration) {
      const desired = total < minDuration ? minDuration : maxDuration
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
