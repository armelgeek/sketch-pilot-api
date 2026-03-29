/**
 * PromptManager
 *
 * Central class that manages ALL prompts used throughout the character video generator.
 * Every prompt string — for script generation, scene layout, image/animation generation,
 * and asset creation — is built and owned here.
 *
 * 100% Dynamic Version: No hardcoded rules, quality tags, or character-specific string replacements.
 * Everything comes from the Spec.
 *
 * FIX v2: Word count enforcement for GPT-4o / non-Kokoro providers.
 *   - Per-provider WPS calibration (kokoro=2.45, openai/gpt4o=2.0, elevenlabs=2.1)
 *   - minSentencesPerScene raised to 6 (was 4, always hit the lower bound)
 *   - minWordsPerScene floor raised to 50 (was 15, zero real pressure)
 *   - Exact target per scene instead of "minimum" (GPT-4o obeys targets better)
 *   - Self-validation "wordCount" field injected in JSON schema
 *   - SAFETY_FACTOR raised to 1.2 for non-Kokoro providers
 *
 * FIX v3: Retry feedback + per-preset word count floors.
 *   - buildRetryFeedback(): surgical, scene-specific feedback on each retry attempt
 *   - Per-preset minimum words: hook ≥ 30, reveal ≥ 60, mirror ≥ 40
 *   - minWordsOverall replaced with minWordsHook/Reveal/Mirror in prompt + output format
 *   - Absolute minimum overrides injected in instructions to prevent spec contradictions
 *
 * FIX v4: Anti-under-generation — LLM bias toward concision fix.
 *   - [C] Narrative scaffold slots replacing raw word-count targets per preset
 *       Each preset now requires filling named content slots (OBSERVATION, EXPLANATION, etc.)
 *       making it structurally impossible to satisfy the constraint with sparse text.
 *   - [B] Sentence-count floors as secondary validator (easier to check programmatically)
 *   - [D] Duration-based retry feedback ("missing ~28s of narration" vs "missing 67 words")
 *       LLMs have intuitive understanding of spoken duration — far more visceral than word counts.
 */

import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { computeSceneCount } from '../types/video-script.types'
import type { AnimationPrompt, EnrichedScene, ImagePrompt, VideoGenerationOptions } from '../types/video-script.types'
import type { PromptMakerOptions, VideoTypeSpecification } from './prompt-maker.types'
import type { SceneMemory } from './scene-memory'

export interface PromptManagerConfig {
  /**
   * Primary specification used for both script and image generation.
   * If provided, this prompt record will drive the entire video personality.
   */
  scriptSpec?: VideoTypeSpecification
  /**
   * The ID of the character model to use for visual consistency.
   */
  characterModelId?: string
}

// ─── Per-provider TTS speed calibration ──────────────────────────────────────
// Words per second measured at default speed / pitch.
// Adjust these if you measure different real-world values.
const PROVIDER_WPS: Record<string, number> = {
  kokoro: 2.45, // Kokoro local TTS @ speed 1.0 — measured
  openai: 2.37, // GPT-4o TTS measured
  gpt4o: 2.37, // alias
  'gpt-4o': 2.37, // alias
  elevenlabs: 2.1, // ElevenLabs standard voices
  azure: 2.2, // Azure Neural TTS
  google: 2.15 // Google Cloud TTS
}

// Safety factor: how much extra headroom to add on top of the WPS calculation.
const PROVIDER_SAFETY_FACTOR: Record<string, number> = {
  kokoro: 1.1,
  openai: 1.05,
  gpt4o: 1.05,
  'gpt-4o': 1.05,
  elevenlabs: 1.15,
  azure: 1.15,
  google: 1.15
}
const DEFAULT_WPS = 2.37
const DEFAULT_SAFETY_FACTOR = 1.05

const PACING_FACTORS = {
  fast: 1.2, // ~20% more words per second (dense, high energy)
  medium: 1, // base speed
  slow: 0.8 // ~20% fewer words (breathable, dramatic)
}

// ─── Per-preset absolute minimum word counts ─────────────────────────────────
const PRESET_MIN_WORDS = {
  hook: 30,
  reveal: 60,
  mirror: 40
} as const

// Minimum sentence counts per preset — used both in validation and feedback [B]
const PRESET_MIN_SENTENCES = {
  hook: 3,
  reveal: 5,
  mirror: 3
} as const

// ─── [C] Narrative scaffold slots per preset ──────────────────────────────────
// Each slot MUST be filled with at least 1-2 complete sentences.
// This makes it structurally impossible to satisfy the constraint with sparse text.
const PRESET_SCAFFOLD: Record<string, { slots: string[]; description: string }> = {
  hook: {
    description: 'Percutant & High Impact opener',
    slots: [
      '[HOOK_QUESTION_OR_SHOCK] — A provocative question, surprising fact, or visceral statement that stops the viewer cold.',
      '[TENSION_BUILD] — Amplify the tension or curiosity. Why should the viewer keep watching?',
      '[IMPLICIT_PROMISE] — Hint at the revelation or transformation coming. Make them feel they NEED to see what follows.'
    ]
  },
  reveal: {
    description: 'Detailed Explanation — the intellectual and emotional core of the video',
    slots: [
      '[OBSERVATION] — Describe what is happening / what the viewer already recognizes from their own life.',
      '[EXPLANATION] — Explain WHY it works this way. The underlying mechanism, root cause, or hidden logic.',
      '[CONCRETE_EXAMPLE] — A specific, sensory, real-world example. Start with "Imagine...", "Picture...", or "Think of the time when...".',
      '[CONSEQUENCE] — What does this mean for the viewer? What does it cost them, unlock for them, or change?',
      "[TRANSITION] — A bridging sentence that naturally pulls the viewer toward the next scene's idea."
    ]
  },
  mirror: {
    description: 'Emotional Recognition — the viewer sees themselves in the message',
    slots: [
      '[EMOTIONAL_RECOGNITION] — Name a feeling, situation, or internal experience the viewer has had. Make them feel seen.',
      '[VALIDATION] — Normalize or validate that experience. They are not alone. This is human.',
      '[OPENING] — Gently open a door: a reframe, a question, or a possibility that invites them to see things differently.'
    ]
  }
}

type Preset = keyof typeof PRESET_MIN_WORDS

// ─────────────────────────────────────────────────────────────────────────────

export class PromptManager {
  /** @deprecated Use getWordsPerSecond() which is provider-aware. */
  public static readonly REAL_TTS_WPS = 2.45
  /** @deprecated Use getSafetyFactor() which is provider-aware. */
  public static readonly SAFETY_FACTOR = 1.15

  private spec?: VideoTypeSpecification
  private characterModelId?: string
  private readonly characterRepository = new CharacterModelRepository()

  constructor(config: PromptManagerConfig = {}) {
    this.spec = config.scriptSpec
    this.characterModelId = config.characterModelId
  }

  // ─── Provider helpers ──────────────────────────────────────────────────────

  private resolveProvider(options: VideoGenerationOptions): string {
    return (options.audioProvider || 'kokoro').toLowerCase()
  }

  private getSafetyFactor(options: VideoGenerationOptions): number {
    const provider = this.resolveProvider(options)
    return PROVIDER_SAFETY_FACTOR[provider] ?? DEFAULT_SAFETY_FACTOR
  }

  public getPublicSafetyFactor(options: VideoGenerationOptions): number {
    return this.getSafetyFactor(options)
  }

  // ─── Character resolution ──────────────────────────────────────────────────

  private async resolveCharacterMetadata(): Promise<any | undefined> {
    if (this.characterModelId) {
      const model = await this.characterRepository.findById(this.characterModelId)
      if (model) {
        return {
          description: model.description || '',
          gender: model.gender || 'unknown',
          age: model.age || 'unknown',
          voiceId: model.voiceId,
          stylePrefix: model.stylePrefix || '',
          artistPersona: model.artistPersona || '',
          images: model.images || []
        }
      }
    }
    return this.spec
      ? {
          description: this.spec.characterDescription || '',
          images: []
        }
      : undefined
  }

  public async resolveCharacterImages(): Promise<string[]> {
    const metadata = await this.resolveCharacterMetadata()
    return metadata?.images || []
  }

  // ─── Speed & timing ───────────────────────────────────────────────────────

  getWordsPerSecond(options: VideoGenerationOptions): number {
    if (options.wordsPerMinute) {
      return options.wordsPerMinute / 60
    }

    const spec = this.getEffectiveSpec(options)
    const provider = this.resolveProvider(options)
    const lang = (options.language || 'en-US').toLowerCase()

    const { wordsPerSecondBase, wordsPerSecondFactors = {} } = spec || {}

    if (wordsPerSecondFactors[provider] !== undefined && wordsPerSecondBase !== undefined) {
      return wordsPerSecondBase * wordsPerSecondFactors[provider]
    }

    const langKey = lang.split('-')[0]
    if (wordsPerSecondFactors[langKey] !== undefined && wordsPerSecondBase !== undefined) {
      return wordsPerSecondBase * wordsPerSecondFactors[langKey]
    }

    if (PROVIDER_WPS[provider] !== undefined) {
      return PROVIDER_WPS[provider]
    }

    if (wordsPerSecondBase !== undefined) {
      return wordsPerSecondBase
    }

    return DEFAULT_WPS
  }

  public getEffectiveSpec(options: VideoGenerationOptions): VideoTypeSpecification {
    if (options?.customSpec) return options.customSpec
    if (this.spec) return this.spec
    throw new Error('[PromptManager] No specification provided and no customSpec found.')
  }

  public getEffectiveDuration(options: VideoGenerationOptions): number {
    return options.duration ?? options.maxDuration ?? options.minDuration ?? 60
  }

  // ─── Per-preset word count helpers ────────────────────────────────────────

  private computePresetTargets(avgWordsPerScene: number): {
    hook: number
    reveal: number
    mirror: number
  } {
    return {
      hook: Math.max(PRESET_MIN_WORDS.hook, Math.round(avgWordsPerScene * 0.7)),
      reveal: Math.max(PRESET_MIN_WORDS.reveal, Math.round(avgWordsPerScene * 1.3)),
      mirror: Math.max(PRESET_MIN_WORDS.mirror, Math.round(avgWordsPerScene))
    }
  }

  // ─── [C] Scaffold instruction builder ─────────────────────────────────────

  /**
   * Build the narrative scaffold instructions for a given preset.
   * Each slot MUST be filled — this prevents the LLM from satisfying
   * the constraint with sparse text.
   */
  private buildScaffoldInstruction(preset: keyof typeof PRESET_SCAFFOLD, wordTarget: number): string {
    const scaffold = PRESET_SCAFFOLD[preset]
    const minSentences = PRESET_MIN_SENTENCES[preset as Preset]
    const minWords = PRESET_MIN_WORDS[preset as Preset]

    const slotList = scaffold.slots.map((slot, i) => `      ${i + 1}. ${slot}`).join('\n')

    return `**${preset.toUpperCase()} preset** — ${scaffold.description}
    Target: ~${wordTarget} words | Minimum: ${minWords} words / ${minSentences} sentences

    MANDATORY NARRATIVE SLOTS — every slot MUST be filled with at least 1-2 complete sentences.
    An empty or one-word slot makes this scene INVALID:
${slotList}

    ⚠️  DO NOT skip any slot. ⚠️  DO NOT merge two slots into one short sentence.
    Each slot is a distinct narrative beat. Write them all, in order.`
  }

  // ─── [D] Duration-based retry feedback ────────────────────────────────────

  /**
   * Build a targeted, surgical feedback message for VideoScriptGenerator retries.
   *
   * [D] KEY CHANGE: Deficit is now expressed in seconds of spoken audio, not raw word count.
   * LLMs have intuitive understanding of what "28 seconds of narration" feels like —
   * far more visceral than "67 words".
   */
  public buildRetryFeedback(
    validationError: string,
    attempt: number,
    scenes: Array<{ preset?: string; narration?: string; wordCount?: number; sceneNumber?: number }> | undefined,
    targetWords: number,
    actualWords: number,
    options?: VideoGenerationOptions
  ): string {
    const deficit = targetWords - actualWords
    const pct = Math.round((actualWords / targetWords) * 100)

    // [D] Duration conversion — use the provider WPS for human-readable feedback
    const wps = options ? this.getWordsPerSecond(options) : DEFAULT_WPS
    const targetDuration = Math.round(targetWords / wps)
    const actualDuration = Math.round(actualWords / wps)
    const missingSeconds = Math.max(0, targetDuration - actualDuration)

    // ── Identify failing scene numbers from the error string ────────────────
    const failingSceneNumbers: number[] = []
    const sceneMatches = validationError.matchAll(/Scene\s+(\d+)/gi)
    for (const match of sceneMatches) {
      const n = parseInt(match[1], 10)
      if (!failingSceneNumbers.includes(n)) failingSceneNumbers.push(n)
    }

    // ── Build per-scene diagnosis with scaffold slot hints ───────────────────
    const sceneDiagnoses: string[] = []

    if (failingSceneNumbers.length > 0 && scenes) {
      for (const sceneNum of failingSceneNumbers) {
        const scene = scenes.find((s) => (s.sceneNumber ?? 0) === sceneNum) ?? scenes[sceneNum - 1]
        const preset = (scene?.preset ?? 'mirror') as Preset
        const currentWords = scene?.wordCount ?? scene?.narration?.trim().split(/\s+/).filter(Boolean).length ?? 0
        const currentDuration = Math.round(currentWords / wps)
        const minWords = PRESET_MIN_WORDS[preset]
        const minSentences = PRESET_MIN_SENTENCES[preset]
        const targetSceneDuration = Math.round(minWords / wps)

        // Surface which scaffold slots are likely missing
        const scaffold = PRESET_SCAFFOLD[preset]
        const missingSlotsHint = scaffold
          ? `\n      Missing slots likely: ${scaffold.slots
              .slice(Math.max(0, scaffold.slots.length - 2))
              .map((s) => s.split('—')[0].trim())
              .join(', ')}`
          : ''

        sceneDiagnoses.push(
          `  • Scene ${sceneNum} (preset: ${preset}):` +
            `\n      Current: ~${currentWords} words (~${currentDuration}s spoken)` +
            `\n      Required: ≥${minWords} words (~${targetSceneDuration}s) / ≥${minSentences} sentences` +
            `\n      Deficit: ~${Math.max(0, targetSceneDuration - currentDuration)} seconds of missing narration${
              missingSlotsHint
            }`
        )
      }
    } else if (validationError) {
      sceneDiagnoses.push(`  Raw validation error: ${validationError}`)
    }

    const overallShort = actualWords < targetWords * 0.9
    const expansionTarget = overallShort ? '"reveal" scenes (they carry most of the word budget)' : 'failing scenes'

    return `
╔══════════════════════════════════════════════════════════════════════╗
║  🚨 ATTEMPT ${attempt} FAILED — MANDATORY CORRECTIONS BEFORE REGENERATING  ║
╚══════════════════════════════════════════════════════════════════════╝

SPOKEN DURATION: Your script runs ~${actualDuration}s. It must run ~${targetDuration}s.
${
  missingSeconds > 0
    ? `❌ You are missing ~${missingSeconds} seconds of spoken narration (≈${deficit} words).`
    : `✅ Total duration is acceptable, but structural rules were violated (see below).`
}

FAILING SCENES:
${sceneDiagnoses.join('\n\n')}

MANDATORY RULES FOR THIS RETRY:
1. Expand ${expansionTarget} significantly — fill ALL their scaffold slots completely.
2. Every "reveal" MUST contain: [OBSERVATION] + [EXPLANATION] + [CONCRETE_EXAMPLE] + [CONSEQUENCE] + [TRANSITION].
3. Every "mirror" MUST contain: [EMOTIONAL_RECOGNITION] + [VALIDATION] + [OPENING].
4. Every "hook" MUST contain: [HOOK_QUESTION_OR_SHOCK] + [TENSION_BUILD] + [IMPLICIT_PROMISE].
5. Each slot = minimum 1-2 full sentences. A one-word slot is invalid.
6. "..." counts as punctuation, NOT as a word. Do NOT pad with dots.
7. DO NOT reproduce the same short narrations. Genuinely rewrite and expand each slot.
8. After writing each scene, estimate its spoken duration (~${wps.toFixed(1)} words/second) — it must match the target.

EXPANSION TECHNIQUES FOR MISSING SECONDS:
  - [CONCRETE_EXAMPLE]: "Imagine the feeling of…", "Picture a room where…", "Think of the last time…"
  - [CONSEQUENCE]: "This matters because…", "The cost of ignoring this is…", "What unlocks when you do this is…"
  - [TENSION_BUILD]: "But here's what nobody tells you…", "And this is where most people stop…"
  - [EMOTIONAL_RECOGNITION]: "You've felt this before…", "That quiet voice that says…", "Most people never name this feeling, but…"

Regenerate the COMPLETE script with ALL scenes. Do not truncate.
`.trim()
  }

  // ─── Script prompt builders ───────────────────────────────────────────────

  async buildScriptSystemPrompt(options: VideoGenerationOptions = {} as any): Promise<string> {
    const spec = this.getEffectiveSpec(options)
    const characterMetadata = await this.resolveCharacterMetadata()
    const instructions = [...(spec.instructions || [])]

    // 1. Narration Speed
    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      instructions.push(`NARRATION SPEED: ${wps.toFixed(2)} words/second`)
    }

    // 2. Visual Storytelling & Camera Dynamics
    instructions.push(
      `Visual storytelling:
      Each image must clearly communicate the core idea without any text or narration. The character must actively interact with the concept in a visual and meaningful way. The main concept should be the most dominant visual element in the scene.

      Pacing and rhythm:
      Define a consistent visual flow with smooth and intentional transitions between scenes.

      Artistic identity:
      Maintain a consistent visual style across all scenes, including line quality, texture, and overall rendering approach.

      Pattern interrupt:
      Introduce occasional strong visual moments designed to capture attention and break visual monotony.

      Narration style:
      Use clear, simple, and direct language. Keep explanations easy to understand, focusing on clarity over complexity.
      — Sentences MUST be pleasant to read aloud: well-rhythmed, clear, and breathable. Write for the ear, not the eye.
      — The script MUST NOT resemble an article, an essay, a sermon, or an academic text. It is a spoken video voiceover.
      — Absolutely avoid robotic phrasing, unnecessary repetition, flat or filler sentences, vague generalities, and AI-sounding formulations.
      — Every phrase must feel human-crafted: as if a compelling speaker is talking directly to a person, not reading a summary.
      — The content MUST be understandable by someone who knows nothing about the subject. No jargon without immediate explanation. Make complex ideas feel obvious and accessible.
      — The script must make the viewer WANT to listen until the very end. Write with vivid, sensory, cinematic language. Make it lively, visual, deeply human. Every sentence should earn its place.

      Visual continuity:
      Ensure scenes follow a logical progression. Keep environments and actions consistent unless a change is clearly motivated.

      Camera Dynamics & Transitions:
      Each scene MUST use a dynamic camera action chosen to match the emotional and narrative context of the scene. The camera motion MUST ACCELERATE towards the end of the scene to create a natural, high-energy cut to the next scene without the need for traditional transitions.

      Available cameraAction values and their intended use:
      — breathing          → Calm / contemplative scenes. Subtle in-out pulse, meditative rhythm.
      — zoom-in            → Slow zoom for calm, contemplative, or intimate moments.
      — zoom-out           → Slow pullback for tension rising or context reveal.
      — pan-right          → Directional storytelling: narrative progression, moving forward in time.
      — pan-left           → Directional storytelling: flashback, going back in time, reversal.
      — ken-burns-static   → Static Ken Burns effect for calm, scenic, or reflective moments.
      — zoom-in-pan-right  → Tension rising combined with forward motion, escalating stakes.
      — dutch-tilt         → Unease, instability, psychological tension. Tilted frame.
      — snap-zoom          → Revelation or shock moment. Use snapAtSec (seconds into scene) and peakZoom (e.g. 1.6).
      — shake              → Action, beat sync, high intensity, physical impact.
      — zoom-in-pan-down   → Action or beat sync with downward energy, weighted impact.

      CONTEXTUAL SELECTION GUIDE:
      • Calm / contemplative scene   → breathing, zoom-in (slow), pan-right/left, ken-burns-static
      • Tension rising               → zoom-in-pan-right, dutch-tilt, zoom-out (slow)
      • Revelation / shock           → snap-zoom (set snapAtSec:0, peakZoom:1.6)
      • Action / beat sync           → snap-zoom, shake, zoom-in-pan-down
      • Narrative progression        → pan-right (forward in story)
      • Flashback / reversal         → pan-left (going back)

      PACING ARC (Density Strategy):
      Distribute the narrative density across the video:
      1. THE HOOK (0-15%): Fast/Medium pacing. High impact, concise, often 2-5 sentences (25-50 words).
      2. THE BUILD (15-70%): Variable pacing. Alternate between fast explanations and slow "mirrors". 
      3. THE REVEAL/CONCLUSION (70-100%): Slow/Medium pacing. Allow the message to "breathe". Use longer pauses (...) and explicit "breathingPoints" to let key points sink in before the call to action.`
    )

    // 3. Timing & Word Count Enforcement
    const totalDuration = this.getEffectiveDuration(options)
    const expectedScenes = computeSceneCount(totalDuration)
    const wps = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const provider = this.resolveProvider(options)

    const targetWordCountTotal = Math.round(totalDuration * wps * safetyFactor)
    const avgWordsPerScene = Math.round(targetWordCountTotal / expectedScenes)
    const presetTargets = this.computePresetTargets(avgWordsPerScene)

    const secondsPerScene = Math.round(totalDuration / expectedScenes)

    // [C] Build scaffold instructions for each preset
    const hookScaffold = this.buildScaffoldInstruction('hook', presetTargets.hook)
    const revealScaffold = this.buildScaffoldInstruction('reveal', presetTargets.reveal)
    const mirrorScaffold = this.buildScaffoldInstruction('mirror', presetTargets.mirror)

    instructions.push(
      `## NARRATION PACING — NARRATIVE SCAFFOLD SYSTEM (provider: ${provider})

       ### Why Scaffolds Instead of Word Counts
       Word count targets alone are ineffective — they are abstract numbers the model can
       approximate poorly. Instead, each preset requires filling named narrative SLOTS.
       Each slot is a distinct content beat that MUST be present as 1-2 full sentences.
       A scene where any slot is empty or merged into a single short sentence is INVALID.

       ### Global Spoken Duration Target
       - Video duration: ${totalDuration}s
       - TTS speed: ${wps.toFixed(2)} words/second
       - 🎯 TOTAL TARGET: **~${totalDuration} seconds of spoken audio** (~${targetWordCountTotal} words)
       - Average per scene: **~${secondsPerScene}s** (~${avgWordsPerScene} words)

       ### Per-Preset Scaffold Requirements

       ${hookScaffold}

       ${revealScaffold}

       ${mirrorScaffold}

       ### PACING & BREATHING
       - **"pacing": "fast" | "medium" | "slow"**: Choose per scene.
       - **"breathingPoints": ["string"]**: List where to pause (e.g., "after slot 2").
       - Use "..." in narration text for natural short pauses.

       ### Self-Validation (MANDATORY — 3 steps before submitting)
       STEP 1 — Per-scene slot check: For each scene, verify every scaffold slot is filled
                 with at least 1-2 full sentences. Missing slot = rewrite that scene now.
       STEP 2 — Per-scene duration estimate: Count your words, divide by ${wps.toFixed(1)}.
                 Each reveal scene should run ~${Math.round(presetTargets.reveal / wps)}s.
                 Each mirror scene should run ~${Math.round(presetTargets.mirror / wps)}s.
                 Each hook scene should run ~${Math.round(presetTargets.hook / wps)}s.
       STEP 3 — Total duration check: Sum all scenes. Total MUST be ~${totalDuration}s (±10%).
                 If total is short, expand "reveal" slot [CONCRETE_EXAMPLE] and [CONSEQUENCE] first.`
    )

    // 4. Absolute minimum overrides — belt AND suspenders
    instructions.push(
      `ABSOLUTE MINIMUM NARRATION FLOORS (override any preset or pacing default):
      These floors are NON-NEGOTIABLE and apply regardless of "pacing" or any spec rule:
      - "hook" preset:   minimum ${PRESET_MIN_SENTENCES.hook} sentences, minimum ${PRESET_MIN_WORDS.hook} words (~${Math.round(PRESET_MIN_WORDS.hook / wps)}s)
      - "reveal" preset: minimum ${PRESET_MIN_SENTENCES.reveal} sentences, minimum ${PRESET_MIN_WORDS.reveal} words (~${Math.round(PRESET_MIN_WORDS.reveal / wps)}s)
      - "mirror" preset: minimum ${PRESET_MIN_SENTENCES.mirror} sentences, minimum ${PRESET_MIN_WORDS.mirror} words (~${Math.round(PRESET_MIN_WORDS.mirror / wps)}s)

      After writing each scene narration:
      1. COUNT its words
      2. ESTIMATE its spoken duration (words ÷ ${wps.toFixed(1)})
      3. If below the floor, FILL the missing scaffold slots — do not proceed to the next scene.`
    )

    instructions.push(
      `PAUSE MARKERS (Kokoro TTS):
      Use "..." to insert a short natural pause in the narration.
      Use these strategically:
      - After a key statement to let it sink in
      - Before a reveal or important point
      - Between two contrasting ideas
      Example: "This changes everything... but not in the way you'd expect."`
    )

    const fullSpec = {
      ...spec,
      instructions,
      characterDescription: characterMetadata
        ? `${characterMetadata.description}. Personality: ${characterMetadata.artistPersona}.`
        : spec.characterDescription
    }

    const consolidatedOutputFormat = this.getConsolidatedOutputFormat(
      spec.outputFormat,
      presetTargets,
      targetWordCountTotal,
      avgWordsPerScene,
      wps,
      totalDuration
    )

    // 5. Inject Goals, Rules, Context from Spec
    const goals = spec.goals?.length ? `## GOALS\n${spec.goals.map((g) => `- ${g}`).join('\n')}` : ''
    const rules = spec.rules?.length ? `## RULES\n${spec.rules.map((r) => `- ${r}`).join('\n')}` : ''
    const context = spec.context ? `## CONTEXT\n${spec.context}` : ''

    const scriptInstruction = [
      context,
      goals,
      rules,
      '---',
      this.buildSystemInstructions({
        ...fullSpec,
        outputFormat: consolidatedOutputFormat
      })
    ]
      .filter(Boolean)
      .join('\n\n')

    return scriptInstruction
  }

  /**
   * Refines the output format to include spoken duration self-validation,
   * scaffold slot reminders, and per-preset sentence floors.
   *
   * [C+B+D] Combined approach:
   *   - Scaffold slot reminder in narration field description
   *   - Sentence count floor in wordCount field description
   *   - Duration estimate in self-check comment
   */
  private getConsolidatedOutputFormat(
    baseFormat?: string,
    presetTargets?: { hook: number; reveal: number; mirror: number },
    targetWordCountTotal?: number,
    avgWordsPerScene?: number,
    wps?: number,
    totalDuration?: number
  ): string {
    if (!baseFormat || !baseFormat.includes('{')) return baseFormat || ''

    const hook = presetTargets?.hook ?? PRESET_MIN_WORDS.hook
    const reveal = presetTargets?.reveal ?? PRESET_MIN_WORDS.reveal
    const mirror = presetTargets?.mirror ?? PRESET_MIN_WORDS.mirror
    const effectiveWps = wps ?? DEFAULT_WPS
    const effectiveDuration = totalDuration ?? 60

    const hookDuration = Math.round(hook / effectiveWps)
    const revealDuration = Math.round(reveal / effectiveWps)
    const mirrorDuration = Math.round(mirror / effectiveWps)

    return `{
      "topic": "string",
      "audience": "string",
      "emotionalArc": ["string"],
      "titles": ["string"],
      "fullNarration": "string (The complete unbroken script. Must produce ~${effectiveDuration}s of spoken audio.)",
      "totalWordCount": "number (self-reported total. Must be within ±10% of ${targetWordCountTotal} words / ~${effectiveDuration}s spoken)",
      "theme": "string",
      "backgroundMusic": "string",
      "scenes": [
        {
          "sceneNumber": 1,
          "id": "string",
          "preset": "hook | reveal | mirror",
          "pacing": "fast | medium | slow",
          "breathingPoints": ["string (e.g. 'after slot 2', 'after sentence 3')"],
          "narration": "string — SCAFFOLD REQUIRED. hook: fill [HOOK_QUESTION_OR_SHOCK]+[TENSION_BUILD]+[IMPLICIT_PROMISE] (~${hookDuration}s). reveal: fill [OBSERVATION]+[EXPLANATION]+[CONCRETE_EXAMPLE]+[CONSEQUENCE]+[TRANSITION] (~${revealDuration}s). mirror: fill [EMOTIONAL_RECOGNITION]+[VALIDATION]+[OPENING] (~${mirrorDuration}s). Each slot = 1-2 full sentences minimum. Use '...' for pauses.",
          "wordCount": "number — hook: min ${PRESET_MIN_WORDS.hook} words/${PRESET_MIN_SENTENCES.hook} sentences. reveal: min ${PRESET_MIN_WORDS.reveal} words/${PRESET_MIN_SENTENCES.reveal} sentences. mirror: min ${PRESET_MIN_WORDS.mirror} words/${PRESET_MIN_SENTENCES.mirror} sentences.",
          "estimatedDuration": "number (words ÷ ${effectiveWps.toFixed(1)} — spoken seconds for this scene)",
          "summary": "string",
          "cameraAction": "string (breathing | zoom-in | zoom-out | pan-right | pan-left | ken-burns-static | zoom-in-pan-right | dutch-tilt | snap-zoom | shake | zoom-in-pan-down)",
          "imagePrompt": "string (Detailed visual prompt)",
          "animationPrompt": "string"
        }
      ]
    }`
  }

  /**
   * Build only the user data part for script generation.
   */
  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)
    const effectiveDuration = this.getEffectiveDuration(options)
    const targetSceneCount = options.sceneCount ?? computeSceneCount(effectiveDuration)
    const wordsPerSecond = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWordCount = Math.round(effectiveDuration * wordsPerSecond * safetyFactor)

    return this.buildUserData({
      subject: topic,
      duration: `${effectiveDuration} seconds`,
      aspectRatio: options.aspectRatio || '16:9',
      audience: (options as any).audience || spec.audienceDefault,
      maxScenes: targetSceneCount,
      language: options.language,
      targetWordCount,
      targetDuration: effectiveDuration,
      wps: wordsPerSecond
    })
  }

  async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    return {
      systemPrompt: await this.buildScriptSystemPrompt(options),
      userPrompt: this.buildScriptUserPrompt(topic, options)
    }
  }

  // ─── Image prompt builders ────────────────────────────────────────────────

  async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    const spec = this.spec
    if (!spec) return ''

    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription = characterMetadata?.description || spec.characterDescription
    const stylePrefix = characterMetadata?.stylePrefix || ''
    const artistPersona = characterMetadata?.artistPersona || ''

    const effectiveHasRef = hasReferenceImages || (characterMetadata?.images && characterMetadata.images.length > 0)

    const referenceMode = effectiveHasRef
      ? `Style consistency: Match the artistic style of the reference images for character design, clothing, and line quality.${stylePrefix}. The image is strictly black and white, rendered in grayscale with detailed pencil shading and texture. The scene includes a full, realistic, and dense environment with multiple clearly defined objects, independent from the reference background.`
      : stylePrefix

    const personaContext = artistPersona ? `Acting as a ${artistPersona}, create: ` : ''

    const characterContext = characterDescription
      ? `A symbolic visual representing the scene's core idea is shown, centered around a main character described as: ${characterDescription}. This character is interacting with the environment.`
      : "A symbolic visual perfectly representing the scene's core idea is shown, interacting with the environment."

    const styleAnchor = `${personaContext} Style: Highly detailed black and white pencil drawing with rich grayscale shading and subtle cross-hatching, creating depth across all surfaces. ${characterContext} The scene takes place in a realistic interior with at least five clearly identifiable objects such as a table, a chair, a lamp, a shelf, and a window, naturally arranged. The camera frames the action clearly while showing the environment. Walls and floor are visible with natural perspective lines to ground the space. All elements are rendered at realistic human scale. The composition is clean, balanced, and fully detailed with no empty or undefined space.`

    const imageSpec: VideoTypeSpecification = {
      ...spec,
      instructions: [referenceMode, styleAnchor, ...(spec.instructions || [])].filter(Boolean)
    }

    return this.buildSystemInstructions(imageSpec)
  }

  async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    memory?: SceneMemory,
    hasLocationReference: boolean = false
  ): Promise<ImagePrompt> {
    const characterMetadata = await this.resolveCharacterMetadata()
    const characterDescription = characterMetadata?.description || this.spec?.characterDescription || ''

    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

    if (characterDescription && !paragraph.toLowerCase().includes(characterDescription.toLowerCase().slice(0, 10))) {
      paragraph = `MAIN CHARACTER: ${characterDescription}. ACTION: ${paragraph}`
    }

    if (scene.locationId) {
      const memorized = memory?.locations.get(scene.locationId)
      if (memorized && !paragraph.toLowerCase().includes(memorized.prompt.toLowerCase().slice(0, 20))) {
        paragraph += `, in ${memorized.prompt}.`
      }
    }

    let finalPrompt = paragraph
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .trim()
      .replace(/([^.!?])$/, '$1.')

    if (hasReferenceImages) {
      finalPrompt +=
        ' Style consistency: Match the flat illustration style, line art, and rendering technique of the reference images. The entire scene, including the background, must be drawn in the same style and not appear photorealistic.'

      if (hasLocationReference) {
        finalPrompt +=
          ' ENVIRONMENTAL CONTINUITY: The scene takes place in the EXACT SAME LOCATION as shown in the reference image labeled LOCATION. Maintain all architectural details, furniture positions, and environmental landmarks. Keep the layout identical, only changing the character and their specific action.'
      }
    }

    return {
      sceneId: scene.id,
      prompt: finalPrompt
    }
  }

  buildAnimationPrompt(scene: EnrichedScene, imageStyle?: { characterDescription?: string }): AnimationPrompt {
    const instructions = scene.animationPrompt || ''
    const movements: AnimationPrompt['movements'] = [
      {
        element: 'body',
        description: instructions
      }
    ]

    return { sceneId: scene.id, instructions, movements }
  }

  // ─── Private Builders ──────────────────────────────────────────────────────

  private buildSystemInstructions(spec: VideoTypeSpecification): string {
    const sections: string[] = []

    if (spec.role) sections.push(`## ROLE\n${spec.role}`)
    if (spec.context) sections.push(`## CONTEXT\n${spec.context}`)
    if (spec.task) sections.push(`## TASK\n${spec.task}`)
    if (spec.goals?.length) sections.push(`## GOALS\n${spec.goals.map((g) => `- ${g}`).join('\n')}`)
    if (spec.structure) sections.push(`## STRUCTURE\n${spec.structure}`)
    if (spec.rules?.length) sections.push(`## RULES\n${spec.rules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.formatting) sections.push(`## FORMATTING\n${spec.formatting}`)
    if (spec.scenePresets) sections.push(`## SCENE PRESETS\n${JSON.stringify(spec.scenePresets, null, 2)}`)
    if (spec.visualRules?.length) sections.push(`## VISUAL RULES\n${spec.visualRules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.orchestration?.length)
      sections.push(`## ORCHESTRATION\n${spec.orchestration.map((o) => `- ${o}`).join('\n')}`)
    if (spec.characterDescription) sections.push(`## MAIN CHARACTER\n${spec.characterDescription}`)
    if (spec.outputFormat) sections.push(`## OUTPUT FORMAT\n${spec.outputFormat}`)
    if (spec.instructions?.length)
      sections.push(`## INSTRUCTIONS\n${spec.instructions.map((i) => `- ${i}`).join('\n')}`)

    return sections.filter((s) => s.trim().length > 0).join('\n\n---\n\n')
  }

  private buildUserData(
    options: PromptMakerOptions & { targetWordCount?: number; targetDuration?: number; wps?: number }
  ): string {
    const { targetWordCount, targetDuration, wps } = options
    const effectiveWps = wps ?? DEFAULT_WPS

    const durationBlock =
      targetWordCount && targetDuration
        ? [
            ``,
            `🎯 SPOKEN DURATION TARGET: **~${targetDuration} seconds** of narration audio`,
            `   (~${targetWordCount} words at ${effectiveWps.toFixed(1)} words/second)`,
            ``,
            `⚠️  This target is non-negotiable — it matches the requested video duration.`,
            `   Strategy to hit it:`,
            `   1. Every "reveal" scene MUST fill all 5 scaffold slots fully.`,
            `   2. After each scene, estimate its duration (words ÷ ${effectiveWps.toFixed(1)}).`,
            `   3. Check running total before moving to the next scene.`,
            ``
          ].join('\n')
        : ''

    const lines = [
      `Subject: ${options.subject}`,
      `Required Duration: ${options.duration}`,
      `Required Scene Count: ${options.maxScenes}`,
      durationBlock,
      `Aspect Ratio: ${options.aspectRatio}`,
      `Audience: ${options.audience}`,
      `Target Language: ${options.language || 'English'} — Generate ALL text content in this language WITHOUT EXCEPTION.`
    ]

    return lines.filter(Boolean).join('\n')
  }
}
