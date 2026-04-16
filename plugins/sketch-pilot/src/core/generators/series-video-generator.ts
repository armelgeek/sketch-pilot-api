import { computeSceneCountRange, type EnrichedScene, type VideoGenerationOptions } from '../../types/video-script.types'
import type { VideoTypeSpecification } from '../prompt-maker.types'
import { NarrativePacingSentinel } from './series/narrative-pacing-sentinel'
import { SeriesPromptBuilders } from './series/series-prompt-builders'
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

export interface NarrativeThread {
  id?: string // T1, T2, etc.
  title: string
  status: 'open' | 'partial' | 'resolved' | 'new'
  description: string
  lastUpdatedEpisode?: number
  mustResolveBy?: number // Global episode index
  resolutionSceneId?: string
}

export interface ResolvedStake {
  id?: string
  title: string
  resolution: string
  episodeNumber: number
  resolutionSceneId?: string
  mustResolveBy?: number // Global episode index
}

// ─── SeriesContext & Metadata ──────────────────────────────────────────────────

export interface SeriesMetadata {
  episodeSummary: string
  cliffhanger: TypedCliffhanger
  characterContinuity: Record<string, { description: string; isNew: boolean }>
  nextEpisodeTease: string
  unresolvedThreads: NarrativeThread[]
  assetEvolution?: Record<string, string>
  visualEvolution?: Record<string, string>
  newCharacters?: Record<string, string>
  newLocations?: Record<string, string>
  continuityAnalysis?: {
    soudureBrute?: string // Ex: "Saut temporel/spatial inexpliqué (Ruelle -> Immeuble)"
    logicGap?: string // Ex: "Décision abrupte sans délibération"
    threatVagueness?: string // Ex: "Menace trop floue (qui sont les ombres ?)"
    pacingIssue?: string // Ex: "Combat escamoté ou fini trop vite"
    assetFantome?: string // Ex: "Objet introduit sans setup"
    filsMuets?: string[] // Ex: ["Culpabilité de Maya", "@Alexandre"]
    defects?: string[]
  }
  loreUpdates?: string[] // Nouvelles révélations ou faits établis à ajouter à la Bible
}

export interface EvolutionState {
  state: string
  referenceSceneId?: string
  referenceEpisode?: number
}

export interface SeriesContext {
  seriesId: string
  episodeNumber: number
  globalContext?: string
  previousEpisodesContext: string
  characterRegistry: Record<
    string,
    {
      description: string
      backstory?: string
      personalGoal?: string
      motivation?: string
      abilities?: string[]
      knownFacts?: string[]
      fate?: string
      isNew?: boolean
      deathEpisode?: number
      status?: 'alive' | 'dead' | 'missing' | 'injured' | 'captured' | 'corrupted' | 'unknown'
      modelId?: string
      portraitPrompt?: string
      thumbnailUrl?: string
      referenceSceneId?: string
      referenceEpisode?: number
      firstMentionedSceneId?: string
      firstMentionedEpisode?: number
      deathSceneId?: string
    }
  >
  locationRegistry: Record<
    string,
    {
      description: string
      atmosphere?: string
      thumbnailUrl?: string
      referenceSceneId?: string
      referenceEpisode?: number
      firstMentionedSceneId?: string
      firstMentionedEpisode?: number
    }
  >
  assetRegistry: Record<
    string,
    {
      description: string
      thumbnailUrl?: string
      type?: 'creature' | 'monster' | 'artifact' | 'object' | 'other'
      referenceSceneId?: string
      referenceEpisode?: number
      firstMentionedSceneId?: string
      firstMentionedEpisode?: number
    }
  >
  lastCliffhanger?: TypedCliffhanger | string
  unresolvedThreads?: NarrativeThread[]
  currentEpisodePitch?: string
  totalEpisodes?: number
  isFinalEpisode?: boolean
  isFirstEpisode?: boolean
  plannedEpisodes?: { number: number; title: string; hook: string }[]
  videoGenre?: string
  aspectRatio?: string
  visualEvolution?: Record<string, string | EvolutionState>
  weatherState?: string
  timeOfDay?: string
  relationshipMap?: Record<string, Record<string, string>>
  assetEvolution?: Record<string, string | EvolutionState>
  characterEvolution?: Record<string, string | EvolutionState>
  nextEpisodeTease?: string
  colorPalette?: string
  symbolicMotifs?: string[]
  cameraStyle?: string
  lastEpisodeSummary?: string
  lastEpisodeFinalImage?: string
  lastEpisodeFinalScene?: any
  resolvedStakes?: ResolvedStake[]
  genreConstraints?: {
    allowedTech?: string[]
    forbiddenElements?: string[]
    toneKeywords?: string[]
  }
  seedingHints?: string[]
  continuityDebts?: string[]
  forcedCorrection?: string
  threads?: any[]
  roadmap?: any
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── SeriesVideoGenerator ─────────────────────────────────────────────────────

/**
 * SeriesVideoGenerator
 *
 * Implementation for multi-episode narrative content.
 * Handles episodic memory, character persistence, typed cliffhangers,
 * false resolution beats, and addictive narrative structure.
 */
export class SeriesVideoGenerator extends VideoGenerator {
  public seriesContext: SeriesContext
  private narrativeInstructions: string[] = []

  private validateThreadsAsQuestions(threads: NarrativeThread[]): string[] {
    return threads
      .filter((t) => !t.title.trim().endsWith('?') && !t.description.trim().endsWith('?'))
      .map(
        (t) =>
          `[SeriesVideoGenerator] Thread title ou description non formulé comme question : "${t.title.slice(0, 30)}..."`
      )
  }

  constructor(config: VideoGeneratorConfig, seriesContext: SeriesContext) {
    super(config)
    this.seriesContext = seriesContext
    this.narrativeInstructions = NarrativePacingSentinel.getPhaseInstructions(this.seriesContext)
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
    "newCharacters": { "Nom": "Description détaillée" },
    "newLocations": { "Nom": "Description détaillée" },
    "newAssets": { "Demon": "Description visuelle de l'entité" },
    "characterEvolution": { "@Sarah": "Décédée" },
    "nextEpisodeTease": "Une question précise avec un nom propre et un enjeu concret — jamais une vague promesse d'action.",
    "unresolvedThreads": [
      { "title": "Question active ?", "status": "open | partial | resolved", "description": "Détails de ce qu'on sait..." }
    ],
    "loreUpdates": ["Élément important de lore ou de chronologie à fixer dans la Bible."]
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
      "shotType": "WIDE",
      "summary": "Résumé visuel",
      "narration": "Narration verbatim...",
      "locationId": "identifiant-lieu-unique",
      "persistentDecorTokens": ["lampe de bureau rouge", "plante verte", "lumière de fin de journée"],
      "imagePrompt": "Description visuelle",
      "charactersInScene": ["@Sarah"],
      "isEstablishingShot": true,
      "spatialAnchor": "Sur la colline surplombant le village",
      "emotionalTokens": { "@Sarah": ["Terrifié", "Essoufflé"] },
      "interactions": { "@Sarah-@Marek": "Suspicion mutuelle" },
      "composition": {
        "shotType": "WIDE",
        "foregroundAnchor": "des branches d'arbres floues",
        "lightingMood": "crépuscule froid",
        "focusTarget": "@Sarah"
      },
      "visualEvolution": { "@Sarah": "Cicatrice au front" },
      "characterEvolution": { "@Sarah": "Blessé au bras" },
      "weatherState": "Pluie diluvienne",
      "timeOfDay": "Aube",
      "relationshipMap": { "@Sarah": { "@Alexandre": "Alliance", "@Marek": "Méfiance" } },
      "assetEvolution": { "Épée": "Brisée" },
      "animationPrompt": "Instructions pour le sujet (ex: il pleure, elle court)...",
      "cameraAction": [
        { "type": "zoom-in", "intensity": "high" },
        { "type": "shake", "intensity": "low" }
      ],
      "preset": "hook",
      "transition": "fade",
      "continueFromPrevious": true
    }
  ]
}

--- 📍 ANCRAGE SPATIAL & COHÉRENCE MONDE 📍 ---
- **Plan d'Ensemble OBLIGATOIRE** : Si une scène introduit un NOUVEAU lieu, la première scène de ce lieu DOIT avoir \`isEstablishingShot: true\` et un cadrage WIDE qui montre le bâtiment/lieu dans son contexte (ville, forêt, paysage).
- **Ancre Spatiale** : Remplir \`spatialAnchor\` pour situer le lieu par rapport au reste du monde (ex: "Entrée ouest de la ville", "Sous la cascade gelée").
- **Logique de Déplacement** : Si un personnage "va à l'église", commencez par un plan large montrant l'église dans la ville avant de passer à l'intérieur.

--- ⚠️ GARDES-FOUS CINÉMATOGRAPHIQUES ⚠️ ---
Utilise EXCLUSIVEMENT les valeurs suivantes :

TRANSITIONS :
none, fade, blur, crossfade, zoom-in, dissolve, fade-black, fade-white, 
wipe-left, wipe-right, wipe-up, wipe-down, slide-left, slide-right, slide-up, slide-down,
circleopen, circleclose, pixelize, radial, smooth-left, smooth-right, smooth-up, smooth-down,
squeezev, squeezeh, zoomin, zoomout, diagtl, diagtr, diagbl, diagbr

CAMERA ACTIONS :
none, pan-left, pan-right, pan-up, pan-down, zoom-in, zoom-out, shake, breathing, snap-zoom, dutch-tilt

--- 🎬 DYNAMISME CINÉMATOGRAPHIQUE (R45 & R46) 🎬 ---
- **Règle 45 (Variation de Cadrage)** : INTERDICTION DE RÉPÉTER le même 'shotType' pour deux scènes consécutives. Si Scène N est 'CLOSE-UP', Scène N+1 DOIT être 'WIDE', 'MEDIUM' ou 'OTS'. Le public s'ennuie devant la répétition.
- **Règle 46 (Persistance & Nettoyage Décor)** : Chaque objet manipulé ou posé dans le décor DOIT être tracé. Utilisez 'assetEvolution' pour signaler un objet ajouté ou RETIRÉ ("@Objet": "Retiré").
- **Règle 47 (Dirty Frame)** : Pour les 'MEDIUM' et 'CLOSE-UP', incluez souvent un élément de décor flou au premier plan (Foreground Anchor) pour donner de la profondeur.
`.trim()
  }

  // ─── Narrative Overrides ────────────────────────────────────────────────────

  protected validateNarrativeCoherence(scenes: any[]): string[] {
    const violations: string[] = []

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

    const bridgeInstruction = NarrativePacingSentinel.getBridgeInstruction(this.seriesContext)

    const threadsInstruction = this.seriesContext.unresolvedThreads?.length
      ? `\n\nINTRIGUES SECONDAIRES EN COURS (à tisser subtilement, sans forcer) :\n${this.seriesContext.unresolvedThreads
          .map((t) => {
            if (typeof t === 'string') return `- [OPEN] ${t}`
            return `- [${(t.status || 'OPEN').toUpperCase()}] ${t.title || 'Inconnu'}: ${t.description || 'Pas de description'}`
          })
          .join('\n')}\nCes questions doivent rester ouvertes — apportez des fragments de réponse, pas la résolution.`
      : ''

    const characterRegistry = this.seriesContext.characterRegistry || {}
    const authorizedCharacters = Object.keys(characterRegistry).join(', ')

    // 🚨 MISSION OBLIGATOIRE (Payoff Enforcement)
    const currentEp = this.seriesContext.episodeNumber
    const missions: string[] = []

    // Check unresolved threads for aging
    if (this.seriesContext.unresolvedThreads) {
      for (const thread of this.seriesContext.unresolvedThreads) {
        const age = currentEp - (thread.lastUpdatedEpisode || 1)
        if (age >= 3 || (thread.mustResolveBy && currentEp >= thread.mustResolveBy)) {
          missions.push(
            `PAYOFF OBLIGATOIRE : ${thread.title} (Fil ouvert depuis l'épisode ${thread.lastUpdatedEpisode || 1}). Vous DEVEZ apporter une réponse claire et définitive ici.`
          )
        }
      }
    }

    // Check resolved stakes for loop breaker (Repeated cliffhangers)
    const cliffhangerCounts: Record<string, number> = {}
    if (this.seriesContext.resolvedStakes) {
      for (const stake of this.seriesContext.resolvedStakes) {
        const desc = stake.title.toLowerCase()
        if (desc.includes('englouti') || desc.includes('absorbé')) {
          cliffhangerCounts.englouti = (cliffhangerCounts.englouti || 0) + 1
        }
        if (stake.mustResolveBy && currentEp >= stake.mustResolveBy) {
          missions.push(
            `SOUDURE OBLIGATOIRE : ${stake.title} (Cliffhanger de l'épisode ${stake.episodeNumber}). Vous DEVEZ expliquer comment cela finit dès la scène 1 ou 2.`
          )
        }
      }
    }

    if (cliffhangerCounts.englouti >= 2) {
      missions.push(
        `ALERTE BOUCLE : Vance a déjà été englouti ${cliffhangerCounts.englouti} fois. INTERDICTION FORMELLE de réutiliser ce cliffhanger. Vous DEVEZ le sortir de là définitivement dans cet épisode.`
      )
    }

    const missionBlock = missions.length
      ? `🚨 MISSIONS OBLIGATOIRES (PRIORITÉ ABSOLUE) :\n${missions.map((m) => `- ${m}`).join('\n')}\n\n`
      : ''

    // 🚨 MISSION CORRECTIVE (Self-Diagnostic Hardening)
    const correctionBlock = this.seriesContext.forcedCorrection
      ? `\n\n🚨 MISSION CORRECTIVE (RÉPARER LA CONTINUITÉ) :\n${this.seriesContext.forcedCorrection}\nVous DEVEZ corriger ces défauts dès le début de cet épisode.\n`
      : ''

    // 🏗️ RÈGLES DE RIGUEUR NARRATIVE (V39.2)
    const strictNarrativeRules = `
⚠️ RÈGLES DE RIGUEUR NARRATIVE :
1. TRANSITION SPATIALE : Si vous changez de lieu (ex: de ruelle à toit), vous DEVEZ décrire le trajet ou l'arrivée. Interdiction de "téléporter" les personnages.
2. DÉFINITION DES MENACES : Les ennemis ne peuvent pas être juste des "silhouettes". Précisez leur nature (Humains masqués, entités spectrales, drones, etc.).
3. INTÉGRITÉ DES CONFLITS : Ne jamais escamoter un combat entamé. Si les armes sont sorties, narrez au moins 2 tours d'action avant toute découverte.
4. POIDS DES DÉCISIONS : Un choix radical (ex: sauter dans un vortex) nécessite un court moment de délibération émotionnelle ou de dialogue de justification.`

    const deadCharacters = Object.entries(characterRegistry)
      .filter(([_, d]) => d.status === 'dead')
      .map(([name, d]) => `- ${name} : mort à l'épisode ${d.deathEpisode}. Toute apparition est INTERDITE.`)
      .join('\n')

    const resolvedStakes = this.seriesContext.resolvedStakes || []
    const closedStakesInstruction = resolvedStakes.length
      ? `\n\nENJEUX DÉJÀ TRANCHÉS (ANTI-LOOPING) : Ces dilemmes sont FERMÉS et ne peuvent être réouverts :\n${resolvedStakes
          .map((s) => `- "${s.title}" → ${s.resolution} (Épisode ${s.episodeNumber})`)
          .join('\n')}`
      : ''

    const forbiddenElements = this.seriesContext.genreConstraints?.forbiddenElements || []
    const forbiddenInstruction = forbiddenElements.length
      ? `\n\nÉLÉMENTS STRICTEMENT INTERDITS DANS CET UNIVERS :\n${forbiddenElements.join(', ')}`
      : ''

    const seedingInstruction = this.seriesContext.seedingHints?.length
    return {
      pass1: {
        system: this.buildPass1SystemInstructions(),
        user: `DÉTAILS DE L'ÉPISODE : ${topic || options.episodeSummary || 'Générez la suite logique de la saga.'}\nCible : ${target} mots.`,
        targetWords: target
      }
    }
  }

  protected buildPass1SystemInstructions(): string {
    return SeriesPromptBuilders.buildPass1System(this.seriesContext, this.narrativeInstructions)
  }

  // ─── Pass 2: Structuring system prompt ─────────────────────────────────────

  protected buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    return SeriesPromptBuilders.buildStructuringSystem(this.seriesContext, this.narrativeInstructions)
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

    let effectiveSpec = spec
    const rawStructure = (spec.structure || []) as any[]
    if (this.seriesContext.episodeNumber > 1 && rawStructure.length > 2) {
      const hookWords = typeof rawStructure[0] === 'object' ? rawStructure[0].minWords || 15 : 15
      const introWords = typeof rawStructure[1] === 'object' ? rawStructure[1].minWords || 20 : 20
      const remainingStructure = rawStructure.slice(2)

      effectiveSpec = {
        ...spec,
        structure: [
          {
            preset: this.seriesContext.episodeNumber > 1 ? 'sequel_reprise' : 'pilot_intro',
            minWords: hookWords + introWords,
            minSentences: 3,
            description:
              this.seriesContext.episodeNumber > 1
                ? "Reprise du cliffhanger et suite de l'action."
                : "Introduction contemplative et installation de l'ambiance."
          },
          ...remainingStructure
        ] as any
      }
    }

    // Bridging context for Sequential Visual Memory (V42)
    const lastPrompt = this.seriesContext.lastEpisodeFinalScene?.imagePrompt
    const bridgeContext = lastPrompt
      ? `\n\n📌 ANCRAGE VISUEL PRÉCÉDENT (FINALE ÉPISODE ${this.seriesContext.episodeNumber - 1}) :\nImagePrompt de la dernière scène : "${lastPrompt}"\nLA SCÈNE 1 DOIT ÊTRE LA CONTINUATION DIRECTE DE CET ÉTAT VISUEL.`
      : ''

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
      effectiveSpec
    )}\n\n${bridgeContext}\n\nNARRATION ÉPISODE ${this.seriesContext.episodeNumber} (JSON) :\n---\n${validatedNarration}\n---\n\n${
      this.seriesContext.isFinalEpisode
        ? '⚠️ ÉPISODE FINAL : Ne laissez aucune question sans réponse. Résolution totale de chaque unresolvedThread.'
        : '⚠️ RAPPEL ADDICTIF : Vérifiez que la fausse résolution est présente (scènes 3-5), que le cliffhanger est typé, et que les unresolvedThreads sont des questions actives.'
    }\nTÂCHE : Découpe en scènes JSON valides. ${
      this.seriesContext.episodeNumber > 1
        ? 'SEQUEL MODE ACTIVE : Scene 1 MUST be a sequel reprise (resolving cliffhanger).'
        : 'PILOT MODE ACTIVE : Scene 1-2 MUST be a slow establishment (World Building / World atmosphere).'
    }
      
🚨 ACCUMULATION VISUELLE : Chaque 'imagePrompt' DOIT commencer par '@VisualState: [Résumé Scène N-1]'.
🚨 ATTENTION : Vous DEVEZ impérativement inclure le bloc "seriesMetadata" à la fin de votre réponse JSON.
Schéma attendu :
{
  "seriesMetadata": {
    "episodeSummary": "...",
    "cliffhanger": { "type": "...", "description": "...", "audienceQuestion": "..." },
    "characterContinuity": { "@Nom": { "description": "...", "isNew": false } },
    "nextEpisodeTease": "Question spécifique.",
    "unresolvedThreads": [{ "title": "Question?", "status": "open", "description": "..." }],
    "assetEvolution": { "@Objet": "Nouvel état" },
    "visualEvolution": { "@Nom": "État visuel" },
    "newCharacters": { "@Nom": "Description" },
    "newLocations": { "Lieu": "Description" },
    "continuityAnalysis": {
       "soudureBrute": "Notez ici tout saut spatial/temporel non expliqué.",
       "assetFantome": "Notez ici tout élément apparu sans setup.",
       "filsMuets": ["Enjeux oubliés."],
       "defects": ["Autres défauts."]
    },
     "loreUpdates": ["..."]
  },
  "titles": [...],
  "fullNarration": "...",
  "scenes": [
    {
      "id": "...",
      "locationId": "@LieuID",
      "charactersInScene": ["@Perso1", "@Perso2"],
      "emotionalTokens": { "@Perso1": ["Inquiet", "Sérieux"] },
      "relationshipMap": { "@Perso1": { "@Perso2": "Défiance" } },
      "spatialAnchor": "À gauche du feu, près de la fenêtre",
      "visualEvolution": { "@Perso1": "Vêtements déchirés" },
      "characterEvolution": { "@Perso1": "Traumatisé" },
      "narration": "...",
      "imagePrompt": "..."
    }
  ]
}

⚠️ RAPPEL REGISTRE : Privilégiez les lieux existants du REGISTRE DES LIEUX. Si vous créez @LieuID-Nouveau, décrivez-le impérativement dans seriesMetadata.newLocations.
`
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
      userPrompt += `\n\n⚠️ MODE TRONÇON : Partie ${chunkContext.chunkIndex + 1} sur ${chunkContext.totalChunks}\n`
      userPrompt += `La numérotation des scènes doit commencer à ${chunkContext.startSceneNumber}.\n`
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

  public async resolveCharacterImages(): Promise<any[]> {
    const characterRegistry = this.seriesContext.characterRegistry || {}
    const characterImages = Object.entries(characterRegistry)
      .map(([name, c]) =>
        (c as any).thumbnailUrl ? { name: SeriesVideoGenerator.normalizeId(name), data: (c as any).thumbnailUrl } : null
      )
      .filter(Boolean)

    const locationRegistry = this.seriesContext.locationRegistry || {}
    const locationImages = Object.entries(locationRegistry)
      .map(([name, l]) =>
        (l as any).thumbnailUrl
          ? { name: `LOCATION:${SeriesVideoGenerator.normalizeId(name)}`, data: (l as any).thumbnailUrl }
          : null
      )
      .filter(Boolean)

    const assetRegistry = this.seriesContext.assetRegistry || {}
    const assetImages = Object.entries(assetRegistry)
      .map(([name, a]) =>
        (a as any).thumbnailUrl ? { name: SeriesVideoGenerator.normalizeId(name), data: (a as any).thumbnailUrl } : null
      )
      .filter(Boolean)

    const all = [...characterImages, ...locationImages, ...assetImages]
    console.log(`[SeriesVideoGenerator] Resolved ${all.length} total registry images (including locations).`)
    return all
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
  ): Promise<import('../../types/video-script.types').ImagePrompt> {
    const isFirstScene = scene.sceneNumber === 1 || scene.id === 'scene-1' || scene.id === '1'
    const sequelBridgeUrl = isFirstScene ? this.seriesContext.lastEpisodeFinalImage : undefined
    let locationMasterUrl: string | undefined
    let referenceImageUrl = sequelBridgeUrl

    // ─── 1. Primary Subject (Narration/Action) ─────────────────────────────────
    const subject = (scene.imagePrompt || scene.summary || '').trim()

    // ─── 2. Spatial & Environmental Context ────────────────────────────────────
    let spatialContext = ''
    if (scene.spatialAnchor) {
      spatialContext += `[ANCRE SPATIALE & POSITION: ${scene.spatialAnchor}] `
    }

    const previousScene = isFirstScene ? this.seriesContext.lastEpisodeFinalScene : (memory as any)?.previousScene

    // Fallback logic for missing locationId (Enforce user requirement: reuse previous if missing)
    let effectiveLocationId = scene.locationId
    if (!effectiveLocationId && previousScene?.locationId) {
      effectiveLocationId = previousScene.locationId
    }

    if (effectiveLocationId) {
      const locationRegistry = this.seriesContext.locationRegistry || {}
      const loc = SeriesVideoGenerator.findInRegistry(locationRegistry, effectiveLocationId)
      locationMasterUrl = (loc as any)?.thumbnailUrl

      if (loc) {
        const referenceMark = hasLocationReference ? 'REFERENCE VISUELLE ACTIVE (ANKER)' : 'RÉFÉRENCE TEXTUELLE'
        const locDesc = (loc as any).description || (loc as any).atmosphere || ''

        if (locationMasterUrl) {
          spatialContext += `[LOCATION LOCK: ${SeriesVideoGenerator.normalizeId(effectiveLocationId)}] (Reference: AS MASTER). `
        }

        // CRITICAL: User requested to stop describing the environment in every prompt to avoid drift.
        // We only describe it IF we don't have a master image yet (first appearance).
        const showFullDesc = !locationMasterUrl && !isFirstScene

        spatialContext += `LIEU : ${SeriesVideoGenerator.normalizeId(effectiveLocationId)} (${referenceMark}). `

        if (showFullDesc) {
          spatialContext += `${locDesc.trim()}. `
        }

        if (locationMasterUrl && !spatialContext.includes('COMPOSITION IDENTIQUE')) {
          spatialContext += `🚨 COHÉRENCE DÉCOR : Utilisez l'image de référence pour reproduire EXACTEMENT le décor de ${effectiveLocationId}. `
        }
      }
    }

    // ─── 3. Narrative Continuity & Sequel Logic ───────────────────────────────
    let continuityContext = ''
    // Reuse previousScene declared above

    if (previousScene) {
      const isSequelBridge = isFirstScene && this.seriesContext.episodeNumber > 1
      const isInternalSequence = !isFirstScene && scene.continueFromPrevious

      if (isSequelBridge || isInternalSequence) {
        // Use previous scene image as primary reference for internal sequences
        if (isInternalSequence && previousScene.imageUrl) {
          referenceImageUrl = previousScene.imageUrl
        }

        continuityContext += `CONTINUATION DIRECTE DE LA SCÈNE PRÉCÉDENTE : ${previousScene.summary || previousScene.imagePrompt}. `

        if (previousScene.persistentDecorTokens && previousScene.persistentDecorTokens.length > 0) {
          const label = isSequelBridge ? 'épisode précédent' : 'scène précédente'
          continuityContext += `Lumière et Ambiance héritées de la ${label}: ${previousScene.persistentDecorTokens.join(', ')}. `
        }

        const refLabel = isSequelBridge ? 'Sequel Bridge (ZÉRO DRIFT)' : `Scene ${previousScene.id}`
        const shotChanged = scene.composition?.shotType !== previousScene.composition?.shotType

        const forceContrast = shotChanged
          ? "⚠️ CONTRASTE RADICAL : Le cadrage CHANGE. Ne reprenez PAS la composition précédente. Modifiez l'angle et la perspective."
          : ''

        const fidelityInstruction = isSequelBridge
          ? "⚠️ FIDÉLITÉ ABSOLUE : Cette scène est la reprise directe de l'épisode précédent. Utilisez l'image de référence comme point de départ IMMUABLE."
          : `⚠️ ZÉRO DRIFT : Les meubles, l'éclairage et le décor DOIVENT rester IDENTIQUES. ${
              shotChanged
                ? `Notez que le cadrage passe de ${previousScene.composition?.shotType || 'MEDIUM'} à ${scene.composition?.shotType || 'MEDIUM'}. ${forceContrast}`
                : 'La COMPOSITION et le CADRAGE restent IDENTIQUES.'
            }`

        continuityContext += `Reference (${refLabel}). ${fidelityInstruction} `

        // [HARDENING V42] Removed Background presence pollution.
        // We only render what is explicitly in the current scene's cast.
      }
    }

    // ─── 4. Series Bible & High-Level Stakes ────────────────────────────────────
    let loreContext = ''
    if (this.seriesContext.globalContext) {
      loreContext += `Universe Bible (Continuity): ${this.seriesContext.globalContext.slice(0, 1000)}. `
    }

    if ((this.seriesContext as any).loreUpdates?.length) {
      loreContext += `Lore Rules: ${(this.seriesContext as any).loreUpdates.join('; ')}. `
    }

    if ((this.seriesContext as any).roadmap?.narrativeHints?.length) {
      loreContext += `Narrative Stakes: ${(this.seriesContext as any).roadmap.narrativeHints.join('; ')}. `
    }

    // ─── 5. Initial Assembly ───────────────────────────────────────────────────
    let paragraph = `${spatialContext}${continuityContext}${loreContext}ACTION : ${subject}`

    // ─── 6. Prompt Sanitization & Identity Locking (Characters & Assets) ────────
    // Using charactersInScene to ensure we don't miss anyone due to schema defaults
    const activeCharacters = new Set((scene.charactersInScene || []).map((id) => SeriesVideoGenerator.normalizeId(id)))
    const characterRegistry = this.seriesContext.characterRegistry || {}

    // [HARDENING V43] Strip inactive character names from the prompt to prevent trait pollution
    const allKnownCharacterIds = Object.keys(characterRegistry)
    const activeIds = new Set(Array.from(activeCharacters).map((id) => id.toLowerCase()))
    const characterMatches = Array.from(activeCharacters)

    for (const charId of allKnownCharacterIds) {
      const normalizedId = SeriesVideoGenerator.normalizeId(charId)
      if (!activeIds.has(normalizedId.toLowerCase())) {
        // Character is NOT in this scene. Purge their name/handle.
        const handleRegex = new RegExp(`\\b${normalizedId.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}\\b`, 'gi')
        const rawNameRegex = new RegExp(`\\b${charId.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}\\b`, 'gi')
        paragraph = paragraph.replace(handleRegex, '').replace(rawNameRegex, '').trim()
      }
    }

    for (const name of characterMatches) {
      const char = SeriesVideoGenerator.findInRegistry(characterRegistry as any, name)
      if (char) {
        paragraph = this.applyIdentityLocking(paragraph, false, {
          character: { [name]: char }
        })
      }
    }

    const assetRegistry = this.seriesContext.assetRegistry || {}
    for (const name of Object.keys(assetRegistry)) {
      if (paragraph.toLowerCase().includes(name.toLowerCase())) {
        const asset = SeriesVideoGenerator.findInRegistry(assetRegistry as any, name)
        paragraph = this.applyIdentityLocking(paragraph, !!hasReferenceImages, {
          asset: { [name]: asset }
        })
      }
    }

    // ─── 7. Composition & Camera ────────────────────────────────────────────────
    const comp = scene.composition || { shotType: 'MEDIUM' }

    // [V58] Emotional Escalation: If terrified, force EXTREME close-up
    const hasTerror = Object.values(scene.emotionalTokens || {}).some((tokens: any) =>
      (tokens as string[]).some((t) =>
        ['terrifie', 'terror', 'horrifies', 'effraye', 'peur', 'affray', 'panic'].includes(
          t
            .toLowerCase()
            .normalize('NFD')
            .replaceAll(/[\u0300-\u036F]/g, '')
        )
      )
    )

    const shotMap: Record<string, string> = {
      CLOSEUP: hasTerror
        ? '⚠️ EXTREME CLOSE-UP SHOT (ECU): Macro focus on terrified eyes and face. Radical zoom and cinematic intensity.'
        : 'CLOSE-UP SHOT: Cinematic focus on head and shoulders. Depth of field.',
      EXTREME_CLOSEUP:
        'EXTREME CLOSE-UP (ECU): Macro cinematic focus on a specific detail or facial feature. High texture visibility.',
      MEDIUM: 'MEDIUM SHOT: Character from waist up. Cinematic composition and environmental context.',
      WIDE: 'WIDE SHOT: Full body and environment. Establish depth and scale.',
      ESTABLISHING: 'ESTABLISHING SHOT: Aerial or very wide cinematic view. Grand scale and environment mapping.',
      PANORAMIC: 'PANORAMIC VIEW: Ultra-wide cinematic scope, breathtaking horizon.',
      POV: 'POV SHOT: Subjective eyes perspective, immersive first-person view.',
      OVERSHOULDER: 'OVER-THE-SHOULDER SHOT: Narrative focus over foreground shoulder, depth-based composition.',
      LOW_ANGLE:
        'LOW-ANGLE SHOT (worms view): Camera looking up, making the subject look heroic, powerful or daunting.',
      HIGH_ANGLE: 'HIGH-ANGLE SHOT (birds view): Camera looking down, emphasizing vulnerability, scale or overview.',
      BIRD_EYE: "BIRD'S EYE VIEW: Zenithal top-down perspective, looking straight down from above."
    }
    let shotDirective = shotMap[comp.shotType] || shotMap.MEDIUM

    if (comp.cameraAngle) {
      shotDirective = `${shotDirective} CAMERA ANGLE: ${comp.cameraAngle}.`
    }

    if (comp.foregroundAnchor) {
      shotDirective = `${shotDirective} Foreground element: ${comp.foregroundAnchor} (blurry dirty frame).`
    }
    if (comp.lightingMood) {
      shotDirective = `${shotDirective} Lighting/Mood: ${comp.lightingMood}.`
    }
    if (comp.focusTarget) {
      shotDirective = `${shotDirective} Precise focus on ${comp.focusTarget}.`
    }

    const rawActions = scene.cameraAction || []
    const actions = Array.isArray(rawActions) ? rawActions : [rawActions]

    // [V59] Camera Bake Cues: Descriptive instructions to help AI generator 'bake' movement into the image
    const cameraEffectBakes: Record<string, string> = {
      'dutch-tilt': 'Heavily tilted cinematic horizon (15-20 degrees tilt), dramatic diagonal composition.',
      'pan-left': 'Visual cues suggesting movement to the left, subtle motion blur on the sides.',
      'pan-right': 'Visual cues suggesting movement to the right, subtle motion blur on the sides.',
      'zoom-in': 'Dynamic central focus, compressed perspective, suggestion of rapid approach.',
      'zoom-out': 'Expanding wide perspective, revealing environment scale.',
      shake: 'Kinetic handheld energy, slight motion blur, immersive action feel.',
      'pan-up': 'Bottom-up perspective, suggesting rising camera motion.',
      'pan-down': 'Top-down perspective, suggesting descending camera motion.'
    }

    if (actions.length > 0) {
      const actionStr = actions
        .map((a: any) => {
          const type = String(a.type || a).toLowerCase()
          const intensity = a.intensity || 'medium'
          const bakeCue = cameraEffectBakes[type] || ''
          return `${type.toUpperCase()} (${intensity} intensity). ${bakeCue}`
        })
        .join(' ')
      shotDirective = `${shotDirective} CAMERA ACTION: ${actionStr}`
    }

    paragraph = `${shotDirective} ${paragraph}`

    // ─── 8. Atmosphere & State Evolution ────────────────────────────────────────
    if (this.seriesContext.timeOfDay || this.seriesContext.weatherState) {
      const time = this.seriesContext.timeOfDay || ''
      const weather = this.seriesContext.weatherState || ''
      paragraph = `Atmosphère : ${time}${time && weather ? ', ' : ''}${weather}. ${paragraph}`
    }

    if (scene.persistentDecorTokens && scene.persistentDecorTokens.length > 0) {
      paragraph = `PERSISTENT ELEMENTS: ${scene.persistentDecorTokens.join(', ')}. ${paragraph}`
    }

    const evolution = SeriesVideoGenerator.mergeEvolution(
      this.seriesContext.visualEvolution || {},
      scene.visualEvolution || {}
    )
    const assetState = SeriesVideoGenerator.mergeEvolution(
      this.seriesContext.assetEvolution || {},
      scene.assetEvolution || {}
    )

    const relevantEvolutions: string[] = []

    const getEvolutionString = (data: any): string => {
      if (typeof data === 'string') return data
      if (typeof data?.state === 'string') return data.state
      if (typeof data?.state === 'object') return JSON.stringify(data.state)
      return ''
    }

    // 1. Characters in scene
    for (const name of characterMatches) {
      const evolutionData = SeriesVideoGenerator.findInRegistry(evolution as any, name)
      if (evolutionData) {
        const stateStr = getEvolutionString(evolutionData)
        if (stateStr) relevantEvolutions.push(`${name} (${stateStr})`)
      }
    }

    // 2. Assets (fuzzy check in prompt)
    for (const [assetName, evolutionData] of Object.entries(assetState)) {
      const stateStr = getEvolutionString(evolutionData)
      if (stateStr) {
        if (
          stateStr.toLowerCase().includes('retiré') ||
          stateStr.toLowerCase().includes('supprimé') ||
          stateStr.toLowerCase().includes('removed')
        ) {
          relevantEvolutions.push(
            `🛑 ABSENCE OBLIGATOIRE : ${assetName} (Cet objet a été RETIRÉ du décor, ne pas le générer)`
          )
        } else {
          relevantEvolutions.push(`${assetName} (${stateStr})`)
        }
      }
    }

    if (relevantEvolutions.length > 0) {
      paragraph = `État Physique Evolution : ${relevantEvolutions.join('; ')}. ${paragraph}`
    }

    // ─── 9. Social Context & Emotions ──────────────────────────────────────────
    const relationships = this.seriesContext.relationshipMap || {}
    if (Object.keys(relationships).length > 0) {
      const relStr = Object.entries(relationships)
        .map(([char, targetMap]) =>
          Object.entries(targetMap as Record<string, string>)
            .map(([target, rel]) => `${char} vis-à-vis de ${target} : ${rel}`)
            .join(', ')
        )
        .join('. ')
      paragraph = `Interaction Sociale : ${relStr}. ${paragraph}`
    }

    if (scene.emotionalTokens && Object.keys(scene.emotionalTokens).length > 0) {
      const emotions = Object.entries(scene.emotionalTokens)
        .map(([charId, tokens]) => `${charId} est ${(tokens as string[]).join(', ')}`)
        .join(', ')
      paragraph = `Expressions faciales : ${emotions}. ${paragraph}`
    }

    if (scene.interactions && Object.keys(scene.interactions).length > 0) {
      const interactions = Object.entries(scene.interactions)
        .map(([pair, tension]) => `Dynamique de groupe ${pair} : ${tension}`)
        .join(', ')
      paragraph = `Ambience relationnelle : ${interactions}. ${paragraph}`
    }

    // ─── 10. Art Direction & Guards ──────────────────────────────────────────────
    const palette = this.seriesContext.colorPalette
    const motifs = [...(this.seriesContext.symbolicMotifs || []), ...(scene.symbolicMotifs || [])]
    const camStyle = this.seriesContext.cameraStyle

    if (palette || motifs.length > 0 || camStyle) {
      let styleStr = ''
      if (palette) styleStr += `Color Palette: ${palette}. `
      if (motifs.length > 0) styleStr += `Symbolic Motifs: ${motifs.join(', ')}. `
      if (camStyle) {
        styleStr += `Camera Technique: ${camStyle}. `
        if (camStyle.toLowerCase().includes('handheld')) {
          styleStr += 'Real-world handheld jitter, natural organic camera movement. '
        }
      }

      // High-end Cinematic Optics (V61)
      const opticalDirectives = [
        'captured on 35mm film',
        'cinematic lens flares',
        'natural depth of field',
        comp.shotType === 'CLOSEUP' || comp.shotType === 'EXTREME_CLOSEUP' ? '85mm portrait lens' : '35mm wide lens',
        'professional color grading'
      ]
      styleStr += `Optics: ${opticalDirectives.join(', ')}. `

      paragraph = `Direction Artistique : ${styleStr}${paragraph}`
    }

    const layout = scene.composition?.layout || 'SINGLE'
    if (layout === 'MONTAGE' || layout === 'SPLIT' || layout === 'DIAGONAL') {
      const typeLabel = layout === 'MONTAGE' ? 'polyptych / multi-panels' : 'split-screen'
      paragraph = `COMPOSITION : ${typeLabel} separating characters. ${paragraph}`
    }

    // ─── 11. Final Assembly & Anchoring ──────────────────────────────────────────
    const allReferenceImages: (string | { name?: string; data: string })[] = []
    const characterSheets: any[] = []

    // 1. Add background/continuity reference as primary
    if (referenceImageUrl) {
      allReferenceImages.push(referenceImageUrl)
    }

    // 2. Add character visual anchors (thumbnails) and metadata (sheets)
    for (const name of characterMatches) {
      const char = SeriesVideoGenerator.findInRegistry(characterRegistry as any, name) as any
      if (char) {
        if (char.thumbnailUrl) {
          allReferenceImages.push({ name, data: char.thumbnailUrl })
        }
        characterSheets.push({
          name: name.replace(/^@/, ''),
          appearance: { description: char.description || '' }, // ALWAYS provide description
          role: char.role || ''
        })
      }
    }

    // 3. Add asset anchors
    for (const name of Object.keys(assetRegistry)) {
      if (paragraph.toLowerCase().includes(name.toLowerCase())) {
        const asset = SeriesVideoGenerator.findInRegistry(assetRegistry as any, name) as any
        if (asset && asset.thumbnailUrl) {
          allReferenceImages.push({ name, data: asset.thumbnailUrl })
        }
      }
    }

    // 4. Add Location Master as a background anchor (V44 Hardening)
    // We always add it if no previous scene image is available, to GROUND the AI.
    if (!referenceImageUrl && locationMasterUrl) {
      allReferenceImages.push({ name: 'Location Reference', data: locationMasterUrl })
    }

    const spec = this.getEffectiveSpec({} as any)
    const finalPrompt = this.getEnrichedImagePrompt(paragraph, spec)

    // [V59] Extract camera actions for separated injection
    // Using scene.cameraAction directly to get fresh data
    const rawCam = scene.cameraAction || []
    const camActions = Array.isArray(rawCam) ? rawCam : [rawCam]
    const cameraDirective =
      actions.length > 0
        ? actions
            .map((a: any) => {
              const type = String(a.type || a).toLowerCase()
              const bake = cameraEffectBakes[type] || ''
              return `${type.toUpperCase()} (${a.intensity || 'medium'}). ${bake}`
            })
            .join(' ')
        : undefined

    return {
      sceneId: scene.id,
      prompt: finalPrompt,
      referenceImage: referenceImageUrl,
      referenceImages: allReferenceImages,
      characterSheets,
      reuseReferenceImage: !!sequelBridgeUrl,
      shotDirective: shotDirective as any,
      cameraDirective
    }
  }

  public buildAnimationPrompt(
    scene: EnrichedScene,
    imageStyle?: { characterDescription?: string }
  ): { sceneId: string; instructions: string; movements: any[] } {
    return { sceneId: scene.id, instructions: scene.animationPrompt || '', movements: [] }
  }

  // ─── Reference images ───────────────────────────────────────────────────────

  public async buildThumbnailPrompt(title: string, environment?: string, inspirationUrl?: string): Promise<string> {
    return `Series thumbnail: ${title}`
  }

  public async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    const spec = this.getEffectiveSpec({} as any)
    const characterDescription = this.buildCharacterDescription(spec, hasReferenceImages)
    const locationDescription = this.buildLocationDescription(hasReferenceImages)

    return this.buildImageGenerationInstructions(hasReferenceImages, {
      characterDescription,
      locationDescription
    })
  }

  protected buildLocationDescription(hasReferenceImages: boolean = false): string {
    const locSection = Object.entries(this.seriesContext.locationRegistry || {})
      .map(([name, data]) => {
        const normalized = SeriesVideoGenerator.normalizeId(name)
        return `Location "${normalized}"${!hasReferenceImages ? ` (${data.description})` : ''}`
      })
      .join(', ')

    const header = [`Universe/Genre: ${this.seriesContext.globalContext?.slice(0, 200) || 'Series Continuity'}.`].join(
      '\n'
    )

    if (hasReferenceImages) {
      return [
        header,
        locSection ? `Recalling locations from master references: ${locSection}` : 'Location from reference.'
      ].join('\n')
    }

    return [header, locSection || 'Established series environments.'].join('\n')
  }

  protected buildCharacterDescription(spec: VideoTypeSpecification, hasReferenceImages: boolean = false): string {
    const charSection = Object.entries(this.seriesContext.characterRegistry)
      .map(([name, data]) => {
        return `Recurring Character "${name}"${!hasReferenceImages ? ` (${data.description})` : ''}`
      })
      .join(', ')

    const header = [`Universe/Genre: ${this.seriesContext.globalContext?.slice(0, 200) || 'Series Continuity'}.`].join(
      '\n'
    )

    if (hasReferenceImages) {
      return [
        header,
        charSection ? `Recalling characters from references: ${charSection}` : 'Character from reference.'
      ].join('\n')
    }

    return [
      `Universe/Genre: ${this.seriesContext.globalContext?.slice(0, 200) || 'Series Continuity'}.`,
      spec.characterDescription || '',
      `Style episodic series consistency. ${charSection ? `Recalling characters: ${charSection}` : ''}`
    ]
      .filter(Boolean)
      .join('\n')
  }

  // ─── Static context updater ─────────────────────────────────────────────────

  public static updateContext(currentContext: SeriesContext, scriptResult: any): SeriesContext {
    const metadata = scriptResult.seriesMetadata || {}
    const scenes = scriptResult.scenes || []
    const currentEp = currentContext.episodeNumber

    const updatedRegistry = { ...(currentContext.characterRegistry || {}) }
    const updatedLocationRegistry = { ...(currentContext.locationRegistry || {}) }
    const updatedAssetRegistry = { ...(currentContext.assetRegistry || {}) }

    // --- Thread & Roadmap Updates (Project Sequel - V42) ---
    const threadRegistry = (currentContext as any).threads || (currentContext as any).unresolvedThreads || []
    const resolvedStakes = [...((currentContext as any).resolvedStakes || [])]
    const updatedResolvedStakes = resolvedStakes

    let updatedRoadmap = (currentContext as any).roadmap || {}
    if (metadata.roadmapUpdate) {
      updatedRoadmap = metadata.roadmapUpdate
      // Carry forward unresolved elements if not overwritten
      const currentRoadmap = (currentContext as any).roadmap
      if (currentRoadmap) {
        if (currentRoadmap.irreversibleFacts) {
          const newFacts = metadata.roadmapUpdate.irreversibleFacts || []
          updatedRoadmap.irreversibleFacts = Array.from(new Set([...currentRoadmap.irreversibleFacts, ...newFacts]))
        }
        if (currentRoadmap.watchpoints && !metadata.roadmapUpdate.watchpoints) {
          updatedRoadmap.watchpoints = currentRoadmap.watchpoints
        }
        if (currentRoadmap.pendingChoices && !metadata.roadmapUpdate.pendingChoices) {
          updatedRoadmap.pendingChoices = currentRoadmap.pendingChoices
        }
      }
    }

    if (metadata.characterContinuity) {
      for (const [rawName, data] of Object.entries(metadata.characterContinuity)) {
        const name = SeriesVideoGenerator.normalizeId(rawName)
        const existing = SeriesVideoGenerator.findInRegistry(updatedRegistry, name)
        const charData = data as any

        if (existing) {
          // Update existing registry item non-destructively
          if (charData.description) existing.description = charData.description
          if (charData.backstory) existing.backstory = charData.backstory
          if (charData.personalGoal) existing.personalGoal = charData.personalGoal
          if (charData.motivation) existing.motivation = charData.motivation
          if (charData.abilities) existing.abilities = charData.abilities
          if (charData.knownFacts) existing.knownFacts = charData.knownFacts
          if (charData.fate) existing.fate = charData.fate
          if (charData.status) existing.status = charData.status
          if (charData.deathEpisode) existing.deathEpisode = charData.deathEpisode

          if (charData.isNew) {
            console.info(`[SeriesGenerator] 🔄 Visual evolution for ${name}. Clearing stale portrait.`)
            existing.thumbnailUrl = undefined
          }
        } else {
          // Register as new discovered character but with normalized key
          console.info(`[SeriesGenerator] ✨ New character discovered via continuity: ${name}`)
          updatedRegistry[name] = {
            description: charData.description || '',
            isNew: true,
            firstMentionedEpisode: currentEp
          }
        }
      }
    }

    if (metadata.newCharacters) {
      for (const [rawName, desc] of Object.entries(metadata.newCharacters)) {
        const name = SeriesVideoGenerator.normalizeId(rawName)
        const existing = SeriesVideoGenerator.findInRegistry(updatedRegistry, name)
        if (!existing) {
          console.info(`[SeriesGenerator] ✨ New character registered: ${name}`)
          updatedRegistry[name] = {
            description: desc as string,
            isNew: true,
            firstMentionedEpisode: currentEp
          }
        }
      }
    }

    if (metadata.locationContinuity) {
      for (const [rawId, info] of Object.entries(metadata.locationContinuity)) {
        const id = SeriesVideoGenerator.normalizeId(rawId)
        const locInfo = info as any
        const existing = updatedLocationRegistry[id] || SeriesVideoGenerator.findInRegistry(updatedLocationRegistry, id)

        if (!existing) {
          console.info(`[SeriesGenerator] 📍 New location discovered via continuity: ${id}`)
          updatedLocationRegistry[id] = {
            description: locInfo.description || '',
            atmosphere: locInfo.atmosphere || '',
            firstMentionedEpisode: currentEp
          }
        } else {
          if (locInfo.description) existing.description = locInfo.description
          if (locInfo.atmosphere) existing.atmosphere = locInfo.atmosphere

          if (locInfo.isNew) {
            console.info(`[SeriesGenerator] 🔄 Environmental evolution for ${id}. Clearing stale thumbnail.`)
            existing.thumbnailUrl = undefined
          }
        }
      }
    }

    if (metadata.newLocations) {
      for (const [rawId, desc] of Object.entries(metadata.newLocations)) {
        const id = SeriesVideoGenerator.normalizeId(rawId)
        const existing = updatedLocationRegistry[id] || SeriesVideoGenerator.findInRegistry(updatedLocationRegistry, id)
        if (!existing) {
          console.info(`[SeriesGenerator] 📍 New location registered: ${id}`)
          updatedLocationRegistry[id] = {
            description: desc as string,
            firstMentionedEpisode: currentEp
          }
        }
      }
    }

    const nextCliffhanger: TypedCliffhanger | string | undefined =
      metadata.cliffhanger && typeof metadata.cliffhanger === 'object'
        ? (metadata.cliffhanger as TypedCliffhanger)
        : metadata.cliffhanger || currentContext.lastCliffhanger

    // --- Smart Thread Merging (Anti-Loss Hardening V42) ---
    const aiThreads: NarrativeThread[] = metadata.unresolvedThreads || []
    const threadUpdates: any[] = metadata.threadUpdates || []

    // Convert to Maps for easier merging
    const threadById = new Map<string, NarrativeThread>()
    const threadByTitle = new Map<string, NarrativeThread>()

    threadRegistry.forEach((t: NarrativeThread) => {
      if (t.id) threadById.set(t.id, t)
      threadByTitle.set(t.title.toLowerCase().trim().replace(/\?$/, ''), t)
    })

    // Process explicitly marked updates first
    threadUpdates.forEach((update: any) => {
      let existing = update.id ? threadById.get(update.id) : undefined
      const titleKey = update.title?.toLowerCase().trim().replace(/\?$/, '')
      if (!existing && titleKey) existing = threadByTitle.get(titleKey)

      if (update.status === 'resolved') {
        resolvedStakes.push({
          id: update.id || existing?.id,
          title: update.title || existing?.title || 'Unknown Thread',
          resolution: update.description,
          episodeNumber: currentEp,
          resolutionSceneId: update.resolutionSceneId,
          mustResolveBy: existing?.mustResolveBy
        })
        if (existing?.id) threadById.delete(existing.id)
      } else {
        const id = existing?.id || update.id || `T${threadById.size + 1}`
        const merged = { ...(existing || {}), ...update, id, lastUpdatedEpisode: currentEp }
        threadById.set(id, merged)
      }
    })

    // Process regular unresolved threads (from LLM mapping)
    aiThreads.forEach((t) => {
      let existing = t.id ? threadById.get(t.id) : undefined
      const titleKey = t.title.toLowerCase().trim().replace(/\?$/, '')
      if (!existing) existing = threadByTitle.get(titleKey)

      const id = existing?.id || t.id || `T${threadById.size + 1}`
      const mergedThread = {
        ...(existing || {}),
        ...t,
        id,
        lastUpdatedEpisode: currentEp
      }

      if (t.status === 'resolved') {
        resolvedStakes.push({
          id,
          title: mergedThread.title,
          resolution: mergedThread.description,
          episodeNumber: currentEp,
          resolutionSceneId: (t as any).resolutionSceneId,
          mustResolveBy: mergedThread.mustResolveBy
        })
        threadById.delete(id)
      } else {
        threadById.set(id, mergedThread)
      }
    })

    const finalThreads: NarrativeThread[] = []
    Array.from(threadById.values()).forEach((thread) => {
      if (thread.title && !thread.title.trim().endsWith('?')) {
        thread.title = `${thread.title.trim()} ?`
      }
      finalThreads.push(thread)
    })

    const warnings = this.validateThreadsAsQuestions(finalThreads)
    warnings.forEach((w) => console.warn(w))

    const episodeSummary = metadata.episodeSummary || 'Pas de résumé.'
    const episodeHistory = `--- Episode ${currentContext.episodeNumber} ---\n${episodeSummary}\n`

    const nextEp = currentContext.episodeNumber + 1
    const seedingHints: string[] = []
    if (currentContext.plannedEpisodes) {
      const upcomingTwists = currentContext.plannedEpisodes.filter(
        (ep) =>
          ep.number === currentEp + 2 &&
          (ep.hook.toLowerCase().includes('romance') ||
            ep.hook.toLowerCase().includes('relation') ||
            ep.hook.toLowerCase().includes('trahison') ||
            ep.hook.toLowerCase().includes('secret'))
      )

      for (const twist of upcomingTwists) {
        seedingHints.push(`PRÉPAREZ CE TWIST DANS CET ÉPISODE (HINT) : ${twist.hook}`)
      }
    }

    if (metadata.cliffhanger) {
      updatedResolvedStakes.push({
        title:
          typeof metadata.cliffhanger === 'string' ? metadata.cliffhanger : (metadata.cliffhanger as any).description,
        resolution: 'En attente',
        episodeNumber: currentContext.episodeNumber,
        mustResolveBy: currentContext.episodeNumber + 1
      })
    }
    // --- Evolution & Relationship Aggregation (Project Sequel - V42) ---
    const epNum = currentContext.episodeNumber
    const updatedVisualEvolution = SeriesVideoGenerator.mergeEvolution(
      currentContext.visualEvolution || {},
      (metadata.visualEvolution as any) || {},
      epNum
    )
    const updatedAssetEvolution = SeriesVideoGenerator.mergeEvolution(
      currentContext.assetEvolution || {},
      (metadata.assetEvolution as any) || {},
      epNum
    )
    const updatedCharacterEvolution = SeriesVideoGenerator.mergeEvolution(
      currentContext.characterEvolution || {},
      (metadata.characterEvolution as any) || {},
      epNum
    )

    const updatedRelationshipMap = { ...(currentContext.relationshipMap || {}), ...(metadata.relationshipMap || {}) }
    let lastWeather = currentContext.weatherState
    let lastTime = currentContext.timeOfDay

    for (const scene of scenes) {
      // 1. Visual Evolution
      if (scene.visualEvolution) {
        for (const [name, state] of Object.entries(scene.visualEvolution)) {
          updatedVisualEvolution[SeriesVideoGenerator.normalizeId(name)] = {
            state: state as string,
            referenceSceneId: scene.id,
            referenceEpisode: epNum
          }
        }
      }

      // 2. Asset Evolution
      if (scene.assetEvolution) {
        for (const [name, state] of Object.entries(scene.assetEvolution)) {
          updatedAssetEvolution[SeriesVideoGenerator.normalizeId(name)] = {
            state: state as string,
            referenceSceneId: scene.id,
            referenceEpisode: epNum
          }
        }
      }

      // 3. Character Evolution
      if (scene.characterEvolution) {
        for (const [name, state] of Object.entries(scene.characterEvolution)) {
          updatedCharacterEvolution[SeriesVideoGenerator.normalizeId(name)] = {
            state: state as string,
            referenceSceneId: scene.id,
            referenceEpisode: epNum
          }
        }
      }

      // 4. Relationship Evolution
      if (scene.relationshipMap) {
        for (const [char, targets] of Object.entries(scene.relationshipMap)) {
          updatedRelationshipMap[char] = {
            ...(updatedRelationshipMap[char] || {}),
            ...(targets as any)
          }
        }
      }
    }

    // Capture final weather/time from the last scene
    const lastScene = scenes.at(-1)
    if (lastScene?.weatherState && lastScene.weatherState !== 'None') lastWeather = lastScene.weatherState
    if (lastScene?.timeOfDay) lastTime = lastScene.timeOfDay

    // ─── Continuity Analysis & Debts (V39 Hardening) ───
    const continuityDebts = [...(currentContext.continuityDebts || [])]
    if (metadata.continuityAnalysis) {
      const analysis = metadata.continuityAnalysis
      if (analysis.defects) continuityDebts.push(...analysis.defects)
      if (analysis.soudureBrute) continuityDebts.push(`Soudure Brute: ${analysis.soudureBrute}`)
      if (analysis.assetFantome) continuityDebts.push(`Asset Fantôme: ${analysis.assetFantome}`)
      if (analysis.logicGap) continuityDebts.push(`Faille Logique: ${analysis.logicGap}`)
      if (analysis.threatVagueness) continuityDebts.push(`Menace Floue: ${analysis.threatVagueness}`)
      if (analysis.pacingIssue) continuityDebts.push(`Problème Rythme: ${analysis.pacingIssue}`)
      if (analysis.promesseNonTenue) continuityDebts.push(`Promesse Non Tenue: ${analysis.promesseNonTenue}`)
      if (analysis.filsMuets) {
        analysis.filsMuets.forEach((f: string) => continuityDebts.push(`Fil oublié: ${f}`))
      }
    }

    // Promotion to Forced Correction for the NEXT episode
    const forcedCorrection =
      continuityDebts.length > 0 ? `🚨 MISSION DE SOUDURE CORRECTIVE : ${continuityDebts.join(' ; ')}` : undefined

    const scenesForBridge = scriptResult.scenes || []
    const finalScene = scenesForBridge.at(-1)
    const finalImage = finalScene?.imageUrl

    // --- Lore Bible Expansion ---
    let updatedGlobalContext = currentContext.globalContext || ''
    if (metadata.loreUpdates && Array.isArray(metadata.loreUpdates) && metadata.loreUpdates.length > 0) {
      const loreAddition = metadata.loreUpdates.join('\n')
      updatedGlobalContext =
        `${updatedGlobalContext}\n\n[LORE UPDATE EPISODE ${currentContext.episodeNumber}]\n${loreAddition}`.trim()
    }

    // --- Automatic Reference Promotion & Origin Tracking (Project Sequel - V42) ---
    for (const scene of scenes || []) {
      const fullText = `${scene.summary || ''} ${scene.narration || ''} ${scene.imagePrompt || ''}`.toLowerCase()

      // 1. Locations
      if (scene.locationId) {
        const loc = updatedLocationRegistry[scene.locationId]
        if (loc) {
          if (!(loc as any).originSceneId) {
            ;(loc as any).originSceneId = scene.id
            ;(loc as any).originEpisode = currentEp
          }
          if (scene.imageUrl && (!loc.thumbnailUrl || scene.isEstablishingShot)) {
            console.info(
              `[SeriesGenerator] 📍 Promoting scene ${scene.id} as reference image for location: ${scene.locationId}`
            )
            loc.thumbnailUrl = scene.imageUrl
            loc.referenceSceneId = scene.id
            loc.referenceEpisode = currentEp
          }
        }
      }

      // 2. Characters
      // Handle Registry Origin (Narrative)
      for (const [name, char] of Object.entries(updatedRegistry)) {
        const charAny = char as any
        if (!charAny.originSceneId) {
          const charPattern = name.toLowerCase()
          const charsInScene = scene.charactersInScene || []
          if (
            fullText.includes(charPattern) ||
            charsInScene.some((id: string) => id.toLowerCase().replace('@', '') === charPattern)
          ) {
            charAny.originSceneId = scene.id
            charAny.originEpisode = currentEp
          }
        }
      }

      const charIds = scene.charactersInScene || []
      for (const charId of charIds) {
        const name = charId.replace(/^@/, '')
        const char = updatedRegistry[name]

        // Handle Automatic Status Promotion (Lifecycle)
        const charEvol = updatedCharacterEvolution[SeriesVideoGenerator.normalizeId(name)]
        if (charEvol) {
          const state = (charEvol as any).state?.toLowerCase() || ''
          const isDead =
            state.includes('mort') ||
            state.includes('décédé') ||
            state.includes('dead') ||
            state.includes('tué') ||
            state.includes('killed')
          const isMissing =
            state.includes('disparu') ||
            state.includes('missing') ||
            state.includes('enlevé') ||
            state.includes('kidnapped')
          const isInjured = state.includes('blessé') || state.includes('injured') || state.includes('wounded')
          const isCaptured = state.includes('capturé') || state.includes('prisonnier') || state.includes('captured')
          const isCorrupted =
            state.includes('corrompu') ||
            state.includes('corrupted') ||
            state.includes('traître') ||
            state.includes('betrayer')
          const isResurrected =
            state.includes('ressuscité') || state.includes('resurrected') || state.includes('revenu à la vie')

          if (isDead && char.status !== 'dead') {
            console.info(
              `[SeriesGenerator] 💀 Character ${name} confirmed DEAD in scene ${scene.id}. Updating Registry.`
            )
            char.status = 'dead'
            char.deathEpisode = currentEp
            char.deathSceneId = scene.id
          } else if (isResurrected && char.status === 'dead') {
            console.info(`[SeriesGenerator] ✨ Character ${name} RESURRECTED in scene ${scene.id}!`)
            char.status = 'alive'
            char.deathEpisode = undefined
            char.deathSceneId = undefined
          } else if (isMissing && char.status !== 'missing') {
            console.info(`[SeriesGenerator] 🔍 Character ${name} marked as MISSING in scene ${scene.id}.`)
            char.status = 'missing'
          } else if (isInjured && char.status !== 'injured') {
            console.info(`[SeriesGenerator] 🩹 Character ${name} marked as INJURED in scene ${scene.id}.`)
            char.status = 'injured'
          } else if (isCaptured && char.status !== 'captured') {
            console.info(`[SeriesGenerator] ⛓️ Character ${name} marked as CAPTURED in scene ${scene.id}.`)
            char.status = 'captured'
          } else if (isCorrupted && char.status !== 'corrupted') {
            console.info(`[SeriesGenerator] 🌑 Character ${name} is now CORRUPTED in scene ${scene.id}.`)
            char.status = 'corrupted'
          }
        }

        if (char && scene.imageUrl && (!char.thumbnailUrl || char.isNew)) {
          console.info(`[SeriesGenerator] 🎭 Promoting scene ${scene.id} as reference image for character: ${name}`)
          char.thumbnailUrl = scene.imageUrl
          char.referenceSceneId = scene.id
          char.referenceEpisode = currentEp
        }
      }

      // 3. Assets
      const assets = scriptResult.seriesMetadata?.assetRegistry || {}
      for (const assetName of Object.keys(assets)) {
        const asset = updatedAssetRegistry[assetName]
        if (asset) {
          if (!(asset as any).originSceneId && fullText.includes(assetName.toLowerCase())) {
            ;(asset as any).originSceneId = scene.id
            ;(asset as any).originEpisode = currentEp
          }
          if (
            scene.imageUrl &&
            scene.imagePrompt?.toLowerCase().includes(assetName.toLowerCase()) &&
            !asset.thumbnailUrl
          ) {
            console.info(`[SeriesGenerator] ✨ Promoting scene ${scene.id} as reference image for asset: ${assetName}`)
            asset.thumbnailUrl = scene.imageUrl
            asset.referenceSceneId = scene.id
            asset.referenceEpisode = currentEp
          }
        }
      }
    }

    return {
      ...currentContext,
      characterRegistry: updatedRegistry,
      locationRegistry: updatedLocationRegistry,
      assetRegistry: updatedAssetRegistry,
      unresolvedThreads: finalThreads,
      resolvedStakes: updatedResolvedStakes,
      previousEpisodesContext: `${currentContext.previousEpisodesContext || ''}\n${episodeHistory}`.trim(),
      globalContext: updatedGlobalContext,
      episodeNumber: nextEp,
      lastCliffhanger: nextCliffhanger,
      weatherState: lastWeather,
      timeOfDay: lastTime,
      visualEvolution: updatedVisualEvolution,
      assetEvolution: updatedAssetEvolution,
      characterEvolution: updatedCharacterEvolution,
      relationshipMap: updatedRelationshipMap,
      nextEpisodeTease: metadata.nextEpisodeTease,
      continuityDebts,
      forcedCorrection,
      threads: threadRegistry,
      roadmap: updatedRoadmap
    }
  }

  // ─── Registry Helpers ───────────────────────────────────────────────────────

  public static normalizeId(id: string): string {
    if (!id) return ''

    // Lower and clean basic symbols to create a stable slug
    const clean = id
      .toLowerCase()
      .trim()
      .replace(/^@/, '')
      .replaceAll(/[\s\-_]+/g, ' ')

    return `@${clean.replaceAll(' ', '')}`
  }

  public static findInRegistry<T>(registry: Record<string, T>, targetId: string): T | undefined {
    const key = SeriesVideoGenerator.findKeyInRegistry(registry, targetId)
    return key ? registry[key] : undefined
  }

  public static findKeyInRegistry<T>(registry: Record<string, T>, targetId: string): string | undefined {
    if (!targetId) return undefined

    // 1. Precise direct match
    if (registry[targetId]) return targetId

    // 2. Normalize and check for handle matches
    const normalizedTarget = SeriesVideoGenerator.normalizeId(targetId)

    // Handle is usually the first name or a slugified version
    const targetSlug = normalizedTarget.replaceAll(/\s+/g, '')

    for (const [key, value] of Object.entries(registry)) {
      const normalizedKey = SeriesVideoGenerator.normalizeId(key)
      const keySlug = normalizedKey.replaceAll(/\s+/g, '')

      // Full Match (Case/Handle insensitive)
      if (normalizedKey === normalizedTarget) return key

      // Slug Match (e.g., "VictorLeclerc" === "VictorLeclerc")
      if (keySlug === targetSlug) return key

      // Word match logic (e.g. "Frère Aloysius" matches "@brotheraloysius" if we have a translation layer
      // OR if the AI just used the English name) -> Relaxing the match to catch common AI naming variations
      const keyWords = key
        .toLowerCase()
        .replaceAll(/[^\w\s]/g, '')
        .split(/\s+/)
      const targetWords = targetId
        .toLowerCase()
        .replace(/^@/, '')
        .replaceAll(/[^\w\s]/g, ' ')
        .split(/\s+/)

      // Check if target words have overlap with key words (e.g. "Aloysius" matches "@aloysius" or "@frerealoysius")
      const hasOverlap =
        targetWords.some((tw) => keyWords.some((kw) => tw.includes(kw) || kw.includes(tw))) ||
        keyWords.some((kw) => targetWords.some((tw) => kw.includes(tw) || tw.includes(kw)))

      if (hasOverlap) {
        return key
      }

      // Check fullName field if exists (T is likely character object)
      const valAny = value as any
      if (valAny.fullName) {
        const normalizedFullName = SeriesVideoGenerator.normalizeId(valAny.fullName)
        if (normalizedFullName === normalizedTarget) {
          return key
        }
      }
    }

    return undefined
  }

  private static mergeEvolution(
    base: Record<string, string | EvolutionState>,
    updates: Record<string, string | EvolutionState>,
    episodeNumber?: number
  ): Record<string, EvolutionState> {
    const merged: Record<string, EvolutionState> = {}

    // Initialize with base
    for (const [key, val] of Object.entries(base || {})) {
      merged[SeriesVideoGenerator.normalizeId(key)] = typeof val === 'string' ? { state: val } : val
    }

    // Apply updates
    for (const [key, val] of Object.entries(updates)) {
      merged[SeriesVideoGenerator.normalizeId(key)] =
        typeof val === 'string' ? { state: val, referenceEpisode: episodeNumber } : val
    }

    return merged
  }
}
