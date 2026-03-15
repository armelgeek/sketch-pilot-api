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
   */
  public buildSystemInstructions(): string {
    const sections = []

    if (this.role) sections.push(this.role)
    if (this.context) sections.push(this.context)
    if (this.task) sections.push(this.task)
    if (this.goals?.length) sections.push(this.goals.join('\n'))
    if (this.structure) sections.push(this.structure)
    if (this.rules?.length) sections.push(this.rules.join('\n'))
    if (this.formatting) sections.push(this.formatting)
    if (this.outputFormat) sections.push(this.outputFormat)
    if (this.instructions?.length) sections.push(this.instructions.join('\n'))

    return sections.filter((s) => s.trim().length > 0).join('\n\n')
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
      '',
      this.buildCharacterInstructions(options)
    ]

    return lines.join('\n')
  }

  /**
   * Build specific instructions for character discovery if needed.
   */
  private buildCharacterInstructions(options: PromptMakerOptions): string {
    if (options.characters && options.characters.length > 0) {
      const cast = options.characters
        .map((char) => `- ${char.name}${char.modelId ? ` (Model ID: ${char.modelId})` : ''}`)
        .join('\n')
      return `CAST OF CHARACTERS (Mandatory):\n${cast}\n\nYou MUST use these specific Character Names and Model IDs in your script.`
    }

    return `CHARACTER IDENTIFICATION:
- Automatically identify the core characters in this story.
- For each character, you MUST define their name, role, gender ("male", "female", or "unknown"), and age ("child", "youth", "senior", or "unknown").
- These attributes MUST be returned in the \`metadata\` object for each item in the \`characterSheets\` array.`
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

  private getEffectiveSpec(options: VideoGenerationOptions): VideoTypeSpecification {
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
  buildScriptSystemPrompt(options: VideoGenerationOptions = {} as any): string {
    const spec = this.getEffectiveSpec(options)
    const maker = new PromptMaker(spec)

    // Add specific instruction about words per second if needed
    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      maker.withInstructions([...(spec.instructions || []), `NARRATION SPEED: ${wps.toFixed(2)}`])
    }

    return maker.buildSystemInstructions()
  }

  /**
   * Build only the user data part for script generation.
   */
  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)
    const maker = new PromptMaker(spec)
    const effectiveDuration = this.getEffectiveDuration(options)
    const targetSceneCount = options.sceneCount ?? computeSceneCount(effectiveDuration)

    return maker.buildUserData({
      subject: topic,
      duration: `${effectiveDuration} seconds`,
      aspectRatio: options.aspectRatio || '16:9',
      audience: (options as any).audience || spec.audienceDefault,
      maxScenes: targetSceneCount,
      characters: options.characters
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
    const maxScenes = Math.ceil(effectiveDuration / 10)

    return maker.build({
      subject: topic || 'Automated Video Script',
      duration: `${effectiveDuration} seconds`,
      aspectRatio: options.aspectRatio || '16:9',
      audience: (options as any).audience || 'General Audience',
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
   */
  buildImageSystemInstruction(hasReferenceImages: boolean): string {
    const spec = this.spec
    if (!spec) return ''

    const referenceMode = hasReferenceImages
      ? `REFERENCE-DRIVEN MODE: Reference images provided are the ONLY visual source of truth. Match character identity, clothing, and artistic style 100%.`
      : ''

    const sections = [spec.context, referenceMode, ...(spec.rules || []), ...(spec.instructions || [])]

    return sections.filter((s) => s && s.trim().length > 0).join('\n\n')
  }

  /**
   * Build a complete scene image generation prompt.
   * Fully Character-Agnostic.
   */
  buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    imageStyle?: { stylePrefix?: string; characterDescription?: string; qualityTags?: string[] }
  ): ImagePrompt {
    const elements = this.extractSceneElements(scene)

    const stylePrefix = imageStyle?.stylePrefix ?? ''
    const qualityTags = imageStyle?.qualityTags ?? []

    // 1. Character Identification
    const baseCharacter = imageStyle?.characterDescription || ''
    const characterVariant = scene.characterVariant ? ` (${scene.characterVariant})` : ''
    const characterIdentity = `${baseCharacter}${characterVariant}`.trim()

    // 2. Action & Expression
    const expressionDesc = scene.expression ? `with a ${scene.expression.toLowerCase()} expression` : ''
    const moodDesc = scene.mood ? `embodying a ${scene.mood.toLowerCase()} mood` : ''

    const posePart = elements.pose ?? ''
    const actionPart = elements.action && elements.action !== elements.pose ? elements.action : ''

    const progressivePart =
      scene.continueFromPrevious && scene.progressiveElements && scene.progressiveElements.length > 0
        ? scene.progressiveElements.join(', ')
        : ''

    const sceneDescription = scene.imagePrompt
      ? scene.imagePrompt
      : [posePart, actionPart, progressivePart].filter(Boolean).join(', ')

    const sanitizedScene = this.sanitizeForImageGen(sceneDescription, hasReferenceImages)

    // 3. Environment & Setup
    const backgroundPart = scene.background || this.spec?.defaultBackgroundPrompt || ''
    const sanitizedBg = this.sanitizeForImageGen(backgroundPart, hasReferenceImages)
    const backgroundDesc = sanitizedBg ? `set against ${sanitizedBg}` : ''

    const framingPart = scene.framing ?? ''
    const cameraPart = scene.cameraType ?? ''
    const setupPart = [framingPart, cameraPart].filter(Boolean).join(' ')
    const lightingPart = scene.lighting ? `lit by ${scene.lighting.toLowerCase()}` : ''

    // 4. Details & Technical
    const propsPart = scene.props && scene.props.length > 0 ? `visible props: ${scene.props.join(', ')}` : ''
    const eyelinePart = scene.eyelineMatch ? `eyeline directed ${scene.eyelineMatch.toLowerCase()}` : ''

    const parts = [
      stylePrefix,
      `${characterIdentity} ${sanitizedScene}`.trim(),
      expressionDesc,
      moodDesc,
      setupPart,
      lightingPart,
      eyelinePart,
      backgroundDesc,
      ...qualityTags,
      propsPart,
      aspectRatio
    ].filter((p) => p && p.trim().length > 0)

    let prompt = parts.join(', ')

    // Final cleanup
    prompt = prompt
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .replaceAll(': ,', ': ')
      .trim()

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
   * Fully Character-Agnostic.
   */
  buildAnimationPrompt(scene: EnrichedScene, imageStyle?: { characterDescription?: string }): AnimationPrompt {
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

  private sanitizeForImageGen(text: string, stripAllParentheses: boolean = false): string {
    if (!text) return text
    let s = text
    s = s.replace(/^\d[\d.-]*s?:\s*/i, '')

    if (stripAllParentheses) {
      s = s.replaceAll(/\([^)]*\)/g, '')
    } else {
      let firstParen = true
      s = s.replaceAll(/\([^)]{20,}\)/g, (match) => {
        if (firstParen) {
          firstParen = false
          return match
        }
        return ''
      })
    }
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

    return {
      pose: actions[0] || '',
      action: actions.length > 1 ? actions.join('. ') : actions[0] || ''
    }
  }
}
