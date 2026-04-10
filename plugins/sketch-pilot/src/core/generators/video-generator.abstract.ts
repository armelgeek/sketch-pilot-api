import { CharacterModelRepository } from '../../../../../src/infrastructure/repositories/character-model.repository'
import { computeSceneCountRange } from '../../types/video-script.types'
import type { EnrichedScene, ImagePrompt, VideoGenerationOptions } from '../../types/video-script.types'
import type { VideoTypeSpecification } from '../prompt-maker.types'
import type { SceneMemory } from '../scene-memory'

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
export const DEFAULT_WPS = 2.37
export const DEFAULT_SAFETY_FACTOR = 1.05

// ─── Scaffold slot definitions ────────────────────────────────────────────────
export const CAMERA_ACTIONS_LIST = [
  'zoom-in',
  'zoom-out',
  'pan-right',
  'pan-left',
  'pan-up',
  'pan-down',
  'snap-zoom',
  'breathing'
]

export const TRANSITIONS_LIST = [
  'fade',
  'blur',
  'crossfade',
  'zoom-in',
  'dissolve',
  'distance',
  'fade-black',
  'fade-white',
  'wipe-left',
  'wipe-right',
  'slide-left',
  'slide-right',
  'radial',
  'pixelize',
  'squeezev',
  'squeezeh',
  'zoom-out'
]

// ─── BASE_SPEC: Technical defaults ──────────────────────────────────────────
export const BASE_SPEC: Partial<VideoTypeSpecification> & {
  wordsPerSecondBase: number
  scenePresets: Record<string, { minWords: number; minSentences: number }>
} = {
  wordsPerSecondBase: 2.45,
  narrativeProgression: 'hook → reveal → tension → résolution → conclusion',
  structuralConstraints: [
    'Dernière scène: preset "conclusion" obligatoire',
    'Utilisez une scène "bridge" juste avant la finale pour tension'
  ],
  visualRules: [],
  orchestration: [],
  instructions: [
    'FAVOR SHORT, PUNCHY SENTENCES.',
    "Each scene narration MUST be a verbatim slice of 'fullNarration'.",
    'Transitions MUST occur at natural pauses (full stops, commas, breath marks).',
    'DO NOT USE ABBREVIATIONS in the narration. Write everything exactly as it should be spoken (e.g., "100 pour cent" instead of "100%", "2 heures" instead of "2h").',
    `Every scene MUST have a cinematic 'transition' chosen EXCLUSIVELY from this list: [${TRANSITIONS_LIST.join(', ')}]. **'none' or 'cut' are NOT acceptable for intermediate scenes.**`,
    `Every scene MUST have a dynamic 'cameraAction' chosen from this list: [${CAMERA_ACTIONS_LIST.join(', ')}].`,
    'CAMERA VARIATION: Do not use the same cameraAction for more than 2 consecutive scenes.',
    "CAMERA MOOD: Choose the cameraAction based on the emotional context (e.g., 'zoom-in' for focus/tension, 'pan' for scale/environment).",
    'NARRATIVE GUARDRAIL: DO NOT use speaker labels like "HOST:", "GUEST:", "NARRATEUR:" or "PERSONNAGE:". Write fluid narration only.',
    'NARRATIVE GUARDRAIL: If dialogue is needed, write it naturally without tags, or use character names ONLY if defined in the registry.',
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

export interface VideoGeneratorConfig {
  scriptSpec?: VideoTypeSpecification
  characterModelId?: string
  systemPrompt?: string
  seriesContext?: {
    seriesId: string
    episodeNumber: number
    previousEpisodesContext: string
    characterRegistry: Record<string, any>
    seed?: string
  }
}

export abstract class VideoGenerator {
  protected readonly config: VideoGeneratorConfig
  protected readonly characterRepository: CharacterModelRepository = new CharacterModelRepository()
  protected readonly cameraActions: string[] = CAMERA_ACTIONS_LIST
  protected readonly transitionTypes: string[] = TRANSITIONS_LIST

  constructor(config: VideoGeneratorConfig = {}) {
    this.config = config
  }

  public abstract getType(): string

  public getCameraActions(): string[] {
    return this.cameraActions
  }

  public getTransitionTypes(): string[] {
    return this.transitionTypes
  }

  public getVisualSeed(): number | undefined {
    // Priority 1: Direct spec seed
    const specSeed = (this.config.scriptSpec as any)?.seriesMetadata?.seed || (this.config.scriptSpec as any)?.seed
    if (specSeed) return this.normalizeSeed(specSeed)

    // Priority 2: Series context seed
    const contextSeed = this.config.seriesContext?.seed
    if (contextSeed) return this.normalizeSeed(contextSeed)

    return undefined
  }

  private normalizeSeed(seed: any): number {
    if (typeof seed === 'number') return seed
    const s = String(seed)
    const num = parseInt(s, 10)
    return isNaN(num) ? this.hashCode(s) : num
  }

  private hashCode(s: string): number {
    let hash = 0
    for (let i = 0; i < s.length; i++) {
      hash = (hash << 5) - hash + s.charCodeAt(i)
      hash = Math.trunc(hash) // Convert to 32bit integer
    }
    return Math.abs(hash)
  }

  // ─── Provider helpers ──────────────────────────────────────────────────────

  protected resolveProvider(options: VideoGenerationOptions): string {
    return (options.audioProvider || 'elevenlabs').toLowerCase()
  }

  protected getSafetyFactor(options: VideoGenerationOptions): number {
    const provider = this.resolveProvider(options)
    return PROVIDER_SAFETY_FACTOR[provider] ?? DEFAULT_SAFETY_FACTOR
  }

  // ─── Character resolution ──────────────────────────────────────────────────

  protected async resolveCharacterMetadata(): Promise<any | undefined> {
    const characterModelId = this.config.characterModelId
    const scriptSpec = this.config.scriptSpec

    if (characterModelId) {
      const model = await this.characterRepository.findById(characterModelId)
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
    return scriptSpec
      ? {
          description: scriptSpec.characterDescription || '',
          images: [],
          thumbnailInspirations: []
        }
      : undefined
  }

  public async resolveCharacterImages(): Promise<any[]> {
    const metadata = await this.resolveCharacterMetadata()
    return metadata?.images || []
  }

  public async resolveThumbnailInspirations(): Promise<any[]> {
    const metadata = await this.resolveCharacterMetadata()
    return metadata?.thumbnailInspirations || []
  }

  // ─── Speed & timing ───────────────────────────────────────────────────────

  public getWordsPerSecond(options: VideoGenerationOptions): number {
    if (options.wordsPerMinute) {
      return options.wordsPerMinute / 60
    }
    const provider = this.resolveProvider(options)
    if (PROVIDER_WPS[provider] !== undefined) {
      return PROVIDER_WPS[provider]
    }
    return DEFAULT_WPS
  }

  public getEffectiveDuration(options: VideoGenerationOptions): number {
    return options.duration
  }

  public getEffectiveSpec(options: VideoGenerationOptions): VideoTypeSpecification {
    const rawSpec = options?.customSpec ?? this.config.scriptSpec
    if (!rawSpec && !this.config.systemPrompt) {
      throw new Error('[VideoGenerator] No specification provided and no systemPrompt found.')
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

  // ─── Validation ────────────────────────────────────────────────────────────

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
    const corrected = narration.trim()

    const presets = spec.scenePresets || BASE_SPEC.scenePresets
    const config = presets[preset] || { minWords: 15, minSentences: 3 }

    corrected.split(/(?<=[.!?])\s+/).forEach((sentence) => {
      const words = sentence.trim().split(/\s+/)
      if (words.length > 30) {
        violations.push(
          `Sentence too long (${words.length} words) — needs manual split: "${sentence.slice(0, 80)}${sentence.length > 80 ? '...' : ''}"`
        )
      }
    })

    const wordCount = corrected.split(/\s+/).filter(Boolean).length
    const minWords = config.minWords
    if (wordCount < minWords) {
      violations.push(`Nombre de mots trop bas : ${wordCount}/${minWords} minimum pour le preset "${preset}"`)
    }

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
      const spec = this.getEffectiveSpec(options)
      const { corrected: jsCorrected, violations } = this.validateAndCorrectNarration(scene.narration, preset, spec)

      let finalNarration = jsCorrected

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
      allViolations.push({ sceneNumber: 0, violations: coherenceViolations })
    }

    const needsRetry = allViolations.some((v) =>
      v.violations.some((msg) => msg.includes('Word count too low') || msg.includes('Sentence count too low'))
    )

    return { correctedScenes, allViolations, needsRetry, isValid: allViolations.length === 0 }
  }

  protected validateNarrativeCoherence(scenes: any[]): string[] {
    const violations: string[] = []
    return violations
  }

  // ─── Prompts Correction ────────────────────────────────────────────────────

  protected async correctNarrationWithLLM(
    scene: { sceneNumber: number; preset: string; narration: string },
    llmClient: { complete: (prompt: string) => Promise<string> },
    options?: VideoGenerationOptions
  ): Promise<{ corrected: string; changes: string[] }> {
    const prompt = this.buildMicroCorrectionPrompt(scene, options)
    try {
      const raw = await llmClient.complete(prompt)
      const clean = raw.replaceAll(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      return { corrected: parsed.corrected ?? scene.narration, changes: parsed.changes ?? [] }
    } catch (error) {
      console.warn(`[VideoGenerator] LLM micro-correction failed for scene ${scene.sceneNumber}:`, error)
      return { corrected: scene.narration, changes: [] }
    }
  }

  protected buildMicroCorrectionPrompt(
    scene: { sceneNumber: number; preset: string; narration: string },
    options?: VideoGenerationOptions
  ): string {
    const spec = options ? this.getEffectiveSpec(options) : null
    const specCorrectionRules =
      spec?.instructions
        ?.filter((i) => i.toUpperCase().startsWith('CORRECTION'))
        .map((r, idx) => `${idx + 1}. ${r.replace(/^CORRECTION\s*[:\-–—]?\s*/i, '')}`) ?? []

    const specVoiceContext = spec?.instructions?.length
      ? `\nCONTEXTE DU PILOT (règles de voix et style à respecter ABSOLUMENT) :\n${spec.instructions
          .slice(0, 6)
          .map((r) => `— ${r}`)
          .join('\n')}\n`
      : ''

    return `Vous êtes un correcteur de narration. Corrigez UNIQUEMENT les violations listées ci-dessous.
Ne réécrivez PAS toute la narration. Ne changez PAS ce qui est déjà correct.
Renvoyez UNIQUEMENT un JSON valide : { "corrected": "string", "changes": ["string"] }
Pas de markdown, pas de backticks, pas d'explication en dehors du JSON.
${specVoiceContext}
NARRATION À CORRIGER (preset : ${scene.preset}, scène : ${scene.sceneNumber}) :
"${scene.narration}"
`
  }

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

    const failingSceneNumbers: number[] = []
    const sceneMatches = Array.from(validationError.matchAll(/Scene\s+(\d+)/gi))
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
        const targetSceneDuration = Math.round(minWords / wps)

        sceneDiagnoses.push(
          `  • Scène ${sceneNum} (preset : ${preset}) :` +
            `\n      Actuel : ~${currentWords} mots (~${currentDuration}s parlés)` +
            `\n      Requis : ≥${minWords} mots (~${targetSceneDuration}s)` +
            `\n      Déficit : ~${Math.max(0, targetSceneDuration - currentDuration)} secondes de narration manquante`
        )
      }
    }

    const overallLong = actualWords > targetWords * 1.12
    const spec = this.getEffectiveSpec(options || ({} as any))
    const presets = spec.scenePresets || BASE_SPEC.scenePresets

    const perPresetRules = Object.entries(presets)
      .filter(([, config]: [string, any]) => config.rules?.length > 0)
      .map(
        ([name, config]: [string, any], idx) =>
          `${idx + 2}. Every "${name}" scene needs: ${config.rules.slice(0, 3).join(' → ')}.`
      )

    const mandatoryRules = [
      `1. ${overallLong ? `TRIM every scene — merge content or remove filler.` : `Expand failing scenes — go deeper into the core idea.`}`,
      ...perPresetRules,
      `${perPresetRules.length + 2}. Each content beat = ${overallLong ? 'exactly 1' : 'minimum 1'} full sentence.`,
      `${perPresetRules.length + 3}. After writing each scene, estimate its spoken duration (~${wps.toFixed(1)} words/second) — it must match the target.`
    ]

    return `
🚨 ATTEMPT ${attempt} FAILED
SPOKEN DURATION: ~${actualDuration}s. Target: ~${targetDuration}s.
${missingSeconds > 0 ? `❌ Missing ~${missingSeconds}s (≈${deficit} words).` : `✅ Duration OK, but rules violated.`}

FAILING SCENES:
${sceneDiagnoses.join('\n')}

MANDATORY RULES:
${mandatoryRules.join('\n')}
`.trim()
  }

  protected computePresetTargets(avgWordsPerScene: number, spec: VideoTypeSpecification): Record<string, number> {
    const targets: Record<string, number> = {}
    const presets = spec.scenePresets || BASE_SPEC.scenePresets
    for (const [name, config] of Object.entries(presets)) {
      let multiplier = 1
      if (name === 'hook') multiplier = 0.7
      if (name === 'reveal') multiplier = 1.3
      if (name === 'conclusion') multiplier = 1.1
      if (name === 'bridge') multiplier = 0.8
      targets[name] = Math.max((config as any).minWords || 15, Math.round(avgWordsPerScene * multiplier))
    }
    return targets
  }

  protected buildScaffoldInstruction(preset: string, wordTarget: number): string {
    return `**${preset.toUpperCase()} scene** (Target: ~${wordTarget} words). Follow Pilot instructions.`
  }

  // --- Abstract methods to be implemented by child classes ---

  abstract buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }>

  abstract buildTwoPassPrompts(
    topic: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): { pass1: { system: string; user: string; targetWords: number } }

  abstract buildPass2Prompts(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    chunkContext?: { chunkIndex: number; totalChunks: number; startSceneNumber: number }
  ): { system: string; user: string }

  abstract buildNarrationRetryUserPrompt(
    topic: string,
    currentNarration: string,
    options: VideoGenerationOptions,
    targetWords: number,
    actualWords: number,
    attempt: number
  ): string

  abstract fixFullNarrationDrift(script: any): { script: any; driftFixed: boolean; driftWords: number }

  abstract buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages?: boolean,
    aspectRatio?: string,
    memory?: SceneMemory,
    hasLocationReference?: boolean
  ): Promise<ImagePrompt>

  abstract buildAnimationPrompt(
    scene: EnrichedScene,
    imageStyle?: { characterDescription?: string }
  ): { sceneId: string; instructions: string; movements: any[] }

  abstract buildThumbnailPrompt(title: string, environment?: string, inspirationUrl?: string): Promise<string>

  abstract buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string>

  // ─── Protected Prompt Builders ───────────────────────────────────────────

  protected getDefaultOutputFormat(): string {
    return `
{
  "titles": ["titre 1", "titre 2", "titre 3"],
  "fullNarration": "La narration complète verbatim...",
  "scenes": [
    {
      "id": "scene-1",
      "sceneNumber": 1,
      "summary": "Résumé visuel court",
      "narration": "Segment de narration exact pour cette scène...",
      "locationId": "identifiant-lieu-unique",
      "imagePrompt": "Description visuelle détaillée",
      "charactersInScene": [],
      "animationPrompt": "Instructions de mouvement",
      "cameraAction": "zoom-in",
      "preset": "hook",
      "transition": "fade"
    }
  ]
}`.trim()
  }

  protected buildSystemInstructions(spec: VideoTypeSpecification): string {
    const sections: string[] = []

    if (!spec) {
      return this.config.systemPrompt ? `## CORE SYSTEM PILOT\n${this.config.systemPrompt}` : ''
    }

    if (this.config.systemPrompt) {
      sections.push(`## CORE SYSTEM PILOT\n${this.config.systemPrompt}`)
    }

    if (spec.role) sections.push(`## RÔLE\n${spec.role}`)
    if (spec.context) sections.push(`## CONTEXTE\n${spec.context}`)
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

    // Narrative Rule Extensions
    if (spec.narrativeProgression) sections.push(`## PROGRESSION NARRATIVE\n${spec.narrativeProgression}`)
    if (spec.structuralConstraints?.length) {
      sections.push(`## CONTRAINTES STRUCTURELLES\n${spec.structuralConstraints.map((r) => `- ${r}`).join('\n')}`)
    }

    if (spec.visualRules?.length)
      sections.push(`## RÈGLES VISUELLES\n${spec.visualRules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.orchestration?.length)
      sections.push(`## ORCHESTRATION\n${spec.orchestration.map((o) => `- ${o}`).join('\n')}`)
    if (spec.characterDescription) sections.push(`## PERSONNAGE PRINCIPAL\n${spec.characterDescription}`)

    // OUTPUT FORMAT IS CRITICAL
    const outputFormat = spec.outputFormat || this.getDefaultOutputFormat()
    sections.push(
      `## FORMAT DE SORTIE JSON\nRetournez UNIQUEMENT un objet JSON valide suivant exactement cette structure :\n${outputFormat}`
    )

    if (spec.instructions?.length)
      sections.push(
        `## DIRECTIVES DE NARRATION (CORE SYSTEM PILOT)\n${spec.instructions.map((i) => `- ${i}`).join('\n')}`
      )

    return sections.filter((s) => s.trim().length > 0).join('\n\n---\n\n')
  }

  protected buildUserData(options: any, spec: VideoTypeSpecification): string {
    const { targetWordCount, targetDuration, wps } = options
    const effectiveWps = wps ?? DEFAULT_WPS
    const totalDur = targetDuration ?? options.duration ?? 60
    const range = options.sceneCountRange ?? computeSceneCountRange(totalDur)
    const presets = spec.scenePresets || BASE_SPEC.scenePresets

    const constraints =
      targetWordCount && targetDuration
        ? [
            `⛔ CONTRAINTES STRICTES:`,
            `• Narration totale: ~${targetWordCount} mots (~${totalDur}s à ${effectiveWps.toFixed(1)} m/s)`,
            `• Scènes: flexible ${range.min}-${range.max} (cible: ~${range.ideal})`,
            `• Minimum par preset: ${Object.entries(presets)
              .map(([name, config]) => `${name} ≥ ${(config as any).minWords}`)
              .join(' | ')} mots`,
            `• Dernière scène: preset "conclusion" obligatoire`,
            `• Utilisez une scène "bridge" juste avant la finale pour tension`,
            `• Comptez les mots scène par scène, vérifiez total avant de passer à la suivante`,
            `• NE PAS dépasser ou ignorer ces règles — violation = rejet automatique`
          ].join('\n')
        : ''

    return [
      constraints,
      '---',
      `Sujet: ${options.subject}`,
      `Durée requise: ${options.duration}s`,
      `Format d'image: ${options.aspectRatio || '16:9'}`,
      `Audience: ${options.audience || spec.audienceDefault}`,
      `Langue cible: ${options.language || 'Français'} — tout le texte doit être dans cette langue.`
    ]
      .filter(Boolean)
      .join('\n')
  }

  // ─── Shared Utility Methods ──────────────────────────────────────────────

  protected getEnrichedImagePrompt(basePrompt: string, spec: VideoTypeSpecification): string {
    let finalPrompt = basePrompt.trim()

    // Apply style rules from spec
    const styleRules = [...(spec.visualRules || []), ...(spec.styleRules || [])]

    if (styleRules.length > 0) {
      const styleContext = styleRules.join(', ')
      if (!finalPrompt.toLowerCase().includes(styleContext.toLowerCase().slice(0, 20))) {
        finalPrompt = `${finalPrompt}, ${styleContext}`
      }
    }

    return finalPrompt
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .trim()
  }

  protected extractKeywords(text: string): string[] {
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
}
