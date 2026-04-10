import { computeSceneCountRange, type EnrichedScene, type VideoGenerationOptions } from '../../types/video-script.types'
import type { VideoTypeSpecification } from '../prompt-maker.types'
import { VideoGenerator } from './video-generator.abstract'
import type { VideoGeneratorConfig } from './video-generator.abstract'

export interface SeriesContext {
  seriesId: string
  episodeNumber: number
  globalContext?: string
  previousEpisodesContext: string
  characterRegistry: Record<
    string,
    {
      description: string
      modelId?: string
      portraitPrompt?: string
      thumbnailUrl?: string
    }
  >
  locationRegistry: Record<
    string,
    {
      description: string
      thumbnailUrl?: string
    }
  >
  lastCliffhanger?: string
  unresolvedThreads?: string[]
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
    "cliffhanger": "Description détaillée du cliffhanger (Révélation, Péril, ou Choix).",
    "characterContinuity": { 
        "personnageA": { "description": "état/tenue/lieu à la fin", "isNew": true }, 
        "personnageB": { "description": "...", "isNew": false } 
    },
    "nextEpisodeTease": "Une phrase d'accroche mystérieuse pour l'épisode suivant.",
    "unresolvedThreads": ["Liste des petits mystères ou intrigues secondaires non résolus"]
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
      "charactersId": ["@Sarah"],
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

    // Episode must start with a hook that bridges the previous cliffhanger
    if (this.seriesContext.episodeNumber > 1 && this.seriesContext.lastCliffhanger) {
      const hookScene = scenes.find((s) => s.preset === 'hook') || scenes[0]
      if (hookScene) {
        // We can't strictly check keywords without being too rigid,
        // but we can look for "previously", "last time", or specific character names
        const hookText = (hookScene.narration || '').toLowerCase()
        const previousCliffhanger = this.seriesContext.lastCliffhanger.toLowerCase()

        // This is a soft check - we just log if it seems disconnected
        const hasBridgeKeywords = ['précédemment', 'alors que', 'souvenez-vous', 'pendant ce temps', 'encore'].some(
          (k) => hookText.includes(k)
        )
        if (!hasBridgeKeywords && hookText.length < 50) {
          console.warn(
            `[SeriesVideoGenerator] Hook for Episode ${this.seriesContext.episodeNumber} may lack a narrative bridge to: "${this.seriesContext.lastCliffhanger.slice(0, 50)}..."`
          )
        }
      }
    }

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

    const bridgeInstruction =
      this.seriesContext.episodeNumber > 1 && this.seriesContext.lastCliffhanger
        ? `\n\n⚠️ PONT NARRATIF OBLIGATOIRE : L'épisode DOIT commencer par adresser ou résoudre le cliffhanger de l'épisode précédent :\n"${this.seriesContext.lastCliffhanger}"`
        : ''

    const threadsInstruction = this.seriesContext.unresolvedThreads?.length
      ? `\n\nINTRIGUES SECONDAIRES EN COURS :\n${this.seriesContext.unresolvedThreads.map((t) => `- ${t}`).join('\n')}`
      : ''

    return {
      pass1: {
        system: `Vous êtes un scénariste de séries expert en binge-watching et en narration épisodique.
Episode N° ${this.seriesContext.episodeNumber}.
Tâche: Écrire la narration de l'épisode ${this.seriesContext.episodeNumber}.

CONTEXTE GLOBAL (BIBLE) :
${this.seriesContext.globalContext || 'Pas de bible spécifiée.'}

REGISTRE DES LIEUX (Canon) :
${
  Object.entries(this.seriesContext.locationRegistry)
    .map(([name, data]) => `• ${name}: ${data.description}`)
    .join('\n') || 'Aucun lieu récurrent défini.'
}

ÉPISODES PRÉCÉDENTS :
${this.seriesContext.previousEpisodesContext || 'Premier épisode.'}

DIRECTIVES DE CONTINUITÉ :${bridgeInstruction}${threadsInstruction}

RÈGLES D'OR DE NARRATION :
• ÉVOLUTION : L'histoire DOIT avancer. Chaque épisode doit apporter de nouvelles informations, de nouveaux enjeux ou des changements de situation.
• LIEUX : Réutilisez les lieux du registre pour créer un sentiment de familiarité. Décrivez-les avec constance.
• RYTHME : Accompagnez la montée en tension. Ne vous contentez pas de décrire, faites vivre le conflit.
• PERSONNAGES : Respectez scrupuleusement les traits de personnalité et les descriptions physiques du registre.
• INTERDICTION DE TOUTE CONCLUSION : Sauf si c'est l'épisode FINAL, l'intrigue doit rester tendue au maximum.
• SANS RÉCAPITULATIF : Ne commencez pas par "Le dernier épisode s'est terminé par...". Plongez directement dans l'action (In Media Res) tout en gardant une suite logique.`,
        user: `DÉTAILS DE L'ÉPISODE : ${topic || options.episodeSummary || 'Générez la suite logique de la saga en vous basant sur le cliffhanger précédent.'}\nCible : ${target} mots.`,
        targetWords: target
      }
    }
  }

  public buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)

    const seriesSpec: VideoTypeSpecification = {
      ...spec,
      task: `${spec.task}\n\nIMPORTANT: Vous DEVEZ inclure l'objet "seriesMetadata" pour permettre la continuité narrative. Sans cet objet, la série s'arrêtera.`,
      context: `[CONTINUITÉ SAGA] 
Épisode N°: ${this.seriesContext.episodeNumber}${this.seriesContext.totalEpisodes ? ` sur ${this.seriesContext.totalEpisodes}` : ''}
ID Saga: ${this.seriesContext.seriesId}
Bible (Contexte global): ${this.seriesContext.globalContext || 'Pas de bible.'}
Historique récent: ${this.seriesContext.previousEpisodesContext || 'Nouveau départ.'}
Dernier Cliffhanger (À RÉSOUDRE OU ÉVOLUER): ${this.seriesContext.lastCliffhanger || 'Aucun.'}

REGISTRE DES PERSONNAGES (CASTING ACTIF):
${Object.entries(this.seriesContext.characterRegistry)
  .map(([name, data]) => `• ${name}: ${data.description}${data.modelId ? ` (ID MODÈLE: ${data.modelId})` : ''}`)
  .join('\n')}`,
      instructions: [
        ...(spec.instructions || []),
        "COHÉRENCE TOTALE : L'épisode DOIT s'inscrire dans la continuité directe du cliffhanger précédent.",
        "ÉVOLUTION NARRATIVE : Faites progresser l'intrigue de manière significative. Évitez de stagner sur une seule idée.",
        this.seriesContext.isFinalEpisode
          ? "RÉSOLUTION FINALE (OBLIGATOIRE): Concluez TOUTES les intrigues. INTERDICTION de finir sur un cliffhanger. L'histoire doit être terminée et fermée."
          : `CLIFFHANGER MAJEUR : Finissez sur une tension insoutenable. Ne concluez rien. L'action doit rester "suspendue".`,
        "PERSONNAGES: Utilisez UNIQUEMENT les personnages du registre. Remplissez 'charactersId' pour chaque scène (ex: ['King Arthur', 'Sarah']).",
        "LIEUX: Utilisez 'locationId' pour chaque scène en utilisant les noms du registre (ex: 'The Dark Forest'). Si vous créez un NOUVEAU lieu, ajoutez-le dans 'seriesMetadata.newLocations' : { \"Nom du Lieu\": \"Description visuelle précise\" }.",
        "CONTINUITÉ VISUELLE: Pour chaque scène, utilisez les noms EXACTS du registre (personnages et lieux) dans votre 'imagePrompt'.",
        "MÉTAMÉMOIRE: Fournissez un 'episodeSummary' concis dans 'seriesMetadata' pour la mémoire des futurs épisodes."
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
    )}\n\nNARRATION EPISODE ${this.seriesContext.episodeNumber} (JSON):\n---\n${validatedNarration}\n---\n\n${this.seriesContext.isFinalEpisode ? '⚠️ ÉPISODE FINAL: Ne laissez aucune question sans réponse. Résolution totale.' : ''}\nTÂCHE: Découpe en scènes JSON valides. Assurez-vous que le "seriesMetadata" contient bien le cliffhanger et les intrigues non résolues.`
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
    const characterMatches = scene.charactersId || scene.charactersInScene || []

    if (characterMatches.length > 0) {
      for (const name of characterMatches) {
        const char = this.seriesContext.characterRegistry[name]
        if (char) {
          // Add detailed visual blueprint if available, otherwise fallback to description
          const visualAnchor = char.portraitPrompt || char.description
          if (visualAnchor && !paragraph.includes(visualAnchor.slice(0, 30))) {
            paragraph += `, Character ${name}: ${visualAnchor}`
          }

          // Add model casting if available
          if (char.modelId && !paragraph.includes(char.modelId)) {
            paragraph += `, reference style ${char.modelId}`
          }
        }
      }
    }

    // 2. Resolve Location Consistency
    if (scene.locationId) {
      const loc = this.seriesContext.locationRegistry[scene.locationId]
      if (loc && loc.description && !paragraph.includes(loc.description.slice(0, 30))) {
        paragraph = `Location ${scene.locationId}: ${loc.description}. ${paragraph}`
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

  public async resolveCharacterImages(): Promise<any[]> {
    const parentImages = await super.resolveCharacterImages()
    const registryImages = Object.entries(this.seriesContext.characterRegistry)
      .map(([name, c]) => (c.thumbnailUrl ? { name, data: c.thumbnailUrl } : null))
      .filter(Boolean)

    return [...parentImages, ...registryImages]
  }

  public async resolveThumbnailInspirations(): Promise<any[]> {
    const parentInspirations = await super.resolveThumbnailInspirations()
    const registryImages = Object.entries(this.seriesContext.characterRegistry)
      .map(([name, c]) => (c.thumbnailUrl ? { name, data: c.thumbnailUrl } : null))
      .filter(Boolean)

    return [...parentInspirations, ...registryImages]
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

    // Merge registries
    const updatedRegistry = { ...currentContext.characterRegistry }
    const updatedLocationRegistry = { ...currentContext.locationRegistry }

    // VISUAL CONTINUITY: Discover new characters or locations from metadata
    if (metadata) {
      // Characters
      if (metadata.newCharacters) {
        for (const [name, desc] of Object.entries(metadata.newCharacters)) {
          if (!updatedRegistry[name]) {
            updatedRegistry[name] = { description: desc as string }
          }
        }
      }

      // Locations
      if (metadata.newLocations) {
        for (const [name, desc] of Object.entries(metadata.newLocations)) {
          if (!updatedLocationRegistry[name]) {
            updatedLocationRegistry[name] = { description: desc as string }
          }
        }
      }
    }

    const episodeSummary = metadata.episodeSummary || 'Pas de résumé.'
    const episodeHistory = `Episode ${currentContext.episodeNumber}: ${episodeSummary}`

    return {
      ...currentContext,
      characterRegistry: updatedRegistry,
      locationRegistry: updatedLocationRegistry,
      lastCliffhanger: metadata.lastCliffhanger || currentContext.lastCliffhanger,
      unresolvedThreads: metadata.unresolvedThreads || currentContext.unresolvedThreads || [],
      previousEpisodesContext: `${currentContext.previousEpisodesContext || ''}\n${episodeHistory}`.trim(),
      episodeNumber: currentContext.episodeNumber + 1
    }
  }
}
