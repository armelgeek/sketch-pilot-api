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

import { computeSceneCount } from '../types/video-script.types'
import type { AnimationPrompt, EnrichedScene, ImagePrompt, VideoGenerationOptions } from '../types/video-script.types'
import type { PromptMakerOptions, VideoTypeSpecification } from './prompt-maker.types'
import type { SceneMemory } from './scene-memory'

export interface PromptManagerConfig {
  backgroundColor?: string
  /**
   * Primary specification used for both script and image generation.
   * If provided, this prompt record will drive the entire video personality.
   */
  scriptSpec?: VideoTypeSpecification
}

export class PromptManager {
  private backgroundColor?: string
  private spec?: VideoTypeSpecification

  constructor(config: PromptManagerConfig = {}) {
    this.backgroundColor = config.backgroundColor
    this.spec = config.scriptSpec
  }

  setBackgroundColor(color: string): void {
    this.backgroundColor = color
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
  buildScriptSystemPrompt(options: VideoGenerationOptions = {} as any): string {
    const spec = this.getEffectiveSpec(options)
    const instructions = [...(spec.instructions || [])]

    // 1. Narration Speed
    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      instructions.push(`NARRATION SPEED: ${wps.toFixed(2)}`)
    }

    // 3. Director & Art Direction Integration (One-Pass Consolidation - Phase 31)
    instructions.push(
      'DIRECTOR PLAN: Analyze the narrative arc to define a global visual strategy.',
      '1. THE VISUAL ARC: Lighting and color palette must evolve to support the emotional tone.',
      '2. RECURRING SYMBOLS: Identification of 1-3 visual objects that should appear consistently as anchors.',
      '3. VISUAL STORYTELLING: Define powerful visual metaphors to represent abstract concepts. Avoid literalism.',
      '4. PACING (RHYTHM): Define a global camera movement strategy and transition style.',
      '5. ARTISTIC IDENTITY: Define the "Visual Soul" (Texture, Line Quality, Color Harmony Strategy).',
      '6. PATTERN INTERRUPT: Identify key moments for a strong visual "Hook" to grab attention.',
      '7. IMMERSIVE NARRATION: Characters (like the narrator or protagonists) should be addressed or referred to by name in the narration when appropriate to enhance continuity and immersion.',
      '8. PLAIN LANGUAGE & CLARITY: The target audience is non-experts. The narration must be direct, pedagogical, and easy to understand. Avoid complex terminology or abstract metaphors in the spoken narration. Use "Explain Like I\'m Five" (ELI5) principles: keep sentences simple and focused on clarity.',
      '9. VISUAL LOGIC & CONTINUITY: Scenes must follow a logical visual progression. If the narration refers to the same moment, keep the character in the same environment. Ensure actions are physically consistent and transitions feel natural. Avoid arbitrary location jumps unless the narration explicitly implies a change in setting.',
      "10. LOCATION PERSISTENCE: If the input prompt defines locations with specific IDs (e.g., LOC-01, LOC-02), you MUST use these exact IDs in the scene's locationId field to ensure visual memory works correctly.",
      '11. NAME CONSISTENCY: You MUST use the exact names provided for characters. These names are the unique keys for the @Name visual system.'
    )

    const fullSpec = { ...spec, instructions }
    const consolidatedOutputFormat = this.getConsolidatedOutputFormat(spec.outputFormat)

    return this.buildSystemInstructions({
      ...fullSpec,
      outputFormat: consolidatedOutputFormat
    })
  }

  /**
   * Refines the output format to include global narrative planning and artistic style.
   * Avoids fragile regex replacements.
   */
  private getConsolidatedOutputFormat(baseFormat?: string): string {
    if (!baseFormat || !baseFormat.includes('{')) return baseFormat || ''

    // Define the full consolidated schema structure
    return `{
  "titles": ["string"],
  "fullNarration": "string",
  "theme": "string",
  "backgroundMusic": "string",
  "characterSheets": [
    {
      "id": "string (descriptive unique ID, e.g. 'lily')",
      "name": "string",
      "role": "string",
      "appearance": { 
        "description": "string", 
        "clothing": "string",
        "accessories": ["string"],
        "colorPalette": ["string"],
        "uniqueIdentifiers": ["string"]
      },
      "expressions": ["string"],
      "metadata": { "gender": "male|female|unknown", "age": "child|youth|senior|unknown" },
      "imagePrompt": "string"
    }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "timestamp": 0,
      "narration": "string (the spoken text)",
      "summary": "string (brief visual summary)",
      "imagePrompt": "string (MINIMALIST visual description. One clear, simple sentence centered on the character(s) from the characterSheets performing the main action. Use the @Name syntax for characters (e.g., '@Lily is sitting'). Do NOT describe their physical traits or clothing as they are already known. MANDATORY: Include the character's location (e.g. '@Lily in an office'). Mandatory minimalist background following the characterSheet style.)",
      "animationPrompt": "string (specific movement/performance instructions)",
      "characterIds": ["string (IDs from the characterSheets)"],
      "speakingCharacterId": "string (the ID of the character currently speaking, e.g. 'lily')",
      "onscreenText": "string (text overlay on screen)",
      "poseStyle": { "position": "string", "scale": 1 },
      "cameraAction": { "type": "string", "intensity": "low|medium|high" },
      "transitionToNext": "string"
    }
  ],
  "instructions": [
    "1. For each scene, accurately identify the speaker via 'speakingCharacterId'. It MUST exactly match an ID from 'characterSheets'.",
    "2. Ensure the @Name in 'imagePrompt' belongs to the 'speakingCharacterId' if that character is the one talking."
  ]
}
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
      language: options.language,
      characters:
        options.characters ||
        (options.characterModelId ? [{ name: 'Main Character', modelId: options.characterModelId }] : undefined)
    })
  }

  buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): { systemPrompt: string; userPrompt: string } {
    return {
      systemPrompt: this.buildScriptSystemPrompt(options),
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
  buildImageSystemInstruction(
    hasReferenceImages: boolean,
    characterSheets?: import('../types/video-script.types').CharacterSheet[]
  ): string {
    const spec = this.spec
    if (!spec) return ''

    let characterContext = ''
    if (characterSheets && characterSheets.length > 0) {
      const sheets = characterSheets
        .map((s) => `- @${s.name}: ${s.appearance.description}${s.role ? ` (Role: ${s.role})` : ''}`)
        .join('\n')
      characterContext = `CHARACTER PROFILES (Absolute visual reference for @Name syntax):\n${sheets}`
    }

    const referenceMode = hasReferenceImages
      ? 'Character identity: You are provided with character reference images. Strictly maintain the visual identity (face, hair, clothing, proportions) of the characters shown. Do not invent variations or new characters.'
      : ''

    const styleAnchor = 'Cinematic composition: Apply the rule of thirds and effective use of negative space.'

    const imageSpec: VideoTypeSpecification = {
      ...spec,
      instructions: [
        ...(referenceMode ? [referenceMode] : []),
        styleAnchor,
        ...(spec.instructions || []),
        characterContext
      ].filter(Boolean)
    }

    return this.buildSystemInstructions(imageSpec)
  }

  buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    imageStyle?: { stylePrefix?: string; characterDescription?: string },
    memory?: SceneMemory,
    characterSheets?: import('../types/video-script.types').CharacterSheet[]
  ): ImagePrompt {
    // 1. Core prompt is exactly what the LLM wrote
    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

    // 2. Character Enrichment (Coherence Fallback)
    // If the AI prompt is too short or doesn't mention characters, we add them
    const allCharacterIds = Array.from(
      new Set([...(scene.characterIds || []), ...(scene.speakingCharacterId ? [scene.speakingCharacterId] : [])])
    ).filter(Boolean)

    for (const charId of allCharacterIds) {
      const casting = characterSheets?.find(
        (c) => c.id?.toLowerCase() === charId.toLowerCase() || c.name?.toLowerCase() === charId.toLowerCase()
      )

      if (casting) {
        const nameInPrompt = `@${casting.name.toLowerCase()}`
        if (!paragraph.toLowerCase().includes(nameInPrompt)) {
          // If the name is already there without @, prefix it
          const escapedName = casting.name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
          const re = new RegExp(`\\b${escapedName}\\b`, 'gi')
          if (re.test(paragraph)) {
            paragraph = paragraph.replace(re, `@${casting.name}`)
          } else {
            // Otherwise append it
            paragraph += ` Featuring @${casting.name}.`
          }
        }
      }
    }

    // 3. Location Memory (Coherence Fallback)
    if (scene.locationId && memory?.locations.has(scene.locationId)) {
      const location = memory.locations.get(scene.locationId)
      if (location && !paragraph.toLowerCase().includes(location.prompt.toLowerCase().slice(0, 20))) {
        paragraph += `,${location.prompt}.`
      }
    }

    // 4. Cleanup grammar
    const finalPrompt = paragraph
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .trim()
      .replace(/([^.!?])$/, '$1.')

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
      `Target Language: ${options.language || 'English'} (Generate all narration, titles, and onscreen text specifically in this language)`,
      '',
      this.buildCharacterInstructions(options)
    ]

    return lines.filter(Boolean).join('\n')
  }

  private buildCharacterInstructions(options: PromptMakerOptions): string {
    if (options.characters && options.characters.length > 0) {
      const cast = options.characters
        .map((char) => {
          let line = `- ${char.name}`
          if (char.modelId) line += ` (Model ID: ${char.modelId})`
          if (char.appearance) {
            const desc = [char.appearance.description, char.appearance.clothing].filter(Boolean).join(', ')
            if (desc) line += ` [Appearance: ${desc}]`
          }
          return line
        })
        .join('\n')
      return `CAST OF CHARACTERS:\n${cast}\n\nCRITICAL CONSTRAINTS:\n1. Every imagePrompt MUST be a single MINIMALIST sentence featuring the character(s) above as the main subject.\n2. Always use the @Name syntax to reference characters (e.g., '@Lily').\n3. Do NOT describe the characters' base appearance (hair, eyes, skin, clothing) in the imagePrompt; strictly use @Name.\n4. The character's current location MUST be explicitly mentioned (e.g. '@Lily in the kitchen').\n5. Focus on the character's simple action. No complex compositions.\n6. NAME CONSISTENCY: You MUST use the exact names provided in the CAST above. Do NOT use nicknames, synonyms, or generic terms.`
    }

    return `CHARACTER IDENTIFICATION:\n- Automatically identify the core characters relevant to this subject.\n- For each character, define their name, role, and a descriptive ID (e.g. 'lily').\n- The Character Sheet acts as the visual and persona anchor for the entire video.\n- These attributes must be returned in the \`characterSheets\` array.`
  }
}
