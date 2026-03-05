/**
 * PromptManager
 *
 * Central class that manages ALL prompts used throughout the character video generator.
 * Every prompt string — for script generation, scene layout, image/animation generation,
 * and asset creation — is built and owned here.
 *
 * Usage:
 *   const pm = new PromptManager({ styleSuffix, characterSystemInstruction });
 *   const sysPrompt = pm.buildScriptSystemPrompt(options);
 *   const userPrompt = pm.buildScriptUserPrompt(topic, options);
 *   const imagePrompt = pm.buildImagePrompt(scene);
 */

import {
  EnrichedScene,
  VideoGenerationOptions,
  ImagePrompt,
  AnimationPrompt,
  AssetDefinition,
  computeSceneRange,
  MIN_SCENE_DURATION,
  Storyboard,
  StoryboardBeat,
} from '../types/video-script.types';
import { buildLayoutMenuForAI, LAYOUT_CATALOG, LayoutId, AspectRatio } from './layout-catalog';
import { buildNarrativeArcPrompt } from './narrative-arc';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Async function that resolves a dynamic prompt from an external source (e.g. a database).
 *
 * @param promptType  - Category of prompt (e.g. 'video_type_guideline', 'style_suffix').
 * @param context     - Optional scoping context (videoType, videoGenre, language).
 * @param variables   - Key-value pairs for {{variable}} interpolation.
 * @returns The resolved & interpolated string, or null when no prompt is found.
 */
export type PromptLoader = (
  promptType: string,
  context?: { videoType?: string; videoGenre?: string; language?: string },
  variables?: Record<string, string | number | boolean>
) => Promise<string | null>;

export interface PromptManagerConfig {
  /**
   * Style suffix appended to every image generation prompt.
   * Typically describes the global visual style (e.g. "minimalist character sketch, vector style…").
   */
  styleSuffix?: string;

  /**
   * Base system instruction for the image generation model.
   * Describes the character identity and style rules the model must follow.
   */
  characterSystemInstruction?: string;

  /**
   * Global background color applied to all scenes unless overridden per scene.
   * @default '#F5F5F5'
   */
  backgroundColor?: string;

  /**
   * Optional async loader used to resolve prompts dynamically from an external
   * source (database, API, etc.).  When provided, async variants of the build
   * methods (e.g. {@link PromptManager.buildScriptSystemPromptAsync}) will
   * attempt to resolve prompts via this loader before falling back to the
   * built-in static values.
   */
  promptLoader?: PromptLoader;
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative Context Extraction
// ─────────────────────────────────────────────────────────────────────────────

interface NarrativeContext {
  /** Primary emotion/mood detected from narration */
  emotion?: string;
  /** Detected dynamic/intensity level */
  energy?: 'low' | 'medium' | 'high';
  /** Main subject/focus from narration */
  subject?: string;
  /** Contextual situation/setting hints */
  situation?: string;
  /** Key verbs/actions implicit in the text */
  impliedActions?: string[];
  /** Important attributes/descriptors */
  descriptors?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PromptManager
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_STYLE_SUFFIX =
  'Full body visible, minimalist stickman, vector style, flat design, clean lines, solid off-white background (#F5F5F5), no text, NO margins, NO borders, NO frames, edge-to-edge illustration.';

export const DEFAULT_CHARACTER_SYSTEM_INSTRUCTION =
  'You are an expert illustrator. Generate a stickman image in flat vector style matching the description. Keep it simple and clear.';

export class PromptManager {
  private styleSuffix: string;
  private characterSystemInstruction: string;
  private backgroundColor: string;
  private promptLoader?: PromptLoader;

  /** Character consistency prefix prepended to every image prompt */
  private readonly characterConsistencyPrefix =
    'CRITICAL: Use the EXACT same character from the reference images provided. Maintain identical proportions, limb structure, and visual style. Do NOT create variations or different-looking characters.';

  constructor(config: PromptManagerConfig = {}) {
    this.styleSuffix = config.styleSuffix ?? DEFAULT_STYLE_SUFFIX;
    this.characterSystemInstruction = config.characterSystemInstruction ?? DEFAULT_CHARACTER_SYSTEM_INSTRUCTION;
    this.backgroundColor = config.backgroundColor ?? '#F5F5F5';
    this.promptLoader = config.promptLoader;
  }

  // ─── Configuration setters ───────────────────────────────────────────────

  setStyleSuffix(suffix: string): void {
    this.styleSuffix = suffix;
  }

  /** Attach (or replace) the dynamic prompt loader at runtime. */
  setPromptLoader(loader: PromptLoader): void {
    this.promptLoader = loader;
  }

  setCharacterSystemInstruction(instruction: string): void {
    this.characterSystemInstruction = instruction;
  }

  setBackgroundColor(color: string): void {
    this.backgroundColor = color;
  }

  /**
   * Calculate words per second based on generation options.
   * Priority:
   * 1. Explicit wordsPerMinute
   * 2. Language-specific defaults
   * 3. Provider-specific defaults
   * 4. Baseline (2.0)
   */
  getWordsPerSecond(options: VideoGenerationOptions): number {
    // 1. Explicit override
    if (options.wordsPerMinute) {
      return options.wordsPerMinute / 60;
    }

    // 2. Language-specific biases
    // Source: General linguistic observation that Romance languages (FR, ES, IT)
    // often have higher syllable rates but slightly different word rates than EN.
    // For TTS, we often slow down FR slightly to maintain clarity.
    const lang = (options.language || 'en-US').toLowerCase();
    let langBase = 2.0;
    if (lang.startsWith('fr')) langBase = 1.8;
    if (lang.startsWith('es')) langBase = 1.9;
    if (lang.startsWith('de')) langBase = 1.8;

    // 3. Provider-specific biases
    // ElevenLabs tends to be more natural/expressive (slower).
    // Kokoro/Google can be slightly faster/more rhythmic.
    // Note: Kokoro is exceptionally fast. We use 1.35 so the LLM writes MORE words to fill the same duration.
    const provider = options.audioProvider || 'kokoro';
    let providerFactor = 1.0;
    if (provider === 'elevenlabs') providerFactor = 0.9;
    if (provider === 'google-tts') providerFactor = 1.1;
    if (provider === 'kokoro') providerFactor = 1.35;

    return langBase * providerFactor;
  }

  // =========================================================================
  // SCRIPT GENERATION PROMPTS
  // =========================================================================

  /**
   * Build the LLM system prompt for video script generation.
   * Includes cinematic direction, layout catalog, narrative arc, and all rules.
   */
  buildScriptSystemPrompt(options: VideoGenerationOptions): string {
    const aspectRatio = (options.aspectRatio as AspectRatio) || '16:9';
    const videoTypeContext = options.videoType
      ? this.getVideoTypeGuideline(options.videoType)
      : '';
    const videoGenreContext = options.videoGenre
      ? this.getVideoGenreGuideline(options.videoGenre)
      : '';

    // Narrative arc block — specialized per type/genre, or generic fallback
    const narrativeArcBlock = options.videoType
      ? buildNarrativeArcPrompt(options.videoType, options.videoGenre, options.sceneCount)
      : this.buildGenericNarrativeArcBlock();

    const maxScene = options.maxSceneDuration;

    // Scene count instruction — fixed when caller set it, flexible otherwise
    const effectiveDuration =
      options.duration ??
      options.maxDuration ??
      options.minDuration;
    const sceneCountInstruction = options.sceneCountFixed
      ? `${options.sceneCount} scenes`
      : (() => {
        const range = computeSceneRange(effectiveDuration);
        return `${range.min}-${range.max} scenes`;
      })();

    // Per-scene duration rules
    const minScene = MIN_SCENE_DURATION;

    const wps = this.getWordsPerSecond(options);
    const wpsFixed = wps.toFixed(1);

    return `═══════════════════════════════════════════════════════════════════════════════
SYSTEM PROMPT: PSYCHOLOGICAL STORYTELLING VIDEO DIRECTOR
═══════════════════════════════════════════════════════════════════════════════

🎬 ROLE & GOAL
─────────────────────────────────────────────────────────────────────────────
Role: Cinematic director for character animation
Goal: Create high-engagement, psychologically resonant scripts with exact duration compliance
Style: Psychological storytelling (inspired by top YouTube content)
Language: ${options.language || 'en-US'}

═══════════════════════════════════════════════════════════════════════════════
⚠️  CRITICAL: EXECUTION SEQUENCE (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════

Plan BEFORE writing:
1. Allocate scene durations → total = ${effectiveDuration}s max
2. Estimate narration: ${wpsFixed} words/second
3. Write narration ONLY after timing fits scene duration
4. Validate total ≤ ${effectiveDuration}s → Output JSON

═══════════════════════════════════════════════════════════════════════════════
🔴 HARD CONSTRAINTS (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════════════════════

DURATION (ABSOLUTE):
• Total duration: MUST NOT exceed ${effectiveDuration}s
• This is a hard ceiling, never a target range
• If narration is too long → shorten narration, DO NOT extend duration
• Sum of all timeRange values must ≤ ${effectiveDuration}s

VALIDITY:
• Output MUST be valid JSON
• Each scene REQUIRES: sceneNumber, narration, actions, expression, timeRange
• timeRange format: [start_seconds, end_seconds]

NARRATION TIMING:
• Speaking speed baseline: ${wpsFixed} words per second
• Scene duration × ${wpsFixed} = maximum words allowed
• Example: 5-second scene → max ${Math.floor(5 * wps)} words
• Validate narration length BEFORE outputting JSON

═══════════════════════════════════════════════════════════════════════════════
📊 CONTENT SPECIFICATIONS
═══════════════════════════════════════════════════════════════════════════════

Scene Count: ${sceneCountInstruction}
Duration Budget: ${effectiveDuration}s total
Type: ${options.videoType || 'general'}
Genre: ${options.videoGenre || 'general'}

${narrativeArcBlock}

═══════════════════════════════════════════════════════════════════════════════
📋 MANDATORY SCENE PROPERTIES
═══════════════════════════════════════════════════════════════════════════════

Each scene MUST include:

✓ sceneNumber: integer (1, 2, 3, ...)
✓ narration: string (ONLY if narration fits scene timeRange)
✓ actions: string[] (visible, specific actions — "reaches" not "moves")
✓ expression: string (emotional state — "hopeful", "confused", "determined")
✓ layoutType: string (see layouts below, or create custom)
✓ visualDensity: "low|medium|high"
✓ timeRange: [start, end] (must fit total duration)
✓ transitionToNext: "cut|fade|slide-left|slide-right|slide-up|slide-down|wipe|zoom|pop|swish|none"
✓ eyelineMatch: "left|right|up|down|center" (for visual continuity)
${options.enableContextualBackground ? '✓ background (optional): descriptive string for environment (e.g. "a sunny park", "a messy bedroom")' : ''}
✓ contextType (optional): "hook|explanation|revelation|transition|conclusion"

═══════════════════════════════════════════════════════════════════════════════
✨ NARRATIVE RULES (PRIORITY: HIGH)
═══════════════════════════════════════════════════════════════════════════════

EMOTION & PROGRESSION:
→ Scene 1: Introduce emotional tone (hook or question)
→ Each scene after: Evolve emotionally (escalate, contrast, or resolve)
→ Emotional progression: scene-by-scene arc (hook, context, revelation, payoff)
→ Multi-Character Support (🔴 NEW):
  • Use multiple interlocutors/characters to give more life to the video
  • Assign a unique 'characterVariant' (name/role) to each scene (e.g. "Narrator", "Customer", "Expert")
  • Ensure their dialogues and actions are consistent with their assigned identity
→ SPECIFICITY & DETAIL (🔴 CRITICAL - Remove Generalities):
→ Replace vague narration with CONCRETE DETAILS
  ❌ FALSE: "A critical component failed"
  ✅ TRUE: "The propeller shaft cracked at 0.3mm tolerance, metal fatigue from 10,000 cycles"
  
→ REQUIRED SPECIFICITY LEVELS:
  • Names: Use character names, place names, specific terms
  • Numbers: Include measurements, timelines, quantities, percentages
  • Senses: Describe what's seen, heard, felt (not just concepts)
  • Context: Show where/when/why, not just what

→ EXAMPLES (Generic → Specific):
  ❌ "He felt pressure" → ✅ "Sweat dripped down his temple, his chest tightened"
  ❌ "The crowd disagreed" → ✅ "Three colleagues stood silent, exchanging glances"
  ❌ "He struggled" → ✅ "His hands trembled as he reached for the document"

INTERNAL ANTAGONISM (Replace Cliché Obstacles):
→ MINIMIZE: Clichéd crowd voices ("NO! IMPOSSIBLE! FOOL!")
→ MAXIMIZE: Internal psychological conflict
  • Self-doubt: "What if I'm not clever enough?"
  • Fear: "What if I fail publicly?" (specific consequence)
  • Habit: "I always give up when it gets hard"
  • Imposter syndrome: "I don't belong here"
  • Past trauma: "Last time I tried, I was humiliated"
  
→ Show internal struggle VISUALLY:
  • Hesitation (pause before action)
  • Physical tension (clenched jaw, rigid posture)
  • Conflicted expressions (split between hope & fear)
  • Micro-decisions (moment of courage overcoming doubt)

TRANSITIONS & BREATHING SPACES (Smooth Scene Flow):
→ AVOID: Abrupt emotional extremes back-to-back
  ❌ Scene 8: Exhaustion → Scene 9: Complete failure (too dark, no breath)
  ✓ Scene 8: Exhaustion → Scene 8.5: Moment of stillness → Scene 9: Specific failure point
  
→ USE TRANSITION TYPES:
  • Reflection pause: Character stops, collects thoughts, reassesses
  • Physical reset: Change of location or minor shift (slight improvement/worse)
  • Sensory shift: Different visual/audio mood before impact
  • Time passage: Subtle indication of time (dawn after long night, etc.)
  
→ PACING FOR RESOLUTION:
  • Don't rush the ending: Let emotional payoff breathe
  • Slow down final 2-3 scenes: Let moments linger
  • Use silence/pause before climactic revelation
  • Final conclusion should feel earned, not forced

SENSORY & IMMERSIVE LANGUAGE (Replace Summary with Experience):
→ SHIFT FROM: Descriptive narration ("He began to sketch...")
→ SHIFT TO: Sensory, visceral language
  ❌ "He started working on the project"
  ✅ "His pencil scratched across paper, the graphite leaving dark marks. Each line felt heavier than the last."
  
→ SENSORY DIMENSIONS:
  • Visual: Colors, light, shadows (not just "bright" → "golden sunlight stretched across the room")
  • Audio: Sounds, silence, rhythm (not just "quiet" → "the hum of the computer faded to silence")
  • Tactile: Texture, temperature, pressure (not just "cold" → "the metal door numbed his palm")
  • Kinetic: Movement, pace, weight (not just "moved" → "stumbled forward, legs heavy")
  • Emotional sensation: Somatic experiences (not just "sad" → "a knot formed in his stomach")

→ IMMERSION RULES:
  • Use "he felt", "he saw", "he heard" to ground viewer in POV
  • Describe PROCESS not RESULT ("sketch lines appeared" not "he finished sketching")
  • Use present tense where possible for immediacy
  • Embed emotion IN physical description, not separately

💡 HUMAN-LIKE NARRATION (THE STORYTELLER'S VOICE):
→ Use "Fragmented Sentences" for impact. Not always subject-verb-object.
  ✅ "A single line. Sharp. Bold. Then, silence."
→ Use "Conversational Markers" to bridge ideas naturally (e.g., "And the thing is...", "But here's the catch...", "Suddenly, it clicked.")
→ Use "Rhythm of Three": Short, Short, Long. Or Long, Long, Short.
→ AVOID "Wikipedia Voice": DO NOT summarize facts. State experiences.
→ EMBED pauses: Use commas and periods to dictate the rhythm. Each punctuation is a breath.

QUESTION MANAGEMENT:
→ Open ≤2 unanswered questions at any time (cognitive load)
→ Answer with: "because", "so", "therefore", "the answer is"
→ Delay answer by ≥1 scene for curiosity

PACING & RHYTHM (🔴 CRITICAL - AVOID RECITATION FEEL):
→ Alternate: "dense" scenes (complex explanation) ↔ "breath" scenes (short + visual punch)
→ NO two dense scenes back-to-back
→ Vary sentence length (mix short + long)
→ NO two consecutive scenes start with same word or phrase
→ 🔴 RHYTHMIC VARIATION: Some scenes should have 80% narration coverage, while others (visual breath) should have <20% narration or total silence.
→ 🔴 FORBIDDEN opening overused phrases (all scenes): "In short", "So, ", "In essence", "Basically"

MOMENTUM (Every scene must move the story forward):
→ End most scenes with ONE of:
  - Unresolved implication
  - Partial explanation
  - Hinted consequence
  - Surprising contrast
→ Next scene should feel like continuation, not reset
→ 🔴 COMPLETION GUARD: NEVER end a narration with ellipsis "..." or incomplete sentences. Every scene must contain a complete, grammatical thought.
→ Avoid fully closing ideas early → save for revelation/conclusion

ATTENTION CYCLES (Every 20–30 seconds):
→ Introduce perceptual shift: new perspective, contrast, scale change, emotional reversal
→ Short video (<45s): 1–2 cycles max
→ Medium (45–120s): 2–3 cycles
→ Each cycle spans 1–3 scenes

═══════════════════════════════════════════════════════════════════════════════
 CINEMATIC TRANSITIONS (SEMANTIC, NOT RANDOM)
═══════════════════════════════════════════════════════════════════════════════

TRANSITION PRINCIPLE: Choose transitions based on EMOTIONAL & NARRATIVE MEANING, not aesthetic preference.
The transition COMMUNICATES to the viewer how to interpret the next moment.

TRANSITION SEMANTICS (CHOOSE BASED ON SCENE CONTENT):

🔪 "cut" - ABRUPT CONTRAST / SHOCKING REVELATION
→ Use when: Previous scene ends → next scene presents opposite emotion, location change, or revelation
→ Effect: Sharp, sudden, creates tension
→ Example: Character planning → cut to unexpected problem
→ ❌ DON'T use after vulnerable moments (jarring)

😌 "fade" - REFLECTION / EMOTIONAL BREATH / TIME PASSAGE (DEFAULT FOR PACING)
→ Use when: Processing moment, gaining clarity, emotional pause, contemplative transition
→ Effect: Gentle, allows viewer to absorb previous moment
→ Example: After intense realization → fade to new understanding
→ USE MOST OFTEN for smooth, natural flow between vulnerable/intense moments

🔄 "slide-left" / "slide-right" - PROGRESSION / FORWARD/BACKWARD MOVEMENT
→ Use when: Character is progressing toward goal (slide-left) or retreating (slide-right)
→ Effect: Directional momentum, suggests agency or causality
→ Example: Slide-left to show building momentum toward climax
→ ❌ DON'T use randomly; match the narrative direction

⬆️ "slide-up" / "slide-down" - ELEVATION / DESCENDING REALIZATION
→ Use when: Emotional escalation (slide-up) or descent into shadow (slide-down)
→ Effect: Vertical metaphor for emotional/spiritual movement
→ Example: Slide-up when understanding rises; slide-down for darkening moment
→ ❌ Match the emotional arc, not arbitrary

🌊 "wipe" - ACTIVE TRANSFORMATION / WIPING AWAY THE PAST
→ Use when: Mental shift, letting go, wiping away doubt, new chapter beginning
→ Effect: Energetic, suggests active choice and change
→ Example: Character releases fear → wipe to confident action
→ Use sparingly, for moments of intentional change

🔫 "zoom-in" - INTENSIFYING FOCUS / GETTING TO THE POINT
→ Use when: Narrowing perspective, zooming into a critical detail, magnifying importance
→ Effect: Visceral, pulls viewer attention
→ Example: Abstract problem zooming into specific detail that matters
→ Use once per video maximum

💥 "pop" - EXPLOSIVE ENERGY / SURPRISE BREAKTHROUGH
→ Use when: Sudden realization, breakthrough moment, thing clicks into place
→ Effect: Fun, energetic, celebratory
→ Example: Confusion pops into clarity, doubt pops into confidence
→ ❌ DON'T overuse; reserve for genuine breakthrough moments

🎪 "swish" - PLAYFUL MOMENTUM / QUICK SHIFT  
→ Use when: Light, quick transitions between lighter scenes or playful moments
→ Effect: Dynamic, youthful, non-serious
→ Example: Between humorous or experimental moments
→ ❌ DON'T use during serious/vulnerable moments (tone mismatch)

⊘ "none" - HARD CUT / COLLISION / MAXIMUM CONTRAST
→ Use when: Extreme emotional shift needed, complete scene separation
→ Effect: Jarring, demands attention, very intentional
→ Example: Ending one chapter, starting completely different chapter
→ Use rarely; same effect as "cut" but even starker

TRANSITION USAGE RULES (🔴 MANDATORY):
□ EVERY scene gets a transitionToNext value (don't leave blank)
□ Transitions should SUPPORT emotional pacing, not conflict with it
□ Between vulnerable/intimate moments: use "fade" (not jarring)
□ Before revelations/breakthroughs: use "cut", "pop", or "zoom-in"
□ For backward glances/retreats: use "slide-right"
□ For forward progress: use "slide-left" or "wipe"
□ Maximum 1 dramatic transition per video (pop, zoom-in, or wipe)
□ Avoid same transition twice in a row (varies rhythm)
□ NO random transitions: each must serve narrative purpose

═══════════════════════════════════════════════════════════════════════════════
⚡ TENSION & PACING ENGINE (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════

Each scene MUST include a "tension" score from 0 to 10. This is the EMOTIONAL INTENSITY of the scene.

TENSION SCALE:
• 0–2 (Calm / Silence): Reflective, slow moments. Minimal narration. Visual breath.
• 3–4 (Building): Establishing context, low-level concern, curiosity rising.
• 5–6 (Engaged): Core explanation, challenge presented, momentum building.
• 7–8 (High Stakes): Conflict peak, revelation, psychological twist, urgency.
• 9–10 (Peak Drama): Climax, breakthrough, visceral shock, cathartic resolution.

TENSION ARC RULES (🔴 MANDATORY):
→ Scene 1 tension: 5–7 (hook requires engagement, never start at 0)
→ NEVER maintain same tension for 3+ consecutive scenes
→ Every "peak" (7–10) MUST be followed by a "valley" (0–4) to allow breath
→ The overall arc should look like a wave: Rise → Peak → Dip → Rise → Final Climax

HOW TENSION MODULATES THE SYSTEM (AUTOMATIC):
• Tension 0–3 → Long pause before narration (pauseBefore ≥ 0.8s), "fade" transition
• Tension 4–6 → Standard padding (pauseBefore ~0.4s), "slide" or "cut" transition  
• Tension 7–10 → Minimal padding (pauseBefore ~0.2s), "cut" or "pop" transition, faster TTS

EXAMPLE ARC (10 scenes):
5 → 7 → 4 → 6 → 8 → 3 → 7 → 5 → 9 → 2 (cinematic ending)

═══════════════════════════════════════════════════════════════════════════════
🎨 VISUAL RULES (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════

CHARACTER:
→ Anatomy: 2 arms, 2 legs, 1 head, 1 torso (always)
→ Never cut off by frame edges (full figure always visible)
→ Hold consistent visual identity across scenes

EYELINE & FOCUS CONTINUITY:
→ Provide eyelineMatch for each scene (left/right/up/down/center)
→ If scene N shows character looking right → scene N+1 shows what they see
→ Maintain coherent visual flow

PROPS:
→ Max 3 props per scene (avoid clutter)
→ NO same prop in two consecutive scenes
→ Props must serve narrative purpose ≠ decorative
→ Props from earlier scenes may reappear if they reinforce idea (evolve context)

LAYOUT DIVERSITY:
→ Consecutive scenes MUST differ in ≥2 of: [layout, density, text, camera]
→ Avoid visual monotony

SCENE 1 (PRIMARY RESPONSIBILITY):
→ Visually reinforce the narrative hook
→ Every scene needs: visible action + visible emotion + focal point

VISUAL CONTINUITY & PERSISTENCE:
→ Use "continueFromPrevious": true to maintain the same location and background.
→ Use this for consecutive scenes that take place in the same spot.
→ When true, the character maintains their physical position and the background remains locked.
→ Transitions between "continued" scenes should be "none" or "cut" for perfect fluidity.

PROGRESSIVE REVEAL (Whiteboard-Style / Evolution):
→ For listicles or COMPARISON scenes (e.g. "Current Self" vs "Future Self"), use:
  • "continueFromPrevious": true
  • "progressiveElements": ["Future Self happy", "Vertical divider line", "Success Sparkles"]
  • "transitionToNext": "none"
→ Each scene in the sequence ADDS items to the same background frame.
→ The AI will reproduce the previous scene EXACTLY and only add the new element(s).
→ Use this for: listing tools, steps, features, or showing a transformation/before-after.
→ Example (Before/After):
  Scene 1: "Current Self" sad character (continuePrevious: false)
  Scene 2: "Future Self" happy character added to the right (continueFromPrevious: true, progressiveElements: ["Future self", "Dividing line"])
→ The narration of each scene describes the new item/state being revealed.

KEYWORD-TRIGGERED VISUAL SWAP:
→ When a scene's narration contains a KEY WORD or concept that needs a strong visual, add:
  • "keywordVisuals": [{"keyword": "blockchain", "imagePrompt": "..."}]
→ At the exact moment the narrator says that word, the visual frame SWAPS to a new image.
→ Use this for scenes that cover MULTIPLE concepts in one narration.
→ Rules:
  • Max 3 keywords per scene
  • Keywords must be exact words/phrases from the narration
  • Each imagePrompt describes a completely new visual (different from main scene)
  • After the keyword's word timing ends, the video returns to the main scene image
  • Best used for: product names, statistics, place names, named concepts
→ Example: narration "...powered by AI and blockchain..."
  keywordVisuals: [
    {"keyword": "AI", "imagePrompt": "robot brain with neural network lines, hand-drawn sketch"},
    {"keyword": "blockchain", "imagePrompt": "chain of connected blocks with lock icons, sketch style"}
  ]

→ Basic sketchy font only
→ Simple colors: black, red, blue, etc. (or multi - color combos)
→ Speech / thought bubbles: EXTREMELY BASIC(circle or rectangle + 1 pointer line)
→ NO shadows, gradients, or decorative elements

═══════════════════════════════════════════════════════════════════════════════
🔊 SOUND DIRECTION(ATMOSPHERE & IMPACT)
═══════════════════════════════════════════════════════════════════════════════
    SOUNDSCAPES: "office", "forest", "rain", "crowd", "cafe", "white-noise".
      SFX: "swish", "pop", "ding", "scratch", "click", "whoosh", "thud", "sparkle".
→ Usage: [{ "type": "ding", "timestamp": 1.5 }]
═══════════════════════════════════════════════════════════════════════════════
🖼️  LAYOUT OPTIONS(${aspectRatio})
═══════════════════════════════════════════════════════════════════════════════

${buildLayoutMenuForAI(aspectRatio)}

    NOTE: Layouts are OPTIONAL suggestions.Create custom compositions if story demands it.
Prioritize narrative over template fit.

→ VISUAL CONTINUITY: Use "continueFromPrevious": true to maintain the same background and character position as the preceding scene.This is ideal for long narrative beats or sequential actions in the same location.If true, the image service will use the previous output as a direct reference, ensuring seamless visual flow.

═══════════════════════════════════════════════════════════════════════════════
 CRITICAL: CLICHÉS TO AVOID (ORIGINALITY GATES)
═══════════════════════════════════════════════════════════════════════════════

VISUAL/METAPHORICAL CLICHÉS (Replace with Original Alternatives):
→ "Seeds planted in darkness" / "watered with perseverance grow" 
  ✅ INSTEAD: Show specific cultivation struggle (failed attempt → learning → refinement)
  ✅ INSTEAD: Use different agricultural/growth cycle (germination failure, bitter season, late bloom)

→ "Mountain peak at sunrise" / "standing alone on top facing golden light"
  ✅ INSTEAD: Unexpected place of recognition (ordinary setting suddenly validates)
  ✅ INSTEAD: Subtle symbolic location (crossing a threshold, small room with window)

→ "Phoenix rising from ashes" / "rebirth after destruction"
  ✅ INSTEAD: Emergence (slow accumulation building to moment of visibility)
  ✅ INSTEAD: Transformation (gradual shift in perspective, skill, status)

→ "Crowd chorus voice" / "crowd says NO!" or "crowd cheers"
  ✅ INSTEAD: Individual reactions (one person's silence, specific objection, unexpected support)
  ✅ INSTEAD: Internal dialogue (character's internalized voices, self-doubt, past critics)

→ "Breaking chains" / "shattered shackles"
  ✅ INSTEAD: Specific restrictions removed (permission granted, new resource gained, time freed)
  ✅ INSTEAD: Threshold crossed (once-scary step becomes mundane)

→ "Climbing mountain" / "ascending stairs" (generic journey visual)
  ✅ INSTEAD: Specific path/struggle (learning curve with visible skill, social navigation, resource gathering)
  ✅ INSTEAD: Non-linear progress (loops, plateaus, unexpected breakthroughs)

→ "Mirror reflection" / "seeing self transformed"
  ✅ INSTEAD: Recognition from others (glance, comment, subtle shift in behavior toward character)
  ✅ INSTEAD: Subtle status change (permission granted, seat offered, question directed to character)

METAPHOR REDUNDANCY (🔴 CRITICAL — OUTPUT BLOCKED IF VIOLATED):
→ Max 1 metaphor per domain. ADJACENT scenes with same domain = AUTOMATIC REWRITE

→ 🔴 VIOLATION TRIGGER (Failure Example):
  ❌ Scene 9: "Chisel shaping stone" (craftsmanship domain) 
  ❌ Scene 12: "Polishing gears" (ALSO craftsmanship domain)
  → BOTH scenes use craftsmanship metaphor → VIOLATION → REWRITE MANDATORY

→ 🟢 CORRECT PATTERN (Passing Example):
  ✓ Scene 9: "Chisel shaping stone" (craftsmanship — appears ONCE)
  ✓ Scene 12: "Character receives first recognition" (status shift — zero metaphor)
  ✓ Scene 14: "Success tastes like salt and effort" (sensory — different framing)

→ DOMAIN CLASSIFICATION (each max 1 active use):
  • Craftsmanship: chisel, forge, weaving, carving, sculpting, shaping, grinding, honing, refining, polishing, hammering
  • Nature: seeds, growth, seasons, weather, roots, branches, blooming, decay, germination
  • Movement: climbing, falling, walking, swimming, flying, ascending, descending, stumbling
  • Light/Shadow: dawn, darkness, spotlight, eclipse, glow, torch, beacon, illuminate, sunrise, sunset
  • Mechanical: gears, engines, assembly, timing, calibration, motors, circuits, mechanisms
  • Animal agency: birds (flying), horses (running), wolves (hunting), fish (swimming) as metaphors

→ METAPHOR PROGRESSION (mandatory structure):
  • Early (scenes 1-5): Establish struggle in CONCRETE terms (no metaphor yet)
  • Middle (scenes 6-15): ONE craftsmanship/growth metaphor (max)
  • Late (scenes 16-${Math.max(options.sceneCount || 20, 20) - 2}): Shift to STATUS/CAPABILITY (not same domain)
  • Conclusion (final 2-3): ORIGINAL payoff (not cliché final image)

═══════════════════════════════════════════════════════════════════════════════
🎬 CONCLUSION & FINAL SCENE RULES (REGISTER & PACING)
═══════════════════════════════════════════════════════════════════════════════

FINAL SCENE REGISTER (🔴 CRITICAL — OUTPUT BLOCKED IF VIOLATED):
→ MUST maintain poetic/cinematic register established throughout script
→ 🔴 FORBIDDEN opening words: "In short", "To summarize", "In conclusion", "Thus", "Therefore", "So, ", "En résumé", "Bottom line", "All in all"
  ❌ "In short, your resilience is a silent promise." [sounds like consultant email]
  ❌ "To conclude, you have learned…" [sounds like thesis paper]
  ❌ "So remember…" [sounds like lecture ending]
  ❌ "Therefore, persist with courage." [sounds like business advice]
  → IF final narration starts with ANY of these → OUTPUT INVALID → REWRITE
  
→ ACCEPTABLE FINAL FORMS (POETIC/SENSORY ONLY):
  ✓ Direct address: "Your resilience is a silent promise."
  ✓ Poetic statement: "Every mark leaves you stronger."
  ✓ Metaphorical revelation: "You were sculpting yourself all along."
  ✓ Sensory callback: "The weight you carry now feels different."
  ✓ Future-oriented: "What begins now is the world seeing what you already knew."
  ✓ Silent moment: No narration, powerful visual/expression

FINAL SCENE PACING (NOT RUSHED):
→ Last 3 scenes (or final 15-20% of duration) should SLOW DOWN
→ Allocate ≥4 seconds per scene (vs average 5-8s per scene)
→ Allow visual moments to linger before narration
→ Use INTENTIONAL silence before closing narration
→ Avoid rapid cuts in the final second; ensure the visual payload is clear.

FINAL SCENE ORIGINALITY (🔴 MANDATORY):
→ Final image MUST NOT be archetypal triumph:
  ❌ Character standing on mountain with arms outstretched
  ❌ Character glowing/illuminated against sunset
  ❌ Character silhouetted against dramatic sky
  ❌ Character arms raised in victory pose
  
→ INSTEAD use SPECIFIC, EARNED moments:
  ✓ Character in specific location with subtle gesture (hand on desk, quiet smile)
  ✓ Recognition from specific person (glance, nod, unexpected word)
  ✓ Character continuing ordinary action with new awareness (reading, working, speaking)
  ✓ Symbolic but NOT clichéd (character opening door, extending help, speaking truth)

FINAL NARRATION TIMING (🔴 CRITICAL):
→ The final scene MUST NOT be crowded with narration.
→ Mandate: narration_duration MUST be ≤ total_scene_duration - 2.0s
→ 2 seconds of PURE VISUAL SILENCE at the very end of the video is mandatory for emotional impact.
→ DO NOT truncate the final sentence. Finish the thought completely.

═══════════════════════════════════════════════════════════════════════════════
📤 OUTPUT FORMAT (STRICT JSON ONLY)
═══════════════════════════════════════════════════════════════════════════════

{
  "titles": ["Alternative Title 1", "Alternative Title 2", "Alternative Title 3"],
  "theme": "string",
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "string (VALIDATE: word_count ≤ scene_duration × ${wpsFixed})",
      "actions": ["action_1", "action_2"],
      "expression": "emotional_state",
      "layoutType": "layout_id_or_custom_name",
      "visualDensity": "low" | "medium" | "high",
      "timeRange": [start, end],
      "eyelineMatch": "left" | "right" | "up" | "down" | "center",
      "transitionToNext": "cut" | "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "wipe" | "zoom" | "pop" | "swish" | "none",
      ${options.enableContextualBackground ? '"background": "description of the environment/setting",' : ''}
      "contextType": "hook" | "explanation" | "revelation" | "transition" | "conclusion",
      "pauseBefore": 0.4,
      "pauseAfter": 0.1,
      "continueFromPrevious": false,
      "tension": 5,
      "soundscape": "office" | "forest" | "rain" | "crowd" | "cafe" | "white-noise",
      "soundEffects": [{"id": "sfx1", "type": "swish" | "pop" | "ding" | "...", "timestamp": 1.2, "volume": 0.8}]
    }
  ],
  "backgroundMusic": "mood description"
}

═══════════════════════════════════════════════════════════════════════════════
✅ PRE-OUTPUT VALIDATION CHECKLIST (MANDATORY QUALITY GATES)
═══════════════════════════════════════════════════════════════════════════════

DURATION & STRUCTURE:
□ Sum of timeRange values ≤ ${effectiveDuration}s
□ Each narration fits its timeRange (word_count ÷ ${wpsFixed})
□ All scenes have sceneNumber, narration, actions, expression, timeRange
□ Scenes don't start with same word (consecutive)
□ Emotional progression flows scene-by-scene
□ Every scene has a "tension" score (0–10)
□ No 3 consecutive scenes share the same tension level
□ Every tension peak (7–10) is followed by a valley (0–4)

SPECIFICITY & DETAIL (🔴 Quality Gate):
□ NO generic/vague narration ("faced obstacles" etc.)
□ INCLUDE: Names, numbers, places, senses, specific outcomes
□ DYNAMIC PACING: "pauseBefore" (default 0.4s) and "pauseAfter" (default 0.1s) are tuned for dramatic effect (longer pauses for revelations, zero for quick lists).
□ EXAMPLES: "propeller shaft cracked" not "component failed"
□ EACH scene contains ≥1 concrete sensory detail

ANTAGONISM (🔴 Quality Gate):
□ MINIMIZE: Clichéd crowd voices / external naysayers
□ MAXIMIZE: Internal psychological obstacles (doubt, fear, shame, past trauma)
□ Internal struggle is VISIBLE (hesitation, tension, conflicted expression)

TRANSITIONS & BREATHING (🔴 Quality Gate):
□ NO two intense scenes back-to-back (avoid emotional whiplash)
□ Transition types included: reflection, sensory shift, time passage when needed
□ Final scenes (≥last 2) feel earned, not rushed
□ Pacing allows emotional moments to "breathe"

LANGUAGE & IMMERSION (🔴 Quality Gate):
□ Narration is sensory/visceral, not just descriptive
□ "He felt X" (somatic) not "X happened"
□ Process described ("pencil scratched paper") not just result
□ Viewer grounded in character POV throughout

NARRATIVE STRUCTURE:
□ Scene 1 hooks viewer
□ Questions open/close properly (≤2 open at once)
□ Final scene has memorable payoff
□ Arc feels complete (not abrupt)

TECHNICAL:
□ JSON is valid (parse-able)
□ All required fields populated
□ Visual metaphors serve story (not decorative)
 
 SOUND DIRECTION:
 □ Each scene has appropriate "soundscape" (or null for silence)
 □ "soundEffects" triggered during key actions/visual pops
 □ SFX timestamps are within scene bounds

ORIGINALITY & CLICHÉS (🔴 Critical Gate):
□ NO "seeds planted in darkness" (or similar agricultural clichés)
□ Final scene is NOT "standing on mountain at sunrise" or arms-outstretched triumph
□ Final scene NOT a clichéd mirror/transformation/rebirth image
□ Crowd voice minimized (individual reactions prioritized)
□ NO "breaking chains" or "phoenix rising" metaphors (replace with specific alternatives)

METAPHOR DIVERSITY (🔴 Critical Gate — For Long Scripts):
□ Max 1 metaphor per domain (craftsmanship, nature, movement, light, mechanical)
□ If scene uses "chisel/stone" (craftsmanship), verify NO "polishing gears" in nearby scenes
□ Consecutive scenes avoid identical metaphorical idea
□ Metaphor progression: Concrete struggle → Craftsmanship metaphor → Status/Capability shift

CONCLUSION REGISTER (🔴 CRITICAL — OUTPUT BLOCKED IF VIOLATED):
□ 🔴 FORBIDDEN narration openings: "In short", "To summarize", "In conclusion", "Thus", "Therefore", "So, ", "In essence", "Bottom line"
  → If final narration starts with ANY of these → OUTPUT INVALID. REWRITE.
□ Final scene MUST maintain POETIC/CINEMATIC register (NOT consultant/email tone, NOT lecture closing)
□ Final scene: Direct poetic statement OR silent powerful visual (NOT both weakly combined)
□ Last 2-3 scenes must breathe (≥4 seconds each, pacing earned not rushed)
□ Final image is specific/earned, NOT archetypal triumph pose

METAPHOR DIVERSITY SAFETY CHECK (🔴 CRITICAL — OUTPUT BLOCKED IF VIOLATED):
□ Max 1 metaphor per domain: [craftsmanship, nature, movement, light, mechanical, animal]
□ 🔴 VIOLATION TRIGGER: If scene N uses "chisel/stone" (craftsmanship), scene N±1 through N+4 CANNOT use "polishing gears", "refining tools", "shaping metal"
  → Same domain = AUTOMATIC rejection, REWRITE
□ Metaphor progression MUST follow: [Concrete struggle → Craftsmanship metaphor → Status/Capability shift]
□ Consecutive scenes CANNOT share identical metaphorical idea

ONLY OUTPUT after ALL checks pass. Do NOT show calculations or reasoning.
═════════════════════════════════════════════════════════════════════════════════`;
  }

  /**
   * Async version of {@link buildScriptSystemPrompt}.
   *
   * When a {@link PromptLoader} is configured, this method attempts to:
   *  1. Resolve a full custom `system_prompt` template from the loader.
   *  2. Resolve dynamic `video_type_guideline` and `video_genre_guideline`
   *     overrides for use with the static template.
   *  3. Resolve dynamic `style_suffix` and `character_instruction` overrides.
   *
   * All dynamic resolution happens before building the prompt string to avoid
   * any mutation of shared instance state (safe for concurrent calls).
   *
   * Falls back to the synchronous static implementation when no dynamic prompts
   * are found or when no loader is configured.
   */
  async buildScriptSystemPromptAsync(options: VideoGenerationOptions): Promise<string> {
    if (!this.promptLoader) {
      return this.buildScriptSystemPrompt(options);
    }

    const context = {
      videoType: options.videoType,
      videoGenre: options.videoGenre,
      language: options.language,
    };

    // Attempt to load a fully custom system prompt first
    const customSystemPrompt = await this.promptLoader('system_prompt', context, {
      language: options.language || 'en-US',
      videoType: options.videoType || 'general',
      videoGenre: options.videoGenre || 'general',
    });
    if (customSystemPrompt) {
      return customSystemPrompt;
    }

    // Resolve all dynamic overrides in parallel (no instance mutation)
    const [dynamicTypeGuideline, dynamicGenreGuideline, dynamicStyleSuffix, dynamicCharInstruction] =
      await Promise.all([
        options.videoType
          ? this.promptLoader('video_type_guideline', context, { videoType: options.videoType })
          : Promise.resolve(null),
        options.videoGenre
          ? this.promptLoader('video_genre_guideline', context, { videoGenre: options.videoGenre })
          : Promise.resolve(null),
        this.promptLoader('style_suffix', context),
        this.promptLoader('character_instruction', context),
      ]);

    // If no overrides were found, use the synchronous path directly
    if (!dynamicTypeGuideline && !dynamicGenreGuideline && !dynamicStyleSuffix && !dynamicCharInstruction) {
      return this.buildScriptSystemPrompt(options);
    }

    // Build an isolated PromptManager with overridden values to avoid mutating
    // shared state (prevents race conditions under concurrent requests)
    const isolated = new PromptManager({
      styleSuffix: dynamicStyleSuffix ?? this.styleSuffix,
      characterSystemInstruction: dynamicCharInstruction ?? this.characterSystemInstruction,
      backgroundColor: this.backgroundColor,
    });

    // Override per-type/genre guideline lookups on the isolated instance
    if (dynamicTypeGuideline && options.videoType) {
      const capturedVideoType = options.videoType;
      const capturedGuideline = dynamicTypeGuideline;
      const originalGetType = isolated.getVideoTypeGuideline.bind(isolated);
      isolated.getVideoTypeGuideline = (vt: string) =>
        vt === capturedVideoType ? capturedGuideline : originalGetType(vt);
    }
    if (dynamicGenreGuideline && options.videoGenre) {
      const capturedVideoGenre = options.videoGenre;
      const capturedGuideline = dynamicGenreGuideline;
      const originalGetGenre = isolated.getVideoGenreGuideline.bind(isolated);
      isolated.getVideoGenreGuideline = (vg: string) =>
        vg === capturedVideoGenre ? capturedGuideline : originalGetGenre(vg);
    }

    return isolated.buildScriptSystemPrompt(options);
  }

  /**
   * Build the LLM user prompt for video script generation.
   */
  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions): string {
    const effectiveDuration = options.duration ?? options.maxDuration ?? options.minDuration;
    const sceneCountLine = options.sceneCountFixed
      ? `EXACTLY ${options.sceneCount} scenes`
      : (() => {
        const range = computeSceneRange(effectiveDuration);
        return `${range.min}-${range.max} scenes (your choice)`;
      })();

    const maxScene = typeof options.maxSceneDuration === 'number' ? options.maxSceneDuration : Number.POSITIVE_INFINITY;
    const minScene = MIN_SCENE_DURATION;

    const wps = this.getWordsPerSecond(options);
    const wpsFixed = wps.toFixed(1);

    const storyboardSection = this.buildStoryboardSection(options.storyboard);

    return `═══════════════════════════════════════════════════════════════════════════════
USER PROMPT: SCRIPT GENERATION
═══════════════════════════════════════════════════════════════════════════════

📝 TASK:
Create a video script about: "${topic}"

📋 SPECIFICATIONS:
• Scenes: ${sceneCountLine}
• Duration: ${options.minDuration &&
        options.maxDuration &&
        options.minDuration !== options.maxDuration
        ? `${options.minDuration}–${options.maxDuration}s (never exceed ${options.maxDuration}s)`
        : `${effectiveDuration}s exactly`
      }
• Aspect ratio: ${options.aspectRatio || '16:9'}
• Video type: ${options.videoType || 'general'}
• Genre: ${options.videoGenre || 'general'}

═══════════════════════════════════════════════════════════════════════════════
⚠️  TIMING IS EVERYTHING — DO THIS IN ORDER:
═══════════════════════════════════════════════════════════════════════════════

STEP 1: Allocate scene durations first
→ Total must not exceed ${effectiveDuration}s
→ Use timeRange: [start, end]
→ Example: Scene 1: [0, 5], Scene 2: [5, 12], Scene 3: [12, 18]

STEP 2: Estimate narration timing (${wpsFixed} words/second)
→ 5-second scene × ${wpsFixed} = max ~${Math.floor(5 * wps)} words
→ Calculate for EVERY scene before writing

STEP 3: Write narration to fit allocated duration
→ Only write if it fits → DO NOT extend timeRange
→ Short scenes need short narration → OK to be tese

STEP 4: Verify total ≤ ${effectiveDuration}s
→ Sum all timeRange end values
→ If over limit → reduce durations, not after production

═══════════════════════════════════════════════════════════════════════════════
🎯 STORY REQUIREMENTS (CRITICAL QUALITY GATES)
═══════════════════════════════════════════════════════════════════════════════

NARRATIVE STRUCTURE:
${storyboardSection}
EMOTIONAL PROGRESSION:
→ Scene-by-scene emotional evolution
→ Show character's internal struggle + realization
→ Avoid flat emotional arc (must escalate or contrast)

SPECIFICITY & CONCRETE DETAILS (🔴 MANDATORY):
→ REPLACE generics with specific details:
  ❌ "He faced obstacles" → ✅ "His manager rejected his proposal in front of the team"
  ❌ "He felt doubt" → ✅ "His hands trembled as he approached the podium"
  ❌ "The crowd disagreed" → ✅ "Sarah nodded slowly, her silence louder than words"

→ INCLUDE: Names, numbers, places, senses, consequences
→ AVOID: Vague concepts, generic emotions, abstract struggles
→ BENEFIT: Creates emotional resonance vs. distance

INTERNAL ANTAGONISM (Replace Clichés):
→ MINIMIZE: Crowd chorus ("NO! IMPOSSIBLE!"), external naysayers
→ MAXIMIZE: Psychological obstacles
  • Self-doubt ("What if I'm fooling myself?")
  • Fear of failure ("If I fail, I'll never recover")
  • Imposter syndrome ("I'm not smart enough for this")
  • Past trauma ("Last time I tried, I was humiliated")
  • Internal conflict ("Part of me wants to quit")

→ SHOW struggle visually: hesitation, physical tension, conflicted expression

═══════════════════════════════════════════════════════════════════════════════
🔴 CRITICAL: METAPHOR REDUNDANCY RULE (ADJACENT SCENES)
═══════════════════════════════════════════════════════════════════════════════

METAPHOR DOMAIN SAFETY (NON-NEGOTIABLE):
→ Max 1 metaphor per domain in entire script:
  • CRAFTSMANSHIP: chisel, forge, weaving, carving, sculpting, shaping, grinding, honing, refining, polishing
  • NATURE: seeds, growth, seasons, weather, roots, branches, blooming, decay, germination
  • MOVEMENT: climbing, falling, walking, swimming, flying, running, ascending, descending, stumbling
  • LIGHT/SHADOW: dawn, darkness, spotlight, eclipse, glow, torch, beacon, sunrise, sunset
  • MECHANICAL: gears, engines, assembly, timing, calibration, motors, circuits
  • ANIMAL AGENCY: birds, horses, wolves, fish, insects (metaphorical power)

❌ VIOLATION EXAMPLES (These WILL FAIL):
  Scene 9: "The chisel of patience shapes the stone of doubt"
  Scene 12: "Each day polishes the rough gears of skill"
  → BOTH are craftsmanship domain → REJECTION → REWRITE mandatory

✅ CORRECT METAPHOR PROGRESSION:
  Scene 9: "The chisel of patience shapes the stone of doubt" [CRAFTSMANSHIP — concrete struggle]
  Scene 12: "The manager's glance says what words don't" [STATUS SHIFT — recognition, no metaphor]
  Scene 14: "Success tastes like salt and effort" [SENSORY — earned payoff, different domain]

BREATHING & TRANSITIONS (Smooth Pacing):
→ DO NOT place intense scenes back-to-back without pause
  ❌ Scene 8 (exhaustion) → Scene 9 (complete failure) [too dark]
  ✓ Scene 8 (exhaustion) → Scene 8.5 (moment of stillness) → Scene 9 (specific failure)

→ USE transition types:
  • Reflection: Character pauses, reassesses
  • Sensory shift: Change of light, sound, or location
  • Time passage: Dawn after long night, brief moment of peace
  • Physical reset: Slight shift in position or environment

→ SLOW DOWN ENDING (don't rush resolution):
  • Final 2-3 scenes should linger (not feel rushed)
  • Let emotional payoff breathe
  • Use silence before revelation
  • Climax should feel EARNED, not forced

═══════════════════════════════════════════════════════════════════════════════
FINAL SCENE REGISTER LOCK (AVOID CONSULTANT TONE):
→ 🔴 FORBIDDEN opening words (Final & All scenes): "In short", "To summarize", "In conclusion", "Thus", "Therefore", "So, ", "In essence"
→ 🔴 NO TRUNCATION: Never end with "..." or unfinished thoughts.
→ 🔴 FINAL BREATH: Final narration duration ≤ total_duration - 2s. Leave 2s of silence at the end.
  
  ❌ "In short, your resilience was inside you all along." [EMAIL TONE — FORBIDDEN]
  ❌ "Therefore, persist with courage." [CONSULTANT TONE — FORBIDDEN]
  ❌ "To summarize, you learned to trust yourself." [LECTURE TONE — FORBIDDEN]

IMMERSIVE LANGUAGE (Sensory & Visceral):
→ SHIFT FROM: "He began working" → SHIFT TO: "His pencil scratched paper, graphite leaving dark marks"
→ INVOKE SENSES:
  • Visual: Specific colors/light ("golden sunlight stretched across the room")
  • Audio: Sounds/silence ("computer hum faded to silence")
  • Tactile: Texture/temperature ("metal numbed his palm")
  • Kinetic: Movement/weight ("stumbled forward, legs heavy")
  • Somatic: Physical sensation ("knot formed in his stomach")

→ GROUND VIEWER IN POV:
  • Use "he felt", "he saw", "he heard" (immediacy)
  • Describe PROCESS not result ("lines appeared" not "he finished")
  • Use present tense where possible
  • Embed emotion IN physical description

═══════════════════════════════════════════════════════════════════════════════
🎨 VISUAL REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

ALIGNMENT WITH NARRATION:
→ Visual tone must reinforce emotional mood
→ Example: doubt/confusion → character small or isolated
→ Example: confidence → character large or centered
→ Use internal struggle visually: hesitation, tension, conflicted expression

CHARACTER CONSISTENCY:
→ Same visual identity across all scenes
→ eyelineMatch (left/right/up/down/center) creates visual continuity
→ If looking right at scene N, show what's there in scene N+1

PROPS & COMPOSITION:
→ Max 3 props per scene
→ Props should serve narrative, not be decorative
→ No same prop in consecutive scenes
→ Each scene must visually differ from previous (layout/density/camera)

═══════════════════════════════════════════════════════════════════════════════
💬 CONTEXT HINTS
═══════════════════════════════════════════════════════════════════════════════

ADD contextType (helps with pacing):
→ "hook" (curiosity grab)
→ "explanation" (logical breakdown)
→ "revelation" (emotional insight)
→ "transition" (bridge between ideas)
→ "conclusion" (memorable finish)

TRANSITIONS (optional):
→ Options: cut, fade, slide-left, slide-right, slide-up, slide-down, wipe, zoom, pop, swish, none
→ If omitted: defaults to "fade"

═══════════════════════════════════════════════════════════════════════════════
� ORIGINALITY CHECKLIST: AVOID THESE CLICHÉS
═══════════════════════════════════════════════════════════════════════════════

BANNED VISUAL/NARRATIVE PATTERNS:
❌ "Seeds planted in darkness, watered with perseverance"
   → Replace with: specific agricultural struggle or failed growth cycle

❌ "Standing on mountain peak at sunrise, arms outstretched"
   → Replace with: unexpected recognition in ordinary place (specific location, specific moment)

❌ "Phoenix rising from ashes" / "rebirth after destruction"
   → Replace with: slow emergence or gradual transformation into visibility

❌ "Crowd says NO / Crowd cheers for approval"
   → Replace with: individual human reactions (one person's silence, specific objection, subtle shift in treatment)

❌ "Breaking chains" / "shattered shackles"
   → Replace with: specific permission granted, resource gained, or threshold crossed

❌ "Mirror reflection moment" - character sees transformed self
   → Replace with: recognition from others (glance, comment, unexpected respect)

METAPHOR SAFETY CHECK (For ${options.sceneCountFixed ? options.sceneCount : 'any'}-scene script):
→ Use MAX 1 metaphor per domain: (craftsmanship, nature, movement, light, mechanical)
→ If you use "chisel shaping stone" (craftsmanship patience metaphor) in scene 9,
   DO NOT use "polishing gears" (also craftsmanship patience) in scenes 10-15
→ Different metaphors = different ideas/functions in script

CONCLUSION REGISTER GUARD (🔴 CRITICAL):
→ FORBIDDEN closing phrases: "In short", "To summarize", "In conclusion", "Thus", "Therefore", "So, ", "Bottom line"
→ FINAL SCENE must maintain POETIC/CINEMATIC tone set throughout script
→ DO NOT sound like consultant wrapping up presentation or thesis conclusion
→ Final narration: Direct poetic statement OR silent powerful visual (NOT framing phrase + insight)

═══════════════════════════════════════════════════════════════════════════════
�📤 CRITICAL OUTPUT RULES
═══════════════════════════════════════════════════════════════════════════════

ONLY OUTPUT:
1. Valid JSON
2. No explanations, no reasoning, no calculations
3. No raw text before/after JSON

JSON STRUCTURE:
{
  "title": "compelling video title",
  "theme": "one-line theme description",
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "concise spoken text (validate: words ÷ 2.0 ≤ scene duration)",
      "actions": ["specific action 1", "specific action 2"],
      "expression": "emotional_state",
      "layoutType": "layout_name_or_custom",
      "characterVariant": "Narrator" | "Customer" | "Expert" | "...",
      "visualDensity": "low" | "medium" | "high",
      "timeRange": [start, end],
      "eyelineMatch": "left" | "right" | "up" | "down" | "center",
      "transitionToNext": "cut" | "fade" | "slide-left" | "...",
      "contextType": "hook" | "explanation" | "revelation" | "transition" | "conclusion"
    }
  ],
  "backgroundMusic": "mood description"
}

═══════════════════════════════════════════════════════════════════════════════
🔴 CRITICAL FINAL GATES (OUTPUT BLOCKED IF ANY FAIL)
═══════════════════════════════════════════════════════════════════════════════

GATE 1: CONCLUSION REGISTER
  🔴 OUTPUT BLOCKED IF:
    → Final narration starts with: "In short", "To summarize", "In conclusion", "Thus", "Therefore", "So, "
    → Final scene sounds like CONSULTANT SLIDE or EMAIL CLOSING
  ✓ PASS: Final scene is POETIC/SENSORY/DIRECT, not analytical

GATE 2: METAPHOR DOMAIN DIVERSITY
  🔴 OUTPUT BLOCKED IF:
    → 2+ scenes in same metaphor domain (craftsmanship, nature, movement, light, mechanical)
    → Examples of failure: Scene 9 "chisel" + Scene 12 "polishing gears" (both craftsmanship)
  ✓ PASS: Max 1 metaphor per domain. Progression: Concrete → Metaphor → Status shift

GATE 3: TECHNICAL VALIDATION
  🔴 OUTPUT BLOCKED IF:
    → Total duration > ${effectiveDuration}s
    → Narration word_count > scene_duration × 2.0
    → Missing required fields (sceneNumber, narration, actions, expression, timeRange)
    → JSON syntax invalid
  ✓ PASS: All technical requirements met

GATE 4: NARRATIVE QUALITY
  🔴 OUTPUT BLOCKED IF:
    → Two consecutive scenes start with same word
    → Emotional progression is flat or contradictory
    → Final scene feels rushed or clichéd (mountain at sunrise, arms outstretched)
  ✓ PASS: Strong arc, earned payoff, specific final image

IF ANY GATE FAILS → REWRITE ENTIRE SCRIPT. DO NOT ATTEMPT PARTIAL FIX.
DO NOT OUTPUT if ANY gate is uncertain.

OUTPUT NOW: JSON only (no explanations, no preamble).
═════════════════════════════════════════════════════════════════════════════════`;
  }

  /**
   * Async variant of {@link buildScriptUserPrompt}.
   *
   * Tries to load a dynamic `user_prompt` template from the external loader
   * first (e.g. from the database), interpolating the standard variables into
   * it.  Falls back transparently to the static {@link buildScriptUserPrompt}
   * when no dynamic template is found.
   */
  async buildScriptUserPromptAsync(topic: string, options: VideoGenerationOptions): Promise<string> {
    if (!this.promptLoader) {
      return this.buildScriptUserPrompt(topic, options);
    }

    const context = {
      videoType: options.videoType,
      videoGenre: options.videoGenre,
      language: options.language,
    };

    const effectiveDuration = options.duration ?? options.maxDuration ?? options.minDuration;
    const wps = this.getWordsPerSecond(options);

    const customUserPrompt = await this.promptLoader('user_prompt', context, {
      topic,
      language: options.language || 'en-US',
      videoType: options.videoType || 'general',
      videoGenre: options.videoGenre || 'general',
      duration: String(effectiveDuration),
      sceneCount: String(options.sceneCount),
      aspectRatio: options.aspectRatio || '16:9',
      wordsPerSecond: wps.toFixed(1),
    });

    if (customUserPrompt) {
      return customUserPrompt;
    }

    return this.buildScriptUserPrompt(topic, options);
  }

  // ─── Storyboard helpers ───────────────────────────────────────────────────

  /**
   * Build the NARRATIVE STRUCTURE section of the user prompt.
   *
   * When a storyboard is provided, the beats are rendered as an ordered list
   * that the LLM must follow scene-by-scene.  Without a storyboard the method
   * returns the default generic narrative arc.
   */
  private buildStoryboardSection(storyboard?: Storyboard): string {
    if (!storyboard || storyboard.beats.length === 0) {
      return `→ Hook (scene 1): Grab attention immediately
→ Exploration: Deepen curiosity
→ Revelation: Key insight or turning point
→ Resolution: Answer the hook's question
→ Conclusion: Memorable final thought
`;
    }

    const beatLines = storyboard.beats.map((beat, idx) => {
      return this.formatStoryboardBeat(beat, idx + 1);
    });

    const header = storyboard.name
      ? `🎬 STORYBOARD: "${storyboard.name}" (${storyboard.beats.length} beats — FOLLOW EXACTLY)`
      : `🎬 STORYBOARD (${storyboard.beats.length} beats — FOLLOW EXACTLY)`;

    return `${header}
${beatLines.join('\n')}
→ Each storyboard beat maps to ONE or more scenes depending on duration.
→ Preserve beat order exactly. DO NOT skip or reorder beats.
`;
  }

  /**
   * Format a single storyboard beat as a numbered prompt line.
   */
  private formatStoryboardBeat(beat: StoryboardBeat, index: number): string {
    const roleLabel = beat.role.toUpperCase();
    const parts: string[] = [`Beat ${index} [${roleLabel}]`];

    if (beat.description) {
      parts.push(`→ ${beat.description}`);
    }

    const meta: string[] = [];
    if (beat.durationHint) meta.push(`~${beat.durationHint}s`);
    if (beat.emotionTarget) meta.push(`emotion: ${beat.emotionTarget}`);
    if (beat.visualHint) meta.push(`visual: ${beat.visualHint}`);

    if (meta.length > 0) {
      parts.push(`   (${meta.join(' | ')})`);
    }

    return parts.join('\n');
  }

  // =========================================================================
  // LAYOUT ANALYSIS PROMPT
  // =========================================================================

  /**
   * Build the system prompt for scene layout JSON analysis.
   */
  buildLayoutSystemPrompt(): string {
    return `You are a scene director. Output valid JSON layout with positions like center, top-left, top-right, etc.
Return only JSON: {assets: [], texts: [], backgroundColor: ""}`;
  }

  // =========================================================================
  // IMAGE GENERATION PROMPTS
  // =========================================================================

  /**
   * Build the full system instruction for the image generation model.
   * When reference images are provided, they are the ABSOLUTE SOURCE OF TRUTH.
   * All other instructions serve the reference images, never contradict them.
   */
  buildImageSystemInstruction(hasReferenceImages: boolean): string {
    if (hasReferenceImages) {
      return `═══════════════════════════════════════════════════════════════════════════════
IMAGE GENERATION SYSTEM: REFERENCE-DRIVEN MODE
═══════════════════════════════════════════════════════════════════════════════

🔴 ABSOLUTE RULE: Reference Images Are Visual Authority
────────────────────────────────────────────────────────────────────────────

You are the creator of the attached reference images.
Reference images = ONLY visual source of truth.

MODE: REFERENCE-FIDELITY
→ NO variations or interpretations
→ NO generic character rules that contradict reference
→ REPRODUCE exact character from reference in new pose/action
→ Visual character design IDENTICAL across scenes
→ Pose & action may change → visual identity constant

MANDATORY REPRODUCTION:
✓ Head shape: EXACT
✓ Body structure: EXACT
✓ Line style & weight: EXACT
✓ Proportions: EXACT
✓ Aesthetic: EXACT

${this.characterSystemInstruction}
`;
    }
    return this.characterSystemInstruction;
  }

  /**
   * Build the full image generation prompt for an asset.
   * When reference images are available, they drive the entire composition.
   * Combines type hint + main description + caption space + visual text + style suffix.
   */
  buildAssetImagePrompt(
    asset: AssetDefinition,
    referenceImageCount: number,
    customPrompt?: string,
    captionPosition?: string,
    progressiveElements?: string[]
  ): string {
    const hasReferenceImages = referenceImageCount > 0;
    let typeHint: string;
    if (asset.type === 'character' && hasReferenceImages) {
      typeHint = `[REFERENCE-DRIVEN CHARACTER: ${asset.description}]
Apply the EXACT character identity matching this description from reference images.
Maintain: head shape, body proportions, limb structure, line style, visual aesthetic.
Adapt: pose & action only. Visual identity stays identical.`;
    } else {
      typeHint = asset.type === 'character'
        ? '[CHARACTER] Sketchy hand-drawn character figure.'
        : '[PROP/OBJECT ONLY] Isolated object, NO character.';
    }

    const mainDescription = customPrompt || asset.description;

    // Caption space instruction — explicit and minimal
    let captionSpace = '';
    if (captionPosition === 'top') {
      captionSpace = '[RESERVE SPACE] Clear white area at TOP for captions.\n Keep top uncluttered.';
    } else if (captionPosition === 'bottom') {
      captionSpace = '[RESERVE SPACE] Clear white area at BOTTOM for captions.\n Keep bottom uncluttered.';
    }

    // NO text overlay — mandatory
    const noTextInstruction = '[NO TEXT] Do NOT add words, labels, or letters anywhere.\n Image: character + props + background ONLY.';

    // Background instruction — depends on reference + progressive mode
    let backgroundInstruction = '';
    if (progressiveElements && progressiveElements.length > 0 && referenceImageCount > 0) {
      // ── PROGRESSIVE REVEAL MODE ──
      // Replicate previous scene 100% and only add the newly listed elements.
      backgroundInstruction = `[PROGRESSIVE REVEAL MODE]
- REFERENCE IMAGE: Previous scene — REPRODUCE IT EXACTLY, pixel-perfect.
  Every existing element (character, props, background, positions) MUST remain 100% IDENTICAL.
- ADD ONLY these NEW elements to the scene:
${progressiveElements.map(e => `  • ${e}`).join('\n')}
- New elements must be drawn in the SAME visual style (sketchy, hand-drawn line art).
- New elements should appear naturally integrated alongside the existing ones.
- DO NOT move, resize, replace, or alter any existing element.`;
    } else if (referenceImageCount > 1) {
      backgroundInstruction = `[VISUAL CONTINUITY MODE]
- REFERENCE 1: Character identity (EXACT reproduction of figure).
- REFERENCE 2: Scene background & environment.
MANDATE: Keep the environment from Reference 2 100% identical. Adapt character pose on top of this established scene.`;
    } else if (hasReferenceImages) {
      backgroundInstruction = `[BACKGROUND LOCKED] 
The background from reference images MUST be EXACTLY PRESERVED.
Do NOT modify, replace, crop, or change background.
Character pose adapts to new context. Background stays 100% identical.`;
    }

    // Style section
    let styleInstruction = '';
    if (hasReferenceImages && asset.type === 'character') {
      styleInstruction = `[STYLE] Match reference exactly:
- Line weight & stroke quality
- Aesthetic & visual language
- Visual identity`;
    } else if (this.styleSuffix) {
      styleInstruction = `[STYLE] ${this.styleSuffix}`;
    }

    // Assemble with clear section breaks
    const parts = [
      typeHint,
      mainDescription,
      captionSpace,
      noTextInstruction,
      backgroundInstruction,
      styleInstruction
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  /**
   * Build a complete scene image generation prompt.
   * When hasReferenceImages is true, the background is preserved from the reference.
   */
  buildImagePrompt(scene: EnrichedScene, hasReferenceImages: boolean = false): ImagePrompt {
    const narrativeContext = this.extractNarrativeContext(scene.narration || '');
    const elements = this.extractSceneElements(scene);

    const sections: string[] = [
      `═══════════════════════════════════════════════════════════════════════
SCENE IMAGE GENERATION PROMPT
═════════════════════════════════════════════════════════════════════`,
      this.describeCharacter(scene.characterVariant),
      this.describePoseAndAction(elements, narrativeContext),
      this.describeExpression(scene.expression, narrativeContext),
      this.describeCharacterValidity(),
      this.describeProps(scene.props ?? []),
      this.describeComposition(scene.layoutType, hasReferenceImages, scene.continueFromPrevious, false),
      this.describeDensity(scene.visualDensity, hasReferenceImages, scene.continueFromPrevious),
      this.describeBackground(scene.background, hasReferenceImages, scene.continueFromPrevious),
      this.describeNarrativeAlignment(scene.narration, narrativeContext),
    ];

    const prompt = sections.filter(p => p.length > 0).join('\n\n');

    return {
      sceneId: scene.id,
      prompt,
      elements: {
        pose: elements.pose,
        action: elements.action,
        expression: scene.expression,
        props: scene.props,
        background: scene.background || this.backgroundColor,
      },
    };
  }

  // =========================================================================
  // ANIMATION PROMPTS
  // =========================================================================

  /**
   * Build animation instructions for a scene.
   */
  buildAnimationPrompt(scene: EnrichedScene): AnimationPrompt {
    const movements = this.extractMovements(scene);
    const instructions = movements.map(m => m.description).join('. ') + '. Body stays static.';
    return { sceneId: scene.id, instructions, movements };
  }

  // =========================================================================
  // VIDEO TYPE & GENRE GUIDELINES
  // =========================================================================

  /**
   * Return a short guideline string for a video type.
   * These are used inline in the script system prompt.
   */
  getVideoTypeGuideline(videoType: string): string {
    const guidelines: Record<string, string> = {
      'faceless': 'Focus on narration-driven content with strong visuals. No need to show character face prominently.',
      'tutorial': 'Break down steps clearly. Show character demonstrating each step with props and clear actions.',
      'listicle': 'Structure as numbered points. Each scene should represent one item with clear visual representation.',
      'news': 'Present information factually. Character should appear as news presenter or reporter with relevant props.',
      'animation': 'Emphasize dynamic movements and visual effects. Character should have exaggerated, expressive actions.',
      'review': 'Show character examining and interacting with the subject. Include evaluation gestures and expressions.',
      'story': 'Build narrative progression. Character emotions and actions should tell the story visually.',
      'motivational': 'Use uplifting language and confident poses. Character should display inspiring body language.',
      'entertainment': 'Make it fun and engaging. Character should have playful, energetic actions and expressions.',
    };
    return guidelines[videoType] ?? '';
  }

  /**
   * Return a short guideline string for a video genre.
   * These are used inline in the script system prompt.
   */
  getVideoGenreGuideline(videoGenre: string): string {
    const guidelines: Record<string, string> = {
      'educational': 'Prioritize clarity and learning outcomes. Use teaching gestures and educational props.',
      'fun': 'Focus on engagement and entertainment value. High energy and entertaining actions.',
      'business': 'Professional tone with business-related props (charts, briefcase, documents).',
      'lifestyle': 'Relatable everyday scenarios. Show character in common life situations.',
      'tech': 'Include tech props (computer, phone, gadgets). Character should interact with technology.',
      'finance': 'Use money-related props and gestures. Professional and trustworthy demeanor.',
      'health': 'Show healthy activities and wellness props. Positive, energetic character.',
      'travel': 'Include travel-related props (map, luggage, camera). Adventurous character poses.',
      'food': 'Feature food props and cooking/eating actions. Expressive reactions to food.',
      'gaming': 'Include gaming props (controller, screen). Excited, focused gaming expressions.',
      'sports': 'Athletic poses and sports props. Dynamic, action-oriented scenes.',
      'science': 'Scientific props (beaker, microscope). Curious, investigative character actions.',
      'history': 'Historical props and period-appropriate elements. Storytelling focused.',
      'self-improvement': 'Growth-oriented actions. Character showing progress and positive change.',
      'mystery': 'Suspenseful atmosphere. Character in investigative or surprised poses.',
      'general': 'Versatile content suitable for broad audiences. Balance between information and entertainment.',
    };
    return guidelines[videoGenre] ?? '';
  }

  // =========================================================================
  // NARRATIVE CONTEXT EXTRACTION
  // =========================================================================

  /**
   * Parse scene narration to extract semantic context (emotion, energy, implied actions, etc.)
   * This bridges the gap between narration and visual generation.
   */
  private extractNarrativeContext(narration: string): NarrativeContext {
    const lower = narration.toLowerCase();
    const context: NarrativeContext = {
      impliedActions: [],
      descriptors: [],
    };

    // Emotion detection
    const emotionMap: Record<string, string> = {
      'happy|excited|thrilled|delighted|celebrates': 'joyful',
      'sad|upset|depressed|disappointed': 'sorrowful',
      'angry|furious|outraged': 'angry',
      'confused|uncertain|puzzled': 'confused',
      'calm|peaceful|zen': 'calm',
      'nervous|anxious|worried|afraid': 'anxious',
      'proud|confident|assured': 'proud',
      'surprised|shocked': 'surprised',
    };

    for (const [patterns, emotion] of Object.entries(emotionMap)) {
      if (patterns.split('|').some(p => lower.includes(p))) {
        context.emotion = emotion;
        break;
      }
    }

    // Energy level detection
    if (lower.match(/\b(quickly|fast|rushing|sprint|jump|explosive|intense|wild|crazy)\b/)) {
      context.energy = 'high';
    } else if (lower.match(/\b(slowly|gently|quiet|pause|wait|calm|rest|peaceful)\b/)) {
      context.energy = 'low';
    } else {
      context.energy = 'medium';
    }

    // Extract implied actions (verbs)
    const actionVerbs = lower.match(/\b(walk|run|jump|dance|point|nod|shake|grab|hold|throw|catch|push|pull|sit|stand|lean|climb|swim|eat|drink|write|read|think|look|watch|listen|speak|sing|laugh|cry|trembl|hesitate|stumbl|freeze|clinch)\b/g);
    if (actionVerbs) {
      context.impliedActions = [...new Set(actionVerbs)].slice(0, 5);
    }

    // Extract descriptors (adjectives)
    const descriptorRegex = /\b(big|small|large|tiny|red|blue|brave|smart|fast|slow|sad|happy|tense|rigid|conflicted|torn|uncertain|steady)\b/g;
    const descriptors = lower.match(descriptorRegex);
    if (descriptors) {
      context.descriptors = [...new Set(descriptors)].slice(0, 3);
    }

    // INTERNAL ANTAGONISM DETECTION (psychological struggle keywords)
    const internalConflictKeywords = [
      'doubt|uncertain|question|wonder if|what if',
      'fear|afraid|dread|terrified',
      'shame|humiliated|embarrassed',
      'hesitate|pause|freeze|torn',
      'conflict|fight|struggle|wrestle',
      'impostor|not enough|not worthy',
      'trembl|shake|nervous|anxious',
    ];
    const hasInternalConflict = internalConflictKeywords.some(kw =>
      kw.split('|').some(word => lower.includes(word))
    );

    // Subject/focus detection
    const subjectIndicators = lower.match(/\b(character|person|man|woman|child|figure|someone|protagonist|hero|villain)\b/);
    context.subject = subjectIndicators?.[0] || 'character';

    // Situation/context hints
    if (lower.match(/office|work|desk|computer|meeting/)) context.situation = 'office';
    else if (lower.match(/home|house|room|couch|bed|bedroom/)) context.situation = 'home';
    else if (lower.match(/outside|street|park|nature|outdoor|open/)) context.situation = 'outdoor';
    else if (lower.match(/shop|store|market|buy|sell/)) context.situation = 'retail';
    else if (lower.match(/school|class|learn|teach/)) context.situation = 'education';
    else if (lower.match(/stage|platform|audience|present|speak/)) context.situation = 'public';
    else context.situation = 'neutral';

    // Store internal conflict flag for visual guidance
    if (hasInternalConflict) {
      context.descriptors = context.descriptors || [];
      context.descriptors.push('internal-conflict');
    }

    return context;
  }

  // =========================================================================
  // Private helpers — image prompt assembly
  // =========================================================================

  private extractSceneElements(scene: EnrichedScene): { pose: string; action: string } {
    const actions = scene.actions || [];
    return {
      pose: actions[0] || 'standing normally',
      action: actions[1] || actions[0] || 'neutral stance',
    };
  }

  private describeCharacter(variant?: string): string {
    // When reference images are used, they override variant descriptions
    // The reference image is the visual source of truth
    const base = `REFERENCE IMAGES ARE THE SOURCE OF TRUTH: The character must match the reference image exactly. Ignore variant instructions if they conflict with the reference visual appearance. The reference image takes absolute priority.`;
    return base;
  }

  private getVariantDescription(variant: string): string {
    switch (variant) {
      case 'professor':
        return 'VARIANT: Professor - wearing small round glasses and a formal tie. Academic appearance.';
      case 'farmer':
        return 'VARIANT: Farmer - wearing a straw hat and casual farm attire. Rural appearance.';
      case 'robot':
        return 'VARIANT: Robot - mechanical joints, robotic appearance, mechanical limbs and body parts.';
      case 'baby':
        return 'VARIANT: Baby - smaller proportions, baby-like head, diaper, infantile appearance.';
      case 'investor':
        return 'VARIANT: Investor - wearing business suit, tie, holding briefcase. Professional appearance.';
      default:
        return '';
    }
  }

  private describePoseAndAction(elements: { pose: string; action: string }, narrativeContext?: NarrativeContext): string {
    const parts: string[] = [];

    const pose = elements.pose.toLowerCase();
    const action = elements.action.toLowerCase();

    if (pose === action) {
      parts.push(`[POSE] ${pose}`);
    } else {
      parts.push(`[POSE] ${pose}`);
      parts.push(`[ACTION] ${action}`);
    }

    // Energy intensity (binary: high/low/medium)
    if (narrativeContext?.energy === 'high') {
      parts.push(`[ENERGY] Dynamic, fast motion, urgency`);
    } else if (narrativeContext?.energy === 'low') {
      parts.push(`[ENERGY] Slow, introspective motion`);
    }

    // INTERNAL CONFLICT VISUAL SIGNALS
    const hasConflict = narrativeContext?.descriptors?.includes('internal-conflict');
    if (hasConflict) {
      parts.push(`[INTERNAL CONFLICT VISUAL]`);
      parts.push(`→ Show hesitation: pause before action`);
      parts.push(`→ Physical tension: rigid shoulders, clenched jaw, trembling hands`);
      parts.push(`→ Conflicted expression: split between hope & fear`);
      parts.push(`→ Micro-movements: small steps instead of bold strides`);
      parts.push(`→ Moment of courage: visible effort overcoming doubt`);
    }

    // Implied actions from narration
    if (narrativeContext?.impliedActions && narrativeContext.impliedActions.length > 0) {
      const actions = narrativeContext.impliedActions.slice(0, 2).join(', ');
      parts.push(`[APPLIED ACTIONS] ${actions}`);
    }

    return parts.join(' | ');
  }

  private describeExpression(expression?: string, narrativeContext?: NarrativeContext): string {
    if (!expression && !narrativeContext?.emotion) return '';

    const expr = expression?.toLowerCase() || narrativeContext?.emotion || '';
    return `[EXPRESSION] ${expr}`;
  }

  private describeNarrativeAlignment(narration: string, context: NarrativeContext): string {
    if (!narration) return '';

    const preview = narration.substring(0, 80) + (narration.length > 80 ? '...' : '');
    const parts: string[] = [
      `[NARRATIVE ALIGNMENT] Narration: "${preview}"`,
      `[SENSORY INSTRUCTION] Render this narration SENSORIALLY:`,
      `→ If text mentions emotion, show PHYSICAL manifestation (trembling, tightness, etc.)`,
      `→ If text mentions action, show PROCESS not just result`,
      `→ Include SPECIFIC details: color, texture, temperature, sound`,
      `→ Ground viewer in character's direct experience (POV)`,
    ];

    if (context.situation) {
      parts.push(`[SETTING] ${context.situation} (specific environment clues)`);
    }

    if (context.energy) {
      const mood = context.energy === 'high' ? 'dynamic, active, intense movement' : context.energy === 'low' ? 'calm, slow, introspective' : 'balanced, purposeful';
      parts.push(`[MOOD & ENERGY] ${mood}`);
    }

    if (context.impliedActions && context.impliedActions.length > 0) {
      parts.push(`[VISUAL ACTIONS] Show: ${context.impliedActions.join(', ')} (specificity matters)`);
    }

    if (context.descriptors && context.descriptors.length > 0) {
      parts.push(`Visual qualities: ${context.descriptors.join(', ')}`);
    }

    return parts.join(' | ');
  }

  private describeCharacterValidity(): string {
    return `[CHARACTER FIDELITY - MANDATORY]
✓ Reference images are visual blueprint (if provided)
✓ NO variations or interpretations
✓ Same head shape, limbs, proportions, line style
✓ Pose/action adapt → visual identity constant
✓ Full body always visible (never crop by frame edges)

[PROPS]
✓ Max 3 props per scene
✓ Each prop: correct structure & proportions
✓ Each prop serves narrative purpose (not decorative)
✓ Props DISTINCT from character and each other
✓ No same prop in consecutive scenes

[VISIBILITY]
- Character never cropped
- Props clearly separated from character
- All elements logically positioned`;
  }

  private describeProps(props?: string[]): string {
    if (!props || props.length === 0) return '';

    const propList = props.join(', ');
    return `[PROPS] ${propList}
RULES:
- All structurally correct (proper proportions)
- DISTINCT from character AND each other
- Serve narrative purpose
- Position clearly so recognizable as separate`;
  }

  private describeComposition(layoutType: string | undefined, hasReferenceImages: boolean = false, isContinuation: boolean = false, hasVisualText: boolean = false): string {
    if (isContinuation) {
      return `[COMPOSITION: PERSISTENT]
EXACTLY reuse the spatial arrangement from the previous scene reference.
Character maintains position. props stay in place.
Adapt pose/expression only.`;
    }
    if (hasReferenceImages) {
      return `[COMPOSITION] Mirror reference image layout.
Adapt pose/action. Preserve spatial arrangement.`;
    }
    if (!layoutType) {
      return `[COMPOSITION] Centered subject as focal point.
Balanced whitespace around.`;
    }
    const layout = LAYOUT_CATALOG[layoutType as LayoutId];
    let instruction = layout?.compositionInstruction || `[COMPOSITION] Centered composition`;

    // If no visual text is present, strip mentions of bubbles or clouds to prevent empty drawings
    if (!hasVisualText) {
      instruction = instruction.replace(/\b(speech|thought)\s+bubble\b/gi, 'area');
      instruction = instruction.replace(/\bcloud\b/gi, 'space');
      // If we find "with area above" or similar, it might still trigger something, but it's better than "bubble"
    }

    return instruction;
  }


  private describeDensity(density?: string, hasReferenceImages: boolean = false, isContinuation: boolean = false): string {
    if (isContinuation || hasReferenceImages) {
      return `[VISUAL DENSITY] Match reference image complexity level.
Same detail & element count.`;
    }

    const inkStyle = `Expressive variable-width sketchy ink lines.
Subtle splatters for authenticity.`;

    switch (density) {
      case 'low':
        return `[DENSITY: LOW] Minimal, clean, uncluttered.
Ample negative space. Focused composition.
${inkStyle}`;
      case 'high':
        return `[DENSITY: HIGH] Multiple dynamic elements.
Rich visual complexity. Clear main focus.
${inkStyle}`;
      default:
        return `[DENSITY: MEDIUM] Standard dynamic composition.
${inkStyle}`;
    }
  }

  private describeBackground(backgroundDescription?: string, hasReferenceImages: boolean = false, isContinuation: boolean = false): string {
    if (isContinuation) {
      return `[BACKGROUND: PERSISTENT CONTINUITY]
USE THE PREVIOUS SCENE IMAGE AS LITERALLY THE SAME WALL/ROOM/LOCATION.
NO changes to background details, colors, or objects.
Character is simply performing a new action in THE SAME PERSISTENT SPACE.`;
    }
    if (hasReferenceImages) {
      return `[BACKGROUND: LOCKED]
Preserve EXACTLY from reference.
NO modifications, crops, or changes.
Character pose adapts. Background stays identical.`;
    }

    if (backgroundDescription) {
      return `[BACKGROUND] ${backgroundDescription}
Maintain the same flat 2D vector style as the character.
Professional cinematic feel with specific environmental details mentioned above.`;
    }

    return `[BACKGROUND] Solid color: ${this.backgroundColor}
Flat 2D vector style.
High contrast, professional cinematic feel.`;
  }

  // ─── Animation helpers ────────────────────────────────────────────────────

  private extractMovements(scene: EnrichedScene): Array<{
    element: 'arm' | 'head' | 'body' | 'prop' | 'hand' | 'legs';
    description: string;
    duration?: string;
  }> {
    const movements: Array<{
      element: 'arm' | 'head' | 'body' | 'prop' | 'hand' | 'legs';
      description: string;
      duration?: string;
    }> = [];

    const actions = scene.actions || [];
    actions.forEach(action => {
      const lower = action.toLowerCase();

      if (lower.includes('arm') || lower.includes('hand') || lower.includes('reaching') || lower.includes('typing')) {
        movements.push({
          element: lower.includes('hand') ? 'hand' : 'arm',
          description: `Move character's ${lower.includes('hand') ? 'hand' : 'arm'} ${action.toLowerCase()}`,
          duration: this.inferMovementDuration(action),
        });
      }

      if (lower.includes('head') || lower.includes('nod') || lower.includes('look')) {
        movements.push({
          element: 'head',
          description: action,
          duration: 'subtle',
        });
      }

      if (scene.props && scene.props.length > 0) {
        scene.props.forEach(prop => {
          if (lower.includes(prop.toLowerCase())) {
            movements.push({
              element: 'prop',
              description: `Animate ${prop} ${action.toLowerCase()}`,
            });
          }
        });
      }
    });

    if (movements.length === 0) {
      movements.push({
        element: 'body',
        description: 'Subtle breathing motion in torso',
        duration: 'continuous',
      });
    }

    return movements;
  }

  private inferMovementDuration(action: string): string {
    const lower = action.toLowerCase();
    if (lower.includes('quick') || lower.includes('sudden') || lower.includes('pop')) return 'quick';
    if (lower.includes('slow') || lower.includes('gentle') || lower.includes('calm')) return 'slow';
    return 'smooth';
  }

  // ─── Generic narrative arc fallback (no video type specified) ─────────────

  private buildGenericNarrativeArcBlock(): string {
    return `----------------------------------------------------------------
NARRATIVE ARC (SHORT-FORM STRUCTURE)
----------------------------------------------------------------
Scenes should roughly follow:

1. Hook (attention grab)
2. Context or problem
3. Exploration
4. Key insight
5. Resolution
6. Memorable closing moment`;
  }
  // =========================================================================
  // CHARACTER BIBLE (SHEET) GENERATION
  // =========================================================================

  /**
   * Build a prompt for generating a comprehensive Character Reference Sheet (Scene 0).
   * This sheet is used as the primary visual consistency anchor for the rest of the video.
   */
  buildCharacterBiblePrompt(mainCharacterDescription: string, characters: string[] = ['standard']): string {
    const characterList = characters.join(', ');
    const compositionRule = characters.length > 1
      ? `• Split-screen 2x2 grid (4 shots total)
• Show both characters in the grid for visual consistency:
  - Top Row: 2 shots of Character 1 (${characters[0]})
  - Bottom Row: 2 shots of Character 2 (${characters[1] || '...'})
  - Each character should have 1 Full-body shot and 1 Close-up/Action shot.`
      : `• Split-screen 2x2 grid (4 shots total)
• Top-Left: Full body standing (front view)
• Top-Right: Medium shot gesturing (side/3q view)
• Bottom-Left: Extreme close-up face (emotional expression)
• Bottom-Right: Character in a specialized pose related to the topic`;

    return `═══════════════════════════════════════════════════════════════════════════════
CHARACTER REFERENCE SHEET GENERATION (SCENE 0)
═══════════════════════════════════════════════════════════════════════════════

📝 TASK:
Generate a high-consistency character reference sheet for: "${mainCharacterDescription}"
Characters included: ${characterList}

📋 COMPOSITION RULES (🔴 MANDATORY):
${compositionRule}

🎨 VISUAL STYLE:
• Style: Whiteboard Sketch / Minimalist Illustration
• Background: PLAIN WHITE (#FFFFFF) - NO exceptions
• Lines: Clean, deliberate, thick-and-thin g-pen style
• Color: High contrast black and white (or minor spot color if specified)

🔴 CHARACTER DETAILS:
• Distinctive features must be exaggerated and clear (glasses, hair, clothing)
• Ensure clothing is identical in all 4 shots
• NO complex backgrounds, NO other people

→ OBJECTIVE: This image will serve as the "Source of Truth" for an entire video. FLAWLESS consistency within the sheet is paramount.
═══════════════════════════════════════════════════════════════════════════════`;
  }
}
