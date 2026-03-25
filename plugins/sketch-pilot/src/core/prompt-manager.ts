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
  private backgroundColor: string
  private spec?: VideoTypeSpecification

  constructor(config: PromptManagerConfig = {}) {
    this.backgroundColor = config.backgroundColor ?? '#F5F5F5'
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

    // 2. Gender Neutrality (Phase 28)
    if (this.isNeutralVisuals(undefined, undefined, spec.name)) {
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

    return this.buildSystemInstructions({ ...spec, instructions })
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
    stylePrefix?: string,
    globalPlan?: import('../types/video-script.types').GlobalNarrativePlan
  ): string {
    const spec = this.spec
    if (!spec) return ''

    const referenceMode = hasReferenceImages
      ? 'REFERENCE MODE (CRITICAL): You are provided with specific CHARACTER REFERENCE IMAGES. You MUST strictly copy the visual identity (face, hair style, distinctive clothing, and proportions) of the characters from these images. DO NOT invent new characters. DO NOT deviate from the characters shown in the references.'
      : ''

    const styleAnchor = [
      `VISUAL STYLE: ${stylePrefix ? `The scene MUST be rendered in a "${stylePrefix}" style.` : 'Always render in a clean, flat 2D illustration style.'}`,
      `CINEMATIC COMPOSITION: Use the Rule of Thirds and Negative Space. Maintain a clean, professional "faceless animation" look.`
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

      globalDirectorCues = `GLOBAL NARRATIVE PLAN:
- VISUAL ARC: ${arc}
- EMOTIONAL CURVE: ${vibe}
- ARTISTIC STYLE: ${art}`
    }

    const imageSpec: VideoTypeSpecification = {
      ...spec,
      instructions: [
        ...(referenceMode ? [referenceMode] : []),
        styleAnchor,
        ...(globalDirectorCues ? [globalDirectorCues] : []),
        ...(spec.instructions || [])
      ]
    }

    return this.buildSystemInstructions(imageSpec)
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
    const isStickStyle = this.isNeutralVisuals(imageStyle?.stylePrefix, imageStyle?.characterDescription)
    const elements = this.extractSceneElements(scene)

    // 1. Resolve Subject and Core Action
    const actionPart = this.resolveActionAndSubject(scene, isStickStyle, characterSheets, imageStyle)

    // 2. Resolve Environment & Setup
    const { locationPart, rawBg } = this.resolveLocation(scene, memory, isStickStyle, imageStyle?.stylePrefix)
    const effectiveProps = this.resolveSceneProps(scene, memory)
    const propsPart = effectiveProps.length ? `featuring ${effectiveProps.join(', ')}` : ''

    // 3. Resolve Atmosphere & Cinematography
    const lightingPart = scene.lighting ?? (memory?.timeOfDay ? `${memory.timeOfDay} lighting` : '')
    const weatherContext =
      memory?.weather && !(scene.mood ?? '').toLowerCase().includes(memory.weather) ? memory.weather : ''
    const moodContent = [scene.mood, ...(imageStyle?.qualityTags ?? [])].filter(Boolean).join(', ')
    const framingParts = [
      scene.framing,
      scene.cameraType,
      scene.eyelineMatch ? `eyeline ${scene.eyelineMatch.toLowerCase()}` : ''
    ].filter(Boolean)
    const framing = framingParts.length ? `shot as ${framingParts.join(', ')}` : ''

    // 4. Style Prefix (Integrated smoothly)
    const stylePrefix = imageStyle?.stylePrefix ? `in ${imageStyle.stylePrefix} style` : ''
    const reinforceStick =
      isStickStyle && !stylePrefix.toLowerCase().includes('stick') ? 'minimalist whiteboard stick figure style' : ''
    const stylePart = [stylePrefix, reinforceStick].filter(Boolean).join(', ')

    // Build natural paragraph
    const paragraph = [
      actionPart,
      locationPart ? `in ${locationPart}` : '',
      propsPart,
      lightingPart || weatherContext || moodContent
        ? `with ${[lightingPart, weatherContext, moodContent].filter(Boolean).join(', ')}`
        : '',
      framing,
      stylePart
    ]
      .filter((b) => b.trim().length > 0)
      .join(', ')

    // Cleanup grammar
    const finalPrompt = `${paragraph
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .replaceAll(', with ,', ' with')
      .replaceAll(', in ,', ' in')
      .trim()}.`

    return {
      sceneId: scene.id,
      prompt: finalPrompt,
      elements: {
        pose: elements.pose,
        action: elements.action,
        expression: scene.expression,
        props: effectiveProps,
        background: this.resolveLocation(scene, memory).rawBg || this.backgroundColor
      }
    }
  }

  // ─── Image Prompt Refactored Helpers ─────────────────────────────────────

  private isNeutralVisuals(stylePrefix?: string, charDesc?: string, specName?: string): boolean {
    const regex = /\b(stick|stickfigure|whiteboard)\b/i
    return regex.test(stylePrefix || '') || regex.test(charDesc || '') || regex.test(specName || '')
  }

  private resolveStyleLine(isStickStyle: boolean, stylePrefix?: string): string {
    if (!stylePrefix) return ''
    const reinforcement = isStickStyle
      ? 'STRICTLY Monochrome black and white, no colors, no shading, no shadows, no gradients, no volume, no 3D effects, flat 2D only, STRICTLY MINIMALIST, minimal line count, plenty of empty white space, ink on pure white background, '
      : ''
    return `[Style]: ${reinforcement}${stylePrefix}`
  }

  private resolveLocation(
    scene: EnrichedScene,
    memory?: SceneMemory,
    isStickStyle?: boolean,
    stylePrefix?: string
  ): { locationPart: string; rawBg: string } {
    const memoryLocation = scene.locationId ? memory?.locations.get(scene.locationId) : undefined
    const rawBg = memoryLocation?.prompt ?? scene.background ?? this.spec?.defaultBackgroundPrompt ?? ''
    return {
      locationPart: this.sanitizeForImageGen(rawBg).toLowerCase(),
      rawBg
    }
  }

  private resolveSceneProps(scene: EnrichedScene, memory?: SceneMemory): string[] {
    const sceneProps = scene.props
    const memoryProps = this.resolveMemoryProps(scene, memory)

    if (sceneProps === undefined) return memoryProps
    if (sceneProps.length === 0) return []
    return Array.from(new Set([...memoryProps, ...sceneProps]))
  }

  private resolveDirectorCues(
    scene: EnrichedScene,
    globalPlan?: import('../types/video-script.types').GlobalNarrativePlan
  ): string {
    if (!globalPlan) return ''

    const sceneContext = `${scene.summary} ${(scene.actions || []).join(' ')}`.toLowerCase()
    const metaphor = (globalPlan.visualStorytelling?.keyVisualMetaphors || []).find((m) => {
      const words = m
        .toLowerCase()
        .split(/[\s/"':()]+/)
        .filter((w) => w.length > 4)
      return words.some((w) => sceneContext.includes(w))
    })

    const symbol = globalPlan.recurringSymbols?.find((sym) => {
      return sym.scenes?.some(
        (s) =>
          s === scene.id || s === String(scene.sceneNumber) || s.replaceAll(/\D/g, '') === String(scene.sceneNumber)
      )
    })

    const cues = [metaphor ? `Metaphor: ${metaphor}` : '', symbol ? `Symb: ${symbol.element}` : '']
      .filter(Boolean)
      .join(', ')
    return cues ? `Dir: ${cues}` : ''
  }

  private resolveActionAndSubject(
    scene: EnrichedScene,
    isStickStyle: boolean,
    characterSheets?: import('../types/video-script.types').CharacterSheet[],
    imageStyle?: { characterDescription?: string }
  ): string {
    const elements = this.extractSceneElements(scene)

    // Core action from AI prompt
    const sceneCore = scene.imagePrompt?.trim()
      ? this.sanitizeForImageGen(scene.imagePrompt.trim())
      : this.sanitizeForImageGen(
          [elements.pose, elements.action !== elements.pose ? elements.action : ''].filter(Boolean).join(' ')
        )

    // Characters definition
    const allCharacterIds = Array.from(
      new Set([...(scene.characterIds || []), ...(scene.speakingCharacterId ? [scene.speakingCharacterId] : [])])
    ).filter(Boolean)
    const characterDescriptions: string[] = []

    for (const charId of allCharacterIds) {
      const casting = characterSheets?.find(
        (c) => c.id?.toLowerCase() === charId.toLowerCase() || c.name?.toLowerCase() === charId.toLowerCase()
      )
      let charDesc = charId

      if (casting) {
        let clothing = casting.appearance?.clothing || ''
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

        if (parts.length > 0) charDesc += ` (${parts.join(', ').trim().toLowerCase()})`
      }
      // Omitted meta-brackets like [VISUAL IDENTITY FROM PROVIDED REFERENCES] to avoid confusing the model
      characterDescriptions.push(charDesc)
    }

    const baseCharacter = imageStyle?.characterDescription || characterDescriptions.join(' and ')
    const characterIdentity = `${baseCharacter}${scene.characterVariant ? ` (${scene.characterVariant})` : ''}`.trim()

    // Integrate subject with action
    const identityAlreadyInCore =
      characterIdentity && sceneCore.toLowerCase().includes(characterIdentity.toLowerCase().split(' ')[0])
    let combined = characterIdentity && !identityAlreadyInCore ? `${characterIdentity} is ${sceneCore}` : sceneCore

    if (scene.expression) combined += `, looking ${scene.expression}`

    // Clean up typical AI prefixes
    return combined.replace(/^(Action:\s*|Illustrating\.\.\s*|Whiteboard illustration:\s*)/i, '')
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
      `Target Language: ${options.language || 'English'} (You MUST generate ALL narration, titles, and text in this language)`,
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
          if (char.stylePrefix || char.artistPersona) {
            const styles = [char.stylePrefix, char.artistPersona].filter(Boolean).join(', ')
            line += ` [Visual Style: ${styles}]`
          }
          return line
        })
        .join('\n')
      return `CAST OF CHARACTERS:\n${cast}\n\nYou must use these specific Character Names and Model IDs in your script.`
    }

    return `CHARACTER IDENTIFICATION:\n- Automatically identify the core characters relevant to this subject.\n- For each character, define their name, role, gender ("male", "female", or "unknown"), and age ("child", "youth", "senior", or "unknown").\n- These attributes must be returned in the \`metadata\` object for each item in the \`characterSheets\` array.`
  }
}
