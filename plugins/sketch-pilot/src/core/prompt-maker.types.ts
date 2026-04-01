import type { SceneCountRange } from '../types/video-script.types'

export interface PromptMakerOptions {
  subject: string
  duration: string
  aspectRatio: string
  audience: string
  maxScenes?: number
  language?: string
  minWordCount?: number
  sceneCountRange?: SceneCountRange
}

export interface VideoTypeSpecification {
  name: string
  role: string
  context: string
  audienceDefault: string
  task: string
  goals: string[]
  structure: string
  rules: string[]
  formatting: string
  outputFormat: string
  instructions: string[]

  // --- Support for advanced storytelling attributes ---
  scenePresets?: Record<string, any>
  visualRules?: string[]
  orchestration?: string[]
  /** Global description of the main character to maintain consistency */
  characterDescription?: string

  narrativeRules?: string[]
  styleRules?: string[]
  engagementRules?: string[]
  contrastRules?: string[]
  truthRules?: string[]
  emotionCurve?: string[]
  narrativeRoles?: string[]
  postProcessing?: string[]
  internalCheck?: string[]
  identityTriggers?: string[]
  curiosityRules?: string[]
  escalationRules?: string[]
  patternInterrupts?: string[]
  antiBoringRules?: string[]
  conclusionRules?: string[]
}
