/**
 * PromptManager
 *
 * Central class that manages ALL prompts used throughout the character video generator.
 * Every prompt string — for script generation, scene layout, image/animation generation,
 * and asset creation — is built and owned here.
 *
 * 100% Dynamic Version: No hardcoded rules, quality tags, or character-specific string replacements.
 * Everything comes from the Spec.
 *
 * FIX v2: Word count enforcement for GPT-4o / non-Kokoro providers.
 *   - Per-provider WPS calibration (kokoro=2.45, openai/gpt4o=2.0, elevenlabs=2.1)
 *   - minSentencesPerScene raised to 6 (was 4, always hit the lower bound)
 *   - minWordsPerScene floor raised to 50 (was 15, zero real pressure)
 *   - Exact target per scene instead of "minimum" (GPT-4o obeys targets better)
 *   - Self-validation "wordCount" field injected in JSON schema
 *   - SAFETY_FACTOR raised to 1.2 for non-Kokoro providers
 */

import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { computeSceneCount } from '../types/video-script.types'
import type { AnimationPrompt, EnrichedScene, ImagePrompt, VideoGenerationOptions } from '../types/video-script.types'
import type { PromptMakerOptions, VideoTypeSpecification } from './prompt-maker.types'
import type { SceneMemory } from './scene-memory'

export interface PromptManagerConfig {
  /**
   * Primary specification used for both script and image generation.
   * If provided, this prompt record will drive the entire video personality.
   */
  scriptSpec?: VideoTypeSpecification
  /**
   * The ID of the character model to use for visual consistency.
   */
  characterModelId?: string
}

// ─── Per-provider TTS speed calibration ──────────────────────────────────────
// Words per second measured at default speed / pitch.
// Adjust these if you measure different real-world values.
const PROVIDER_WPS: Record<string, number> = {
  kokoro: 2.45, // Kokoro local TTS @ speed 1.0 — measured
  openai: 2.37, // GPT-4o TTS measured
  gpt4o: 2.37, // alias
  'gpt-4o': 2.37, // alias
  elevenlabs: 2.1, // ElevenLabs standard voices
  azure: 2.2, // Azure Neural TTS
  google: 2.15 // Google Cloud TTS
}

// Safety factor: how much extra headroom to add on top of the WPS calculation.
// Kokoro is very predictable; cloud providers have more variance → larger buffer.
const PROVIDER_SAFETY_FACTOR: Record<string, number> = {
  kokoro: 1.1, // Measured as highly consistent
  openai: 1.05, // Measured value with small buffer
  gpt4o: 1.05,
  'gpt-4o': 1.05,
  elevenlabs: 1.15,
  azure: 1.15,
  google: 1.15
}
const DEFAULT_WPS = 2.37
const DEFAULT_SAFETY_FACTOR = 1.05

const PACING_FACTORS = {
  fast: 1.2, // ~20% more words per second (dense, high energy)
  medium: 1, // base speed
  slow: 0.8 // ~20% fewer words (breathable, dramatic)
}

// ─────────────────────────────────────────────────────────────────────────────

export class PromptManager {
  /** @deprecated Use getWordsPerSecond() which is provider-aware. */
  public static readonly REAL_TTS_WPS = 2.45
  /** @deprecated Use getSafetyFactor() which is provider-aware. */
  public static readonly SAFETY_FACTOR = 1.15

  private spec?: VideoTypeSpecification
  private characterModelId?: string
  private readonly characterRepository = new CharacterModelRepository()

  constructor(config: PromptManagerConfig = {}) {
    this.spec = config.scriptSpec
    this.characterModelId = config.characterModelId
  }

  // ─── Provider helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the canonical provider key from an options object.
   * Falls back to 'kokoro' for backward compatibility.
   */
  private resolveProvider(options: VideoGenerationOptions): string {
    return (options.audioProvider || 'kokoro').toLowerCase()
  }

  /**
   * Return the safety factor to apply for a given provider.
   * Cloud providers get a slightly larger buffer because their pace is less
   * predictable than the local Kokoro runtime.
   */
  private getSafetyFactor(options: VideoGenerationOptions): number {
    const provider = this.resolveProvider(options)
    return PROVIDER_SAFETY_FACTOR[provider] ?? DEFAULT_SAFETY_FACTOR
  }

  // ─── Character resolution ──────────────────────────────────────────────────

  private async resolveCharacterMetadata(): Promise<any | undefined> {
    if (this.characterModelId) {
      const model = await this.characterRepository.findById(this.characterModelId)
      if (model) {
        return {
          description: model.description || '',
          gender: model.gender || 'unknown',
          age: model.age || 'unknown',
          voiceId: model.voiceId,
          stylePrefix: model.stylePrefix || '',
          artistPersona: model.artistPersona || '',
          images: model.images || []
        }
      }
    }
    return this.spec
      ? {
          description: this.spec.characterDescription || '',
          images: []
        }
      : undefined
  }

  public async resolveCharacterImages(): Promise<string[]> {
    const metadata = await this.resolveCharacterMetadata()
    return metadata?.images || []
  }

  // ─── Speed & timing ───────────────────────────────────────────────────────

  /**
   * Calculate words per second based on generation options and specification.
   *
   * Priority order:
   *   1. options.wordsPerMinute (explicit override)
   *   2. spec.wordsPerSecondFactors[provider] (spec-level override)
   *   3. spec.wordsPerSecondFactors[lang] (language-level override)
   *   4. PROVIDER_WPS lookup (calibrated per-provider constant)
   *   5. spec.wordsPerSecondBase (spec default)
   *   6. DEFAULT_WPS (global fallback)
   */
  getWordsPerSecond(options: VideoGenerationOptions): number {
    // 1. Explicit WPM override
    if (options.wordsPerMinute) {
      return options.wordsPerMinute / 60
    }

    const spec = this.getEffectiveSpec(options)
    const provider = this.resolveProvider(options)
    const lang = (options.language || 'en-US').toLowerCase()

    const { wordsPerSecondBase, wordsPerSecondFactors = {} } = spec || {}

    // 2. Spec-level provider override (multiplicative factor on base)
    if (wordsPerSecondFactors[provider] !== undefined && wordsPerSecondBase !== undefined) {
      return wordsPerSecondBase * wordsPerSecondFactors[provider]
    }

    // 3. Spec-level language override
    const langKey = lang.split('-')[0]
    if (wordsPerSecondFactors[langKey] !== undefined && wordsPerSecondBase !== undefined) {
      return wordsPerSecondBase * wordsPerSecondFactors[langKey]
    }

    // 4. Calibrated per-provider constant (most important new lookup)
    if (PROVIDER_WPS[provider] !== undefined) {
      return PROVIDER_WPS[provider]
    }

    // 5. Spec base with no factor
    if (wordsPerSecondBase !== undefined) {
      return wordsPerSecondBase
    }

    // 6. Global fallback
    return DEFAULT_WPS
  }

  public getEffectiveSpec(options: VideoGenerationOptions): VideoTypeSpecification {
    if (options?.customSpec) return options.customSpec
    if (this.spec) return this.spec
    throw new Error('[PromptManager] No specification provided and no customSpec found.')
  }

  public getEffectiveDuration(options: VideoGenerationOptions): number {
    return options.duration ?? options.maxDuration ?? options.minDuration ?? 60
  }

  // ─── Script prompt builders ───────────────────────────────────────────────

  /**
   * Build only the system instructions for script generation.
   */
  async buildScriptSystemPrompt(options: VideoGenerationOptions = {} as any): Promise<string> {
    const spec = this.getEffectiveSpec(options)
    const characterMetadata = await this.resolveCharacterMetadata()
    const instructions = [...(spec.instructions || [])]

    // 1. Narration Speed
    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      instructions.push(`NARRATION SPEED: ${wps.toFixed(2)} words/second`)
    }

    // 2. Visual Storytelling & Camera Dynamics
    instructions.push(
      `Visual storytelling:
      Each image must clearly communicate the core idea without any text or narration. The character must actively interact with the concept in a visual and meaningful way. The main concept should be the most dominant visual element in the scene.

      Pacing and rhythm:
      Define a consistent visual flow with smooth and intentional transitions between scenes.

      Artistic identity:
      Maintain a consistent visual style across all scenes, including line quality, texture, and overall rendering approach.

      Pattern interrupt:
      Introduce occasional strong visual moments designed to capture attention and break visual monotony.

      Narration style:
      Use clear, simple, and direct language. Keep explanations easy to understand, focusing on clarity over complexity.
      — Sentences MUST be pleasant to read aloud: well-rhythmed, clear, and breathable. Write for the ear, not the eye.
      — The script MUST NOT resemble an article, an essay, a sermon, or an academic text. It is a spoken video voiceover.
      — Absolutely avoid robotic phrasing, unnecessary repetition, flat or filler sentences, vague generalities, and AI-sounding formulations.
      — Every phrase must feel human-crafted: as if a compelling speaker is talking directly to a person, not reading a summary.
      — The content MUST be understandable by someone who knows nothing about the subject. No jargon without immediate explanation. Make complex ideas feel obvious and accessible.
      — The script must make the viewer WANT to listen until the very end. Write with vivid, sensory, cinematic language. Make it lively, visual, deeply human. Every sentence should earn its place.

      Visual continuity:
      Ensure scenes follow a logical progression. Keep environments and actions consistent unless a change is clearly motivated.

      Camera Dynamics & Transitions:
      Camera Dynamics & Transitions:
      Each scene MUST use a dynamic camera action (e.g., zoom-in, pan-left, zoom-out). To create a professional transition between scenes, the camera motion MUST ACCELERATE towards the end of the scene. This "ending acceleration" creates a natural, high-energy cut to the next scene without the need for traditional transitions. Each scene should feel like a new shot that inherits the momentum of the previous one.

      PACING ARC (Density Strategy):
      Distribute the narrative density across the video:
      1. THE HOOK (0-15%): Fast/Medium pacing. High impact, concise, often 2-5 sentences (25-50 words).
      2. THE BUILD (15-70%): Variable pacing. Alternate between fast explanations and slow "mirrors". 
      3. THE REVEAL/CONCLUSION (70-100%): Slow/Medium pacing. Allow the message to "breathe". Use longer pauses (...) and explicit "breathingPoints" to let key points sink in before the call to action.`
    )

    // 3. Timing & Word Count Enforcement
    const totalDuration = this.getEffectiveDuration(options)
    const expectedScenes = computeSceneCount(totalDuration)
    const wps = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)

    // Target word counts
    const targetWordCountTotal = Math.round(totalDuration * wps * safetyFactor)
    const avgWordsPerScene = Math.round(targetWordCountTotal / expectedScenes)

    // Flexible Word Count strategy:
    // Hooks should be percutant; reveals can be slow.
    // Instead of a hard floor of 50 everywhere:
    // - Fast scenes: avg * 1.2
    // - Slow scenes: avg * 0.8
    const minWordsOverall = Math.max(25, Math.round(avgWordsPerScene * 0.5))

    const secondsPerScene = Math.round(totalDuration / expectedScenes)
    const provider = this.resolveProvider(options)

    instructions.push(
      `## NARRATION PACING — STRATEGIC DISTRIBUTION (provider: ${provider})
 
       ### Global Target
       - Video duration: ${totalDuration}s
       - TTS speed: ${wps.toFixed(2)} words/second
       - 🎯 TOTAL TARGET: **${targetWordCountTotal} words** total across the script.
 
       ### Scene-Level Flexible Targets
       Narration MUST adapt to the scene "preset" and "pacing":
       - **HOOK (Preset: hook)**: Percutant & High Impact. Target 3-5 sentences (~${Math.round(avgWordsPerScene * 0.7)} words). Pacing: fast/medium.
       - **REVEAL (Preset: reveal)**: Detailed Explanation. Target 6-10 sentences (~${Math.round(avgWordsPerScene * 1.3)} words). Pacing: medium/slow.
       - **MIRROR (Preset: mirror)**: Emotional Recognition. Target 4-6 sentences (~${Math.round(avgWordsPerScene)} words). Pacing: slow.
 
       ### PACING & BREATHING
       - **"pacing": "fast" | "medium" | "slow"**: Choose per scene. "slow" implies fewer words but deeper impact.
       - **"breathingPoints": ["string"]**: Explicitly list where to pause (e.g., "after the second sentence").
       - Use "..." in narration text for natural short pauses.
 
       ### Self-Validation (MANDATORY)
       1. Sum all "wordCount" fields — the total MUST be within ±10% of **${targetWordCountTotal} words**.
       2. ELABORATE extensively where needed, but allow percutant hooks to breathe.
       3. If the total is too low, expand "reveal" scenes significantly. If too high, trim "hook" or "mirror" scenes.`
    )

    instructions.push(
      `PAUSE MARKERS (Kokoro TTS):
      Use "..." to insert a short natural pause in the narration.
      Use these strategically:
      - After a key statement to let it sink in
      - Before a reveal or important point
      - Between two contrasting ideas
      Example: "This changes everything... but not in the way you'd expect."`
    )
    const fullSpec = {
      ...spec,
      instructions,
      characterDescription: characterMetadata
        ? `${characterMetadata.description}. Personality: ${characterMetadata.artistPersona}.`
        : spec.characterDescription
    }

    const consolidatedOutputFormat = this.getConsolidatedOutputFormat(
      spec.outputFormat,
      minWordsOverall,
      targetWordCountTotal,
      avgWordsPerScene
    )

    // 5. Inject Goals, Rules, Context from Spec
    const goals = spec.goals?.length ? `## GOALS\n${spec.goals.map((g) => `- ${g}`).join('\n')}` : ''
    const rules = spec.rules?.length ? `## RULES\n${spec.rules.map((r) => `- ${r}`).join('\n')}` : ''
    const context = spec.context ? `## CONTEXT\n${spec.context}` : ''

    const scriptInstruction = [
      context,
      goals,
      rules,
      '---',
      this.buildSystemInstructions({
        ...fullSpec,
        outputFormat: consolidatedOutputFormat
      })
    ]
      .filter(Boolean)
      .join('\n\n')

    return scriptInstruction
  }

  /**
   * Refines the output format to include global narrative planning, word count
   * self-validation, and artistic style.
   */
  private getConsolidatedOutputFormat(
    baseFormat?: string,
    minWordsOverall?: number,
    targetWordCountTotal?: number,
    avgWordsPerScene?: number
  ): string {
    if (!baseFormat || !baseFormat.includes('{')) return baseFormat || ''

    return `{
      "topic": "string",
      "audience": "string",
      "emotionalArc": ["string"],
      "titles": ["string"],
      "fullNarration": "string (The complete unbroken script. MUST target exactly ${targetWordCountTotal} words total.)",
      "totalWordCount": "number (self-reported total word count across ALL scene narrations — MUST be within ±10% of ${targetWordCountTotal})",
      "theme": "string",
      "backgroundMusic": "string",
      "scenes": [
        {
          "sceneNumber": 1,
          "id": "string",
          "preset": "hook | reveal | mirror",
          "pacing": "fast | medium | slow",
          "breathingPoints": ["string (locations where you planned a pause, e.g. 'after sentence 2')"],
          "narration": "string (The spoken text. Target ~${avgWordsPerScene} words on average, but adapt to pacing. Use '...' for short pauses.)",
          "wordCount": "number (actual word count, min ${minWordsOverall})",
          "summary": "string",
          "cameraAction": "string (zoom-in | zoom-out | pan-left | pan-right). MUST accelerate at the end.",
          "imagePrompt": "string (Detailed visual prompt)",
          "animationPrompt": "string"
        }
      ]
    }`
  }

  /**
   * Build only the user data part for script generation.
   */
  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)
    const effectiveDuration = this.getEffectiveDuration(options)
    const targetSceneCount = options.sceneCount ?? computeSceneCount(effectiveDuration)
    const wordsPerSecond = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWordCount = Math.round(effectiveDuration * wordsPerSecond * safetyFactor)
    const minWordsPerScene = Math.min(150, Math.max(50, Math.round(targetWordCount / targetSceneCount)))

    return this.buildUserData({
      subject: topic,
      duration: `${effectiveDuration} seconds`,
      aspectRatio: options.aspectRatio || '16:9',
      audience: (options as any).audience || spec.audienceDefault,
      maxScenes: targetSceneCount,
      language: options.language,
      minWordCount: targetWordCount
    })
  }

  async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    return {
      systemPrompt: await this.buildScriptSystemPrompt(options),
      userPrompt: this.buildScriptUserPrompt(topic, options)
    }
  }

  // ─── Image prompt builders ────────────────────────────────────────────────

  /**
   * Build the full system instruction for the image generation model.
   */
  async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    const spec = this.spec
    if (!spec) return ''

    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription = characterMetadata?.description || spec.characterDescription
    const stylePrefix = characterMetadata?.stylePrefix || ''
    const artistPersona = characterMetadata?.artistPersona || ''

    const effectiveHasRef = hasReferenceImages || (characterMetadata?.images && characterMetadata.images.length > 0)

    const referenceMode = effectiveHasRef
      ? `Style consistency: Match the artistic style of the reference images for character design, clothing, and line quality.${stylePrefix}. The image is strictly black and white, rendered in grayscale with detailed pencil shading and texture. The scene includes a full, realistic, and dense environment with multiple clearly defined objects, independent from the reference background.`
      : stylePrefix

    const personaContext = artistPersona ? `Acting as a ${artistPersona}, create: ` : ''

    const characterContext = characterDescription
      ? `A symbolic visual representing the scene's core idea is shown, centered around a main character described as: ${characterDescription}. This character is interacting with the environment.`
      : "A symbolic visual perfectly representing the scene's core idea is shown, interacting with the environment."

    const styleAnchor = `${personaContext} Style: Highly detailed black and white pencil drawing with rich grayscale shading and subtle cross-hatching, creating depth across all surfaces. ${characterContext} The scene takes place in a realistic interior with at least five clearly identifiable objects such as a table, a chair, a lamp, a shelf, and a window, naturally arranged. The camera frames the action clearly while showing the environment. Walls and floor are visible with natural perspective lines to ground the space. All elements are rendered at realistic human scale. The composition is clean, balanced, and fully detailed with no empty or undefined space.`

    const imageSpec: VideoTypeSpecification = {
      ...spec,
      instructions: [referenceMode, styleAnchor, ...(spec.instructions || [])].filter(Boolean)
    }

    return this.buildSystemInstructions(imageSpec)
  }

  async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    memory?: SceneMemory,
    hasLocationReference: boolean = false
  ): Promise<ImagePrompt> {
    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription = characterMetadata?.description || this.spec?.characterDescription || ''

    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

    if (characterDescription && !paragraph.toLowerCase().includes(characterDescription.toLowerCase().slice(0, 10))) {
      paragraph = `MAIN CHARACTER: ${characterDescription}. ACTION: ${paragraph}`
    }

    if (scene.locationId) {
      const memorized = memory?.locations.get(scene.locationId)
      if (memorized && !paragraph.toLowerCase().includes(memorized.prompt.toLowerCase().slice(0, 20))) {
        paragraph += `, in ${memorized.prompt}.`
      }
    }

    let finalPrompt = paragraph
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .trim()
      .replace(/([^.!?])$/, '$1.')

    if (hasReferenceImages) {
      finalPrompt +=
        ' Style consistency: Match the flat illustration style, line art, and rendering technique of the reference images. The entire scene, including the background, must be drawn in the same style and not appear photorealistic.'

      if (hasLocationReference) {
        finalPrompt +=
          ' ENVIRONMENTAL CONTINUITY: The scene takes place in the EXACT SAME LOCATION as shown in the reference image labeled LOCATION. Maintain all architectural details, furniture positions, and environmental landmarks. Keep the layout identical, only changing the character and their specific action.'
      }
    }

    return {
      sceneId: scene.id,
      prompt: finalPrompt
    }
  }

  /**
   * Build animation instructions for a scene.
   */
  buildAnimationPrompt(scene: EnrichedScene, imageStyle?: { characterDescription?: string }): AnimationPrompt {
    const instructions = scene.animationPrompt || ''
    const movements: AnimationPrompt['movements'] = [
      {
        element: 'body',
        description: instructions
      }
    ]

    return { sceneId: scene.id, instructions, movements }
  }

  // ─── Private Builders (formerly PromptMaker) ──────────────────────────────

  private buildSystemInstructions(spec: VideoTypeSpecification): string {
    const sections: string[] = []

    if (spec.role) sections.push(`## ROLE\n${spec.role}`)
    if (spec.context) sections.push(`## CONTEXT\n${spec.context}`)
    if (spec.task) sections.push(`## TASK\n${spec.task}`)
    if (spec.goals?.length) sections.push(`## GOALS\n${spec.goals.map((g) => `- ${g}`).join('\n')}`)
    if (spec.structure) sections.push(`## STRUCTURE\n${spec.structure}`)
    if (spec.rules?.length) sections.push(`## RULES\n${spec.rules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.formatting) sections.push(`## FORMATTING\n${spec.formatting}`)
    if (spec.scenePresets) sections.push(`## SCENE PRESETS\n${JSON.stringify(spec.scenePresets, null, 2)}`)
    if (spec.visualRules?.length) sections.push(`## VISUAL RULES\n${spec.visualRules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.orchestration?.length)
      sections.push(`## ORCHESTRATION\n${spec.orchestration.map((o) => `- ${o}`).join('\n')}`)
    if (spec.characterDescription) sections.push(`## MAIN CHARACTER\n${spec.characterDescription}`)
    if (spec.outputFormat) sections.push(`## OUTPUT FORMAT\n${spec.outputFormat}`)
    if (spec.instructions?.length)
      sections.push(`## INSTRUCTIONS\n${spec.instructions.map((i) => `- ${i}`).join('\n')}`)

    return sections.filter((s) => s.trim().length > 0).join('\n\n---\n\n')
  }

  private buildUserData(options: PromptMakerOptions & { minWordCount?: number }): string {
    const lines = [
      `Subject: ${options.subject}`,
      `Required Duration: ${options.duration}`,
      `Required Scene Count: ${options.maxScenes}`,
      options.minWordCount
        ? [
            ``,
            `🎯 TOTAL SCRIPT TARGET: **${options.minWordCount} words** across all scenes.`,
            `⚠️  This target is non-negotiable to match the requested duration.`,
            `   - Distribute density according to the PACING ARC instructions.`,
            `   - Use "pacing" and "breathingPoints" to control rhythm.`,
            `   - No scene should be empty or purely filler.`,
            ``
          ].join('\n')
        : '',
      `Aspect Ratio: ${options.aspectRatio}`,
      `Audience: ${options.audience}`,
      `Target Language: ${options.language || 'English'} — Generate ALL text content in this language WITHOUT EXCEPTION.`
    ]

    return lines.filter(Boolean).join('\n')
  }
}
