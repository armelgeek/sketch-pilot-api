export interface PromptMakerOptions {
  subject: string
  duration: string
  aspectRatio: string
  audience: string
  maxScenes: number
  language?: string
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

  // --- Support for advanced storytelling attributes ---
  scenePresets?: Record<string, any>
  visualRules?: string[]
  orchestration?: string[]
  /** Global description of the main character to maintain consistency */
  characterDescription?: string
}
