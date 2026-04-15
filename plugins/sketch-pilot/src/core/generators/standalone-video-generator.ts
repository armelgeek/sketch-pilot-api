import { computeSceneCountRange, QualityMode } from '../../types/video-script.types'
import type { EnrichedScene, VideoGenerationOptions } from '../../types/video-script.types'
import type { SceneMemory } from '../scene-memory'
import { BASE_SPEC, VideoGenerator } from './video-generator.abstract'
import type { VideoGeneratorConfig } from './video-generator.abstract'

type Preset = string

// ─────────────────────────────────────────────────────────────────────────────

/**
 * StandaloneVideoGenerator
 *
 * Implementation of VideoGenerator for standalone (single episode) videos.
 * Manages script generation, structuring (two-pass), and prompt building for assets.
 */
export class StandaloneVideoGenerator extends VideoGenerator {
  /** @deprecated Use getWordsPerSecond() which is provider-aware. */
  public static readonly REAL_TTS_WPS = 2.45
  /** @deprecated Use getSafetyFactor() which is provider-aware. */
  public static readonly SAFETY_FACTOR = 1.15

  constructor(config: VideoGeneratorConfig = {}) {
    super(config)
  }

  public getType(): string {
    return 'standalone'
  }

  // ─── Pass 1: Narration-only prompts ─────────────────────────────────────

  public buildNarrationOnlySystemPrompt(options: VideoGenerationOptions, targetWords: number): string {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const spec = this.getEffectiveSpec(options)

    const pilotInstructions = spec.instructions?.filter((i) => !i.includes('DIRECTIVE PRINCIPALE')).join('\n') || ''
    const pilotRules = spec.rules?.join('\n') || ''
    const primeDirective =
      spec.instructions?.find((i: string) => i.includes('DIRECTIVE PRINCIPALE')) ||
      'Suivez les instructions du CORE SYSTEM PILOT pour la voix et le style narratif.'

    const minWords = Math.round(targetWords * 0.95)
    const maxWords = Math.round(targetWords * 1.08)
    const rejectThreshold = Math.round(targetWords * 0.9)

    return `
      Vous êtes un narrateur professionnel YouTube.
      Votre SEUL travail : écrire la narration parlée complète pour une vidéo de ${duration} secondes.

      PAS DE JSON. PAS de scènes. PAS de structure. PAS de métadonnées.
      Juste la narration — un bloc continu de prose.

      🎯 OBJECTIF : ${targetWords} mots (≈${duration}s)
      Plage : ${minWords}–${maxWords} mots | ⛔ < ${rejectThreshold} = REJETÉ

      DIRECTIVE PRINCIPALE :
      ${primeDirective}

      CŒUR NARRATIF :
      ${spec.context || ''}

      RÈGLES ET STYLE :
      ${pilotInstructions}
      ${pilotRules ? `\nRÈGLES SPÉCIFIQUES :\n${pilotRules}` : ''}
    `.trim()
  }

  public buildNarrationOnlyUserPrompt(topic: string, options: VideoGenerationOptions, targetWords: number): string {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const spec = this.getEffectiveSpec(options)
    const lang = (options as any).language || 'English'
    const audience = (options as any).audience || this.config.scriptSpec?.audienceDefault || 'general audience'
    const presets = spec.scenePresets || BASE_SPEC.scenePresets
    const firstPresetName = Object.keys(presets)[0] || 'hook'

    return `SUJET : ${topic}
CIBLE : ${targetWords} mots (${duration}s)
LANGUE : ${lang}
AUDIENCE : ${audience}

Écrivez la narration complète maintenant. Commencez immédiatement par le segment initial (${firstPresetName}).`.trim()
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
    const lang = (options as any).language || 'English'

    if (attempt === 2) {
      return `La narration fait ${actualWords}/${targetWords} mots. Il manque ${deficit} mots.
NARRATION EXISTANTE (ne PAS réécrire) :
---
${previousNarration}
---
Écrivez UNIQUEMENT les ${deficit} mots manquants comme une continuation fluide.`.trim()
    }

    return `⛔ TENTATIVE ${attempt} — TROP COURT (${actualWords}/${targetWords} mots).
VOTRE DERNIÈRE TENTATIVE. Réécrivez la narration COMPLÈTE en développant chaque point avec plus de détails émotionnels.`.trim()
  }

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

  // ─── Pass 2: Structuring prompts ────────────────────────────────────────

  public buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)

    // Inject consistency instructions globally if not present
    if (spec.instructions) {
      spec.instructions.push(
        "COHÉRENCE VISUELLE : Utilisez 'locationId' pour identifier les environnements récurrents.",
        "DESCRIPTION : Dans 'imagePrompt', écrivez une description visuelle naturelle et vivante dans la langue cible. Décrivez les sujets naturellement (ex : 'la personne marche', 'une chambre sombre') sans utiliser d'identifiants techniques (comme 'YoungMan') comme des mots.",
        "MÉTADONNÉES : Fournissez un objet 'videoMetadata' à la racine de votre JSON contenant les descriptions de tous les lieux récurrents."
      )
    }

    // We use the centralized builder which now includes outputFormat!
    return this.buildSystemInstructions(spec) || 'Structurez le script vidéo.'
  }

  public buildStructuringUserPrompt(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions
  ): string {
    const spec = this.getEffectiveSpec(options)
    const duration = this.getEffectiveDuration(options)
    const wps = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWordCount = Math.round(duration * wps * safetyFactor)

    const range = computeSceneCountRange(duration)

    return `${this.buildUserData(
      {
        subject: topic,
        duration,
        aspectRatio: options.aspectRatio || '16:9',
        audience: (options as any).audience || spec.audienceDefault,
        language: options.language,
        targetWordCount,
        targetDuration: duration,
        wps,
        sceneCountRange: range
      },
      spec
    )}\n\nNARRATION:\n---\n${validatedNarration}\n---\n\nTÂCHE: Découpe en scènes JSON valides en suivant les instructions du Pilot.`
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
    let userPrompt = this.buildStructuringUserPrompt(validatedNarration, topic, options)

    if (chunkContext) {
      userPrompt += `\n\n⚠️ CHUNK MODE: This is part ${chunkContext.chunkIndex + 1} of ${chunkContext.totalChunks} of the full narration.\n`
      userPrompt += `Structure ONLY this specific block into scenes.\n`
      userPrompt += `VERBATIM RULE: You MUST structure the entire text of this chunk without omitting a single word.\n`
      userPrompt += `Scene numbering MUST start at ${chunkContext.startSceneNumber}.\n`
    }

    return {
      system: this.buildStructuringSystemPrompt(options),
      user: userPrompt
    }
  }

  public fixFullNarrationDrift(script: any): { script: any; driftFixed: boolean; driftWords: number } {
    if (!script?.scenes?.length) return { script, driftFixed: false, driftWords: 0 }

    const sceneNarrations: string = script.scenes.map((s: any) => s.narration ?? '').join(' ')
    const sceneWords = sceneNarrations.trim().split(/\s+/).filter(Boolean).length
    const fullNarrationWords = (script.fullNarration ?? '').trim().split(/\s+/).filter(Boolean).length
    const drift = Math.abs(sceneWords - fullNarrationWords)
    const driftPct = fullNarrationWords > 0 ? drift / fullNarrationWords : 1

    if (driftPct > 0.02 && driftPct <= 0.15) {
      return { script, driftFixed: false, driftWords: drift }
    }

    if (driftPct > 0.15) {
      script.fullNarration = sceneNarrations
      script.totalWordCount = sceneWords
      return { script, driftFixed: true, driftWords: drift }
    }

    return { script, driftFixed: false, driftWords: drift }
  }

  // ─── Implementation of abstract methods from VideoGenerator ────────────────

  public async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    const isHighQuality = options.qualityMode === QualityMode.HIGH_QUALITY

    if (isHighQuality) {
      const targetWords = Math.round(
        this.getEffectiveDuration(options) * this.getWordsPerSecond(options) * this.getSafetyFactor(options)
      )
      return {
        systemPrompt: this.buildNarrationOnlySystemPrompt(options, targetWords),
        userPrompt: this.buildNarrationOnlyUserPrompt(topic, options, targetWords)
      }
    }

    // For Standard/LowCost, we return the structuring prompts (JSON)
    return {
      systemPrompt: this.buildStructuringSystemPrompt(options),
      userPrompt: this.buildStructuringUserPrompt('', topic, options)
    }
  }

  public async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    const spec = this.getEffectiveSpec({} as any)
    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription = characterMetadata?.description || spec.characterDescription
    const stylePrefix = characterMetadata?.stylePrefix || ''

    const instructions = this.buildImageGenerationInstructions(hasReferenceImages, {
      styleAnchor: 'Photorealistic and highly detailed rendering.',
      characterDescription
    })

    return [stylePrefix, instructions].filter(Boolean).join('\n')
  }

  public async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    memory?: SceneMemory,
    hasLocationReference: boolean = false
  ): Promise<import('../../types/video-script.types').ImagePrompt> {
    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

    if (scene.locationId && memory) {
      const memorized = memory.locations.get(scene.locationId)
      if (memorized && !paragraph.toLowerCase().includes(memorized.prompt.toLowerCase().slice(0, 20))) {
        paragraph += `, in ${memorized.prompt}.`
      }
    }

    if (scene.persistentDecorTokens && scene.persistentDecorTokens.length > 0) {
      paragraph = `PERSISTENT SCENE ELEMENTS: ${scene.persistentDecorTokens.join(', ')}. ${paragraph}`
    }

    // Standard Registry Identities
    paragraph = this.applyIdentityLocking(paragraph, !!hasReferenceImages, {
      character: this.config.characterRegistry,
      asset: this.config.assetRegistry
    })

    const spec = this.getEffectiveSpec({} as any)
    const finalPrompt = this.getEnrichedImagePrompt(paragraph, spec)

    return {
      sceneId: scene.id,
      prompt: finalPrompt
    }
  }

  public async buildThumbnailPrompt(title: string, environment: string = '', inspirationUrl?: string): Promise<string> {
    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription =
      characterMetadata?.description ||
      this.config.scriptSpec?.characterDescription ||
      'a captivating central character'
    return `EXTREMELY HIGH IMPACT YOUTUBE THUMBNAIL. Main subject: ${characterDescription}. Title: ${title}. ${environment}`.trim()
  }

  public buildAnimationPrompt(
    scene: EnrichedScene,
    imageStyle?: { characterDescription?: string }
  ): { sceneId: string; instructions: string; movements: any[] } {
    const instructions = scene.animationPrompt || ''
    const movements: any[] = [{ element: 'body', description: instructions }]
    return { sceneId: scene.id, instructions, movements }
  }
}
