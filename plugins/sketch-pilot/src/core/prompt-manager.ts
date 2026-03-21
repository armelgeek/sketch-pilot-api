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
}

export class PromptManager {
  private backgroundColor: string
  private spec?: VideoTypeSpecification

  constructor(config: PromptManagerConfig = {}) {
    this.backgroundColor = config.backgroundColor ?? '#F5F5F5'
    this.spec = config.scriptSpec || config.imageSpec
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

    // 2. Gender Neutrality (Phase 28)
    // 2. Gender Neutrality (Phase 28)
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

    const maker = new PromptMaker(spec).withInstructions(instructions)
    return maker.buildSystemInstructions()
  }

  /**
   * Build only the user data part for script generation.
   */
  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)
    const maker = new PromptMaker(spec)
    const effectiveDuration = this.getEffectiveDuration(options)
    // FIX: use computeSceneCount as single source of truth (aligned with buildScriptCompletePrompt)
    const targetSceneCount = options.sceneCount ?? computeSceneCount(effectiveDuration)

    return maker.buildUserData({
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
  buildImageSystemInstruction(hasReferenceImages: boolean, stylePrefix?: string): string {
    const spec = this.spec
    if (!spec) return ''

    const referenceMode = hasReferenceImages
      ? 'REFERENCE MODE (CRITICAL): You are provided with specific CHARACTER REFERENCE IMAGES. You MUST strictly copy the visual identity (face, hair style, distinctive clothing, and proportions) of the characters from these images. DO NOT invent new characters. DO NOT deviate from the characters shown in the references. The characters in your generation MUST BE RECOGNIZABLE as the same individuals from the reference images. Use the character names provided in the prompt to correctly map them to the corresponding visual reference.'
      : ''

    // Always anchor the visual style to prevent the model defaulting to
    // photorealistic or aesthetics that contradict the character's style.
    const styleAnchor = [
      `VISUAL STYLE: ${stylePrefix ? `The scene MUST be rendered in a "${stylePrefix}" style.` : "Always render in a clean, flat 2D illustration style consistent with the spec's art direction."}`,
      `CINEMATIC COMPOSITION: Use the Rule of Thirds, Leading Lines, and plenty of Negative Space. Maintain a clean, professional "faceless animation" look.`,
      `ABSTRACT SCENES: When there are no human characters, represent concepts through simple drawn diagrams, icons, arrows, labeled boxes, or symbolic illustrations — never photorealistic effects, 3D renders, neon distortion visuals, or cinematic VFX.`,
      `NEVER generate: photorealistic photography, sci-fi particle effects, lens flares, or cinematic explosions unless explicitly required.`
    ].join(' ')

    // Inject both as the very first instructions so they take precedence.
    const imageSpec: VideoTypeSpecification = {
      ...spec,
      instructions: [...(referenceMode ? [referenceMode] : []), styleAnchor, ...(spec.instructions || [])]
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
      ? 'STRICTLY Monochrome black and white, no colors, no shading, no shadows, no gradients, no volume, no 3D effects, flat 2D only, STRICTLY MINIMALIST, minimal line count, plenty of empty white space, ink on pure white background, '
      : ''

    const styleLine = stylePrefix ? `[Style]: ${stickStyleReinforcement}${stylePrefix}` : ''

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

    const location = sanitizedBg ? `[Location]: ${locationStyle}${sanitizedBg}` : ''

    // ── Lighting ──────────────────────────────────────────────────────────
    // Fall back to memory-derived time-of-day when the scene has no explicit lighting.
    const effectiveLighting = scene.lighting ?? (memory?.timeOfDay ? `${memory.timeOfDay} lighting` : '')
    const lighting = effectiveLighting ? `[Lighting]: ${effectiveLighting}` : ''

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

    // Force stick figure style on action if detected
    const actionStyle = isStickStyle
      ? 'monochrome black and white stick figure sketch, no colors, no shading, no shadows, flat 2D, '
      : ''
    const action = `[Action]: ${actionStyle}${subjectPart}${expressionPart}`

    // ── Framing (composition only) ────────────────────────────────────────
    const framingParts = [
      scene.framing,
      scene.cameraType,
      scene.eyelineMatch ? `eyeline ${scene.eyelineMatch.toLowerCase()}` : ''
    ].filter(Boolean)
    const framing = framingParts.length ? `[Framing]: ${framingParts.join(', ')}` : ''

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
    const props = effectiveProps.length ? `[Props]: ${effectiveProps.join(', ')}` : ''

    // ── Mood (emotional tone) ─────────────────────────────────────────────
    const moodContent = [scene.mood, ...qualityTags].filter(Boolean).join('. ')
    const mood = moodContent ? `[Mood]: ${moodContent}` : ''

    // ── Global Narrative (Director's Plan) ────────────────────────────────
    let directorCues = ''
    if (globalPlan) {
      const { visualArc, recurringSymbols, emotionalCurve } = globalPlan

      // 1. Visual Arc (Evolution)
      const arcCues = [
        visualArc.lightingEvolution ? `Lighting Style: ${visualArc.lightingEvolution}` : '',
        visualArc.colorPaletteShift ? `Color Palette: ${visualArc.colorPaletteShift}` : '',
        visualArc.styleContinuity ? `Artistic Continuity: ${visualArc.styleContinuity}` : ''
      ]
        .filter(Boolean)
        .join('. ')

      // 2. Recurring Symbols
      const symbolCues = recurringSymbols
        ?.filter((sym) => {
          if (!sym.scenes || sym.scenes.length === 0) return true
          const match = sym.scenes.some(
            (s) =>
              s === scene.id || s === String(scene.sceneNumber) || s.replaceAll(/\D/g, '') === String(scene.sceneNumber)
          )
          return match
        })
        .map((sym) => `RECURRING SYMBOL: Include ${sym.element} (${sym.meaning})`)
        .join('. ')

      // 3. Emotional Curve (Atmosphere/Vibe)
      // Approximate stage based on scene number vs estimated total (heuristic)
      const stageIdx = Math.min(
        emotionalCurve.length - 1,
        Math.floor(((scene.sceneNumber || 1) / 10) * emotionalCurve.length)
      )
      const vibe = emotionalCurve[stageIdx]?.visualVibe ? `Visual Vibe: ${emotionalCurve[stageIdx].visualVibe}` : ''

      // 4. Foreshadowing (Hints of the future)
      const foreshadowCues = globalPlan.foreshadowing
        ?.filter((f) =>
          f.appearsInScenes.some(
            (s) =>
              s === scene.id || s === String(scene.sceneNumber) || s.replaceAll(/\D/g, '') === String(scene.sceneNumber)
          )
        )
        .map((f) => `FORESHADOWING HINT: Subtly include ${f.element} (${f.hintDescription})`)
        .join('. ')

      // 5. Visual Storytelling (Silent-Ready)
      const metaphorCues = globalPlan.visualStorytelling?.keyVisualMetaphors?.length
        ? `VISUAL METAPHORS: Use ${globalPlan.visualStorytelling.keyVisualMetaphors.join(', ')} to reinforce the message visually.`
        : ''
      const clarityCue = globalPlan.visualStorytelling?.clarityStrategy
        ? `CLARITY STRATEGY: ${globalPlan.visualStorytelling.clarityStrategy}`
        : ''

      // 6. Callbacks (Visual Echoes)
      const callbackCues = globalPlan.callbacks
        ?.filter((c) => {
          const s = c.callbackSceneId
          return (
            s === scene.id || s === String(scene.sceneNumber) || s.replaceAll(/\D/g, '') === String(scene.sceneNumber)
          )
        })
        .map(
          (c) =>
            `VISUAL CALLBACK: Reuse composition or element "${c.element}" from original scene ${c.originalSceneId}. Resonance: ${c.meaning}`
        )
        .join('. ')

      // 7. Pacing (Global Rhythm)
      const pacingCue = globalPlan.pacing
        ? `PACING & MOVEMENT: ${globalPlan.pacing.cameraMovementStrategy}. TRANSITION STYLE: ${globalPlan.pacing.transitionPulse}.`
        : ''

      // 8. Art Director's Style (Visual Soul)
      const artisticCue = globalPlan.artisticStyle
        ? `ARTISTIC STYLE: Texture: ${globalPlan.artisticStyle.textureAndGrain}. Line Quality: ${globalPlan.artisticStyle.lineQuality}. Color Harmony: ${globalPlan.artisticStyle.colorHarmonyStrategy}.`
        : ''

      directorCues = [
        arcCues,
        symbolCues,
        vibe,
        foreshadowCues,
        metaphorCues,
        clarityCue,
        callbackCues,
        pacingCue,
        artisticCue
      ]
        .filter(Boolean)
        .join('\n')
    }
    const directorSection = directorCues ? `[Director's Plan]:\n${directorCues}` : ''

    // ── Atmosphere (weather + time of day from memory) ────────────────────
    const weatherContext =
      memory?.weather && !(scene.mood ?? '').toLowerCase().includes(memory.weather) ? memory.weather : ''
    const atmosphere = weatherContext ? `[Atmosphere]: ${weatherContext}` : ''

    // ── Assemble ──────────────────────────────────────────────────────────
    const prompt = [styleLine, directorSection, location, lighting, action, framing, props, mood, atmosphere]
      .filter((b) => b?.trim().length > 0)
      .join('\n')
    const base = prompt
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .trim()

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
    imageStyle?: { characterDescription?: string },
    globalPlan?: import('../types/video-script.types').GlobalNarrativePlan
  ): AnimationPrompt {
    const movements: AnimationPrompt['movements'] = (scene.actions || []).map((a) => ({
      element: 'body',
      description: a || ''
    }))

    const instructions = movements.map((m) => m.description).join('. ')

    return { sceneId: scene.id, instructions, movements }
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
}
