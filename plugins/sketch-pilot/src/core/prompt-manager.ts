import { CharacterModelRepository } from '../../../../src/infrastructure/repositories/character-model.repository'
import { BASE_SPEC } from '../config/script-templates'
import { computeSceneCountRange } from '../types/video-script.types'
import type { AnimationPrompt, EnrichedScene, ImagePrompt, VideoGenerationOptions } from '../types/video-script.types'
import type { PromptMakerOptions, VideoTypeSpecification } from './prompt-maker.types'

import type { SceneMemory } from './scene-memory'
// Modular imports
import * as Constants from './constants/prompt-constants'
import * as NarrationCorrector from './logic/narration-corrector'
import * as NarrationValidator from './logic/narration-validator'
import { IMAGE_RULES, IMAGE_STYLE_ANCHORS } from './templates/image-templates'
import { buildLegacyScriptSystemPrompt } from './templates/legacy-templates'
import * as NarrationTemplates from './templates/narration-templates'
import { getConsolidatedOutputFormat } from './templates/output-formats'
import { buildRetryFeedback as buildRetryFeedbackTemplate } from './templates/retry-templates'
import { buildScaffoldPrompt } from './templates/scaffold-templates'
import * as StructuringTemplates from './templates/structuring-templates'

import { buildHardConstraint } from './templates/user-data-templates'

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

type Preset = keyof typeof Constants.PRESET_MIN_WORDS

// ─── Helper: detect OpenAI-family providers ───────────────────────────────────
function isOpenAIProvider(provider: string): boolean {
  return ['openai', 'gpt4o', 'gpt-4o'].includes(provider.toLowerCase())
}

// ─────────────────────────────────────────────────────────────────────────────

export class PromptManager {
  /** @deprecated Use getWordsPerSecond() which is provider-aware. */
  public static readonly REAL_TTS_WPS = 2.45
  /** @deprecated Use getSafetyFactor() which is provider-aware. */
  public static readonly SAFETY_FACTOR = 1.15

  private readonly spec?: VideoTypeSpecification
  private readonly characterModelId?: string
  private readonly characterRepository = new CharacterModelRepository()

  constructor(config: PromptManagerConfig = {}) {
    this.spec = config.scriptSpec
    this.characterModelId = config.characterModelId
  }

  // ─── Provider helpers ──────────────────────────────────────────────────────

  private resolveProvider(options: VideoGenerationOptions): string {
    return (options.audioProvider || 'elevenlabs').toLowerCase()
  }

  private getSafetyFactor(options: VideoGenerationOptions): number {
    const provider = this.resolveProvider(options)
    return Constants.PROVIDER_SAFETY_FACTOR[provider] ?? Constants.DEFAULT_SAFETY_FACTOR
  }

  public getPublicSafetyFactor(options: VideoGenerationOptions): number {
    return this.getSafetyFactor(options)
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

  getWordsPerSecond(options: VideoGenerationOptions): number {
    if (options.wordsPerMinute) {
      return options.wordsPerMinute / 60
    }
    const provider = this.resolveProvider(options)
    if (Constants.PROVIDER_WPS[provider] !== undefined) {
      return Constants.PROVIDER_WPS[provider]
    }
    return Constants.DEFAULT_WPS
  }

  public getEffectiveSpec(options: VideoGenerationOptions): VideoTypeSpecification {
    const rawSpec = options?.customSpec ?? this.spec
    if (!rawSpec) {
      throw new Error('[PromptManager] No specification provided and no customSpec found.')
    }
    return {
      ...BASE_SPEC,
      ...rawSpec,
      visualRules: [...(BASE_SPEC.visualRules || []), ...(rawSpec.visualRules || [])],
      orchestration: [...(BASE_SPEC.orchestration || []), ...(rawSpec.orchestration || [])],
      narrativeRules: [...(BASE_SPEC.narrativeRules || []), ...(rawSpec.narrativeRules || [])],
      curiosityRules: [...(BASE_SPEC.curiosityRules || []), ...(rawSpec.curiosityRules || [])],
      escalationRules: [...(BASE_SPEC.escalationRules || []), ...(rawSpec.escalationRules || [])],
      conclusionRules: [...(BASE_SPEC.conclusionRules || []), ...(rawSpec.conclusionRules || [])],
      identityTriggers: [...(BASE_SPEC.identityTriggers || []), ...(rawSpec.identityTriggers || [])],
      patternInterrupts: [...(BASE_SPEC.patternInterrupts || []), ...(rawSpec.patternInterrupts || [])],
      antiBoringRules: [...(BASE_SPEC.antiBoringRules || []), ...(rawSpec.antiBoringRules || [])],
      scenePresets: {
        ...(BASE_SPEC.scenePresets || {}),
        ...(rawSpec.scenePresets || {})
      }
    } as VideoTypeSpecification
  }

  public getEffectiveDuration(options: VideoGenerationOptions): number {
    return options.duration
  }

  // ─── Per-preset word count helpers ────────────────────────────────────────

  private computePresetTargets(avgWordsPerScene: number): {
    hook: number
    reveal: number
    mirror: number
    conclusion: number
    bridge: number
  } {
    return {
      hook: Math.max(Constants.PRESET_MIN_WORDS.hook, Math.round(avgWordsPerScene * 0.7)),
      reveal: Math.max(Constants.PRESET_MIN_WORDS.reveal, Math.round(avgWordsPerScene * 1.3)),
      mirror: Math.max(Constants.PRESET_MIN_WORDS.mirror, Math.round(avgWordsPerScene)),
      conclusion: Math.max(Constants.PRESET_MIN_WORDS.conclusion, Math.round(avgWordsPerScene * 1.1)),
      bridge: Math.max(Constants.PRESET_MIN_WORDS.bridge, Math.round(avgWordsPerScene * 0.8))
    }
  }

  // ─── [FIX v7 + v8 + v8-clean] Voice-first scaffold instruction builder ────

  private buildScaffoldInstruction(preset: keyof typeof Constants.SCENE_PRESETS, wordTarget: number): string {
    return buildScaffoldPrompt(preset, wordTarget)
  }

  // ─── Narration Validator & Auto-Corrector ─────────────────────────────────

  public validateAndCorrectNarration(
    narration: string,
    preset: Preset
  ): {
    corrected: string
    violations: string[]
    isValid: boolean
  } {
    return NarrationValidator.validateAndCorrectNarration(narration, preset)
  }

  // ─── LLM micro-correction for semantic violations ─────────────────────────

  public async correctNarrationWithLLM(
    scene: { sceneNumber: number; preset: string; narration: string },
    llmClient: { complete: (prompt: string) => Promise<string> }
  ): Promise<{ corrected: string; changes: string[] }> {
    return NarrationCorrector.correctNarrationWithLLM(scene, llmClient)
  }

  // ─── Batch validator + corrector for all scenes ───────────────────────────

  public async validateAndCorrectAllScenes(
    scenes: Array<{ sceneNumber: number; preset: string; narration: string }>,
    llmClient?: { complete: (prompt: string) => Promise<string> }
  ): Promise<{
    correctedScenes: Array<{ sceneNumber: number; preset: string; narration: string }>
    allViolations: Array<{ sceneNumber: number; violations: string[] }>
    needsRetry: boolean
    isValid: boolean
  }> {
    const correctedScenes: Array<{ sceneNumber: number; preset: string; narration: string }> = []
    const allViolations: Array<{ sceneNumber: number; violations: string[] }> = []

    for (const scene of scenes) {
      const preset = (scene.preset ?? 'mirror') as Preset

      // Step 1: JS correction (0 token)
      const { corrected: jsCorrected, violations } = this.validateAndCorrectNarration(scene.narration, preset)

      let finalNarration = jsCorrected

      // Step 2: LLM semantic correction (~200 tokens/scene)
      if (llmClient) {
        const { corrected: llmCorrected, changes } = await this.correctNarrationWithLLM(
          { ...scene, narration: jsCorrected },
          llmClient
        )
        finalNarration = llmCorrected

        if (changes.length > 0) {
          violations.push(...changes.map((c: string) => `[LLM fixed] ${c}`))
        }
      }

      correctedScenes.push({ ...scene, narration: finalNarration })

      if (violations.length > 0) {
        allViolations.push({ sceneNumber: scene.sceneNumber, violations })
      }
    }

    const coherenceViolations = NarrationValidator.validateNarrativeCoherence(correctedScenes)
    if (coherenceViolations.length > 0) {
      allViolations.push({
        sceneNumber: 0,
        violations: coherenceViolations
      })
    }

    const needsRetry = allViolations.some((v) =>
      v.violations.some((msg) => msg.includes('Word count too low') || msg.includes('Sentence count too low'))
    )

    return {
      correctedScenes,
      allViolations,
      needsRetry,
      isValid: allViolations.length === 0
    }
  }

  // ─── Duration-based retry feedback (legacy single-pass) ───────────────────

  public buildRetryFeedback(
    validationError: string,
    attempt: number,
    scenes: Array<{ preset?: string; narration?: string; wordCount?: number; sceneNumber?: number }> | undefined,
    targetWords: number,
    actualWords: number,
    options?: VideoGenerationOptions
  ): string {
    const wps = options ? this.getWordsPerSecond(options) : Constants.DEFAULT_WPS
    return buildRetryFeedbackTemplate(validationError, attempt, scenes, targetWords, actualWords, wps)
  }

  // ─── Two-pass public orchestrators ───────────────────────────────────────

  public async buildTwoPassPrompts(
    topic: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): Promise<{
    pass1: { system: string; user: string; targetWords: number }
  }> {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const target = targetWords ?? Math.round(duration * wps * safetyFactor)
    const lang = (options as any).language || 'English'
    const spec = this.getEffectiveSpec(options)
    const audience = (options as any).audience || spec.audienceDefault || 'general audience'

    const characterMetadata = await this.resolveCharacterMetadata()
    const fullSpec = {
      ...spec,
      characterDescription: characterMetadata
        ? `${characterMetadata.description}. Personality: ${characterMetadata.artistPersona}.`
        : spec.characterDescription,
      targetDuration: duration,
      targetWordCount: target
    }

    const specInstructions = this.buildSystemInstructions(fullSpec as any)

    return {
      pass1: {
        system: NarrationTemplates.buildNarrationOnlySystemPrompt(duration, target, wps, specInstructions),
        user: NarrationTemplates.buildNarrationOnlyUserPrompt(topic, target, duration, wps, lang, audience),
        targetWords: target
      }
    }
  }

  public validateNarrationPass(
    narration: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): {
    ok: boolean
    actualWords: number
    targetWords: number
    deficit: number
    missingSeconds: number
  } {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const target = targetWords ?? Math.round(duration * wps * safetyFactor)

    const actualWords = narration.trim().split(/\s+/).filter(Boolean).length
    const deficit = Math.max(0, target - actualWords)
    const missingSeconds = Math.round(deficit / wps)
    const ok = actualWords >= Math.round(target * 0.9)

    return { ok, actualWords, targetWords: target, deficit, missingSeconds }
  }

  public buildNarrationRetryUserPrompt(
    topic: string,
    previousNarration: string,
    options: VideoGenerationOptions,
    targetWords: number,
    actualWords: number,
    attempt: number
  ): string {
    const wps = this.getWordsPerSecond(options)
    const deficit = targetWords - actualWords
    const missingSeconds = Math.round(deficit / wps)
    const lang = (options as any).language || 'English'

    return NarrationTemplates.buildNarrationRetryUserPrompt(
      topic,
      previousNarration,
      targetWords,
      actualWords,
      missingSeconds,
      lang,
      attempt
    )
  }

  public async buildPass2Prompts(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    chunkContext?: {
      chunkIndex: number
      totalChunks: number
      startSceneNumber: number
      visualSummary?: {
        prevSceneId: string
        prevLocation: string
        prevAction: string
        prevCharacterState: string
      }
    }
  ): Promise<{ system: string; user: string }> {
    const targetDuration = this.getEffectiveDuration(options)
    const wps = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWords = Math.round(targetDuration * wps * safetyFactor)
    const actualWords = validatedNarration.trim().split(/\s+/).filter(Boolean).length
    const lang = (options as any).language || 'English'
    const spec = this.getEffectiveSpec(options)
    const audience = (options as any).audience || spec.audienceDefault || 'general audience'

    const characterMetadata = await this.resolveCharacterMetadata()
    const fullSpec = {
      ...spec,
      characterDescription: characterMetadata
        ? `${characterMetadata.description}. Personality: ${characterMetadata.artistPersona}.`
        : spec.characterDescription,
      targetDuration,
      targetWordCount: targetWords
    }

    const specInstructions = this.buildSystemInstructions(fullSpec as any)

    const range = computeSceneCountRange(targetDuration)
    const systemPrompt = StructuringTemplates.buildStructuringSystemPrompt(range, specInstructions)

    let userPrompt = StructuringTemplates.buildStructuringUserPrompt(
      validatedNarration,
      topic,
      lang,
      audience,
      targetDuration,
      wps,
      targetWords,
      actualWords,
      !!chunkContext
    )

    if (chunkContext) {
      userPrompt += `\n\n⚠️ CHUNK MODE: This is part ${chunkContext.chunkIndex + 1} of ${chunkContext.totalChunks} of the full narration.\n`
      userPrompt += `Structure ONLY this specific block into scenes.\n`
      userPrompt += `VERBATIM RULE: You MUST structure the entire text of this chunk without omitting a single word.\n`
      userPrompt += `Scene numbering MUST start at ${chunkContext.startSceneNumber}.\n`

      if (chunkContext.visualSummary) {
        userPrompt += `\nVISUAL CONTINUITY (Previous part ended with):\n`
        userPrompt += `- Location: ${chunkContext.visualSummary.prevLocation || 'unknown'}\n`
        userPrompt += `- Character State: ${chunkContext.visualSummary.prevCharacterState || 'neutral'}\n`
        userPrompt += `- Last Action: ${chunkContext.visualSummary.prevAction || 'none'}\n`
        userPrompt += `Ensure the first scene of THIS chunk follows this state naturally to avoid a visual jump-cut.\n`
      } else if (chunkContext.chunkIndex > 0) {
        userPrompt += `Maintain continuity from the previous part.\n`
      }
    }

    return {
      system: systemPrompt,
      user: userPrompt
    }
  }

  public fixFullNarrationDrift(script: any): { script: any; driftFixed: boolean; driftWords: number } {
    return NarrationValidator.fixFullNarrationDrift(script)
  }

  // ─── Legacy (Pass 1) ──────────────────────────────────────────────────────

  public async buildScriptSystemPrompt(
    options: VideoGenerationOptions = {} as any,
    targetWords?: number
  ): Promise<string> {
    const spec = this.getEffectiveSpec(options)
    const characterMetadata = await this.resolveCharacterMetadata()
    const provider = this.resolveProvider(options)
    const totalDuration = this.getEffectiveDuration(options)
    const wps = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWordCountTotal = targetWords ?? Math.round(totalDuration * wps * safetyFactor)

    const range = computeSceneCountRange(totalDuration)
    const avgWordsPerScene = Math.round(targetWordCountTotal / range.ideal)
    const presetTargets = this.computePresetTargets(avgWordsPerScene)

    const scaffolds = {
      hook: this.buildScaffoldInstruction('hook', presetTargets.hook),
      reveal: this.buildScaffoldInstruction('reveal', presetTargets.reveal),
      mirror: this.buildScaffoldInstruction('mirror', presetTargets.mirror),
      conclusion: this.buildScaffoldInstruction('conclusion', presetTargets.conclusion),
      bridge: this.buildScaffoldInstruction('bridge', presetTargets.bridge)
    }

    const outputFormat = this.getConsolidatedOutputFormat(
      undefined,
      presetTargets,
      targetWordCountTotal,
      avgWordsPerScene,
      wps,
      totalDuration
    )

    return buildLegacyScriptSystemPrompt(
      spec,
      characterMetadata,
      provider,
      wps,
      totalDuration,
      targetWordCountTotal,
      avgWordsPerScene,
      range,
      scaffolds,
      outputFormat,
      this.buildSystemInstructions.bind(this)
    )
  }

  private getConsolidatedOutputFormat(
    _unused_baseFormat?: string,
    _unused_presetTargets?: { hook: number; reveal: number; mirror: number },
    targetWordCountTotal?: number,
    _unused_avgWordsPerScene?: number,
    wps?: number,
    totalDuration?: number
  ): string {
    return getConsolidatedOutputFormat(targetWordCountTotal ?? 0, wps ?? Constants.DEFAULT_WPS, totalDuration ?? 60)
  }

  public buildScriptUserPrompt(topic: string, options: VideoGenerationOptions, targetWords?: number): string {
    const spec = this.getEffectiveSpec(options)
    const effectiveDuration = this.getEffectiveDuration(options)
    const wordsPerSecond = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWordCount = targetWords ?? Math.round(effectiveDuration * wordsPerSecond * safetyFactor)

    const range = computeSceneCountRange(effectiveDuration)

    return this.buildUserData({
      subject: topic,
      duration: `${effectiveDuration} seconds`,
      aspectRatio: options.aspectRatio || '16:9',
      audience: (options as any).audience || spec.audienceDefault,
      language: options.language,
      targetWordCount,
      targetDuration: effectiveDuration,
      wps: wordsPerSecond,
      sceneCountRange: range
    })
  }

  async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    return {
      systemPrompt: await this.buildScriptSystemPrompt(options, targetWords),
      userPrompt: this.buildScriptUserPrompt(topic, options, targetWords)
    }
  }

  // ─── Image prompt builders ────────────────────────────────────────────────

  async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    const spec = this.spec
    if (!spec) return ''

    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription = characterMetadata?.description || spec.characterDescription
    const stylePrefix = characterMetadata?.stylePrefix || ''
    const artistPersona = characterMetadata?.artistPersona || ''

    const effectiveHasRef = hasReferenceImages || (characterMetadata?.images && characterMetadata.images.length > 0)

    const referenceMode = effectiveHasRef ? IMAGE_RULES.referenceMode(stylePrefix) : stylePrefix

    const personaContext = artistPersona ? `Acting as a ${artistPersona}, create: ` : ''

    const characterContext = characterDescription
      ? `A symbolic visual representing the scene's core idea is shown, centered around a main character described as: ${characterDescription}. This character is interacting with the environment.`
      : "A symbolic visual perfectly representing the scene's core idea is shown, interacting with the environment."

    const styleAnchor = IMAGE_STYLE_ANCHORS.default(personaContext, characterContext)

    const temporalAnchor = IMAGE_RULES.temporalAnchor
    const genderAnchor = IMAGE_RULES.genderAnchor

    const imageSpec: VideoTypeSpecification = {
      ...spec,
      instructions: [referenceMode, styleAnchor, temporalAnchor, genderAnchor, ...(spec.instructions || [])].filter(
        Boolean
      )
    }

    return this.buildSystemInstructions(imageSpec)
  }

  async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    _unused_aspectRatio: string = '16:9',
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
      finalPrompt += IMAGE_RULES.styleConsistency

      if (hasLocationReference) {
        finalPrompt += IMAGE_RULES.environmentalContinuity
      }
    }

    return {
      sceneId: scene.id,
      prompt: finalPrompt
    }
  }

  buildAnimationPrompt(scene: EnrichedScene, _unused_imageStyle?: { characterDescription?: string }): AnimationPrompt {
    const instructions = scene.animationPrompt || ''
    const movements: AnimationPrompt['movements'] = [
      {
        element: 'body',
        description: instructions
      }
    ]

    return { sceneId: scene.id, instructions, movements }
  }

  // ─── Private Builders ──────────────────────────────────────────────────────

  private buildSystemInstructions(spec: VideoTypeSpecification): string {
    const sections: string[] = []

    if (spec.role) sections.push(`## ROLE\n${spec.role}`)
    if (spec.context) sections.push(`## CONTEXT\n${spec.context}`)
    if ((spec as any).targetDuration) {
      sections.push(
        `## DURATION\nTarget: ${(spec as any).targetDuration} seconds\nWord Count: ${(spec as any).targetWordCount ?? 'approx 135'} words`
      )
    }
    if (spec.task) sections.push(`## TASK\n${spec.task}`)
    if (spec.goals?.length) sections.push(`## GOALS\n${spec.goals.map((g: string) => `- ${g}`).join('\n')}`)
    if (spec.structure) sections.push(`## STRUCTURE\n${spec.structure}`)
    if (spec.rules?.length) sections.push(`## RULES\n${spec.rules.map((r: string) => `- ${r}`).join('\n')}`)
    if (spec.formatting) sections.push(`## FORMATTING\n${spec.formatting}`)

    if ((spec as any).narrativeRules?.length)
      sections.push(`## NARRATIVE RULES\n${(spec as any).narrativeRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).styleRules?.length)
      sections.push(`## STYLE RULES\n${(spec as any).styleRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).expansionRules?.length)
      sections.push(
        `## TOPIC EXPANSION & POINT SPLITTING\n${(spec as any).expansionRules.map((r: string) => `- ${r}`).join('\n')}`
      )
    if ((spec as any).engagementRules?.length)
      sections.push(`## ENGAGEMENT RULES\n${(spec as any).engagementRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).contrastRules?.length)
      sections.push(`## CONTRAST RULES\n${(spec as any).contrastRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).truthRules?.length)
      sections.push(`## TRUTH RULES\n${(spec as any).truthRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).emotionCurve?.length)
      sections.push(`## EMOTION CURVE\n${(spec as any).emotionCurve.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).narrativeRoles?.length)
      sections.push(`## NARRATIVE ROLES\n${(spec as any).narrativeRoles.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).curiosityRules?.length)
      sections.push(`## CURIOSITY RULES\n${(spec as any).curiosityRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).escalationRules?.length)
      sections.push(`## ESCALATION RULES\n${(spec as any).escalationRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).identityTriggers?.length)
      sections.push(`## IDENTITY TRIGGERS\n${(spec as any).identityTriggers.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).postProcessing?.length)
      sections.push(`## POST-PROCESSING\n${(spec as any).postProcessing.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).internalCheck?.length)
      sections.push(
        `## BEFORE FINALIZING, INTERNALLY CHECK:\n${(spec as any).internalCheck.map((r: string) => `- ${r}`).join('\n')}`
      )
    if ((spec as any).patternInterrupts?.length)
      sections.push(`## PATTERN INTERRUPTS\n${(spec as any).patternInterrupts.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).antiBoringRules?.length)
      sections.push(`## ANTI-BORING RULES\n${(spec as any).antiBoringRules.map((r: string) => `- ${r}`).join('\n')}`)

    if (spec.scenePresets) sections.push(`## SCENE PRESETS\n${JSON.stringify(spec.scenePresets, null, 2)}`)
    if (spec.visualRules?.length) sections.push(`## VISUAL RULES\n${spec.visualRules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.orchestration?.length)
      sections.push(`## ORCHESTRATION\n${spec.orchestration.map((o: string) => `- ${o}`).join('\n')}`)
    if (spec.characterDescription) sections.push(`## MAIN CHARACTER\n${spec.characterDescription}`)
    if (spec.outputFormat) sections.push(`## OUTPUT FORMAT\n${spec.outputFormat}`)
    if (spec.instructions?.length)
      sections.push(`## INSTRUCTIONS\n${spec.instructions.map((i) => `- ${i}`).join('\n')}`)

    return sections.filter((s) => s.trim().length > 0).join('\n\n---\n\n')
  }

  private buildUserData(
    options: PromptMakerOptions & { targetWordCount?: number; targetDuration?: number; wps?: number }
  ): string {
    const { targetWordCount, targetDuration, wps } = options
    const effectiveWps = wps ?? Constants.DEFAULT_WPS

    const totalDur = targetDuration ?? parseInt(options.duration) ?? 60
    const range = options.sceneCountRange ?? computeSceneCountRange(totalDur)

    const hardConstraint =
      targetWordCount && targetDuration
        ? buildHardConstraint(targetWordCount, targetDuration, effectiveWps, range, Constants.PRESET_MIN_WORDS)
        : ''

    const lines = [
      hardConstraint,
      '---',
      `Subject: ${options.subject}`,
      `Required Duration: ${options.duration}`,
      `Aspect Ratio: ${options.aspectRatio}`,
      `Audience: ${options.audience}`,
      `Target Language: ${options.language || 'English'} — Generate ALL text content in this language WITHOUT EXCEPTION.`
    ]

    return lines.filter(Boolean).join('\n')
  }
}
