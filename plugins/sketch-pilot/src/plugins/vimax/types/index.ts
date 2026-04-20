// ─────────────────────────────────────────────
// Vimax Core Types & Interfaces
// ─────────────────────────────────────────────

export interface VisualAnchorState {
  lastNarration?: string
  lastImagePrompt?: string
  pacing?: number
  characterPositions?: Record<string, string>
  worldState?: Record<string, string>
  dominantLight?: string
  cameraAxis?: any
  activeProps?: string[]
}

export interface CharacterState {
  identifier: string
  physicalState: string
  emotionalState: string
  lastKnownPosition?: string
  physicalDescription?: string
}

export interface GenerationResult<T> {
  data: T
  confidence: 'high' | 'low' | 'fallback'
  retryCount: number
}

export interface ContinuityReport {
  isValid: boolean
  issues: string[]
  score: number // 0-100
  contradictions?: string[]
  missingResolutions?: string[]
  toneBreaks?: string[]
  approved?: boolean
}

export interface SceneValidation {
  isValid: boolean
  issues: string[]
  narrationLocked?: boolean
  correctedNarration?: string
}

export interface MidpointAuditResult {
  driftDetected?: boolean
  tensionIssues?: boolean
  recommendations?: string[]
  scenesToRegenerate: number[]
  globalIssues: string[]
}

export interface FinalAuditResult {
  globalCoherence: number
  approved: boolean
  contradictions?: string[]
  scenePatches: Array<{
    sceneNumber: number
    patch: Partial<VimaxScene>
  }>
  scenesToPatch: Array<{
    sceneNumber: number
    sceneIndex?: number
    patch: Partial<VimaxScene>
  }>
}

export interface CrossLayerValidation {
  narrationVsImage: boolean
  narrationVsCamera: boolean
  narrationVsDialogue: boolean
  narrationVsAnimation: boolean
  issues: string[]
  patches: {
    imagePrompt?: string
    cameraAction?: any
    dialogue?: any[]
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

export interface SagaIntent {
  title: string
  globalTone: string
  centralConflict: string
  climaxAction: string
  resolutionGoal: string
  genre?: string
  tone?: string
  visualStyle?: string
  universeLaws?: string[]
}

export interface SagaPlan {
  intent: SagaIntent | string
  script: string
  episodes: Array<{
    episodeNumber: number
    summary: string
    eventIndex: number
    eventDescription: string
  }>
}

export interface SeriesBible {
  genre: string
  tone: string
  visualStyle: string
  universeLaws?: string[]
  static_features?: string
  dynamic_features?: string
}

export interface SeriesContext {
  characterVoiceHistory?: Record<string, CharacterVoiceHistory[]>
  locationRegistry?: Record<string, LocationState>
  tensionCurve?: number[]
  lastEpisodeSummary?: string
  lastEpisodeBridge?: string
  previousEpisodes?: any[]
  seriesBible?: SeriesBible | string
  intent?: SagaIntent | string
  characterStates?: CharacterState[]
}

export interface VimaxSeries {
  id: string
  title: string
  episodes: VimaxEpisode[]
  context: SeriesContext
  totalCostUSD?: number
  intent?: SagaIntent | string
  expandedScript?: string
  enhancedScript?: string
}

export interface VimaxEpisode {
  id: string
  episodeNumber: number
  summary: string
  scenes: VimaxScene[]
  eventIndex: number
  eventDescription: string
  narration: string
  characterProfiles: CharacterProfile[]
  continuityReport?: ContinuityReport
  screenplay?: VimaxScreenplay
}

export interface VimaxScene {
  id: string
  sceneNumber: number
  narration: string
  imagePrompt: string
  duration: number
  startTime: number
  dialogue?: any[]
  animationPrompt?: string
  acting?: string
  tensionState: {
    level: number
    label: string
    type?: string
  }
  cameraAction: any
  composition?: any
  locationId: string
  charactersInScene: string[]
  simulationPatch: {
    charactersPatch: Record<string, any>
    worldPatch: Record<string, string>
  }
  scenePurpose?: string
  sceneDelta?: string
  pacing?: number
}

export interface CharacterProfile {
  identifier: string // @Nom
  physicalDescription: string
  personalityTraits: string[]
  roleInSaga: string
  currentMood: string
  static_features?: string
  dynamic_features?: string
}

export interface CharacterVoiceHistory {
  identifier: string
  lastLines: string[]
  currentEmotionalState: string
  voiceSignature: string
  episodeId?: string
  sceneNumber?: number
  line?: string
  acting?: string
}

export interface DialogueLine {
  character: string
  text: string
  acting?: string
  relativeStart?: number
  duration?: number
}

export interface LocationState {
  id: string
  name: string
  lastImagePrompt: string
  atmosphere: string
  evolution: string
  currentState?: string
  modifications: string[] // Non-optional for map
  locationId?: string
}

export interface VimaxEvent {
  description: string
  duration: number
  isClimax: boolean
}

export interface VimaxRunOptions {
  seriesContext?: SeriesContext
  compressionThreshold?: number
  targetDuration?: number
  maxScenes?: number
  manualEpisodes?: string[]
  intent?: SagaIntent | string
  targetEpisodeCount?: number
  visualStyle?: string
  colorPalette?: string[]
  seriesId?: string
  reviewGates?: ReviewGate['stage'][]
}

export interface SceneRoleRegistry {
  lockedRoles: Record<number, string>
}

export interface CharacterStateTracker {
  states: Record<string, any>
}

export interface LocationTracker {
  states: Record<string, any>
}

export interface PlotContract {
  unresolvedThreads: string[]
  promises: string[]
  openPromises: Array<{
    description: string
    introducedAtScene: number
    mustResolveBy: number
  }>
  closedPromises: string[] // Non-optional
}

export interface SceneMemory {
  sceneNumber: number
  summary: string
  lastAction: string
  tensionLevel: number
  role?: string
  plotContract?: PlotContract
  locationStates?: LocationState[]
  characterStates?: CharacterState[]
  charactersPresent?: string[]
  location?: string
}

export interface VimaxScreenplay {
  title: string
  titles?: string[]
  scenes: VimaxScene[]
  tensionCurve: number[]
  seriesMetadata?: any
}

// Legacy exports
export type SagaPlanInterface = SagaPlan
export type EpisodeBridge = string

// ─────────────────────────────────────────────
// Prompt Learning System Types
// ─────────────────────────────────────────────

export interface LearningEpisode {
  id: string
  agentName: string
  seriesId?: string
  systemPrompt: string
  userPrompt: string
  response: string
  timestamp: number
  durationMs: number
  status: 'pending' | 'success' | 'failure' | 'shadow_tested'
  evaluation?: EvaluationReport
}

export interface EvaluationReport {
  score: number // 0-100
  isValid: boolean
  issues: string[]
  critique?: string
  source: 'auditor' | 'human' | 'system' | 'vision'
}

export interface Lesson {
  id: string
  agentName: string
  directive: string
  category: 'style' | 'logic' | 'syntax' | 'continuity'
  confidence: number
  successCount: number
  failCount: number
  lastUpdated: number
  examples?: { input: string; output: string }[]
}

export interface LessonStore {
  lessons: Lesson[]
  globalDirectives: string[]
}
