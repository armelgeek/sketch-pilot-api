import type { CharacterEnrollment } from '../types/video-script.types'

export interface PromptMakerOptions {
  subject: string
  duration: string
  aspectRatio: string
  audience: string
  maxScenes: number
  language?: string
  characters?: CharacterEnrollment[]
}

/**
 * Interface defining a complete video type specification.
 */
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

  // Optional advanced storytelling attributes
  narrativeVoice?: {
    tone: string
    register: string
    openingPattern?: string
    sectionPattern?: string
    closingPattern?: string
    forbiddenPatterns?: string[]
    // Keep legacy fields for compatibility if needed, but prioritize new ones
    person?: string
    pacing?: string
  }
  anchorTechniques?: string[]
  emotionalArc?: Record<string, { label: string; tension: string; mood: string }>
  closingQuestionTemplate?: string
  /**
   * Optional narrative arc definition for storytelling videos.
   * Maps stage keys to their descriptive label and optional tension/mood hints.
   * Example: { "intro": { label: "Introduction", description: "Set the scene" },
   *            "climax": { label: "Climax", description: "Peak tension moment" } }
   */
  narrativeArc?: Record<string, { label: string; description?: string; tension?: number }>

  // --- Total Dynamization Fields ---
  /** System instruction for the asset generator AI (e.g. pose creator) */
  assetSystemInstruction?: string
  /** Prompt template for character generation. Use placeholders like ${poseId} */
  assetPromptTemplate?: string
  /** Base words per second factor */
  wordsPerSecondBase?: number
  /** Map of override factors for specific languages or providers */
  wordsPerSecondFactors?: Record<string, number>
  /** Default font size as % of canvas height (e.g. 0.08) */
  defaultFontSize?: number
  /** Default font family name */
  defaultFontFamily?: string
  /** Default background generation prompt (e.g. 'A clean white studio background with soft lighting') */
  defaultBackgroundPrompt?: string
  /** Default pose ID (e.g. STAND) */
  defaultPoseId?: string
  /** Default scale for character (e.g. 1.0) */
  defaultPoseScale?: number
  /** Default position (center, left, right) */
  defaultPosePosition?: string
}
