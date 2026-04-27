// ─────────────────────────────────────────────
// Vimax Core Types & Interfaces
// ─────────────────────────────────────────────

export interface VisualAnchorState {
  lastNarration?: string
  lastImagePrompt?: string
  pacing?: number
  characterPositions?: Record<string, string> // [DEPRECATED] Use characterRegistry/context instead
  worldState?: Record<string, string>
  dominantLight?: string
  cameraAxis?: any
  activeProps?: string[]
  characterStates?: Record<string, string> // [V8.2] Physical and emotional state carry-over
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
  fallbackReached?: boolean // [V48] Signal pour l'Amygdale
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

export interface AudienceProfile {
  ageRange: 'kids' | 'teen' | 'adult' | 'all'
  platform: 'tiktok' | 'youtube' | 'cinema' | 'podcast'
  attentionSpan: number // secondes avant drop-off
  culturalContext: string // 'FR' | 'US' | 'JP'...
  expectedPace: 'fast' | 'medium' | 'slow'
}

export interface SagaIntent {
  title: string
  globalTone: string
  centralConflict: string
  climaxAction: string
  resolutionGoal: string
  genre?: string
  subGenre?: string
  tone?: string
  visualStyle?: string
  universeLaws?: string[]
  audience?: AudienceProfile // [V48] Dramaturge
  narrativeIntent?: NarrativeIntent // [V50] ADN Narrative
  authorialSignature?: AuthorialSignature // [V50] Vision d'auteur
  archetypeBlueprint?: ArchetypeBlueprint // [V50] Structure profonde
  transmediaMap?: TransmediaMap // [V55] Multi-couches
  creativeConstraints?: CreativeConstraint[] // [V55] Oulipo engine
}

export interface TransmediaMap {
  layers: Array<{
    type: 'video' | 'podcast' | 'document' | 'social_post' | 'audio_log'
    purpose: string // Ce que cette couche révèle de plus
    targetAudience?: string
  }>
  branchingPoints: Array<{
    atScene: number
    choices: string[]
    consequences: string
  }>
}

export interface CreativeConstraint {
  type: 'forbidden_word' | 'fixed_length' | 'pov_shift' | 'tonal_opposite' | 'lipogram'
  value: string
  mandatory: boolean
}

export interface AuthorialSignature {
  worldview: 'cynical' | 'optimistic' | 'paranoid' | 'melancholic' | 'absurdist' | 'stoic'
  themes: string[]
  stylisticSignature: string // Signature de mise en scène (ex: "Kubrickian symmetry")
}

export interface ArchetypeBlueprint {
  structure: 'hero_journey' | 'tragedy' | 'comedy' | 'rebirth' | 'overcoming_monster' | 'quest' | 'voyage_return'
  protagonistArchetype: 'hero' | 'anti-hero' | 'orphan' | 'wanderer' | 'rebel' | 'ruler' | 'magician' | 'innocent'
  antagonistArchetype: 'shadow' | 'threshold_guardian' | 'shapeshifter' | 'trickster' | 'mentor_corrupted'
  keyBeatsPruned: string[] // Beats obligatoires du genre/structure
}

export interface NarrativeVoice {
  type: 'omniscient' | 'limited' | 'unreliable' | 'first_person' | 'observer'
  focalCharacter?: string // @Nom
  tone: string
  distance: 'close' | 'far'
}

export interface PhrasticRhythm {
  style: 'staccato' | 'cinematic' | 'melancholic' | 'action' | 'suspended'
  sentenceVariety: boolean
  useNominalPhrases: boolean
  elevenLabsTags?: boolean
}

export interface NarrativeGrammar {
  dominantTense: 'present' | 'past_simple' | 'imperfect'
  tenseSwitching: boolean
}

export interface NarrativeIntent {
  voice: NarrativeVoice
  rhythm: PhrasticRhythm
  grammar: NarrativeGrammar
  density: 'sparse' | 'balanced' | 'dense'
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

// ─────────────────────────────────────────────
// V7.0 : Narrative Blueprint & Structured Story
// ─────────────────────────────────────────────

/**
 * Fonctions dramatiques strictes (Save the Cat style).
 */
export type DramaticFunction =
  | 'opening_image'
  | 'theme_stated'
  | 'setup'
  | 'catalyst'
  | 'debate'
  | 'break_into_two'
  | 'b_story'
  | 'fun_and_games'
  | 'midpoint'
  | 'bad_guys_close_in'
  | 'all_is_lost'
  | 'dark_night'
  | 'break_into_three'
  | 'finale'
  | 'final_image'
  | 'stinger'

export type SceneTransitionType = 'continuation' | 'transition' | 'rupture'

export interface CharacterArcStep {
  atSceneIndex: number
  psychologicalState: string
  motivationShift: string
  internalConflictStatus: string
}

export interface CharacterArcPlan {
  identifier: string // @Nom
  primaryTrauma?: string
  initialState: string
  targetTransformation: string
  milestones: CharacterArcStep[]
}

export interface NarrativeDebt {
  id: string
  promise: string
  magnitude: number
  originSceneIndex: number
  targetResolutionEpisode?: number
  isResolved: boolean
  type?: 'revelation' | 'action' | 'consequence' | 'mystery'
  status?: 'active' | 'partially_paid' | 'resolved'
  weight?: 'low' | 'medium' | 'high'
  linkedToCharacter?: string
}

export interface NarrativeBeat {
  index: number
  title: string
  summary: string
  function: DramaticFunction
  act: 1 | 2 | 3
  percentageInSaga: number
  keyRevelation?: string
  tensionTarget: number
  paceTarget: 'slow' | 'medium' | 'fast' | 'staccato'
  impactedCharacters: string[]
  unlockedDebts?: string[]
  resolvedDebts?: string[]
}

export interface NarrativeBlueprint {
  version: '7.0'
  theme: string
  premise: string
  audienceContract: string
  characterArcs: CharacterArcPlan[]
  beatSheet: NarrativeBeat[]
}

export interface SagaPlan {
  seriesId?: string
  title: string
  intent: SagaIntent | string
  script: string
  basicIdea?: string
  options?: VimaxRunOptions
  blueprint?: NarrativeBlueprint
  episodes: Array<{
    episodeNumber: number
    summary: string
    eventIndex: number
    eventDescription: string
    hook?: string
    isDailyLife?: boolean
    isChoral?: boolean
    absentProtagonists?: string[]
    scenes?: Array<{
      sceneNumber: number
      function: string
      objective: string
      characterState: Record<string, string>
      openPromises?: string[]
      resolvedPromises?: string[]
      tensionTarget: number
      paceTarget: string
      obligatory: string
      prepares: string
      cliffhanger?: string
      locationId?: string
      locationContext?: string
      characters?: string[]
    }>
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
  episodeEvents: VimaxEvent[]
  lastRecalibration?: number // [V48]
}

export interface SeriesContext {
  characterVoiceHistory?: Record<string, CharacterVoiceHistory[]>
  characterRegistry?: Record<string, any>
  locationRegistry?: Record<string, LocationState>
  tensionCurve?: number[]
  lastEpisodeSummary?: string
  lastEpisodeBridge?: EpisodeBridge
  lastEpisodeFinalImage?: string
  lastEpisodeFinalScene?: any
  previousEpisodes?: any[]
  seriesBible?: SeriesBible | string
  intent?: SagaIntent | string
  characterStates?: CharacterState[]
  thumbnailUrl?: string
  colorPalette?: string
  cameraStyle?: string
  symbolicMotifs?: string[]
  visualStyle?: string
  visualStyleLock?: StyleLock
  /** Le script global LLM de la saga (series.globalContext en DB) */
  globalScript?: string
  /** Le plan de l'épisode courant (depuis plannedEpisodes en DB) */
  plannedEpisodeContext?: {
    title?: string
    hook?: string
    dramaticFunction?: string
    actPosition?: string
    keyRevelation?: string
    tensionTarget?: number
    paceTarget?: string
    impactedCharacters?: string[]
  }
  /** Le plan de la scène courante (depuis plannedEpisodes[].scenes en DB) */
  plannedSceneContext?: {
    sceneNumber?: number
    function?: string
    objective?: string
    framing?: string
    cameraAngle?: string
    focusSubject?: string
    characterState?: Record<string, string>
    obligatory?: string
    locationId?: string
  }
  /** Indique que le lieu a changé par rapport à la scène précédente (V12.0) */
  locationChanged?: boolean
  /** Le blueprint narratif complet (V7.0) */
  blueprint?: any
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
  visualBeat?: string
  duration: number
  startTime: number
  dialogue?: any[]
  animationPrompt?: string
  acting?: string
  soundscape?: string // [V9.0] Cinematic Sound Design & SFX
  tensionState: {
    level: number
    label: string
    type?: string
  }
  cameraAction: any
  composition?: any
  locationId: string
  locationContext?: string
  charactersInScene: string[]
  simulationPatch: {
    charactersPatch: Record<string, any>
    worldPatch: Record<string, string>
  }
  scenePurpose?: string
  sceneDelta?: string
  pacing?: number
  paceWeight?: number
  isElliptical?: boolean
  transitionType?: SceneTransitionType
}

export interface CharacterProfile {
  identifier: string
  index?: number
  physicalDescription: string
  personalityTraits: string[]
  roleInSaga: string
  currentMood: string
  static_features?: string
  dynamic_features?: string
  portrait_prompt?: string
  thumbnailUrl?: string
  traces?: CharacterTrace[]
  arc_plan?: string // [V3.0] Trajectoire narrative simplifiée
  narrative_memory?: string[] // [V3.0] Historique des faits vécus/vus
  off_screen_state?: string // [V3.0] État pendant les ellipses
}

export interface CharacterTrace {
  id: string
  type: 'scar' | 'wrinkle' | 'prosthetic' | 'behavioral' | 'emotional_scar'
  description: string
  acquiredAtScene: number
  permanent: boolean
  visualImpact: string
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

export interface LocationState {
  id: string
  name: string
  baseVisualPrompt: string // [V32.0] Décor pur sans personnages
  lastImagePrompt: string // [DEPRECATED] Ne pas utiliser comme référence
  atmosphere: string
  evolution: string
  currentState?: string
  modifications: string[]
  locationId?: string
}

export interface VimaxEvent {
  index: number
  description: string
  locationId?: string
  duration: number
  isClimax: boolean
  dramaticFunction?: DramaticFunction
  actPosition?: { act: 1 | 2 | 3; percentageInAct: number }
  characterImpacts?: Array<{
    identifier: string
    arcBefore: string
    arcAfter: string
    emotionalShift: string
  }>
  worldImpacts?: Array<{
    locationId: string
    change: string
    permanent: boolean
  }>
  narrativeDebts?: {
    creates: string[]
    resolves: string[]
  }
  prerequisites?: string[]
  unlocks?: string[]
  tensionTarget?: number
  paceTarget?: 'slow' | 'medium' | 'fast' | 'staccato'
  isDailyLife?: boolean
  isChoral?: boolean
  absentProtagonists?: string[]
  scenes?: Array<{
    sceneNumber: number
    function: string
    objective: string
    characterState: Record<string, string>
    openPromises?: string[]
    resolvedPromises?: string[]
    tensionTarget: number
    paceTarget: string
    obligatory: string
    prepares: string
    cliffhanger?: string
    locationId?: string
    characters?: string[]
    transitionType?: SceneTransitionType
  }>
  transitionType?: SceneTransitionType
  isLast?: boolean
  metadata?: any
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
  referenceStyleImage?: string
  referencePortraits?: Record<string, string>
}

export interface PlotContract {
  unresolvedThreads: string[]
  promises: string[]
  openPromises: Array<{
    description: string
    introducedAtScene: number
    mustResolveBy: number
  }>
  closedPromises: string[]
  debts: NarrativeDebt[]
}

export interface SpectatorCognition {
  inferredKnowledge: string[]
  anticipations: string[]
  surpriseOpportunities: string[]
}

export interface SceneMemory {
  sceneNumber: number
  summary: string
  lastAction: string
  tensionLevel: number
  charactersPresent: string[]
  location: string
  visualBeat?: string
  imagePrompt?: string
  framing?: string
  narrativePulse?: string
  resolutionStatus?: 'resolved' | 'escalated' | 'dangling'
  sceneContext?: string
  locationId?: string
  plotContract?: PlotContract
  locationStates?: LocationState[]
  characterStates?: CharacterState[]
  povCharacter?: string
  informationDensity?: 'sparse' | 'balanced' | 'dense'
  narrativeRhythm?: string
  spectatorCognition?: SpectatorCognition
  emotionalComposite?: string
  moralWeight?: number
  maturationCycle?: MaturationCycle
  isDailyLife?: boolean
  isChoral?: boolean
  absentProtagonists?: string[]
}

export interface MaturationCycle {
  passCount: number
  revisions: Array<{
    timestamp: number
    feedback: string
    improvementDelta: number
  }>
  restingStatus: 'fresh' | 'matured' | 'over-processed'
}

export interface VimaxScreenplay {
  title: string
  titles?: string[]
  scenes: VimaxScene[]
  tensionCurve: number[]
  seriesMetadata?: any
}

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
  score: number
  isValid: boolean
  issues: string[]
  critique?: string
  source: 'auditor' | 'human' | 'system' | 'vision' | 'vision-multimodal' | 'saga-sentinel' | 'vision_sleep'
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
  seriesId?: string
  isSpecific?: boolean
  applicableAt?: 'opening' | 'midpoint' | 'climax' | 'resolution' | 'any'
  strength?: 'always' | 'if_tension_high' | 'if_dialogue_scene' | 'if_action_scene'
  genreScope?: string[]
  deltaScore?: number
  impactRatio?: number
  isUniversal?: boolean
  causalContext?: string
  sourceEpisodeId?: string
}

export interface LessonStore {
  version: string
  lessons: Lesson[]
  globalDirectives: string[]
}

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
  score: number
  feedbacks: NarrativeFeedbackItem[]
  themesAnalyzed: string[]
  characterArcsAnalysis: string
}

// Legacy exports
export type SagaPlanInterface = SagaPlan
export interface EpisodeBridge {
  unresolvedCliffhanger: string
  missingCharacters: string[]
  activeObjects: string[]
  worldState: Record<string, string>
  characterStates?: Record<string, string> // [V8.3] Persistent physical/emotional states across episodes
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
