// ─────────────────────────────────────────────
// POJO — Plain Data Types (no class methods)
// ─────────────────────────────────────────────

export type SagaIntent = 'narrative' | 'motion' | 'montage' | 'viral' | 'dramatic'

// ─── Character ───────────────────────────────

export interface CharacterProfile {
  index: number
  identifier: string // "@Alexandre"
  static_features: string // traits physiques permanents
  dynamic_features: string // vêtements, accessoires
}

export type ScenePurpose = 'reveal' | 'escalate' | 'misdirect' | 'stabilize' | 'collapse'
export type ShotType = 'CLOSEUP' | 'MEDIUM' | 'WIDE' | 'ESTABLISHING' | 'PANORAMIC' | 'POV' | 'OVERSHOULDER'
export type LayoutType = 'SINGLE' | 'MONTAGE' | 'SPLIT' | 'DIAGONAL'
export type CameraActionType =
  | 'none'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'shake'
  | 'breathing'
  | 'snap-zoom'
  | 'dutch-tilt'
  | 'handheld'
  | 'slow-motion'
  | 'push-in'
export type CameraIntensity = 'low' | 'medium' | 'high'
export type TensionType = 'build' | 'sustain' | 'spike' | 'release'
export type CliffhangerType = 'revelation' | 'peril' | 'choice' | 'betrayal' | 'unknown'

// ─── Event ───────────────────────────────────

export interface VimaxEvent {
  index: number
  description: string
  processChain: string[]
  isLast: boolean
}

// ─── Saga Planning ───────────────────────────

export interface SagaPlan {
  intent: SagaIntent
  script: string
}

// ─── Scene Components ────────────────────────

export interface CameraAction {
  type: CameraActionType
  intensity: CameraIntensity
}

export interface Composition {
  shotType: ShotType
  lightingMood: string
  layout: LayoutType
  foreground?: string
  midground?: string
  background?: string
}

export interface TensionState {
  level: number // 1-10
  type: TensionType
}

export interface WorldPatch {
  weather?: string
  time?: string
  locks?: string[]
}

export interface CharacterPatch {
  status: string
  evolution?: string
  location?: string
}

export interface SimulationPatch {
  worldPatch: WorldPatch
  charactersPatch: Record<string, CharacterPatch>
}

export interface DialogueLine {
  character: string
  text: string
  acting?: string // ex: "Excité, sautillant"
  relativeStart?: number // 0.0 (début) à 1.0 (fin de scène)
  duration?: number // durée estimée en secondes
}

// ─── Scene ───────────────────────────────────

export interface VimaxScene {
  id: string
  sceneNumber: number
  scenePurpose: ScenePurpose
  sceneDelta: string
  narration: string
  imagePrompt: string // généré par SagaPlanner (motion)
  charactersInScene: string[]
  locationId: string
  pacing: number // 1-10
  cameraAction: CameraAction[]
  composition: Composition
  tensionState: TensionState
  simulationPatch: SimulationPatch
  dialogue?: DialogueLine[]
  duration: number // durée de la scène en secondes
  startTime: number // début de la scène (cumulé depuis t=0 de l'épisode)
  animationPrompt?: string // actions spécifiques des personnages (ex: "Banane pointe du doigt")
  acting?: string // émotions/intentions de jeu (ex: "Sarcastic", "Sad")
}

// ─── Screenplay ──────────────────────────────

export interface Cliffhanger {
  type: CliffhangerType
  description: string
  audienceQuestion: string
}

export interface CharacterContinuity {
  description: string
  status: string
}

export interface LocationContinuity {
  description: string
  atmosphere: string
}

export interface SeriesMetadata {
  episodeSummary: string
  cliffhanger: Cliffhanger
  characterContinuity: Record<string, CharacterContinuity>
  locationContinuity: Record<string, LocationContinuity>
}

export interface VimaxScreenplay {
  seriesMetadata: SeriesMetadata
  titles: string[]
  scenes: VimaxScene[]
}

// ─── Episode ─────────────────────────────────

export interface VimaxEpisode {
  eventIndex: number
  eventDescription: string
  narration: string
  characterProfiles: CharacterProfile[] // profils visuels extraits pour cet épisode
  screenplay: VimaxScreenplay
  continuityReport?: ContinuityReport
}

// ─── Series ──────────────────────────────────

export interface VimaxSeries {
  intent: SagaIntent
  expandedScript: string
  enhancedScript: string // script après VimaxScriptEnhancer
  episodes: VimaxEpisode[]
}

// ─── Context ─────────────────────────────────

export interface SeriesBible {
  genre: string
  tone: string
  visualStyle: string // ex: "Whiteboard Animation", "3D Render", "Watercolor"
  universeLaws: string[] // ex: ["Les objets sont vivants", "La magie existe"]
  language: 'fr' | 'en'
}

export interface SeriesContext {
  seriesBible?: SeriesBible
  characterRegistry?: Record<string, unknown>
  locationRegistry?: Record<string, unknown>
  previousEpisodes?: string[] // résumés compressés des épisodes précédents
  characterProfiles?: CharacterProfile[] // profils visuels injectés dans imagePrompts
  lastEpisodeHook?: string // la toute dernière narration de l'épisode précédent
  lastEpisodeBridge?: EpisodeBridge // Hardening 2.0
  intent?: SagaIntent
  [key: string]: unknown
}

// ─── Options ─────────────────────────────────

export interface VimaxRunOptions {
  seriesContext?: SeriesContext
  compressionThreshold?: number // nb d'épisodes avant compression automatique (défaut: 3)
  targetDuration?: number // durée cible en secondes (ex: 60)
  maxScenes?: number // nombre maximum de scènes (ex: 4)
  manualEpisodes?: string[] // liste optionnelle de résumés d'épisodes (bypass le planning)
  intent?: SagaIntent // intention forcée (si manualEpisodes est présent)
  targetEpisodeCount?: number // nombre cible d'épisodes (ex: 5)
  visualStyle?: string
  colorPalette?: string[]
}

export interface SceneRoleRegistry {
  usedRoles: string[] // ["Arrivée", "Hésitation", "Confrontation"]
  availableRoles: string[] // rôles restants selon l'intent
}

export interface LocationState {
  locationId: string
  currentState: string // "intact" | "en feu" | "inondé" | "détruit"
  modifications: string[] // ["porte arrachée", "fenêtre brisée"]
  lastModifiedAtScene: number
}

export interface VisualAnchorState {
  dominantLight: string // "lumière rouge intermittente"
  cameraAxis: string // "légèrement en contre-plongée"
  characterPositions: Record<string, string> // "@Banane: gauche cadre"
  activeProps: string[] // ["clé USB rouge", "barre de fer"]
}

export interface CharacterState {
  identifier: string // @Banane
  physicalState: string // "blessé à l'épaule gauche"
  lastKnownPosition: string // "derrière la caisse en métal"
  emotionalState: string // "paniqué" | "résolu" | "inconscient"
  lastModifiedAtScene: number
}

export interface TensionCurve {
  sceneCount: number
  curve: number[] // [2, 4, 5, 7, 10] pour 5 scènes
  intent: SagaIntent // "dramatic" → courbe exponentielle, "viral" → spike immédiat
}

export interface PlotPromise {
  description: string // "La bombe dans le couloir B"
  introducedAtScene: number
  mustResolveBy: number // scène limite
  resolved: boolean
}

export interface PlotContract {
  openPromises: PlotPromise[] // éléments introduits non résolus
  closedPromises: PlotPromise[] // éléments résolus
}

export interface CharacterVoiceHistory {
  identifier: string
  lastLines: string[] // 2-3 dernières répliques
  currentEmotionalState: string // synchronisé avec CharacterStateTracker
  voiceSignature: string // "autoritaire et bref" | "sarcastique"
}

export interface EpisodeBridge {
  unresolvedCliffhanger: string // "Qui a tué @Pomme ?"
  missingCharacters: string[] // ["@Alexandre"] disparu depuis ep.2
  activeObjects: string[] // ["la clé USB rouge"]
  worldState: Record<string, string> // état global de l'univers
}

export interface SceneMemory {
  sceneNumber: number
  role: string // ex: "Arrivée", "Confrontation"
  summary: string // narration compressée en 1 phrase
  charactersPresent: string[] // @PascalCase
  location: string
  lastAction: string // dernière action accomplie
  tensionLevel: number // 1-10

  // Hardening 2.0
  usedRoles?: string[]
  locationStates?: LocationState[]
  characterStates?: CharacterState[]
  plotContract?: PlotContract
  voiceHistories?: CharacterVoiceHistory[]
}

// ─── Reliability (RetryOrchestrator) ──────────

export interface GenerationResult<T> {
  data: T
  confidence: 'high' | 'low' | 'fallback'
  retryCount: number
}

export interface ContinuityReport {
  contradictions: string[] // ["@Banane mort scène 3, vivant scène 4"]
  missingResolutions: string[] // ["clé USB introduite scène 1, jamais résolue"]
  toneBreaks: string[] // ["scène 3 comique, brise la tension de scène 2"]
  approved: boolean
}

// ─── Correction Loop (Multi-Pass) ─────────────

export interface SceneValidation {
  isValid: boolean
  issues: string[]
  correctedNarration?: string
}

export interface MidpointAuditResult {
  scenesToRegenerate: number[]
  globalIssues: string[]
}

export interface FinalAuditResult {
  approved: boolean
  contradictions: string[]
  scenesToPatch: { sceneIndex: number; patch: Partial<VimaxScene> }[]
}

export interface CrossLayerValidation {
  narrationVsImage: boolean
  narrationVsCamera: boolean
  narrationVsDialogue: boolean
  narrationVsAnimation: boolean
  issues: string[]
  patches: {
    imagePrompt?: string
    cameraAction?: any // Partial<CameraAction>
    dialogue?: any[] // DialogueLine[]
    animationPrompt?: string
  }
}

export interface InputAnalysis {
  isViable: boolean
  issues: string[]
  suggestions: string[]
  enrichedIdea: string
}

export interface StyleLock {
  visualStyle: string
  colorPalette: string[]
  forbiddenTerms: string[]
  mandatoryTerms: string[]
}

export interface PipelineProfile {
  totalLLMCalls: number
  totalTokensEstimated: number
  bottleneckAgent: string
  costEstimateUSD: number
  scenesRetried: number
  durationMs: number
}

export interface FormattedOutput {
  format: 'json' | 'srt' | 'xml' | 'csv'
  scenes: any[]
  totalDuration: number
  characterIndex: Record<string, CharacterProfile>
  locationIndex: Record<string, any>
}

export interface ReviewGate {
  stage: 'post-script' | 'post-narration' | 'post-generation'
  reviewRequired: boolean
  autoApproveIfScore: number
  humanFeedback?: string
}
