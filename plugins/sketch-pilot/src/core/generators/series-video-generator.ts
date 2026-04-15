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
    prompt += `\n    * charactersInScene : [${(lastScene.charactersInScene || []).join(', ')}]`
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
  public seriesContext: SeriesContext
  private narrativeInstructions: string[] = []

  constructor(config: VideoGeneratorConfig, seriesContext: SeriesContext) {
    super(config)
    this.seriesContext = seriesContext
    //console.log('[CONTEXTUAL_SERIE_CONTEXT_CONTEXT]', seriesContext)
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

      ÉPISODES PRÉCÉDENTS :
      ${this.seriesContext.previousEpisodesContext || 'Premier épisode.'}

      REGISTRE DES PERSONNAGES (Canon) :
      ${
        Object.entries(characterRegistry)
          .map(([name, data]) => {
            const attributes = []
            if (data.backstory) attributes.push(`Infos : ${data.backstory}`)
            if (data.abilities?.length) attributes.push(`Capacités : ${data.abilities.join(', ')}`)
            if (data.knownFacts?.length) attributes.push(`Faits établis : ${data.knownFacts.join(', ')}`)
            if (data.fate) attributes.push(`Destin : ${data.fate}`)

            const attrText = attributes.length ? ` | ${attributes.join(' | ')}` : ''
            return `• ${name}: (Motivation: ${data.motivation || 'N/A'}, But: ${data.personalGoal || 'N/A'}, Statut: ${data.status || 'alive'})${attrText}`
          })
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

      🎨 GUIDE DE STYLE VISUEL (DNA DE LA SAGA) :
      Style organique basé sur les références fournies.
      ⚠️ RÈGLE D'OR VISUELLE : La narration de cet épisode DOIT rester 100% cohérente avec les références visuelles passées.

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
      5. AUDIT DE NÉCESSITÉ : Avant de créer une nouvelle scène, demandez-vous : "Est-ce indispensable ?" Si l'action peut continuer dans le même plan ou le même angle, ne divisez pas. La fragmentation excessive nuit à la performance visuelle.

      RÈGLES D'OR DE NARRATION :
      • INTERDICTION ABSOLUE : Ne créez aucun personnage absent du characterRegistry. Si la narration nécessite un allié, utilisez un personnage existant ou laissez le rôle anonyme.
      • ÉCONOMIE DE MOYENS (BUDGET PRODUCTION) : Un nouvel asset maître (personnage ou lieu) a un coût de production élevé (crédits). Vous DEVEZ limiter l'introduction de nouveaux éléments.
        - MAXIMUM : 1 nouveau lieu et 1 nouveau personnage par épisode.
      • RÉUTILISATION PRIORITAIRE : Privilégiez EXCLUSIVEMENT les lieux et personnages déjà présents dans le registre. Ne créez un nouvel élément que si l'intrigue l'exige ABOLUMENT.
      • LISTES AUTORISÉES (ID FIXES - PRIORITÉ ABSOLUE) : 
        - PERSONNAGES : ${authorizedCharacters}
        - LIEUX (BUDGET ZÉRO) : ${Object.keys(this.seriesContext.locationRegistry || {}).join(', ') || 'Aucun lieu défini'}
      • RÈGLE D'OR DES LIEUX : Si l'action peut se dérouler dans un lieu existant (ex: @Archives), INTERDICTION d'en créer un nouveau. La fragmentation géographique est un échec narratif et budgétaire.
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
      • SOUDURE INVISIBLE (FLUIDITÉ TOTALE) : Entre l'épisode N et N+1, il ne doit y avoir AUCUN saut de ton. L'épisode N+1 est la suite organique du dernier souffle de l'épisode N.
      • LOCATION_CONSISTENCY (STRICT) : Chaque scène DOIT identifier son lieu via la propriété \`locationId\` en utilisant un handle du registre (ex: "@Maison_Victor").
      • CHARACTER_STABILITY : Les personnages (@Handle) conservent exactement les mêmes habits et traits d'un plan à l'autre.
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
      • ASSET PERSISTENCE & TRANSITION : Si un objet est marqué comme 'perdu' ou 'cherché' dans le registre, il ne peut PAS apparaître subitement dans la main d'un personnage.
      • ANTI-CREDIT BURN : Avant d'ajouter un @locationId non répertorié, demandez-vous si l'action ne peut pas se dérouler dans un lieu déjà connu. La fragmentation géographique excessive nuit à l'immersion et au budget.
      • RÈGLE : OUVERTURE ATMOSPHÉRIQUE (ÉPISODE 1) [CRITIQUE] : S'il s'agit du premier épisode de la saga, la Scène 1 DOIT s'ouvrir sur une action immédiate ou une sensation sensorielle forte.
      • 🏛️ ANCRAGE VISUEL DES LIEUX (LOC-DNA) : Chaque scène DOIT être taguée avec un \`@locationId\` du registre. L'image GÉNÉRÉE doit être 100% cohérente avec la première apparition de ce lieu.
      • 🎬 CONTINUITÉ DE PERSPECTIVE (RACCORD) : Lors d'un changement d'angle, les éléments de décor en arrière-plan NE DOIVENT PAS changer.
      `,
        user: `${missionBlock}DÉTAILS DE L'ÉPISODE : ${topic || options.episodeSummary || 'Générez la suite logique de la saga.'}\nCible : ${target} mots.`,
        targetWords: target
      }
    }
  }

  // ─── Pass 2: Structuring system prompt ─────────────────────────────────────

  protected buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)
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
2. EXPULSION NARRATIVE (STRICT) : Si un personnage est enlevé (kidnappé), tué, ou s'enfuit de la scène, il DOIT être IMMÉDIATEMENT retiré de la liste 'charactersInScene' pour toutes les scènes suivantes où il n'est plus présent physically. Ne laissez PAS de 'fantômes' visuels.
3. DISTINCTION VISUEL VS NARRATION : Si la narration parle d'une personne (@Maya) mais qu'elle n'est pas physiquement présente dans la scène, vous ne devez PAS l'ajouter dans 'charactersInScene'. Sa mention dans 'fullNarration' suffit. 'charactersInScene' est réservé STRICTEMENT à la présence physique visible.
4. ÉVOLUTION NARRATIVE (@characterEvolution) : Si un personnage change de statut (meurt, devient un traître, est blessé) même s'il n'est pas présent visuellement, vous devez l'enregistrer dans 'characterEvolution' pour assurer la continuité.
5. POSITIONNEMENT ET ÉQUILIBRE (FIX) : Pour assurer une continuité parfaite du décor, vous DEVEZ décrire la POSITION relative des personnages dans 'spatialAnchor' (ex: "@Maya est au centre, @Elias à sa droite"). Si la scène continue de la précédente ('continueFromPrevious': true), maintenez les positions initiales pour éviter les sauts visuels.
6. IDENTITÉ DES PERSONNAGES (STRICT) : Utilisez UNIQUEMENT le PRÉNOM pour les handles @. EXCLUEZ les préfixes (Frère, Dr, Sœur, Maître, etc.), les noms de famille et les suffixes de profession. (Exemple Correct : @Aloysius, @Jean; INCORRECT : @BrotherAloysius, @DrWatson).
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
    "characterContinuity": { "@Nom": { "description": "Description mise à jour (ex: blessure, vieillissement)" } },
    "locationContinuity": { "LieuID": { "description": "Description mise à jour (ex: ruines, hiver)" } },
    "newCharacters": { "@Nom": "Description physique détaillée" },
    "newLocations": { "LieuID": "Description visuelle (Ambiance, Lumière, Matériaux)" },
    "continuityAnalysis": {
      "soudureBrute": "Notez tout saut temporel ou spatial illogique.",
      "lastVisualBridge": "Rappelez ici l'état visuel exact de la Scène N-1 (ou de la fin de l'épisode précédent) pour valider l'accumulation."
    },
    "loreUpdates": ["Points de chronologie, de géographie ou de lore à graver dans la bible."]
  },
  "titles": ["Titre accrocheur de l'épisode correspondant à l'intrigue"],
  "fullNarration": "...",
  "scenes": [
    {
      "id": "scene-1",
      "justification": "Expliquez pourquoi ce changement de scène est nécessaire (Ex: Changement d'angle, Nouvelle interaction, Déplacement).",
      "summary": "...",
      "narration": "...",
      "locationId": "...",
      "charactersInScene": ["@Nom"],
      "emotionalTokens": { "@Nom": ["Emotion"] },
      "relationshipMap": { "@A": { "@B": "Relation" } },
      "spatialAnchor": "Description physique du lieu ET POSITION relative (ex: @Maya au centre devant la porte)",
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
       - Personnages présents : ${this.seriesContext.lastEpisodeFinalScene.charactersInScene?.join(', ') || 'Inconnu'}
       La première scène de ce NOUVEL ÉPISODE doit être la suite immédiate et indissociable de cet état.`
          : 'Aucun (Premier épisode).'
      }
REGISTRE DES PERSONNAGES : ${
        Object.entries(this.seriesContext.characterRegistry || {})
          .map(([name, data]) => {
            const handle = SeriesVideoGenerator.normalizeId(name)
            return `${name} (${handle}): ${data.description}`
          })
          .join(' | ') || 'Aucun.'
      }
REGISTRE DES LIEUX : ${
        Object.entries(this.seriesContext.locationRegistry || {})
          .map(([name, data]) => {
            const normalized = SeriesVideoGenerator.normalizeId(name)
            return `${normalized}: ${data.description}`
          })
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
        "STABILITÉ VISUELLE : Utilisez 'visualEvolution' and 'assetEvolution' pour traquer les changements permanents (ex: 'destroyed', 'scarred').",
        "PROTOCOLE IDENTITÉ (RÉFÉRENCE UNIQUE) : Dans 'imagePrompt', INTERDICTION TOTALE de décrire la physionomie des personnages (cheveux, vêtements, yeux, peau, taille). Limitez-vous EXCLUSIVEMENT à leur EXPRESSION ÉMOTIONNELLE (Inquiet, Déterminé, Souriant) et à leur ACTION (Courant, Lisant).",
        "CONCISION MAXIMALE : Les 'imagePrompt' doivent être extrêmement courts. Pas de phrases longues. Utilisez une syntaxe télégraphique focalisée sur l'ambiance et l'action (ex: 'Rafael est effrayé. Sarah le soutient. Grotte sombre. Éclairage à la lampe torche.').",
        'LOGIQUE CAUSALE (ASSETS) : Vérifiez que chaque objet (tenu ou au sol) est dans son état correct. Un objet tenu en main NE PEUT PAS disparaître au plan suivant sans justification.',
        "TEASING PRÉCIS : Le 'nextEpisodeTease' doit bannir le vague. Soyez spécifique.",
        "MANDAT DE JUSTIFICATION : Vous DEVEZ remplir le champ 'justification' pour CHAQUE scène. Justifiez tout changement de lieu, de tenue ou la DISPARITION d'un objet précédemment tenu.",
        "LORE GUARD (CANONISATION) : Tout fait nouveau (date, lieu dit, règle du monde) introduit dans l'épisode DOIT être consigné dans 'loreUpdates' pour devenir canon. Les personnages ne peuvent pas contredire le Lore existant.",
        "FIL CONDUCTEUR (MÉMOIRE ACTIVE) : Chaque épisode DOIT impérativement faire progresser l'un des 'unresolvedThreads' (passage à 'partial' ou 'resolved'). Interdiction de créer des épisodes 'de remplissage' sans évolution des enjeux.",
        "EPISODE TITLE : Le premier titre dans la liste 'titles' DOIT être un titre accrocheur, dramatique et spécifique à l'intrigue de CET épisode (ex: 'Le Secret de la Crypte', 'L'Ombre du Passé'). Évitez les titres génériques comme 'Épisode 2'.",
        "GEMINI VISION (ACTIVATE): Une image de référence (dernière frame de l'épisode précédent) vous est fournie en entrée multi-modale. Vous DEVEZ l'analyser pour assurer que la Scène 1 est visuellement raccord (détails du décor, vêtements, éclairage).",
        "PROTOCOLE D'ACCUMULATION VISUELLE (OBLIGATOIRE) : Chaque 'imagePrompt' de la scène 'N' doit commencer par '@VisualState: [Position de N-1, OBJETS TENUS]'. L'image doit être une évolution directe de la scène précédente (positions des membres, objets tenus, orientation) pour assurer une continuité parfaite.",
        "INVENTAIRE ACTIF & PERSISTANCE : Si un personnage tient un objet (ex: torche, livre, épée) en scène N, il DOIT obligatoirement le tenir en scène N+1, N+2, etc., sauf si une action explicite décrit qu'il le pose ou le perd. Ne faites JAMAIS disparaître un objet entre deux plans.",
        "ANALYSE DE CONTINUITÉ (VISION) : Dans 'continuityAnalysis.lastVisualBridge', décrivez les 3 éléments visuels clés que vous avez identifiés dans l'image de référence pour prouver votre analyse visuelle.",
        "STABILITÉ GÉOGRAPHIQUE (LIEUX POSSIBLES) : Vous DEVEZ réutiliser les lieux du 'REGISTRE DES LIEUX'. Chaque scène DOIT avoir un 'locationId' valide. Si la narration ne mentionne pas un changement de lieu EXPLICITE, vous DEVEZ copier le 'locationId' de la scène précédente. Interdiction totale d'inventer des lieux génériques.",
        "ENREGISTREMENT DES NOUVEAUX LIEUX (NEW_LOCATIONS) [CRITIQUE] : Si vous introduisez un lieu ABSENT du 'REGISTRE DES LIEUX', vous DEVEZ obligatoirement l'ajouter dans 'seriesMetadata.newLocations' avec une description visuelle détaillée (Architecture, Ambiance, Lumière). Un lieu ne peut pas exister dans 'scenes' sans être soit dans le registre, soit dans 'newLocations'."
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
    }\nTÂCHE : Découpe en scènes JSON valides. SEQUEL MODE ACTIVE : Scene 1 MUST be a sequel reprise.
      
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
        const fidelityInstruction = isSequelBridge
          ? "⚠️ FIDÉLITÉ ABSOLUE : Cette scène est la reprise directe de l'épisode précédent. Utilisez l'image de référence comme point de départ IMMUABLE."
          : "⚠️ ZÉRO DRIFT : Les meubles, l'éclairage et la POSITION RELATIVE des personnages DOIVENT rester IDENTIQUES à ceux de la scène précédente pour préserver la continuité du plan."

        continuityContext += `Reference (${refLabel}). ${fidelityInstruction} COMPOSITION IDENTIQUE. `

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
      if (
        paragraph.toLowerCase().includes(assetName.toLowerCase()) ||
        paragraph.toLowerCase().includes(SeriesVideoGenerator.normalizeId(assetName))
      ) {
        const stateStr = getEvolutionString(evolutionData)
        if (stateStr) relevantEvolutions.push(`${assetName} (${stateStr})`)
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

    return {
      sceneId: scene.id,
      prompt: finalPrompt,
      referenceImage: referenceImageUrl,
      referenceImages: allReferenceImages,
      characterSheets,
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
