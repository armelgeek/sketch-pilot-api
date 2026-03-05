import { z } from 'zod';

export type ImageProvider = 'gemini' | 'grok';
export type LLMProvider = 'gemini' | 'grok' | 'claude' | 'haiku';

/**
 * Quality modes for generation:
 * - low-cost: Optimize for minimum cost (ultra-low res images, Haiku LLM, caching)
 * - standard: Balanced quality and cost (low/medium res images, default LLM)
 * - high-quality: Prioritize visual quality (high res images, best LLM models)
 */
export enum QualityMode {
    LOW_COST = 'low-cost',
    STANDARD = 'standard',
    HIGH_QUALITY = 'high-quality',
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
    BM_LEWIS = 'bm_lewis',
}

/**
 * Time range for a scene (in seconds)
 */
export const timeRangeSchema = z.object({
    start: z.number().min(0),
    end: z.number().min(0),
});

export type TimeRange = z.infer<typeof timeRangeSchema>;

/**
 * Sound effect configuration
 */
export const soundEffectSchema = z.object({
    id: z.string().optional().describe('Unique identifier for the SFX'),
    type: z.enum(['swish', 'pop', 'scratch', 'click', 'whoosh', 'ding', 'jump', 'thud', 'sparkle', 'tick'])
        .or(z.string().transform(() => 'pop' as const))
        .default('pop')
        .describe('Type of sound effect'),
    timestamp: z.number().describe('Relative timestamp in seconds from scene start'),
    volume: z.number().min(0).max(1).default(0.8),
});

export type SoundEffect = z.infer<typeof soundEffectSchema>;

/**
 * Camera action configuration
 */
export const cameraActionSchema = z.object({
    type: z.enum(['zoom-in', 'zoom-out', 'shake', 'pan-left', 'pan-right', 'static'])
        .or(z.string().transform(() => 'static' as const))
        .default('static'),
    intensity: z.enum(['low', 'medium', 'high']).default('medium'),
    duration: z.number().optional().describe('Duration of the effect in seconds'),
    timestamp: z.number().default(0).describe('Start time relative to scene start'),
});

export type CameraAction = z.infer<typeof cameraActionSchema>;

/**
 * Transition configuration
 */
export const transitionTypeSchema = z.enum(['cut', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'wipe', 'zoom-in', 'pop', 'swish', 'none'])
    .or(z.string().transform(() => 'cut' as const))
    .default('cut');

export type TransitionType = z.infer<typeof transitionTypeSchema>;

/**
 * Character variant types
 */
export const characterVariantSchema = z.string().describe('The character variant or name to use for this scene (e.g. "Narrator", "Expert", "Customer")');

export type CharacterVariant = z.infer<typeof characterVariantSchema>;

/**
 * Layout types for scenes — 17 rich layouts extracted from demo_frame analysis
 */
export const layoutTypeSchema = z.enum([
    'character-center-bottom-text',  // Single character centered, caption below
    'character-left-text-right',     // Character on left gesturing, key text on right
    'character-right-text-left',     // Text/title on left, character reacting on right
    'text-only-center',              // No character — text/quote/stat centered
    'text-columns-multi',            // 2-4 column text layout (schedule, comparison)
    'checklist-with-character',      // Checklist left + character right
    'dual-character-split',          // Two characters side-by-side (contrast/two scenarios)
    'dual-character-arrow',          // Before → Arrow → After transformation layout
    'multi-character-3col',          // 3 characters in 3 equal columns
    'multi-character-grid-6',        // 6 characters in 3×2 grid (variety/examples)
    'character-with-scene-prop',     // Character in a full contextual scene
    'image-grid-3x2',                // 3×2 grid of illustrated items with labels
    'character-thought-bubble',      // Character with thought bubble above
    'character-pointing-visual',     // Character on right pointing at chart/info on left
    'character-icons-around',        // Character with concept icons floating around them
    'character-with-object-side',    // Character beside a large recognizable object
    'full-frame-action',             // Single character filling full frame dramatically
    'narrator-besides-ui',           // Character besides a large UI/app/dashboard screenshot
    'individual-vs-crowd',           // One main character facing a crowd of small characters
    'triple-action-simultaneous',    // 3 distinct action scenes side-by-side
    'data-viz-comparison',           // Pure data/graphics comparison with percentages
    'asymmetric-action-focus',       // Action pushed to extreme left/right for transition space
    'character-seated-thought-box',  // Character seated besides a dark text box
    'split-scene-top-bottom',        // Text top, visual bottom
    'character-inside-object',       // Character emerging from an object
    'visual-metaphor-center',        // Large central metaphor
    'character-peeking-side',        // Character peeking from behind text
    'character-besides-signpost',    // Character besides a milestone signpost
    'three-panel-comic-strip',       // 3 panels for sequential storytelling
    'reference-image-center',        // Realistic reference/meme image center
    'roadmap-winding-path',          // Winding road with milestones
    'dual-character-meeting-table',  // Two characters sitting at a table (coffee/work)
    'character-thinking-large-cloud',// Central character with large empty thought cloud
    'character-energy-impact',       // Central character with radial lines/vfx
    'dual-character-dialogue',      // Male/Female or Two characters face-to-face talking
    'character-pointing-large-screen', // Character pointing at a giant monitor/screen
    'asymmetric-dual-confrontation', // One character large/foreground, one small/background
    'circular-process-cycle',        // 3-4 items in a circle around a central idea
    'character-at-desk-workstation', // Character sitting at desk with laptop/lamp
    'character-on-pedestal-stage',  // Character standing on a stone pedestal/platform
    'character-mobile-phone-tablet', // Character holding and looking at a small device
    'character-in-armchair-relaxing', // Character seated in a large armchair
    'dual-character-professor-student', // One character teaching/pointing, another learning
    'asymmetric-dual-scene-contrast', // Two distinct mini-scenes with stark narrative contrast
    'character-with-side-bullet-highlights', // Character in center, highlighted text bullets on side
    'comparison-visual-ratio-pots', // Visual count comparison (e.g., 20% vs 80% with items)
    'software-ui-with-narrator',     // Huge dashboard/app UI with character pointing at it
    'character-surrounded-by-concept-icons', // Character in center, many icons floating in a cloud
]).default('character-center-bottom-text');

export type LayoutType = z.infer<typeof layoutTypeSchema>;

/**
 * Geometric positioning for layout elements
 */
export const positionSchema = z.enum([
    'center', 'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right',
    'above-center', 'below-center',
    'left', 'right', 'top', 'bottom',
    'beside-character', 'thought-bubble', 'floating-near-item'
])
    .or(z.string().transform(() => 'center' as const))
    .default('center');

export type Position = z.infer<typeof positionSchema>;

/**
 * Visual asset (character or prop) definition
 */
export const assetDefinitionSchema = z.object({
    id: z.string().optional(),
    type: z.enum(['character', 'prop', 'image']),
    description: z.string(),
    position: positionSchema,
    scale: z.number().default(1.0),
    zIndex: z.number().default(0).describe('Layer order (lower = background)'),
    file: z.string().optional(), // Added after generation
});

export type AssetDefinition = z.infer<typeof assetDefinitionSchema>;

/**
 * Text element definition for rendering
 */
export const textDefinitionSchema = z.object({
    id: z.string().optional(),
    content: z.string(),
    position: positionSchema,
    style: z.string().optional().describe('CSS-like style or preset name'),
    fontSize: z.number().optional().describe('Font size in pixels'),
    color: z.string().optional().describe('Text color'),
    fontFamily: z.string().optional().describe('Font family'),
    zIndex: z.number().default(10).describe('Layer order (higher = foreground)'),
    animation: z.object({
        type: z.string().default('fade-in'),
        delay: z.number().default(0).describe('Delay in seconds from scene start'),
        duration: z.number().default(0.5).describe('Duration of animation in seconds'),
    }).optional(),
    geometry: z.object({
        x: z.number(), // % from left
        y: z.number(), // % from top
        w: z.number(), // % width
        h: z.number()  // % height
    }).optional().describe('Precise geometric zone for text overlay (0-100%)'),
});

export type TextDefinition = z.infer<typeof textDefinitionSchema>;

/**
 * Full geometric layout for a scene
 */
export const sceneLayoutSchema = z.object({
    assets: z.array(assetDefinitionSchema),
    texts: z.array(textDefinitionSchema),
    backgroundColor: z.string().default('#FFF').describe('Background color for the scene'),
});

export type SceneLayout = z.infer<typeof sceneLayoutSchema>;

/**
 * Enriched scene with all details needed for generation
 */
export const enrichedSceneSchema = z.object({
    id: z.string(),
    sceneNumber: z.number().int().positive(),
    timeRange: timeRangeSchema,
    narration: z.string().describe('Main narrative text for the scene'),
    actions: z.array(z.string()).describe('List of physical actions the character performs'),
    expression: z.string().describe('Facial expression and emotional state'),
    eyelineMatch: z.enum(['left', 'right', 'up', 'down', 'center', 'forward']).optional().describe('Direction in which the character is looking, used for eyeline match continuity'),
    props: z.array(z.string()).optional().describe('Optional props or objects in the scene'),
    imagePrompt: z.string().describe('Detailed paragraph-style image generation prompt'),
    animationPrompt: z.string().describe('Animation instructions for movement'),
    visualDensity: z.enum(['low', 'medium', 'high']).default('medium').describe('Visual complexity: low (text only), medium (standard), high (busy/detailed)'),
    // we accept arbitrary strings and normalize them into the allowed enum values; this prevents
    // a bad value from the LLM from crashing the zod validation later on.  synonyms such as
    // 'hook' or 'revelation' are mapped to sensible defaults.
    contextType: z
        .string()
        .optional()
        .transform((val) => {
            if (!val) return undefined;
            const lower = val.toLowerCase();
            const valid: SceneContextType[] = [
                'quick-list', 'transition', 'story', 'explanation', 'detailed-breakdown', 'conclusion'
            ];
            const map: Record<string, SceneContextType> = {
                hook: 'story',
                revelation: 'explanation',
                intro: 'transition',
                outro: 'conclusion',
            };
            if (valid.includes(val as SceneContextType)) {
                return val as SceneContextType;
            }
            if (map[lower]) {
                return map[lower];
            }
            return undefined;
        })
        .describe('Scene purpose label used for duration estimation'),
    layoutType: layoutTypeSchema.optional().describe('Composition layout style for the scene'),
    characterVariant: characterVariantSchema.optional().describe('Special variant of the character'),
    backgroundColor: z.string().optional().describe('Background color for this specific scene'),
    // Dynamism fields
    soundEffects: z.array(soundEffectSchema).optional().describe('List of sound effects for this scene'),
    soundscape: z.string().optional().describe('Ambient background soundscape (e.g., office, forest, crowd)'),
    cameraAction: cameraActionSchema.optional().describe('Camera movement for this scene'),
    transitionToNext: transitionTypeSchema.optional().describe('Transition to the next scene'),
    layout: sceneLayoutSchema.optional().describe('Detailed geometric layout for the scene'),
    pauseBefore: z.number().default(0.4).describe('Specific silence duration before narration starts (in seconds)'),
    pauseAfter: z.number().default(0.1).describe('Specific silence duration after narration ends (in seconds)'),
    continueFromPrevious: z.boolean().default(false).describe('If true, this scene reuses the visual background of the previous scene for perfect continuity'),
    tension: z.number().min(0).max(10).default(5).describe('Emotional tension score 0-10 (0=calm/silence, 10=peak drama). Drives TTS speed, music intensity, and transition type.'),
    progressiveElements: z.array(z.string()).optional()
        .describe('New visual elements to ADD on top of the previous scene frame (only when continueFromPrevious is true). Example: ["email icon floating", "settings gear"]'),
    keywordVisuals: z.array(z.object({
        keyword: z.string().describe('The exact word or phrase in the narration that triggers a visual swap'),
        imagePrompt: z.string().describe('Image prompt for the new visual to display when this keyword is spoken. Same style as main imagePrompt.'),
    })).optional().describe('List of keyword-to-visual mappings. When the narrator says a keyword, the scene visual swaps to a new image for the duration of that word/phrase, then returns to default.'),
    background: z.string().optional().describe('Description of the background/environment for this scene (e.g., "a busy office with desks and computers", "a sunset over the ocean")'),
});

export type EnrichedScene = z.infer<typeof enrichedSceneSchema>;

/**
 * Context types used by the scene-duration model.
 */
export type SceneContextType =
    | 'quick-list'
    | 'transition'
    | 'story'
    | 'explanation'
    | 'detailed-breakdown'
    | 'conclusion';

// multipliers for each context type; adjust durations accordingly
const contextFactorMap: Record<SceneContextType, number> = {
    'quick-list': 0.8,
    transition: 0.7,
    story: 1.0,
    explanation: 1.2,
    'detailed-breakdown': 1.4,
    conclusion: 0.9,
};

/**
 * Simple scene duration estimator.  Starts with a base computed from word count
 * (approx 2.0 words per second or custom), then applies a context factor and clamps to
 * a reasonable range (3–30s).  If no context is provided, factor=1.
 */
export function suggestSceneDuration(
    wordCount: number,
    context?: SceneContextType,
    wordsPerSecond: number = 2.0
): number {
    // Human-like narration (Phase 5) is slower and has more pauses.
    // Instead of 2.5 words/s (robotic speed), we use wordsPerSecond as a base.
    // We also add a 0.5s "breath" overhead per scene.
    const base = (wordCount / wordsPerSecond) + 0.5;
    const factor = context ? contextFactorMap[context] : 1.0;
    const raw = base * factor;
    return Math.max(MIN_SCENE_DURATION, Math.min(30, raw));
}

/**
 * Verify that the ratio of audio length to video length falls within a safe
 * coverage window.  Returns the ratio for logging if desired.
 */
export function computeAudioCoverage(
    videoDuration: number,
    audioDuration: number
): number {
    if (videoDuration <= 0) return 0;
    return audioDuration / videoDuration;
}

/**
 * Complete video script with all scenes
 */
export const completeVideoScriptSchema = z.object({
    titles: z.array(z.string()).describe('A list of proposed titles for the video (propose at least 3)'),
    theme: z.string().optional(),
    totalDuration: z.number().min(1),
    sceneCount: z.number().int().positive(),
    scenes: z.array(enrichedSceneSchema),
    backgroundMusic: z.string().optional().describe('Suggested mood/genre for background music'),
    aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('16:9').describe('Aspect ratio of the video'),
    narrativeCoherence: z.number().min(1).max(5).optional().describe('LLM-evaluated coherence score for the entire narration (1-5)'),
    globalAudio: z.string().optional().describe('Path to the global audio narration file if used')
});

export type CompleteVideoScript = z.infer<typeof completeVideoScriptSchema>;

/**
 * Video types inspired by shortsbot.ai
 */
export const videoTypeSchema = z.enum([
    'faceless',      // Faceless videos with narration and visuals
    'tutorial',      // Step-by-step how-to guides
    'listicle',      // Top 5/10 lists, facts, rankings
    'news',          // News recaps, trending topics
    'animation',     // Motion graphics and animations
    'review',        // Product reviews and recommendations
    'story',         // Narratives, urban legends, mini-mysteries
    'motivational',  // Inspirational quotes and affirmations
    'entertainment', // Memes, trends, funny content
]);

export type VideoType = z.infer<typeof videoTypeSchema>;

/**
 * Video genres/niches for targeting specific audiences
 */
export const videoGenreSchema = z.enum([
    'educational',   // Learning and knowledge
    'fun',           // Fun and engaging entertainment content
    'business',      // Business tips, entrepreneurship
    'lifestyle',     // Daily life, productivity, wellness
    'tech',          // Technology and gadgets
    'finance',       // Money, investing, personal finance
    'health',        // Health and fitness
    'travel',        // Travel tips and destinations
    'food',          // Recipes and food content
    'gaming',        // Gaming content and tips
    'sports',        // Sports news and analysis
    'science',       // Scientific facts and discoveries
    'history',       // Historical facts and stories
    'self-improvement', // Personal development
    'mystery',       // Mysteries and unsolved cases
    'general',       // General interest content
]);

export type VideoGenre = z.infer<typeof videoGenreSchema>;

/**
 * Text overlay position for video captions
 */
export const textPositionSchema = z.enum(['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none']);

export type TextPosition = z.infer<typeof textPositionSchema>;

/**
 * ASS Caption configuration (full-featured subtitle styling)
 */
export const assCaptionConfigSchema = z.object({
    enabled: z.boolean().default(true).optional().describe('Enable/disable ASS captions'),
    style: z.enum(['colored', 'scaling', 'animated-background', 'bounce', 'neon', 'typewriter', 'karaoke', 'remotion']).default('colored').describe('Caption animation style'),
    fontFamily: z.string().default('Montserrat').describe('Font family name'),
    fontSize: z.number().default(48).optional().describe('Font size in pixels (auto-calculated if omitted)'),
    wordsPerLine: z.number().default(3).optional().describe('Words per caption line (auto-calculated if omitted)'),
    position: z.enum(['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none']).default('bottom').describe('Position of captions'),
    highlightColor: z.string().default('#FFE135').describe('Highlight color for active words'),
    inactiveColor: z.string().default('#888888').optional().describe('Color for inactive words'),
    pillColor: z.string().default('#3B82F6').optional().describe('Pill/background color for animated-background style'),
    borderSize: z.number().default(2).optional().describe('Border width'),
    shadowSize: z.number().default(0).optional().describe('Shadow size'),
    wordSpacing: z.number().optional().describe('Custom word spacing in pixels'),
    charWidthRatio: z.number().optional().describe('Character width ratio for font metrics'),
});

export type AssCaptionConfig = z.infer<typeof assCaptionConfigSchema>;

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
    style: z.enum(['classic', 'remotion', 'karaoke', 'minimal', 'sentence', 'vibrant', 'colored-words', 'scaling-words', 'animated-background', 'bounce', 'neon', 'typewriter']).default('classic').describe('Visual style of the subtitles'),
    highlightColor: z.string().default('#00E676').describe('Highlight color for the active word in colored-words, scaling-words, and animated-background styles'),
    googleFontUrl: z.string().optional().describe('Google Fonts CSS URL (e.g. https://fonts.googleapis.com/css2?family=Roboto:wght@900). Font will be downloaded and embedded for SVG-based styles.'),
});

export type TextOverlayConfig = z.infer<typeof textOverlayConfigSchema>;

/**
 * Transcription configuration
 */
export const transcriptionConfigSchema = z.object({
    provider: z.enum(['whisper-openai', 'whisper-local', 'assemblyai']).default('whisper-local').describe('Transcription provider'),
    apiKey: z.string().optional().describe('API key if required by provider'),
    model: z.string().default('base').describe('Model to use (for local Whisper)'),
    device: z.string().default('cpu').describe('Device to use (cpu/cuda)'),
    language: z.string().optional().describe('Language code (e.g. "en", "fr")'),
});

export type TranscriptionConfig = z.infer<typeof transcriptionConfigSchema>;

/** Minimum duration of a single scene in seconds. */
export const MIN_SCENE_DURATION = 3;

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
    if (durationSeconds <= 30) return Math.max(2, Math.round(durationSeconds / 8));
    if (durationSeconds <= 60) return Math.max(4, Math.round(durationSeconds / 7));
    return Math.max(8, Math.min(20, Math.round(durationSeconds / 6)));
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
    const mid = computeSceneCount(durationSeconds);
    return {
        min: Math.max(2, mid - 2),
        max: Math.min(25, mid + 3),
    };
}

/**
 * Professional branding configuration
 */
export const brandingConfigSchema = z.object({
    logoPath: z.string().optional().describe('Path to logo image file'),
    watermarkText: z.string().optional().describe('Text for watermark'),
    position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']).default('bottom-right').describe('Position of branding elements'),
    opacity: z.number().min(0).max(1).default(0.5).describe('Opacity of branding elements (0-1)'),
    scale: z.number().min(0.01).max(1).default(0.15).describe('Scale of the logo relative to video width'),
});

export type BrandingConfig = z.infer<typeof brandingConfigSchema>;

/**
 * Advanced encoding controls for professional output
 */
export const proEncodingConfigSchema = z.object({
    crf: z.number().min(0).max(51).default(20).describe('Constant Rate Factor (lower is better quality)'),
    preset: z.enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']).default('medium').describe('Encoder preset (slower is better compression)'),
});

export type ProEncodingConfig = z.infer<typeof proEncodingConfigSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Storyboard — pre-defined scene-by-scene structure for dynamic prompt building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Narrative roles a storyboard beat can occupy.
 */
export const STORYBOARD_BEAT_ROLES = [
    'hook',
    'context',
    'development',
    'revelation',
    'transition',
    'resolution',
    'conclusion',
] as const;

export type StoryboardBeatRole = (typeof STORYBOARD_BEAT_ROLES)[number];

/**
 * A single beat (scene slot) in a storyboard.
 */
export const storyboardBeatSchema = z.object({
    /** Narrative role of this beat */
    role: z.enum(STORYBOARD_BEAT_ROLES),
    /** Brief description of what should happen in this beat (injected into the LLM prompt) */
    description: z.string().optional(),
    /** Suggested duration in seconds. The LLM may adapt it to stay within total budget. */
    durationHint: z.number().min(1).optional(),
    /** Target emotion the viewer should feel during this beat */
    emotionTarget: z.string().optional(),
    /** Visual direction hint (e.g. "close-up of hands", "wide establishing shot") */
    visualHint: z.string().optional(),
});

export type StoryboardBeat = z.infer<typeof storyboardBeatSchema>;

/**
 * A full storyboard: ordered sequence of beats that structure the video.
 * When provided in VideoGenerationOptions, the LLM maps each beat to one or
 * more scenes instead of deciding the structure on its own.
 */
export const storyboardSchema = z.object({
    /** Optional human-readable name for this storyboard template */
    name: z.string().optional(),
    /** Ordered list of narrative beats */
    beats: z.array(storyboardBeatSchema).min(1),
});

export type Storyboard = z.infer<typeof storyboardSchema>;

/**
 * Options for video generation
 */
export const videoGenerationOptionsSchema = z.object({
    minDuration: z.number().min(1).optional().describe('Minimum total duration in seconds'),
    maxDuration: z.number().min(1).default(30).describe('Maximum total duration in seconds'),
    sceneCount: z.number().int().min(1).max(25).optional().describe('Number of scenes (auto-derived from duration when omitted: ~1 scene per 6-8 seconds)'),
    maxSceneDuration: z.number().int().min(MIN_SCENE_DURATION).max(60).default(15).describe('Maximum duration of a single scene in seconds'),
    style: z.enum(['motivational', 'educational', 'storytelling', 'tutorial']).default('educational'),
    videoType: videoTypeSchema.optional().describe('Type of video content to generate'),
    videoGenre: videoGenreSchema.optional().describe('Genre/niche for the video'),
    characterConsistency: z.boolean().default(true).describe('Ensure character remains identical across scenes'),
    animationClipDuration: z.number().default(6).describe('Duration of the short animation clip to generate (it will be looped)'),
    animationMode: z.enum(['ai', 'panning', 'composition', 'static', 'none']).default('static').describe('Animation strategy: ai (Veo/Grok), panning (Ken Burns), composition (layered entry), static (no effect), or none'),
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
    kokoroVoicePreset: z.nativeEnum(KokoroVoicePreset).default(KokoroVoicePreset.AF_HEART).describe('Voice preset for Kokoro TTS'),
    audioProvider: z.enum(['demo', 'google-tts', 'openai-tts', 'elevenlabs', 'kokoro']).default('kokoro').describe('Provider for audio generation'),
    language: z.string().default('en-US').describe('Language for the video (e.g. "en-US", "fr-FR")'),
    wordsPerMinute: z.number().optional().describe('Target speaking speed in words per minute (e.g. 150)'),
    backgroundMusic: z.string().optional().describe('Suggested mood/genre for background music (e.g. upbeat, calm, dramatic)'),
    audioOverlap: z.number().min(0).max(2).default(0.3).describe('Overlap duration between scenes for audio acrossfade (in seconds)'),
    globalAudioPath: z.string().optional().describe('Path to a pre-generated global audio file'),
    scriptOnly: z.boolean().default(false).describe('If true, only generate the script and production report, skip asset generation'),
    qualityMode: z.nativeEnum(QualityMode).default(QualityMode.STANDARD).describe('Quality mode for generation'),
    enableContextualBackground: z.boolean().default(false).describe('If true, the LLM will generate descriptive backgrounds for each scene. If false, background remains plain/white.'),
    userId: z.string().optional().describe('User ID for credits management'),
    /**
     * Optional storyboard that defines the narrative structure beat-by-beat.
     * When provided, `buildScriptUserPrompt` injects the beats into the LLM
     * user prompt so the model follows this exact story arc instead of
     * inventing its own structure.
     */
    storyboard: storyboardSchema.optional().describe('Pre-defined storyboard structure for the video'),
}).transform(opts => {
    // Determine the effective range for the video duration
    const minDur = opts.minDuration ?? opts.maxDuration;
    const maxDur = opts.maxDuration;
    if (minDur > maxDur) {
        throw new Error('minDuration cannot be greater than maxDuration');
    }
    // For downstream compatibility we keep `duration` set to the target (= max)
    const targetDur = maxDur;

    return {
        ...opts,
        duration: targetDur,
        minDuration: minDur,
        maxDuration: maxDur,
        sceneCount: opts.sceneCount ?? computeSceneCount(targetDur),
        /** true when the caller explicitly provided sceneCount; false when auto-derived from duration */
        sceneCountFixed: opts.sceneCount !== undefined,
    };
});

export type VideoGenerationOptions = z.infer<typeof videoGenerationOptionsSchema>;

/**
 * Image prompt for a specific scene
 */
export const imagePromptSchema = z.object({
    sceneId: z.string(),
    prompt: z.string().describe('Paragraph-style prompt starting with character consistency instruction'),
    elements: z.object({
        pose: z.string(),
        action: z.string(),
        expression: z.string(),
        props: z.array(z.string()).optional(),
        background: z.string().default('plain white').describe('Description of the background or environment'),
    }),
});

export type ImagePrompt = z.infer<typeof imagePromptSchema>;

/**
 * Entry animation types for individual elements
 */
export const itemAnimationTypeSchema = z.enum(['pop-in', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'fade-in', 'none']).default('none');

export const itemAnimationSchema = z.object({
    type: itemAnimationTypeSchema,
    delay: z.number().default(0).describe('Delay in seconds from scene start'),
    duration: z.number().default(0.5).describe('Duration of the entry animation'),
});

export type ItemAnimation = z.infer<typeof itemAnimationSchema>;

/**
 * Animation instructions for a scene
 */
export const animationPromptSchema = z.object({
    sceneId: z.string(),
    instructions: z.string().describe('Short animation instructions'),
    movements: z.array(z.object({
        element: z.enum(['arm', 'head', 'body', 'prop', 'hand', 'legs']),
        description: z.string(),
        duration: z.string().optional().describe('e.g., "slow", "quick", "2 seconds"'),
    })),
});

export type AnimationPrompt = z.infer<typeof animationPromptSchema>;

/**
 * Complete video package output
 */
export const completeVideoPackageSchema = z.object({
    script: completeVideoScriptSchema,
    projectId: z.string(),
    outputPath: z.string(),
    generatedAt: z.string().datetime(),
    metadata: z.object({
        apiCalls: z.number().optional(),
        estimatedCost: z.number().optional(),
        actualCost: z.number().optional().describe('Actual cost in credits'),
        generationTimeMs: z.number().optional(),
    }).optional(),
});

export type CompleteVideoPackage = z.infer<typeof completeVideoPackageSchema>;
