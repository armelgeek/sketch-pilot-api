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

export class PromptMaker {
  private role: string = ''
  private context: string = ''
  private audienceDefault: string = ''
  private task: string = ''
  private goals: string[] = []
  private structure: string = ''
  private rules: string[] = []
  private formatting: string = ''
  private outputFormat: string = ''
  private instructions: string[] = []

  constructor(spec?: VideoTypeSpecification) {
    if (spec) {
      this.applySpecification(spec)
    }
  }

  /**
   * Applies a complete video specification to the maker.
   */
  public applySpecification(spec: VideoTypeSpecification): this {
    this.role = spec.role
    this.context = spec.context
    this.audienceDefault = spec.audienceDefault
    this.task = spec.task
    this.goals = spec.goals
    this.structure = spec.structure
    this.rules = spec.rules
    this.formatting = spec.formatting
    this.outputFormat = spec.outputFormat
    this.instructions = spec.instructions

    return this
  }

  public withRole(role: string): this {
    this.role = role
    return this
  }

  public withContext(context: string): this {
    this.context = context
    return this
  }

  public withAudienceDefault(audience: string): this {
    this.audienceDefault = audience
    return this
  }

  public withTask(task: string): this {
    this.task = task
    return this
  }

  public withGoals(goals: string[]): this {
    this.goals = goals
    return this
  }

  public withStructure(structure: string): this {
    this.structure = structure
    return this
  }

  public withRules(rules: string[]): this {
    this.rules = rules
    return this
  }

  public withFormatting(formatting: string): this {
    this.formatting = formatting
    return this
  }

  public withOutputFormat(format: string): this {
    this.outputFormat = format
    return this
  }

  public withInstructions(instructions: string[]): this {
    this.instructions = instructions
    return this
  }

  // ─── Generation ──────────────────────────────────────────────────────────

  /**
   * Build only the high-level system instructions (Role, Context, Goals, Rules, etc.)
   * Each section is labelled with a Markdown header so the LLM can clearly
   * distinguish boundaries between blocks.
   */
  public buildSystemInstructions(): string {
    const sections: string[] = []

    if (this.role) sections.push(`## ROLE\n${this.role}`)

    if (this.context) sections.push(`## CONTEXT\n${this.context}`)

    if (this.task) sections.push(`## TASK\n${this.task}`)

    if (this.goals?.length) sections.push(`## GOALS\n${this.goals.map((g) => `- ${g}`).join('\n')}`)

    if (this.structure) sections.push(`## STRUCTURE\n${this.structure}`)

    if (this.rules?.length) sections.push(`## RULES\n${this.rules.map((r) => `- ${r}`).join('\n')}`)

    if (this.formatting) sections.push(`## FORMATTING\n${this.formatting}`)

    if (this.outputFormat) sections.push(`## OUTPUT FORMAT\n${this.outputFormat}`)

    if (this.instructions?.length)
      sections.push(`## INSTRUCTIONS\n${this.instructions.map((i) => `- ${i}`).join('\n')}`)

    return sections.filter((s) => s.trim().length > 0).join('\n\n---\n\n')
  }

  /**
   * Build only the user data part (Subject, Duration, Audience)
   */
  public buildUserData(options: PromptMakerOptions): string {
    const lines = [
      `Subject: ${options.subject}`,
      `Required Duration: ${options.duration}`,
      `Required Scene Count: ${options.maxScenes}`,
      `Aspect Ratio: ${options.aspectRatio}`,
      `Audience: ${options.audience}`,
      `Target Language: ${options.language || 'English'} (You MUST generate ALL narration, titles, and text in this language)`,
      '',
      this.buildCharacterInstructions(options)
    ]

    // FIX: filter out empty strings before joining to avoid orphan blank lines
    return lines.filter(Boolean).join('\n')
  }

  /**
   * Build specific instructions for character discovery if needed.
   *
   * FIX: replaced "this story" with "this subject" — neutral wording that works
   * for tutorials, explainers, documentaries, etc., not just narrative formats.
   */
  private buildCharacterInstructions(options: PromptMakerOptions): string {
    // Rule enforced for both cast-defined and auto-identified characters.
    const mandatoryRule = `\nMANDATORY RULE: Every scene MUST include at least one character (characterIds must never be empty). PREFER EXACTLY ONE CHARACTER per scene. Avoid background crowds, extra people, or irrelevant figures. Focus the visual on a single subject unless the narration explicitly requires more. Even for conceptual, abstract, or transition scenes, a character must be present \u2014 shown reacting, observing, explaining, or pointing at the concept being illustrated.`

    if (options.characters && options.characters.length > 0) {
      const cast = options.characters
        .map((char) => {
          let line = `- ${char.name}`
          if (char.modelId) line += ` (Model ID: ${char.modelId})`
          if (char.stylePrefix || char.artistPersona) {
            const styles = [char.stylePrefix, char.artistPersona].filter(Boolean).join(', ')
            line += ` [Visual Style: ${styles}]`
          }
          return line
        })
        .join('\n')
      return `CAST OF CHARACTERS (Mandatory):\n${cast}\n\nYou MUST use these specific Character Names and Model IDs in your script.${mandatoryRule}`
    }

    return `CHARACTER IDENTIFICATION:
- Automatically identify the core characters relevant to this subject.
- For each character, you MUST define their name, role, gender ("male", "female", or "unknown"), and age ("child", "youth", "senior", or "unknown").
- These attributes MUST be returned in the \`metadata\` object for each item in the \`characterSheets\` array.${mandatoryRule}`
  }

  /**
   * Build the complete combined prompt (System + User)
   */
  public build(options: PromptMakerOptions): string {
    return `${this.buildSystemInstructions()}\n\n${this.buildUserData(options)}`
  }
}

export interface PromptManagerConfig {
  backgroundColor?: string
  /**
   * Primary specification used for both script and image generation.
   * If provided, this prompt record will drive the entire video personality.
   */
  scriptSpec?: VideoTypeSpecification
  /** @deprecated use scriptSpec */
  imageSpec?: VideoTypeSpecification
  negativePrompt?: string
}

export class PromptManager {
  private backgroundColor: string
  private negativePrompt?: string
  private spec?: VideoTypeSpecification

  constructor(config: PromptManagerConfig = {}) {
    this.backgroundColor = config.backgroundColor ?? '#F5F5F5'
    this.spec = config.scriptSpec || config.imageSpec
    this.negativePrompt = config.negativePrompt
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
    const negativeConstraints = this.negativePrompt ? `NEGATIVE PROMPT: ${this.negativePrompt}` : ''

    const instructions: string[] = [
      ...(spec.instructions || []),
      'Strictly follow the style and composition rules.',
      negativeConstraints
    ].filter(Boolean) as string[] // Filter out empty strings from negativeConstraints

    // 1. Narration Speed
    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      instructions.push(`NARRATION SPEED: ${wps.toFixed(2)}`)
    }

    // 2. Gender Neutrality
    const isNeutralStyle =
      (spec.name || '').toLowerCase().includes('whiteboard') || (spec.name || '').toLowerCase().includes('stick')
    if (isNeutralStyle) {
      instructions.push(
        'GENDER NEUTRALITY: NEVER use gendered nouns (woman, man, girl, boy, lady, gentleman) or pronouns (he, she, his, her) in character sheets or scene descriptions. Use "Character", "Figure", or "Subject" and "they/them/their" instead.'
      )
    }

    // 3. Visual Style (Phase 29)
    const stylePrefix = options?.imageStyle?.stylePrefix
    if (stylePrefix) {
      instructions.push(
        `VISUAL STYLE: The video MUST be written for a "${stylePrefix}" visual style. Describe scenes, backgrounds, and character actions in a way that is compatible with this style.`
      )
    }

    // 4. Logical Continuity & VISUAL MINIMALISM (Phase 11 Refined)
    instructions.push(
      'VISUAL MINIMALISM: Every image must be clean and simple. Focus on 2D whiteboard-style line art. ' +
        'Avoid mathematical formulas, complex charts, or fine background textures. ' +
        'Represent data through simple objects (like coins or cubes) rather than graphs.'
    )

    // 5. VISUAL COMPOSITION & CHARACTER SAFETY (Phase 11 Refined)
    instructions.push(
      'VISUAL COMPOSITION: Keep scenes clear with a maximum of 2 characters. ' +
        'Avoid overlapping elements by maintaining generous white space. ' +
        'Use only front-facing, eye-level perspectives to ensure clarity. ' +
        'STRICTLY NO TEXT: Never include text, labels, or captions in the drawings.'
    )

    // 6. Narration & Organization — Tailored but simple
    instructions.push(
      'NARRATION STYLE (CRITICAL): The spoken language MUST be extremely simple, direct, and universally comprehensible. ' +
        'Write as if speaking to a complete beginner. Avoid all jargon, overly complex vocabulary, and philosophical abstractions. ' +
        'Follow the provided STRUCTURE section strictly, but express those ideas using the simplest, most accessible language possible.'
    )

    const maker = new PromptMaker(spec).withInstructions(instructions)
    return maker.buildSystemInstructions()
  }

  /**
   * Build only the user data part for script generation.
   * [PHASE 9 - UNIFIED AGENT]: The output JSON now includes `globalPlan` and `artisticStyle`
   * so a single LLM call replaces ScriptDoctor + ArtDirector + DirectorPlanner passes.
   */
  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)
    const maker = new PromptMaker(spec)
    const effectiveDuration = this.getEffectiveDuration(options)
    const targetSceneCount = options.sceneCount ?? computeSceneCount(effectiveDuration)

    const userData = maker.buildUserData({
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

    const unifiedOutputInstructions = `

## UNIFIED OUTPUT (Single JSON Object)

You are an expert Screenwriter, Art Director, and Film Director all in one.
Produce ONE complete JSON object. Ensure image descriptions are VISUALLY MINIMALIST (no text, no formulas, no clutter) but NARRATIVELY COMPLETE (describe the subject, their action, the environment, and ALL key props clearly).

JSON structure:
{
  "scenes": [
    {
      "id": "scene-1",
      "summary": "Brief summary",
      "narration": "The spoken text.",
      "imagePrompt": "Simple, literal 1-2 sentence visual description.",
      "background": "Simple background",
      "characterIds": ["char_id"],
      "actions": ["action"],
      "mood": "calm",
      "framing": "medium-shot",
      "lighting": "soft daylight",
      "props": ["prop"],
      "soundEffects": []
    }
  ],
  "titles": ["Main Title"],
  "fullNarration": "Complete narration text...",
  "theme": "core theme",
  "backgroundMusic": "calm ambient",
  "characterSheets": [
    {
      "id": "char_id",
      "name": "Character Name",
      "role": "protagonist",
      "appearance": { "clothing": "simple description" },
      "stylePrefix": "${options.imageStyle?.stylePrefix || 'flat 2D illustration'}"
    }
  ],
  "artisticStyle": {
    "textureAndGrain": "clean minimal",
    "lineQuality": "simple monochrome lines",
    "colorHarmonyStrategy": "monochrome"
  },
  "globalPlan": {
    "visualArc": { "lightingEvolution": "...", "colorPaletteShift": "...", "styleContinuity": "..." },
    "recurringSymbols": [{ "element": "symbol", "meaning": "...", "scenes": ["1"] }],
    "emotionalCurve": [{ "stage": "opening", "tension": 3, "visualVibe": "calm" }],
    "foreshadowing": [
      { "element": "object", "appearsInScenes": ["1"], "payoffSceneId": "5", "hintDescription": "..." }
    ],
    "visualStorytelling": { "keyVisualMetaphors": ["simple metaphor"], "clarityStrategy": "literal" },
    "callbacks": [
      { "element": "object", "originalSceneId": "1", "callbackSceneId": "5", "meaning": "..." }
    ],
    "pacing": { "cameraMovementStrategy": "static cuts", "transitionPulse": "smooth" }
  }
}

CRITICAL: Output ONLY the raw JSON. No markdown fences, no explanations.`

    return `${userData}\n${unifiedOutputInstructions}`
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

  buildScriptCompletePrompt(topic: string, options: VideoGenerationOptions = {} as any): string {
    const spec = this.getEffectiveSpec(options)
    const maker = new PromptMaker(spec)

    // Add specific instruction about words per second if needed
    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      maker.withInstructions([...(spec.instructions || []), `NARRATION SPEED: ${wps.toFixed(2)}`])
    }

    const effectiveDuration = this.getEffectiveDuration(options)
    // FIX: replaced Math.ceil(effectiveDuration / 10) with computeSceneCount — single source of truth
    const maxScenes = options.sceneCount ?? computeSceneCount(effectiveDuration)

    return maker.build({
      subject: topic || '',
      duration: `${effectiveDuration} seconds`,
      aspectRatio: options.aspectRatio || '16:9',
      audience: (options as any).audience || spec.audienceDefault || 'General Audience',
      language: options.language,
      maxScenes
    })
  }

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
    stylePrefix?: string,
    globalPlan?: import('../types/video-script.types').GlobalNarrativePlan
  ): string {
    const spec = this.spec
    if (!spec) return ''

    const referenceMode = hasReferenceImages
      ? 'Character Reference Mode: You are provided with specific reference images. Strictly maintain the visual identity (face, hair style, clothing, and proportions) of the characters shown. Do not invent new characters or deviate from these models.'
      : ''

    const styleAnchor = [
      `${stylePrefix ? `Visual Style: The scene must be rendered in a "${stylePrefix}" style.` : 'Style: Always render in a clean, flat 2D whiteboard illustration style.'}`,
      'Cinematic Composition: Use the rule of thirds and negative space to maintain a professional "faceless animation" look.',
      'Visual Concept: Keep the scene concept literal, logical, and extremely simple. Avoid abstract or surreal imagery to ensure the scenario is immediately readable.',
      'Simplicity: Focus on clean 2D line art, clear subjects, and pure white backgrounds. Avoid all visual clutter, detailed textures, or text within the image.',
      'Strict Adherence: Your primary goal is to accurately depict EVERY object, action, and subject mentioned in the user prompt. Do not take creative liberties that omit requested elements. If an object is specified, it must be clearly visible in the scene.'
    ].join(' ')

    // ── Global Narrative (Relocated from Prompt to System) ────────────────
    let globalDirectorCues = ''
    if (globalPlan) {
      const { visualArc, emotionalCurve, artisticStyle } = globalPlan
      const arc = [visualArc.lightingEvolution, visualArc.colorPaletteShift, visualArc.styleContinuity]
        .filter(Boolean)
        .join('. ')
      const vibe = emotionalCurve?.map((e) => e.visualVibe).join(' → ')
      const art = artisticStyle
        ? `${artisticStyle.textureAndGrain}. ${artisticStyle.lineQuality}. ${artisticStyle.colorHarmonyStrategy}.`
        : ''

      globalDirectorCues = `Global Narrative Plan:
- Visual Arc: ${arc}
- Emotional Curve: ${vibe}
- Artistic Style: ${art}`
    }

    const negativeConstraints = this.negativePrompt
      ? `Negative Constraints (DO NOT INCLUDE): ${this.negativePrompt}`
      : ''

    const imageSpec: VideoTypeSpecification = {
      ...spec,
      instructions: [
        ...(referenceMode ? [referenceMode] : []),
        styleAnchor,
        ...(globalDirectorCues ? [globalDirectorCues] : []),
        ...(spec.instructions || [])
      ]
    }

    return new PromptMaker(imageSpec).buildSystemInstructions()
  }

  buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    imageStyle?: { stylePrefix?: string; characterDescription?: string; qualityTags?: string[] },
    memory?: SceneMemory,
    globalPlan?: import('../types/video-script.types').GlobalNarrativePlan,
    characterSheets?: import('../types/video-script.types').CharacterSheet[]
  ): ImagePrompt {
    const elements = this.extractSceneElements(scene)
    const stylePrefix = imageStyle?.stylePrefix || ''
    const qualityTags = imageStyle?.qualityTags ?? []

    // ── Style Prefix (optional) ───────────────────────────────────────────
    // Only include if explicitly provided — e.g. 'whiteboard animation style'
    const isStickStyle =
      stylePrefix?.toLowerCase().includes('stick') ||
      stylePrefix?.toLowerCase().includes('whiteboard') ||
      imageStyle?.characterDescription?.toLowerCase().includes('stick')

    const stickStyleReinforcement = isStickStyle
      ? 'A simple 2D whiteboard animation using clean black lines on a pure white background. ' +
        'Ensure characters have exactly two arms and two legs, centered and properly proportioned. ' +
        'Maintain clear white space between all elements with no text, shading, or 3D effects.'
      : 'Simple whiteboard illustration with clean black lines and no shading. No text.'

    const styleLine = stylePrefix ? `This illustration is rendered in a ${stylePrefix.toLowerCase()} style.` : ''

    // ── Location ─────────────────────────────────────────────────────────
    // When a locationId is established in memory, reuse its prompt for visual continuity.
    const memoryLocation = scene.locationId ? memory?.locations.get(scene.locationId) : undefined
    const rawBg = memoryLocation?.prompt ?? scene.background ?? this.spec?.defaultBackgroundPrompt ?? ''
    const sanitizedBg = this.sanitizeForImageGen(rawBg)
    let locationStyle = imageStyle?.stylePrefix
      ? `monochrome black and white ${imageStyle.stylePrefix}, no colors, no shading, no shadows, flat 2D lines, `
      : ''

    if (isStickStyle && !locationStyle.toLowerCase().includes('stick')) {
      locationStyle += 'drawn in simplified whiteboard stick figure style, '
    }

    const location = sanitizedBg
      ? `The scene takes place in a ${sanitizedBg.toLowerCase().endsWith('.') ? sanitizedBg.slice(0, -1) : sanitizedBg}.`
      : ''

    // ── Lighting ──────────────────────────────────────────────────────────
    // Fall back to memory-derived time-of-day when the scene has no explicit lighting.
    const effectiveLighting = scene.lighting ?? (memory?.timeOfDay ? `${memory.timeOfDay} lighting` : '')
    const lighting = effectiveLighting ? `The scene is illuminated by ${effectiveLighting.toLowerCase()}.` : ''

    // ── Subject / Action ─────────────────────────────────────────────────
    // Build the scene core from imagePrompt (pre-generated by LLM) or from actions.
    let sceneCore: string
    if (scene.imagePrompt?.trim()) {
      sceneCore = this.sanitizeForImageGen(scene.imagePrompt.trim())
    } else {
      const progressivePart =
        scene.continueFromPrevious && scene.progressiveElements?.length ? scene.progressiveElements.join(', ') : ''
      sceneCore = this.sanitizeForImageGen(
        [elements.pose, elements.action !== elements.pose ? elements.action : '', progressivePart]
          .filter(Boolean)
          .join(', ')
      )
    }

    // ── Multi-Character Casting Enforcement ──────────────────────
    const allCharacterIds = Array.from(
      new Set([...(scene.characterIds || []), ...(scene.speakingCharacterId ? [scene.speakingCharacterId] : [])])
    ).filter(Boolean)

    const characterDescriptions: string[] = []

    for (const charId of allCharacterIds) {
      const casting = characterSheets?.find(
        (c) => c.id?.toLowerCase() === charId.toLowerCase() || c.name?.toLowerCase() === charId.toLowerCase()
      )
      if (casting) {
        // V2 Phase 15: Removed explicit gender/age as per user feedback (causes confusion)
        // We only inject clothing to maintain visual continuity without bias.
        let clothing = casting.appearance?.clothing || ''

        // Phase 28: Sanitize clothing from gendered words if it's a Stick/Whiteboard style
        if (isStickStyle && clothing) {
          clothing = clothing
            .replaceAll(/\b(female|male|woman|man|girl|boy|lady|gentleman)\b/gi, 'person')
            .replaceAll(/\b(women|men|girls|boys)\b/gi, 'people')
        }

        const parts = [
          clothing ? `wearing ${clothing}` : '',
          casting.stylePrefix ? `style: ${casting.stylePrefix}` : '',
          casting.artistPersona ? `artist: ${casting.artistPersona}` : ''
        ].filter(Boolean)

        if (parts.length > 0) {
          const desc = parts.join(', ').trim().toLowerCase()
          const referenceLink = hasReferenceImages ? ' [VISUAL IDENTITY FROM PROVIDED REFERENCES]' : ''
          characterDescriptions.push(`${charId} (${desc})${referenceLink}`)
        } else {
          const referenceLink = hasReferenceImages ? ' [VISUAL IDENTITY FROM PROVIDED REFERENCES]' : ''
          characterDescriptions.push(`${charId}${referenceLink}`)
        }
      } else {
        const referenceLink = hasReferenceImages ? ' [VISUAL IDENTITY FROM PROVIDED REFERENCES]' : ''
        characterDescriptions.push(`${charId}${referenceLink}`)
      }
    }

    // Only prepend characterIdentity if it isn't already present in sceneCore.
    const baseCharacter = imageStyle?.characterDescription || characterDescriptions.join(' and ')
    const characterVariant = scene.characterVariant ? ` (${scene.characterVariant})` : ''
    const characterIdentity = `${baseCharacter}${characterVariant}`.trim()

    const identityAlreadyInCore = characterIdentity
      ? sceneCore
          .toLowerCase()
          .split(/[\s,.()+\-–]+/)
          .some((w) =>
            characterIdentity
              .toLowerCase()
              .split(/[\s,]+/)
              .includes(w)
          )
      : false

    const subjectPart = characterIdentity && !identityAlreadyInCore ? `${characterIdentity} — ${sceneCore}` : sceneCore
    const expressionPart = scene.expression ? ` ${scene.expression}.` : ''

    // Force illustration style on action if detected
    const actionStyle = isStickStyle ? 'A clean black and white illustration ' : ''
    const action = `${actionStyle}${subjectPart}${expressionPart}`

    // ── Framing (composition only) ────────────────────────────────────────
    const framingParts = [
      scene.framing,
      scene.cameraType === 'static' ? 'static perspective' : scene.cameraType,
      scene.eyelineMatch ? `eyeline looking ${scene.eyelineMatch.toLowerCase()}` : ''
    ].filter(Boolean)
    const framing = framingParts.length ? `The shot has a ${framingParts.join(' and ')}.` : ''

    // ── Props (accessories / objects) ─────────────────────────────────────
    const sceneProps = scene.props
    const memoryProps = this.resolveMemoryProps(scene, memory)
    let effectiveProps: string[]
    if (sceneProps === undefined) {
      effectiveProps = memoryProps
    } else if (sceneProps.length === 0) {
      effectiveProps = []
    } else {
      effectiveProps = Array.from(new Set([...memoryProps, ...sceneProps]))
    }
    const props = effectiveProps.length ? `Essential elements to clearly include: ${effectiveProps.join(', ')}.` : ''

    // ── Mood (emotional tone) ─────────────────────────────────────────────
    const moodContent = [scene.mood, ...qualityTags].filter(Boolean).join('. ')
    const mood = moodContent ? `The overall mood is ${moodContent}.` : ''

    // ── Global Narrative (Director's Plan - ULTRA MINIMAL) ────────────────
    let directorCues = ''
    if (globalPlan) {
      // We ONLY keep Metaphors and Symbols in the scene prompt.
      // They are the only ones strictly tied to scene content.
      const sceneContext = `${scene.summary} ${(scene.actions || []).join(' ')}`.toLowerCase()
      const metaphor = (globalPlan.visualStorytelling?.keyVisualMetaphors || []).find((m) => {
        const words = m
          .toLowerCase()
          .split(/[\s/"':()]+/)
          .filter((w) => w.length > 4)
        return words.some((w) => sceneContext.includes(w))
      })

      const symbol = globalPlan.recurringSymbols?.find((sym) => {
        const match = sym.scenes?.some(
          (s) =>
            s === scene.id || s === String(scene.sceneNumber) || s.replaceAll(/\D/g, '') === String(scene.sceneNumber)
        )
        return match
      })

      directorCues = [
        metaphor ? `This scene embodies the visual metaphor of ${metaphor.toLowerCase()}.` : '',
        symbol
          ? `The ${symbol.element.toLowerCase()} appears here as a recurring symbol of ${symbol.meaning.toLowerCase()}.`
          : ''
      ]
        .filter(Boolean)
        .join(' ')
    }
    const directorSection = directorCues ? `${directorCues}` : ''

    // ── Atmosphere (weather + time of day from memory) ────────────────────
    const weatherContext =
      memory?.weather && !(scene.mood ?? '').toLowerCase().includes(memory.weather) ? memory.weather : ''
    const atmosphere = weatherContext ? `Atmosphere: ${weatherContext}.` : ''

    // We sanitize sceneCore one last time to remove REDUNDANT prefixes.
    const cleanAction = action
      .replace(/^(Action:|Illustrating\.\.|Whiteboard illustration:)\s*/i, '')
      .replace(/^A A monochrome/i, 'A monochrome') // Fix double "A" if present
      .trim()

    // ── Descriptive Paragraph Assembly ──────────────────────────────────────
    const promptParts = [
      styleLine,
      cleanAction
        ? cleanAction.charAt(0).toUpperCase() + cleanAction.slice(1) + (cleanAction.endsWith('.') ? '' : '.')
        : '',
      stickStyleReinforcement,
      location,
      atmosphere,
      props,
      framing,
      lighting,
      mood,
      directorSection,
      this.buildComplexityDirective(scene.visualDensity),
      scene.negativePrompt ? `Negative Constraints (AVOID AT ALL COSTS): ${scene.negativePrompt}` : '',
      'Final Precision Note: Ensure every mentioned element is clearly depicted. No extra subjects.'
    ]
      .filter((b) => b?.trim().length > 0)
      .map((s) => s.trim().replace(/\.+$/, '.')) // Ensure single dot at end

    const prompt = promptParts.join(' ')
    const base = prompt.replaceAll(/\s{2,}/g, ' ').trim()

    return {
      sceneId: scene.id,
      prompt: base,
      elements: {
        pose: elements.pose,
        action: elements.action,
        expression: scene.expression,
        props: effectiveProps,
        background: rawBg || this.backgroundColor
      }
    }
  }

  /**
   * Resolve props from scene memory for characters present in this scene.
   * Returns merged props from all characters in memory that appear in this scene.
   */
  private resolveMemoryProps(scene: EnrichedScene, memory?: SceneMemory): string[] {
    if (!memory || !scene.characterIds || scene.characterIds.length === 0) return []
    const props: string[] = []
    for (const charId of scene.characterIds) {
      const memChar = memory.characters.get(charId)
      if (memChar?.currentProps.length) {
        props.push(...memChar.currentProps)
      }
    }
    return props.filter((v, i, a) => a.indexOf(v) === i)
  }

  /**
   * Build animation instructions for a scene.
   * Fully Character-Agnostic.
   */
  buildAnimationPrompt(
    scene: EnrichedScene,
    imageStyle?: { stylePrefix?: string; characterDescription?: string },
    globalPlan?: import('../types/video-script.types').GlobalNarrativePlan
  ): AnimationPrompt {
    const stylePrefix = imageStyle?.stylePrefix || ''
    const styleLine = stylePrefix ? `The animation follows a ${stylePrefix.toLowerCase()} visual style.` : ''

    const movements: AnimationPrompt['movements'] = (scene.actions || []).map((a) => ({
      element: 'body',
      description: a || ''
    }))

    const actions = movements
      .map((m) => m.description)
      .filter(Boolean)
      .join('. ')
    const cleanActions = actions
      ? actions.charAt(0).toUpperCase() + actions.slice(1) + (actions.endsWith('.') ? '' : '.')
      : ''

    let camera = ''
    if (scene.cameraType) {
      if (scene.cameraType.toLowerCase() === 'static') {
        camera = 'The camera remains static.'
      } else {
        camera = `The camera moves with a ${scene.cameraType.toLowerCase()} motion.`
      }
    }

    const mood = scene.mood ? `The scene has a ${scene.mood.toLowerCase()} vibe.` : ''

    const anatomyReinforcement =
      'Maintain simple, anatomically correct figures with exactly two arms and two legs. Ensure there is no text or writing in the scene.'

    const instructions = [styleLine, anatomyReinforcement, cleanActions, camera, mood]
      .filter((b) => b?.trim().length > 0)
      .map((s) => s.trim().replace(/\.+$/, '.'))
      .join(' ')
    const finalInstructions = instructions.replaceAll(/\s{2,}/g, ' ').trim()

    return { sceneId: scene.id, instructions: finalInstructions, movements }
  }

  /**
   * Title proposal system prompt.
   */
  buildTitleProposalSystemPrompt(): string {
    return `JSON { titles: ["...", ...] }`
  }

  buildTitleProposalUserPrompt(topic: string): string {
    return topic
  }

  private sanitizeForImageGen(text: string): string {
    if (!text) return text
    // Remove leading timestamps like "2.5s: " or "3-5s: "
    let s = text.replace(/^\d[\d.-]*s?:\s*/i, '')
    s = s
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .replaceAll(/\s+\./g, '.')
      .trim()
    return s
  }

  private extractSceneElements(scene: EnrichedScene): { pose: string; action: string } {
    const actions = (scene.actions || [])
      .map((a) => a.replace(/^\d+(\.\d+)?(-?\d+(\.\d+)?)?s:\s*/i, '').trim())
      .filter(Boolean)

    if (actions.length === 0) return { pose: '', action: '' }
    if (actions.length === 1) return { pose: actions[0], action: '' }
    // Multiple actions: first is the pose/position, rest are actions
    return {
      pose: actions[0],
      action: actions.slice(1).join('. ')
    }
  }

  /**
   * Builds a directive based on scene visual density.
   */
  private buildComplexityDirective(density?: 'low' | 'medium' | 'high'): string {
    if (density === 'low') {
      return 'Visual Complexity: Ultra-minimalist. Maximum white space and extremely simple shapes.'
    }
    if (density === 'high') {
      return 'Visual Complexity: Highly detailed illustration with intricate background elements and professional textures.'
    }
    return ''
  }
}
