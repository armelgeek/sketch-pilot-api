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
  images?: { data: string; mimeType: string }[]
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

export interface AssetProfile {
  id: string
  name: string
  description: string
  type: string
  thumbnailUrl?: string
}

export interface NarrativeThread {
  id: string
  title: string
  status: 'active' | 'resolved' | 'cliffhanger'
  description: string
}

export interface VisualAtmosphere {
  weatherState?: string
  timeOfDay?: string
  colorPalette?: string
  cameraStyle?: string
  symbolicMotifs?: string[]
}

export interface SagaPlan {
  title: string
  intent: SagaIntent | string
  script: string
  episodes: Array<{
    episodeNumber: number
    summary: string
    eventIndex: number
    eventDescription: string
    hook?: string
  }>
  finalCliffhanger?: string
  characterRegistry: CharacterProfile[]
  locationRegistry: LocationState[]
  assetRegistry: AssetProfile[]
  unresolvedThreads: NarrativeThread[]
  roadmap: any
  atmosphere: VisualAtmosphere
  visualEvolution: Record<string, string>
  relationshipMap: Record<string, Record<string, string>>
}

export interface SeriesBible {
  genre: string
  tone: string
  visualStyle: string
  language?: string
  universeLaws?: string[]
  static_features?: string
  dynamic_features?: string
}

export interface SeriesContext {
  characterVoiceHistory?: Record<string, CharacterVoiceHistory[]>
  characterRegistry?: Record<string, any>
  locationRegistry?: Record<string, LocationState>
  tensionCurve?: number[]
  lastEpisodeSummary?: string
  lastEpisodeBridge?: EpisodeBridge
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
  bridge?: EpisodeBridge
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
  portrait_prompt?: string
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
  userId?: string
  reviewGates?: ReviewGate['stage'][]

  brainMode?: 'stable' | 'all'
  referenceStyleImage?: string // URL ou Base64 de l'image de référence globale
  referencePortraits?: Record<string, string> // Map @Nom -> URL/Base64 portrait
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
export type EpisodeBridge = {
  unresolvedCliffhanger: string
  missingCharacters: string[]
  activeObjects: string[]
  worldState: Record<string, string>
}

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
  appliedLessonIds?: string[]
  evaluation?: EvaluationReport
  learningApplied?: boolean
  narration?: string
  images?: { data: string; mimeType: string }[]
}

export interface EvaluationReport {
  score: number // 0-100
  isValid: boolean
  issues: string[]
  critique?: string
  source: 'auditor' | 'human' | 'system' | 'vision' | 'saga-sentinel'
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
  tags?: string[]
  verified?: boolean
  parentLessonId?: string
  version?: string
  examples?: { input: string; output: string }[]
}

export interface LessonStore {
  version: string
  lessons: Lesson[]
  globalDirectives: string[]
}

// ─────────────────────────────────────────────
// Narrative Audit Types
// ─────────────────────────────────────────────

export interface NarrativeFeedbackItem {
  issue: string
  rationale: string
  correction: string
  example?: string
  priority: 'low' | 'medium' | 'high'
  processed?: boolean
}

export interface NarrativeAuditReport {
  seriesId: string
  globallyCoherent: boolean
  score: number // 0-100
  feedbacks: NarrativeFeedbackItem[]
  themesAnalyzed: string[]
  characterArcsAnalysis: string
}
