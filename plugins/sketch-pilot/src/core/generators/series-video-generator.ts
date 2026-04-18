import { LLMServiceFactory, type LLMService } from '../../services/llm'
import { computeSceneCountRange, type EnrichedScene, type VideoGenerationOptions } from '../../types/video-script.types'
import { VimaxBestImageSelector } from '../vimax/VimaxBestImageSelector'

import { VimaxCameraTreeDirector } from '../vimax/VimaxCameraTreeDirector'
import { VimaxCharacterExtractor } from '../vimax/VimaxCharacterExtractor'
import { VimaxCharacterFusion } from '../vimax/VimaxCharacterFusion'
import { VimaxEventExtractor } from '../vimax/VimaxEventExtractor'
import { VimaxNarrativeMemory } from '../vimax/VimaxNarrativeMemory'
import { VimaxEconomizerMode, VimaxPipelineEconomizer } from '../vimax/VimaxPipelineEconomizer'
import { VimaxReferenceSelector } from '../vimax/VimaxReferenceSelector'
import { VimaxSagaCompressor } from '../vimax/VimaxSagaCompressor'
import { VimaxSagaPlanner } from '../vimax/VimaxSagaPlanner'
import { VimaxSceneExtractor } from '../vimax/VimaxSceneExtractor'
import { VimaxScreenwriter } from '../vimax/VimaxScreenwriter'
import { VimaxScriptEnhancer } from '../vimax/VimaxScriptEnhancer'
import { VimaxShotDecomposer } from '../vimax/VimaxShotDecomposer'
import { VimaxStoryboardArtist } from '../vimax/VimaxStoryboardArtist'
import type { VideoTypeSpecification } from '../prompt-maker.types'
import { registerCharacterVisual } from './series/character-consistency'
import { registerLocationVisual } from './series/location-consistency'
import { buildImagePrompt as buildImagePromptExternal } from './series/series-image-prompt.builder'
import { buildPass3SystemPrompt, buildSeriesOutputFormat } from './series/series-prompts'
import {
  ContinuityDebtManager,
  findInRegistry,
  findKeyInRegistry,
  mergeEvolution,
  normalizeId,
  type ContinuityDebt,
  type EvolutionState
} from './series/series-registry.utils'
import { SeriesHallucinationSentinel } from './series/series-sentinel'
import { createVisualRegistry, type VisualRegistry } from './series/visual-registry'
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
  importance?: number // 1-10 (added in V6)
  maturity?: number // 0-100 (percentage towards resolution, added in V6)
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
  characterContinuity: Record<string, { description: string; isNew: boolean; visualDNA?: string }>
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
  narrationLayer?: {
    psychologicalArc: string
    causalThread: string
    hiddenForce: string
  }
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
      visualDNA?: string
      referenceSceneId?: string
      referenceEpisode?: number
      firstMentionedSceneId?: string
      firstMentionedEpisode?: number
      deathSceneId?: string
      locks?: Record<string, string>
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
      dynamicState?: {
        positions?: string[]
        changes?: string[]
        damages?: string[]
        cameraShift?: string
        emotionalTone?: string
        baseState?: any
        stateLock?: any
      }
      visualDNA?: string
      locks?: Record<string, string>
    }
  >
  artisticStyle?: string // Style DNA immuable de la série (ex: "Stick figure", "Watercolor")
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
  continuityDebts?: ContinuityDebt[]
  forcedCorrection?: string
  tiktokViral?: boolean
  threads?: any[]
  roadmap?: any
  visualRegistry?: VisualRegistry
  worldStateSnapshot?: any
  spatialAnchors?: Record<string, string>
  globalLocks?: Record<string, string>
  narrationLayer?: {
    psychologicalArc: string
    causalThread: string
    hiddenForce: string
  }
  tensionState?: {
    residue: number
    level?: number
    type?: 'build' | 'sustain' | 'spike' | 'release'
  }
  // v17.0 Living Engine
  acting?: {
    physicalIntent: string
    microExpression: string
    energyLevel: 'low' | 'medium' | 'high' | 'explosive'
    bodyDynamics: 'stable' | 'tension' | 'unstable' | 'release'
  }
  momentum?: {
    type: 'increasing' | 'unstable' | 'breaking' | 'release'
    vector: 'forward' | 'backward' | 'locked'
  }
  language?: string
  seriesNarrativeArc?: any
  episodePlan?: any
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
    "\n\n🎨 HARMONIE CINÉMATOGRAPHIQUE : \n- TRANSITION : Changement de scène.\n- CAMERA ACTION : Mouvement DANS la scène.\nCombinez-les pour créer du rythme et de l'impact.\n\n🔗 CONTINUITÉ NARRATIVE FLUIDE :"

  if (lastScene) {
    prompt += `\nL'épisode précédent s'est achevé sur cette scène : "${lastScene.summary || lastScene.imagePrompt}"`
    if (lastScene.locationId) prompt += `\nReprise de l'action à : "${lastScene.locationId}".`
    if (lastScene.persistentDecorTokens?.length > 0) {
      prompt += `\nAmbiance & Lumière héritées : ${lastScene.persistentDecorTokens.join(', ')}`
    }

    prompt += `\n🚀 ÉLAN NARRATIF : Favorisez la continuité immédiate, mais autorisez le mouvement et l'action In Media Res. Évitez les ellipses trop longues, mais privilégiez le rythme.`
    prompt += `\n- HÉRITAGE TECHNIQUE [S1] (FLUIDITÉ) : La Scène 1 est l'héritière directe de l'épisode précédent :`
    prompt += `\n    * locationId : "${lastScene.locationId}"`
    prompt += `\n    * charactersInScene : [${(lastScene.charactersInScene || []).join(', ')}]`
    prompt += `\n    * shotType : "${lastScene.shotType || 'WIDE'}"`
    prompt += `\n- ECHO DU DERNIER SOUFFLE : L'épisode précédent s'est terminé par : "${lastScene.narration}".`
    prompt += `\n  🎬 REPRISE ÉNERGIQUE : La première phrase de la Scène 1 doit capter l'élan de ces mots (Action ou émotion vive).`
    prompt += `\n- SYNC ÉMOTIONNELLE : Les personnages conservent l'intensité de leur dernier état (Peur, Choc, Détermination).`
    prompt += `\n🖼️ ALIGNEMENT VISUEL : La Scène 1 s'appuie sur l'état final précédent pour assurer une immersion immédiate.`
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

  // Vimax Agents (Lazily Initialized)
  private _memory?: VimaxNarrativeMemory
  private _director?: VimaxCameraTreeDirector
  private _storyboardArtist?: VimaxStoryboardArtist
  private _decomposer?: VimaxShotDecomposer
  private _referenceSelector?: VimaxReferenceSelector
  private _characterExtractor?: VimaxCharacterExtractor
  private _sagaPlanner?: VimaxSagaPlanner
  private _characterFusion?: VimaxCharacterFusion
  private _bestImageSelector?: VimaxBestImageSelector
  private _sagaCompressor?: VimaxSagaCompressor
  private _eventExtractor?: VimaxEventExtractor
  private _sceneExtractor?: VimaxSceneExtractor
  private _screenwriter?: VimaxScreenwriter
  private _scriptEnhancer?: VimaxScriptEnhancer
  private _llmService?: LLMService

  constructor(config: VideoGeneratorConfig, seriesContext: SeriesContext) {
    super(config)
    this.seriesContext = seriesContext
    if (!this.seriesContext.visualRegistry) {
      this.seriesContext.visualRegistry = createVisualRegistry()
    }
    // Sync style guide from context to registry
    if (!this.seriesContext.artisticStyle && this.seriesContext.videoGenre) {
      this.seriesContext.artisticStyle = this.seriesContext.videoGenre
    }
    if (this.seriesContext.videoGenre) this.seriesContext.visualRegistry.style.style = this.seriesContext.videoGenre
    if (this.seriesContext.colorPalette)
      this.seriesContext.visualRegistry.style.colorGrading = this.seriesContext.colorPalette
    if (this.seriesContext.cameraStyle) this.seriesContext.visualRegistry.style.camera = this.seriesContext.cameraStyle
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

    if (this.seriesContext.tiktokViral) {
      instructions.push(
        `🚀 MODE TIKTOK VIRAL : L'objectif est la viralité et la rétention maximale.`,
        `Règle d'OR : HOOK immédiat, rythme ultra-rapide, tension permanente.`,
        `Loop design : La fin de l'épisode doit naturellement boucler sur le début.`
      )
    }

    this.narrativeInstructions = instructions
  }

  private async getVimaxAgents(llmService: LLMService) {
    const economizerMode = (this.seriesContext as any).economizerMode || VimaxEconomizerMode.DRAFT
    const economizer = new VimaxPipelineEconomizer(economizerMode)
    const required = economizer.getRequiredAgents()

    const loadIfRequired = <T>(name: string, factory: () => T): T | undefined => {
      if (required.includes('all') || required.includes(name)) {
        return factory()
      }
      return undefined
    }

    if (!this._memory) this._memory = loadIfRequired('memory', () => new VimaxNarrativeMemory(llmService))
    if (!this._director) this._director = loadIfRequired('director', () => new VimaxCameraTreeDirector(llmService))
    if (!this._storyboardArtist)
      this._storyboardArtist = loadIfRequired('storyboardArtist', () => new VimaxStoryboardArtist(llmService))
    if (!this._decomposer) this._decomposer = loadIfRequired('decomposer', () => new VimaxShotDecomposer(llmService))
    if (!this._referenceSelector)
      this._referenceSelector = loadIfRequired('referenceSelector', () => new VimaxReferenceSelector(llmService))
    if (!this._characterExtractor)
      this._characterExtractor = loadIfRequired('characterExtractor', () => new VimaxCharacterExtractor(llmService))
    if (!this._sagaPlanner) this._sagaPlanner = loadIfRequired('sagaPlanner', () => new VimaxSagaPlanner(llmService))
    if (!this._characterFusion)
      this._characterFusion = loadIfRequired('characterFusion', () => new VimaxCharacterFusion(llmService))
    if (!this._bestImageSelector)
      this._bestImageSelector = loadIfRequired('bestImageSelector', () => new VimaxBestImageSelector(llmService))
    if (!this._sagaCompressor)
      this._sagaCompressor = loadIfRequired('sagaCompressor', () => new VimaxSagaCompressor(llmService))
    if (!this._eventExtractor)
      this._eventExtractor = loadIfRequired('eventExtractor', () => new VimaxEventExtractor(llmService))
    if (!this._sceneExtractor)
      this._sceneExtractor = loadIfRequired('sceneExtractor', () => new VimaxSceneExtractor(llmService))
    if (!this._screenwriter)
      this._screenwriter = loadIfRequired('screenwriter', () => new VimaxScreenwriter(llmService))
    if (!this._scriptEnhancer)
      this._scriptEnhancer = loadIfRequired('scriptEnhancer', () => new VimaxScriptEnhancer(llmService))

    return {
      memory: this._memory!,
      director: this._director!,
      storyboardArtist: this._storyboardArtist!,
      decomposer: this._decomposer!,
      referenceSelector: this._referenceSelector!,
      characterExtractor: this._characterExtractor!,
      sagaPlanner: this._sagaPlanner!,
      characterFusion: this._characterFusion!,
      bestImageSelector: this._bestImageSelector!,
      sagaCompressor: this._sagaCompressor!,
      eventExtractor: this._eventExtractor!,
      sceneExtractor: this._sceneExtractor!,
      screenwriter: this._screenwriter!,
      scriptEnhancer: this._scriptEnhancer!,
      economizer
    }
  }

  public async getLlmService(): Promise<LLMService> {
    if (!this._llmService) {
      // Fallback to factory if not set
      this._llmService = await LLMServiceFactory.create({
        provider: 'gemini', // Default
        apiKey: (this.config as any).apiKey || '',
        cacheSystemPrompt: true
      })
    }
    return this._llmService
  }

  public async getMemory(llmService: LLMService): Promise<VimaxNarrativeMemory> {
    if (!this._memory) this._memory = new VimaxNarrativeMemory(llmService)
    return this._memory
  }

  public getType(): string {
    return 'series'
  }

  /**
   * Hardcore Semantic Audit for Series
   */
  public auditScript(script: any): { isValid: boolean; issues: string[]; feedback?: string } {
    console.info(
      `[SeriesVideoGenerator] 🛡️ Hallucination Sentinel: Auditing episode ${this.seriesContext.episodeNumber}...`
    )
    const report = SeriesHallucinationSentinel.audit(script, this.seriesContext)

    if (!report.isValid) {
      const feedback = SeriesHallucinationSentinel.generateCorrectionPrompt(report)
      return {
        isValid: false,
        issues: report.issues.map((i) => i.message),
        feedback
      }
    }

    return { isValid: true, issues: [] }
  }

  /**
   * Vimax Enrichment Loop
   * Enriches the script with Camera Tree grouping and FF/LF decomposition.
   */
  public async enrichScriptWithVimax(script: any, llmService: LLMService): Promise<any> {
    console.info(`[SeriesVideoGenerator] 🎬 Vimax Visual Pass: Episode ${this.seriesContext.episodeNumber}...`)
    const { director, storyboardArtist, decomposer, memory, economizer } = await this.getVimaxAgents(llmService)

    const originalScenes: any[] = script.scenes || []
    const epId = (i: number) => `ep${this.seriesContext.episodeNumber}_s${i}`

    // ── DRAFT: Skip storyboard & camera tree, just re-id and fix imagePrompt ──
    if (economizer.mode === VimaxEconomizerMode.DRAFT) {
      console.info(`[SeriesVideoGenerator] ⚡ Economizer: DRAFT MODE - Skipping Storyboard & Camera Tree.`)
      script.scenes = originalScenes.map((s: any, i: number) => ({
        // Preserve ALL original fields (narration, locationId, transition, cameraAction,
        // preset, continueFromPrevious, persistentDecorTokens, composition,
        // visualEvolution, visualDelta, acting, momentum, tensionState, etc.)
        ...s,
        id: epId(i),
        // imagePrompt already computed by LLM — only fallback to summary if missing
        imagePrompt: s.imagePrompt || s.summary || s.narration || '',
        ffDesc: s.imagePrompt || s.summary || s.narration || '',
        variationType: 'small'
      }))
      return script
    }

    // 1. Storyboard Artist: Design the shot structure (ShotBriefDescription)
    console.info(`[SeriesVideoGenerator] 🎨 Designing Storyboard...`)

    // [V52] AutoCameo Hardware: Inject visualDNA from registry
    const characters = (script.characters || []).map((c: any) => {
      const charId = SeriesVideoGenerator.normalizeId(c.name)
      const regChar = this.seriesContext.characterRegistry?.[c.name] || this.seriesContext.characterRegistry?.[charId]
      if (regChar?.visualDNA) {
        return { ...c, description: `${c.description || ''} ${regChar.visualDNA}`.trim() }
      }
      return c
    })

    // Use fullNarration first, fallback to narration per scene
    const narrativeSource =
      script.fullNarration || originalScenes.map((s: any) => s.narration || s.script || s.summary).join('\n')

    const shotBriefs = await storyboardArtist!.designStoryboard(
      narrativeSource,
      characters,
      this.seriesContext.videoGenre || ''
    )

    // 2. Shot Decomposer: Expand brief shots into full descriptions (FF/LF/Motion)
    console.info(`[SeriesVideoGenerator] 🎞️ Decomposing ${shotBriefs.length} shots...`)
    const shotDescriptions = await Promise.all(
      shotBriefs.map((brief) => decomposer!.decomposeShot(brief.visualDesc, characters))
    )

    // 3. Camera Tree Director: Establish spatial hierarchy
    console.info(`[SeriesVideoGenerator] 📡 Constructing Camera Tree...`)
    const cameras = await director!.constructCameraTree(
      shotBriefs.map((b) => ({ idx: b.camIdx, activeShotIdxs: [b.idx] })),
      shotBriefs
    )

    // 4. Map back to script scenes
    // ⚠️ Shot count from storyboard may differ from original scene count.
    //    We iterate over originalScenes and match each to the closest shot.
    //    Vimax visual data overrides ONLY image-related fields.
    //    ALL narrative/DB fields (narration, locationId, transition, cameraAction,
    //    preset, continueFromPrevious, persistentDecorTokens, composition,
    //    visualEvolution, visualDelta, visualBaseState, visualStateLock,
    //    frameAnchor, worldStateSnapshot, weatherState, timeOfDay, colorPalette,
    //    cameraStyle, sceneDelta, scenePurpose, tensionState, acting, momentum,
    //    sequenceId, sequenceProgress, visualSubject, sceneNumber, charactersInScene)
    //    are PRESERVED from the original scene.
    const mappedCount = Math.max(originalScenes.length, shotDescriptions.length)
    script.scenes = Array.from({ length: mappedCount }, (_, i) => {
      // For extra shots, duplicate the last original scene as skeleton
      const originalScene = originalScenes[i] ?? { ...originalScenes.at(-1) }
      // If storyboard produced fewer shots, reuse last description
      const descIdx = Math.min(i, shotDescriptions.length - 1)
      const briefIdx = Math.min(i, shotBriefs.length - 1)
      const desc = shotDescriptions[descIdx]
      const brief = shotBriefs[briefIdx] as any
      const cam = cameras.find((c) => c.activeShotIdxs.includes(i))

      return {
        // ── 1. FULL original scene (all DB fields preserved) ────────────────
        ...originalScene,
        // ── 2. Vimax overrides (visual pipeline only) ───────────────────────
        id: epId(i),
        // imagePrompt: Vimax FF replaces LLM prompt for pixel-perfect consistency
        imagePrompt: desc?.ffDesc || originalScene.imagePrompt || originalScene.summary || '',
        ffDesc: desc?.ffDesc || null,
        lfDesc: desc?.lfDesc || null,
        motionDesc: desc?.motionDesc || null,
        variationType: (desc as any)?.variationType || 'small',
        // Camera spatial hierarchy
        camIdx: brief?.camIdx ?? null,
        audioDesc: brief?.audioDesc || originalScene.audioDesc || null,
        parentCamIdx: cam?.parentCamIdx ?? null,
        parentShotIdx: cam?.parentShotIdx ?? null,
        spatialReason: cam?.reason ?? null
      }
    })

    // 5. Update Narrative Memory
    if (script.seriesMetadata?.episodeSummary) {
      memory.addFact({
        content: script.seriesMetadata.episodeSummary,
        importance: 8,
        episodeIndex: this.seriesContext.episodeNumber,
        tags: ['summary']
      })
    }

    return script
  }

  /**
   * Vimax Production: Generate Highly Consistent Frames
   */
  public async generateFramesWithVimax(scene: any, llmService: LLMService): Promise<{ ff: string; lf?: string }> {
    // In Vimax, this is where we'd generate candidates and use BestImageSelector.
    // Sketch Pilot's NanoBananaEngine handles the generation, so we provide the prompts.
    return {
      ff: scene.ffDesc,
      lf: scene.variationType === 'large' || scene.variationType === 'medium' ? scene.lfDesc : undefined
    }
  }

  // ─── Output Format ──────────────────────────────────────────────────────────

  protected getDefaultOutputFormat(): string {
    return buildSeriesOutputFormat(!!this.seriesContext.isFinalEpisode)
  }

  // ─── Pass 0: Global Series Arc ──────────────────────────────────────────────

  public async generateSeriesArc(topic: string, llmService: LLMService): Promise<any> {
    console.log(`[SeriesVideoGenerator] Pass 0: Generating Global Series Arc for "${topic}" using Vimax Saga Brain...`)
    const { sagaPlanner, eventExtractor } = await this.getVimaxAgents(llmService)

    // 1. Intent-Routed Planning
    const { intent, script: narrativeBible } = await sagaPlanner.planSaga(topic)
    console.log(`[SeriesVideoGenerator] Vimax Intent: ${intent}`)

    // 2. High-Fidelity Event Extraction
    const events = await eventExtractor.extractEvents(narrativeBible)
    console.log(`[SeriesVideoGenerator] Vimax Extracted ${events.length} causal events.`)

    // 3. Narrative Compression & Roadmap Structuring
    const roadmap = events.map((e) => ({
      episodeNumber: e.index + 1,
      title: e.description,
      hook: e.processChain[0] || '',
      summary: e.description,
      process: e.processChain
    }))

    return {
      intent,
      bible: narrativeBible,
      roadmap,
      totalEpisodes: roadmap.length
    }
  }

  // ─── Pass 1: Episode Planning ───────────────────────────────────────────────

  public async generateEpisodePlan(seriesArc: any, llmService: LLMService): Promise<any> {
    console.log(
      `[SeriesVideoGenerator] Pass 1: Generating Episode Plan for Ep ${this.seriesContext.episodeNumber} using Vimax...`
    )
    const { sceneExtractor } = await this.getVimaxAgents(llmService)

    // Find the event in the roadmap and normalize it to the VimaxEvent shape
    const rawEvent = (seriesArc.roadmap || []).find(
      (r: any) => r.episodeNumber === this.seriesContext.episodeNumber
    ) || {
      description: this.seriesContext.currentEpisodePitch || 'Episode Plan',
      processChain: []
    }
    // Normalize: roadmap entries use 'process', VimaxEvent uses 'processChain'
    const event = {
      index: rawEvent.episodeNumber ? rawEvent.episodeNumber - 1 : 0,
      description: rawEvent.description || rawEvent.summary || '',
      processChain: rawEvent.processChain || rawEvent.process || [],
      isLast: false
    }

    // Extract scenes for this episode
    const vimaxScenes = await sceneExtractor.extractScenes(event, [event.description, ...event.processChain])

    return {
      episodeNumber: this.seriesContext.episodeNumber,
      scenes: vimaxScenes.map((s) => ({
        id: `ep${this.seriesContext.episodeNumber}_s${s.idx}`,
        title: s.environment.slugline,
        summary: s.environment.description,
        // `script` is the raw narrative text from VimaxSceneExtractor.
        // Expose as `narration` so it matches enrichedSceneSchema and video_scenes DB schema.
        narration: s.script || s.environment.description || '',
        script: s.script,
        // `environment.description` is the visual scene description — seed imagePrompt early.
        imagePrompt: s.environment.description || '',
        locationId: s.environment.slugline
          ? s.environment.slugline
              .toLowerCase()
              .replaceAll(/[\s/\\]+/g, '_')
              .replaceAll(/[^a-z0-9_]/g, '')
          : undefined,
        charactersInScene: s.characters.map((c) => c.identifierInScene)
      }))
    }
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
    const ctx = this.seriesContext
    const currentEp = ctx.episodeNumber

    // The Pass 1 in Vimax logic is handled by VimaxScreenwriter
    // We prepare the context for the screenwriter here.
    return {
      pass1: {
        system: `[Vimax Screenwriting Engine] Preparing Episode ${currentEp}...`,
        user: `EXTRACT: ${(ctx as any).episodePlan?.scenes?.map((s: any) => s.summary).join('\n') || topic}`,
        targetWords: targetWords || 180
      }
    }
  }

  /**
   * Vimax Execution: Generate Narration
   * Overrides the default multi-pass generation to use Vimax agents.
   */
  public async generateNarrationWithVimax(llmService: LLMService): Promise<string> {
    console.log(`[SeriesVideoGenerator] 🖋️ Vimax Narration Pass: Episode ${this.seriesContext.episodeNumber}...`)
    const { screenwriter, scriptEnhancer, economizer } = await this.getVimaxAgents(llmService)

    const episodicPlan = (this.seriesContext as any).episodePlan
    if (!episodicPlan) throw new Error('Episode plan missing before narration pass.')

    // Build the richest possible scene context for the screenwriter.
    // Priority: narration (full text) > script (raw Vimax text) > summary (brief intent)
    const sceneContextLines = episodicPlan.scenes.map((s: any, i: number) => {
      const text = s.narration || s.script || s.summary || `Scene ${i + 1}`
      return `SCENE ${i + 1} [${s.locationId || s.title || 'unknown'}]: ${text}`
    })

    // 1. Expand Plan into Screenplay
    const scriptLines = await screenwriter!.writeScript(
      JSON.stringify(sceneContextLines),
      `Target duration: 60 seconds. Strict word count: 180 words maximum. Ensure professional dramatic pacing.`
    )
    const script = scriptLines.join('\n\n')

    // 2. Enhance Script (Sensory Hardening) - Skip if in Draft/Professional mode
    if (economizer.shouldSkipEnhancement()) {
      console.info(`[SeriesVideoGenerator] ⚡ Economizer: Skipping Sensory Enhancement Pass.`)
      return script
    }

    const enhancedScript = await scriptEnhancer!.enhance(script)
    return enhancedScript
  }

  // ─── Pass 2: Structuring system prompt ─────────────────────────────────────

  protected buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    if (options.language) {
      this.seriesContext.language = options.language
    }

    return buildPass3SystemPrompt({
      episodeNumber: this.seriesContext.episodeNumber,
      characterRegistry: this.seriesContext.characterRegistry || {},
      locationRegistry: this.seriesContext.locationRegistry || {},
      artisticStyle: this.seriesContext.artisticStyle
    })
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
    let range = computeSceneCountRange(duration)

    if (
      this.seriesContext.tiktokViral && // Scale TikTok density relative to duration
      duration <= 60
    ) {
      if (duration >= 25 && duration <= 35) {
        range = { min: 4, max: 4, ideal: 4 }
      } else {
        const tiktokIdeal = Math.max(3, Math.min(6, Math.floor(duration / 6)))
        range = { min: 3, max: tiktokIdeal + 1, ideal: tiktokIdeal }
      }
    }

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

    let narrationDisplay = validatedNarration
    let segmentationContext = ''

    try {
      const parsed = JSON.parse(validatedNarration)
      if (parsed.atomicFrames) {
        narrationDisplay = parsed.atomicFrames.map((f: any) => f.narration).join('\n\n')
        segmentationContext = `\n\n🎯 SÉQUENCE ATOMIQUE (v19.0) :\nL'étape de scriptage a identifié les unités intentionnelles suivantes. CHAQUE frame ci-dessous DOIT correspondre à EXACTEMENT une scène (shot) dans votre sortie :\n${JSON.stringify(parsed.atomicFrames, null, 2)}\n\n⚠️ RÈGLE D'OR (v19.1) :\n1. Ne modifiez PAS la narration des frames.\n2. Enrichissez chaque frame avec les détails techniques (shotType, acting, momentum, simulationPatch).\n3. Respectez scrupuleusement le découpage établi.`
      } else if (parsed.visualSegments) {
        // Fallback legacy
        narrationDisplay = parsed.fullNarration
        segmentationContext = `\n\n🎯 SEGMENTATION VISUELLE 5D (v18.2) :\n${JSON.stringify(parsed.visualSegments, null, 2)}`
      }
    } catch {
      // Logic fallback pour texte brut
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
    )}\n\n${bridgeContext}${segmentationContext}\n\nNARRATION COMPLÈTE ÉPISODE ${this.seriesContext.episodeNumber} :
---
${narrationDisplay}
---

TÂCHE : Projetez visuellement la narration ci-dessus en scènes (shots).
🎬 DÉCLENCHEURS DE SHOT : Ne créez un nouveau shot que pour un changement RADICAL (Lieu, POV, Entrée/Sortie).
⚠️ DENSITÉ : Visez une durée moyenne de 5-7s par shot. Fusionnez les micro-actions dans une seule frame si elles sont continues.

${buildSeriesOutputFormat(!!this.seriesContext.isFinalEpisode)}

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
    const result = await buildImagePromptExternal({
      scene,
      episodeNumber: this.seriesContext.episodeNumber,
      characterRegistry: this.seriesContext.characterRegistry || {},
      locationRegistry: this.seriesContext.locationRegistry || {},
      assetRegistry: this.seriesContext.assetRegistry || {},
      visualEvolution: this.seriesContext.visualEvolution,
      assetEvolution: this.seriesContext.assetEvolution,
      relationshipMap: this.seriesContext.relationshipMap,
      globalContext: this.seriesContext.globalContext,
      colorPalette: this.seriesContext.colorPalette,
      symbolicMotifs: this.seriesContext.symbolicMotifs,
      cameraStyle: this.seriesContext.cameraStyle,
      timeOfDay: this.seriesContext.timeOfDay,
      weatherState: this.seriesContext.weatherState,
      lastEpisodeFinalImage: this.seriesContext.lastEpisodeFinalImage,
      lastEpisodeFinalScene: this.seriesContext.lastEpisodeFinalScene,
      hasReferenceImages,
      hasLocationReference,
      previousScene: (memory as any)?.previousScene,
      loreUpdates: (this.seriesContext as any).loreUpdates,
      language: this.seriesContext.language,
      roadmapNarrativeHints: (this.seriesContext as any).roadmap?.narrativeHints,
      visualRegistry: this.seriesContext.visualRegistry,
      spec: this.getEffectiveSpec({} as any)
    })

    const spec = this.getEffectiveSpec({} as any)
    const finalPrompt = this.getEnrichedImagePrompt(result.prompt, spec)

    // [VIMAX] Intelligent Reference Pruning
    const llm = await this.getLlmService()
    const { referenceSelector } = await this.getVimaxAgents(llm)

    // Build initial reference list
    const allRefs = [
      ...result.characterSheets.map((s) => ({ name: `@${s.name}`, data: (s as any).thumbnailUrl || '' })),
      ...result.referenceImages
    ]

    let finalReferenceImages
    if (referenceSelector) {
      const prunedRefs = await referenceSelector.selectReferences(
        scene,
        allRefs.map((img: any) => ({
          name: typeof img === 'object' ? img.name! : 'Previous Frame',
          data: typeof img === 'object' ? img.data! : img,
          description:
            typeof img === 'object' && img.name?.startsWith('LOCATION:')
              ? 'Location Master Image'
              : 'Character / Context Reference'
        }))
      )
      finalReferenceImages = prunedRefs.map((r) => ({ name: r.name, data: r.data }))
    } else {
      // Fallback to all references if selector is missing (e.g. DRAFT mode)
      finalReferenceImages = allRefs.map((img: any) => ({
        name: typeof img === 'object' ? img.name! : 'Context Image',
        data: typeof img === 'object' ? img.data! : img
      }))
    }

    return {
      sceneId: result.sceneId,
      prompt: finalPrompt,
      referenceImage: result.referenceImage,
      referenceImages: finalReferenceImages,
      characterSheets: result.characterSheets,
      reuseReferenceImage: result.reuseReferenceImage
    }
  }

  public buildAnimationPrompt(
    scene: EnrichedScene,
    imageStyle?: { characterDescription?: string }
  ): { sceneId: string; instructions: string; movements: any[] } {
    const cameraSignal = this.cinematicEngine.formatCameraSignal(scene.cameraAction)
    const instructions = [scene.animationPrompt, cameraSignal].filter(Boolean).join(' ')
    return { sceneId: scene.id, instructions, movements: [] }
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

    // 9. Simulation Patching (v9.0 SIMULATION PARADIGM)
    SeriesVideoGenerator.applySimulationPatch(currentContext, scenes)

    // 10. Final Context Assembly
    const currentEp = currentContext.episodeNumber

    // 1. Initialize Working Registries (Copies)
    const registries = {
      characters: { ...(currentContext.characterRegistry || {}) },
      locations: { ...(currentContext.locationRegistry || {}) },
      assets: { ...(currentContext.assetRegistry || {}) },
      visual: currentContext.visualRegistry
        ? JSON.parse(JSON.stringify(currentContext.visualRegistry))
        : createVisualRegistry()
    }

    // 2. Process Narrative Threads & Stakes (Project Sequel - V42/V3)
    const { threads: finalThreads, stakes: updatedResolvedStakes } = SeriesVideoGenerator.processThreadsAndStakes(
      currentContext,
      metadata,
      currentEp
    )

    // 3. Roadmap & Cliffhanger
    const updatedRoadmap = SeriesVideoGenerator.processRoadmapUpdates(currentContext.roadmap, metadata)
    const nextCliffhanger: TypedCliffhanger | string | undefined =
      metadata.cliffhanger && typeof metadata.cliffhanger === 'object'
        ? (metadata.cliffhanger as TypedCliffhanger)
        : metadata.cliffhanger || currentContext.lastCliffhanger

    if (metadata.cliffhanger) {
      updatedResolvedStakes.push({
        title:
          typeof metadata.cliffhanger === 'string' ? metadata.cliffhanger : (metadata.cliffhanger as any).description,
        resolution: 'En attente',
        episodeNumber: currentEp,
        mustResolveBy: currentEp + 1
      })
    }

    // 4. Registry Updates (Characters, Locations, Assets)
    SeriesVideoGenerator.processRegistryUpdates(metadata, registries, currentEp)

    // 5. Evolution & Relationships (Project Sequel - V2/V3)
    const evolutions = SeriesVideoGenerator.processEvolutionStates(currentContext, metadata, scenes, registries)

    // 6. Lore Bible Expansion (Deduplicated)
    const updatedGlobalContext = SeriesVideoGenerator.processLoreUpdates(
      currentContext.globalContext,
      metadata,
      currentEp
    )

    // 7. Visual Promotion & Origin Tracking
    SeriesVideoGenerator.promoteVisualReferences(
      scenes,
      registries,
      { character: evolutions.characterEvolution },
      currentEp,
      metadata
    )

    // 8. Continuity Debts (V39 Hardening)
    const legacyDebts = ((currentContext.continuityDebts as any[]) || []).filter(
      (d): d is string => typeof d === 'string'
    )
    const modernDebts = ((currentContext.continuityDebts as any[]) || []).filter(
      (d): d is ContinuityDebt => typeof d === 'object'
    )
    const debtManager = ContinuityDebtManager.fromLegacyStrings(legacyDebts, currentEp)
    modernDebts.forEach((d) => (debtManager as any).debts.set(d.id, d))
    if (metadata.continuityAnalysis) debtManager.ingestContinuityAnalysis(metadata.continuityAnalysis)

    // 9. Weather & Time
    let lastWeather = currentContext.weatherState
    let lastTime = currentContext.timeOfDay
    const lastScene = scenes.at(-1)
    if (lastScene?.weatherState && lastScene.weatherState !== 'None') lastWeather = lastScene.weatherState
    if (lastScene?.timeOfDay) lastTime = lastScene.timeOfDay

    const episodeSummary = metadata.episodeSummary || 'Pas de résumé.'
    const episodeHistory = `--- Episode ${currentEp} ---\n${episodeSummary}\n`

    // 10. Long-term Memory Compression
    const compressedPreviousEpisodes = SeriesVideoGenerator.compressLongTermMemory(
      `${currentContext.previousEpisodesContext || ''}\n${episodeHistory}`.trim(),
      currentEp
    )

    return {
      ...currentContext,
      characterRegistry: registries.characters,
      locationRegistry: registries.locations,
      assetRegistry: registries.assets,
      visualRegistry: registries.visual,
      unresolvedThreads: finalThreads,
      resolvedStakes: updatedResolvedStakes,
      previousEpisodesContext: compressedPreviousEpisodes,
      globalContext: updatedGlobalContext,
      episodeNumber: currentEp + 1,
      lastCliffhanger: nextCliffhanger,
      weatherState: lastWeather,
      timeOfDay: lastTime,
      visualEvolution: evolutions.visualEvolution,
      assetEvolution: evolutions.assetEvolution,
      characterEvolution: evolutions.characterEvolution,
      relationshipMap: evolutions.relationshipMap,
      worldStateSnapshot: evolutions.worldStateSnapshot,
      nextEpisodeTease: metadata.nextEpisodeTease,
      continuityDebts: debtManager.getAllDebts(),
      forcedCorrection: debtManager.toForcedCorrectionBlock(),
      threads: finalThreads, // Sync for relational refactor
      roadmap: updatedRoadmap,
      narrationLayer: {
        ...(metadata.narrationLayer || {}),
        tensionState: {
          residue: scenes.at(-1)?.momentum?.residue ?? 0,
          level: scenes.at(-1)?.tensionState?.level ?? 0,
          type: scenes.at(-1)?.tensionState?.type ?? 'sustain'
        }
      },
      tensionState: {
        residue: scenes.at(-1)?.momentum?.residue ?? 0,
        level: scenes.at(-1)?.tensionState?.level ?? 0,
        type: scenes.at(-1)?.tensionState?.type ?? 'sustain'
      }
    }
  }

  /**
   * applySimulationPatch (v9.0 SIMULATION PARADIGM)
   * Deterministically applies scene-level state updates to the global context.
   * This eliminates descriptive drift by treating scenes as "state patches".
   */
  private static applySimulationPatch(currentContext: SeriesContext, scenes: any[]): void {
    for (const scene of scenes) {
      if (!scene.simulationPatch) continue

      const { charactersPatch, worldPatch, assetPatch } = scene.simulationPatch

      // 1. Update Character States (locks are prioritized)
      if (charactersPatch) {
        for (const [charId, patch] of Object.entries(charactersPatch)) {
          const normId = normalizeId(charId)
          const char = findInRegistry(currentContext.characterRegistry || {}, normId)
          if (char) {
            // Apply physical locks (eye color, scars, etc.)
            if ((patch as any).locks) {
              char.locks = { ...(char.locks || {}), ...(patch as any).locks }
              console.info(`[Simulation] 🔒 Identity Lock applied to ${normId}:`, (patch as any).locks)
            }
            // Update evolution state
            if ((patch as any).state) {
              const evolution = (currentContext.characterEvolution as any)?.[normId]
              ;(currentContext.characterEvolution as any)[normId] = mergeEvolution(
                typeof evolution === 'string' ? { state: evolution } : evolution || {},
                { state: (patch as any).state },
                currentContext.episodeNumber
              )
            }
          }
        }
      }

      // 2. Update World State (Weather, Time, Spatial Locks)
      if (worldPatch) {
        if (worldPatch.locks) {
          currentContext.worldStateSnapshot = {
            ...(currentContext.worldStateSnapshot || {}),
            ...worldPatch.locks
          }
          console.info(`[Simulation] 🌍 World State Lock applied:`, worldPatch.locks)
        }
        if (worldPatch.weather) currentContext.weatherState = worldPatch.weather
        if (worldPatch.timeOfDay) currentContext.timeOfDay = worldPatch.timeOfDay
      }
    }
  }

  /**
   * compressLongTermMemory
   * Keeps the last N episodes in detail, compresses older ones into a high-level chronicle.
   * Prevents context bloating while maintaining narrative history.
   */
  private static compressLongTermMemory(fullContext: string, currentEp: number, keepDetailed: number = 3): string {
    const lines = fullContext.split('\n')
    const episodes: Record<number, string[]> = {}
    let currentEpisodeNum = -1

    for (const line of lines) {
      const match = line.match(/--- Episode (\d+) ---/)
      if (match) {
        currentEpisodeNum = parseInt(match[1])
        episodes[currentEpisodeNum] = [line]
      } else if (currentEpisodeNum !== -1) {
        episodes[currentEpisodeNum].push(line)
      }
    }

    const episodeNumbers = Object.keys(episodes)
      .map(Number)
      .sort((a, b) => a - b)
    if (episodeNumbers.length <= keepDetailed) return fullContext

    const detailThreshold = currentEp - keepDetailed + 1
    let compressedBlock = '[CHRONIQUE DES ÉPISODES ANCIENS]\n'
    const detailedBlock: string[] = []

    for (const num of episodeNumbers) {
      if (num < detailThreshold) {
        // Extract only the first non-header line (usually the summary)
        const summary = episodes[num].find((l) => l.trim() && !l.includes('--- Episode')) || 'Résumé indisponible.'
        compressedBlock += `Ep ${num}: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}\n`
      } else {
        detailedBlock.push(episodes[num].join('\n'))
      }
    }

    return `${compressedBlock.trim()}\n\n${detailedBlock.join('\n\n')}`.trim()
  }

  /**
   * syncRegistriesFromVision (Saga V6 FOUNDATION)
   * Entry point for aligning registries with actual generated frames.
   */
  public async syncRegistriesFromVision(analysis: {
    locations?: Record<string, string>
    characters?: Record<string, string>
  }) {
    console.info(`[SeriesGenerator] 👁️  Syncing registries from Vision Analysis...`)

    if (analysis.locations) {
      for (const [locId, dna] of Object.entries(analysis.locations)) {
        const id = normalizeId(locId)
        const loc = findInRegistry(this.seriesContext.locationRegistry || {}, id)
        if (loc) {
          console.info(`[SeriesGenerator] 📍 Location DNA updated for ${id}`)
          loc.visualDNA = dna
        }
      }
    }

    if (analysis.characters) {
      for (const [charId, dna] of Object.entries(analysis.characters)) {
        const id = normalizeId(charId)
        const char = findInRegistry(this.seriesContext.characterRegistry || {}, id)
        if (char) {
          console.info(`[SeriesGenerator] 👤 Character DNA updated for ${id}`)
          char.visualDNA = dna
        }
      }
    }
  }

  // ─── Registry Helpers ───────────────────────────────────────────────────────

  public static normalizeId(id: string): string {
    return normalizeId(id)
  }

  public static findInRegistry<T>(registry: Record<string, T>, targetId: string): T | undefined {
    return findInRegistry(registry, targetId)
  }

  public static findKeyInRegistry<T>(registry: Record<string, T>, targetId: string): string | undefined {
    return findKeyInRegistry(registry, targetId)
  }

  private static mergeEvolution(
    base: Record<string, string | EvolutionState>,
    updates: Record<string, string | EvolutionState>,
    episodeNumber?: number
  ): Record<string, EvolutionState> {
    return mergeEvolution(base, updates, episodeNumber)
  }

  /**
   * Promotes character status based on evolution data.
   * Priority: Explicit status > Keyword matching (fallback)
   */
  private static promoteCharacterStatus(char: any, evolution: EvolutionState, sceneId: string, currentEp: number) {
    const name = char.name || 'Unknown'
    const state = evolution.state?.toLowerCase() || ''
    const explicitStatus = evolution.status?.toLowerCase()

    // 1. Explicit Status Promotion (Preferred)
    if (explicitStatus) {
      if (explicitStatus === 'dead' && char.status !== 'dead') {
        console.info(`[SeriesGenerator] 💀 Character confirmed DEAD (explicit) in scene ${sceneId}.`)
        char.status = 'dead'
        char.deathEpisode = currentEp
        char.deathSceneId = sceneId
        return
      }
      if (explicitStatus === 'alive' && char.status === 'dead') {
        console.info(`[SeriesGenerator] ✨ Character RESURRECTED (explicit) in scene ${sceneId}!`)
        char.status = 'alive'
        char.deathEpisode = undefined
        char.deathSceneId = undefined
        return
      }
      if (
        ['missing', 'injured', 'captured', 'corrupted', 'alive'].includes(explicitStatus) &&
        char.status !== explicitStatus
      ) {
        console.info(`[SeriesGenerator] 🔄 Status update for ${name}: ${char.status} -> ${explicitStatus}`)
        char.status = explicitStatus
        return
      }
    }

    // 2. Keyword-based Fallback (Legacy/Robustness)
    const STATUS_KEYWORDS = {
      dead: [/mort[ée]?s?\b/, /décéd[ée]s?\b/, /\bdead\b/, /tu[ée]s?\b/, /killed/, /assassinat/],
      missing: [/disparu[ée]?s?\b/, /\bmissing\b/, /enlev[ée]s?\b/, /kidnapped/, /perdu[ée]s?\b/],
      injured: [/bless[ée]s?\b/, /\binjured\b/, /wounded/, /souffrant/],
      captured: [/captur[ée]s?\b/, /prisonnier[es]?\b/, /\bcaptured\b/, /enferm[ée]s?\b/],
      corrupted: [/corrompu[ée]s?\b/, /\bcorrupted\b/, /tra[îi]tre\b/, /betrayer/, /sombré/],
      resurrected: [/ressuscit[ée]s?\b/, /resurrected/, /revenu à la vie/, /vivante?\b/]
    }

    const matches = (keywords: RegExp[]) => keywords.some((regex) => regex.test(state))

    if (matches(STATUS_KEYWORDS.dead) && char.status !== 'dead') {
      char.status = 'dead'
      char.deathEpisode = currentEp
      char.deathSceneId = sceneId
    } else if (matches(STATUS_KEYWORDS.resurrected) && char.status === 'dead') {
      char.status = 'alive'
      char.deathEpisode = undefined
      char.deathSceneId = undefined
    } else {
      for (const status of ['missing', 'injured', 'captured', 'corrupted'] as const) {
        if (matches(STATUS_KEYWORDS[status]) && char.status !== status) {
          char.status = status
          break
        }
      }
    }
  }

  // ─── Saga V3: Modular Pipelines ───────────────────────────────────────────

  private static processRoadmapUpdates(currentRoadmap: any, metadata: any): any {
    if (!metadata.roadmapUpdate) return currentRoadmap || {}
    const updatedRoadmap = { ...metadata.roadmapUpdate }

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
    return updatedRoadmap
  }

  private static processRegistryUpdates(
    metadata: any,
    registries: { characters: any; locations: any; assets: any; visual: any },
    currentEp: number
  ) {
    const {
      characters: updatedRegistry,
      locations: updatedLocationRegistry,
      assets: updatedAssetRegistry,
      visual: updatedVisualRegistry
    } = registries

    // 1. Characters
    if (metadata.characterContinuity) {
      for (const [rawName, data] of Object.entries(metadata.characterContinuity)) {
        const name = SeriesVideoGenerator.normalizeId(rawName)
        const existing = SeriesVideoGenerator.findInRegistry(updatedRegistry, name)
        const charData = data as any

        if (existing) {
          const charAny = existing as any
          if (charData.description) charAny.description = charData.description
          if (charData.backstory) charAny.backstory = charData.backstory
          if (charData.personalGoal) charAny.personalGoal = charData.personalGoal
          if (charData.motivation) charAny.motivation = charData.motivation
          if (charData.abilities) charAny.abilities = charData.abilities
          if (charData.knownFacts) charAny.knownFacts = charData.knownFacts
          if (charData.fate) charAny.fate = charData.fate
          if (charData.status) charAny.status = charData.status

          if (charData.isNew) {
            charAny.thumbnailUrl = undefined
          }
          registerCharacterVisual(updatedVisualRegistry, name, charData.description || '')
        } else {
          updatedRegistry[name] = {
            description: charData.description || '',
            isNew: true,
            firstMentionedEpisode: currentEp
          }
          registerCharacterVisual(updatedVisualRegistry, name, charData.description || '')
        }
      }
    }

    if (metadata.newCharacters) {
      for (const [rawName, desc] of Object.entries(metadata.newCharacters)) {
        const name = SeriesVideoGenerator.normalizeId(rawName)
        const existing = SeriesVideoGenerator.findInRegistry(updatedRegistry, name)
        if (!existing) {
          updatedRegistry[name] = {
            description: desc as string,
            isNew: true,
            firstMentionedEpisode: currentEp
          }
          registerCharacterVisual(updatedVisualRegistry, name, desc as string)
        }
      }
    }

    // 2. Locations
    if (metadata.locationContinuity) {
      for (const [rawId, info] of Object.entries(metadata.locationContinuity)) {
        const id = SeriesVideoGenerator.normalizeId(rawId)
        const locInfo = info as any
        const existing =
          updatedLocationRegistry[id] || SeriesVideoGenerator.findKeyInRegistry(updatedLocationRegistry, id)
        const effectiveLoc = existing ? updatedLocationRegistry[existing as string] : undefined

        if (!effectiveLoc) {
          updatedLocationRegistry[id] = {
            description: locInfo.description || '',
            atmosphere: locInfo.atmosphere || '',
            firstMentionedEpisode: currentEp
          }
          registerLocationVisual(updatedVisualRegistry, id, locInfo.description || '', [])
        } else {
          if (locInfo.description) effectiveLoc.description = locInfo.description
          if (locInfo.atmosphere) effectiveLoc.atmosphere = locInfo.atmosphere
          if (locInfo.isNew) effectiveLoc.thumbnailUrl = undefined
          registerLocationVisual(updatedVisualRegistry, id, locInfo.description || '', [])
        }
      }
    }

    if (metadata.newLocations) {
      for (const [rawId, desc] of Object.entries(metadata.newLocations)) {
        const id = SeriesVideoGenerator.normalizeId(rawId)
        const existingKey = updatedLocationRegistry[id]
          ? id
          : SeriesVideoGenerator.findKeyInRegistry(updatedLocationRegistry, id)
        if (!existingKey) {
          updatedLocationRegistry[id] = {
            description: desc as string,
            firstMentionedEpisode: currentEp
          }
          registerLocationVisual(updatedVisualRegistry, id, desc as string, [])
        }
      }
    }
  }

  private static processThreadsAndStakes(
    context: SeriesContext,
    metadata: any,
    currentEp: number
  ): { threads: NarrativeThread[]; stakes: ResolvedStake[] } {
    const threadRegistry = (context as any).threads || context.unresolvedThreads || []
    const resolvedStakes = [...((context as any).resolvedStakes || [])]
    const aiThreads: NarrativeThread[] = metadata.unresolvedThreads || []
    const threadUpdates: any[] = metadata.threadUpdates || []

    const threadById = new Map<string, NarrativeThread>()
    const threadByTitle = new Map<string, NarrativeThread>()

    threadRegistry.forEach((t: NarrativeThread) => {
      if (t.id) threadById.set(t.id, t)
      threadByTitle.set(t.title.toLowerCase().trim().replace(/\?$/, ''), t)
    })

    let threadCounter = threadById.size

    const processThread = (t: any) => {
      let existing = t.id ? threadById.get(t.id) : undefined
      const titleKey = t.title?.toLowerCase().trim().replace(/\?$/, '')
      if (!existing && titleKey) existing = threadByTitle.get(titleKey)

      const id = existing?.id || t.id || `T${++threadCounter}`
      const merged = { ...(existing || {}), ...t, id, lastUpdatedEpisode: currentEp }

      if (t.status === 'resolved') {
        resolvedStakes.push({
          id,
          title: merged.title || 'Unknown Thread',
          resolution: merged.description || t.description,
          episodeNumber: currentEp,
          resolutionSceneId: t.resolutionSceneId,
          mustResolveBy: merged.mustResolveBy
        })
        threadById.delete(id)
      } else {
        threadById.set(id, merged)
      }
    }

    threadUpdates.forEach(processThread)
    aiThreads.forEach(processThread)

    const finalThreads: NarrativeThread[] = Array.from(threadById.values()).map((t: NarrativeThread) => {
      if (t.title && !t.title.trim().endsWith('?')) {
        return { ...t, title: `${t.title.trim()} ?` }
      }
      return t
    })

    return { threads: finalThreads, stakes: resolvedStakes }
  }

  private static processEvolutionStates(
    context: SeriesContext,
    metadata: any,
    scenes: any[],
    registries: { locations: any }
  ): {
    visualEvolution: Record<string, any>
    assetEvolution: Record<string, any>
    characterEvolution: Record<string, any>
    relationshipMap: Record<string, any>
    worldStateSnapshot?: any
  } {
    const epNum = context.episodeNumber
    const updatedVisualEvolution = mergeEvolution(context.visualEvolution || {}, metadata.visualEvolution || {}, epNum)
    const updatedAssetEvolution = mergeEvolution(context.assetEvolution || {}, metadata.assetEvolution || {}, epNum)
    const updatedCharacterEvolution = mergeEvolution(
      context.characterEvolution || {},
      metadata.characterEvolution || {},
      epNum
    )
    const updatedRelationshipMap = { ...(context.relationshipMap || {}), ...(metadata.relationshipMap || {}) }

    for (const scene of scenes) {
      if (scene.visualEvolution) {
        for (const [name, state] of Object.entries(scene.visualEvolution)) {
          updatedVisualEvolution[SeriesVideoGenerator.normalizeId(name)] = {
            state: state as string,
            referenceSceneId: scene.id,
            referenceEpisode: epNum
          }
        }
      }
      if (scene.assetEvolution) {
        for (const [name, state] of Object.entries(scene.assetEvolution)) {
          updatedAssetEvolution[SeriesVideoGenerator.normalizeId(name)] = {
            state: state as string,
            referenceSceneId: scene.id,
            referenceEpisode: epNum
          }
        }
      }
      if (scene.characterEvolution) {
        for (const [name, state] of Object.entries(scene.characterEvolution)) {
          updatedCharacterEvolution[SeriesVideoGenerator.normalizeId(name)] = {
            state: state as string,
            referenceSceneId: scene.id,
            referenceEpisode: epNum
          }
        }
      }
      if (scene.relationshipMap) {
        for (const [char, targets] of Object.entries(scene.relationshipMap)) {
          updatedRelationshipMap[char] = { ...(updatedRelationshipMap[char] || {}), ...(targets as any) }
        }
      }

      // Delta & Visual State Propagation (V4)
      if (scene.locationId) {
        const id = SeriesVideoGenerator.normalizeId(scene.locationId)
        const locKey = registries.locations[id] ? id : SeriesVideoGenerator.findKeyInRegistry(registries.locations, id)
        const loc = locKey ? registries.locations[locKey] : undefined
        if (loc) {
          if (!loc.dynamicState) loc.dynamicState = { changes: [], damages: [] }
          if (scene.visualDelta?.changes)
            loc.dynamicState.changes = [...new Set([...(loc.dynamicState.changes || []), ...scene.visualDelta.changes])]
          if (scene.visualDelta?.damages)
            loc.dynamicState.damages = [...new Set([...(loc.dynamicState.damages || []), ...scene.visualDelta.damages])]

          if (scene.visualBaseState) {
            loc.dynamicState.baseState = { ...(loc.dynamicState.baseState || {}), ...scene.visualBaseState }
            if (scene.visualBaseState.persistentElements) {
              loc.dynamicState.baseState.persistentElements = [
                ...new Set([
                  ...(loc.dynamicState.baseState.persistentElements || []),
                  ...(scene.visualBaseState.persistentElements || [])
                ])
              ]
            }
          }
          if (scene.visualStateLock) {
            loc.dynamicState.stateLock = { ...(loc.dynamicState.stateLock || {}), ...scene.visualStateLock }
            if (scene.visualStateLock.mustPersist) {
              loc.dynamicState.stateLock.mustPersist = [
                ...new Set([
                  ...(loc.dynamicState.stateLock.mustPersist || []),
                  ...(scene.visualStateLock.mustPersist || [])
                ])
              ]
            }
            if (scene.visualStateLock.forbiddenChanges) {
              loc.dynamicState.stateLock.forbiddenChanges = [
                ...new Set([
                  ...(loc.dynamicState.stateLock.forbiddenChanges || []),
                  ...(scene.visualStateLock.forbiddenChanges || [])
                ])
              ]
            }
          }
        }
      }
    }

    // Capture the LATEST World State Snapshot from the last scene of the episode
    const lastSceneWithSnapshot = [...scenes].reverse().find((s) => s.worldStateSnapshot)
    const latestSnapshot = lastSceneWithSnapshot?.worldStateSnapshot || context.worldStateSnapshot

    return {
      visualEvolution: updatedVisualEvolution,
      assetEvolution: updatedAssetEvolution,
      characterEvolution: updatedCharacterEvolution,
      relationshipMap: updatedRelationshipMap,
      worldStateSnapshot: latestSnapshot
    }
  }

  private static processLoreUpdates(currentContext: string | undefined, metadata: any, epNum: number): string {
    let context = currentContext || ''
    if (!metadata.loreUpdates || !Array.isArray(metadata.loreUpdates)) return context

    const updates = metadata.loreUpdates.filter((update: string) => {
      const normalized = update.toLowerCase().trim()
      // Basic deduplication: don't add if already present in lore bible
      return !context.toLowerCase().includes(normalized)
    })

    if (updates.length > 0) {
      const addition = updates.join('\n')
      context = `${context}\n\n[LORE UPDATE EPISODE ${epNum}]\n${addition}`.trim()
    }
    return context
  }

  private static promoteVisualReferences(
    scenes: any[],
    registries: { characters: any; locations: any; assets: any },
    evolutions: { character: any },
    currentEp: number,
    metadata: any
  ) {
    for (const scene of scenes) {
      const fullText = `${scene.summary || ''} ${scene.narration || ''} ${scene.imagePrompt || ''}`.toLowerCase()

      // 1. Locations
      if (scene.locationId) {
        const id = SeriesVideoGenerator.normalizeId(scene.locationId)
        const locKey = registries.locations[id] ? id : SeriesVideoGenerator.findKeyInRegistry(registries.locations, id)
        const loc = locKey ? registries.locations[locKey] : undefined
        if (loc) {
          if (!loc.originSceneId) {
            loc.originSceneId = scene.id
            loc.originEpisode = currentEp
          }
          const isEstablishing =
            scene.isEstablishingShot || scene.shotType === 'ESTABLISHING' || scene.shotType === 'WIDE'
          if (scene.imageUrl && (!loc.thumbnailUrl || isEstablishing)) {
            loc.thumbnailUrl = scene.imageUrl
            loc.referenceSceneId = scene.id
            loc.referenceEpisode = currentEp
          }
        }
      }

      // 2. Characters
      for (const [name, char] of Object.entries(registries.characters)) {
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
        const name = SeriesVideoGenerator.normalizeId(charId.replace(/^@/, ''))
        const char = registries.characters[name]
        const charEvol = evolutions.character[name]
        if (char && charEvol) SeriesVideoGenerator.promoteCharacterStatus(char, charEvol, scene.id, currentEp)
        const isCloseUp = scene.shotType === 'CLOSEUP' || scene.shotType === 'EXTREME_CLOSEUP'
        if (char && scene.imageUrl && (!char.thumbnailUrl || char.isNew || isCloseUp)) {
          char.thumbnailUrl = scene.imageUrl
          char.referenceSceneId = scene.id
          char.referenceEpisode = currentEp
        }
      }

      // 3. Assets
      const assets = metadata.assetRegistry || {}
      for (const assetName of Object.keys(assets)) {
        const asset = registries.assets[assetName]
        if (asset) {
          if (!asset.originSceneId && fullText.includes(assetName.toLowerCase())) {
            asset.originSceneId = scene.id
            asset.originEpisode = currentEp
          }
          if (
            scene.imageUrl &&
            scene.imagePrompt?.toLowerCase().includes(assetName.toLowerCase()) &&
            !asset.thumbnailUrl
          ) {
            asset.thumbnailUrl = scene.imageUrl
            asset.referenceSceneId = scene.id
            asset.referenceEpisode = currentEp
          }
        }
      }
    }
  }
}
