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
}
