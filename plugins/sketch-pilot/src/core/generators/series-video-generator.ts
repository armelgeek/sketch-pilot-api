import { computeSceneCountRange, type EnrichedScene, type VideoGenerationOptions } from '../../types/video-script.types'
import type { VideoTypeSpecification } from '../prompt-maker.types'
import { VideoGenerator } from './video-generator.abstract'
import type { VideoGeneratorConfig } from './video-generator.abstract'

// ─── Cliffhanger typing ───────────────────────────────────────────────────────

export type CliffhangerType = 'revelation' | 'peril' | 'choice' | 'betrayal' | 'unknown'

export interface TypedCliffhanger {
  type: CliffhangerType
  description: string
  /**
   * The unresolved question the audience carries into the next episode.
   * Always formulated as a question: "Will X manage to...?" / "What does Y really know?"
   */
  audienceQuestion: string
}

// ─── SeriesContext ────────────────────────────────────────────────────────────

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
  /**
   * Typed cliffhanger from the previous episode.
   * Replaces the plain string `lastCliffhanger` for richer narrative bridging.
   */
  lastCliffhanger?: TypedCliffhanger | string // string kept for backward compat
  /**
   * Unresolved threads — MUST be formulated as active questions, not passive notes.
   * ✅ "Why did Lena lie about her location?"
   * ❌ "Lena lied about her location."
   */
  unresolvedThreads?: string[]
  totalEpisodes?: number
  isFinalEpisode?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cliffhangerDescription(ch: TypedCliffhanger | string | undefined): string {
  if (!ch) return 'Aucun.'
  if (typeof ch === 'string') return ch
  return ch.description
}

function cliffhangerBridgeInstruction(ch: TypedCliffhanger | string | undefined, episodeNumber: number): string {
  if (episodeNumber <= 1 || !ch) return ''

  if (typeof ch === 'string') {
    return `\n\n⚠️ PONT NARRATIF OBLIGATOIRE : L'épisode DOIT commencer par adresser ou résoudre le cliffhanger de l'épisode précédent :\n"${ch}"`
  }

  const typeInstructions: Record<CliffhangerType, string> = {
    revelation: `Le personnage ou le lecteur vient d'apprendre une vérité qui change tout. L'épisode doit s'ouvrir sur les CONSÉQUENCES émotionnelles immédiates de cette révélation, pas sur une autre action. Le choc doit résonner.`,
    peril: `Un personnage est en danger immédiat. L'épisode DOIT s'ouvrir en plein milieu de ce danger (In Media Res). NE PAS résoudre le péril en deux lignes — laissez la tension monter au moins 2 scènes avant toute issue.`,
    choice: `Un personnage fait face à un choix impossible. L'épisode DOIT montrer le processus de décision dans ses moindres contradictions — pas seulement la décision elle-même. La souffrance du choix est le coeur de cette ouverture.`,
    betrayal: `Une trahison vient d'être révélée ou commise. L'épisode s'ouvre sur la réaction viscérale du personnage trahi ou du traître face aux conséquences. Evitez les explications immédiates — laissez l'ambiguïté respirer.`,
    unknown: `L'épisode doit reconnecter avec la tension précédente de façon directe et immersive.`
  }

  return `\n\n⚠️ PONT NARRATIF OBLIGATOIRE [Type: ${(ch.type || 'unknown').toUpperCase()}] :
Cliffhanger : "${ch.description}"
${ch.audienceQuestion ? `Question du public : "${ch.audienceQuestion}"` : ''}
Instruction de reprise : ${typeInstructions[ch.type as CliffhangerType] || typeInstructions.unknown}`
}

/**
 * Validate that unresolved threads are questions, not statements.
 * Returns a warning list (non-blocking).
 */
function validateThreadsAsQuestions(threads: string[]): string[] {
  return threads
    .filter((t) => !t.trim().endsWith('?'))
    .map((t) => `[SeriesVideoGenerator] Thread non formulé comme question : "${t.slice(0, 60)}..."`)
}

// ─── SeriesVideoGenerator ─────────────────────────────────────────────────────

/**
 * SeriesVideoGenerator
 *
 * Implementation for multi-episode narrative content.
 * Handles episodic memory, character persistence, typed cliffhangers,
 * false resolution beats, and addictive narrative structure.
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

    // Warn if threads are not formulated as questions
    if (this.seriesContext.unresolvedThreads?.length) {
      const warnings = validateThreadsAsQuestions(this.seriesContext.unresolvedThreads)
      warnings.forEach((w) => console.warn(w))
    }
  }

  public getType(): string {
    return 'series'
  }

  // ─── Output Format ──────────────────────────────────────────────────────────

  protected getDefaultOutputFormat(): string {
    const isFinal = this.seriesContext.isFinalEpisode

    const cliffhangerBlock = isFinal
      ? ''
      : `
    "cliffhanger": {
      "type": "revelation | peril | choice | betrayal",
      "description": "Description précise du cliffhanger (action suspendue ou révélation).",
      "audienceQuestion": "La question que le public emporte avec lui — formulée comme une question active."
    },`

    const metadataBlock = isFinal
      ? `
  "seriesMetadata": {
    "episodeSummary": "Résumé narratif final de la série.",
    "resolution": "Description de la conclusion définitive de l'intrigue.",
    "characterFinalState": { "personnageA": "son destin final / situation stable", "personnageB": "..." }
  }`.trim()
      : `
  "seriesMetadata": {
    "episodeSummary": "Résumé narratif concis de cet épisode — formulé comme une PROMESSE pour la suite, pas comme un compte-rendu.",${cliffhangerBlock}
    "characterContinuity": { 
        "personnageA": { "description": "état/tenue/lieu à la fin", "isNew": true }, 
        "personnageB": { "description": "...", "isNew": false } 
    },
    "nextEpisodeTease": "Une question précise avec un nom propre et un enjeu concret — jamais une vague promesse d'action.",
    "unresolvedThreads": [
      "Question active non résolue 1 — toujours formulée avec un '?' ",
      "Question active non résolue 2..."
    ]
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
      "animationPrompt": "Instructions pour le sujet (ex: il pleure, elle court)...",
      "cameraAction": [
        { "type": "zoom-in", "intensity": "high" },
        { "type": "shake", "intensity": "low" }
      ],
      "preset": "hook",
      "transition": "fade"
    }
  ]
}

--- ⚠️ GARDES-FOUS CINÉMATOGRAPHIQUES ⚠️ ---
Utilise EXCLUSIVEMENT les valeurs suivantes :

TRANSITIONS :
none, fade, blur, crossfade, zoom-in, dissolve, fade-black, fade-white, 
wipe-left, wipe-right, wipe-up, wipe-down, slide-left, slide-right, slide-up, slide-down,
circleopen, circleclose, pixelize, radial, smooth-left, smooth-right, smooth-up, smooth-down,
squeezev, squeezeh, zoomin, zoomout, diagtl, diagtr, diagbl, diagbr

CAMERA ACTIONS :
none, pan-left, pan-right, pan-up, pan-down, zoom-in, zoom-out, shake, breathing, snap-zoom, dutch-tilt
`.trim()
  }

  // ─── Narrative Overrides ────────────────────────────────────────────────────

  protected validateNarrativeCoherence(scenes: any[]): string[] {
    const violations: string[] = []

    // Episode must start with a hook that bridges the previous cliffhanger
    if (this.seriesContext.episodeNumber > 1 && this.seriesContext.lastCliffhanger) {
      const hookScene = scenes.find((s) => s.preset === 'hook') || scenes[0]
      if (hookScene) {
        const hookText = (hookScene.narration || '').toLowerCase()

        const hasBridgeKeywords = ['précédemment', 'alors que', 'souvenez-vous', 'pendant ce temps', 'encore'].some(
          (k) => hookText.includes(k)
        )
        if (!hasBridgeKeywords && hookText.length < 50) {
          console.warn(
            `[SeriesVideoGenerator] Hook for Episode ${this.seriesContext.episodeNumber} may lack a narrative bridge to: "${cliffhangerDescription(this.seriesContext.lastCliffhanger).slice(0, 50)}..."`
          )
        }
      }
    }

    // Warn if no false resolution beat is detected (scenes 3-5)
    const midScenes = scenes.slice(2, 5)
    const hasFalseResolution = midScenes.some(
      (s) => s.preset === 'false_resolution' || (s.summary || '').toLowerCase().includes('croit')
    )
    if (!hasFalseResolution && scenes.length >= 5) {
      console.warn(
        `[SeriesVideoGenerator] Episode ${this.seriesContext.episodeNumber}: no false resolution beat detected in scenes 3-5. Tension curve may feel flat.`
      )
    }

    return violations
  }

  // ─── Pass 1: Narration ──────────────────────────────────────────────────────

  public buildTwoPassPrompts(topic: string, options: VideoGenerationOptions, targetWords?: number) {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const target = targetWords ?? Math.round(duration * wps * safetyFactor)

    const bridgeInstruction = cliffhangerBridgeInstruction(
      this.seriesContext.lastCliffhanger,
      this.seriesContext.episodeNumber
    )

    const threadsInstruction = this.seriesContext.unresolvedThreads?.length
      ? `\n\nINTRIGUES SECONDAIRES EN COURS (à tisser subtilement, sans forcer) :\n${this.seriesContext.unresolvedThreads.map((t) => `- ${t}`).join('\n')}\nCes questions doivent rester ouvertes — apportez des fragments de réponse, pas la résolution.`
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
• ÉVOLUTION IRRÉVERSIBLE : Chaque épisode doit changer la situation des personnages de façon permanente. Rien ne doit pouvoir revenir "comme avant" à la fin de l'épisode.
• FAUSSE RÉSOLUTION (OBLIGATOIRE) : Entre la scène 3 et 5, inclure un moment où le personnage croit avoir résolu le problème principal — avant une aggravation inattendue. C'est le coeur du ressort addictif.
• CURIOSITÉ EN ESCALIER : Ouvrez de nouvelles questions à chaque fois que vous fermez une ancienne. Le ratio doit être 1 réponse pour 2 nouvelles questions.
• LIEUX : Réutilisez les lieux du registre pour créer un sentiment de familiarité. Décrivez-les avec constance.
• PERSONNAGES : Respectez scrupuleusement les traits de personnalité et les descriptions physiques du registre.
• RÉCAPITULATIF (Optionnel) : Si l'épisode est > 1, vous pouvez commencer par une courte scène de récapitulatif (preset: 'recap') pour rafraîchir la mémoire de l'audience.
• PONT NARRATIF : Plongez directement dans l'action (In Media Res) tout en gardant une suite logique.
`,
        user: `DÉTAILS DE L'ÉPISODE : ${topic || options.episodeSummary || 'Générez la suite logique de la saga en vous basant sur le cliffhanger précédent.'}\nCible : ${target} mots.`,
        targetWords: target
      }
    }
  }

  // ─── Pass 2: Structuring system prompt ─────────────────────────────────────

  protected buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)

    const cliffhangerContext = this.seriesContext.lastCliffhanger
      ? typeof this.seriesContext.lastCliffhanger === 'string'
        ? `Dernier Cliffhanger (À RÉSOUDRE OU ÉVOLUER): ${this.seriesContext.lastCliffhanger}`
        : `Dernier Cliffhanger [${this.seriesContext.lastCliffhanger.type.toUpperCase()}]: ${this.seriesContext.lastCliffhanger.description}\nQuestion du public à honorer: "${this.seriesContext.lastCliffhanger.audienceQuestion}"`
      : 'Aucun cliffhanger précédent.'

    const seriesSpec: VideoTypeSpecification = {
      ...spec,
      task: `${spec.task}\n\nIMPORTANT: Vous DEVEZ inclure l'objet "seriesMetadata" pour permettre la continuité narrative. Sans cet objet, la série s'arrêtera.`,
      context: `[CONTINUITÉ SAGA] 
Épisode N°: ${this.seriesContext.episodeNumber}${this.seriesContext.totalEpisodes ? ` sur ${this.seriesContext.totalEpisodes}` : ''}
ID Saga: ${this.seriesContext.seriesId}
Bible (Contexte global): ${this.seriesContext.globalContext || 'Pas de bible.'}
Historique récent: ${this.seriesContext.previousEpisodesContext || 'Nouveau départ.'}
${cliffhangerContext}

REGISTRE DES PERSONNAGES (CASTING ACTIF):
${Object.entries(this.seriesContext.characterRegistry)
  .map(([name, data]) => `• ${name}: ${data.description}${data.modelId ? ` (ID MODÈLE: ${data.modelId})` : ''}`)
  .join('\n')}`,
      instructions: [
        ...(spec.instructions || []),
        // Narrative coherence
        "COHÉRENCE TOTALE : L'épisode DOIT s'inscrire dans la continuité directe du cliffhanger précédent.",
        "ÉVOLUTION IRRÉVERSIBLE : Faites progresser l'intrigue de manière permanente. Rien ne doit pouvoir revenir 'comme avant' après cet épisode.",
        // Addictive tension mechanics
        "FAUSSE RÉSOLUTION (OBLIGATOIRE) : Entre la scène 3 et 5, insérer une scène (preset: 'false_resolution') où le personnage croit avoir résolu le problème principal — suivie d'une aggravation inattendue. C'est la mécanique centrale du binge-watching.",
        "CURIOSITÉ EN ESCALIER : Pour chaque question fermée, ouvrez 2 nouvelles questions. Les 'unresolvedThreads' doivent augmenter d'au moins 1 entrée nette par épisode.",
        "UNRESOLVEDTHREADS — FORMAT OBLIGATOIRE : Chaque fil doit être formulé comme une question active avec un nom propre et un enjeu concret. Exemple valide : 'Pourquoi Marcus a-t-il brûlé les dossiers avant l'arrivée de la police ?' Exemple invalide : 'Marcus a brûlé des dossiers.'",
        // Cliffhanger
        this.seriesContext.isFinalEpisode
          ? "RÉSOLUTION FINALE (OBLIGATOIRE): Concluez TOUTES les intrigues. INTERDICTION de finir sur un cliffhanger. Répondez à chaque unresolvedThread. L'histoire doit être terminée et fermée."
          : "CLIFFHANGER TYPÉ (OBLIGATOIRE) : Finissez sur une tension insoutenable. Choisissez un type parmi : revelation / peril / choice / betrayal. Formulez 'audienceQuestion' comme une vraie question que le public emportera en tête.",
        // next episode tease
        "NEXTÉPISODE TEASE : Doit contenir un nom propre, une action concrète, et un enjeu. Pas de vague promesse. Exemple valide : 'Saura-t-on pourquoi Elena a effacé les caméras avant le meurtre ?' Exemple invalide : 'Les révélations vont s'enchaîner...'",
        // Episodic summary as a promise
        'EPISODE SUMMARY : Formulez-le comme une promesse narrative orientée vers la suite, pas comme un compte-rendu factuel. Il sera injecté dans le contexte des prochains épisodes.',
        // Casting & locations
        "PERSONNAGES: Utilisez les identifiants du registre pour remplir 'charactersId'.",
        "LIEUX: Utilisez l'identifiant 'locationId' pour chaque scène."
      ]
    }

    return this.buildSystemInstructions(seriesSpec) || 'Structurez cet épisode de série.'
  }

  // ─── Pass 2: Structuring user prompt ───────────────────────────────────────

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
    )}\n\nNARRATION EPISODE ${this.seriesContext.episodeNumber} (JSON):\n---\n${validatedNarration}\n---\n\n${
      this.seriesContext.isFinalEpisode
        ? '⚠️ ÉPISODE FINAL: Ne laissez aucune question sans réponse. Résolution totale de chaque unresolvedThread.'
        : '⚠️ RAPPEL ADDICTIF: Vérifiez que la fausse résolution est présente (scènes 3-5), que le cliffhanger est typé, et que les unresolvedThreads sont des questions actives.'
    }\nTÂCHE: Découpe en scènes JSON valides. Assurez-vous que "seriesMetadata" est complet et respecte le format ci-dessus.`
  }

  // ─── Pass 2: Build prompts ──────────────────────────────────────────────────

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

  // ─── Retry prompt ───────────────────────────────────────────────────────────

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
Please expand the script for subject: ${topic}. Focus on narrative depth, the false resolution beat, and continuity.`
  }

  // ─── Misc ───────────────────────────────────────────────────────────────────

  public fixFullNarrationDrift(script: any) {
    return { script, driftFixed: false, driftWords: 0 }
  }

  public async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    return {
      systemPrompt: this.buildStructuringSystemPrompt(options),
      userPrompt: this.buildStructuringUserPrompt('', topic, options)
    }
  }

  // ─── Image & animation prompts ──────────────────────────────────────────────

  public async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages?: boolean,
    aspectRatio?: string,
    memory?: any,
    hasLocationReference?: boolean
  ): Promise<any> {
    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

    const characterMatches = scene.charactersId || scene.charactersInScene || []
    if (characterMatches.length > 0) {
      for (const name of characterMatches) {
        const char = this.seriesContext.characterRegistry[name]
        if (char) {
          const visualAnchor = char.portraitPrompt || char.description
          if (visualAnchor && !paragraph.includes(visualAnchor.slice(0, 30))) {
            paragraph += `, Character ${name}: ${visualAnchor}`
          }
          if (char.modelId && !paragraph.includes(char.modelId)) {
            paragraph += `, reference style ${char.modelId}`
          }
        }
      }
    }

    if (scene.locationId) {
      const loc = this.seriesContext.locationRegistry[scene.locationId]
      if (loc && loc.description && !paragraph.includes(loc.description.slice(0, 30))) {
        paragraph = `Location ${scene.locationId}: ${loc.description}. ${paragraph}`
      }
    }

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

  // ─── Reference images ───────────────────────────────────────────────────────

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

    return [
      spec.characterDescription || '',
      `Style episodic series consistency. ${charSection ? `Recalling characters: ${charSection}` : ''}`
    ]
      .filter(Boolean)
      .join('\n')
  }

  // ─── Static context updater ─────────────────────────────────────────────────

  /**
   * Evolves the SeriesContext for the next episode.
   * Handles both typed and legacy string cliffhangers.
   * Validates that unresolvedThreads are questions before storing them.
   */
  public static updateContext(currentContext: SeriesContext, scriptResult: any): SeriesContext {
    const metadata = scriptResult.seriesMetadata || {}

    const updatedRegistry = { ...currentContext.characterRegistry }
    const updatedLocationRegistry = { ...currentContext.locationRegistry }

    // Discover new characters from metadata
    if (metadata.newCharacters) {
      for (const [name, desc] of Object.entries(metadata.newCharacters)) {
        if (!updatedRegistry[name]) {
          updatedRegistry[name] = { description: desc as string }
        }
      }
    }

    // Discover new locations from metadata
    if (metadata.newLocations) {
      for (const [name, desc] of Object.entries(metadata.newLocations)) {
        if (!updatedLocationRegistry[name]) {
          updatedLocationRegistry[name] = { description: desc as string }
        }
      }
    }

    // Resolve cliffhanger: prefer typed object from metadata.cliffhanger
    const nextCliffhanger: TypedCliffhanger | string | undefined =
      metadata.cliffhanger && typeof metadata.cliffhanger === 'object'
        ? (metadata.cliffhanger as TypedCliffhanger)
        : metadata.cliffhanger || currentContext.lastCliffhanger

    // Validate and warn on non-question threads
    const rawThreads: string[] = metadata.unresolvedThreads || currentContext.unresolvedThreads || []
    const warnings = validateThreadsAsQuestions(rawThreads)
    warnings.forEach((w) => console.warn(w))

    // episodeSummary: stored as-is (should be a promise, not a report)
    const episodeSummary = metadata.episodeSummary || 'Pas de résumé.'
    const episodeHistory = `Episode ${currentContext.episodeNumber}: ${episodeSummary}`

    return {
      ...currentContext,
      characterRegistry: updatedRegistry,
      locationRegistry: updatedLocationRegistry,
      lastCliffhanger: nextCliffhanger,
      unresolvedThreads: rawThreads,
      previousEpisodesContext: `${currentContext.previousEpisodesContext || ''}\n${episodeHistory}`.trim(),
      episodeNumber: currentContext.episodeNumber + 1
    }
  }
}
