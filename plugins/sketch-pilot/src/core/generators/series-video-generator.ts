import { computeSceneCountRange, type EnrichedScene, type VideoGenerationOptions } from '../../types/video-script.types'
import type { VideoTypeSpecification } from '../prompt-maker.types'
import { VideoGenerator } from './video-generator.abstract'
import type { VideoGeneratorConfig } from './video-generator.abstract'

export interface SeriesContext {
  seriesId: string
  episodeNumber: number
  previousEpisodesContext: string
  characterRegistry: Record<string, { description: string; modelId?: string }>
  totalEpisodes?: number
  isFinalEpisode?: boolean
}

/**
 * SeriesVideoGenerator
 *
 * Implementation for multi-episode narrative content.
 * Handles episodic memory, character persistence, and narrative transitions.
 */
export class SeriesVideoGenerator extends VideoGenerator {
  private seriesContext: SeriesContext

  constructor(config: VideoGeneratorConfig, seriesContext: SeriesContext) {
    super(config)
    this.seriesContext = seriesContext

    // Automatic final episode detection
    if (this.seriesContext.totalEpisodes && this.seriesContext.episodeNumber >= this.seriesContext.totalEpisodes) {
      this.seriesContext.isFinalEpisode = true
    }
  }

  public getType(): string {
    return 'series'
  }

  protected getDefaultOutputFormat(): string {
    const isFinal = this.seriesContext.isFinalEpisode

    const metadataBlock = isFinal
      ? `
  "seriesMetadata": {
    "episodeSummary": "Résumé narratif final de la série.",
    "resolution": "Description de la conclusion définitive de l'intrigue.",
    "characterFinalState": { "personnageA": "son destin final / situation stable", "personnageB": "..." }
  }`.trim()
      : `
  "seriesMetadata": {
    "episodeSummary": "Résumé narratif concis de cet épisode pour la mémoire à long terme.",
    "cliffhanger": "Description du suspense final ou de l'ouverture pour l'épisode suivant.",
    "characterContinuity": { 
        "personnageA": { "description": "état/tenue/lieu à la fin", "isNew": true }, 
        "personnageB": { "description": "...", "isNew": false } 
    },
    "nextEpisodeTease": "Une phrase d'accroche pour l'épisode suivant."
  }`.trim()

    return `
{
  ${metadataBlock},
  "titles": ["titre épisode 1", "titre épisode 2"],
  "fullNarration": "La narration complète verbatim de l'épisode...",
  "scenes": [
    {
      "id": "scene-1",
      "sceneNumber": 1,
      "summary": "Résumé visuel",
      "narration": "Narration verbatim...",
      "locationId": "identifiant-lieu-unique",
      "imagePrompt": "Description visuelle",
      "animationPrompt": "Instructions mouvement",
      "cameraAction": "zoom-in",
      "preset": "hook",
      "transition": "fade"
    }
  ]
}`.trim()
  }

  // ─── Narrative Overrides ──────────────────────────────────────────────────

  protected validateNarrativeCoherence(scenes: any[]): string[] {
    const violations: string[] = []
    // TODO: Add rules like "Episode must start with a hook that bridges the previous cliffhanger"
    return violations
  }

  // ─── Implementation of abstract methods ───────────────────────────────────

  public buildTwoPassPrompts(topic: string, options: VideoGenerationOptions, targetWords?: number) {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const target = targetWords ?? Math.round(duration * wps * safetyFactor)

    const charSection = Object.entries(this.seriesContext.characterRegistry)
      .map(([name, data]) => `• ${name}: ${data.description}${data.modelId ? ` (CASTING: ${data.modelId})` : ''}`)
      .join('\n')

    return {
      pass1: {
        system: `Vous êtes un scénariste de séries spécialisé dans la continuité narrative.
Episode N° ${this.seriesContext.episodeNumber}.
IMPORTANT: Répondez exclusivement au format JSON.

REGISTRE DES PERSONNAGES (Canon):
${charSection || 'Aucun personnage récurrent défini.'}

CONTEXTE DES ÉPISODES PRÉCÉDENTS:
${this.seriesContext.previousEpisodesContext}

Tâche: Écrire la narration de l'épisode ${this.seriesContext.episodeNumber} en respectant strictement le ton et l'évolution des personnages.`,
        user: `Sujet de l'épisode (Format JSON): ${topic}. Cible: ${target} mots.`,
        targetWords: target
      }
    }
  }

  public buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)

    const seriesSpec: VideoTypeSpecification = {
      ...spec,
      task: `${spec.task}\n\nIMPORTANT: Vous DEVEZ inclure l'objet "seriesMetadata" pour permettre la continuité narrative. Sans cet objet, la série s'arrêtera.`,
      context: `[CONTINUITÉ] 
Épisode N°: ${this.seriesContext.episodeNumber}${this.seriesContext.totalEpisodes ? ` sur ${this.seriesContext.totalEpisodes}` : ''}
ID Saga: ${this.seriesContext.seriesId}
Contexte global: ${this.seriesContext.previousEpisodesContext || 'Nouveau départ.'}

REGISTRE DES PERSONNAGES (CASTING):
${Object.entries(this.seriesContext.characterRegistry)
  .map(
    ([name, data]) => `• ${name}: ${data.description}${data.modelId ? ` (UTILISER MODÈLE ID: ${data.modelId})` : ''}`
  )
  .join('\n')}`,
      instructions: [
        ...(spec.instructions || []),
        'Maintenez une continuité stricte avec les épisodes précédents.',
        'CASTING: Si un personnage a un MODÈLE ID, incluez-le impérativement dans les imagePrompts pour garantir la ressemblance.',
        "NOUVEAUX PERSONNAGES: Si vous introduisez un nouveau personnage important, décrivez-le précisément dans le bloc 'seriesMetadata'.",
        this.seriesContext.isFinalEpisode
          ? "RÉSOLUTION FINALE (OBLIGATOIRE): Concluez TOUTES les intrigues. INTERDICTION de finir sur un cliffhanger. L'histoire doit être terminée et fermée."
          : 'Finissez SUR UN CLIFFHANGER (suspense non résolu).',
        "Fournissez obligatoirement le bloc 'seriesMetadata' au début de votre réponse JSON."
      ]
    }

    return this.buildSystemInstructions(seriesSpec) || 'Structurez cet épisode de série.'
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
    )}\n\nNARRATION EPISODE ${this.seriesContext.episodeNumber} (JSON):\n---\n${validatedNarration}\n---\n\n${this.seriesContext.isFinalEpisode ? '⚠️ ÉPISODE FINAL: Ne laissez aucune question sans réponse. Résolution totale.' : ''}\nTÂCHE: Découpe en scènes JSON valides en suivant strictement le format JSON demandé.`
  }

  public buildPass2Prompts(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    chunkContext?: any
  ) {
    let userPrompt = this.buildStructuringUserPrompt(validatedNarration, topic, options)

    if (chunkContext) {
      userPrompt += `\n\n⚠️ CHUNK MODE: Part ${chunkContext.chunkIndex + 1} of ${chunkContext.totalChunks}\n`
      userPrompt += `Scene numbering must start at ${chunkContext.startSceneNumber}.\n`
    }

    return {
      system: this.buildStructuringSystemPrompt(options),
      user: userPrompt
    }
  }

  public buildNarrationRetryUserPrompt(
    topic: string,
    currentNarration: string,
    options: VideoGenerationOptions,
    targetWords: number,
    actualWords: number,
    attempt: number
  ) {
    return `⚠️ Episode ${this.seriesContext.episodeNumber} - ATTEMPT ${attempt} FAILED.
The narration is too short (${actualWords}/${targetWords} words).
Please expand the script for subject: ${topic}. Focus on narrative depth and continuity.`
  }

  public fixFullNarrationDrift(script: any) {
    return { script, driftFixed: false, driftWords: 0 }
  }

  public async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    const systemPrompt = this.buildStructuringSystemPrompt(options)
    const userPrompt = this.buildStructuringUserPrompt('', topic, options) // No narration yet for single pass

    return {
      systemPrompt,
      userPrompt
    }
  }

  public async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages?: boolean,
    aspectRatio?: string,
    memory?: any,
    hasLocationReference?: boolean
  ): Promise<any> {
    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

    // 1. Resolve character model casting
    const characterMatches = paragraph.match(/([A-Z][a-z]+)/g) || []
    if (characterMatches.length > 0) {
      for (const name of characterMatches) {
        const char = this.seriesContext.characterRegistry[name]
        if (char?.modelId && !paragraph.includes(char.modelId)) {
          paragraph += `, Character ${name}: UTILISER MODÈLE ID: ${char.modelId}`
        }
      }
    }

    // 2. Resolve location memory (inherited behavior but in series)
    if (scene.locationId && memory?.locations) {
      const memorized = memory.locations.get(scene.locationId)
      if (memorized && !paragraph.toLowerCase().includes(memorized.prompt.toLowerCase().slice(0, 20))) {
        paragraph += `, in ${memorized.prompt}.`
      }
    }

    // 3. Apply spec visual rules (Stoicism, Horror, etc)
    const spec = this.getEffectiveSpec({} as any)
    const finalPrompt = this.getEnrichedImagePrompt(paragraph, spec)

    return { sceneId: scene.id, prompt: finalPrompt }
  }

  public buildAnimationPrompt(
    scene: EnrichedScene,
    imageStyle?: { characterDescription?: string }
  ): { sceneId: string; instructions: string; movements: any[] } {
    return { sceneId: scene.id, instructions: scene.animationPrompt || '', movements: [] }
  }

  public async buildThumbnailPrompt(title: string, environment?: string, inspirationUrl?: string): Promise<string> {
    return `Series thumbnail: ${title}`
  }

  public async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    const spec = this.getEffectiveSpec({} as any)
    return this.buildCharacterDescription(spec)
  }

  protected buildCharacterDescription(spec: VideoTypeSpecification): string {
    const charSection = Object.entries(this.seriesContext.characterRegistry)
      .map(
        ([name, data]) =>
          `Recurring Character "${name}": ${data.description}${data.modelId ? ` (MODEL: ${data.modelId})` : ''}`
      )
      .join(', ')

    const styleAnchor = `Style episodic series consistency. ${charSection ? `Recalling characters: ${charSection}` : ''}`

    return [spec.characterDescription || '', styleAnchor].filter(Boolean).join('\n')
  }
  /**
   * static utility to evolve the context for the next episode
   */
  public static updateContext(currentContext: SeriesContext, scriptResult: any): SeriesContext {
    const metadata = scriptResult.seriesMetadata || {}
    const newContinuity = metadata.characterContinuity || {}

    // Merge characters
    const updatedRegistry = { ...currentContext.characterRegistry }

    for (const [name, data] of Object.entries(newContinuity)) {
      const charData = data as any
      if (updatedRegistry[name]) {
        // Update description, keep modelId
        updatedRegistry[name] = {
          ...updatedRegistry[name],
          description: charData.description || updatedRegistry[name].description
        }
      } else {
        // New character
        updatedRegistry[name] = {
          description: charData.description || 'Nouveau personnage',
          modelId: undefined // Needs manual casting
        }
      }
    }

    return {
      ...currentContext,
      episodeNumber: currentContext.episodeNumber + 1,
      previousEpisodesContext:
        `${currentContext.previousEpisodesContext || ''}\nEpisode ${currentContext.episodeNumber}: ${metadata.episodeSummary || 'Pas de résumé.'}`.trim(),
      characterRegistry: updatedRegistry
    }
  }
}
