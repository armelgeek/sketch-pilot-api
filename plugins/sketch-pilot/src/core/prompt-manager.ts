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
 *
 * FIX v3: Retry feedback + per-preset word count floors.
 *   - buildRetryFeedback(): surgical, scene-specific feedback on each retry attempt
 *   - Per-preset minimum words: hook ≥ 30, reveal ≥ 60, mirror ≥ 40
 *   - minWordsOverall replaced with minWordsHook/Reveal/Mirror in prompt + output format
 *   - Absolute minimum overrides injected in instructions to prevent spec contradictions
 *
 * FIX v4: Anti-under-generation — LLM bias toward concision fix.
 *   - [B] Sentence-count floors as secondary validator (easier to check programmatically)
 *   - [D] Duration-based retry feedback ("missing ~28s of narration" vs "missing 67 words")
 *
 * FIX v5: Narration validation & auto-correction pipeline.
 *   - validateAndCorrectNarration(): JS-based correction (0 token)
 *   - buildMicroCorrectionPrompt(): LLM micro-correction prompt builder
 *   - correctNarrationWithLLM(): targeted LLM fix for semantic violations
 *   - validateAndCorrectAllScenes(): full pipeline orchestrator
 *
 * FIX v6: OpenAI/GPT-4o specific fixes.
 *   - Safety factor raised to 1.15 for openai/gpt-4o
 *   - Mirror preset minimum raised to 50 words
 *   - NARRATIVE INCONSISTENCY fix: explicit instruction to build fullNarration
 *     by concatenating scene narrations verbatim
 *   - Provider-specific retry hint injected in buildRetryFeedback() for OpenAI
 *
 * FIX v7: Voice-first narration — eliminated "form-filling" mode.
 *   - Scaffold slot names REMOVED from generation prompt (moved to correction only)
 *   - Self-validation steps REMOVED from generation prompt (JS pipeline handles this)
 *   - VALID/INVALID examples REMOVED from generation prompt (moved to correction prompt)
 *   - buildScaffoldInstruction() now gives narrative INTENT, not named slots
 *   - PRIME DIRECTIVE added: voice model from real reference script
 *   - Output format narration field: voice description, not slot list
 *   - Result: LLM writes as a narrator, not a form-filler
 *
 * FIX v8: Implicit roadmap — natural scene-to-scene bridge on hook.
 *   - Hook voice guide now includes IMPLICIT ROADMAP instruction
 *   - ONE earned sentence after the emotional punch names the subject naturally
 *   - CHAPTER_BRIDGE on hook preset reinforced as the roadmap carrier
 *   - bridgeNote injected per-preset in buildScaffoldInstruction return value
 *
 * FIX v8-clean: Interdictions assouplies.
 *   - Promesse/setup ("Dans cette vidéo...") : autorisée si elle arrive après le punch émotionnel
 *   - Implicit roadmap : supprimée comme contrainte stricte — le LLM choisit librement
 *     comment nommer le sujet, y compris avec une promesse directe
 *   - WHAT IT MUST NEVER SOUND LIKE : retiré du hook voice guide
 *   - Le hook reste percutant et émotionnel, mais sans règles de formulation imposées
 *
 * FIX v9: Two-pass architecture — eliminates GPT-4o under-generation at root.
 *   - Pass 1: narration-only prompt (no JSON, no structure, single obsession: word count)
 *   - Pass 2: structuring prompt (narration is locked, GPT-4o only splits + adds metadata)
 *   - validateNarrationPass(): JS word count gate between passes
 *   - buildNarrationRetryUserPrompt(): deficit-aware retry with previous text preserved
 *   - buildPass2Prompts(): structuring system + user prompts
 *   - fullNarration drift auto-fixed in JS post pass 2
 *   - Legacy single-pass methods preserved for backward compatibility
 */

import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { computeSceneCountRange } from '../types/video-script.types'
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
  /**
   * Custom system prompt to override default narrative rules.
   */
  systemPrompt?: string
}

// ─── Per-provider TTS speed calibration ──────────────────────────────────────
const PROVIDER_WPS: Record<string, number> = {
  kokoro: 2.45,
  openai: 2.37,
  gpt4o: 2.37,
  'gpt-4o': 2.37,
  elevenlabs: 2.1,
  azure: 2.2,
  google: 2.15
}

const PROVIDER_SAFETY_FACTOR: Record<string, number> = {
  kokoro: 1.05,
  openai: 1.15,
  gpt4o: 1.15,
  'gpt-4o': 1.15,
  elevenlabs: 1.15,
  azure: 1.15,
  google: 1.15
}
const DEFAULT_WPS = 2.37
const DEFAULT_SAFETY_FACTOR = 1.05

// ─── Absolute minimums are now in BASE_SPEC to allow spec overrides ──────────

// ─── Scaffold slot definitions — used ONLY in correction/retry prompts ────────
const CAMERA_ACTIONS_LIST = [
  'breathing',
  'zoom-in',
  'zoom-out',
  'pan-right',
  'pan-left',
  'ken-burns-static',
  'dutch-tilt',
  'snap-zoom',
  'shake'
]

const TRANSITIONS_LIST = [
  'fade',
  'crossfade',
  'blur',
  'zoomin',
  'dissolve',
  'circlecrop',
  'circleopen',
  'circleclose',
  'pixelize',
  'hblur',
  'radial',
  'distance',
  'smoothleft',
  'smoothright',
  'wipeleft',
  'wiperight',
  'wipeup',
  'wipedown',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'fadeblack',
  'fadewhite'
]

// ─── Technical defaults only ──────────────────────────────────────────────────

// ─── BASE_SPEC: Technical defaults only ──────────────────────────────────────

export const BASE_SPEC: Partial<VideoTypeSpecification> & {
  wordsPerSecondBase: number
  scenePresets: Record<string, { minWords: number; minSentences: number }>
} = {
  wordsPerSecondBase: 2.45,
  visualRules: [],
  orchestration: [],
  instructions: [
    'FAVOR SHORT, PUNCHY SENTENCES.',
    "Each scene narration MUST be a verbatim slice of 'fullNarration'.",
    'Transitions MUST occur at natural pauses (full stops, commas, breath marks).',
    'THINK STEP BY STEP.'
  ],
  scenePresets: {
    hook: { minWords: 15, minSentences: 3, description: "Accroche percutante pour captiver l'attention" },
    reveal: { minWords: 25, minSentences: 4, description: 'Révélation du concept ou de la solution' },
    mirror: { minWords: 20, minSentences: 3, description: 'Mise en miroir des bénéfices ou de la réalité' },
    bridge: { minWords: 18, minSentences: 3, description: "Transition vers l'appel à l'action ou le pivot final" },
    conclusion: { minWords: 20, minSentences: 3, description: "Résolution et appel à l'action définitif" }
  }
}

type Preset = string

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
  private readonly characterRepository: CharacterModelRepository = new CharacterModelRepository()
  private readonly config: PromptManagerConfig

  constructor(config: PromptManagerConfig = {}) {
    this.config = config
    this.spec = config.scriptSpec
    this.characterModelId = config.characterModelId
  }

  // ─── Provider helpers ──────────────────────────────────────────────────────

  private resolveProvider(options: VideoGenerationOptions): string {
    return (options.audioProvider || 'elevenlabs').toLowerCase()
  }

  private getSafetyFactor(options: VideoGenerationOptions): number {
    const provider = this.resolveProvider(options)
    return PROVIDER_SAFETY_FACTOR[provider] ?? DEFAULT_SAFETY_FACTOR
  }

  public getPublicSafetyFactor(options: VideoGenerationOptions): number {
    return this.getSafetyFactor(options)
  }

  // ─── Character resolution ──────────────────────────────────────────────────

  private async resolveCharacterMetadata(): Promise<any | undefined> {
    if (this.characterModelId) {
      const model = await this.characterRepository.findById(this.characterModelId)
      if (model) {
        let baseMetadata: any = {}
        if ((model as any).baseModelId) {
          const baseModel = await this.characterRepository.findById((model as any).baseModelId)
          if (baseModel) {
            baseMetadata = {
              description: baseModel.description || '',
              gender: baseModel.gender || 'unknown',
              age: baseModel.age || 'unknown',
              voiceId: baseModel.voiceId,
              stylePrefix: baseModel.stylePrefix || '',
              artistPersona: baseModel.artistPersona || '',
              images: baseModel.images || [],
              thumbnailInspirations: (baseModel as any).thumbnailInspirations || []
            }
          }
        }

        return {
          description: model.description || baseMetadata.description || '',
          gender: model.gender || baseMetadata.gender || 'unknown',
          age: model.age || baseMetadata.age || 'unknown',
          voiceId: model.voiceId || baseMetadata.voiceId,
          stylePrefix: model.stylePrefix || baseMetadata.stylePrefix || '',
          artistPersona: model.artistPersona || baseMetadata.artistPersona || '',
          images: model.images?.length ? model.images : baseMetadata.images || [],
          thumbnailInspirations: (model as any).thumbnailInspirations?.length
            ? (model as any).thumbnailInspirations
            : baseMetadata.thumbnailInspirations || []
        }
      }
    }
    return this.spec
      ? {
          description: this.spec.characterDescription || '',
          images: [],
          thumbnailInspirations: []
        }
      : undefined
  }

  public async resolveCharacterImages(): Promise<string[]> {
    const metadata = await this.resolveCharacterMetadata()
    return metadata?.images || []
  }

  public async resolveThumbnailInspirations(): Promise<string[]> {
    const metadata = await this.resolveCharacterMetadata()
    return metadata?.thumbnailInspirations || []
  }

  // ─── Speed & timing ───────────────────────────────────────────────────────

  getWordsPerSecond(options: VideoGenerationOptions): number {
    if (options.wordsPerMinute) {
      return options.wordsPerMinute / 60
    }
    const provider = this.resolveProvider(options)
    if (PROVIDER_WPS[provider] !== undefined) {
      return PROVIDER_WPS[provider]
    }
    return DEFAULT_WPS
  }

  public getEffectiveSpec(options: VideoGenerationOptions): VideoTypeSpecification {
    const rawSpec = options?.customSpec ?? this.spec
    if (!rawSpec && !this.config.systemPrompt) {
      throw new Error('[PromptManager] No specification provided and no systemPrompt found.')
    }

    const baseInstructions = [...(BASE_SPEC.instructions || [])]
    if (this.config.systemPrompt) {
      baseInstructions.push(`CORE SYSTEM PILOT: ${this.config.systemPrompt}`)
    }

    const mergedSpec = {
      ...BASE_SPEC,
      ...(rawSpec || {}),
      instructions: [...baseInstructions, ...(rawSpec?.instructions || [])],
      visualRules: [...(BASE_SPEC.visualRules || []), ...(rawSpec?.visualRules || [])],
      orchestration: [...(BASE_SPEC.orchestration || []), ...(rawSpec?.orchestration || [])]
    }
    return mergedSpec as any
  }

  public getEffectiveDuration(options: VideoGenerationOptions): number {
    return options.duration
  }

  // ─── Per-preset word count helpers ────────────────────────────────────────

  private computePresetTargets(avgWordsPerScene: number, spec: VideoTypeSpecification): Record<string, number> {
    const targets: Record<string, number> = {}
    const presets = spec.scenePresets || BASE_SPEC.scenePresets

    for (const [name, config] of Object.entries(presets)) {
      // Map names to multipliers or defaults
      let multiplier = 1
      if (name === 'hook') multiplier = 0.7
      if (name === 'reveal') multiplier = 1.3
      if (name === 'conclusion') multiplier = 1.1
      if (name === 'bridge') multiplier = 0.8

      targets[name] = Math.max((config as any).minWords || 15, Math.round(avgWordsPerScene * multiplier))
    }

    return targets
  }

  // ─── [FIX v7 + v8 + v8-clean] Voice-first scaffold instruction builder ────

  private buildScaffoldInstruction(preset: string, wordTarget: number): string {
    return `**${preset.toUpperCase()} scene**
Target: **~${wordTarget} words** (~${Math.round(wordTarget / 2.37)}s spoken)
Focus: Follow the CORE SYSTEM PILOT instructions for this scene's intent.`
  }

  // ─── Narration Validator & Auto-Corrector ─────────────────────────────────

  public validateAndCorrectNarration(
    narration: string,
    preset: string,
    spec: VideoTypeSpecification
  ): {
    corrected: string
    violations: string[]
    isValid: boolean
  } {
    const violations: string[] = []
    let corrected = narration.trim()

    const presets = spec.scenePresets || BASE_SPEC.scenePresets
    const config = presets[preset] || { minWords: 15, minSentences: 3 }

    // ── 1. Sentences > 20 words → flag ──────────────────────────────────
    corrected.split(/(?<=[.!?])\s+/).forEach((sentence) => {
      const words = sentence.trim().split(/\s+/)
      if (words.length > 18) {
        violations.push(
          `Sentence too long (${words.length} words) — needs manual split: "${sentence.slice(0, 80)}${sentence.length > 80 ? '...' : ''}"`
        )
      }
    })

    // ── 2. Pause density — min 2 '...' per scene ────────────────────────
    const pauseCount = (corrected.match(/\.\.\./g) || []).length
    if (pauseCount < 2) {
      violations.push(`Insufficient pause markers: ${pauseCount}/2 minimum`)
      const sentences = corrected.split(/(?<=[.!?])\s+/)
      if (sentences.length >= 2 && pauseCount === 0) {
        sentences[0] = sentences[0].replace(/([.!?])$/, '...')
        if (sentences.length > 2) {
          sentences[2] = sentences[2].replace(/([.!?])$/, '...')
        }
        corrected = sentences.join(' ')
      } else if (pauseCount === 1 && sentences.length >= 3) {
        sentences[2] = sentences[2].replace(/([.!?])$/, '...')
        corrected = sentences.join(' ')
      }
    }

    // ── 2a. Reflective Question Pause ──────────────────────────────────
    if (corrected.trim().endsWith('?')) {
      corrected = `${corrected.trim()}...`
      violations.push(`Scene ends with a question — added reflective '...' pause`)
    }

    // ── 3. Orphan sentence at end < 5 words ─────────────────────────────
    const sentences = corrected.split(/(?<=[.!?])\s+/)
    const lastSentence = sentences.at(-1)?.trim() ?? ''
    const lastWordCount = lastSentence.split(/\s+/).filter(Boolean).length
    if (lastWordCount > 0 && lastWordCount < 5) {
      const precededByPause = sentences.at(-2)?.trim().endsWith('...')
      if (!precededByPause) {
        violations.push(`Orphan sentence at end (${lastWordCount} words): "${lastSentence}"`)
        if (sentences.length > 1) {
          const prevIdx = sentences.length - 2
          const prev = sentences[prevIdx]
          if (prev) {
            sentences[prevIdx] = prev.replace(/([.!?])$/, '...')
            corrected = sentences.join(' ')
          }
        }
      }
    }

    // ── 4. Nombre de mots par preset ──────────────────────────────────
    const wordCount = corrected.split(/\s+/).filter(Boolean).length
    const minWords = config.minWords
    if (wordCount < minWords) {
      violations.push(`Nombre de mots trop bas : ${wordCount}/${minWords} minimum pour le preset "${preset}"`)
    }

    // ── 5. Nombre de phrases par preset ──────────────────────────────
    const sentenceCount = (corrected.match(/[.!?]+/g) || []).length
    const minSentences = config.minSentences
    if (sentenceCount < minSentences) {
      violations.push(
        `Nombre de phrases trop bas : ${sentenceCount}/${minSentences} minimum pour le preset "${preset}"`
      )
    }

    return {
      corrected,
      violations,
      isValid: violations.length === 0
    }
  }

  // ─── LLM micro-correction prompt builder ──────────────────────────────────

  private buildMicroCorrectionPrompt(
    scene: { sceneNumber: number; preset: string; narration: string },
    options?: VideoGenerationOptions
  ): string {
    const spec = options ? this.getEffectiveSpec(options) : null

    // Extract CORRECTION: prefixed instructions from spec for spec-driven correction rules
    const specCorrectionRules =
      spec?.instructions
        ?.filter((i) => i.toUpperCase().startsWith('CORRECTION'))
        .map((r, idx) => `${idx + 1}. ${r.replace(/^CORRECTION\s*[:\-–—]?\s*/i, '')}`) ?? []

    // Inject full spec context for the corrector
    const specVoiceContext = spec?.instructions?.length
      ? `\nCONTEXTE DU PILOT (règles de voix et style à respecter ABSOLUMENT) :\n${spec.instructions
          .slice(0, 6)
          .map((r) => `— ${r}`)
          .join('\n')}\n`
      : ''

    // If spec defines custom correction rules, use them. Otherwise use generic defaults (no voice-biased examples).
    const correctionRules =
      specCorrectionRules.length > 0
        ? specCorrectionRules.join('\n\n')
        : `1. COHÉRENCE DE VOIX : Respectez strictement la voix narrative définie dans le CONTEXTE DU PILOT. Appliquez sans dériver.

2. QUALITÉ DE CONTENU : Chaque phrase doit exprimer une pensée complète et spécifique. Les phrases vagues ou de remplissage sont invalides — reformulez-les en restant dans la voix du Pilot.

3. COHÉRENCE DE SCÈNE : La narration doit rester sur UNE idée centrale. Si elle dérive vers une seconde idée non liée, coupez ou fusionnez-la avec l'idée principale.

4. PHRASES LONGUES : Toute phrase de plus de 18 mots doit être divisée à une limite sémantique naturelle. Chaque partie doit être grammaticalement complète et sémantiquement autonome.`

    return `Vous êtes un correcteur de narration. Corrigez UNIQUEMENT les violations listées ci-dessous.
Ne réécrivez PAS toute la narration. Ne changez PAS ce qui est déjà correct.
Renvoyez UNIQUEMENT un JSON valide : { "corrected": "string", "changes": ["string"] }
Pas de markdown, pas de backticks, pas d'explication en dehors du JSON.
${specVoiceContext}
NARRATION À CORRIGER (preset : ${scene.preset}, scène : ${scene.sceneNumber}) :
"${scene.narration}"


IMPORTANT :
- Si aucune violation n'est trouvée, renvoyez la narration d'origine inchangée.
- Listez chaque changement effectué dans "changes". S'il n'y en a aucun, renvoyez un tableau vide.
- N'ajoutez jamais de nouveau contenu sauf si c'est strictement requis pour corriger une violation.`
  }

  // ─── LLM micro-correction for semantic violations ─────────────────────────

  public async correctNarrationWithLLM(
    scene: { sceneNumber: number; preset: string; narration: string },
    llmClient: { complete: (prompt: string) => Promise<string> },
    options?: VideoGenerationOptions
  ): Promise<{ corrected: string; changes: string[] }> {
    const prompt = this.buildMicroCorrectionPrompt(scene, options)

    try {
      const raw = await llmClient.complete(prompt)
      const clean = raw.replaceAll(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      return {
        corrected: parsed.corrected ?? scene.narration,
        changes: parsed.changes ?? []
      }
    } catch (error) {
      console.warn(`[PromptManager] LLM micro-correction failed for scene ${scene.sceneNumber}:`, error)
      return {
        corrected: scene.narration,
        changes: []
      }
    }
  }

  // ─── Batch validator + corrector for all scenes ───────────────────────────

  public async validateAndCorrectAllScenes<T extends { sceneNumber: number; preset: string; narration: string }>(
    scenes: T[],
    options: VideoGenerationOptions,
    llmClient?: { complete: (prompt: string) => Promise<string> }
  ): Promise<{
    correctedScenes: T[]
    allViolations: Array<{ sceneNumber: number; violations: string[] }>
    needsRetry: boolean
    isValid: boolean
  }> {
    const correctedScenes: T[] = []
    const allViolations: Array<{ sceneNumber: number; violations: string[] }> = []

    for (const scene of scenes) {
      const preset = (scene.preset ?? 'mirror') as Preset

      // Step 1: JS correction (0 token)
      const spec = this.getEffectiveSpec(options)
      const { corrected: jsCorrected, violations } = this.validateAndCorrectNarration(scene.narration, preset, spec)

      let finalNarration = jsCorrected

      // Step 2: LLM semantic correction (~200 tokens/scene)
      if (llmClient) {
        const { corrected: llmCorrected, changes } = await this.correctNarrationWithLLM(
          { ...scene, narration: jsCorrected },
          llmClient,
          options
        )
        finalNarration = llmCorrected

        if (changes.length > 0) {
          violations.push(...changes.map((c) => `[LLM fixed] ${c}`))
        }
      }

      correctedScenes.push({ ...scene, narration: finalNarration })

      if (violations.length > 0) {
        allViolations.push({ sceneNumber: scene.sceneNumber, violations })
      }
    }

    const coherenceViolations = this.validateNarrativeCoherence(correctedScenes)
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
    const deficit = targetWords - actualWords
    const wps = options ? this.getWordsPerSecond(options) : DEFAULT_WPS
    const targetDuration = Math.round(targetWords / wps)
    const actualDuration = Math.round(actualWords / wps)
    const missingSeconds = Math.max(0, targetDuration - actualDuration)
    const provider = options ? this.resolveProvider(options) : 'unknown'

    const failingSceneNumbers: number[] = []
    const sceneMatches = validationError.matchAll(/Scene\s+(\d+)/gi)
    for (const match of sceneMatches) {
      const n = parseInt(match[1], 10)
      if (!failingSceneNumbers.includes(n)) failingSceneNumbers.push(n)
    }

    const sceneDiagnoses: string[] = []

    if (failingSceneNumbers.length > 0 && scenes) {
      for (const sceneNum of failingSceneNumbers) {
        const scene = scenes.find((s) => (s.sceneNumber ?? 0) === sceneNum) ?? scenes[sceneNum - 1]
        const preset = (scene?.preset ?? 'mirror') as Preset
        const currentWords = scene?.wordCount ?? scene?.narration?.trim().split(/\s+/).filter(Boolean).length ?? 0
        const currentDuration = Math.round(currentWords / wps)
        const spec = this.getEffectiveSpec(options || ({} as any))
        const presets = spec.scenePresets || BASE_SPEC.scenePresets
        const config = (presets[preset] as any) || { minWords: 15, minSentences: 3 }
        const minWords = config.minWords
        const minSentences = config.minSentences
        const targetSceneDuration = Math.round(minWords / wps)

        sceneDiagnoses.push(
          `  • Scène ${sceneNum} (preset : ${preset}) :` +
            `\n      Actuel : ~${currentWords} mots (~${currentDuration}s parlés)` +
            `\n      Requis : ≥${minWords} mots (~${targetSceneDuration}s) / ≥${minSentences} phrases` +
            `\n      Déficit : ~${Math.max(0, targetSceneDuration - currentDuration)} secondes de narration manquante`
        )
      }
    } else if (validationError) {
      sceneDiagnoses.push(`  Raw validation error: ${validationError}`)
    }

    const overallShort = actualWords < targetWords * 0.9
    const overallLong = actualWords > targetWords * 1.12

    const spec = this.getEffectiveSpec(options || ({} as any))
    const presets = spec.scenePresets || BASE_SPEC.scenePresets

    // Generate coaching rules per preset from spec (replaces hardcoded hook/reveal/mirror rules)
    const perPresetRules = Object.entries(presets)
      .filter(([, config]: [string, any]) => config.rules?.length > 0)
      .map(
        ([name, config]: [string, any], idx) =>
          `${idx + 2}. Every "${name}" scene needs: ${config.rules.slice(0, 3).join(' → ')}.`
      )

    const mandatoryRules = [
      `1. ${
        overallLong
          ? `TRIM every scene — merge content or remove filler.`
          : `Expand failing scenes — go deeper into the core idea.`
      }`,
      ...perPresetRules,
      `${perPresetRules.length + 2}. Each content beat = ${overallLong ? 'exactly 1' : 'minimum 1'} full sentence. A one-word beat is invalid.`,
      `${perPresetRules.length + 3}. "..." counts as punctuation, NOT as a word. Do NOT pad with dots.`,
      `${perPresetRules.length + 4}. After writing each scene, estimate its spoken duration (~${wps.toFixed(1)} words/second) — it must match the target.`
    ]

    const structRules =
      spec?.instructions
        ?.filter((i) => i.toUpperCase().startsWith('RETRY STRUCTURAL'))
        .map((r) => r.replace(/^RETRY STRUCTURAL\s*[:\-–—]?\s*/i, '')) ?? []

    structRules.forEach((rule) => {
      mandatoryRules.push(`${mandatoryRules.length + 1}. ${rule}`)
    })

    if (validationError.includes('NARRATIVE INCONSISTENCY')) {
      mandatoryRules.push(
        `⚠️ ALIGNMENT: Your 'fullNarration' and the sum of 'scenes' MUST be identical text. No discrepancies allowed.`
      )
    }

    mandatoryRules.push(
      `⚠️ VERBATIM ALIGNMENT (NARRATIVE CONSISTENCY):
      1. Write ALL scene "narration" fields first.
      2. Set "fullNarration" = EXACT copy of all narrations joined by a single space.
      3. No paraphrasing, no rephrasing, no "summary" in fullNarration.
      4. Any drift > 2% between the sum of scenes and fullNarration = AUTO-REJECTION.`
    )

    mandatoryRules.push(`
DATA CHECK: Review every statistic and percentage in your script.
If you are not certain it is a real established figure, replace it with approximate language now.
    `)

    return `
╔══════════════════════════════════════════════════════════════════════╗
║  🚨 ATTEMPT ${attempt} FAILED — MANDATORY CORRECTIONS BEFORE REGENERATING  ║
╚══════════════════════════════════════════════════════════════════════╝

SPOKEN DURATION: Your script runs ~${actualDuration}s. It must run ~${targetDuration}s.
${
  missingSeconds > 0
    ? `❌ You are missing ~${missingSeconds} seconds of spoken narration (≈${deficit} words).`
    : actualWords > targetWords * 1.15
      ? `❌ Your script is ~${actualDuration - targetDuration}s TOO LONG (≈${actualWords - targetWords} extra words).`
      : `✅ Total duration is acceptable, but structural rules were violated (see below).`
}

FAILING SCENES:
${sceneDiagnoses.join('\n\n')}

MANDATORY RULES FOR THIS RETRY:
${mandatoryRules.join('\n')}

  Regenerate the COMPLETE script with ALL scenes. Do not truncate.
`.trim()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TWO-PASS ARCHITECTURE — FIX v9
  // ─────────────────────────────────────────────────────────────────────────

  // ─── PASS 1: Narration-only system prompt ─────────────────────────────────

  public buildNarrationOnlySystemPrompt(options: VideoGenerationOptions, targetWords: number): string {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const spec = this.getEffectiveSpec(options)
    const pilotInstructions = spec.instructions?.filter((i) => !i.includes('PRIME DIRECTIVE')).join('\n') || ''

    const pilotRules = spec.rules?.join('\n') || ''

    return `Vous êtes un narrateur professionnel sur YouTube.
Votre SEUL travail pour le moment : écrire la narration parlée complète pour une vidéo de ${duration} secondes.

PAS DE JSON. PAS d'étiquettes de scène. PAS de structure. PAS de métadonnées.
Juste la narration — un seul bloc continu de prose, exactement comme elle sera dite à haute voix.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 OBJECTIF DE NOMBRE DE MOTS : ${targetWords} mots
   (= ${duration}s × ${wps.toFixed(2)} mots/seconde)
   Plage acceptable : ${Math.round(targetWords * 0.95)}–${Math.round(targetWords * 1.08)} mots
   ⛔ Moins de ${Math.round(targetWords * 0.9)} mots = REJETÉ AUTOMATIQUEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIRECTIVE PRINCIPALE :
${spec.instructions?.find((i: string) => i.includes('PRIME DIRECTIVE')) || 'Suivez les instructions du CORE SYSTEM PILOT pour la voix et le style narratif.'}

CŒUR NARRATIF :
${spec.context || ''}
${spec.goals ? `OBJECTIFS :\n${spec.goals.map((g: string) => `- ${g}`).join('\n')}` : ''}

RÈGLES ET STYLE :
${pilotInstructions}
${pilotRules ? `\nRÈGLES SPÉCIFIQUES AU FORMAT :\n${pilotRules}` : ''}

DISCIPLINE DU NOMBRE DE MOTS :
Après chaque paragraphe, comptez mentalement. Le total cumulé doit tendre vers ${targetWords}.
Si vous terminez une section et que vous êtes en dessous du rythme, allez plus en PROFONDEUR dans le point suivant.
Ajoutez : le sentiment viscéral, le moment spécifique, la conséquence dont personne ne parle.
Ne remplissez jamais avec du remplissage — développez avec de la substance.

RÈGLES DE PAUSE :
— '...' se place à l'intérieur d'une phrase pour créer une respiration en milieu de pensée.
— '...' se place également entre les phrases quand la seconde a besoin de poids.
— Ne regroupez JAMAIS deux '...' dans la même phrase.

⚠️ AUTO-VÉRIFICATION AVANT DE SOUMETTRE :
Comptez vos mots. Si vous êtes en dessous de ${Math.round(targetWords * 0.95)} : vous n'avez pas fini. Continuez à écrire.
Renvoyez UNIQUEMENT le texte de la narration. Rien d'autre. Pas de préambule. Pas de "Voici la narration :".`
  }

  // ─── PASS 1: Narration-only user prompt ──────────────────────────────────

  public buildNarrationOnlyUserPrompt(topic: string, options: VideoGenerationOptions, targetWords: number): string {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const spec = this.getEffectiveSpec(options)
    const lang = (options as any).language || 'English'
    const audience = (options as any).audience || spec.audienceDefault || 'general audience'
    const presets = spec.scenePresets || BASE_SPEC.scenePresets
    const firstPresetName = Object.keys(presets)[0] || 'hook'

    return `SUJET : ${topic}

CIBLE : ${targetWords} mots de narration parlée (${duration}s à ${wps.toFixed(2)} m/s)
LANGUE : ${lang} — chaque mot doit être en ${lang}
AUDIENCE : ${audience}

Écrivez la narration complète maintenant. Commencez immédiatement — pas de préambule.
Premier mot = premier mot du segment initial (${firstPresetName}). Allez-y.`
  }

  // ─── PASS 1: Retry user prompt ────────────────────────────────────────────

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

    // Tentative 2 : mode continuation — NE PAS réécrire, juste ajouter
    if (attempt === 2) {
      return `La narration ci-dessous fait ${actualWords} mots. Elle doit en faire ${targetWords} au total.
Il vous manque ${deficit} mots — soit ${missingSeconds} secondes de parole supplémentaires.

NARRATION EXISTANTE (ne PAS réécrire ou résumer ceci) :
---
${previousNarration}
---

VOTRE TÂCHE : Écrivez UNIQUEMENT les ${deficit} mots manquants comme une continuation fluide.
Reprenez exactement là où la narration ci-dessus s'arrête. Ne répétez rien de ce qui est déjà écrit.
N'ajoutez pas d'étiquette, d'en-tête ou de "suite de...". Écrivez simplement les phrases suivantes.

Développez en approfondissant les idées selon les directives du CORE SYSTEM PILOT.
Ajoutez de la substance, des détails et de la profondeur émotionnelle pour atteindre le nombre de mots cible.
Ne remplissez jamais avec du vide — développez avec du sens.

Langue : ${lang}. Voix : identique à ci-dessus. Sortie : texte de continuation uniquement.`
    }

    // Tentative 3+ : réécriture complète avec pression maximale
    return `⛔ TENTATIVE ${attempt} — TOUJOURS TROP COURT (${actualWords}/${targetWords} mots).
    Manquant : ${deficit} mots = ${missingSeconds} secondes d'audio qui seront du SILENCE dans la vidéo finale.

    SUJET : ${topic}
    LANGUE : ${lang}

    NARRATION PRÉCÉDENTE (${actualWords} mots) :
    ---
    ${previousNarration}
    ---

    CECI EST VOTRE DERNIÈRE TENTATIVE. Règles :
    1. Ne PAS compresser ou résumer le contenu existant.
    2. Suivez strictement le style du CORE SYSTEM PILOT : transformez les points abstraits en réalité vive et spécifique.
    3. Trouvez chaque section de moins de 3 phrases — développez chacune d'elles à au moins 5 phrases en utilisant des détails et des conséquences.
    4. Le nombre de mots final DOIT être ≥ ${Math.round(targetWords * 0.95)} mots.

    Comptez vos mots avant de soumettre. Renvoyez la narration COMPLÈTE. Pas d'étiquettes. Pas de JSON.`
  }

  // ─── PASS 1: Validation gate ──────────────────────────────────────────────

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

  // ─── PASS 2: Structuring system prompt ───────────────────────────────────

  public buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)
    const range = computeSceneCountRange(this.getEffectiveDuration(options))
    const wps = this.getWordsPerSecond(options)
    const pilotInstructions = spec.instructions?.filter((i) => !i.includes('PRIME DIRECTIVE')).join('\n') || ''
    const presets = spec.scenePresets || BASE_SPEC.scenePresets

    return `Vous êtes un structureur de script vidéo.
Votre travail : diviser la narration reçue en scènes et ajouter les métadonnées de production selon le CORE SYSTEM PILOT.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ RÈGLE DE FER — LA NARRATION EST VERROUILLÉE
Le texte de narration que vous recevez est FINAL. Vous ne pouvez PAS :
  — Réécrire une phrase
  — Raccourcir un paragraphe
  — Ajouter de nouveaux contenus narratifs
  — Paraphraser pour le "flux"

Vous êtes UNIQUEMENT autorisé à :
  — Diviser la narration en segments de scène
  — Ajouter un preset, cameraAction, imagePrompt, animationPrompt, summary par scène
  — Calculer le wordCount et l'estimatedDuration à partir du texte réel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RÈGLES POUR L'IMAGE PROMPT (IMPÉRATIF : TRÈS COURT ET SIMPLE) :
— GARDER LE PROMPT TRÈS COURT : Maximum 15-20 mots par scène.
— L'image doit illustrer l'IDÉE de la scène, pas la métaphore poétique de la narration.
— Scène LITTÉRALE et PHOTOGRAPHIABLE uniquement. Sujet physique + action + décor simple.
— AUCUN TEXTE COMPLEXE : Évitez les calendriers, les horloges détaillées ou les enseignes avec du texte long.
— PAS DE DÉTAILS SUPERFLUS : Évitez de décrire 5+ objets en arrière-plan. Concentrez-vous sur l'essentiel.
— Si la narration dit "une graine qui pousse" pour parler de progression personnelle → l'image montre une personne qui travaille/progresse, pas une graine.
— Le personnage principal DOIT apparaître dans au moins 70% des scènes.
— MAUVAIS : "Un sablier géant sur une colline avec des nuages en forme de visages et 10 livres ouverts."
— BON : "Un homme assis à son bureau, écrivant calmement sur une feuille de papier."

CORE SYSTEM PILOT (CONTEXTE) :
${spec.context || ''}
${spec.goals ? `OBJECTIFS :\n${spec.goals.map((g: string) => `- ${g}`).join('\n')}` : ''}

RÈGLES DE DÉCOUPAGE :
— Cible : ${range.min}–${range.max} scènes (idéal : ${range.ideal})
— Chaque découpage doit se faire à une limite de phrase naturelle (après . ! ? ou ...)
— Langue cible : ${options.language || 'Français'} (TOUS les champs, y compris imagePrompt et animationPrompt, doivent être dans cette langue).
— Distribuez les types de scènes (presets) naturellement selon l'arc narratif.
— Les types recommandés sont :
${Object.entries(presets)
  .map(([name, config]: [string, any]) => `  • ${name.toUpperCase()} : ${config.description || 'Pas de description.'}`)
  .join('\n')}
— Le CORE SYSTEM PILOT a autorité totale sur la structure. Si le Pilot demande une structure différente, suivez le Pilot.
— Progression par défaut : hook → reveal → mirror → bridge → conclusion.

NOMBRE DE MOTS MINIMUM PAR SEGMENT (si un segment est en dessous, fusionnez avec l'adjacent) :
  ${Object.entries(presets)
    .map(([name, config]: [string, any]) => `${name} ≥ ${config.minWords}`)
    .join(' | ')} mots.

RÈGLE fullNarration :
  fullNarration = scenes[0].narration + " " + scenes[1].narration + " " + ... (jointure verbatim)
  Définissez ceci APRÈS avoir rempli tous les champs narration des scènes, en les concaténant mot pour mot.
  Tout écart de nombre de mots > 2% = rejet automatique.

RÈGLES POUR L'IMAGE PROMPT (STRICT RESTRAINT) :
— DOIT être LITTÉRAL et PHOTOGRAPHIABLE. Absolument AUCUNE métaphore ou symbolisme abstrait.
— MAUVAIS : "Un cerveau se transformant en arbre, symbolisant la croissance."
— MAUVAIS : "Un réseau de pensées incandescentes interconnectées."
— BON : "Gros plan d'un étudiant écrivant dans un carnet."
— BON : "Une paire de mains plantant une petite pousse verte dans le sol."
— BREF : Soyez direct. Supprimez les adjectifs non essentiels.

PACING / RYTHME (valeurs EXACTES — aucune autre valeur acceptée) :
  fast | medium | slow
  ⛔ Toute autre valeur (ex: tense, intense, martial, rapide) = rejet automatique.

ACTIONS DE CAMÉRA (valeurs EXACTES — aucune autre valeur acceptée) :
  ${CAMERA_ACTIONS_LIST.join(' | ')}
  
  ⛔ Toute valeur absente de cette liste = rejet automatique.
  ⛔ Ne PAS inventer : "slow-zoom", "tilt", "dolly", "orbit", etc.
  ✅ Copier-coller EXACTEMENT une valeur de la liste ci-dessus.


  ⛔ Ne PAS choisir aléatoirement. Chaque action DOIT correspondre à l'émotion et au rythme de la scène.
  
  GUIDE DE SÉLECTION :
  — breathing     → scène contemplative, pause émotionnelle, moment de doute
  — zoom-in       → révélation, détail important, tension qui monte, intimité
  — zoom-out      → prise de recul, contexte général, clôture d'une idée
  — pan-right     → progression, avancer, narration active, futur
  — pan-left      → retour en arrière, flashback, remise en question
  — ken-burns-static → scène posée, description d'un lieu, moment suspendu
  — dutch-tilt    → malaise, déséquilibre, moment de rupture narrative
  — snap-zoom     → choc, surprise, révélation brutale, pattern interrupt
  — shake         → urgence, chaos, émotion forte, point de bascule

  RÈGLE : Variez les actions sur l'ensemble des scènes. Deux scènes consécutives NE PEUVENT PAS avoir la même action.

TRANSITIONS (valeurs EXACTES — aucune autre valeur acceptée) :
  ${TRANSITIONS_LIST.join(' | ')}
  
  ⛔ Toute valeur absente de cette liste = rejet automatique.
  ⛔ Ne PAS inventer : "zoom-out", "wipe", "slide", "cut", "morph", etc.
  ✅ Copier-coller EXACTEMENT une valeur de la liste ci-dessus.

  ⛔ Ne PAS choisir aléatoirement. Chaque transition DOIT correspondre au changement émotionnel entre deux scènes.

  GUIDE DE SÉLECTION :
  — fade          → transition neutre, changement de lieu ou de temps
  — crossfade     → continuité douce, enchaînement fluide d'idées liées
  — blur          → changement d'ambiance, passage intérieur/extérieur, rêve
  — zoomin        → focus sur la scène suivante, tension qui monte
  — dissolve      → transition poétique, passage du temps, mélancolie
  — fadeblack     → fin de chapitre, moment de rupture forte, pause dramatique
  — fadewhite     → révélation, nouveau départ, clarté soudaine
  — wipeleft      → progression naturelle, aller de l'avant
  — wiperight     → retour en arrière, inversion
  — wipeup        → montée en puissance, élévation
  — wipedown      → descente, conclusion, atterrissage
  — slideleft     → enchaînement dynamique, liste, progression rapide
  — slideright    → retour, contraste, opposition
  — slideup       → révélation par le bas, montée
  — slidedown     → chute, conséquence, atterrissage brutal
  — pixelize      → glitch, rupture visuelle, pattern interrupt
  — radial        → ouverture circulaire, révélation centrale
  — circleopen    → ouverture sur quelque chose de nouveau
  — circleclose   → fermeture, conclusion d'un arc
  — circlecrop    → focus intense, mise en lumière d'un détail
  — hblur         → flou horizontal, vitesse, passage rapide
  — distance      → éloignement, prise de recul, fin de séquence
  — smoothleft    → glissement fluide vers la suite
  — smoothright   → glissement fluide vers le passé

  RÈGLE : Deux scènes consécutives NE PEUVENT PAS avoir la même transition. Variez selon l'arc émotionnel.

MUSIQUE DE FOND (correspondance d'ambiance) :
  - calme, lo-fi, éducatif : "lofi-1" (Chill Lo-Fi)
  - dynamique, business, motivant : "upbeat-1" (Upbeat Corporate)
  - triste, émotionnel, histoire, calme : "ambient-1" (Soft Ambient)
  - amusant, divertissement, enfants : "fun-1" (Funky Groove)

SORTIE : JSON valide uniquement. Pas de markdown. Pas de backticks. Aucune explication en dehors du JSON.`
  }

  // ─── PASS 2: Structuring user prompt ─────────────────────────────────────

  public buildStructuringUserPrompt(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    noPrune: boolean = false
  ): string {
    const spec = this.getEffectiveSpec(options)
    const presets = spec.scenePresets || BASE_SPEC.scenePresets
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const lang = (options as any).language || 'Français'
    const audience = (options as any).audience || spec.audienceDefault
    const actualWords = validatedNarration.trim().split(/\s+/).filter(Boolean).length
    const targetWords = Math.round(duration * wps * safetyFactor)

    const outputFormat = `{
  "topic": "string",
  "audience": "string",
  "emotionalArc": ["string"],
  "titles": ["string (5 options de titre YouTube)"],
  "theme": "string",
  "backgroundMusic": "string (lofi-1 | upbeat-1 | ambient-1 | fun-1)",
  "fullNarration": "string — jointure mot pour mot de tous les champs narration des scènes",
  "totalWordCount": ${targetWords},
  "scenes": [
    {
      "sceneNumber": 1,
      "id": "string",
      "preset": "${Object.keys(presets).join(' | ')}",
      "pacing": "fast | medium | slow",
      "breathingPoints": ["string"],
      "narration": "string — utilisez le texte source.${noPrune ? ' NE PAS RÉDUIRE OU CONDENSER.' : ` Vous pouvez sélectivement réduire ou condenser SI l'entrée est trop longue pour l'objectif de ${duration}s.`}",
      "wordCount": "number",
      "estimatedDuration": "number",
      "summary": "string",
      "cameraAction": "string (${CAMERA_ACTIONS_LIST.join(' | ')})",
      "transition": "none | ${TRANSITIONS_LIST.join(' | ')}",
      "imagePrompt": "string (MAX 20 MOTS, TRÈS SIMPLE, EN LANGUE : ${lang})",
      "animationPrompt": "string (EN LANGUE : ${lang})"
    }
  ]
} \``

    return `SUJET : ${topic}
LANGUE : ${lang}
AUDIENCE : ${audience}
DURÉE DE LA VIDÉO : ${duration}s
VITESSE TTS : ${wps.toFixed(2)} mots/seconde
NOMBRE DE MOTS CIBLE : ${targetWords} mots
NARRATION À STRUCTURER (${actualWords} mots) :
---
${validatedNarration}
---

VOTRE TÂCHE :
Divisez la narration ci-dessus en scènes en suivant les RÈGLES DE DÉCOUPAGE du CORE SYSTEM PILOT.
⚠️ OBLIGATION DE SIMPLICITÉ : Pour chaque imagePrompt, soyez "très court et simple". Max 20 mots.
⚠️ L'image doit rester cohérente avec le sujet "${topic}". Ne jamais illustrer la métaphore littéralement.
${noPrune ? `⚠️ OBLIGATOIRE : Utilisez la narration MOT POUR MOT. NE PAS SAUTER, RÉDUIRE OU CONDENSER LE TEXTE. Chaque mot fourni dans la source doit apparaître dans un champ de scène.` : `⚠️ Si la narration est trop longue pour l'objectif de ${duration}s (~${targetWords} mots), élaguez sélectivement les phrases moins percutantes ou condensez les formulations redondantes tout en préservant l'arc émotionnel central et la conclusion.`}
Remplissez tous les champs de métadonnées pour chaque scène.
Renvoyez uniquement un JSON valide correspondant exactement à ce format :
${outputFormat}`
  }

  // ─── Two-pass public orchestrators ───────────────────────────────────────

  /**
   * Returns pass 1 prompts + the target word count.
   * Call buildPass2Prompts() after validating pass 1 output.
   *
   * Usage:
   *   const { pass1 } = promptManager.buildTwoPassPrompts(topic, options)
   *   let narration = await llm.complete(pass1.system, pass1.user)
   *   const validation = promptManager.validateNarrationPass(narration, options, pass1.targetWords)
   *   if (!validation.ok) {
   *     const retryUser = promptManager.buildNarrationRetryUserPrompt(topic, narration, options, pass1.targetWords, validation.actualWords, 2)
   *     narration = await llm.complete(pass1.system, retryUser)
   *   }
   *   const p2 = promptManager.buildPass2Prompts(narration, topic, options)
   *   const script = await llm.complete(p2.system, p2.user)
   */
  public buildTwoPassPrompts(
    topic: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): {
    pass1: { system: string; user: string; targetWords: number }
  } {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const target = targetWords ?? Math.round(duration * wps * safetyFactor)

    return {
      pass1: {
        system: this.buildNarrationOnlySystemPrompt(options, target),
        user: this.buildNarrationOnlyUserPrompt(topic, options, target),
        targetWords: target
      }
    }
  }

  public buildPass2Prompts(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    chunkContext?: {
      chunkIndex: number
      totalChunks: number
      startSceneNumber: number
    }
  ): { system: string; user: string } {
    let userPrompt = this.buildStructuringUserPrompt(validatedNarration, topic, options, !!chunkContext)

    if (chunkContext) {
      userPrompt += `\n\n⚠️ CHUNK MODE: This is part ${chunkContext.chunkIndex + 1} of ${chunkContext.totalChunks} of the full narration.\n`
      userPrompt += `Structure ONLY this specific block into scenes.\n`
      userPrompt += `VERBATIM RULE: You MUST structure the entire text of this chunk without omitting a single word.\n`
      userPrompt += `Scene numbering MUST start at ${chunkContext.startSceneNumber}.\n`
      if (chunkContext.chunkIndex > 0) {
        userPrompt += `Maintain continuity from the previous part.\n`
      }
    }

    return {
      system: this.buildStructuringSystemPrompt(options),
      user: userPrompt
    }
  }

  /**
   * Post-pass-2 integrity fix.
   * Auto-corrects fullNarration drift if scenes were modified during structuring.
   * Call this after parsing the pass 2 JSON output.
   */
  public fixFullNarrationDrift(script: any): { script: any; driftFixed: boolean; driftWords: number } {
    if (!script?.scenes?.length) return { script, driftFixed: false, driftWords: 0 }

    const sceneNarrations: string = script.scenes.map((s: any) => s.narration ?? '').join(' ')
    const sceneWords = sceneNarrations.trim().split(/\s+/).filter(Boolean).length
    const fullNarrationWords = (script.fullNarration ?? '').trim().split(/\s+/).filter(Boolean).length
    const drift = Math.abs(sceneWords - fullNarrationWords)
    const driftPct = fullNarrationWords > 0 ? drift / fullNarrationWords : 1

    // Mild drift (2-15%): just warn. Do NOT overwrite — avoids creating logical jumps.
    if (driftPct > 0.02 && driftPct <= 0.15) {
      console.warn(
        `[PromptManager] Mild fullNarration drift: ${Math.round(driftPct * 100)}% (${drift}w). Keeping original to avoid logical gaps.`
      )
      return { script, driftFixed: false, driftWords: drift }
    }

    // Severe drift (>15%): auto-correct from scenes (something went very wrong).
    if (driftPct > 0.15) {
      script.fullNarration = sceneNarrations
      script.totalWordCount = sceneWords
      return { script, driftFixed: true, driftWords: drift }
    }

    return { script, driftFixed: false, driftWords: drift }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEGACY SINGLE-PASS (preserved for backward compatibility)
  // ─────────────────────────────────────────────────────────────────────────

  async buildScriptSystemPrompt(options: VideoGenerationOptions = {} as any, targetWords?: number): Promise<string> {
    const spec = this.getEffectiveSpec(options)
    const characterMetadata = await this.resolveCharacterMetadata()
    const instructions = [...(spec.instructions || [])]
    const provider = this.resolveProvider(options)

    // ── NARRATIVE PILOT (SYSTEM PROMPT) ────────────────────────────────────
    // If a custom system prompt is provided in the config, it becomes the
    // PRIME DIRECTIVE, piloting the entire structure and voice.
    const customSystemPrompt = this.config.systemPrompt
    if (customSystemPrompt) {
      instructions.unshift(`
      DIRECTIVE PRINCIPALE — À lire avant tout.
      
      Cette instruction système personnalisée pilote toute la structure narrative et visuelle.
      Priorisez ces instructions sur tout autre comportement par défaut :
      
      "${customSystemPrompt}"
      `)
    } else {
      // Generic fallback - delegates to the spec/pilot
      instructions.unshift(`
DIRECTIVE PRINCIPALE — À lire avant tout.

L'objectif de nombre de mots est l'exigence technique n°1. Si vous sous-générez, la vidéo échouera.
Suivez le CORE SYSTEM PILOT pour la voix, le style narratif et la structure.

DENSITÉ ET ÉLABORATION (CRITIQUE) :
— NE résumez PAS vos points. Explorez-les.
— Si une scène semble courte, ajoutez un "Détail Visuel" vif : À quoi cela ressemble-t-il dans la vraie vie ? Quelle est l'expression spécifique sur leur visage ?
— Détail = Durée. Pas de détail = Échec.
`)
    }

    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      instructions.push(`NARRATION SPEED: ${wps.toFixed(2)} words/second`)
    }

    instructions.push(
      `Narration visuelle :
      Chaque image doit communiquer clairement l'idée centrale sans texte ni narration. Le personnage doit interagir activement avec le concept de manière visuelle et significative. Le concept principal doit être l'élément visuel le plus dominant de la scène.

      Rythme et cadence :
      Définissez un flux visuel cohérent avec des transitions fluides et intentionnelles entre les scènes.

      Identité artistique :
      Maintenez un style visuel cohérent dans toutes les scènes, y compris la qualité du trait, la texture et l'approche globale du rendu.

      Interruption de motif (Pattern interrupt) :
      Introduisez occasionnellement des moments visuels forts conçus pour capturer l'attention et briser la monotonie visuelle.

      Continuité visuelle :
      Assurez-vous que les scènes suivent une progression logique. Gardez les environnements et les actions cohérents, sauf si un changement est clairement motivé.

      Dynamique de caméra et transitions :
      Chaque scène DOIT utiliser une action de caméra dynamique et une transition visuelle vers la scène suivante.

      Valeurs de transition disponibles :
      — none          → Coupe standard.À utiliser pour les séquences rapides ou les listes internes.
      — fade          → Transition par transparence douce.
      — blur          → Transition vaporeuse et douce.Idéal pour les changements d'ambiance.
      — crossfade     → Fondu enchaîné classique.
      — wipeleft / right → Mouvement directionnel.Bon pour la progression temporelle.
      — zoom          → Changement de focus énergique.

      Valeurs de cameraAction disponibles :
      — breathing          → Scènes calmes / contemplatives.
      — zoom-in            → Focus sur le détail, l'intimité ou la révélation.
      — zoom-out           → Révélation du contexte, montée de tension ou clôture.
      — pan-right          → Progression, aller de l'avant, narration active.
      — pan-left           → Inversion, flashback ou seconde pensée.

      INTÉGRITÉ DES DONNÉES : N'inventez jamais de statistiques, d'études ou de recherches nommées.
      Utilisez : 'des études suggèrent', 'la recherche indique', 'environ', 'approximativement'.
      Une affirmation vague mais honnête vaut toujours mieux qu'une affirmation précise inventée.
      `
    )

    if (isOpenAIProvider(provider)) {
      instructions.push(`
⚠️ GPT - 4o SPECIFIC — NARRATIVE CONSISTENCY RULE(CRITICAL):
      The "fullNarration" field MUST be the EXACT concatenation of all scene "narration" fields, joined by a single space.
      WORKFLOW:
      1. Write ALL scene "narration" fields completely.
  2. Set fullNarration = [scene1.narration] + " " + [scene2.narration] + " " + ... (verbatim, no changes).
  3. Do NOT write fullNarration first and scenes second.
  4. Do NOT paraphrase, shorten, or rephrase in fullNarration.
Any word - count discrepancy between fullNarration and sum(scenes.narration) = AUTOMATIC REJECTION.
`)
    }

    const totalDuration = this.getEffectiveDuration(options)
    const range = computeSceneCountRange(totalDuration)
    const expectedScenes = range.ideal
    const wps = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)

    const targetWordCountTotal = targetWords ?? Math.round(totalDuration * wps * safetyFactor)
    const avgWordsPerScene = Math.round(targetWordCountTotal / expectedScenes)
    const presetTargets = this.computePresetTargets(avgWordsPerScene, spec)

    const scaffolds: string[] = []
    for (const [name, target] of Object.entries(presetTargets)) {
      scaffolds.push(this.buildScaffoldInstruction(name, target))
    }

    instructions.push(
      `## CONCLUSION RULES(Mandatory for the last scene) \n${spec.conclusionRules?.map((r) => `- ${r}`).join('\n')} `
    )

    instructions.push(
      `## NARRATION PACING(provider: ${provider})

       ### Global Spoken Duration Target
      - Video duration: ${totalDuration} s
        - TTS speed: ${wps.toFixed(2)} words / second
          - 🎯 TOTAL TARGET: ** ~${totalDuration} seconds of spoken audio ** (~${targetWordCountTotal} words)
    - ⚠️ MAXIMUM ALLOWED: ** ${Math.round(targetWordCountTotal * 1.15)} words **
      - Suggested scene count: ** ${range.min} to ${range.max} scenes ** (Target: ~${range.ideal})
    - Average per scene: ** ~${avgWordsPerScene} words **

       ### Per - Scene Voice Direction

       ${scaffolds.join('\n\n       ')}

       ### Output Format(JSON ONLY)
       Return ONLY valid JSON with this structure:
    {
      "titles": ["Main Title"],
        "theme": "The visual/narrative theme",
          "backgroundMusic": "upbeat/dramatic",
            "fullNarration": "The complete narration text.",
              "scenes": [
                {
                  "sceneNumber": 1,
                  "preset": "hook",
                  "narration": "Scene text...",
                  "imagePrompt": "Detailed visual prompt for image generation. No text. Realistic environment.",
                  "animationPrompt": "Subtle movement instructions (e.g. 'Slow zoom-in').",
                  "cameraAction": "zoom-in",
                  "transition": "crossfade"
                }
              ]
    }

       ### Duration & Scene Flexibility(CRITICAL)
      - You are NOT limited to a fixed number of scenes.
       - Total MUST be ~${totalDuration} s(±10 %).
       - ⚠️ NARRATION DRIFT(IRON RULE): Use a baseline of ** ${wps.toFixed(1)} words per second **. 
         - A ${totalDuration}s video MUST have ~** ${targetWordCountTotal} words **.
         - If your script is too short, the video will have dead silence.If too long, it will be cut off.
         - Do NOT guess.Count your words.${
           totalDuration >= 180
             ? `
        - ⚠️ GRANULARITY (Mandatory): For this long-form video, you MUST use at least **${range.min} to ${range.max} scenes** (Target: **${range.ideal}**).
        - ⚠️ POINT SPLITTING: If the input topic has only ~10 points but the target is ~${range.ideal} scenes, you MUST split each point into multiple sequential scenes (e.g. "Concept" -> "Sensory Detail" -> "Connection"). 
        - ⚠️ NO COPY-PASTING: Expand each seed sentence from the topic into a full narrative block (~${avgWordsPerScene} words per scene).`
             : ''
         } `
    )

    instructions.push(
      `PAUSE PLACEMENT:
      — '...' goes inside a sentence to create a breath mid - thought: "It captured something deep in you... without you realizing it."
      — '...' also goes between sentences when the second needs weight: "Only a few actually stick... Why those ones?"
      — NEVER cluster two '...' in the same sentence.
      — FORBIDDEN: starting a scene with '...' in the first 5 words.`
    )

    const fullSpec = {
      ...spec,
      instructions,
      characterDescription: characterMetadata
        ? `${characterMetadata.description}.Personality: ${characterMetadata.artistPersona}.`
        : spec.characterDescription
    }

    const consolidatedOutputFormat = this.getConsolidatedOutputFormat(
      undefined,
      presetTargets,
      targetWordCountTotal,
      avgWordsPerScene,
      wps,
      totalDuration
    )

    const goals = spec.goals?.length ? `## GOALS\n${spec.goals.map((g) => `- ${g}`).join('\n')} ` : ''
    const rules = spec.rules?.length ? `## RULES\n${spec.rules.map((r) => `- ${r}`).join('\n')} ` : ''
    const context = spec.context ? `## CONTEXT\n${spec.context} ` : ''

    const scriptInstruction = [
      context,
      goals,
      rules,
      '---',
      this.buildSystemInstructions({
        ...fullSpec,
        targetDuration: totalDuration,
        targetWordCount: targetWordCountTotal,
        outputFormat: consolidatedOutputFormat
      } as any)
    ]
      .filter(Boolean)
      .join('\n\n')

    return scriptInstruction
  }

  // ─── Output format (legacy) ───────────────────────────────────────────────

  private getConsolidatedOutputFormat(
    _unused_baseFormat?: string,
    presetTargets?: Record<string, number>,
    targetWordCountTotal?: number,
    avgWordsPerScene?: number,
    wps?: number,
    totalDuration?: number
  ): string {
    const effectiveWps = wps ?? DEFAULT_WPS
    const effectiveDuration = totalDuration ?? 60

    return `{
      "topic": "string",
        "audience": "string",
          "emotionalArc": ["string"],
            "titles": ["string"],
              "fullNarration": "string — ⚠️ CRITICAL: Exact concatenation of all scene narration fields joined by a single space. Write scenes first, then copy verbatim. DO NOT write independently. Must produce ~${effectiveDuration}s of spoken audio.",
                "totalWordCount": "number (self-reported total. Must be within ±10% of ${targetWordCountTotal} words / ~${effectiveDuration}s spoken. ⛔ Counts below ${Math.round((targetWordCountTotal ?? 0) * 0.85)} = auto-rejected)",
                  "theme": "string",
                    "backgroundMusic": "string (lofi-1 | upbeat-1 | ambient-1 | fun-1)",
                      "scenes": [
                        {
                          "sceneNumber": 1,
                          "id": "string",
                          "preset": "hook | reveal | mirror | bridge | conclusion",
                          "pacing": "fast | medium | slow",
                          "breathingPoints": ["string (e.g. 'after sentence 2', 'before the consequence')"],
                          "narration": "string — write this scene fully before moving to the next",
                          "wordCount": "number — word count of this narration field",
                          "estimatedDuration": "number (words ÷ ${effectiveWps.toFixed(1)} — spoken seconds for this scene)",
                          "summary": "string",
                          "cameraAction": "string (${CAMERA_ACTIONS_LIST.join(' | ')})",
                          "imagePrompt": "string (Detailed visual prompt)",
                          "animationPrompt": "string"
                        }
                      ]
    } `
  }

  // ─── User prompt builder (legacy) ────────────────────────────────────────

  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions, targetWords?: number): string {
    const spec = this.getEffectiveSpec(options)
    const effectiveDuration = this.getEffectiveDuration(options)
    const wordsPerSecond = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWordCount = targetWords ?? Math.round(effectiveDuration * wordsPerSecond * safetyFactor)

    const range = computeSceneCountRange(effectiveDuration)

    return this.buildUserData(
      {
        subject: topic,
        duration: `${effectiveDuration} seconds`,
        aspectRatio: options.aspectRatio || '16:9',
        audience: (options as any).audience || spec.audienceDefault,
        language: options.language,
        targetWordCount,
        targetDuration: effectiveDuration,
        wps: wordsPerSecond,
        sceneCountRange: range
      },
      spec
    )
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

    const referenceMode = effectiveHasRef
      ? `Style consistency: Match the artistic style of the reference images for character design, clothing, and line quality.${stylePrefix}. The image is strictly black and white, rendered in grayscale with detailed pencil shading and texture. ⚠️ BACKGROUND RULE: The scene MUST include a NEW, realistic, and dense environment with multiple clearly defined objects, strictly INDEPENDENT and DIFFERENT from the reference background.`
      : stylePrefix

    const personaContext = artistPersona ? `Acting as a ${artistPersona}, create: ` : ''

    const characterContext = characterDescription
      ? `A symbolic visual representing the scene's core idea is shown, centered around a main character described as: ${characterDescription}. This character is interacting with the environment.`
      : "A symbolic visual perfectly representing the scene's core idea is shown, interacting with the environment."

    const styleAnchor = `${personaContext} Style: Highly detailed black and white pencil drawing with rich grayscale shading and subtle cross-hatching, creating depth across all surfaces. ${characterContext} The scene takes place in a realistic interior with at least five clearly identifiable objects such as a table, a chair, a lamp, a shelf, and a window, naturally arranged. The camera frames the action clearly while showing the environment. Walls and floor are visible with natural perspective lines to ground the space. All elements are rendered at realistic human scale. The composition is clean, balanced, and fully detailed with no empty or undefined space.`

    const temporalAnchor = `TEMPORAL CONSISTENCY: The image MUST reflect the exact era and technology level implied by the scene. Never default to modern technology unless explicitly required.`
    const genderAnchor = `GENDER CONSISTENCY: The gender of all characters MUST match the narration exactly.
    If the narration uses "he/him" — render a male character.
    If "she/her" — render a female character.
    If unspecified — default to a neutral or ambiguous silhouette.`

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
    aspectRatio: string = '16:9',
    memory?: SceneMemory,
    hasLocationReference: boolean = false
  ): Promise<ImagePrompt> {
    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription = characterMetadata?.description || this.spec?.characterDescription || ''

    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

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
        ' Match character features and artistic style of reference. Use a DIFFERENT background from the reference.'
      if (hasLocationReference) {
        finalPrompt += ' Same location as reference. Only change character action.'
      }
    }

    return {
      sceneId: scene.id,
      prompt: finalPrompt
    }
  }

  async buildThumbnailPrompt(title: string, inspirationUrl?: string): Promise<string> {
    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription =
      characterMetadata?.description || this.spec?.characterDescription || 'a captivating central character'
    const stylePrefix = characterMetadata?.stylePrefix || ''

    let prompt = `EXTREMELY HIGH IMPACT YOUTUBE THUMBNAIL. Main subject: ${characterDescription}. `

    if (title && title.trim().length > 0) {
      if (inspirationUrl) {
        prompt += `The thumbnail MUST prominently feature the text: "${title}". Adapt the typography, font style, color, and placement to match what is seen in the reference image. `
      } else {
        prompt += `The thumbnail MUST prominently feature the text: "${title}" using bold, eye-catching typography integrated naturally into the composition. `
      }
    } else {
      prompt += `The thumbnail should be purely visual with NO TEXT. Do not generate any text, words, or letters anywhere. `
    }

    prompt += `Dynamic composition, vibrant contrast, cinematic lighting. `

    if (inspirationUrl) {
      prompt += `Inspired by reference mood and color palette. Main focus: character above.`
    } else {
      prompt += `Professional digital illustration, sharp details.`
    }

    if (stylePrefix) {
      prompt += `\nAdditional branding/style cues: ${stylePrefix}. `
    }

    return prompt.trim()
  }

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

  // ─── Private Builders ──────────────────────────────────────────────────────

  private buildSystemInstructions(spec: VideoTypeSpecification): string {
    const sections: string[] = []

    if (spec.role) sections.push(`## RÔLE\n${spec.role}`)
    if (spec.context) sections.push(`## CONTEXTE\n${spec.context}`)
    if ((spec as any).targetDuration) {
      sections.push(
        `## DURÉE\nCible : ${(spec as any).targetDuration} secondes\nNombre de mots : ${(spec as any).targetWordCount ?? 'env 135'} mots`
      )
    }
    if (spec.task) sections.push(`## TÂCHE\n${spec.task}`)
    if (spec.goals?.length) sections.push(`## OBJECTIFS\n${spec.goals.map((g) => `- ${g}`).join('\n')}`)
    if (spec.structure?.length) {
      const structureText = Array.isArray(spec.structure)
        ? spec.structure.map((s) => `- ${s}`).join('\n')
        : spec.structure
      sections.push(`## STRUCTURE\n${structureText}`)
    }
    if (spec.rules?.length) sections.push(`## RÈGLES\n${spec.rules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.formatting) sections.push(`## FORMATAGE\n${spec.formatting}`)

    if ((spec as any).narrativeRules?.length)
      sections.push(`## RÈGLES DE NARRATION\n${(spec as any).narrativeRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).styleRules?.length)
      sections.push(`## RÈGLES DE STYLE\n${(spec as any).styleRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).expansionRules?.length)
      sections.push(
        `## EXPANSION DU SUJET ET DÉCOUPAGE\n${(spec as any).expansionRules.map((r: string) => `- ${r}`).join('\n')}`
      )
    if ((spec as any).engagementRules?.length)
      sections.push(`## RÈGLES D'ENGAGEMENT\n${(spec as any).engagementRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).contrastRules?.length)
      sections.push(`## RÈGLES DE CONTRASTE\n${(spec as any).contrastRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).truthRules?.length)
      sections.push(`## RÈGLES DE VÉRITÉ\n${(spec as any).truthRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).emotionCurve?.length)
      sections.push(`## COURBE ÉMOTIONNELLE\n${(spec as any).emotionCurve.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).narrativeRoles?.length)
      sections.push(`## RÔLES NARRATIFS\n${(spec as any).narrativeRoles.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).curiosityRules?.length)
      sections.push(`## RÈGLES DE CURIOSITÉ\n${(spec as any).curiosityRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).escalationRules?.length)
      sections.push(`## RÈGLES D'ESCALADE\n${(spec as any).escalationRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).identityTriggers?.length)
      sections.push(
        `## DÉCLENCHEURS D'IDENTITÉ\n${(spec as any).identityTriggers.map((r: string) => `- ${r}`).join('\n')}`
      )
    if ((spec as any).postProcessing?.length)
      sections.push(`## POST-TRAITEMENT\n${(spec as any).postProcessing.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).internalCheck?.length)
      sections.push(
        `## AVANT DE FINALISER, VÉRIFIEZ INTERNEMENT :\n${(spec as any).internalCheck.map((r: string) => `- ${r}`).join('\n')}`
      )
    if ((spec as any).patternInterrupts?.length)
      sections.push(
        `## INTERRUPTIONS DE MOTIF\n${(spec as any).patternInterrupts.map((r: string) => `- ${r}`).join('\n')}`
      )
    if ((spec as any).antiBoringRules?.length)
      sections.push(`## RÈGLES ANTI-ENNUI\n${(spec as any).antiBoringRules.map((r: string) => `- ${r}`).join('\n')}`)
    if (spec.conclusionRules?.length)
      sections.push(`## RÈGLES DE CONCLUSION\n${spec.conclusionRules.map((r: string) => `- ${r}`).join('\n')}`)

    if (spec.scenePresets) sections.push(`## PRESETS DE SCÈNE\n${JSON.stringify(spec.scenePresets, null, 2)}`)
    if (spec.visualRules?.length)
      sections.push(`## RÈGLES VISUELLES\n${spec.visualRules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.orchestration?.length)
      sections.push(`## ORCHESTRATION\n${spec.orchestration.map((o) => `- ${o}`).join('\n')}`)
    if (spec.characterDescription) sections.push(`## PERSONNAGE PRINCIPAL\n${spec.characterDescription}`)
    if (spec.outputFormat) sections.push(`## FORMAT DE SORTIE\n${spec.outputFormat}`)
    if (spec.instructions?.length)
      sections.push(
        `## DIRECTIVES DE NARRATION (CORE SYSTEM PILOT)\n${spec.instructions.map((i) => `- ${i}`).join('\n')}`
      )

    return sections.filter((s) => s.trim().length > 0).join('\n\n---\n\n')
  }

  private buildUserData(
    options: PromptMakerOptions & { targetWordCount?: number; targetDuration?: number; wps?: number },
    spec: VideoTypeSpecification
  ): string {
    const { targetWordCount, targetDuration, wps } = options
    const effectiveWps = wps ?? DEFAULT_WPS

    const totalDur = targetDuration ?? parseInt(options.duration) ?? 60
    const range = options.sceneCountRange ?? computeSceneCountRange(totalDur)
    const presets = spec.scenePresets || BASE_SPEC.scenePresets

    const hardConstraint =
      targetWordCount && targetDuration
        ? [
            `⛔ CONTRAINTE STRICTE — NOMBRE DE MOTS (violer ceci = rejet automatique à chaque tentative) :`,
            `   Narration totale sur TOUTES les scènes : **~${targetWordCount} mots** (~${targetDuration}s à ${effectiveWps.toFixed(1)} m/s).`,
            `   • Nombre de scènes : **flexible de ${range.min} à ${range.max} scènes** (Cible : ~${range.ideal}).`,
            `   • ⚠️ GRANULARITÉ : Pour cette vidéo de ${targetDuration}s, vous DEVEZ utiliser au moins **${range.min} à ${range.max} scènes** (Cible : **${range.ideal}**).`,
            `   • ⚠️ DÉCOUPAGE PAR POINT : Divisez chaque point du sujet d'entrée en plusieurs scènes. NE FAITES PAS un mappage 1:1.`,
            `   • Minimums par preset (par scène) : ${Object.entries(presets)
              .map(([name, config]: [string, any]) => `${name} ≥ ${config.minWords}`)
              .join(' | ')} mots.`,
            `   • ⚠️ TRANSITION (BRIDGE) : Utilisez une scène de type 'bridge' juste avant la fin pour pivoter et créer une tension finale.`,
            `   • ⚠️ SCÈNE FINALE : La dernière scène DOIT utiliser le preset **conclusion** pour une résolution définitive.`,
            `   • Toute scène en dessous de son minimum de preset = rejet automatique.`,
            `   • Après avoir écrit chaque scène : comptez les mots, divisez par ${effectiveWps.toFixed(1)} = secondes parlées.`,
            `   • Vérifiez votre total cumulé avant de passer à la scène suivante.`,
            `   • Vous êtes libre d'utiliser autant de scènes que nécessaire (dans la plage ${range.min}-${range.max}) — mais le total des mots DOIT atteindre ${targetWordCount}.`,
            ``
          ].join('\n')
        : ''

    const lines = [
      hardConstraint,
      '---',
      `Sujet : ${options.subject}`,
      `Durée requise : ${options.duration}`,
      `Format d'image : ${options.aspectRatio}`,
      `Audience : ${options.audience}`,
      `Langue cible : ${options.language || 'English'} — Générez TOUT le contenu textuel dans cette langue SANS EXCEPTION.`
    ]

    return lines.filter(Boolean).join('\n')
  }

  private validateNarrativeCoherence(
    scenes: Array<{ sceneNumber: number; preset: string; narration: string }>
  ): string[] {
    const violations: string[] = []

    for (let i = 0; i < scenes.length - 1; i++) {
      const current = scenes[i]
      const next = scenes[i + 1]

      const currentSentences = current.narration.split(/(?<=[.!?])\s+/)
      const lastSentence = currentSentences.at(-1)?.trim() ?? ''

      const nextSentences = next.narration.split(/(?<=[.!?])\s+/)
      const firstSentence = nextSentences[0]?.trim() ?? ''

      const bridgeKeywords = extractKeywords(lastSentence)
      const openingKeywords = extractKeywords(firstSentence)

      const overlap = bridgeKeywords.filter((k) => openingKeywords.includes(k))

      if (overlap.length === 0) {
        violations.push(
          `Scene ${current.sceneNumber} → ${next.sceneNumber}: No semantic bridge detected.\n` +
            `  Bridge: "${lastSentence.slice(0, 80)}"\n` +
            `  Opening: "${firstSentence.slice(0, 80)}"`
        )
      }
    }

    const hook = scenes.find((s) => s.preset === 'hook')
    if (hook) {
      const hookKeywords = extractKeywords(hook.narration)
      const restKeywords = scenes.filter((s) => s.preset !== 'hook').flatMap((s) => extractKeywords(s.narration))

      const resolved = hookKeywords.filter((k) => restKeywords.includes(k))
      if (resolved.length < 2) {
        violations.push(
          `Narrative drift: Hook introduces concepts not resolved in subsequent scenes.\n` +
            `  Hook keywords: ${hookKeywords.slice(0, 6).join(', ')}\n` +
            `  Rest coverage: ${resolved.join(', ') || 'none'}`
        )
      }
    }

    const presets = scenes.map((s) => s.preset)
    const hasReveal = presets.includes('reveal')
    if (!hasReveal) {
      violations.push(`Structural violation: No "reveal" scene found. Arc is incomplete.`)
    }

    return violations
  }
}

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'is',
    'are',
    'was',
    'were',
    'this',
    'that',
    'it',
    'you',
    'we',
    'they',
    'he',
    'she',
    'i',
    'me',
    'my',
    'your',
    'our',
    'their',
    'have',
    'has',
    'had',
    'be',
    'been',
    'do',
    'does',
    'did',
    'will',
    'would',
    'can',
    'could',
    'should',
    'may',
    'might',
    'not',
    'no',
    'so',
    'if',
    'as'
  ])

  return text
    .toLowerCase()
    .replaceAll(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w))
}
