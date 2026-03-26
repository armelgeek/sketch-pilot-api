/* eslint-disable no-control-regex */
import {
  completeVideoScriptSchema,
  MIN_SCENE_DURATION,
  suggestSceneDuration,
  type CharacterSheet,
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
   * Convenience setter — forwards to PromptManager.
   */
  setBackgroundColor(color: string): void {
    this.promptManager.setBackgroundColor(color)
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

    if (onProgress) await onProgress(1, 'Studio: Planning initial structure...')
    const baseScript = await this.generateVideoStructure(topic, options)

    const characterSheets: CharacterSheet[] = baseScript.characterSheets || []

    const enrichedScenes = await this.enrichScenes(baseScript.scenes, options, characterSheets)

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
      characterSheets,
      scenes: enrichedScenes,
      aspectRatio: options.aspectRatio || '16:9',
      backgroundMusic: baseScript.backgroundMusic,
      globalAudio: options.globalAudioPath
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
    options: VideoGenerationOptions
  ): Promise<{
    titles: string[]
    fullNarration: string
    theme?: string
    scenes: RawScene[]
    characterSheets?: CharacterSheet[]
    backgroundMusic?: string
  }> {
    const { systemPrompt, userPrompt } = this.promptManager.buildScriptGenerationPrompts(topic, options)

    console.log(`[VideoScriptGen] Calling LLM for structure...`)

    const MAX_RETRIES = 3
    let parsed: ReturnType<typeof this.parseJsonResponse> | null = null
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[VideoScriptGen] Generation attempt ${attempt}/${MAX_RETRIES}...`)
        const text = await this.llmService.generateContent(userPrompt, systemPrompt, 'application/json')
        if (!text) throw new Error('API returned empty generated content or timeout')

        parsed = this.parseJsonResponse(text)

        if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
          throw new Error("Generated script JSON is missing 'scenes' array")
        }

        // Successfully parsed and validated structure, break loop
        break
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`[VideoScriptGen] Attempt ${attempt} failed: ${lastError.message}`)
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 2000 // Exponential-ish backoff: 2s, 4s
          console.log(`[VideoScriptGen] Waiting ${delay}ms before retrying...`)
          await new Promise((res) => setTimeout(res, delay))
        }
      }
    }

    if (!parsed) {
      console.error('[VideoScriptGen] All retry attempts failed.')
      throw lastError || new Error('Failed to generate video structure after multiple attempts')
    }

    parsed.scenes = this.postProcessScenes(parsed.scenes, parsed.characterSheets || [])
    parsed.scenes = this.assignTimeRanges(parsed.scenes, options)

    return parsed
  }

  /**
   * Parse and clean a raw LLM text response into a JS object.
   */
  private parseJsonResponse(text: unknown): any {
    if (typeof text === 'object') return text

    const cleaned = (text as string)
      .replaceAll(/```json\n?|\n?```/g, '')
      .replace(/^\uFEFF/, '')
      .replaceAll(/[\u0000-\u0008\v\f\u000E-\u001F\u007F]/g, '')
      .replaceAll(/,\s*([\]}])/g, '$1')
      .trim()

    try {
      return JSON.parse(cleaned)
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) return JSON.parse(jsonMatch[0])
      throw new Error(`JSON parsing failed — could not extract valid object from LLM response`)
    }
  }

  // ─── Private: Post-processing ─────────────────────────────────────────────

  /**
   * Run all editorial post-processing passes on raw scenes.
   * Each pass is self-contained and documented.
   */
  private postProcessScenes(scenes: RawScene[], characterSheets: CharacterSheet[]): RawScene[] {
    this.enforceCharacterPresence(scenes, characterSheets)
    this.deduplicateNarration(scenes)
    this.ensureRequiredFields(scenes)
    return scenes
  }

  /**
   * Ensure every scene has at least one character.
   * If the LLM generated a scene with empty characterIds, inject the first character
   * from the character sheets as a fallback (narrator/observer role).
   */
  private enforceCharacterPresence(scenes: RawScene[], characterSheets: CharacterSheet[]): void {
    if (!characterSheets || characterSheets.length === 0) return
    const primaryCharId = characterSheets[0].id || characterSheets[0].name

    scenes.forEach((scene, idx) => {
      const hasChars = Array.isArray(scene.characterIds) && scene.characterIds.length > 0
      if (!hasChars) {
        console.warn(
          `[VideoScriptGen] Scene ${idx + 1} has no characters — injecting primary character "${primaryCharId}" as observer.`
        )
        scene.characterIds = [primaryCharId]
        if (!scene.characterVariant) {
          scene.characterVariant = primaryCharId
        }
      }

      // Phase 30: Minimize complexity by capping at 2 characters maximum unless specifically required.
      if (scene.characterIds && scene.characterIds.length > 2) {
        console.warn(
          `[VideoScriptGen] Scene ${idx + 1} has too many characters (${scene.characterIds.length}); truncating to 2 for visual clarity.`
        )
        scene.characterIds = scene.characterIds.slice(0, 2)
      }
    })
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
  private assignTimeRanges(scenes: RawScene[], options: VideoGenerationOptions): RawScene[] {
    const targetTotal = options.duration ?? options.maxDuration ?? 30
    const maxScene = typeof options.maxSceneDuration === 'number' ? options.maxSceneDuration : Number.POSITIVE_INFINITY
    const minScene = MIN_SCENE_DURATION
    const overlap = options.audioOverlap ?? 0
    const wps = this.promptManager.getWordsPerSecond(options)

    // Weighted duration distribution
    const suggestions: number[] = scenes.map((scene, idx) => {
      const words = scene.narration ? scene.narration.trim().split(/\s+/).length : 0
      const ctx = scene.contextType as SceneContextType | undefined
      let sugg = suggestSceneDuration(words, ctx, wps)
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
   * Enrich scenes with image and animation prompts, and resolve character IDs.
   */
  private async enrichScenes(
    baseScenes: RawScene[],
    options: VideoGenerationOptions,
    characterSheets: CharacterSheet[]
  ): Promise<EnrichedScene[]> {
    console.log(`[VideoScriptGen] Enriching ${baseScenes.length} scenes with prompts...`)

    const aspectRatio = options.aspectRatio || '16:9'
    const imageStyle = options.imageStyle

    // Build char ID → name map
    const charMap: Record<string, string> = {}
    characterSheets.forEach((sheet) => {
      if (sheet.id) charMap[sheet.id] = sheet.name
    })

    const resolveCharacters = (text: string | null | undefined): string => {
      if (!text) return ''
      let resolved = text
      Object.entries(charMap).forEach(([id, desc]) => {
        const regex = new RegExp(`(?<=^|[^a-zA-Z0-9])${id}(?=[^a-zA-Z0-9]|$)`, 'gi')
        resolved = resolved.replace(regex, desc)
      })
      return resolved
    }

    // First pass: resolve all scenes so SceneMemoryBuilder works with resolved names
    const resolvedScenes = baseScenes.map((scene) => ({
      ...scene,
      summary: resolveCharacters(scene.summary || ''),
      narration: resolveCharacters(scene.narration || ''),
      background: resolveCharacters(scene.background || ''),
      characterIds: (scene.characterIds || []).map((id) => charMap[id] || id),
      speakingCharacterId: scene.speakingCharacterId
        ? charMap[scene.speakingCharacterId] || scene.speakingCharacterId
        : undefined,
      characterVariant: scene.characterVariant
        ? charMap[scene.characterVariant] || scene.characterVariant
        : scene.characterVariant
    }))

    // Build inter-scene visual memory progressively
    const memoryBuilder = new SceneMemoryBuilder()
    const sceneMemory: import('./scene-memory').SceneMemory = {
      locations: new Map(),
      characters: new Map(),
      timeOfDay: '',
      weather: ''
    }
    const charDescriptionMap = memoryBuilder.buildCharDescriptionMap(characterSheets)

    // Second pass: generate image/animation prompts with progressive memory context
    return resolvedScenes.map((resolvedScene) => {
      // 1. Process this scene into memory FIRST
      memoryBuilder.processScene(resolvedScene, sceneMemory, charDescriptionMap)

      const imagePrompt = this.promptGenerator.generateImagePrompt(
        resolvedScene as EnrichedScene,
        false,
        aspectRatio,
        imageStyle,
        sceneMemory,
        characterSheets
      )

      const animationPromptText =
        resolvedScene.animationPrompt != null
          ? resolveCharacters(resolvedScene.animationPrompt)
          : this.promptGenerator.generateAnimationPrompt(resolvedScene as EnrichedScene, imageStyle).instructions

      return {
        ...resolvedScene,
        imagePrompt: imagePrompt.prompt,
        animationPrompt: animationPromptText
      } as EnrichedScene
    })
  }

  // ─── Public: Export ───────────────────────────────────────────────────────

  /**
   * Export script to markdown format (PART 1, 2, 3)
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
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    lines.push('## PART 1: CHARACTER SHEETS\n')
    if (script.characterSheets && script.characterSheets.length > 0) {
      script.characterSheets.forEach((char) => {
        lines.push(
          `### ${char.id}: ${char.name} (${char.role})`,
          `- **Appearance:** ${char.appearance.description}`,
          `- **Clothing:** ${char.appearance.clothing}`,
          `- **Expressions:** ${char.expressions.join(', ')}`,
          `**🖼️ Master Reference Prompt:**\n> ${char.imagePrompt}`,
          ''
        )
      })
    } else {
      lines.push('*No recurring characters identified.*')
    }

    lines.push('\n---\n', '## PART 2: TECHNICAL BREAKDOWN & LAYOUTS\n')

    script.scenes.forEach((scene) => {
      lines.push(
        `### Scene ${scene.sceneNumber} [${formatTime(scene.timeRange.start)} - ${formatTime(scene.timeRange.end)}]`,
        `- **Narration:** *"${scene.narration}"*`
      )

      if (scene.poseStyle) {
        const pos = scene.poseStyle.position || 'center'
        const scale = scene.poseStyle.scale || 1
        lines.push(`- **Pose Layout:** ${pos} (scale ${scale})`)
      }

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
