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
 *   - [B] Sentence-count floors as secondary validator (easier to check programmatically)
 *   - [D] Duration-based retry feedback ("missing ~28s of narration" vs "missing 67 words")
 *
 * FIX v5: Narration validation & auto-correction pipeline.
 *   - validateAndCorrectNarration(): JS-based correction (0 token)
 *   - buildMicroCorrectionPrompt(): LLM micro-correction prompt builder
 *   - correctNarrationWithLLM(): targeted LLM fix for semantic violations
 *   - validateAndCorrectAllScenes(): full pipeline orchestrator
 *
 * FIX v6: OpenAI/GPT-4o specific fixes.
 *   - Safety factor raised to 1.15 for openai/gpt-4o
 *   - Mirror preset minimum raised to 50 words
 *   - NARRATIVE INCONSISTENCY fix: explicit instruction to build fullNarration
 *     by concatenating scene narrations verbatim
 *   - Provider-specific retry hint injected in buildRetryFeedback() for OpenAI
 *
 * FIX v7: Voice-first narration — eliminated "form-filling" mode.
 *   - Scaffold slot names REMOVED from generation prompt (moved to correction only)
 *   - Self-validation steps REMOVED from generation prompt (JS pipeline handles this)
 *   - VALID/INVALID examples REMOVED from generation prompt (moved to correction prompt)
 *   - buildScaffoldInstruction() now gives narrative INTENT, not named slots
 *   - PRIME DIRECTIVE added: voice model from real reference script
 *   - Output format narration field: voice description, not slot list
 *   - Result: LLM writes as a narrator, not a form-filler
 *
 * FIX v8: Implicit roadmap — natural scene-to-scene bridge on hook.
 *   - Hook voice guide now includes IMPLICIT ROADMAP instruction
 *   - ONE earned sentence after the emotional punch names the subject naturally
 *   - CHAPTER_BRIDGE on hook preset reinforced as the roadmap carrier
 *   - bridgeNote injected per-preset in buildScaffoldInstruction return value
 *
 * FIX v8-clean: Interdictions assouplies.
 *   - Promesse/setup ("Dans cette vidéo...") : autorisée si elle arrive après le punch émotionnel
 *   - Implicit roadmap : supprimée comme contrainte stricte — le LLM choisit librement
 *     comment nommer le sujet, y compris avec une promesse directe
 *   - WHAT IT MUST NEVER SOUND LIKE : retiré du hook voice guide
 *   - Le hook reste percutant et émotionnel, mais sans règles de formulation imposées
 *
 * FIX v9: Two-pass architecture — eliminates GPT-4o under-generation at root.
 *   - Pass 1: narration-only prompt (no JSON, no structure, single obsession: word count)
 *   - Pass 2: structuring prompt (narration is locked, GPT-4o only splits + adds metadata)
 *   - validateNarrationPass(): JS word count gate between passes
 *   - buildNarrationRetryUserPrompt(): deficit-aware retry with previous text preserved
 *   - buildPass2Prompts(): structuring system + user prompts
 *   - fullNarration drift auto-fixed in JS post pass 2
 *   - Legacy single-pass methods preserved for backward compatibility
 */

import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { computeSceneCountRange } from '../types/video-script.types'
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
const PROVIDER_WPS: Record<string, number> = {
  kokoro: 2.45,
  openai: 2.37,
  gpt4o: 2.37,
  'gpt-4o': 2.37,
  elevenlabs: 2.1,
  azure: 2.2,
  google: 2.15
}

const PROVIDER_SAFETY_FACTOR: Record<string, number> = {
  kokoro: 1.05,
  openai: 1.15,
  gpt4o: 1.15,
  'gpt-4o': 1.15,
  elevenlabs: 1.15,
  azure: 1.15,
  google: 1.15
}
const DEFAULT_WPS = 2.37
const DEFAULT_SAFETY_FACTOR = 1.05

const PACING_FACTORS = {
  fast: 1.2,
  medium: 1,
  slow: 0.8
}

// ─── Per-preset absolute minimum word counts ─────────────────────────────────
export const PRESET_MIN_WORDS = {
  hook: 25,
  reveal: 45,
  mirror: 40,
  conclusion: 40,
  bridge: 35
} as const

// Minimum sentence counts per preset — used in validation and retry feedback only
const PRESET_MIN_SENTENCES = {
  hook: 3,
  reveal: 4,
  mirror: 3,
  conclusion: 3,
  bridge: 3
} as const

// ─── Scaffold slot definitions — used ONLY in correction/retry prompts ────────
const PRESET_SCAFFOLD: Record<string, { slots: string[]; description: string }> = {
  hook: {
    description: 'Percutant & High Impact opener',
    slots: [
      '[HOOK_QUESTION_OR_SHOCK] — A provocative question, surprising fact, or visceral statement that stops the viewer cold.',
      '[TENSION_BUILD] — Amplify the tension or curiosity. Why should the viewer keep watching?',
      '[PROMISE_OR_PIVOT] — Either a direct promise of what\'s coming ("In this video...") or an open question / "but..." pivot. Both are valid.',
      '[CHAPTER_BRIDGE] — A closing sentence that seals this scene AND pulls the viewer into the next one.'
    ]
  },
  reveal: {
    description: 'Detailed Explanation — the intellectual and emotional core of the video',
    slots: [
      '[OBSERVATION] — Describe what is happening / what the viewer already recognizes from their own life.',
      '[EXPLANATION] — Explain WHY it works this way.',
      '[CONCRETE_EXAMPLE] — A specific, sensory, real-world example. HUMOR REQUIRED: 1 absurd or hyper-specific comparison.',
      '[CONSEQUENCE] — What does this mean for the viewer?',
      '[TRANSITION] — A bridging sentence toward the next scene.',
      '[CHAPTER_BRIDGE] — A closing sentence that seals this scene AND pulls the viewer into the next one.'
    ]
  },
  mirror: {
    description: 'Emotional Recognition — the viewer sees themselves in the message',
    slots: [
      '[EMOTIONAL_RECOGNITION] — Describe a situation where the viewer feels stuck, undervalued, or frustrated',
      '[VALIDATION] — Validate the feeling BUT hint that their current strategy is flawed',
      '[OPENING] — Gently open a door: a reframe or possibility.',
      '[CHAPTER_BRIDGE] — A closing sentence that seals this scene AND pulls the viewer into the next one.'
    ]
  },
  conclusion: {
    description: "Final Resolution — the definitive closing that sticks in the viewer's mind",
    slots: [
      '[TRUE_OBJECTIVE_REFRAME] — Reframe the real goal of the topic. What were we REALLY talking about?',
      '[FUTURE_PROJECTION] — Project the viewer into their future life (positive or negative) based on this advice.',
      '[STRATEGIC_ADVANTAGE] — End with a sense of control, strength, or strategic advantage.',
      '[MIC_DROP_METAPHOR] — The very last sentence. Use a final metaphor or identity shift. No question. No "...". A firm, short, powerful statement.'
    ]
  },
  bridge: {
    description: 'The Pivot — high-tension transition before the conclusion',
    slots: [
      "[IDENTITY_CHALLENGE] — Challenge the viewer's current identity or behavior directly.",
      '[CONTRAST_PEAK] — Show the two possible futures: one with the change, one without.',
      '[ROAD_OPENING] — Signal that we are reaching the end of the exploration and the beginning of the action.'
    ]
  }
}

export const BASE_SPEC = {
  wordsPerSecondBase: 2.45,

  visualRules: [
    'The concept must be visually dominant without breaking realistic scale',
    'Environments must be realistic and include multiple objects',
    'No empty or undefined space — use shading and perspective to create depth',
    'Maintain consistent black and white pencil rendering with grayscale textures',
    'Vary framing naturally between close, medium, and wide compositions',
    'Actions must be simple, clear, and visually readable',
    'Each script must implicitly or explicitly include these 3 roles'
  ],

  narrativeRules: [
    'Every story must follow a tension curve: setup → illusion → twist → escalation → consequence → resolution',
    'At least one major cognitive reversal must occur ("what seems good is actually bad")',
    'Each scene must either increase tension, reveal hidden truth, or reframe the situation',
    "Avoid flat progression — each scene must change the viewer's understanding"
  ],

  styleRules: [
    'Every 3–5 sentences must include a short, impactful punchline',
    'Punchlines must be concise, memorable, and slightly provocative',
    'Avoid generic phrasing — prefer sharp, visual, or contrarian statements'
  ],

  engagementRules: [
    'Use open loops: introduce a question or tension that is resolved later',
    'Frequently create expectation → then subvert it',
    `Use "but", "except", "what you don't see" transitions to maintain curiosity`
  ],

  curiosityRules: [
    'Introduce unanswered questions early and delay resolution',
    'Hint at a consequence before fully explaining it',
    'Use partial information to create anticipation'
  ],

  escalationRules: [
    'Each major block must increase stakes (time, money, identity, future)',
    'Avoid repeating the same level of consequence',
    'Progress from small problem → systemic trap → irreversible cost'
  ],

  identityTriggers: [
    'Label behaviors in a way that creates identity tension',
    'Use phrases like: "people like you", "those who…", "most people…" ',
    'Force the viewer to implicitly choose a side'
  ],

  contrastRules: [
    'Frame ideas using contrast (e.g., worker vs strategist, effort vs leverage)',
    'Present two types of people or behaviors to simplify complex ideas',
    'Use contrast to create identity tension in the viewer'
  ],

  truthRules: [
    'Include at least one uncomfortable or counterintuitive truth',
    'Prioritize systemic explanations over moral judgment',
    'Expose hidden incentives (manager, company, market dynamics)'
  ],

  emotionCurve: [
    'Start with curiosity',
    'Build identification',
    'Introduce doubt',
    'Create discomfort or fear',
    'End with empowerment or control'
  ],

  narrativeRoles: [
    'The Worker (execution, effort)',
    'The System (invisible rules)',
    'The Strategist (alternative behavior)'
  ],

  patternInterrupts: [
    'Break rhythm every 20–40 seconds with a short, unexpected sentence',
    'Use contrast in sentence length (long → very short)',
    'Insert sudden reframe phrases: "No.", "Wrong.", "In reality."',
    'Occasionally switch tone: analytical → emotional → blunt'
  ],

  antiBoringRules: [
    'Remove any sentence that does not add tension, insight, or emotion',
    'Avoid generic advice unless reframed in a contrarian way',
    'Prefer specific, visual, or extreme phrasing over neutral language'
  ],

  postProcessing: [
    'Check that each scene contains a clear narrative function (tension, reveal, or shift)',
    'Insert punchlines where energy drops',
    'Ensure at least one major twist exists in the script',
    'Remove any flat or redundant explanation'
  ],

  internalCheck: ['Is there a clear twist?', 'Are there enough punchlines?', 'Does each part increase tension?'],

  expansionRules: [
    'If the input topic has fewer points than the target scene count, SPLIT each point into multiple sequential scenes (e.g., "Point 1: Setup", "Point 1: Expansion", "Point 1: Connection").',
    'DO NOT limit yourself to the number of paragraphs in the input. If the target is 20 scenes, produce exactly 20 scenes by diving deeper into the nuances of each point.',
    'ELABORATE: use the input sentences only as a SEED. Add sensory details, consequences, historical context, or specific metaphors to expand the narrative.',
    'CHAPTER BLOCKS: Group scenes into clusters that explore a single concept from multiple angles before moving to the next concept.'
  ],

  conclusionRules: [
    'Reframe the true objective of the topic',
    'Use a strong contrast to create memorability',
    'Project the viewer into the future (positive or negative)',
    'Include a metaphor or identity shift',
    'End with a sense of control or strategic advantage',
    'Avoid generic or soft endings'
  ],

  scenePresets: {
    hook: {
      description: 'Visually striking opening to grab attention instantly',
      rules: [
        'The scene must be immediately understandable in under 2 seconds',
        'Use a strong, unusual, or symbolic visual',
        'Action must be clear and immediate, not passive',
        'The core concept must be instantly visible',
        'Break a common belief immediately'
      ]
    },
    reveal: {
      description: 'Psychological explanation through visual action',
      rules: [
        'Show a concrete action that represents a deeper behavior',
        'Make the invisible concept visible through action',
        'Keep the scene grounded in realistic daily life',
        'Avoid abstract or overly symbolic visuals',
        'Explicitly represent the hidden system or invisible force'
      ]
    },
    mirror: {
      description: 'Relatable moment where the viewer recognizes themselves',
      rules: [
        'Use a highly relatable everyday situation',
        'Focus on a subtle but emotionally uncomfortable moment',
        'Keep the scene simple and realistic — no dramatization',
        'The viewer should feel personal recognition'
      ]
    },
    conclusion: {
      description: 'Definitive visual closing',
      rules: [
        'The main concept should be shown in its final, most complete state',
        'Use a wider context or a symbolic visual that represents resolution',
        'Action should be minimal and focused, like a final bow'
      ]
    },
    bridge: {
      description: 'High-tension visual pivot',
      rules: [
        'Use an extreme close-up or a Dutch tilt to create psychological tension',
        'The character should confront the viewer (breaking the 4th wall)',
        'Dramatic shadows or high contrast to emphasize the "choice"'
      ]
    }
  },

  orchestration: [
    'First generate full narration',
    'Then split into scenes',
    'Assign a preset type to each scene (hook, reveal, mirror, bridge, conclusion)',
    'The LAST scene must ALWAYS be a conclusion',
    'Use a "bridge" scene ideally just before the conclusion to build final tension',
    'Each scene must visually represent its narration clearly',
    'Maintain continuity across scenes (location, action)'
  ]
}

type Preset = keyof typeof PRESET_MIN_WORDS

// ─── Helper: detect OpenAI-family providers ───────────────────────────────────
function isOpenAIProvider(provider: string): boolean {
  return ['openai', 'gpt4o', 'gpt-4o'].includes(provider.toLowerCase())
}

// ─────────────────────────────────────────────────────────────────────────────

export class PromptManager {
  /** @deprecated Use getWordsPerSecond() which is provider-aware. */
  public static readonly REAL_TTS_WPS = 2.45
  /** @deprecated Use getSafetyFactor() which is provider-aware. */
  public static readonly SAFETY_FACTOR = 1.15

  private readonly spec?: VideoTypeSpecification
  private readonly characterModelId?: string
  private readonly characterRepository = new CharacterModelRepository()

  constructor(config: PromptManagerConfig = {}) {
    this.spec = config.scriptSpec
    this.characterModelId = config.characterModelId
  }

  // ─── Provider helpers ──────────────────────────────────────────────────────

  private resolveProvider(options: VideoGenerationOptions): string {
    return (options.audioProvider || 'elevenlabs').toLowerCase()
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
    const provider = this.resolveProvider(options)
    if (PROVIDER_WPS[provider] !== undefined) {
      return PROVIDER_WPS[provider]
    }
    return DEFAULT_WPS
  }

  public getEffectiveSpec(options: VideoGenerationOptions): VideoTypeSpecification {
    const rawSpec = options?.customSpec ?? this.spec
    if (!rawSpec) {
      throw new Error('[PromptManager] No specification provided and no customSpec found.')
    }
    return {
      ...BASE_SPEC,
      ...rawSpec,
      visualRules: [...(BASE_SPEC.visualRules || []), ...(rawSpec.visualRules || [])],
      orchestration: [...(BASE_SPEC.orchestration || []), ...(rawSpec.orchestration || [])],
      narrativeRules: [...(BASE_SPEC.narrativeRules || []), ...(rawSpec.narrativeRules || [])],
      curiosityRules: [...(BASE_SPEC.curiosityRules || []), ...(rawSpec.curiosityRules || [])],
      escalationRules: [...(BASE_SPEC.escalationRules || []), ...(rawSpec.escalationRules || [])],
      conclusionRules: [...(BASE_SPEC.conclusionRules || []), ...(rawSpec.conclusionRules || [])],
      identityTriggers: [...(BASE_SPEC.identityTriggers || []), ...(rawSpec.identityTriggers || [])],
      patternInterrupts: [...(BASE_SPEC.patternInterrupts || []), ...(rawSpec.patternInterrupts || [])],
      antiBoringRules: [...(BASE_SPEC.antiBoringRules || []), ...(rawSpec.antiBoringRules || [])],
      scenePresets: {
        ...(BASE_SPEC.scenePresets || {}),
        ...(rawSpec.scenePresets || {})
      }
    } as VideoTypeSpecification
  }

  public getEffectiveDuration(options: VideoGenerationOptions): number {
    return options.duration
  }

  // ─── Per-preset word count helpers ────────────────────────────────────────

  private computePresetTargets(avgWordsPerScene: number): {
    hook: number
    reveal: number
    mirror: number
    conclusion: number
    bridge: number
  } {
    return {
      hook: Math.max(PRESET_MIN_WORDS.hook, Math.round(avgWordsPerScene * 0.7)),
      reveal: Math.max(PRESET_MIN_WORDS.reveal, Math.round(avgWordsPerScene * 1.3)),
      mirror: Math.max(PRESET_MIN_WORDS.mirror, Math.round(avgWordsPerScene)),
      conclusion: Math.max(PRESET_MIN_WORDS.conclusion, Math.round(avgWordsPerScene * 1.1)),
      bridge: Math.max(PRESET_MIN_WORDS.bridge, Math.round(avgWordsPerScene * 0.8))
    }
  }

  // ─── [FIX v7 + v8 + v8-clean] Voice-first scaffold instruction builder ────

  private buildScaffoldInstruction(preset: keyof typeof PRESET_SCAFFOLD, wordTarget: number): string {
    const voiceGuide: Record<string, string> = {
      hook: `You're talking to someone who's already exhausted before they pressed play.
Don't explain. Don't introduce. Drop them into it.
Start with the thing they feel but haven't said out loud — then make it worse.
Make them feel seen, then unsettled, then unable to stop watching.
You're not opening a video. You're walking into the room they're already sitting in.

CLOSING THE HOOK:
After the emotional punch, add one sentence that moves the viewer forward.
This must feel like a natural pivot — it should NOT sound like a formula.
Avoid generic AI transitions like: "And that's exactly what we're going to talk about" or "...and this awareness is where we begin."
Instead, find a way to pivot that feels earned by the specific situation you just described.
The only rule: it must feel EARNED — arriving after the emotional punch, not before it.

End mid-thought. Leave something unresolved. The viewer must feel they can't stop.`,

      reveal: `You're the friend who finally names the thing nobody names.
Start with what they already recognize from their own life — something they've lived but never articulated.
Then show them the hidden wire underneath: why it works that way.
Give one image so specific and slightly absurd it makes them exhale-laugh mid-sentence.
Then land the cost — what has this been quietly stealing from them?
REFLECTIVE BREATH: If you end this scene with a question, leave a few words of space (3-5 words less than target) and end with '...' to let the idea sink in.
Close with a sentence that makes the next scene feel inevitable, like a door opening by itself.`,

      mirror: `Make them feel less alone without telling them to feel less alone.
Name a specific thing they do, feel, or say when nobody's watching.
Don't solve it. Don't fix it. Don't explain it.
Just hold it up to the light and say: "Yeah. I know. Me too."
REFLECTIVE BREATH: End with '...' after your final realization to give the viewer time to breathe and reflect.
Then quietly open one door — not a solution. A possibility.`,

      conclusion: `This is the end. You're not exploring anymore — you're landing the plane.
DON'T end on a question. DON'T end on an open loop.
Synthesize the entire message into one final, undeniable truth.
The tone should shift from "searching together" to "knowing for sure".
The last sentence MUST be a "Mic Drop": short (5-10 words), definitive, and ending with a firm period (.).
This is the sentence the viewer should remember 10 minutes after the video ends.`,

      bridge: `The Pivot. You're no longer exploring — you're confronting.
Challenge the viewer's current identity. Use a sharp contrast between "staying here" and "moving forward".
The tone should be intense, slightly unsettling, and high-stakes.
The bridge is the "darkest hour" or the "sudden light" that makes the conclusion inevitable.
Break the fourth wall narratively: talk to them like they're right in front of you, looking at their final choice.`
    }

    const rhythmNote = `
Rhythm & Flow (Preferred Style):
— Aim for short, punchy sentences (avg 10-15 words), but up to 25 words is fine if needed for detail.
— Pattern: [Punch.] [Punch.] [...] [Punch.] [Punch.] [Hit.]
— Avoid starting every sentence the same way (e.g. "You...", "You...", "You...").
— Target: **~${wordTarget} words** (~${Math.round(wordTarget / 2.37)}s spoken)
— ⚠️ ELABORATION IS KEY: If you are below the word count, go DEEPER. Add a specific real-world example. Describe the visceral feeling of the situation. Provide a consequence that nobody talks about.`

    const bridgeNote =
      preset === 'hook'
        ? `

CHAPTER_BRIDGE — hook → scene 2 (mandatory):
The last sentence of this scene must simultaneously:
  (1) Close the emotional loop opened by the hook.
  (2) Open the door to what the rest of the video explores.
One sentence. Natural. Felt.
It is the sentence that makes the viewer think: "okay... tell me more."`
        : `

CHAPTER_BRIDGE:
The last sentence must seal this scene AND pull the viewer into the next one.
One sentence. Felt. Forward-moving.`

    return `**${preset.toUpperCase()} scene**
${voiceGuide[preset]}
${rhythmNote}${bridgeNote}`
  }

  // ─── Narration Validator & Auto-Corrector ─────────────────────────────────

  public validateAndCorrectNarration(
    narration: string,
    preset: Preset
  ): {
    corrected: string
    violations: string[]
    isValid: boolean
  } {
    const violations: string[] = []
    let corrected = narration.trim()

    // ── 1. Sentences > 20 words → flag ──────────────────────────────────
    corrected.split(/(?<=[.!?])\s+/).forEach((sentence) => {
      const words = sentence.trim().split(/\s+/)
      if (words.length > 18) {
        violations.push(
          `Sentence too long (${words.length} words) — needs manual split: "${sentence.slice(0, 80)}${sentence.length > 80 ? '...' : ''}"`
        )
      }
    })

    // ── 2. Pause density — min 2 '...' per scene ────────────────────────
    const pauseCount = (corrected.match(/\.\.\./g) || []).length
    if (pauseCount < 2) {
      violations.push(`Insufficient pause markers: ${pauseCount}/2 minimum`)
      const sentences = corrected.split(/(?<=[.!?])\s+/)
      if (sentences.length >= 2 && pauseCount === 0) {
        sentences[0] = sentences[0].replace(/([.!?])$/, '...')
        if (sentences.length > 2) {
          sentences[2] = sentences[2].replace(/([.!?])$/, '...')
        }
        corrected = sentences.join(' ')
      } else if (pauseCount === 1 && sentences.length >= 3) {
        sentences[2] = sentences[2].replace(/([.!?])$/, '...')
        corrected = sentences.join(' ')
      }
    }

    // ── 2a. Reflective Question Pause ──────────────────────────────────
    if (corrected.trim().endsWith('?')) {
      corrected = `${corrected.trim()}...`
      violations.push(`Scene ends with a question — added reflective '...' pause`)
    }

    // ── 3. Orphan sentence at end < 5 words ─────────────────────────────
    const sentences = corrected.split(/(?<=[.!?])\s+/)
    const lastSentence = sentences.at(-1)?.trim() ?? ''
    const lastWordCount = lastSentence.split(/\s+/).filter(Boolean).length
    if (lastWordCount > 0 && lastWordCount < 5) {
      const precededByPause = sentences.at(-2)?.trim().endsWith('...')
      if (!precededByPause) {
        violations.push(`Orphan sentence at end (${lastWordCount} words): "${lastSentence}"`)
        if (sentences.length > 1) {
          const prevIdx = sentences.length - 2
          const prev = sentences[prevIdx]
          if (prev) {
            sentences[prevIdx] = prev.replace(/([.!?])$/, '...')
            corrected = sentences.join(' ')
          }
        }
      }
    }

    // ── 4. Word count floor per preset ──────────────────────────────────
    const wordCount = corrected.split(/\s+/).filter(Boolean).length
    const minWords = PRESET_MIN_WORDS[preset]
    if (wordCount < minWords) {
      violations.push(`Word count too low: ${wordCount}/${minWords} minimum for preset "${preset}"`)
    }

    // ── 5. Sentence count floor per preset ──────────────────────────────
    const sentenceCount = (corrected.match(/[.!?]+/g) || []).length
    const minSentences = PRESET_MIN_SENTENCES[preset]
    if (sentenceCount < minSentences) {
      violations.push(`Sentence count too low: ${sentenceCount}/${minSentences} minimum for preset "${preset}"`)
    }

    return {
      corrected,
      violations,
      isValid: violations.length === 0
    }
  }

  // ─── LLM micro-correction prompt builder ──────────────────────────────────

  private buildMicroCorrectionPrompt(scene: { sceneNumber: number; preset: string; narration: string }): string {
    return `You are a narration corrector. Fix ONLY the violations listed below.
Do NOT rewrite the entire narration. Do NOT change what is already correct.
Return ONLY valid JSON: { "corrected": "string", "changes": ["string"] }
No markdown, no backticks, no explanation outside the JSON.

NARRATION TO FIX (preset: ${scene.preset}, scene: ${scene.sceneNumber}):
"${scene.narration}"

CHECK AND FIX THESE 4 RULES ONLY:

1. THIRD-PERSON DRIFT: Max 1 consecutive "they/their/he/she" sentence.
   The very next sentence MUST return to "you".
   BAD:  "Their silence holds stories. They carry worlds. Nobody asks."
   GOOD: "Their silence holds stories... Have you ever wondered what they carry?"

2. SLOT QUALITY: Each narrative beat must be a complete, specific thought.
   Vague filler sentences are invalid.
   BAD:  "This is important."
   GOOD: "This is the moment you realize nothing was ever in your control."

3. SCENE COHERENCE: The narration must stay on ONE core idea.
   If it drifts to a second unrelated idea, cut or merge it into the main idea.

4. LONG SENTENCES: Any sentence over 18 words must be split into two.
   The split must happen at a natural semantic boundary — not in the middle of a clause.

   BAD split: "You've been carrying this weight for so long you've forgotten." + "what it feels like to put it down."
   GOOD split: "You've been carrying this weight for so long." + "You've forgotten what it feels like to put it down."

   Rule: Each part must be grammatically complete and semantically self-contained.

IMPORTANT:
- If no violation is found, return the original narration unchanged.
- List every change you made in "changes". If none, return an empty array.
- Never add new content unless strictly required to fix a violation.`
  }

  // ─── LLM micro-correction for semantic violations ─────────────────────────

  public async correctNarrationWithLLM(
    scene: { sceneNumber: number; preset: string; narration: string },
    llmClient: { complete: (prompt: string) => Promise<string> }
  ): Promise<{ corrected: string; changes: string[] }> {
    const prompt = this.buildMicroCorrectionPrompt(scene)

    try {
      const raw = await llmClient.complete(prompt)
      const clean = raw.replaceAll(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      return {
        corrected: parsed.corrected ?? scene.narration,
        changes: parsed.changes ?? []
      }
    } catch (error) {
      console.warn(`[PromptManager] LLM micro-correction failed for scene ${scene.sceneNumber}:`, error)
      return {
        corrected: scene.narration,
        changes: []
      }
    }
  }

  // ─── Batch validator + corrector for all scenes ───────────────────────────

  public async validateAndCorrectAllScenes(
    scenes: Array<{ sceneNumber: number; preset: string; narration: string }>,
    llmClient?: { complete: (prompt: string) => Promise<string> }
  ): Promise<{
    correctedScenes: Array<{ sceneNumber: number; preset: string; narration: string }>
    allViolations: Array<{ sceneNumber: number; violations: string[] }>
    needsRetry: boolean
    isValid: boolean
  }> {
    const correctedScenes: Array<{ sceneNumber: number; preset: string; narration: string }> = []
    const allViolations: Array<{ sceneNumber: number; violations: string[] }> = []

    for (const scene of scenes) {
      const preset = (scene.preset ?? 'mirror') as Preset

      // Step 1: JS correction (0 token)
      const { corrected: jsCorrected, violations } = this.validateAndCorrectNarration(scene.narration, preset)

      let finalNarration = jsCorrected

      // Step 2: LLM semantic correction (~200 tokens/scene)
      if (llmClient) {
        const { corrected: llmCorrected, changes } = await this.correctNarrationWithLLM(
          { ...scene, narration: jsCorrected },
          llmClient
        )
        finalNarration = llmCorrected

        if (changes.length > 0) {
          violations.push(...changes.map((c) => `[LLM fixed] ${c}`))
        }
      }

      correctedScenes.push({ ...scene, narration: finalNarration })

      if (violations.length > 0) {
        allViolations.push({ sceneNumber: scene.sceneNumber, violations })
      }
    }

    const coherenceViolations = this.validateNarrativeCoherence(correctedScenes)
    if (coherenceViolations.length > 0) {
      allViolations.push({
        sceneNumber: 0,
        violations: coherenceViolations
      })
    }

    const needsRetry = allViolations.some((v) =>
      v.violations.some((msg) => msg.includes('Word count too low') || msg.includes('Sentence count too low'))
    )

    return {
      correctedScenes,
      allViolations,
      needsRetry,
      isValid: allViolations.length === 0
    }
  }

  // ─── Duration-based retry feedback (legacy single-pass) ───────────────────

  public buildRetryFeedback(
    validationError: string,
    attempt: number,
    scenes: Array<{ preset?: string; narration?: string; wordCount?: number; sceneNumber?: number }> | undefined,
    targetWords: number,
    actualWords: number,
    options?: VideoGenerationOptions
  ): string {
    const deficit = targetWords - actualWords
    const wps = options ? this.getWordsPerSecond(options) : DEFAULT_WPS
    const targetDuration = Math.round(targetWords / wps)
    const actualDuration = Math.round(actualWords / wps)
    const missingSeconds = Math.max(0, targetDuration - actualDuration)
    const provider = options ? this.resolveProvider(options) : 'unknown'

    const failingSceneNumbers: number[] = []
    const sceneMatches = validationError.matchAll(/Scene\s+(\d+)/gi)
    for (const match of sceneMatches) {
      const n = parseInt(match[1], 10)
      if (!failingSceneNumbers.includes(n)) failingSceneNumbers.push(n)
    }

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

        const scaffold = PRESET_SCAFFOLD[preset]
        const missingSlotsHint = scaffold
          ? `\n      Missing content likely: ${scaffold.slots
              .slice(Math.max(0, scaffold.slots.length - 2))
              .map((s) => s.split('—')[0].trim())
              .join(', ')}`
          : ''

        sceneDiagnoses.push(
          `  • Scene ${sceneNum} (preset: ${preset}):` +
            `\n      Current: ~${currentWords} words (~${currentDuration}s spoken)` +
            `\n      Required: ≥${minWords} words (~${targetSceneDuration}s) / ≥${minSentences} sentences` +
            `\n      Deficit: ~${Math.max(0, targetSceneDuration - currentDuration)} seconds of missing narration${missingSlotsHint}`
        )
      }
    } else if (validationError) {
      sceneDiagnoses.push(`  Raw validation error: ${validationError}`)
    }

    const overallShort = actualWords < targetWords * 0.9
    const overallLong = actualWords > targetWords * 1.12

    const mandatoryRules = [
      `1. ${
        overallLong
          ? `TRIM every scene — merge content or remove filler.`
          : `Expand failing scenes — go deeper into the core idea. More specific. More human.`
      }`,
      `2. Every "reveal" scene needs: observation → explanation → one absurd-specific image → consequence → bridge.`,
      `3. Every "mirror" scene needs: name the feeling → normalize it → open one door.`,
      `4. Every "hook" scene needs: drop them in mid-thought → twist the knife → closing sentence that moves forward → leave unresolved.`,
      `5. Each content beat = ${overallLong ? 'exactly 1' : 'minimum 1'} full sentence. A one-word beat is invalid.`,
      `6. "..." counts as punctuation, NOT as a word. Do NOT pad with dots.`,
      `7. ${
        overallLong
          ? 'DENSE & PUNCHY: fewer words, more precision. Cut adverbs. Cut filler.'
          : 'DO NOT reproduce the same short narrations. Genuinely expand the ideas.'
      }`,
      `8. After writing each scene, estimate its spoken duration (~${wps.toFixed(1)} words/second) — it must match the target.`,
      `9. THIRD-PERSON DRIFT: Max 1 consecutive "they/their/he/she" sentence — return to "you" immediately after.`,
      `10. PAUSE DENSITY: Every scene needs ≥2 '...' markers.`,
      `11. HOOK CLOSING: Last sentence of hook must move the viewer forward — a promise, a question, or a pivot. A dead-end closing is invalid.`,
      `12. ORPHAN SENTENCE: No scene ends on <5 words unless preceded by '...'.`
    ]

    if (validationError.includes('NARRATIVE INCONSISTENCY')) {
      mandatoryRules.push(
        `⚠️ ALIGNMENT: Your 'fullNarration' and the sum of 'scenes' MUST be identical text. No discrepancies allowed.`
      )
    }

    mandatoryRules.push(
      `⚠️ VERBATIM ALIGNMENT (NARRATIVE CONSISTENCY):
      1. Write ALL scene "narration" fields first.
      2. Set "fullNarration" = EXACT copy of all narrations joined by a single space.
      3. No paraphrasing, no rephrasing, no "summary" in fullNarration.
      4. Any drift > 2% between the sum of scenes and fullNarration = AUTO-REJECTION.`
    )

    mandatoryRules.push(`
DATA CHECK: Review every statistic and percentage in your script.
If you are not certain it is a real established figure, replace it with approximate language now.
    `)

    return `
╔══════════════════════════════════════════════════════════════════════╗
║  🚨 ATTEMPT ${attempt} FAILED — MANDATORY CORRECTIONS BEFORE REGENERATING  ║
╚══════════════════════════════════════════════════════════════════════╝

SPOKEN DURATION: Your script runs ~${actualDuration}s. It must run ~${targetDuration}s.
${
  missingSeconds > 0
    ? `❌ You are missing ~${missingSeconds} seconds of spoken narration (≈${deficit} words).`
    : actualWords > targetWords * 1.15
      ? `❌ Your script is ~${actualDuration - targetDuration}s TOO LONG (≈${actualWords - targetWords} extra words).`
      : `✅ Total duration is acceptable, but structural rules were violated (see below).`
}

FAILING SCENES:
${sceneDiagnoses.join('\n\n')}

MANDATORY RULES FOR THIS RETRY:
${mandatoryRules.join('\n')}

  EXPANSION TECHNIQUES (when scenes are too short):
    - Go deeper into one specific moment: "Imagine the feeling of..."
    - Add the consequence that nobody talks about
    - Give the one image so specific it borders on absurd
    - Name the thing they do at 2am that they've never told anyone

  TRIMMING TECHNIQUES (when scenes are too long):
    - Remove adverbs. Remove qualifiers. Remove any sentence that repeats the previous one.
    - If two sentences say the same thing, keep the more specific one.

  Regenerate the COMPLETE script with ALL scenes. Do not truncate.
`.trim()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TWO-PASS ARCHITECTURE — FIX v9
  // ─────────────────────────────────────────────────────────────────────────

  // ─── PASS 1: Narration-only system prompt ─────────────────────────────────

  public buildNarrationOnlySystemPrompt(options: VideoGenerationOptions, targetWords: number): string {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)

    return `You are a professional YouTube narrator.
Your ONLY job right now: write the full spoken narration for a ${duration}-second video.

NO JSON. NO scene labels. NO structure. NO metadata.
Just the narration — one continuous block of prose, exactly as it will be spoken aloud.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 WORD COUNT TARGET: ${targetWords} words
   (= ${duration}s × ${wps.toFixed(2)} words/second)
   Acceptable range: ${Math.round(targetWords * 0.95)}–${Math.round(targetWords * 1.08)} words
   ⛔ Below ${Math.round(targetWords * 0.9)} words = REJECTED AUTOMATICALLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VOICE MODEL — Read this. Sound exactly like this:

"You ever just wake up already tired?
Like before your feet even hit the floor, your soul's already clocked out.
That's not normal. I know everyone says it is, but it's not.
You're not just tired. You're drained...
It's that heavy, leaden feeling in your chest, like somebody's been slowly siphoning
your life force through a tiny invisible straw for years.
And you've just accepted it as your new baseline."

What this voice does:
— Opens mid-thought. No intro. No "In this video...".
— Talks TO one person, not AT an audience.
— Describes feelings with hyper-specific, slightly absurd images.
— Short punchy sentences. Avg 10-15 words. Never over 20.
— '...' = intentional breath. Min 2 per section. Never cluster two in one sentence.
— Every point is ELABORATED: sensory detail, consequence, one image so specific it borders on absurd.

STRUCTURE (mental model only — do NOT label these in output):
  [HOOK ~${Math.round(targetWords * 0.12)} words] Drop viewer mid-thought. Tension. Leave unresolved.
  [REVEAL BLOCKS ~${Math.round(targetWords * 0.55)} words] 3-4 blocks. Each: observation → explanation → absurd image → consequence → bridge.
  [MIRROR BLOCK ~${Math.round(targetWords * 0.15)} words] Name the feeling. Normalize. Open one door.
  [BRIDGE ~${Math.round(targetWords * 0.08)} words] Pivot. Challenge identity. Two futures.
  [CONCLUSION ~${Math.round(targetWords * 0.1)} words] Land the plane. Mic drop last sentence. Period. No question.

FORBIDDEN PHRASES (never write these):
— "In today's fast-paced world..."
— "It's important to understand that..."
— "Society tells us that..."
— "And that's exactly what we're going to talk about"
— "This awareness is where we begin"
— Any sentence that summarizes before the idea has been explored

WORD COUNT DISCIPLINE:
After each paragraph, mentally count. Running total must track toward ${targetWords}.
If you finish a section and are below pace, go DEEPER into the next point.
Add: the visceral feeling, the specific moment, the consequence nobody talks about.
Never pad with filler — expand with substance.

PAUSE RULES:
— '...' goes inside a sentence to create a breath mid-thought: "It captured something deep in you... without you realizing it."
— '...' also goes between sentences when the second needs weight: "Only a few actually stick... Why those ones?"
— NEVER cluster two '...' in the same sentence.
— FORBIDDEN: starting with '...' in the first 5 words.

⚠️ SELF-CHECK BEFORE SUBMITTING:
Count your words. If below ${Math.round(targetWords * 0.95)}: you are not done. Keep writing.
Return ONLY the narration text. Nothing else. No preamble. No "Here is the narration:".`
  }

  // ─── PASS 1: Narration-only user prompt ──────────────────────────────────

  public buildNarrationOnlyUserPrompt(topic: string, options: VideoGenerationOptions, targetWords: number): string {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const spec = this.getEffectiveSpec(options)
    const lang = (options as any).language || 'English'
    const audience = (options as any).audience || spec.audienceDefault || 'general audience'

    return `TOPIC: ${topic}

TARGET: ${targetWords} words of spoken narration (${duration}s at ${wps.toFixed(2)} w/s)
LANGUAGE: ${lang} — every word must be in ${lang}
AUDIENCE: ${audience}

Write the full narration now. Start immediately — no preamble.
First word = first word of the hook. Go.`
  }

  // ─── PASS 1: Retry user prompt ────────────────────────────────────────────

  public buildNarrationRetryUserPrompt(
    topic: string,
    previousNarration: string,
    options: VideoGenerationOptions,
    targetWords: number,
    actualWords: number,
    attempt: number
  ): string {
    const wps = this.getWordsPerSecond(options)
    const deficit = targetWords - actualWords
    const missingSeconds = Math.round(deficit / wps)
    const lang = (options as any).language || 'English'

    // Attempt 2: continuation mode — do NOT rewrite, just append
    if (attempt === 2) {
      return `The narration below is ${actualWords} words. It needs ${targetWords} words total.
You are missing ${deficit} words — that is ${missingSeconds} more seconds of speaking.

EXISTING NARRATION (do NOT rewrite or summarize this):
---
${previousNarration}
---

YOUR TASK: Write ONLY the missing ${deficit} words as a seamless continuation.
Pick up exactly where the narration above ends. Do not repeat anything already written.
Do not add a label, a header, or "continuing from...". Just write the next sentences.

Expand by going deeper into the last idea, then add:
— The visceral physical detail nobody describes
— The consequence that compounds over time
— One image so specific it borders on absurd

Language: ${lang}. Voice: same as above. Output: continuation text only.`
    }

    // Attempt 3+: full rewrite with maximum pressure
    return `⛔ ATTEMPT ${attempt} — STILL TOO SHORT (${actualWords}/${targetWords} words).
    Missing: ${deficit} words = ${missingSeconds} seconds of audio that will be SILENCE in the final video.

    TOPIC: ${topic}
    LANGUAGE: ${lang}

    PREVIOUS NARRATION (${actualWords} words):
    ---
    ${previousNarration}
    ---

    THIS IS YOUR FINAL ATTEMPT. Rules:
    1. Do NOT compress or summarize the existing content.
    2. Find every section with fewer than 3 sentences — expand each one to at least 5.
    3. For every abstract statement ("you feel lost", "it costs you"), add:
      — WHAT it looks like physically (posture, hands, face, room)
      — WHEN it happens (time of day, specific trigger)
      — HOW LONG it has been happening (weeks, years, since when)
    4. Add at least one section you did not include before.
    5. The final word count MUST be ≥ ${Math.round(targetWords * 0.95)} words.

    Count your words before submitting. Return the COMPLETE narration. No labels. No JSON.`
  }

  // ─── PASS 1: Validation gate ──────────────────────────────────────────────

  public validateNarrationPass(
    narration: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): {
    ok: boolean
    actualWords: number
    targetWords: number
    deficit: number
    missingSeconds: number
  } {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const target = targetWords ?? Math.round(duration * wps * safetyFactor)

    const actualWords = narration.trim().split(/\s+/).filter(Boolean).length
    const deficit = Math.max(0, target - actualWords)
    const missingSeconds = Math.round(deficit / wps)
    const ok = actualWords >= Math.round(target * 0.9)

    return { ok, actualWords, targetWords: target, deficit, missingSeconds }
  }

  // ─── PASS 2: Structuring system prompt ───────────────────────────────────

  public buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const range = computeSceneCountRange(this.getEffectiveDuration(options))
    const wps = this.getWordsPerSecond(options)

    return `You are a video script structurer.
You will receive a completed narration. Your job: split it into scenes and add production metadata.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ IRON RULE — NARRATION IS LOCKED
The narration text you receive is FINAL. You may NOT:
  — Rewrite any sentence
  — Shorten any paragraph
  — Add new narration content
  — Paraphrase for "flow"

You are ONLY allowed to:
  — Split the narration into scene chunks
  — Add preset, cameraAction, imagePrompt, animationPrompt, summary per scene
  — Compute wordCount and estimatedDuration from the actual text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SPLITTING RULES:
— Target ${range.min}–${range.max} scenes (ideal: ${range.ideal})
— Each split must happen at a natural sentence boundary (after . ! ? or ...)
— Hook: first emotional block, ends before first major explanation
— Reveal: one per main concept/argument (3-5 scenes typically)
— Mirror: the "I see you" block, emotionally validating
— Bridge: the pivot/confrontation just before the end
— Conclusion: last block only. Must end on a "mic drop" sentence (short, firm, period).

PRESET MINIMUM WORDS (if a chunk is below minimum, merge with adjacent):
  hook ≥ ${PRESET_MIN_WORDS.hook} | reveal ≥ ${PRESET_MIN_WORDS.reveal} | mirror ≥ ${PRESET_MIN_WORDS.mirror} | bridge ≥ ${PRESET_MIN_WORDS.bridge} | conclusion ≥ ${PRESET_MIN_WORDS.conclusion}

fullNarration RULE:
  fullNarration = scenes[0].narration + " " + scenes[1].narration + " " + ... (verbatim join)
  Set this AFTER filling all scene narration fields, by concatenating them verbatim.
  Any word-count discrepancy > 2% = auto-rejected.

IMAGE PROMPT RULES:
— MUST be LITERAL and PHOTOGRAPHABLE. Absolutely NO metaphors or abstract symbolism.
— BAD: "A brain transforming into a tree, symbolizing growth."
— BAD: "A web of interconnected glowing thoughts."
— GOOD: "A close-up of a student writing in a notebook in a brightly lit classroom."
— GOOD: "A pair of hands planting a small green sapling in dark soil."
— Explain exactly what is materially present on screen: physical subjects, physical setting, and literal physical actions.

CAMERA ACTIONS:
  breathing | zoom-in | zoom-out | pan-right | pan-left | ken-burns-static |
  zoom-in-pan-right | dutch-tilt | snap-zoom | shake | zoom-in-pan-down

TRANSITIONS (rich options):
  fade | crossfade | blur | zoomin | circlecrop | circleopen | pixelize | 
  hblur | radial | distance | smoothleft | smoothright | wipeleft | wiperight

PRESET → PRODUCTION SUGGESTIONS (not mandatory):
  hook       → camera: snap-zoom, dutch-tilt | transition: zoomin, circleopen
  reveal     → camera: zoom-in, pan-right | transition: crossfade, wipeleft, circlecrop
  mirror     → camera: breathing, ken-burns-static | transition: blur, radial, distance
  bridge     → camera: shake, dutch-tilt | transition: pixelize, wipeup
  conclusion → camera: zoom-out, ken-burns-static | transition: smoothdown, fadeblack

BACKGROUND MUSIC (mood mapping):
  - chill, lo-fi, educational: "lofi-1" (Chill Lo-Fi)
  - upbeat, business, motivational: "upbeat-1" (Upbeat Corporate)
  - sad, emotional, story, quiet: "ambient-1" (Soft Ambient)
  - fun, entertainment, kids: "fun-1" (Funky Groove)

OUTPUT: Valid JSON only. No markdown. No backticks. No explanation outside the JSON.`
  }

  // ─── PASS 2: Structuring user prompt ─────────────────────────────────────

  public buildStructuringUserPrompt(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    noPrune: boolean = false
  ): string {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const lang = (options as any).language || 'English'
    const audience = (options as any).audience || 'general audience'
    const actualWords = validatedNarration.trim().split(/\s+/).filter(Boolean).length
    const targetWords = Math.round(duration * wps * safetyFactor)

    const outputFormat = `{
  "topic": "string",
  "audience": "string",
  "emotionalArc": ["string"],
  "titles": ["string (5 YouTube title options)"],
  "theme": "string",
  "backgroundMusic": "string (lofi-1 | upbeat-1 | ambient-1 | fun-1)",
  "fullNarration": "string — verbatim join of all scene narration fields",
  "totalWordCount": ${targetWords},
  "scenes": [
    {
      "sceneNumber": 1,
      "id": "string",
      "preset": "hook | reveal | mirror | bridge | conclusion",
      "pacing": "fast | medium | slow",
      "breathingPoints": ["string"],
      "narration": "string — use the source text.${noPrune ? ' DO NOT PRUNE OR CONDENSE.' : ` You may selectively prune or condense IF the input is too long for the ${duration}s target.`}",
      "wordCount": "number",
      "estimatedDuration": "number",
      "summary": "string",
      "cameraAction": "string (breathing | zoom-in | zoom-out | pan-right | pan-left | snap-zoom | dutch-tilt | zoom-in-pan-right | zoom-in-pan-down | shake)",
      "transition": "none | fade | blur | crossfade | zoomin | wipeleft | wiperight | wipeup | wipedown | slideleft | slideright | smoothleft | smoothright | circlecrop | pixelize | hblur",
      "imagePrompt": "string (Literal, concrete, photographable visual description. NO metaphors.)",
      "animationPrompt": "string"
    }
  ]
} \``

    return `TOPIC: ${topic}
LANGUAGE: ${lang}
AUDIENCE: ${audience}
VIDEO DURATION: ${duration}s
TTS SPEED: ${wps.toFixed(2)} words/second
TARGET WORD COUNT: ${targetWords} words
NARRATION TO STRUCTURE (${actualWords} words):
---
${validatedNarration}
---

YOUR TASK:
Split the narration above into scenes following the SPLITTING RULES.
${noPrune ? `⚠️ MANDATORY: Use the narration VERBATIM. DO NOT SKIP, PRUNE, OR CONDENSE ANY TEXT. Every word provided in the source must appear in a scene field.` : `⚠️ If the narration is too long for the ${duration}s target (~${targetWords} words), selectively prune less impactful sentences or condense redundant phrasing while maintaining the core emotional arc and conclusion.`}
Fill all metadata fields for each scene.
Return only valid JSON matching this exact format:
${outputFormat}`
  }

  // ─── Two-pass public orchestrators ───────────────────────────────────────

  /**
   * Returns pass 1 prompts + the target word count.
   * Call buildPass2Prompts() after validating pass 1 output.
   *
   * Usage:
   *   const { pass1 } = promptManager.buildTwoPassPrompts(topic, options)
   *   let narration = await llm.complete(pass1.system, pass1.user)
   *   const validation = promptManager.validateNarrationPass(narration, options, pass1.targetWords)
   *   if (!validation.ok) {
   *     const retryUser = promptManager.buildNarrationRetryUserPrompt(topic, narration, options, pass1.targetWords, validation.actualWords, 2)
   *     narration = await llm.complete(pass1.system, retryUser)
   *   }
   *   const p2 = promptManager.buildPass2Prompts(narration, topic, options)
   *   const script = await llm.complete(p2.system, p2.user)
   */
  public buildTwoPassPrompts(
    topic: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): {
    pass1: { system: string; user: string; targetWords: number }
  } {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const target = targetWords ?? Math.round(duration * wps * safetyFactor)

    return {
      pass1: {
        system: this.buildNarrationOnlySystemPrompt(options, target),
        user: this.buildNarrationOnlyUserPrompt(topic, options, target),
        targetWords: target
      }
    }
  }

  public buildPass2Prompts(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    chunkContext?: {
      chunkIndex: number
      totalChunks: number
      startSceneNumber: number
    }
  ): { system: string; user: string } {
    let userPrompt = this.buildStructuringUserPrompt(validatedNarration, topic, options, !!chunkContext)

    if (chunkContext) {
      userPrompt += `\n\n⚠️ CHUNK MODE: This is part ${chunkContext.chunkIndex + 1} of ${chunkContext.totalChunks} of the full narration.\n`
      userPrompt += `Structure ONLY this specific block into scenes.\n`
      userPrompt += `VERBATIM RULE: You MUST structure the entire text of this chunk without omitting a single word.\n`
      userPrompt += `Scene numbering MUST start at ${chunkContext.startSceneNumber}.\n`
      if (chunkContext.chunkIndex > 0) {
        userPrompt += `Maintain continuity from the previous part.\n`
      }
    }

    return {
      system: this.buildStructuringSystemPrompt(options),
      user: userPrompt
    }
  }

  /**
   * Post-pass-2 integrity fix.
   * Auto-corrects fullNarration drift if scenes were modified during structuring.
   * Call this after parsing the pass 2 JSON output.
   */
  public fixFullNarrationDrift(script: any): { script: any; driftFixed: boolean; driftWords: number } {
    if (!script?.scenes?.length) return { script, driftFixed: false, driftWords: 0 }

    const sceneNarrations: string = script.scenes.map((s: any) => s.narration ?? '').join(' ')
    const sceneWords = sceneNarrations.trim().split(/\s+/).filter(Boolean).length
    const fullNarrationWords = (script.fullNarration ?? '').trim().split(/\s+/).filter(Boolean).length
    const drift = Math.abs(sceneWords - fullNarrationWords)
    const driftPct = fullNarrationWords > 0 ? drift / fullNarrationWords : 1

    // Mild drift (2-15%): just warn. Do NOT overwrite — avoids creating logical jumps.
    if (driftPct > 0.02 && driftPct <= 0.15) {
      console.warn(
        `[PromptManager] Mild fullNarration drift: ${Math.round(driftPct * 100)}% (${drift}w). Keeping original to avoid logical gaps.`
      )
      return { script, driftFixed: false, driftWords: drift }
    }

    // Severe drift (>15%): auto-correct from scenes (something went very wrong).
    if (driftPct > 0.15) {
      script.fullNarration = sceneNarrations
      script.totalWordCount = sceneWords
      return { script, driftFixed: true, driftWords: drift }
    }

    return { script, driftFixed: false, driftWords: drift }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEGACY SINGLE-PASS (preserved for backward compatibility)
  // ─────────────────────────────────────────────────────────────────────────

  async buildScriptSystemPrompt(options: VideoGenerationOptions = {} as any, targetWords?: number): Promise<string> {
    const spec = this.getEffectiveSpec(options)
    const characterMetadata = await this.resolveCharacterMetadata()
    const instructions = [...(spec.instructions || [])]
    const provider = this.resolveProvider(options)

    // ── PRIME DIRECTIVE ────────────────────────────────────────────────────
    instructions.unshift(`
PRIME DIRECTIVE — Read this before anything else.

The target word count is the #1 technical requirement. If you under-generate, the video will fail.

The reference voice for this script is **Visceral, Detailed, and Human**. It sounds like this:

"You ever just wake up already tired?
Like before your feet even hit the floor, your soul's already clocked out.
That's not normal. I know everyone says it is, but it's not.
You're not just tired. You're drained... 
It's that heavy, leaden feeling in your chest, like somebody's been slowly siphoning your life force through a tiny invisible straw for years.
And you've just accepted it as your new baseline."

What this voice does right:
— ELABORATION: It doesn't just name a feeling; it describes it (leaden feeling, siphoning life force).
— Opens mid-thought, no setup. No introduction.
— Metaphors are specific and slightly absurd.
— Every sentence is punchy, but allows for descriptive flow.
— It talks TO one person, not AT an audience.

DENSITY & ELABORATION (CRITICAL):
— DO NOT summarizes your points. Explore them.
— If a scene feels short, add the "Visual Detail": What does it look like in real life? What is the character holding? What's the specific expression on their face?
— If a point is "Focus on what matters", don't just say that. Say: "Like choosing to spend your Saturday morning actually breathing, instead of grinding through a spreadsheet nobody's going to read until Tuesday."
— Detail = Duration. No detail = Failure.

NARRATIVE AIR (TIME TO BREATHE):
— You possess a 'visual' resource. Every word you use eats up total time.
— When you introduce a heavy realization or a reflective question, you MUST leave space.
— Use '...' at the end of such sentences to signal the pause.
— In REVEAL and MIRROR scenes, aim to end with a question that makes the viewer stop. Then leave 1-2 seconds of 'visual-only' silence at the end of that scene by keeping your word count efficient.

⚠️ RHYTHM ≠ BREVITY:
The examples demonstrate VOICE and RHYTHM — not total script size.
Short sentences are the delivery mechanism. The narration MUST be long enough to fill the target duration.
Every scene must reach its word target. A scene with 3 short sentences is too short. Add more beats. Genuinely expand the ideas.

What NEVER appears in this voice:
— "In today's fast-paced world..." — banned.
— "It's important to understand that..." — you're writing an essay. Stop.
— "Society tells us that..." — passive, distancing, cold.
— Generic AI pivots: "And that's exactly what we're going to talk about", "This awareness is where we begin", etc.
— Any sentence that sounds like a summary or a conclusion before the idea has been explored.
`)

    if (options && (options.wordsPerMinute || options.language || options.audioProvider)) {
      const wps = this.getWordsPerSecond(options)
      instructions.push(`NARRATION SPEED: ${wps.toFixed(2)} words/second`)
    }

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
      — You are talking to ONE specific person. Not a camera. Not an audience. One tired human at 11pm in bed, half checked-out.
      — Write for the ear. Every sentence should feel good to say out loud.
      — Punchy rhythm: Aim for avg 10-15 words per sentence, but prioritize depth over brevity.
      — Pauses ("...") are breath, not decoration. Place them where a real speaker would inhale.
      — The script is NOT an article, NOT an essay, NOT a list of points. It is one person talking to another.
      — VOICE RULE: Always speak TO the viewer ("you"), not about a third person from the outside.
      — ELABORATION RULE: Never leave a point as a hollow statement. Force it into reality with a vivid, hyper-specific example.
      — Never invent statistics or studies. Use approximate language when uncertain.

      Visual continuity:
      Ensure scenes follow a logical progression. Keep environments and actions consistent unless a change is clearly motivated.

      Camera Dynamics & Transitions:
      Each scene MUST use a dynamic camera action and a visual transition to the next scene.
      
      Available transition values:
      — none          → Standard cut. Use for fast-paced sequences or internal lists.
      — fade          → Smooth transparency transition.
      — blur          → Dreamy, soft transition. Good for mood shifts.
      — crossfade     → Classic overlap.
      — wipeleft/right → Directional motion. Good for temporal progression.
      — zoom          → Energetic focus shift.

      Available cameraAction values:
      — breathing          → Calm / contemplative scenes.
      — zoom-in            → Focus on detail, intimacy, or revelation.
      — zoom-out           → Context reveal, tension rising, or closure.
      — pan-right          → Progress, moving forward, active narration.
      — pan-left           → Reversal, flashback, or second thought.
      — ken-burns-static   → Subtle elegance for landscape/background shots.
      — zoom-in-pan-right  → Dynamic forward energy with focus.
      — dutch-tilt         → Psychological unease or instability.
      — snap-zoom          → Shock, revelation, or high-energy sync.
      — shake              → Intensity, beat-sync, or physical impact.
      — zoom-in-pan-down   → Heavy energy, grounding the narrative.

      PACING ARC:
      1. THE HOOK (0-15%): High impact, drops viewer mid-thought.
      2. THE BUILD (15-70%): Alternates between explanation and recognition.
      3. THE REVEAL/CONCLUSION (70-100%): Slower. Let the message breathe.

      DATA INTEGRITY: Never invent statistics, studies, or named research.
      Use: 'studies suggest', 'research indicates', 'roughly', 'approximately'.
      A vague but honest claim is always better than a precise invented one.
      `
    )

    if (isOpenAIProvider(provider)) {
      instructions.push(`
⚠️ GPT-4o SPECIFIC — NARRATIVE CONSISTENCY RULE (CRITICAL):
The "fullNarration" field MUST be the EXACT concatenation of all scene "narration" fields, joined by a single space.
WORKFLOW:
  1. Write ALL scene "narration" fields completely.
  2. Set fullNarration = [scene1.narration] + " " + [scene2.narration] + " " + ... (verbatim, no changes).
  3. Do NOT write fullNarration first and scenes second.
  4. Do NOT paraphrase, shorten, or rephrase in fullNarration.
Any word-count discrepancy between fullNarration and sum(scenes.narration) = AUTOMATIC REJECTION.
`)
    }

    const totalDuration = this.getEffectiveDuration(options)
    const range = computeSceneCountRange(totalDuration)
    const expectedScenes = range.ideal
    const wps = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)

    const targetWordCountTotal = targetWords ?? Math.round(totalDuration * wps * safetyFactor)
    const avgWordsPerScene = Math.round(targetWordCountTotal / expectedScenes)
    const presetTargets = this.computePresetTargets(avgWordsPerScene)

    const hookScaffold = this.buildScaffoldInstruction('hook', presetTargets.hook)
    const revealScaffold = this.buildScaffoldInstruction('reveal', presetTargets.reveal)
    const mirrorScaffold = this.buildScaffoldInstruction('mirror', presetTargets.mirror)
    const conclusionScaffold = this.buildScaffoldInstruction('conclusion', presetTargets.conclusion)
    const bridgeScaffold = this.buildScaffoldInstruction('bridge', presetTargets.bridge)

    instructions.push(
      `## CONCLUSION RULES (Mandatory for the last scene)\n${spec.conclusionRules?.map((r) => `- ${r}`).join('\n')}`
    )

    instructions.push(
      `## NARRATION PACING (provider: ${provider})

       ### Global Spoken Duration Target
       - Video duration: ${totalDuration}s
       - TTS speed: ${wps.toFixed(2)} words/second
       - 🎯 TOTAL TARGET: **~${totalDuration} seconds of spoken audio** (~${targetWordCountTotal} words)
       - ⚠️ MAXIMUM ALLOWED: **${Math.round(targetWordCountTotal * 1.15)} words**
       - Suggested scene count: **${range.min} to ${range.max} scenes** (Target: ~${range.ideal})
       - Average per scene: **~${avgWordsPerScene} words**

       ### Per-Scene Voice Direction

       ${hookScaffold}

       ${revealScaffold}

       ${mirrorScaffold}

       ${bridgeScaffold}

       ${conclusionScaffold}

       ### Duration & Scene Flexibility (CRITICAL)
       - You are NOT limited to a fixed number of scenes.
        - Total MUST be ~${totalDuration}s (±10%).${
          totalDuration >= 180
            ? `
        - ⚠️ GRANULARITY (Mandatory): For this long-form video, you MUST use at least **${range.min} to ${range.max} scenes** (Target: **${range.ideal}**).
        - ⚠️ POINT SPLITTING: If the input topic has only ~10 points but the target is ~${range.ideal} scenes, you MUST split each point into multiple sequential scenes (e.g. "Concept" -> "Sensory Detail" -> "Connection"). 
        - ⚠️ NO COPY-PASTING: Expand each seed sentence from the topic into a full narrative block (~${avgWordsPerScene} words per scene).`
            : ''
        }`
    )

    instructions.push(
      `PAUSE PLACEMENT:
      — '...' goes inside a sentence to create a breath mid-thought: "It captured something deep in you... without you realizing it."
      — '...' also goes between sentences when the second needs weight: "Only a few actually stick... Why those ones?"
      — NEVER cluster two '...' in the same sentence.
      — FORBIDDEN: starting a scene with '...' in the first 5 words.`
    )

    const fullSpec = {
      ...spec,
      instructions,
      characterDescription: characterMetadata
        ? `${characterMetadata.description}. Personality: ${characterMetadata.artistPersona}.`
        : spec.characterDescription
    }

    const consolidatedOutputFormat = this.getConsolidatedOutputFormat(
      undefined,
      presetTargets,
      targetWordCountTotal,
      avgWordsPerScene,
      wps,
      totalDuration
    )

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
        targetDuration: totalDuration,
        targetWordCount: targetWordCountTotal,
        outputFormat: consolidatedOutputFormat
      } as any)
    ]
      .filter(Boolean)
      .join('\n\n')

    return scriptInstruction
  }

  // ─── Output format (legacy) ───────────────────────────────────────────────

  private getConsolidatedOutputFormat(
    _unused_baseFormat?: string,
    presetTargets?: { hook: number; reveal: number; mirror: number },
    targetWordCountTotal?: number,
    avgWordsPerScene?: number,
    wps?: number,
    totalDuration?: number
  ): string {
    const effectiveWps = wps ?? DEFAULT_WPS
    const effectiveDuration = totalDuration ?? 60

    return `{
      "topic": "string",
      "audience": "string",
      "emotionalArc": ["string"],
      "titles": ["string"],
      "fullNarration": "string — ⚠️ CRITICAL: Exact concatenation of all scene narration fields joined by a single space. Write scenes first, then copy verbatim. DO NOT write independently. Must produce ~${effectiveDuration}s of spoken audio.",
      "totalWordCount": "number (self-reported total. Must be within ±10% of ${targetWordCountTotal} words / ~${effectiveDuration}s spoken. ⛔ Counts below ${Math.round((targetWordCountTotal ?? 0) * 0.85)} = auto-rejected)",
      "theme": "string",
      "backgroundMusic": "string (lofi-1 | upbeat-1 | ambient-1 | fun-1)",
      "scenes": [
        {
          "sceneNumber": 1,
          "id": "string",
          "preset": "hook | reveal | mirror | bridge | conclusion",
          "pacing": "fast | medium | slow",
          "breathingPoints": ["string (e.g. 'after sentence 2', 'before the consequence')"],
          "narration": "string — write this scene fully before moving to the next",
          "wordCount": "number — word count of this narration field",
          "estimatedDuration": "number (words ÷ ${effectiveWps.toFixed(1)} — spoken seconds for this scene)",
          "summary": "string",
          "cameraAction": "string (breathing | zoom-in | zoom-out | pan-right | pan-left | ken-burns-static | zoom-in-pan-right | dutch-tilt | snap-zoom | shake | zoom-in-pan-down)",
          "imagePrompt": "string (Detailed visual prompt)",
          "animationPrompt": "string"
        }
      ]
    }`
  }

  // ─── User prompt builder (legacy) ────────────────────────────────────────

  buildScriptUserPrompt(topic: string, options: VideoGenerationOptions, targetWords?: number): string {
    const spec = this.getEffectiveSpec(options)
    const effectiveDuration = this.getEffectiveDuration(options)
    const wordsPerSecond = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWordCount = targetWords ?? Math.round(effectiveDuration * wordsPerSecond * safetyFactor)

    const range = computeSceneCountRange(effectiveDuration)

    return this.buildUserData({
      subject: topic,
      duration: `${effectiveDuration} seconds`,
      aspectRatio: options.aspectRatio || '16:9',
      audience: (options as any).audience || spec.audienceDefault,
      language: options.language,
      targetWordCount,
      targetDuration: effectiveDuration,
      wps: wordsPerSecond,
      sceneCountRange: range
    })
  }

  async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    return {
      systemPrompt: await this.buildScriptSystemPrompt(options, targetWords),
      userPrompt: this.buildScriptUserPrompt(topic, options, targetWords)
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

    const temporalAnchor = `TEMPORAL CONSISTENCY: The image MUST reflect the exact era and technology level implied by the scene. Never default to modern technology unless explicitly required.`
    const genderAnchor = `GENDER CONSISTENCY: The gender of all characters MUST match the narration exactly.
    If the narration uses "he/him" — render a male character.
    If "she/her" — render a female character.
    If unspecified — default to a neutral or ambiguous silhouette.`

    const imageSpec: VideoTypeSpecification = {
      ...spec,
      instructions: [referenceMode, styleAnchor, temporalAnchor, genderAnchor, ...(spec.instructions || [])].filter(
        Boolean
      )
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
    if ((spec as any).targetDuration) {
      sections.push(
        `## DURATION\nTarget: ${(spec as any).targetDuration} seconds\nWord Count: ${(spec as any).targetWordCount ?? 'approx 135'} words`
      )
    }
    if (spec.task) sections.push(`## TASK\n${spec.task}`)
    if (spec.goals?.length) sections.push(`## GOALS\n${spec.goals.map((g) => `- ${g}`).join('\n')}`)
    if (spec.structure) sections.push(`## STRUCTURE\n${spec.structure}`)
    if (spec.rules?.length) sections.push(`## RULES\n${spec.rules.map((r) => `- ${r}`).join('\n')}`)
    if (spec.formatting) sections.push(`## FORMATTING\n${spec.formatting}`)

    if ((spec as any).narrativeRules?.length)
      sections.push(`## NARRATIVE RULES\n${(spec as any).narrativeRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).styleRules?.length)
      sections.push(`## STYLE RULES\n${(spec as any).styleRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).expansionRules?.length)
      sections.push(
        `## TOPIC EXPANSION & POINT SPLITTING\n${(spec as any).expansionRules.map((r: string) => `- ${r}`).join('\n')}`
      )
    if ((spec as any).engagementRules?.length)
      sections.push(`## ENGAGEMENT RULES\n${(spec as any).engagementRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).contrastRules?.length)
      sections.push(`## CONTRAST RULES\n${(spec as any).contrastRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).truthRules?.length)
      sections.push(`## TRUTH RULES\n${(spec as any).truthRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).emotionCurve?.length)
      sections.push(`## EMOTION CURVE\n${(spec as any).emotionCurve.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).narrativeRoles?.length)
      sections.push(`## NARRATIVE ROLES\n${(spec as any).narrativeRoles.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).curiosityRules?.length)
      sections.push(`## CURIOSITY RULES\n${(spec as any).curiosityRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).escalationRules?.length)
      sections.push(`## ESCALATION RULES\n${(spec as any).escalationRules.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).identityTriggers?.length)
      sections.push(`## IDENTITY TRIGGERS\n${(spec as any).identityTriggers.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).postProcessing?.length)
      sections.push(`## POST-PROCESSING\n${(spec as any).postProcessing.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).internalCheck?.length)
      sections.push(
        `## BEFORE FINALIZING, INTERNALLY CHECK:\n${(spec as any).internalCheck.map((r: string) => `- ${r}`).join('\n')}`
      )
    if ((spec as any).patternInterrupts?.length)
      sections.push(`## PATTERN INTERRUPTS\n${(spec as any).patternInterrupts.map((r: string) => `- ${r}`).join('\n')}`)
    if ((spec as any).antiBoringRules?.length)
      sections.push(`## ANTI-BORING RULES\n${(spec as any).antiBoringRules.map((r: string) => `- ${r}`).join('\n')}`)

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

    const totalDur = targetDuration ?? parseInt(options.duration) ?? 60
    const range = options.sceneCountRange ?? computeSceneCountRange(totalDur)

    const hardConstraint =
      targetWordCount && targetDuration
        ? [
            `⛔ HARD CONSTRAINT — WORD COUNT (violating this = automatic rejection on any attempt):`,
            `   Total narration across ALL scenes: **~${targetWordCount} words** (~${targetDuration}s at ${effectiveWps.toFixed(1)} w/s).`,
            `   • Scene count: **flexible from ${range.min} to ${range.max} scenes** (Target: ~${range.ideal}).`,
            `   • ⚠️ GRANULARITY: For this ${targetDuration}s video, you MUST use at least **${range.min} to ${range.max} scenes** (Target: **${range.ideal}**).`,
            `   • ⚠️ POINT SPLITTING: Split each point of the input topic into multiple scenes. DO NOT do a 1:1 mapping.`,
            `   • Preset minimums (per scene): hook ≥ ${PRESET_MIN_WORDS.hook} | reveal ≥ ${PRESET_MIN_WORDS.reveal} | mirror ≥ ${PRESET_MIN_WORDS.mirror} | bridge ≥ ${PRESET_MIN_WORDS.bridge} | conclusion ≥ ${PRESET_MIN_WORDS.conclusion} words.`,
            `   • ⚠️ BRIDGE: Use a 'bridge' scene just before the end to pivot and build final tension.`,
            `   • ⚠️ FINAL SCENE: The last scene MUST use the **conclusion** preset for a definitive resolution.`,
            `   • Any scene under its preset minimum = auto-rejected.`,
            `   • After writing each scene: count words, divide by ${effectiveWps.toFixed(1)} = spoken seconds.`,
            `   • Check your running total before moving to the next scene.`,
            `   • You are free to use as many scenes as required (within the ${range.min}-${range.max} range) — but total words MUST reach ${targetWordCount}.`,
            ``
          ].join('\n')
        : ''

    const lines = [
      hardConstraint,
      '---',
      `Subject: ${options.subject}`,
      `Required Duration: ${options.duration}`,
      `Aspect Ratio: ${options.aspectRatio}`,
      `Audience: ${options.audience}`,
      `Target Language: ${options.language || 'English'} — Generate ALL text content in this language WITHOUT EXCEPTION.`
    ]

    return lines.filter(Boolean).join('\n')
  }

  private validateNarrativeCoherence(
    scenes: Array<{ sceneNumber: number; preset: string; narration: string }>
  ): string[] {
    const violations: string[] = []

    for (let i = 0; i < scenes.length - 1; i++) {
      const current = scenes[i]
      const next = scenes[i + 1]

      const currentSentences = current.narration.split(/(?<=[.!?])\s+/)
      const lastSentence = currentSentences.at(-1)?.trim() ?? ''

      const nextSentences = next.narration.split(/(?<=[.!?])\s+/)
      const firstSentence = nextSentences[0]?.trim() ?? ''

      const bridgeKeywords = extractKeywords(lastSentence)
      const openingKeywords = extractKeywords(firstSentence)

      const overlap = bridgeKeywords.filter((k) => openingKeywords.includes(k))

      if (overlap.length === 0) {
        violations.push(
          `Scene ${current.sceneNumber} → ${next.sceneNumber}: No semantic bridge detected.\n` +
            `  Bridge: "${lastSentence.slice(0, 80)}"\n` +
            `  Opening: "${firstSentence.slice(0, 80)}"`
        )
      }
    }

    const hook = scenes.find((s) => s.preset === 'hook')
    if (hook) {
      const hookKeywords = extractKeywords(hook.narration)
      const restKeywords = scenes.filter((s) => s.preset !== 'hook').flatMap((s) => extractKeywords(s.narration))

      const resolved = hookKeywords.filter((k) => restKeywords.includes(k))
      if (resolved.length < 2) {
        violations.push(
          `Narrative drift: Hook introduces concepts not resolved in subsequent scenes.\n` +
            `  Hook keywords: ${hookKeywords.slice(0, 6).join(', ')}\n` +
            `  Rest coverage: ${resolved.join(', ') || 'none'}`
        )
      }
    }

    const presets = scenes.map((s) => s.preset)
    const hasReveal = presets.includes('reveal')
    if (!hasReveal) {
      violations.push(`Structural violation: No "reveal" scene found. Arc is incomplete.`)
    }

    return violations
  }
}

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'is',
    'are',
    'was',
    'were',
    'this',
    'that',
    'it',
    'you',
    'we',
    'they',
    'he',
    'she',
    'i',
    'me',
    'my',
    'your',
    'our',
    'their',
    'have',
    'has',
    'had',
    'be',
    'been',
    'do',
    'does',
    'did',
    'will',
    'would',
    'can',
    'could',
    'should',
    'may',
    'might',
    'not',
    'no',
    'so',
    'if',
    'as'
  ])

  return text
    .toLowerCase()
    .replaceAll(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w))
}
