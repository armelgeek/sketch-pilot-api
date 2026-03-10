/**
 * Shared types for the PromptMaker system.
 * Extracted to avoid circular dependencies between prompt-manager.ts and spec files.
 */

export interface PromptMakerOptions {
  subject: string
  duration: string
  audience: string
  maxScenes: number
}

/**
 * Interface defining a complete video type specification.
 */
export interface VideoTypeSpecification {
  name: string
  role: string
  context: string
  audienceDefault: string
  character: string
  task: string
  goals: string[]
  structure: string
  visualStyle: string
  rules: string[]
  formatting: string
  outputFormat: string
  instructions: string[]

  // Optional advanced storytelling attributes
  narrativeVoice?: {
    person: string
    tone: string
    pacing: string
    forbidden: string[]
  }
  anchorTechniques?: string[]
  emotionalArc?: Record<string, { label: string; tension: string; mood: string }>
  closingQuestionTemplate?: string
}
