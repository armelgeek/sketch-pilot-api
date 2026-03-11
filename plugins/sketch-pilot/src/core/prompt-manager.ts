/**
 * PromptManager
 *
 * Central class that manages ALL prompts used throughout the character video generator.
 * Every prompt string — for script generation, scene layout, image/animation generation,
 * and asset creation — is built and owned here.
 *
 * Usage:
 *   const pm = new PromptManager({ backgroundColor: '#F5F5F5' });
 *   const sysPrompt = pm.buildScriptSystemPrompt({} as any);
 *   const userPrompt = pm.buildScriptUserPrompt(topic, options);
 *   const imagePrompt = pm.buildImagePrompt(scene);
 */

import type { AnimationPrompt, EnrichedScene, ImagePrompt, VideoGenerationOptions } from '../types/video-script.types'
import { IMAGE_PROMPT_SPEC } from './specs/image-prompt.spec'

import { CORE_SCRIPT_SYSTEM_SPEC } from './specs/script-system.spec'
import type { PromptMakerOptions, VideoTypeSpecification } from './prompt-maker.types'

export class PromptMaker {
  private role: string = ''
  private context: string = ''
  private audienceDefault: string = ''
  private character: string = ''
  private task: string = ''
  private goals: string[] = []
  private structure: string = ''
  private visualStyle: string = ''
  private rules: string[] = []
  private formatting: string = ''
  private outputFormat: string = ''
  private instructions: string[] = []

  // Custom Storytelling Attributes
  private narrativeVoice?: VideoTypeSpecification['narrativeVoice']
  private anchorTechniques?: string[]
  private emotionalArc?: VideoTypeSpecification['emotionalArc']
  private closingQuestionTemplate?: string

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
    this.character = spec.character
    this.task = spec.task
    this.goals = spec.goals
    this.structure = spec.structure
    this.visualStyle = spec.visualStyle
    this.rules = spec.rules
    this.formatting = spec.formatting
    this.outputFormat = spec.outputFormat
    this.instructions = spec.instructions

    this.narrativeVoice = spec.narrativeVoice
    this.anchorTechniques = spec.anchorTechniques
    this.emotionalArc = spec.emotionalArc
    this.closingQuestionTemplate = spec.closingQuestionTemplate
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

  public withCharacter(character: string): this {
    this.character = character
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

  public withVisualStyle(style: string): this {
    this.visualStyle = style
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
   */
  public buildSystemInstructions(): string {
    const sections = [
      `[ROLE]\n${this.role}`,
      `[CONTEXT]\n${this.context}`,
      `[AUDIENCE]\n${this.audienceDefault}`,
      `[CHARACTER]\n${this.character}`,
      `[TASK]\n${this.task}`,
      `[GOALS]\n${this.goals.map((g) => `- ${g}`).join('\n')}`,
      `[STRUCTURE]\n${this.structure}`,
      `[VISUAL STYLE]\n${this.visualStyle}`
    ]

    if (this.narrativeVoice) {
      const nv = this.narrativeVoice
      sections.push(
        `[NARRATIVE VOICE]\n- Person: ${nv.person}\n- Tone: ${nv.tone}\n- Pacing: ${nv.pacing}\n- Forbidden: ${nv.forbidden.join(', ')}`
      )
    }

    if (this.anchorTechniques && this.anchorTechniques.length > 0) {
      sections.push(`[ANCHOR TECHNIQUES]\n${this.anchorTechniques.map((a) => `- ${a}`).join('\n')}`)
    }

    if (this.emotionalArc) {
      const arcStr = Object.entries(this.emotionalArc)
        .map(([act, details]) => `- ${act} (${details.label}): Tension ${details.tension}, Mood: ${details.mood}`)
        .join('\n')
      sections.push(`[EMOTIONAL ARC]\n${arcStr}`)
    }

    sections.push(`[RULES]\n${this.rules.map((r) => `- ${r}`).join('\n')}`, `[SCENES]\n${this.formatting}`)

    if (this.closingQuestionTemplate) {
      sections.push(`[CLOSING QUESTION TEMPLATE]\n${this.closingQuestionTemplate}`)
    }

    sections.push(
      `[JSON OUTPUT FORMAT]\n\nRespond only using the following JSON format. Do not add anything else:\n\n${this.outputFormat}`,
      `[INSTRUCTIONS]\n${this.instructions.map((i) => `- ${i}`).join('\n')}`
    )

    return sections.filter((s) => s.trim().length > 7).join('\n\n')
  }

  /**
   * Build only the user data part (Subject, Duration, Audience)
   */
  public buildUserData(options: PromptMakerOptions): string {
    return `[USER INPUT]\n\nSubject: ${options.subject}\nDuration: ${options.duration}\nAudience: ${options.audience}\nMax Scenes Allowed: ${options.maxScenes} (STRICT LIMIT for the entire video)`
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
}

export class PromptManager {
  private backgroundColor: string

  constructor(config: PromptManagerConfig = {}) {
    this.backgroundColor = config.backgroundColor ?? '#F5F5F5'
  }

  setBackgroundColor(color: string): void {
    this.backgroundColor = color
  }

  /**
   * Calculate words per second based on generation options.
   * Priority:
   * 1. Explicit wordsPerMinute
   * 2. Language-specific defaults
   * 3. Provider-specific defaults
   * 4. Baseline (2.0)
   */
  getWordsPerSecond(options: VideoGenerationOptions): number {
    if (options.wordsPerMinute) {
      return options.wordsPerMinute / 60
    }
    const lang = (options.language || 'en-US').toLowerCase()
    let langBase = 2
    if (lang.startsWith('fr')) langBase = 1.8
    if (lang.startsWith('es')) langBase = 1.9
    if (lang.startsWith('de')) langBase = 1.8

    const provider = options.audioProvider || 'kokoro'
    let providerFactor = 1
    if (provider === 'elevenlabs') providerFactor = 0.9
    if (provider === 'google-tts') providerFactor = 1.1
    if (provider === 'kokoro') providerFactor = 1.35

    return langBase * providerFactor
  }

  private getScriptSpec(options: VideoGenerationOptions): import('./prompt-maker.types').VideoTypeSpecification {
    if (options?.customSpec) {
      return options.customSpec
    }
    // Fallback to core system if no customSpec is provided
    return CORE_SCRIPT_SYSTEM_SPEC
  }

  /**
   * Build only the system instructions for script generation.
   */
  buildScriptSystemPrompt(options: VideoGenerationOptions = {} as any): string {
    let spec = this.getScriptSpec(options)

    // Apply dynamic character name if provided in imageStyle
    if (options.imageStyle?.characterDescription) {
      spec = this.applyDynamicCharacter(spec, options.imageStyle.characterDescription)
    }

    const maker = new PromptMaker(spec)

    // Add specific instruction about words per second if needed
    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      maker.withInstructions([
        ...(spec.instructions || []),
        `NARRATION SPEED: Maintain strictly ${wps.toFixed(2)} words per second for all scenes.`
      ])
    }

    return maker.buildSystemInstructions()
  }

  /**
   * Build only the user data part for script generation.
   */
  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions): string {
    const spec = this.getScriptSpec(options)
    const maker = new PromptMaker(spec)
    const effectiveDuration = this.getEffectiveDuration(options)

    // Calculate max scenes: approx 1 scene per 8-12 seconds -> 6 scenes per minute max.
    const maxScenes = Math.ceil(effectiveDuration / 10)

    return maker.buildUserData({
      subject: topic,
      duration: `${effectiveDuration} seconds`,
      audience: (options as any).audience,
      maxScenes
    })
  }

  /**
   * Builds both system instructions and user prompt for script generation.
   * Consolidates the script planning logic in one place.
   */
  buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): { systemPrompt: string; userPrompt: string } {
    return {
      systemPrompt: this.buildScriptSystemPrompt(options),
      userPrompt: this.buildScriptUserPrompt(topic, options)
    }
  }

  /**
   * Builds a single combined prompt containing both system instructions and user data.
   * Useful when a single system prompt string is expected by the engine.
   */
  buildScriptCompletePrompt(topic: string, options: VideoGenerationOptions = {} as any): string {
    let spec = this.getScriptSpec(options)

    // Apply dynamic character name if provided in imageStyle
    if (options.imageStyle?.characterDescription) {
      spec = this.applyDynamicCharacter(spec, options.imageStyle.characterDescription)
    }

    const maker = new PromptMaker(spec)

    // Add specific instruction about words per second if needed
    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      maker.withInstructions([
        ...(spec.instructions || []),
        `NARRATION SPEED: Maintain strictly ${wps.toFixed(2)} words per second for all scenes.`
      ])
    }

    const effectiveDuration = this.getEffectiveDuration(options)
    const maxScenes = Math.ceil(effectiveDuration / 10)

    return maker.build({
      subject: topic || 'Automated Video Script',
      duration: `${effectiveDuration} seconds`,
      audience: (options as any).audience || 'General Audience',
      maxScenes
    })
  }

  /**
   * Helper to replace "stickman" with a custom character description in the prompt spec.
   */
  private applyDynamicCharacter(spec: VideoTypeSpecification, characterDescription: string): VideoTypeSpecification {
    // If description is too long, we use "character" for actions to keep it natural
    const charName = characterDescription.length > 20 ? 'character' : characterDescription

    const replaceAll = (text: string) => {
      if (!text) return text
      return text.replaceAll(/stickman/gi, charName)
    }

    return {
      ...spec,
      context: replaceAll(spec.context),
      character: replaceAll(spec.character),
      visualStyle: replaceAll(spec.visualStyle),
      outputFormat: replaceAll(spec.outputFormat),
      instructions: (spec.instructions || []).map((i) => replaceAll(i))
    }
  }

  private getEffectiveDuration(options: VideoGenerationOptions): number {
    return options.duration ?? options.maxDuration ?? options.minDuration ?? 60
  }

  /**
   * Build the full system instruction for the image generation model.
   * When reference images are provided, they are the ABSOLUTE SOURCE OF TRUTH.
   * All other instructions serve the reference images, never contradict them.
   */
  buildImageSystemInstruction(hasReferenceImages: boolean): string {
    const spec = IMAGE_PROMPT_SPEC

    const sections = [
      `[IMAGE GENERATION SYSTEM]`,
      spec.context,
      hasReferenceImages
        ? `═══════════════════════════════════════════════════════════════════════════════
REFERENCE - DRIVEN MODE: ABSOLUTE AUTHORITY
═══════════════════════════════════════════════════════════════════════════════
Reference images provided are the ONLY visual source of truth. 
Match character identity, clothing, and artistic style 100%.`
        : '',
      `[VISUAL STYLE]\n${spec.visualStyle}`,
      `[RULES]\n- NO TEXT: Strictly NO words, labels, letters, or speech bubbles in the image.\n${spec.rules.map((r) => `- ${r}`).join('\n')}`,
      `[INSTRUCTIONS]\n- Ensure the background is mathematically flat and solid white (#FFFFFF).\n- Never draw any text, even if requested in the scene description.\n${spec.instructions.map((i) => `- ${i}`).join('\n')}`
    ]

    return sections.filter((s) => s && s.trim().length > 0).join('\n\n')
  }

  /**
   * Build a complete scene image generation prompt as a single, continuous prompt string
   * ready for use with Stable Diffusion, Midjourney, or Nano Banana.
   * The visual style, character description, and quality tags are fully configurable via imageStyle.
   *
   * Default output (Crayon Capital style):
   * "2D clean vector cartoon in Crayon Capital style, round-headed faceless characters,
   * [pose/action], accurate [expression] expression, [background], [qualityTags...], [aspects ratio]."
   */
  buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    imageStyle?: { stylePrefix?: string; characterDescription?: string; qualityTags?: string[] }
  ): ImagePrompt {
    const elements = this.extractSceneElements(scene)

    // Style comes from imageStyle config with sensible Crayon Capital defaults
    const stylePrefix = imageStyle?.stylePrefix ?? ''

    // Character description: combine global description with scene-specific variant
    const baseCharacter = imageStyle?.characterDescription ?? 'minimal character with simple facial features'
    const variantPart = scene.characterVariant ? ` (${scene.characterVariant})` : ''
    const characterPart = hasReferenceImages ? '' : `${baseCharacter}${variantPart}`

    const qualityTags = imageStyle?.qualityTags ?? [
      'consistent outfits',
      'flat lighting',
      'medium outlines',
      'full frame edge-to-edge',
      'pure solid flat background',
      'no borders',
      'no rounded corners',
      'no vignette',
      'no text',
      'no words',
      'no letters',
      'no labels',
      'no speech bubbles',
      'no thought bubbles',
      'exactly 2 arms',
      'exactly 2 legs',
      'normal human anatomy',
      'NO EXTRA LIMBS',
      'SINGLE CHARACTER',
      'SINGLE COMPOSITION',
      'NO COLLAGE',
      'NO MULTI-POSE'
    ]

    // Scene-specific parts (dynamic per scene)
    const expressionPart = scene.expression ? `accurate ${scene.expression} expression` : 'accurate expression'
    const moodPart = scene.mood ? `${scene.mood} mood` : ''
    const posePart = elements.pose ?? ''
    const actionPart = elements.action && elements.action !== elements.pose ? elements.action : ''
    const propsPart = scene.props && scene.props.length > 0 ? `props: ${scene.props.join(', ')}` : ''

    // Background and Environment
    const lightingPart = scene.lighting ? `${scene.lighting} lighting` : ''
    const backgroundPart = scene.background
      ? scene.background
      : hasReferenceImages
        ? 'consistent background from reference'
        : 'muted minimal background'

    // Cinematic attributes
    const framingPart = scene.framing ? `${scene.framing}` : 'cinematic framing'
    const cameraPart = scene.cameraType ? `${scene.cameraType} shot` : ''
    const eyelinePart = scene.eyelineMatch ? `looking ${scene.eyelineMatch}` : ''

    // Progressive elements (for continuity)
    const progressivePart =
      scene.continueFromPrevious && scene.progressiveElements && scene.progressiveElements.length > 0
        ? `adding new elements: ${scene.progressiveElements.join(', ')}`
        : ''

    // Compose scene description (replace "stickman" if it leaked in from the actions)
    const replaceStickman = (text: string) => text.replaceAll(/stickman/gi, characterPart || 'character')
    const sceneDescription = [replaceStickman(posePart), replaceStickman(actionPart), progressivePart]
      .filter(Boolean)
      .join(', ')

    // Sanitize: strip text/bubble contradictions and character descriptions
    // When reference images exist, strip ALL parenthetical descriptions (the image is the truth)
    const sanitizedScene = this.sanitizeForImageGen(sceneDescription, hasReferenceImages)
    const sanitizedBg = this.sanitizeForImageGen(backgroundPart, hasReferenceImages)

    // Build the final prompt string: style → character → scene → expression → mood → framing → camera → lighting → background → quality → ratio
    const parts = [
      stylePrefix,
      characterPart,
      sanitizedScene,
      expressionPart,
      moodPart,
      framingPart,
      cameraPart,
      lightingPart,
      eyelinePart,
      sanitizedBg,
      ...qualityTags,
      propsPart,
      aspectRatio
    ].filter(Boolean)

    // Final length cap: Gemini image gen works best with prompts under ~500 chars
    let prompt = `${parts.join(', ')}.`
    if (prompt.length > 550) {
      // Deduplicate any remaining parenthetical character descriptions
      prompt = prompt.replaceAll(/(\([^)]{20,}\))(?=.*\1)/g, '')
      // Collapse whitespace
      prompt = prompt
        .replaceAll(/,\s*,/g, ',')
        .replaceAll(/\s{2,}/g, ' ')
        .trim()
    }

    return {
      sceneId: scene.id,
      prompt,
      elements: {
        pose: elements.pose,
        action: elements.action,
        expression: scene.expression,
        props: scene.props,
        background: scene.background || this.backgroundColor
      }
    }
  }

  /**
   * Build animation instructions for a scene.
   */
  buildAnimationPrompt(scene: EnrichedScene, imageStyle?: { characterDescription?: string }): AnimationPrompt {
    const characterName = imageStyle?.characterDescription ?? 'character'
    const replaceStickman = (text: string) => text.replaceAll(/stickman/gi, characterName)

    const movements: AnimationPrompt['movements'] = (scene.actions || []).map((a) => ({
      element: 'body',
      description: replaceStickman(a || '')
    }))

    // Default to the new detailed format as a fallback
    const timing = [
      '0.0–1.0 sec: Fade-in / static frame.',
      `1.0–5.0 sec: Slow zoom-in on ${characterName} + mouth movement.`,
      '5.0–7.0 sec: Mouth stops, expression shifts.',
      '7.0–10.0 sec: Slow zoom-out.',
      '10.0–12.0 sec: Transition prep.'
    ].join(' ')

    const gesturePart = movements.map((m) => m.description).join('. ')
    const instructions = `${timing} ${gesturePart ? `Gestures: ${gesturePart}.` : ''} Body stays static.`

    return { sceneId: scene.id, instructions, movements }
  }

  /**
   * Build a system prompt for generating multiple titles.
   */
  buildTitleProposalSystemPrompt(): string {
    return `You are a viral YouTube title expert. Propose 5 compelling, clickable, yet honest titles for the given topic.
Return only JSON: { titles: ["...", "...", ...] }`
  }

  /**
   * Build the user prompt for title proposals.
   */
  buildTitleProposalUserPrompt(topic: string): string {
    return `Topic: ${topic}`
  }

  /**
   * Sanitize text for image generation:
   * - Remove text/speech/thought bubble references (contradicts "no text" rule)
   * - Remove quoted text labels (e.g., 'Skill?', "IMMEDIATE GRATIFICATION")
   * - Remove duplicate long parenthetical character descriptions
   * - Collapse whitespace
   */
  private sanitizeForImageGen(text: string, stripAllParentheses: boolean = false): string {
    if (!text) return text
    let s = text
    // Remove quoted text labels
    s = s.replaceAll(/'[^']{1,60}'/g, '')
    s = s.replaceAll(/"[^"]{1,60}"/g, '')
    // Remove text/speech/thought bubble references

    // Strip timing tags like "0.0-1.0s:"
    s = s.replace(/^\d[\d.-]*s?:\s*/i, '')

    // When reference images exist, strip ALL parenthetical descriptions (image = source of truth)
    if (stripAllParentheses) {
      s = s.replaceAll(/\([^)]*\)/g, '')
    } else {
      // Only keep the first parenthetical character description, remove duplicates
      let firstParen = true
      s = s.replaceAll(/\([^)]{20,}\)/g, (match) => {
        if (firstParen) {
          firstParen = false
          return match
        }
        return ''
      })
    }
    // Collapse artifacts
    s = s
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .replaceAll(/\s+\./g, '.')
      .trim()
    return s
  }

  private extractSceneElements(scene: EnrichedScene): { pose: string; action: string } {
    const actions = (scene.actions || [])
      .map((a) =>
        // Strip leading timing tags from individual action strings if present
        a.replace(/^\d+(\.\d+)?(-?\d+(\.\d+)?)?s:\s*/i, '').trim()
      )
      .filter(Boolean)

    return {
      pose: actions[0] || '',
      action: actions.length > 1 ? actions.join('. ') : actions[0] || ''
    }
  }
}
