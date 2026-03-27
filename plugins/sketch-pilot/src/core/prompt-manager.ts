/**
 * PromptManager
 *
 * Central class that manages ALL prompts used throughout the character video generator.
 * Every prompt string — for script generation, scene layout, image/animation generation,
 * and asset creation — is built and owned here.
 *
 * 100% Dynamic Version: No hardcoded rules, quality tags, or character-specific string replacements.
 * Everything comes from the Spec.
 */

import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { computeSceneCount, computeVisualBudget } from '../types/video-script.types'
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

export class PromptManager {
  private spec?: VideoTypeSpecification
  private characterModelId?: string
  private readonly characterRepository = new CharacterModelRepository()

  constructor(config: PromptManagerConfig = {}) {
    this.spec = config.scriptSpec
    this.characterModelId = config.characterModelId
  }

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

  /**
   * Calculate words per second based on generation options and specification.
   */
  getWordsPerSecond(options: VideoGenerationOptions): number {
    if (options.wordsPerMinute) {
      return options.wordsPerMinute / 60
    }

    const { wordsPerSecondBase = 2, wordsPerSecondFactors = {} } = this.spec || {}

    const lang = (options.language || 'en-US').toLowerCase()
    const provider = options.audioProvider || 'kokoro'

    // Check for specific provider override
    if (wordsPerSecondFactors[provider] !== undefined) {
      return wordsPerSecondBase * wordsPerSecondFactors[provider]
    }

    // Check for language-specific factor
    const langKey = lang.split('-')[0]
    if (wordsPerSecondFactors[langKey] !== undefined) {
      return wordsPerSecondBase * wordsPerSecondFactors[langKey]
    }

    return wordsPerSecondBase
  }

  public getEffectiveSpec(options: VideoGenerationOptions): VideoTypeSpecification {
    if (options?.customSpec) {
      return options.customSpec
    }
    if (this.spec) {
      return this.spec
    }
    throw new Error('[PromptManager] No specification provided and no customSpec found.')
  }

  /**
   * Build only the system instructions for script generation.
   */
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
      instructions.push(`NARRATION SPEED: ${wps.toFixed(2)}`)
    }

    // 3. Director & Art Direction Integration (One-Pass Consolidation - Phase 31)
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

      Visual continuity:
      Ensure scenes follow a logical progression. Keep environments and actions consistent unless a change is clearly motivated.

      Cost optimization (Visual Re-use):
      For long videos, if two or more consecutive scenes have very similar visual content (same subject, same location), use the 'visualReferenceId' field in the second scene to point to the 'id' of the first scene. This avoids generating redundant images.
      
      Camera Dynamics:
      When reusing a visual via 'visualReferenceId', ALWAYS specify a different 'cameraAction' (e.g., zoom-in, pan-left) to keep the video engaging. Each scene should feel like a new shot, even if it uses the same base image.`
    )

    // 4. Dynamic Visual Budget (Cost Optimization)
    const totalDuration = options.maxDuration || 60
    const visualBudget = computeVisualBudget(totalDuration)
    const approxReusePercent = Math.round(Math.max(0, 100 - (visualBudget / computeSceneCount(totalDuration)) * 100))

    instructions.push(
      `STRICT VISUAL BUDGET (LIMIT: ${visualBudget} UNIQUE IMAGES):
      For this ${Math.round(totalDuration / 60)}min video, you are strictly limited to ${visualBudget} UNIQUE image generations.
      1. YOU MUST reuse images using 'visualReferenceId' for approximately ${approxReusePercent}% of scenes.
      2. Distribution: Group narration into visual sequences of 30-45 seconds (same image used across 3-4 consecutive scenes).
      3. Maintain rhythm by using different CAMERA ACTIONS (zoom-in, pan-left, zoom-out) on every reused visual.
      4. Only generate a NEW image when the sub-topic or location changes significantly.
      5. ASYMMETRIC PACING & LONG HOLDS:
         - For explanatory parts, keep one image for 45-60s (using 'visualReferenceId' for 4-5 scenes).
         - CRITICAL FOR LONG HOLDS: To prevent monotony on a 60s hold, change the 'cameraAction' for EACH reused scene (e.g., Scene 1: 'zoom-in', Scene 2: 'pan-left', Scene 3: 'zoom-out').
         - For key moments, switch images quickly every 10-15s.
         - Create a "heartbeat" rhythm by alternating between long visual holds and quick visual cuts.`
    )

    const fullSpec = {
      ...spec,
      instructions,
      characterDescription: characterMetadata
        ? `${characterMetadata.description}. Personality: ${characterMetadata.artistPersona}.`
        : spec.characterDescription
    }
    const consolidatedOutputFormat = this.getConsolidatedOutputFormat(spec.outputFormat)

    // 4. Inject Goals and Rules from Spec (Phase 32)
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
   * Refines the output format to include global narrative planning and artistic style.
   * Avoids fragile regex replacements.
   */
  private getConsolidatedOutputFormat(baseFormat?: string): string {
    if (!baseFormat || !baseFormat.includes('{')) return baseFormat || ''

    // Define the full consolidated schema structure
    return `{
  "topic": "string",
  "audience": "string",
  "emotionalArc": ["string"],
  "titles": ["string"],
  "fullNarration": "string",
  "theme": "string",
  "backgroundMusic": "string",
  "scenes": [
    {
      "sceneNumber": 1,
      "id": "string (unique scene id)",
      "timestamp": 0,
      "narration": "string (the spoken text)",
      "summary": "string (brief visual summary)",
      "visualReferenceId": "string (optional: the id of a previous scene to reuse its image)",
      "locationId": "string (optional: unique location identifier)",
      "cameraAction": {
        "type": "zoom-in | zoom-out | pan-left | pan-right | static",
        "intensity": "low | medium | high"
      },
      "preset": "hook | reveal | mirror",
      "imagePrompt": "string (A symbolic visual perfectly representing the scene's core idea. The scene takes place in a simple, realistic interior with a table, a chair, a lamp, a shelf, and a window in the background, each object clearly defined and naturally positioned. The camera frames the action clearly, with all elements at a realistic scale. The image is rendered as a highly detailed black and white pencil drawing with soft grayscale shading and subtle textures, creating a clean, balanced, and grounded composition with no empty space.)",
      "animationPrompt": "string (specific movement/performance instructions)",
      "locationId": "string (reusable identifier, e.g. 'office', 'forest')",
      "continueFromPrevious": false,
      "visualSource": "local",
      "cameraAction": { "type": "string", "intensity": "low|medium|high" },
      "transitionToNext": "string"
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
    // FIX: use computeSceneCount as single source of truth (aligned with buildScriptCompletePrompt)
    const targetSceneCount = options.sceneCount ?? computeSceneCount(effectiveDuration)

    return this.buildUserData({
      subject: topic,
      duration: `${effectiveDuration} seconds`,
      aspectRatio: options.aspectRatio || '16:9',
      audience: (options as any).audience || spec.audienceDefault,
      maxScenes: targetSceneCount,
      language: options.language
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

  // buildScriptCompletePrompt removed per user request (unified to buildScriptGenerationPrompts array mode)

  private getEffectiveDuration(options: VideoGenerationOptions): number {
    return options.duration ?? options.maxDuration ?? options.minDuration ?? 60
  }

  /**
   * Build the full system instruction for the image generation model.
   * When reference images are provided, they are the ABSOLUTE SOURCE OF TRUTH.
   * All other instructions serve the reference images, never contradict them.
   *
   * FIX: now delegates to PromptMaker.buildSystemInstructions() to avoid duplicating
   * assembly logic and to include all spec fields (role, task, goals…) consistently.
   */
  async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    const spec = this.spec
    if (!spec) return ''

    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription = characterMetadata?.description || spec.characterDescription
    const stylePrefix = characterMetadata?.stylePrefix || ''
    const artistPersona = characterMetadata?.artistPersona || ''

    // If character metadata has images, we treat it as having reference images even if none passed in options
    const effectiveHasRef = hasReferenceImages || (characterMetadata?.images && characterMetadata.images.length > 0)

    const referenceMode = effectiveHasRef
      ? `Style consistency: Match the artistic style of the reference images for character design, clothing, and line quality. ${stylePrefix}. The image is strictly black and white, rendered in grayscale with detailed pencil shading and texture. The scene includes a full, realistic, and dense environment with multiple clearly defined objects, independent from the reference background.`
      : stylePrefix

    const personaContext = artistPersona ? `Acting as a ${artistPersona}, create:` : ''

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

    // 1. Core prompt is exactly what the LLM wrote
    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

    // Enforce character identity if mission-critical
    if (characterDescription && !paragraph.toLowerCase().includes(characterDescription.toLowerCase().slice(0, 10))) {
      paragraph = `MAIN CHARACTER: ${characterDescription}. ACTION: ${paragraph}`
    }

    // 2. Location Enrichment (Visibility Fallback)
    if (scene.locationId) {
      // Check memory for descriptive location prompt
      const memorized = memory?.locations.get(scene.locationId)
      if (memorized && !paragraph.toLowerCase().includes(memorized.prompt.toLowerCase().slice(0, 20))) {
        paragraph += `, in ${memorized.prompt}.`
      }
    }

    // 4. Cleanup grammar
    let finalPrompt = paragraph
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .trim()
      .replace(/([^.!?])$/, '$1.')

    // 5. Style lock — enforce same artistic style as reference images in the prompt itself
    // (system instruction alone is not always sufficient; a prompt-level hint is stronger)
    if (hasReferenceImages) {
      finalPrompt +=
        'Style consistency: Match the flat illustration style, line art, and rendering technique of the reference images. The entire scene, including the background, must be drawn in the same style and not appear photorealistic.'

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
   * Fully Character-Agnostic.
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

  private buildUserData(options: PromptMakerOptions): string {
    const lines = [
      `Subject: ${options.subject}`,
      `Required Duration: ${options.duration}`,
      `Required Scene Count: ${options.maxScenes}`,
      `Aspect Ratio: ${options.aspectRatio}`,
      `Audience: ${options.audience}`,
      `Target Language: ${options.language || 'English'} — Generate ALL text content in this language WITHOUT EXCEPTION. This includes: narration, titles, onscreen text, imagePrompt (visual scene descriptions), and animationPrompt (movement instructions). Do NOT use English for imagePrompt or animationPrompt when the target language is different.`
    ]

    return lines.filter(Boolean).join('\n')
  }
}
