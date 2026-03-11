import { z } from 'zod'

export type ImageProvider = 'gemini' | 'grok'
export type LLMProvider = 'gemini' | 'grok' | 'claude' | 'haiku'

/**
 * Quality modes for generation:
 * - low-cost: Optimize for minimum cost (ultra-low res images, Haiku LLM, caching)
 * - standard: Balanced quality and cost (low/medium res images, default LLM)
 * - high-quality: Prioritize visual quality (high res images, best LLM models)
 */
export enum QualityMode {
  LOW_COST = 'low-cost',
  STANDARD = 'standard',
  HIGH_QUALITY = 'high-quality'
}

/**
 * Kokoro TTS voice presets
 *
 * American English (af_*
 * - af_heart, af_alloy, af_aoede, af_bella, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky
 * - am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa
 *
 * British English:
 * - bf_alice, bf_emma, bf_isabella, bf_lily
 * - bm_daniel, bm_fable, bm_george, bm_lewis
 */
export enum KokoroVoicePreset {
  // American English - Female
  AF_HEART = 'af_heart',
  AF_ALLOY = 'af_alloy',
  AF_AOEDE = 'af_aoede',
  AF_BELLA = 'af_bella',
  AF_JESSICA = 'af_jessica',
  AF_KORE = 'af_kore',
  AF_NICOLE = 'af_nicole',
  AF_NOVA = 'af_nova',
  AF_RIVER = 'af_river',
  AF_SARAH = 'af_sarah',
  AF_SKY = 'af_sky',

  // American English - Male
  AM_ADAM = 'am_adam',
  AM_ECHO = 'am_echo',
  AM_ERIC = 'am_eric',
  AM_FENRIR = 'am_fenrir',
  AM_LIAM = 'am_liam',
  AM_MICHAEL = 'am_michael',
  AM_ONYX = 'am_onyx',
  AM_PUCK = 'am_puck',
  AM_SANTA = 'am_santa',

  // British English - Female
  BF_ALICE = 'bf_alice',
  BF_EMMA = 'bf_emma',
  BF_ISABELLA = 'bf_isabella',
  BF_LILY = 'bf_lily',

  // British English - Male
  BM_DANIEL = 'bm_daniel',
  BM_FABLE = 'bm_fable',
  BM_GEORGE = 'bm_george',
  BM_LEWIS = 'bm_lewis'
}

/**
 * Time range for a scene (in seconds)
 */
export const timeRangeSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0)
})

export type TimeRange = z.infer<typeof timeRangeSchema>

/**
 * Sound effect configuration
 */
export const soundEffectSchema = z.object({
  id: z.string().optional().describe('Unique identifier for the SFX'),
  type: z
    .enum(['swish', 'pop', 'scratch', 'click', 'whoosh', 'ding', 'jump', 'thud', 'sparkle', 'tick'])
    .or(z.string().transform(() => 'pop' as const))
    .default('pop')
    .describe('Type of sound effect'),
  timestamp: z.number().describe('Relative timestamp in seconds from scene start'),
  volume: z.number().min(0).max(1).default(0.8)
})

export type SoundEffect = z.infer<typeof soundEffectSchema>

/**
 * Camera action configuration
 */
export const cameraActionSchema = z.object({
  type: z
    .enum(['zoom-in', 'zoom-out', 'shake', 'pan-left', 'pan-right', 'static'])
    .or(z.string().transform(() => 'static' as const))
    .default('static'),
  intensity: z.enum(['low', 'medium', 'high']).default('medium'),
  duration: z.number().optional().describe('Duration of the effect in seconds'),
  timestamp: z.number().default(0).describe('Start time relative to scene start')
})

export type CameraAction = z.infer<typeof cameraActionSchema>

/**
 * Transition configuration
 */
export const transitionTypeSchema = z
  .enum([
    'cut',
    'fade',
    'slide-left',
    'slide-right',
    'slide-up',
    'slide-down',
    'wipe',
    'zoom-in',
    'pop',
    'swish',
    'none'
  ])
  .or(z.string().transform(() => 'cut' as const))
  .default('cut')

export type TransitionType = z.infer<typeof transitionTypeSchema>

/**
 * Character variant types
 */
export const characterVariantSchema = z
  .string()
  .describe('The character variant or name to use for this scene (e.g. "Narrator", "Expert", "Customer")')

export type CharacterVariant = z.infer<typeof characterVariantSchema>

/**
 * Character sheet for recurring characters
 */
export const characterSheetSchema = z.object({
  id: z.string().describe('Unique identifier (e.g. CHAR-01)'),
  name: z.string(),
  role: z.string().describe('Role in the story'),
  appearance: z.object({
    description: z.string().describe('Base style (Round head, stick limbs, etc.)'),
    clothing: z.string(),
    accessories: z.string(),
    colorPalette: z.array(z.string()),
    uniqueIdentifiers: z.array(z.string())
  }),
  expressions: z.array(z.string()).describe('List of primary expressions for this character'),
  imagePrompt: z.string().describe('Full-body 16:9 prompt in Crayon Capital style for consistent generation')
})

export type CharacterSheet = z.infer<typeof characterSheetSchema>

/**
 * Styling for onscreenText overlay.
 * Supports keyword coloring, multi-line wrapping, and positioning.
 */
export const onscreenTextStyleSchema = z.object({
  enabled: z.boolean().default(false).describe('Whether to actually display the onscreenText.'),
  color: z.string().default('#000000').describe('Default text color (hex)'),
  fontFamily: z.string().default('sans-serif').describe('Font family name'),
  fontSize: z
    .number()
    .optional()
    .describe('Font size in pixels. If omitted, auto-calculated from canvas height (~8%).'),
  fontWeight: z.enum(['normal', 'bold', 'bolder']).default('bold').describe('Font weight'),
  maxWordsPerLine: z.number().default(6).describe('Maximum words per line before wrapping to next line'),
  position: z
    .enum(['top', 'bottom', 'center', 'custom'])
    .default('center')
    .describe('Text vertical position. "custom" uses x/y.'),
  x: z.number().optional().describe('Custom X position (0-100% of width) when position is "custom"'),
  y: z.number().optional().describe('Custom Y position (0-100% of height) when position is "custom"'),
  highlightWords: z
    .array(
      z.object({
        word: z.string().describe('The exact word or phrase to highlight'),
        color: z.string().optional().describe('Highlight color (hex). If omitted, uses highlightColor or textColor.')
      })
    )
    .optional()
    .describe('Words to render in a different color for emphasis'),
  highlightColor: z.string().optional().describe('Default highlight color for this style block.')
})

export type OnscreenTextStyle = z.infer<typeof onscreenTextStyleSchema>

/**
 * Styling for character pose.
 */
export const poseStyleSchema = z.object({
  position: z.enum(['left', 'center', 'right', 'custom']).default('center').describe('Character horizontal position.'),
  x: z.number().optional().describe('Custom X position (0-100% of width) when position is "custom"'),
  y: z.number().optional().describe('Custom Y position (0-100% of height) when position is "custom"'),
  scale: z.number().default(1).describe('Scale factor for the character (1.0 = standard height ~80% of canvas)')
})

export type PoseStyle = z.infer<typeof poseStyleSchema>

/**
 * Enriched scene with all details needed for generation
 */
export const enrichedSceneSchema = z.object({
  id: z.string(),
  sceneNumber: z.number().int().positive(),
  timeRange: timeRangeSchema,
  duration: z.number().optional().describe('Scene duration in seconds (aim for 10-12s)'),
  timestamp: z.number().optional().describe('Start timestamp of the scene'),
  summary: z.string().optional().describe('Concise summary of identifying actions in the scene'),
  narration: z.string().describe('Main narrative text for the scene'),
  actions: z.array(z.string()).describe('List of physical actions the character performs'),
  expression: z.string().describe('Facial expression and emotional state'),
  characterIds: z.array(z.string()).optional().describe('List of character IDs present in the scene'),
  speechBubble: z.string().nullish().describe('Text for speech bubble dialogue (if any)'),
  onscreenText: z
    .string()
    .optional()
    .describe(
      'The primary text to display as a large overlay on the screen (e.g. titles, keywords). When poseId is NONE, this is the main visual element.'
    ),
  onscreenTextSuggestions: z
    .array(z.string())
    .optional()
    .describe(
      'A list of 3-5 alternative text suggestions for this scene, allowing the user to choose or customize the overlay.'
    ),
  onscreenTextStyle: onscreenTextStyleSchema
    .optional()
    .describe('Styling for onscreenText. Supports keyword coloring, multi-line, and positioning.'),
  eyelineMatch: z
    .enum(['left', 'right', 'up', 'down', 'center', 'forward'])
    .catch('center')
    .optional()
    .describe('Direction in which the character is looking, used for eyeline match continuity'),
  props: z.array(z.string()).optional().describe('Optional props or objects in the scene'),
  mood: z.string().nullish().describe('Overall emotional tone or atmosphere of the scene'),
  cameraType: z.string().nullish().describe('Type of camera movement or static shot'),
  framing: z.string().nullish().describe('Cinematic framing (e.g., Close-up, Wide, Medium)'),
  lighting: z.string().nullish().describe('Lighting description (e.g., Warm sunset, Harsh office light)'),
  background: z.string().nullish().describe('Background description'),
  imagePrompt: z
    .string()
    .describe('Concise, single-string image generation prompt (e.g. 2D vector style, character action, 16:9)'),
  animationPrompt: z.string().describe('Animation instructions for movement'),
  visualDensity: z
    .enum(['low', 'medium', 'high'])
    .default('medium')
    .describe('Visual complexity: low (text only), medium (standard), high (busy/detailed)'),
  // we accept arbitrary strings and normalize them into the allowed enum values; this prevents
  // a bad value from the LLM from crashing the zod validation later on.  synonyms such as
  // 'hook' or 'revelation' are mapped to sensible defaults.
  contextType: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined
      const lower = val.toLowerCase()
      const valid: SceneContextType[] = [
        'quick-list',
        'transition',
        'story',
        'explanation',
        'detailed-breakdown',
        'conclusion'
      ]
      const map: Record<string, SceneContextType> = {
        hook: 'story',
        revelation: 'explanation',
        intro: 'transition',
        outro: 'conclusion'
      }
      if (valid.includes(lower as SceneContextType)) {
        return lower as SceneContextType
      }
      if (map[lower]) {
        return map[lower]
      }
      return undefined
    })
    .describe('Scene purpose label used for duration estimation'),
  characterVariant: characterVariantSchema.nullish().describe('Special variant of the character'),
  backgroundColor: z.string().optional().describe('Background color for this specific scene'),
  // Dynamism fields
  soundEffects: z.array(soundEffectSchema).optional().describe('List of sound effects for this scene'),
  soundscape: z.string().optional().describe('Ambient background soundscape (e.g., office, forest, crowd)'),
  cameraAction: cameraActionSchema.optional().describe('Camera movement for this scene'),
  transitionToNext: transitionTypeSchema.optional().describe('Transition to the next scene'),
  pauseBefore: z.number().default(0.4).describe('Specific silence duration before narration starts (in seconds)'),
  pauseAfter: z.number().default(0.1).describe('Specific silence duration after narration ends (in seconds)'),
  continueFromPrevious: z
    .boolean()
    .default(false)
    .describe('If true, this scene reuses the visual background of the previous scene for perfect continuity'),
  visualMode: z
    .enum(['standard'])
    .default('standard')
    .describe('Visual generation mode. Standard only (text-only is deprecated).'),
  visualSource: z
    .enum(['local'])
    .default('local')
    .describe('Visual source: Stickman/Whiteboard composition (100% local, no AI generation)'),
  poseId: z
    .string()
    .optional()
    .describe(
      'ID of a pre-generated pose for the character (e.g. STAND, RUN). Use NONE for scenes without a character (text-only or abstract).'
    ),
  poseStyle: poseStyleSchema.optional().describe('Custom positioning and scaling for the character pose.'),
  tension: z
    .number()
    .min(0)
    .max(10)
    .default(5)
    .describe(
      'Emotional tension score 0-10 (0=calm/silence, 10=peak drama). Drives TTS speed, music intensity, and transition type.'
    ),
  progressiveElements: z
    .array(z.string())
    .optional()
    .describe(
      'New visual elements to ADD on top of the previous scene frame (only when continueFromPrevious is true). Example: ["email icon floating", "settings gear"]'
    ),
  keywordVisuals: z
    .array(
      z.object({
        keyword: z.string().describe('The exact word or phrase in the narration that triggers a visual swap'),
        imagePrompt: z
          .string()
          .describe(
            'Image prompt for the new visual to display when this keyword is spoken. Same style as main imagePrompt.'
          )
      })
    )
    .optional()
    .describe(
      'List of keyword-to-visual mappings. When the narrator says a keyword, the scene visual swaps to a new image for the duration of that word/phrase, then returns to default.'
    ),
  imageUrl: z.string().optional().describe('URL to the generated visual for this scene'),
  thumbnailUrl: z.string().optional().describe('URL to the generated thumbnail for this scene')
})

export type EnrichedScene = z.infer<typeof enrichedSceneSchema>

/**
 * Context types used by the scene-duration model.
 */
export type SceneContextType =
  | 'quick-list'
  | 'transition'
  | 'story'
  | 'explanation'
  | 'detailed-breakdown'
  | 'conclusion'

// multipliers for each context type; adjust durations accordingly
const contextFactorMap: Record<SceneContextType, number> = {
  'quick-list': 0.8,
  transition: 0.7,
  story: 1,
  explanation: 1.2,
  'detailed-breakdown': 1.4,
  conclusion: 0.9
}

/**
 * Simple scene duration estimator.  Starts with a base computed from word count
 * (approx 2.0 words per second or custom), then applies a context factor and clamps to
 * a reasonable range (3–30s).  If no context is provided, factor=1.
 */
export function suggestSceneDuration(
  wordCount: number,
  context?: SceneContextType,
  wordsPerSecond: number = 2
): number {
  // Human-like narration (Phase 5) is slower and has more pauses.
  // Instead of 2.5 words/s (robotic speed), we use wordsPerSecond as a base.
  // We also add a 0.5s "breath" overhead per scene.
  const base = wordCount / wordsPerSecond + 0.5
  const factor = context ? contextFactorMap[context] : 1
  const raw = base * factor
  return Math.max(MIN_SCENE_DURATION, Math.min(30, raw))
}

/**
 * Verify that the ratio of audio length to video length falls within a safe
 * coverage window.  Returns the ratio for logging if desired.
 */
export function computeAudioCoverage(videoDuration: number, audioDuration: number): number {
  if (videoDuration <= 0) return 0
  return audioDuration / videoDuration
}

/**
 * Complete video script with all scenes
 */
export const completeVideoScriptSchema = z.object({
  titles: z.array(z.string()).describe('A list of proposed titles for the video (propose at least 3)'),
  theme: z.string().optional(),
  fullNarration: z
    .string()
    .describe(
      'The complete, unbroken narration script text. MUST be generated FIRST before breaking it down into scenes.'
    ),
  totalDuration: z.number().min(1),
  sceneCount: z.number().int().positive(),
  characterSheets: z
    .array(characterSheetSchema)
    .optional()
    .describe('Details of all recurring characters in the video'),
  scenes: z.array(enrichedSceneSchema),
  backgroundMusic: z
    .string()
    .catch((error) => (typeof error.input === 'object' ? JSON.stringify(error.input) : 'upbeat'))
    .optional()
    .describe('Suggested mood/genre for background music'),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('16:9').describe('Aspect ratio of the video'),
  globalAudio: z.string().optional().describe('Path to the global audio narration file if used')
})

export type CompleteVideoScript = z.infer<typeof completeVideoScriptSchema>

/**
 * Video types inspired by shortsbot.ai
 */
export const videoTypeSchema = z.enum([
  'faceless', // Faceless videos with narration and visuals
  'explainer', // Educational explainer videos
  'tutorial', // Step-by-step how-to guides
  'listicle', // Top 5/10 lists, facts, rankings
  'news', // News recaps, trending topics
  'animation', // Motion graphics and animations
  'review', // Product reviews and recommendations
  'story', // Narratives, urban legends, mini-mysteries
  'motivational', // Inspirational quotes and affirmations
  'entertainment' // Memes, trends, funny content
])

export type VideoType = z.infer<typeof videoTypeSchema>

/**
 * Video genres/niches for targeting specific audiences
 */
export const videoGenreSchema = z.enum([
  'educational', // Learning and knowledge
  'fun', // Fun and engaging entertainment content
  'business', // Business tips, entrepreneurship
  'lifestyle', // Daily life, productivity, wellness
  'tech', // Technology and gadgets
  'finance', // Money, investing, personal finance
  'health', // Health and fitness
  'travel', // Travel tips and destinations
  'food', // Recipes and food content
  'gaming', // Gaming content and tips
  'sports', // Sports news and analysis
  'science', // Scientific facts and discoveries
  'history', // Historical facts and stories
  'self-improvement', // Personal development
  'mystery', // Mysteries and unsolved cases
  'general' // General interest content
])

export type VideoGenre = z.infer<typeof videoGenreSchema>

/**
 * Text overlay position for video captions
 */
export const textPositionSchema = z.enum([
  'top',
  'center',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'none'
])

export type TextPosition = z.infer<typeof textPositionSchema>

/**
 * ASS Caption configuration (full-featured subtitle styling)
 */
export const assCaptionConfigSchema = z.object({
  enabled: z.boolean().default(true).optional().describe('Enable/disable ASS captions'),
  style: z
    .enum(['colored', 'scaling', 'animated-background', 'bounce', 'neon', 'typewriter', 'karaoke', 'remotion'])
    .default('colored')
    .describe('Caption animation style'),
  fontFamily: z.string().default('Montserrat').describe('Font family name'),
  fontSize: z.number().default(48).optional().describe('Font size in pixels (auto-calculated if omitted)'),
  wordsPerLine: z.number().default(3).optional().describe('Words per caption line (auto-calculated if omitted)'),
  position: z
    .enum(['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'])
    .default('bottom')
    .describe('Position of captions'),
  highlightColor: z.string().default('#FFE135').describe('Highlight color for active words'),
  inactiveColor: z.string().default('#888888').optional().describe('Color for inactive words'),
  pillColor: z.string().default('#3B82F6').optional().describe('Pill/background color for animated-background style'),
  borderSize: z.number().default(2).optional().describe('Border width'),
  shadowSize: z.number().default(0).optional().describe('Shadow size'),
  wordSpacing: z.number().optional().describe('Custom word spacing in pixels'),
  charWidthRatio: z.number().optional().describe('Character width ratio for font metrics')
})

export type AssCaptionConfig = z.infer<typeof assCaptionConfigSchema>

/**
 * Text overlay configuration
 */
export const textOverlayConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable text overlays on video'),
  position: textPositionSchema.default('bottom').describe('Position of text overlay'),
  fontSize: z.number().default(48).describe('Font size in pixels'),
  fontColor: z.string().default('white').describe('Text color'),
  backgroundColor: z.string().default('black@0.6').describe('Background color with transparency'),
  fontFamily: z.string().default('Arial').describe('Font family'),
  maxCharsPerLine: z.number().default(40).describe('Maximum characters per line before wrapping'),
  style: z
    .enum([
      'classic',
      'remotion',
      'karaoke',
      'minimal',
      'sentence',
      'vibrant',
      'colored-words',
      'scaling-words',
      'animated-background',
      'bounce',
      'neon',
      'typewriter'
    ])
    .default('classic')
    .describe('Visual style of the subtitles'),
  highlightColor: z
    .string()
    .default('#00E676')
    .describe('Highlight color for the active word in colored-words, scaling-words, and animated-background styles'),
  googleFontUrl: z
    .string()
    .optional()
    .describe(
      'Google Fonts CSS URL (e.g. https://fonts.googleapis.com/css2?family=Roboto:wght@900). Font will be downloaded and embedded for SVG-based styles.'
    )
})

export type TextOverlayConfig = z.infer<typeof textOverlayConfigSchema>

/**
 * Transcription configuration
 */
export const transcriptionConfigSchema = z.object({
  provider: z
    .enum(['whisper-openai', 'whisper-local', 'assemblyai'])
    .default('whisper-local')
    .describe('Transcription provider'),
  apiKey: z.string().optional().describe('API key if required by provider'),
  model: z.string().default('base').describe('Model to use (for local Whisper)'),
  device: z.string().default('cpu').describe('Device to use (cpu/cuda)'),
  language: z.string().optional().describe('Language code (e.g. "en", "fr")')
})

export type TranscriptionConfig = z.infer<typeof transcriptionConfigSchema>

/** Minimum duration of a single scene in seconds. */
export const MIN_SCENE_DURATION = 3

/**
 * Compute a sensible scene count from a video duration.
 * Rule: roughly 1 scene per 10 seconds, clamped between 2 and 10.
 *
 * Examples:
 *   20 s  → 2 scenes
 *   30 s  → 3 scenes
 *   60 s  → 6 scenes
 *  120 s  → 10 scenes (max)
 */
export function computeSceneCount(durationSeconds: number): number {
  if (durationSeconds <= 30) return Math.max(2, Math.round(durationSeconds / 8))
  if (durationSeconds <= 60) return Math.max(4, Math.round(durationSeconds / 7))
  return Math.max(8, Math.min(20, Math.round(durationSeconds / 6)))
}

/**
 * Compute a content-adaptive scene range from a video duration.
 * The LLM is free to choose any count within this range based on
 * the narrative complexity of the topic.
 *
 * Examples:
 *   30 s  → { min: 2, max: 5 }
 *   60 s  → { min: 5, max: 8 }
 *  120 s  → { min: 9, max: 10 }
 */
export function computeSceneRange(durationSeconds: number): { min: number; max: number } {
  const mid = computeSceneCount(durationSeconds)
  return {
    min: Math.max(2, mid - 2),
    max: Math.min(25, mid + 3)
  }
}

/**
 * Professional branding configuration
 */
export const brandingConfigSchema = z.object({
  logoPath: z.string().optional().describe('Path to logo image file'),
  watermarkText: z.string().optional().describe('Text for watermark'),
  position: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'])
    .default('bottom-right')
    .describe('Position of branding elements'),
  opacity: z.number().min(0).max(1).default(0.5).describe('Opacity of branding elements (0-1)'),
  scale: z.number().min(0.01).max(1).default(0.15).describe('Scale of the logo relative to video width')
})

export type BrandingConfig = z.infer<typeof brandingConfigSchema>

/**
 * Advanced encoding controls for professional output
 */
export const proEncodingConfigSchema = z.object({
  crf: z.number().min(0).max(51).default(20).describe('Constant Rate Factor (lower is better quality)'),
  preset: z
    .enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'])
    .default('medium')
    .describe('Encoder preset (slower is better compression)')
})

export type ProEncodingConfig = z.infer<typeof proEncodingConfigSchema>

/**
 * Dynamic prompt sections for configuring the AI script generation prompt.
 * Each field corresponds to a labeled section that overrides the default hardcoded content.
 */
export const promptSectionsSchema = z.object({
  /** [RÔLE] AI persona, expertise, and creative identity */
  role: z.string().optional().describe('AI persona and expertise definition'),
  /** [CONTEXTE] Publication channel, platform, and content context */
  context: z.string().optional().describe('Publication channel and content context'),
  /** [AUDIENCE] Target audience description (demographics, interests) */
  audience: z.string().optional().describe('Target audience description'),
  /** [TÂCHE] Task/mission description for the script generation */
  task: z.string().optional().describe('Task description for script generation'),
  /** [OBJECTIF] Goals and objectives for the generated content */
  objective: z.string().optional().describe('Goals and objectives'),
  /** [STRUCTURE] Narrative structure definition (e.g., Hook → Problem → Solution → Conclusion) */
  structure: z.string().optional().describe('Narrative structure definition'),
  /** [RÈGLES] Writing style and formatting rules */
  rules: z.string().optional().describe('Writing style and formatting rules'),
  /** [INSTRUCTIONS] Additional generation instructions */
  instructions: z.string().optional().describe('Additional generation instructions')
})

export type PromptSections = z.infer<typeof promptSectionsSchema>

/**
 * Options for video generation
 */
export const videoGenerationOptionsSchema = z
  .object({
    minDuration: z.number().min(1).optional().describe('Minimum total duration in seconds'),
    maxDuration: z.number().min(1).default(30).describe('Maximum total duration in seconds'),
    userId: z.string().optional().describe('The ID of the user generating the video'),
    sceneCount: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of scenes (auto-derived from duration when omitted: ~1 scene per 6-8 seconds)'),

    maxSceneDuration: z
      .number()
      .int()
      .min(MIN_SCENE_DURATION)
      .max(60)
      .default(15)
      .describe('Maximum duration of a single scene in seconds'),
    style: z.enum(['motivational', 'educational', 'storytelling', 'tutorial']).optional(),
    videoType: videoTypeSchema.optional().describe('Type of video content to generate'),
    videoGenre: videoGenreSchema.optional().describe('Genre/niche for the video'),
    theme: z
      .enum(['script-system', 'psychology'])
      .optional()
      .describe('The thematic specification to use for prompt generation'),

    customSpec: z
      .any()
      .optional()
      .describe('A custom VideoTypeSpecification to override the default theme spec (e.g. loaded from database)'),
    characterConsistency: z.boolean().default(true).describe('Ensure character remains identical across scenes'),
    animationClipDuration: z
      .number()
      .default(6)
      .describe('Duration of the short animation clip to generate (it will be looped)'),
    animationMode: z
      .enum(['ai', 'panning', 'composition', 'static', 'none'])
      .default('static')
      .describe(
        'Animation strategy: ai (Veo/Grok), panning (Ken Burns), composition (layered entry), static (no effect), or none'
      ),
    aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('16:9').describe('Aspect ratio for the generated video'),
    resolution: z.enum(['720p', '1080p', '4k']).default('720p').describe('Output resolution preset'),
    branding: brandingConfigSchema.optional().describe('Professional branding options'),
    proEncoding: proEncodingConfigSchema.optional().describe('Advanced encoding parameters'),
    assCaptions: assCaptionConfigSchema.optional().describe('ASS caption configuration for video subtitles'),
    transcription: transcriptionConfigSchema.optional().describe('Transcription service configuration'),
    backgroundColor: z.string().default('#FFF').describe('Global background color for the video'),
    imageProvider: z.enum(['gemini', 'grok']).default('gemini').describe('Provider for image generation'),
    /** If true, missing transitions will be filled randomly (default true); set false to always use fade. */
    autoTransitions: z.boolean().default(true).describe('Automatically assign transitions when the script omits them'),
    llmProvider: z.enum(['gemini', 'grok']).default('gemini').describe('Provider for script generation'),
    kokoroVoicePreset: z
      .nativeEnum(KokoroVoicePreset)
      .default(KokoroVoicePreset.AF_HEART)
      .describe('Voice preset for Kokoro TTS'),
    audioProvider: z
      .enum(['demo', 'google-tts', 'openai-tts', 'elevenlabs', 'kokoro'])
      .default('kokoro')
      .describe('Provider for audio generation'),
    language: z.string().default('en-US').describe('Language for the video (e.g. "en-US", "fr-FR")'),
    wordsPerMinute: z.number().optional().describe('Target speaking speed in words per minute (e.g. 150)'),
    backgroundMusic: z
      .string()
      .optional()
      .describe('Suggested mood/genre for background music (e.g. upbeat, calm, dramatic)'),
    audioOverlap: z
      .number()
      .min(0)
      .max(2)
      .default(0.3)
      .describe('Overlap duration between scenes for audio acrossfade (in seconds)'),
    globalAudioPath: z.string().optional().describe('Path to a pre-generated global audio file'),
    scriptOnly: z
      .boolean()
      .default(false)
      .describe('If true, only generate the script and production report, skip asset generation'),
    skipAudio: z.boolean().default(false).describe('If true, skip audio generation (TTS)'),
    characterModelId: z.string().optional().describe('ID of the character model to use for the entire video'),
    generateOnlyScenes: z
      .boolean()
      .default(false)
      .describe('If true, only generate visual assets (scenes) and skip final assembly'),
    generateOnlyAudio: z
      .boolean()
      .default(false)
      .describe('If true, only generate narration and transcription, skip final assembly'),
    generateOnlyAssembly: z
      .boolean()
      .default(false)
      .describe('If true, skip narration/transcription and only perform final assembly'),
    qualityMode: z.nativeEnum(QualityMode).default(QualityMode.STANDARD).describe('Quality mode for generation'),
    enableContextualBackground: z
      .boolean()
      .default(false)
      .describe('Deprecated: Backgrounds are now always solid white.'),
    localOnlyImages: z
      .boolean()
      .default(true)
      .describe('If true, strictly prohibit AI image generation and rely ONLY on local assets and text mode.'),
    promptSections: promptSectionsSchema
      .optional()
      .describe(
        'Custom prompt sections to override the default AI role, context, audience, task, objective, structure, rules, and instructions'
      ),
    imageStyle: z
      .object({
        stylePrefix: z
          .string()
          .default('2D clean vector cartoon in Crayon Capital style')
          .describe('Visual style description prefix for image prompts'),
        characterDescription: z
          .string()
          .default('round-headed faceless characters')
          .describe('Character description used in image prompts'),
        qualityTags: z
          .array(z.string())
          .default([
            'consistent outfits',
            'simple gradient lighting',
            'medium outlines',
            'cinematic framing',
            'no text',
            'no speech bubbles'
          ])
          .describe('Static quality/style tokens appended to every image prompt')
      })
      .optional()
      .describe('Configuration for the visual style of generated image prompts'),
    globalTextStyle: onscreenTextStyleSchema
      .partial()
      .optional()
      .describe('Global text styling configuration that applies to all scenes after script generation.'),
    sceneStyles: z
      .record(z.string(), onscreenTextStyleSchema.partial())
      .optional()
      .describe(
        'Per-scene text styling overrides, mapping scene IDs to style objects. Applied after script generation.'
      ),
    globalPoseStyle: poseStyleSchema
      .partial()
      .optional()
      .describe('Global pose styling configuration that applies to all scenes after script generation.'),
    scenePoseStyles: z
      .record(z.string(), poseStyleSchema.partial())
      .optional()
      .describe('Per-scene pose styling overrides.')
  })
  .transform((opts) => {
    // Determine the effective range for the video duration
    const minDur = opts.minDuration ?? opts.maxDuration
    const maxDur = opts.maxDuration
    if (minDur > maxDur) {
      throw new Error('minDuration cannot be greater than maxDuration')
    }
    // For downstream compatibility we keep `duration` set to the target (= max)
    const targetDur = maxDur

    return {
      ...opts,
      duration: targetDur,
      minDuration: minDur,
      maxDuration: maxDur,
      sceneCount: opts.sceneCount ?? computeSceneCount(targetDur),
      /** true when the caller explicitly provided sceneCount; false when auto-derived from duration */
      sceneCountFixed: opts.sceneCount !== undefined
    }
  })

export type VideoGenerationOptions = z.infer<typeof videoGenerationOptionsSchema>

/**
 * Image prompt for a specific scene
 */
export const imagePromptSchema = z.object({
  sceneId: z.string(),
  prompt: z
    .string()
    .describe(
      'Concise, single-string prompt (Crayon Capital style by default) including aspect ratio suffix at the end'
    ),
  elements: z.object({
    pose: z.string(),
    action: z.string(),
    expression: z.string(),
    props: z.array(z.string()).optional(),
    background: z.string().default('plain white').describe('Description of the background or environment')
  })
})

export type ImagePrompt = z.infer<typeof imagePromptSchema>

/**
 * Entry animation types for individual elements
 */
export const itemAnimationTypeSchema = z
  .enum(['pop-in', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'fade-in', 'none'])
  .default('none')

export const itemAnimationSchema = z.object({
  type: itemAnimationTypeSchema,
  delay: z.number().default(0).describe('Delay in seconds from scene start'),
  duration: z.number().default(0.5).describe('Duration of the entry animation')
})

export type ItemAnimation = z.infer<typeof itemAnimationSchema>

/**
 * Animation instructions for a scene
 */
export const animationPromptSchema = z.object({
  sceneId: z.string(),
  instructions: z.string().describe('Short animation instructions'),
  movements: z.array(
    z.object({
      element: z.enum(['arm', 'head', 'body', 'prop', 'hand', 'legs']),
      description: z.string(),
      duration: z.string().optional().describe('e.g., "slow", "quick", "2 seconds"')
    })
  )
})

export type AnimationPrompt = z.infer<typeof animationPromptSchema>

/**
 * Complete video package output
 */
export const completeVideoPackageSchema = z.object({
  script: completeVideoScriptSchema,
  projectId: z.string(),
  outputPath: z.string(),
  generatedAt: z.string().datetime(),
  metadata: z
    .object({
      apiCalls: z.number().optional(),
      estimatedCost: z.number().optional(),
      actualCost: z.number().optional().describe('Actual cost in credits'),
      generationTimeMs: z.number().optional()
    })
    .optional()
})

export type CompleteVideoPackage = z.infer<typeof completeVideoPackageSchema>
