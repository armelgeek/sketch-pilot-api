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
  visualStyleModelId?: string
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

function cliffhangerDescription(ch: TypedCliffhanger | string | undefined): string {
  if (!ch) return 'Aucun.'
  if (typeof ch === 'string') return ch
  return ch.description
}

function cliffhangerBridgeInstruction(
  ch: TypedCliffhanger | string | undefined,
  episodeNumber: number,
  lastScene?: any
): string {
  if (episodeNumber <= 1 || (!ch && !lastScene)) return ''

  let prompt =
    "\n\n🆘 TRANSITION VS CAMERA ACTION (STRICT) : \n- TRANSITION : Changement de scène. 'shake', 'static', 'breathing' ne sont PAS des transitions.\n- CAMERA ACTION : Mouvement DANS la scène. 'shake' est une CAMERA ACTION.\nSi vous voulez une secousse, utilisez 'cameraAction': 'shake' et 'transition': 'none'.\n\n⚠️ PONT NARRATIF OBLIGATOIRE :"

  if (lastScene) {
    prompt += `\nL'épisode précédent s'est arrêté EXACTEMENT sur cette scène : "${lastScene.summary || lastScene.imagePrompt}"`
    if (lastScene.locationId)
      prompt += `\nLieu de reprise OBLIGATOIRE : "${lastScene.locationId}" (Vous DEVEZ démarrer ici).`
    if (lastScene.persistentDecorTokens?.length > 0) {
      prompt += `\nAmbiance & Lumière à maintenir : ${lastScene.persistentDecorTokens.join(', ')}`
    }

    prompt += `\n🆘 ANTI-SAUT TEMPOREL (CRITICAL) : Interdiction absolue de commencer par 'Mais alors qu'ils discutaient', 'Quelques heures plus tard', ou toute ellipse. Vous reprenez au MÊME ENDROIT, à la MÊME SECONDE.`
    prompt += `\n- HÉRITAGE TECHNIQUE [S1] (CLONAGE) : La Scène 1 DOIT être l'héritière technique de l'épisode précédent :`
    prompt += `\n    * locationId : "${lastScene.locationId}" (Utilisez cet ID EXACT)`
    prompt += `\n    * charactersId : [${(lastScene.charactersId || []).join(', ')}]`
    prompt += `\n    * persistentDecorTokens : [${(lastScene.persistentDecorTokens || []).join(', ')}]`
    prompt += `\n    * shotType : "${lastScene.shotType || 'WIDE'}"`
    prompt += `\n- ECHO DU DERNIER SOUFFLE : L'épisode précédent s'est achevé sur : "${lastScene.narration}".`
    prompt += `\n  ⚠️ LA PREMIÈRE PHRASE DE SCÈNE 1 DOIT RÉPONDRE DIRECTEMENT À CES MOTS (Action immediate ou Ressenti sensoriel).`
    prompt += `\n- RÉACTION VISCÉRALE : Lars (ou le perso actuel) doit être dans le MÊME état émotionnel (Peur, Choc, Détermination).`
    prompt += `\n⚠️ IMAGE : La Scène 1 réutilisera PHYSIQUEMENT l'image finale. Votre description d'image DOIT être identique à la finale précédente.`
  }

  if (ch) {
    if (typeof ch === 'string') {
      prompt += `\nCliffhanger à résoudre : "${ch}"`
    } else {
      const typeInstructions: Record<CliffhangerType, string> = {
        revelation: `Le personnage ou le lecteur vient d'apprendre une vérité qui change tout. L'épisode doit s'ouvrir sur les CONSÉQUENCES émotionnelles immédiates de cette révélation, pas sur une autre action. Le choc doit résonner.`,
        peril: `Un personnage est en danger immédiat. L'épisode DOIT s'ouvrir en plein milieu de ce danger (In Media Res). NE PAS résoudre le péril en deux lignes — laissez la tension monter au moins 2 scènes avant toute issue.`,
        choice: `Un personnage fait face à un choix impossible. L'épisode DOIT montrer le processus de décision dans ses moindres contradictions — pas seulement la décision elle-même. La souffrance du choix est le coeur de cette ouverture.`,
        betrayal: `Une trahison vient d'être révélée ou commise. L'épisode s'ouvre sur la réaction viscérale du personnage trahi ou du traître face aux conséquences. Evitez les explications immédiates — laissez l'ambiguïté respirer.`,
        unknown: `L'épisode doit reconnecter avec la tension précédente de façon directe et immersive.`
      }
      prompt += `\n[Type: ${(ch.type || 'unknown').toUpperCase()}] : "${ch.description}"`
      if (ch.audienceQuestion) prompt += `\nQuestion du public : "${ch.audienceQuestion}"`
      prompt += `\nInstruction de reprise : ${typeInstructions[ch.type as CliffhangerType] || typeInstructions.unknown}`
    }
  }

  return prompt
}

/**
 * Validate that unresolved threads are questions, not statements.
 * Returns a warning list (non-blocking).
 */
function validateThreadsAsQuestions(threads: NarrativeThread[]): string[] {
  return threads
    .filter((t) => !t.title.trim().endsWith('?') && !t.description.trim().endsWith('?'))
    .map(
      (t) =>
        `[SeriesVideoGenerator] Thread title ou description non formulé comme question : "${t.title.slice(0, 30)}..."`
    )
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
  private narrativeInstructions: string[] = []

  constructor(config: VideoGeneratorConfig, seriesContext: SeriesContext) {
    super(config)
    this.seriesContext = seriesContext
    console.log('[CONTEXTUAL_SERIE_CONTEXT_CONTEXT]', seriesContext)
    // Automatic final episode detection
    const instructions = [
      `Génère l'Épisode nº${this.seriesContext.episodeNumber}${this.seriesContext.totalEpisodes ? ` sur ${this.seriesContext.totalEpisodes}` : ''} de la saga : "${this.seriesContext.videoGenre || 'Horreur Historique'}".`
    ]

    if (this.seriesContext.currentEpisodePitch) {
      instructions.push(
        `🚨 MISSION NARRATIVE (PLAN REÇU) : Suivez ce pitch : "${this.seriesContext.currentEpisodePitch}".`
      )
    } else if (!this.seriesContext.isFinalEpisode && this.seriesContext.episodeNumber > 1) {
      instructions.push(
        `🚨 MISSION NARRATIVE (IMPROVISATION DIRIGÉE) : Le plan initial est épuisé. Vous DEVEZ improviser une suite logique en exploitant les mystères non résolus (@unresolvedThreads). Maintenez la tension sans conclure prématurément.`
      )
    }

    if (this.seriesContext.totalEpisodes && this.seriesContext.episodeNumber >= this.seriesContext.totalEpisodes) {
      this.seriesContext.isFinalEpisode = true
    }

    // Narrative Pacing Sentinel (Project Sequel - V42)
    const currentEp = this.seriesContext.episodeNumber
    const totalEp = this.seriesContext.totalEpisodes || 10
    const progress = currentEp / totalEp
    const isSequel = currentEp > totalEp

    let phaseInstruction = ''
    if (isSequel) {
      phaseInstruction = `🌀 MODE SÉQUELLE / NOUVEAU CYCLE : Vous avez dépassé la fin prévue. RELANCEZ l'intrigue avec un nouvel Arc. Introduisez une menace résurgente, un saut dans le temps ou un changement de paradigme. Le monde a changé, montrez-le.`
    } else if (progress <= 0.25) {
      phaseInstruction = `🔹 PHASE 1 (SETUP) : Établissez le monde et les enjeux. INTERDICTION de résoudre l'intrigue principale. Introduisez au moins 2 nouveaux mystères ou personnages intrigants.`
    } else if (progress <= 0.75) {
      phaseInstruction = `🔹 PHASE 2 (ESCALADE) : La situation DOIT s'aggraver. Enchaînez les complications. Évitez toute victoire définitive. Si une solution semble proche, introduisez un obstacle imprévu ou une trahison.`
    } else if (progress < 1) {
      phaseInstruction = `🔹 PHASE 3 (CLIMAX) : On approche de la fin. Les fils narratifs commencent à se croiser. La tension est à son maximum. Le cliffhanger DOIT être de type 'péril' ou 'révélation' majeure.`
    } else {
      phaseInstruction = `🏆 PHASE FINALE (RÉSOLUTION) : Concluez les intrigues majeures de ce cycle. Focus sur l'impact émotionnel. 🚨 GRAINE DE SUITE : Laissez un infime indice "post-générique" suggérant qu'une menace plus grande sommeille encore.`
    }
    instructions.push(phaseInstruction)

    // Anti-Looping / Mandatory Hooks
    const threadCount = this.seriesContext.unresolvedThreads?.length || 0
    if (threadCount < 2 && !this.seriesContext.isFinalEpisode) {
      instructions.push(
        `🚨 ALERTE NARRATIVE : Trop peu de mystères actifs. Vous DEVEZ introduire un NOUVEAU fil narratif (@unresolvedThreads) ou une découverte énigmatique dans cet épisode.`
      )
    }

    if (currentEp > 3 && threadCount > 0 && !this.seriesContext.isFinalEpisode) {
      instructions.push(
        `🧩 COMPLEXITÉ : Un des secrets existants doit s'épaissir. Ce qu'on croyait savoir est remis en question par un nouvel élément de lore.`
      )
    }

    this.narrativeInstructions = instructions
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
      "charactersId": ["@Sarah"],
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

    const bridgeInstruction = cliffhangerBridgeInstruction(
      this.seriesContext.lastCliffhanger,
      this.seriesContext.episodeNumber,
      this.seriesContext.lastEpisodeFinalScene
    )

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
      ? `\n\n🚨 PRÉPARATION DES TWISTS FUTURS (SEEDING) :\n${this.seriesContext.seedingHints.join('\n')}\nSemez des indices subtils pour préparer ces événements sans les révéler totalement.`
      : ''

    return {
      pass1: {
        system: `Vous êtes un scénariste de séries expert en binge-watching et en narration épisodique.
      Episode N° ${this.seriesContext.episodeNumber}.
      RÔLE NARRATIF : ${
        this.seriesContext.episodeNumber === 1
          ? 'ACTE 1 (DÉCOMPRESSION/DÉPART)'
          : this.seriesContext.isFinalEpisode
            ? 'ACTE 3 (RÉSOLUTION FINALE)'
            : `ACTE 2 (DÉVELOPPEMENT/INTENSIFICATION - Épisode ${this.seriesContext.episodeNumber})`
      }
      Tâche: Écrire la narration de l'épisode ${this.seriesContext.episodeNumber}.

      🚨 DIRECTIVE NARRATIVE PRIORITAIRE (PHASE ACTUELLE) :
      ${this.narrativeInstructions.join('\n')}

      CONTEXTE GLOBAL (BIBLE) :
      ${this.seriesContext.globalContext || 'Pas de bible spécifiée.'}

      REGISTRE DES PERSONNAGES (Canon) :
      ${
        Object.entries(characterRegistry)
          .map(
            ([name, data]) =>
              `• ${name}: ${data.description} (Motivation: ${data.motivation || 'N/A'}, But: ${data.personalGoal || 'N/A'}, Statut: ${data.status || 'alive'})`
          )
          .join('\n') || 'Aucun personnage récurrent défini.'
      }

      REGISTRE DES LIEUX (Canon) :
      ${
        Object.entries(this.seriesContext.locationRegistry || {})
          .map(([name, data]) => {
            const normalized = SeriesVideoGenerator.normalizeId(name)
            const evol = (this.seriesContext.visualEvolution as any)?.[normalized]
            const stateText = evol ? ` [ÉTAT ACTUEL : ${typeof evol === 'string' ? evol : evol.state}]` : ''
            return `• ${name}: ${data.description}${stateText}`
          })
          .join('\n') || 'Aucun lieu récurrent défini.'
      }

      REGISTRE DES ENTITÉS & MONSTRES (Canon) :
      ${
        Object.entries(this.seriesContext.assetRegistry || {})
          .map(([name, data]) => {
            const normalized = SeriesVideoGenerator.normalizeId(name)
            const evol = (this.seriesContext.assetEvolution as any)?.[normalized]
            const stateText = evol ? ` [ÉTAT ACTUEL : ${typeof evol === 'string' ? evol : evol.state}]` : ''
            return `• ${name} [${data.type || 'entité'}]: ${data.description}${stateText}`
          })
          .join('\n') || 'Aucune entité récurrente définie.'
      }

      ÉPISODES PRÉCÉDENTS :
      ${this.seriesContext.previousEpisodesContext || 'Premier épisode.'}

      BIAIS DE RÉCENCE (ANCRE CRITIQUE) :
      ${
        this.seriesContext.lastEpisodeSummary
          ? `L'épisode immédiatement précédent (N-1) s'est terminé sur ces événements : "${this.seriesContext.lastEpisodeSummary}". C'est votre point de départ logique et émotionnel ABSOLU.`
          : 'N/A'
      }

      DIRECTIVES DE CONTINUITÉ :${bridgeInstruction}${threadsInstruction}${seedingInstruction}${closedStakesInstruction}${deadCharacters ? `\n\nPERSONNAGES MORTS (ANTI-RÉSURRECTION) :\n${deadCharacters}` : ''}${forbiddenInstruction}

      🏗️ RÈGLES DE RIGUEUR NARRATIVE ET CAUSALITÉ :
      1. PERSISTANCE DU MONDE : Si un objet ou lieu est marqué comme 'DÉTRUIT' ou 'ENDOMMAGÉ' dans les registres, cela DOIT être maintenu visuellement et narrativement. Interdiction de "réparer" sans une action explicite.
      2. LOGIQUE DES CONSÉQUENCES : Chaque action majeure (explosion, incendie, vol) doit avoir des répercussions durables sur l'environnement.
      3. CAUSALITÉ VISUELLE : Si un personnage a perdu son chapeau à la scène 4, il ne doit pas l'avoir à la scène 5.
      4. COHÉRENCE ÉMOTIONNELLE : Les personnages DOIVENT réagir avec une intensité proportionnelle aux enjeux (Peur viscérale si mort imminente, Joie éclatante si retrouvailles).

      RÈGLES D'OR DE NARRATION :
      • INTERDICTION ABSOLUE : Ne créez aucun personnage absent du characterRegistry. Si la narration nécessite un allié, utilisez un personnage existant ou laissez le rôle anonyme.
      • LISTES AUTORISÉES (ID FIXES) : 
        - PERSONNAGES : ${authorizedCharacters}
        - LIEUX : ${Object.keys(this.seriesContext.locationRegistry || {}).join(', ') || 'Aucun lieu défini (Déclarer via newLocations)'}
      • SOUDURE DE CONTINUITÉ DIRECTE (ARC N → ARC N+1) [CRITIQUE] : La Scène 1 du premier épisode d'un Arc DOIT commencer par justifier la survie ou la suite immédiate du cliffhanger de l'Arc précédent. INTERDICTION de sauter le 'Comment avons-nous survécu ?' (ex: "Le flash de la Brèche nous avait projeté au sol, mais les ombres semblaient avoir reculé...").
      • PERSISTANCE DES MENACES ACTIVES : Si des ennemis (ex: silhouettes) étaient présents à la fin de l'épisode précédent, ils DOIVENT être mentionnés, combattus ou leur fuite justifiée.
      • HÉRITAGE DE L'ÉTAT PHYSIQUE : Les personnages conservent les séquelles immédiates (essoufflement, blessures, entraves) de la scène finale précédente.
      • TRANSFERT D'IMPULSION (PONT N → N+1) : La Scène 1 de l'épisode N+1 DOIT commencer par une phrase qui justifie l'action à partir du cliffhanger. INTERDICTION de sauter le 'Pourquoi' du déplacement.
      • SOUDURE DES OUTILS (ASSET PERSISTENCE) : Si un personnage utilisait un outil (ex: ordi/data) à l'épisode N et un autre (ex: inscriptions) à l'épisode N+1, créez un lien logique (ex: "Les inscriptions confirmaient ses calculs").
      • PERSISTANCE DES ANOMALIES : Si un concept fort (ex: distorsions temporelles) est introduit, il DOIT être maintenu ou intensifié tant qu'il n'est pas résolu.
      • PAYOFF DU CLIFFHANGER : Tout élément spécifique (ex: une silhouette, un cri) du cliffhanger précédent DOIT être adressé nominativement dans les scènes 1 ou 2.
      • IDENTITÉS CANON (OBLIGATOIRE) : Utilisez EXCLUSIVEMENT les personnages du registre (ex: @Elias). Il est STRICTEMENT INTERDIT d'inventer de nouveaux héros ou de renommer les existants par des noms génériques (ex: @Kael).
      • GARDE-FOU D'IDENTITÉ (PASS 2) : Si un héros a été renommé par erreur dans la narration, restaurez son identité d'origine du registre lors de la structuration.
      • SYNERGIE DES ENJEUX (MANDATORY) : Interdiction de créer un enjeu "nouveau" pour résoudre la série. Utilisez EXCLUSIVEMENT les 'unresolvedStakes' déjà listés.
      • RÉUNION TOUS-AZIMUTS (MÉMOIRE) : En cas de scène de victoire/paix, TOUS les personnages marqués 'ALIVE' dans le registre (y compris la famille libérée précédemment) DOIVENT être présents visuellement ou mentionnés nominativement.
      • LOGIQUE DES VESTIGES : Si l'antagoniste principal est mort, nommez explicitement les geôliers restants (ex: "Les mercenaires abandonnés par le @Baron") pour éviter le flou.
      • PRÉSENCE ACTIVE NOMINATIVE : Chaque personnage du 'characterRegistry' (Vivant) DOIT accomplir une action ou ligne de dialogue NOMMÉE.
      • RÉSOLUTION DES ENJEUX À L'ÉCRAN : Tout enjeu dans 'unresolvedStakes' DOIT être montré lors de sa résolution.
      • PAYOFF RELATIONNEL : Les relations (Romance/Rivalité) DOIVENT trouver une conclusion explicite (serment, adieu).
      • BANNIR LE VAGUE (FINALE) : Décrivez l'état final précis de CHAQUE héros.
      • LEGACY AUDIT (OBLIGATOIRE) : Récapitulez les 3 plus anciens fils narratifs actifs.
      • LORE GUARD (STABILITÉ TERMINOLOGIQUE) : Inviolabilité des termes d'origine (ex: 'Les Plaines').
      • HÉRITAGE ÉMOTIONNEL & SENSORIALITÉ : Reprenez les personnages exactement dans l'état émotionnel où ils étaient. S'ils étaient en plein conflit, la tension doit être palpable dès la première seconde.
      • ÉMOTION CARACTÉRISÉE : Interdiction du neutre lors de moments critiques. Utilisez des verbes d'action expressifs ("Hurle de joie", "S'effondre de terreur").
      • RÈGLE DE LA RÉACTION VISCÉRALE (PONT SÉMANTIQUE) : La première phrase de l'épisode N+1 ne peut pas être un constat ("Ils étaient coincés"). Elle doit être une réaction physique ou sensorielle immédiate ("Le souffle d'Énéas se bloqua alors que l'ombre avançait...").
      • SOUDURE INVISIBLE (FLUIDITÉ TOTALE) : Entre l'épisode N et N+1, il ne doit y avoir AUCUN saut de ton. L'épisode N+1 est la suite organique du dernier souffle de l'épisode N.
      • FAUSSE RÉSOLUTION (OBLIGATOIRE) : Entre la scène 3 et 5, inclure un moment où le personnage croit avoir résolu le problème principal — avant une aggravation inattendue. C'est le coeur du ressort addictif.
      • CURIOSITÉ EN ESCALIER : Ouvrez de nouvelles questions à chaque fois que vous fermez une ancienne. Le ratio doit être 1 réponse pour 2 nouvelles questions.
      • LIEUX : Réutilisez les lieux du registre pour créer un sentiment de familiarité. Décrivez-les avec constance en incluant leur ÉTAT ACTUEL (ex: "La chapelle dévastée").
      • PERSONNAGES : Respectez scrupuleusement les traits de personnalité et les descriptions physiques du registre.
      • PROTOCOLE VISUAL DNA (CRITICAL) : Lorsque vous décrivez une scène, donnez la priorité au cadrage, à l'action et à l'expression émotionnelle. NE RÉ-DÉCRIVEZ PAS minutieusement les traits du visage s'ils sont déjà dans le registre. Utilisez des ancres comme "Expression de [Emotion]" pour laisser le modèle de référence faire son travail.
      • ANTI-RÉSURRECTION (ABSOLU) : Si un personnage est 'DEAD', il le reste.
      • RÈGLE DU COÛT DE LA VICTOIRE : La défaite d'un grand antagoniste laisse une cicatrice permanente.
      • SEEDING ÉMOTIONNEL : Préparation des twists par un HINT au moins 2 épisodes avant.
      • ANTI-LOOPING : Interdiction de répéter un dilemme. Une fois tranché, il est acquis.
      • FAITS IRRÉVERSIBLES : Chaque épisode ajoute un fait permanent au registre.
      • CAUSALITÉ MONDIALE : Tout élément détruit reste détruit.
      • GENRE GUARD (STRICT) : Respectez scrupuleusement les 'genreConstraints'. L'univers est immuable.
      • KNOWLEDGE MEMORY : Les personnages ne réagissent pas à une info connue comme nouvelle.
      • EXPOSITION MONDIALE (OBLIGATOIRE) : Le premier épisode de chaque Arc DOIT s'ouvrir sur une description visuelle riche de l'environnement global. Tout objet central (ex: relique) introduit doit être décrit précisément.
      • RÉVÉLATIONS (SHOW DON'T TELL) : Toute découverte sur un objet ou un mystère doit être PROUVÉE par une action ou un effet visuel, pas seulement affirmée par un personnage.
      • ÉQUILIBRE D'ACTION (MAPPING NOMINATIF) : Chaque personnage majeur du registre DOIT effectuer au moins une action décisive ou une ligne de dialogue qui fait progresser l'intrigue. Pas de personnages 'spectateurs' ou passifs.
      • STRICTEST CHARACTER ANCHOR : Il est strictement interdit de mentionner, d'évoquer ou de faire apparaître tout personnage absent du characterRegistry (@characterRegistry).
      • ASSET PERSISTENCE & TRANSITION : Si un objet est marqué comme 'perdu' ou 'cherché' dans le registre, il ne peut PAS apparaître subitement dans la main d'un personnage.
      • SOUDURE DE SURVIE (ANTI-MIRACLE) : Si le cliffhanger précédent plaçait un personnage en péril mortel, la Scène 1 DOIT expliquer rationnellement la survie.
      • ANTI-LOOPING CLIFFHANGER : INTERDICTION de répéter un cliffhanger déjà utilisé.
      • RÈGLE DES SECRETS (PÉREMPTION) : Tout mystère majeur DOIT avoir un payoff partiel après 2 épisodes et un payoff TOTAL après 4 épisodes.
      • PONT NARRATIF (CRITIQUE) : Plongez directement dans l'action (In Media Res). La première phrase doit être la suite sémantique et visuelle directe du cliffhanger.
      • FOUNDATIONAL HOOKS : Tout élément dramatique introduit à l'Épisode 1 est SACRÉ.
      • RECURSIVE LORE : Les mystères sur les personnages doivent progresser par RÉVÉLATIONS SUCCESSIVES.
      • SYMBOLIC LANDMARKS : Les lieux marqués symboliquement ne doivent pas disparaître.
      `,
        user: `${missionBlock}DÉTAILS DE L'ÉPISODE : ${topic || options.episodeSummary || 'Générez la suite logique de la saga en vous basant sur le cliffhanger précédent.'}\nCible : ${target} mots.`,
        targetWords: target
      }
    }
  }

  // ─── Pass 2: Structuring system prompt ─────────────────────────────────────

  protected buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)
    const lastScene = this.seriesContext.lastEpisodeFinalScene
    const ch = this.seriesContext.lastCliffhanger

    let prompt = `
🚨 DIRECTIVE NARRATIVE PRIORITAIRE :
${this.narrativeInstructions.join('\n')}

`
    prompt += '\n\n🆘 TRANSITION VS CAMERA ACTION (STRICT) : '
    const cliffhangerContext = ch
      ? typeof ch === 'string'
        ? `Dernier Cliffhanger (À RÉSOUDRE OU ÉVOLUER): ${ch}`
        : `Dernier Cliffhanger [${(ch as TypedCliffhanger).type.toUpperCase()}]: ${(ch as TypedCliffhanger).description}`
      : 'Aucun cliffhanger précédent.'

    const lastTease = this.seriesContext.nextEpisodeTease || 'Aucun teasing spécifique.'
    const lastQuestion =
      typeof this.seriesContext.lastCliffhanger === 'object'
        ? this.seriesContext.lastCliffhanger.audienceQuestion
        : 'Aucune question spécifique.'

    const seriesSpec: VideoTypeSpecification = {
      ...spec,
      goals: spec.goals,
      task: `${spec.task}
      
🚨 ATTENTION CRITIQUE : 
1. Vous DEVEZ impérativement inclure l'objet "seriesMetadata" à la fin de votre réponse JSON. Sans ce bloc, la série sera corrompue.
2. EXPULSION NARRATIVE (STRICT) : Si un personnage est enlevé (kidnappé), tué, ou s'enfuit de la scène, il DOIT être IMMÉDIATEMENT retiré de la liste 'charactersInScene' (et donc 'charactersId') pour toutes les scènes suivantes où il n'est plus présent physically. Ne laissez PAS de 'fantômes' visuels.
3. DISTINCTION VISUEL VS NARRATION : Si la narration parle d'une personne (@Maya) mais qu'elle n'est pas physiquement présente dans la scène, vous ne devez PAS l'ajouter dans 'charactersId'. Sa mention dans 'fullNarration' suffit. 'charactersId' est réservé STRICTEMENT à la présence physique visible.
4. ÉVOLUTION NARRATIVE (@characterEvolution) : Si un personnage change de statut (meurt, devient un traître, est blessé) même s'il n'est pas présent visuellement, vous devez l'enregistrer dans 'characterEvolution' pour assurer la continuité.
Schéma attendu :
{
  "seriesMetadata": {
    "episodeSummary": "Promesse narrative de suite.",
    "cliffhanger": { "type": "revelation | peril | choice | betrayal", "description": "...", "audienceQuestion": "..." },
    "characterContinuity": { "@Nom": { "description": "...", "isNew": false } },
    "locationContinuity": { "LieuID": { "description": "...", "isNew": false } },
    "nextEpisodeTease": "Question CONCRÈTE avec NOM PROPRE (Ex: 'Maya survivra-t-elle au Baron ?'). INTERDICTION de phrases vagues.",
    "unresolvedThreads": [
      { 
        "id": "T1",
        "title": "Question?", 
        "status": "open | partial | resolved", 
        "description": "Expliquez l'évolution ou la résolution finale ici." 
      }
    ],
    "assetEvolution": { "@Objet": "Nouvel état" },
    "visualEvolution": { "@Nom": "État visuel" },
    "characterEvolution": { "@Nom": "Statut narratif (ex: Mort, Traître, Allié)" },
    "newCharacters": { "@Nom": "Description physique détaillée" },
    "newLocations": { "LieuID": "Description visuelle (Ambiance, Lumière, Matériaux)" },
    "continuityAnalysis": {
      "soudureBrute": "Notez tout saut temporel ou spatial illogique (ex: Lars qui se téléporte du puits à la rivière alors que l'épisode précédent finissait au puits).",
      "logicGap": "Identifiez les décisions trop abruptes ou illogiques.",
      "threatVagueness": "Signalez si les ennemis/menaces sont trop vagues (Manque de définition).",
      "pacingIssue": "Signalez les scènes d'action 'télescopées' ou résolues trop vite.",
      "promesseNonTenue": "Si l'attente de l'épisode précédent n'a pas été traitée.",
      "filsMuets": ["Enjeux oubliés."],
      "defects": ["Autres incohérences."]
    },
    "loreUpdates": ["Points de chronologie, de géographie ou de lore à graver dans la bible."]
  },
  "titles": ["Titre accrocheur de l'épisode correspondant à l'intrigue"],
  "fullNarration": "...",
  "scenes": [
    {
      "id": "scene-1",
      "summary": "...",
      "narration": "...",
      "locationId": "...",
      "charactersInScene": ["@Nom"],
      "emotionalTokens": { "@Nom": ["Emotion"] },
      "relationshipMap": { "@A": { "@B": "Relation" } },
      "spatialAnchor": "Description physique du lieu précis",
      "visualEvolution": { "@Objet": "Nouvel état" },
      "imagePrompt": "...",
      "cameraAction": [{ "type": "...", "intensity": "..." }],
      "preset": "...",
      "transition": "...",
      "persistentDecorTokens": ["..."]
    }
  ]
}`,
      context: `[STRUCTURATION SAGA N°${this.seriesContext.episodeNumber}] 
${cliffhangerContext}
ATTENTE PRÉCÉDENTE (PROMESSA) : "${lastTease}"
QUESTION DU PUBLIC À RÉSOUDRE : "${lastQuestion}"
FILS NARRATIFS ACTIFS (AUDIT OBLIGATOIRE PAR ID - T1, T2, etc.) : ${
        this.seriesContext.unresolvedThreads?.length
          ? this.seriesContext.unresolvedThreads
              .map((t, i) => {
                const id = t.id || `T${i + 1}`
                return `[${id}] (${t.status.toUpperCase()}) ${t.title}: ${t.description}`
              })
              .join(' ; ')
          : 'Aucun.'
      }
DETTES DE CONTINUITÉ À VÉRIFIER : ${this.seriesContext.continuityDebts?.length ? this.seriesContext.continuityDebts.join(' ; ') : 'Aucune.'}
PONT VISUEL OBLIGATOIRE : ${
        this.seriesContext.lastEpisodeFinalScene
          ? `L'épisode précédent s'est terminé sur : "${this.seriesContext.lastEpisodeFinalScene.summary}". 
       DÉTAILS TECHNIQUES POUR LA SCÈNE 1 (In Media Res) :
       - Image de référence : ${this.seriesContext.lastEpisodeFinalImage || 'Non disponible'}
       - Prompt visuel précédent : "${this.seriesContext.lastEpisodeFinalScene.imagePrompt}"
       - Jetons de Décor : ${this.seriesContext.lastEpisodeFinalScene.persistentDecorTokens?.join(', ') || 'Standard'}
       - Emplacement précis : ${this.seriesContext.lastEpisodeFinalScene.locationId}
       - État émotionnel : ${JSON.stringify(this.seriesContext.lastEpisodeFinalScene.emotionalTokens || {})}
       - Interactions en cours : "${this.seriesContext.lastEpisodeFinalScene.interactions || 'Aucune'}"
       - Personnages présents : ${this.seriesContext.lastEpisodeFinalScene.charactersId?.join(', ') || 'Inconnu'}
       La première scène de ce NOUVEL ÉPISODE doit être la suite immédiate et indissociable de cet état.`
          : 'Aucun (Premier épisode).'
      }
REGISTRE DES PERSONNAGES : ${
        Object.entries(this.seriesContext.characterRegistry || {})
          .map(([name, data]) => `${name}: ${data.description}`)
          .join(' | ') || 'Aucun.'
      }
REGISTRE DES ASSETS PROPRES : ${
        Object.entries(this.seriesContext.assetRegistry || {})
          .map(([name, data]) => `${name}: ${data.description}`)
          .join(' | ') || 'Aucun.'
      }
LORE BIBLE : ${this.seriesContext.globalContext || 'Vide.'}`,
      instructions: [
        ...(spec.instructions || []),
        'RÈGLE DE SOUDURE : Les premières secondes DOIVENT résoudre le cliffhanger précédent.',
        "SONDAGE ÉMOTIONNEL : Chaque scène DOIT obligatoirement avoir des 'emotionalTokens' pour les personnages présents (min. 2 jetons par perso) ET une description d'expression faciale intense dans 'imagePrompt'.",
        "DENTISTÉ CINÉMATOGRAPHIQUE : Décrivez avec précision la position des personnages et objets dans 'spatialAnchor'.",
        "STABILITÉ VISUELLE : Utilisez 'visualEvolution' et 'assetEvolution' pour traquer les changements permanents (ex: 'destroyed', 'scarred').",
        "PROTOCOLE VISUAL DNA (IMPORTANT) : Dans 'imagePrompt', NE RÉ-DÉCRIVEZ PAS les visages des personnages du registre. Limitez-vous à leur EXPRESSION (peur, colère, rire) et à leur ACTION pour garantir la stabilité via les portraits de référence.",
        'LOGIQUE CAUSALE : Vérifiez que chaque objet et lieu est dans son état correct (persistance de la destruction/évolution).',
        "TEASING PRÉCIS : Le 'nextEpisodeTease' doit bannir le vague. Soyez spécifique.",
        "LORE GUARD : Si vous introduisez une date (ex: 1487) ou un nom de région (ex: Lorraine), vous DEVEZ l'ajouter dans 'loreUpdates' pour qu'il devienne canon.",
        "EPISODE TITLE : Le premier titre dans la liste 'titles' DOIT être un titre accrocheur, dramatique et spécifique à l'intrigue de CET épisode (ex: 'Le Secret de la Crypte', 'L'Ombre du Passé'). Évitez les titres génériques comme 'Épisode 2'."
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
            preset: 'sequel_reprise',
            minWords: hookWords + introWords,
            minSentences: 3,
            description: "Reprise immédiate du cliffhanger et suite de l'action."
          },
          ...remainingStructure
        ] as any
      }
    }

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
    )}\n\nNARRATION ÉPISODE ${this.seriesContext.episodeNumber} (JSON) :\n---\n${validatedNarration}\n---\n\n${
      this.seriesContext.isFinalEpisode
        ? '⚠️ ÉPISODE FINAL : Ne laissez aucune question sans réponse. Résolution totale de chaque unresolvedThread.'
        : '⚠️ RAPPEL ADDICTIF : Vérifiez que la fausse résolution est présente (scènes 3-5), que le cliffhanger est typé, et que les unresolvedThreads sont des questions actives.'
    }\nTÂCHE : Découpe en scènes JSON valides. SEQUEL MODE ACTIVE : Scene 1 MUST be a sequel reprise.
      
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
    const instructions = []
    if (this.seriesContext.roadmap) {
      const rm = this.seriesContext.roadmap
      instructions.push(
        `--- NARRATIVE ROADMAP ---`,
        `Phase actuelle : ${rm.currentPhase || 'Intro'}`,
        `Objectifs : ${rm.objectives?.join(', ') || 'Inconnus'}`,
        rm.irreversibleFacts?.length
          ? `FAITS IRRÉVERSIBLES : ${rm.irreversibleFacts.join('; ')} (INTERDICTION DE CONTRADIRE)`
          : '',
        rm.pendingChoices?.length ? `PROGRES DU CHOIX : ${rm.pendingChoices.join(', ')}` : '',
        rm.watchpoints?.length ? `POINTS DE VIGILANCE : ${rm.watchpoints.join(', ')}` : ''
      )
    }

    if (this.seriesContext.unresolvedThreads?.length) {
      instructions.push(
        `--- FILS NARRATIFS ACTIFS ---`,
        ...this.seriesContext.unresolvedThreads.map((t) => `- [${t.status.toUpperCase()}] ${t.title}: ${t.description}`)
      )
    }

    instructions.push(`---`)

    this.config.systemPrompt = `
${this.config.systemPrompt}
${instructions.join('\n')}
`
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

    // ─── 1. Primary Subject (Narration/Action) ─────────────────────────────────
    const subject = (scene.imagePrompt || scene.summary || '').trim()

    // ─── 2. Spatial & Environmental Context ────────────────────────────────────
    let spatialContext = ''
    if (scene.spatialAnchor) {
      spatialContext += `[ANCRE SPATIALE: ${scene.spatialAnchor}] `
    }

    if (scene.locationId) {
      const locationRegistry = this.seriesContext.locationRegistry || {}
      const loc = SeriesVideoGenerator.findInRegistry(locationRegistry, scene.locationId)
      if (loc) {
        const referenceMark = hasLocationReference ? 'REFERENCE VISUELLE ACTIVE (ANKER)' : 'RÉFÉRENCE TEXTUELLE'
        const locDesc = (loc as any).description || (loc as any).atmosphere || ''
        spatialContext += `LIEU : ${SeriesVideoGenerator.normalizeId(scene.locationId)} (${referenceMark}). ${locDesc}. `

        if ((loc as any).thumbnailUrl && !spatialContext.includes('COMPOSITION IDENTIQUE')) {
          spatialContext += `Maintenez la cohérence absolue avec le décor établi de ${scene.locationId} (Style, Lumière, Matériaux). `
        }
      }
    }

    // ─── 3. Narrative Continuity & Sequel Logic ───────────────────────────────
    let continuityContext = ''
    const previousScene = isFirstScene ? this.seriesContext.lastEpisodeFinalScene : (memory as any)?.previousScene

    if (previousScene) {
      const isSequelBridge = isFirstScene && this.seriesContext.episodeNumber > 1
      const isInternalSequence = !isFirstScene && scene.continueFromPrevious

      if (isSequelBridge || isInternalSequence) {
        continuityContext += `CONTINUATION DIRECTE DE LA SCÈNE PRÉCÉDENTE : ${previousScene.summary || previousScene.imagePrompt}. `

        if (previousScene.persistentDecorTokens && previousScene.persistentDecorTokens.length > 0) {
          const label = isSequelBridge ? 'épisode précédent' : 'scène précédente'
          continuityContext += `Lumière et Ambiance héritées de la ${label}: ${previousScene.persistentDecorTokens.join(', ')}. `
        }

        const refLabel = isSequelBridge ? 'Sequel Bridge (ZÉRO DRIFT)' : `Scene ${previousScene.id}`
        const fidelityInstruction = isSequelBridge
          ? "⚠️ FIDÉLITÉ ABSOLUE : Cette scène est la reprise directe de l'épisode précédent. Utilisez l'image de référence comme point de départ IMMUABLE."
          : 'Maintenez le placement spatial exact des personnages et des éléments du décor.'

        continuityContext += `Reference (${refLabel}). ${fidelityInstruction} COMPOSITION IDENTIQUE. `

        // Track background presences (characters/assets not actively in narration but still there)
        const previousCast = previousScene.charactersId || previousScene.charactersInScene || []
        const currentCast = scene.charactersId || scene.charactersInScene || []
        const silentPresence = previousCast.filter((id: string) => !currentCast.includes(id))

        const registryAssets = Object.keys(this.seriesContext.assetRegistry || {})
        const prevText = (previousScene.summary || previousScene.imagePrompt || '').toLowerCase()
        const currText = (scene.summary || scene.imagePrompt || '').toLowerCase()
        const silentAssets = registryAssets.filter(
          (name) => prevText.includes(name.toLowerCase()) && !currText.includes(name.toLowerCase())
        )

        if (silentPresence.length > 0 || silentAssets.length > 0) {
          const presence = [...silentPresence, ...silentAssets]
          continuityContext += `[Background presence - Personnages et objets en arrière-plan] ${presence.join(', ')}. `
        }
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

    // ─── 6. Identity Locking (Characters & Assets) ──────────────────────────────
    const characterMatches = scene.charactersId || scene.charactersInScene || []
    const characterRegistry = this.seriesContext.characterRegistry || {}
    for (const name of characterMatches) {
      const char = SeriesVideoGenerator.findInRegistry(characterRegistry as any, name)
      if (char) {
        const isEvolving = (char as any).isNew === true
        paragraph = this.applyIdentityLocking(paragraph, !!hasReferenceImages && !isEvolving, {
          character: { [name]: char }
        })

        const effectiveModelId = (char as any).modelId || this.seriesContext.visualStyleModelId
        if (effectiveModelId && !paragraph.includes(effectiveModelId)) {
          paragraph += `, style reference ${effectiveModelId}`
        }
      }
    }

    const assetRegistry = this.seriesContext.assetRegistry || {}
    for (const name of Object.keys(assetRegistry)) {
      if (paragraph.toLowerCase().includes(name.toLowerCase())) {
        const asset = SeriesVideoGenerator.findInRegistry(assetRegistry as any, name)
        const isEvolving = (asset as any).isNew === true
        paragraph = this.applyIdentityLocking(paragraph, !!hasReferenceImages && !isEvolving, {
          asset: { [name]: asset }
        })
      }
    }

    // ─── 7. Composition & Camera ────────────────────────────────────────────────
    const comp = scene.composition || { shotType: 'MEDIUM' }
    const shotMap: Record<string, string> = {
      CLOSEUP: 'CLOSE-UP SHOT: Focus on face and expression.',
      MEDIUM: 'MEDIUM SHOT: Character from waist up, showing some environment.',
      WIDE: 'WIDE SHOT: Full body and environment, character in context.',
      ESTABLISHING: 'ESTABLISHING SHOT: Extreme wide view to set the location.',
      PANORAMIC: 'PANORAMIC VIEW: Ultra-wide cinematic view to capture the full scope of scenery.',
      POV: 'POV SHOT: Seen through the eyes of the character.',
      OVERSHOULDER: 'OVER-THE-SHOULDER SHOT: Looking at subject over another character shoulder.'
    }
    let shotDirective = shotMap[comp.shotType] || shotMap.MEDIUM

    if (comp.foregroundAnchor) {
      shotDirective = `${shotDirective} Foreground element: ${comp.foregroundAnchor} (blurry dirty frame).`
    }
    if (comp.lightingMood) {
      shotDirective = `${shotDirective} Lighting/Mood: ${comp.lightingMood}.`
    }
    if (comp.focusTarget) {
      shotDirective = `${shotDirective} Precise focus on ${comp.focusTarget}.`
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

    // 1. Characters in scene
    for (const name of characterMatches) {
      const evolutionData = SeriesVideoGenerator.findInRegistry(evolution as any, name)
      if (evolutionData) {
        const stateStr = typeof evolutionData === 'string' ? evolutionData : (evolutionData as any).state
        relevantEvolutions.push(`${name} (${stateStr})`)
      }
    }

    // 2. Assets (fuzzy check in prompt)
    for (const [assetName, evolutionData] of Object.entries(assetState)) {
      const stateStr = typeof evolutionData === 'string' ? evolutionData : (evolutionData as any).state
      if (
        paragraph.toLowerCase().includes(assetName.toLowerCase()) ||
        paragraph.toLowerCase().includes(SeriesVideoGenerator.normalizeId(assetName))
      ) {
        relevantEvolutions.push(`${assetName} (${stateStr})`)
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
      if (camStyle) styleStr += `Camera Technique: ${camStyle}. `
      paragraph = `Direction Artistique : ${styleStr}${paragraph}`
    }

    const layout = scene.composition?.layout || 'SINGLE'
    if (layout === 'MONTAGE' || layout === 'SPLIT' || layout === 'DIAGONAL') {
      const typeLabel = layout === 'MONTAGE' ? 'polyptych / multi-panels' : 'split-screen'
      paragraph = `COMPOSITION : ${typeLabel} separating characters. ${paragraph}`
    }

    const guards =
      'PAS DE MAIN QUI DESSINE, PAS DE STYLO, PAS DE CRAYON, PAS DE BORDURE BLANCHE, PAS DE TEXTE, PAS DE FILIGRANE. STYLE CINÉMATIQUE UNIQUEMENT.'
    paragraph = `${paragraph}. ${guards}`

    const spec = this.getEffectiveSpec({} as any)
    const finalPrompt = this.getEnrichedImagePrompt(paragraph, spec)

    return {
      sceneId: scene.id,
      prompt: finalPrompt,
      referenceImage: sequelBridgeUrl,
      reuseReferenceImage: !!sequelBridgeUrl
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

    return this.buildImageGenerationInstructions(hasReferenceImages, {
      characterDescription
    })
  }

  protected buildCharacterDescription(spec: VideoTypeSpecification, hasReferenceImages: boolean = false): string {
    const globalModelId = this.seriesContext.visualStyleModelId

    const charSection = Object.entries(this.seriesContext.characterRegistry)
      .map(([name, data]) => {
        const modelId = data.modelId || globalModelId
        return `Recurring Character "${name}"${!hasReferenceImages ? ` (${data.description})` : ''}${modelId ? ` (MODEL: ${modelId})` : ''}`
      })
      .join(', ')

    if (hasReferenceImages) {
      return charSection ? `Recalling characters from references: ${charSection}` : 'Character from reference.'
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

    if (metadata.characterContinuity) {
      for (const [name, info] of Object.entries(metadata.characterContinuity)) {
        const charInfo = info as any
        if (!updatedRegistry[name]) {
          updatedRegistry[name] = { description: charInfo.description || '' }
        } else if (charInfo.description && charInfo.isNew) {
          updatedRegistry[name].description = charInfo.description
        }
      }
    }

    if (metadata.newCharacters) {
      for (const [name, desc] of Object.entries(metadata.newCharacters)) {
        if (!updatedRegistry[name]) {
          updatedRegistry[name] = {
            description: desc as string,
            firstMentionedEpisode: currentEp
          }
        }
      }
    }

    if (metadata.locationContinuity) {
      for (const [id, info] of Object.entries(metadata.locationContinuity)) {
        const locInfo = info as any
        if (!updatedLocationRegistry[id]) {
          updatedLocationRegistry[id] = {
            description: locInfo.description || '',
            atmosphere: locInfo.atmosphere || ''
          }
        } else {
          if (locInfo.description) updatedLocationRegistry[id].description = locInfo.description
          if (locInfo.atmosphere) updatedLocationRegistry[id].atmosphere = locInfo.atmosphere

          if (locInfo.isNew) {
            console.info(`[SeriesGenerator] 🔄 Environmental evolution for ${id}. Clearing stale thumbnail.`)
            updatedLocationRegistry[id].thumbnailUrl = undefined
          }
        }
      }
    }

    if (metadata.newLocations) {
      for (const [name, desc] of Object.entries(metadata.newLocations)) {
        if (!updatedLocationRegistry[name]) {
          updatedLocationRegistry[name] = {
            description: desc as string,
            firstMentionedEpisode: currentEp
          }
        }
      }
    }

    if (metadata.newAssets) {
      for (const [name, desc] of Object.entries(metadata.newAssets)) {
        if (!updatedAssetRegistry[name]) {
          console.info(`[SeriesGenerator] ✨ New story asset discovered: ${name}`)
          updatedAssetRegistry[name] = {
            description: desc as string,
            type: 'other',
            firstMentionedEpisode: currentEp
          }
        }
      }
    }

    // --- Thread & Roadmap Updates (Project Sequel - V42) ---
    const threadRegistry = (currentContext as any).threads || (currentContext as any).unresolvedThreads || []
    const resolvedStakes = [...((currentContext as any).resolvedStakes || [])]

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
      for (const [name, data] of Object.entries(metadata.characterContinuity)) {
        const existing = SeriesVideoGenerator.findInRegistry(updatedRegistry, name)
        if (existing) {
          const charData = data as any
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
        }
      }
    }

    if (metadata.newCharacters) {
      for (const [name, desc] of Object.entries(metadata.newCharacters)) {
        const existing = SeriesVideoGenerator.findInRegistry(updatedRegistry, name)
        if (!existing) {
          // Normalize Handle if not already one
          const handle = name.startsWith('@') ? name : `@${name.replaceAll(/\s+/g, '')}`
          const key = handle.replace(/^@/, '')
          if (!updatedRegistry[key]) {
            console.info(`[SeriesGenerator] ✨ New character registered: ${handle} (Key: ${key})`)
            updatedRegistry[key] = { description: desc as string, isNew: true }
          }
        }
      }
    }

    if (metadata.newLocations) {
      for (const [name, desc] of Object.entries(metadata.newLocations)) {
        if (!updatedLocationRegistry[name]) {
          console.info(`[SeriesGenerator] 📍 New location registered: ${name}`)
          updatedLocationRegistry[name] = { description: desc as string }
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

    const warnings = validateThreadsAsQuestions(finalThreads)
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

    const updatedResolvedStakes = [...(currentContext.resolvedStakes || [])]
    if (metadata.cliffhanger) {
      updatedResolvedStakes.push({
        title: typeof metadata.cliffhanger === 'string' ? metadata.cliffhanger : metadata.cliffhanger.description,
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
          const charsInScene = scene.charactersId || []
          if (
            fullText.includes(charPattern) ||
            charsInScene.some((id: string) => id.toLowerCase().replace('@', '') === charPattern)
          ) {
            charAny.originSceneId = scene.id
            charAny.originEpisode = currentEp
          }
        }
      }

      const charIds = scene.charactersId || scene.charactersInScene || []
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
      resolvedStakes,
      previousEpisodesContext: `${currentContext.previousEpisodesContext || ''}\n${episodeHistory}`.trim(),
      globalContext: updatedGlobalContext,
      episodeNumber: nextEp,
      lastCliffhanger: nextCliffhanger,
      visualStyleModelId: currentContext.visualStyleModelId,
      seedingHints: seedingHints.length ? seedingHints : undefined,
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

  private static normalizeId(id: string): string {
    return id
      .toLowerCase()
      .trim()
      .replace(/^@/, '')
      .replaceAll(/[\s\-_]+/g, ' ')
  }

  public static findInRegistry<T>(registry: Record<string, T>, targetId: string): T | undefined {
    if (!targetId) return undefined

    // 1. Precise direct match
    if (registry[targetId]) return registry[targetId]

    // 2. Normalize and check for handle matches
    const normalizedTarget = SeriesVideoGenerator.normalizeId(targetId)

    // Handle is usually the first name or a slugified version
    const targetSlug = normalizedTarget.replaceAll(/\s+/g, '')

    for (const [key, value] of Object.entries(registry)) {
      const normalizedKey = SeriesVideoGenerator.normalizeId(key)
      const keySlug = normalizedKey.replaceAll(/\s+/g, '')

      // Full Match (Case/Handle insensitive)
      if (normalizedKey === normalizedTarget) return value

      // Slug Match (e.g., "VictorLeclerc" === "VictorLeclerc")
      if (keySlug === targetSlug) return value

      // Partial Match: Handle in Full Name (e.g., "@Victor" in "Victor Leclerc")
      if (normalizedKey.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedKey)) {
        return value
      }

      // Check fullName field if exists (T is likely character object)
      const valAny = value as any
      if (valAny.fullName) {
        const normalizedFullName = SeriesVideoGenerator.normalizeId(valAny.fullName)
        if (normalizedFullName === normalizedTarget || normalizedFullName.startsWith(normalizedTarget)) {
          return value
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
