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
    // PromptGenerator shares the same PromptManager so configuration is consistent.
    this.promptGenerator = new PromptGenerator(this.promptManager)
  }

  /**
   * Convenience setter — forwards to PromptManager.
   */
  setBackgroundColor(color: string): void {
    this.promptManager.setBackgroundColor(color)
  }

  /**
   * Generate a complete video script from a topic
   */
  async generateCompleteScript(topic: string, options: VideoGenerationOptions): Promise<CompleteVideoScript> {
    console.log(`[VideoScriptGen] Generating script for topic: "${topic}"`)

    // Step 1: Generate base structure with narration
    const baseScript: any = await this.generateVideoStructure(topic, options)

    // Step 2: Use auto-discovered characters from the LLM
    const characterSheets: any[] = baseScript.characterSheets || []

    // Step 3: Enrich scenes with detailed prompts
    let enrichedScenes = await this.enrichScenes(baseScript.scenes, options, characterSheets)

    // enforce eyelineMatch default and progressive zoom-in for revelation area
    const totalDuration = enrichedScenes.reduce((acc: number, s: any) => {
      const end = s.timeRange?.end
      return typeof end === 'number' ? Math.max(acc, end) : acc
    }, 0)

    enrichedScenes = enrichedScenes.map((scene, idx) => {
      // default eyeline
      if (!scene.eyelineMatch) {
        scene.eyelineMatch = 'center'
      }
      // if this scene falls into revelation range, add zoom-in (include timestamp)
      const startRatio = scene.timeRange.start / totalDuration
      if (startRatio >= 0.3 && startRatio <= 0.5) {
        scene.cameraAction = scene.cameraAction || {
          type: 'zoom-in',
          intensity: 'high',
          duration: (scene.timeRange.end - scene.timeRange.start) * 0.5,
          timestamp: 0
        }
      }
      return scene
    })

    // assemble complete script
    // compute actual total guarding against NaN
    let actualTotal = enrichedScenes.reduce((acc: number, s: any) => {
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
      scenes: enrichedScenes as any[],
      aspectRatio: options.aspectRatio || '16:9',
      backgroundMusic: baseScript.backgroundMusic
    }

    // Validate with Zod and return
    try {
      return completeVideoScriptSchema.parse(completeScript)
    } catch (validationError: any) {
      console.error('[VideoScriptGen] Schema validation failed:', validationError.errors || validationError.message)
      throw new Error(`Script validation failed: ${validationError.message}`)
    }
  }

  /**
   * Generate the basic video structure with scenes
   */
  private async generateVideoStructure(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{
    titles: string[]
    fullNarration: string
    theme?: string
    scenes: Array<Omit<EnrichedScene, 'imagePrompt' | 'animationPrompt'> & { animationPrompt?: string }>
    backgroundMusic?: string
  }> {
    const { systemPrompt, userPrompt } = this.promptManager.buildScriptGenerationPrompts(topic, options)

    console.log(`[VideoScriptGen] Calling LLM for structure...`)

    const text = await this.llmService.generateContent(userPrompt, systemPrompt, 'application/json')
    if (!text) {
      throw new Error('Failed to generate video structure')
    }

    let parsed: any
    if (typeof text === 'object') {
      parsed = text
    } else {
      try {
        // Clean markdown blocks if present
        let cleaned = text.replaceAll(/```json\n?|\n?```/g, '').trim()

        // Additional cleaning: remove BOM and other control characters
        cleaned = cleaned.replace(/^\uFEFF/, '') // Remove BOM
        cleaned = cleaned.replaceAll(/[\u0000-\u0008\v\f\u000E-\u001F\u007F]/g, '') // Remove control chars

        // Fix common issues with JSON
        // Handle trailing commas (common LLM error)
        cleaned = cleaned.replaceAll(/,\s*([\]}])/g, '$1')

        // Attempt to parse
        try {
          parsed = JSON.parse(cleaned)
        } catch (parseError) {
          // If parsing fails, try to find the JSON object and extract it
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0])
          } else {
            throw parseError
          }
        }
      } catch (error) {
        console.error('[VideoScriptGen] Failed to parse JSON. Raw text:', text.substring(0, 500))
        throw new Error(`JSON parsing failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
      console.error('[VideoScriptGen] Invalid response structure:', text)
      throw new Error("Generated script JSON is missing 'scenes' array")
    }

    // Post-process: avoid identical props in consecutive scenes
    parsed.scenes.forEach((scene: any, idx: number) => {
      if (idx > 0 && scene.props && Array.isArray(scene.props)) {
        const prev = parsed.scenes[idx - 1]
        if (prev.props && Array.isArray(prev.props)) {
          scene.props = scene.props.filter((p: any) => !prev.props.includes(p))
          if (scene.props.length === 0) delete scene.props
        }
      }
    })

    // Post-process: enforce max 3 props per scene to avoid visual overload
    parsed.scenes.forEach((scene: any, idx: number) => {
      if (scene.props && Array.isArray(scene.props) && scene.props.length > 3) {
        console.warn(`[VideoScriptGen] Scene ${idx + 1} has more than 3 props; truncating.`)
        scene.props = scene.props.slice(0, 3)
      }
    })

    // Post-process: eliminate redundant narration between adjacent scenes
    parsed.scenes.forEach((scene: any, idx: number) => {
      if (idx > 0 && scene.narration && parsed.scenes[idx - 1].narration) {
        const cur = scene.narration.trim().toLowerCase()
        const prev = parsed.scenes[idx - 1].narration.trim().toLowerCase()
        if (cur === prev) {
          console.warn(`[VideoScriptGen] Redundant narration in scene ${idx + 1}; clearing duplicate.`)
          scene.narration = ''
        }
      }
    })

    // 1. Example Tracking (Capture original proper nouns/numbers)
    const pendingExamples: string[] = []
    parsed.scenes.forEach((scene: any) => {
      if (!scene.narration) return
      const text = scene.narration
      const matches = text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b|\b\d+\b/g)
      if (matches) {
        matches.forEach((m: string) => {
          if (pendingExamples.includes(m)) {
            const i = pendingExamples.indexOf(m)
            if (i !== -1) pendingExamples.splice(i, 1)
          } else {
            pendingExamples.push(m)
          }
        })
      }
    })

    // 3. Narrative rhythm & cleanup
    const wordCounts = parsed.scenes.map((s: any) => (s.narration ? s.narration.trim().split(/\s+/).length : 0))
    const denseThreshold = 15
    for (let i = 1; i < parsed.scenes.length; i++) {
      if (wordCounts[i - 1] > denseThreshold && wordCounts[i] > denseThreshold) {
        const tokens = parsed.scenes[i].narration.trim().split(/\s+/)
        const shortened = tokens.slice(0, Math.min(10, tokens.length)).join(' ')
        parsed.scenes[i].narration = shortened.endsWith('.') ? shortened : `${shortened}.`
      }
    }

    // Post-process: handle rhetorical question continuity and limit
    const openQuestions: string[] = []
    const answerKeywords = /\b(because|so|therefore|the answer|which means|thus|hence|here's why)\b/i
    parsed.scenes.forEach((scene: any) => {
      if (!scene.narration) return
      const text = scene.narration
      // close any open question if answer keyword appears
      if (answerKeywords.test(text) && openQuestions.length > 0) {
        openQuestions.shift()
      }
      // find questions
      const qs = text.match(/[^?]*\?/g)
      if (qs) {
        qs.forEach((q: any) => openQuestions.push(q.trim()))
      }
      // enforce limit 2
      while (openQuestions.length > 2) {
        console.warn(`[VideoScriptGen] More than 2 open questions; closing oldest.`)
        // convert first open question into statement by removing '?' and prefixing
        const stmt = openQuestions.shift()?.replace(/\?$/, '') || ''
        scene.narration = `${stmt}. 
${scene.narration}`
      }
    })

    // Post-process: ensure every sound effect has a unique ID
    parsed.scenes.forEach((scene: any, idx: number) => {
      if (scene.soundEffects && Array.isArray(scene.soundEffects)) {
        scene.soundEffects.forEach((sfx: any, sfxIdx: number) => {
          if (!sfx.id) {
            sfx.id = `sfx-${scene.sceneNumber || idx + 1}-${sfxIdx + 1}-${Math.random().toString(36).slice(2, 9)}`
          }
        })
      }
    })

    // Safety check for timeRange (sometimes LLMs skip it)
    const targetTotal = options.duration ?? options.maxDuration ?? 30
    const maxScene = typeof options.maxSceneDuration === 'number' ? options.maxSceneDuration : Number.POSITIVE_INFINITY
    const minScene = MIN_SCENE_DURATION

    // enforce contextType is valid and normalize common synonyms
    const validContexts = new Set<SceneContextType>([
      'quick-list',
      'transition',
      'story',
      'explanation',
      'detailed-breakdown',
      'conclusion'
    ])
    const contextMap: Record<string, SceneContextType> = {
      hook: 'story',
      revelation: 'explanation',
      intro: 'transition',
      outro: 'conclusion'
    }
    parsed.scenes.forEach((scene: any, idx: number) => {
      if (scene.contextType && !validContexts.has(scene.contextType)) {
        const key = String(scene.contextType).toLowerCase()
        if (contextMap[key]) {
          console.warn(
            `[VideoScriptGen] Mapping unknown contextType "${scene.contextType}" in scene ${idx + 1} to "${contextMap[key]}"`
          )
          scene.contextType = contextMap[key]
        } else {
          console.warn(`[VideoScriptGen] Dropping invalid contextType "${scene.contextType}" in scene ${idx + 1}`)
          delete scene.contextType
        }
      }
    })

    // incorporate our suggestions (based on narration) when calculating fallbacks
    const wps = this.promptManager.getWordsPerSecond(options)
    const suggestions: number[] = parsed.scenes.map((scene: any, idx: number) => {
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

    const buildWeightedDurations = (count: number, total: number, weights: number[]): number[] => {
      if (count === 1) return [total]
      const weightSum = weights.reduce((a, b) => a + b, 0)
      const raw = weights.map((w) => (w / (weightSum || 1)) * total)
      const values = raw.map((v) => Math.floor(v))
      const remainder = total - values.reduce((a, b) => a + b, 0)
      const fractions = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac)
      for (let k = 0; k < remainder; k++) values[fractions[k].i]++
      const clamped = values.map((v) => Math.max(minScene, Math.min(maxScene, v)))
      let diff = total - clamped.reduce((a, b) => a + b, 0)
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

    const fallbackDurations = buildWeightedDurations(parsed.scenes.length, targetTotal, suggestions)

    let cursor = 0
    const overlap = options.audioOverlap ?? 0
    parsed.scenes.forEach((scene: any, index: number) => {
      if (!scene.id) scene.id = `scene-${index + 1}-${Math.random().toString(36).slice(2, 9)}`
      if (!scene.timeRange || typeof scene.timeRange.start !== 'number' || typeof scene.timeRange.end !== 'number') {
        const start = index === 0 ? cursor : Math.max(0, cursor - overlap)
        const end = start + fallbackDurations[index]
        scene.timeRange = { start, end }
      }
      cursor = scene.timeRange.end
    })

    // final range check - total is the end of the last scene
    const lastScene = parsed.scenes.at(-1)
    const total = lastScene ? lastScene.timeRange.end : 0
    const minDuration = options.minDuration ?? options.duration ?? targetTotal
    const maxDuration = options.maxDuration ?? options.duration ?? targetTotal

    if (total < minDuration || total > maxDuration) {
      const desired = total < minDuration ? minDuration : maxDuration
      const currentDurations = parsed.scenes.map((s: any) => s.timeRange.end - s.timeRange.start)
      const scaled = buildWeightedDurations(
        parsed.scenes.length,
        desired + (parsed.scenes.length - 1) * overlap,
        currentDurations
      )
      let acc2 = 0
      parsed.scenes.forEach((scene: any, idx: number) => {
        const len = scaled[idx]
        const start = idx === 0 ? acc2 : Math.max(0, acc2 - overlap)
        scene.timeRange = { start, end: start + len }
        acc2 = scene.timeRange.end
      })
    }

    return parsed
  }

  /**
   * Enrich scenes with image and animation prompts, and inject layout geometry
   */
  private async enrichScenes(
    baseScenes: Array<Omit<EnrichedScene, 'imagePrompt' | 'animationPrompt'> & { animationPrompt?: string }>,
    options: VideoGenerationOptions,
    characterSheets: any[] = []
  ): Promise<EnrichedScene[]> {
    console.log(`[VideoScriptGen] Enriching ${baseScenes.length} scenes with prompts...`)
    const aspectRatio = options.aspectRatio || '16:9'
    const imageStyle = options.imageStyle

    // Create a mapping of character IDs to their descriptive prompts
    const charMap: Record<string, string> = {}
    characterSheets.forEach((sheet) => {
      if (sheet.id) {
        // Use only the name for cleaner script actions/prompts
        charMap[sheet.id] = sheet.name
      }
    })

    const resolveCharacters = (text: string | null | undefined) => {
      if (!text) return text || ''
      let resolved = text
      Object.entries(charMap).forEach(([id, desc]) => {
        // More robust regex for IDs like CHAR-01, handling word boundaries correctly
        const regex = new RegExp(`(?<=^|[^a-zA-Z0-9])${id}(?=[^a-zA-Z0-9]|$)`, 'gi')
        resolved = resolved.replace(regex, desc)
      })
      return resolved
    }

    return baseScenes.map((scene) => {
      // Resolve character IDs in all descriptive fields before generating prompts
      const resolvedScene = {
        ...scene,
        actions: (scene.actions || []).map((a) => resolveCharacters(a)),
        expression: resolveCharacters(scene.expression || ''),
        summary: resolveCharacters(scene.summary || ''),
        narration: resolveCharacters(scene.narration || ''),
        background: resolveCharacters(scene.background || ''),
        // Resolve character IDs in the structural metadata as well
        characterIds: (scene.characterIds || []).map((id) => charMap[id] || id),
        speakingCharacterId: scene.speakingCharacterId
          ? charMap[scene.speakingCharacterId] || scene.speakingCharacterId
          : undefined,
        characterVariant: scene.characterVariant
          ? charMap[scene.characterVariant] || scene.characterVariant
          : scene.characterVariant
      }

      const imagePrompt = this.promptGenerator.generateImagePrompt(
        resolvedScene as EnrichedScene,
        false,
        aspectRatio,
        imageStyle
      )

      // Favor the animationPrompt provided by the LLM if it exists
      const animationPromptText = scene.animationPrompt
        ? resolveCharacters(scene.animationPrompt)
        : this.promptGenerator.generateAnimationPrompt(resolvedScene as EnrichedScene, imageStyle).instructions

      return {
        ...resolvedScene,
        imagePrompt: imagePrompt.prompt,
        animationPrompt: animationPromptText
      } as EnrichedScene
    })
  }

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
      `**Total Duration:** ${script.totalDuration}s (${script.sceneCount} scenes)`
    )
    lines.push(`**Generated At:** ${new Date().toLocaleString()}`, '', '---\n')

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
          `- **Clothing:** ${char.appearance.clothing}`
        )
        lines.push(
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
        `- **Narration:** *"${scene.narration}"*`,
        `- **Expression:** ${scene.expression}`
      )

      if (scene.actions && scene.actions.length > 0) {
        lines.push(`- **Actions:**`)
        scene.actions.forEach((action) => lines.push(`  - ${action}`))
      }

      if (scene.poseStyle) {
        const pos = scene.poseStyle.position || 'center'
        const scale = scene.poseStyle.scale || 1
        lines.push(`- **Pose Layout:** ${pos} (scale ${scale})`)
      }

      if (scene.props && scene.props.length > 0) {
        lines.push(`- **Props:** ${scene.props.join(', ')}`)
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
