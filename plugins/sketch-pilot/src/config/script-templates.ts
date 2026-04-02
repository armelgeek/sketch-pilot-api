import type { VideoTypeSpecification } from '../core/prompt-maker.types'

// ─── Per-provider TTS speed calibration ──────────────────────────────────────
export const PROVIDER_WPS: Record<string, number> = {
  kokoro: 2.45,
  openai: 2.37,
  elevenlabs: 2.4,
  gemini: 2.3
}

export const PRESET_MIN_WORDS = {
  hook: 35,
  reveal: 45,
  mirror: 40,
  bridge: 35,
  conclusion: 45
} as const

export const PRESET_MIN_SENTENCES = {
  hook: 3,
  reveal: 4,
  mirror: 3,
  conclusion: 3,
  bridge: 3
} as const

// ─── Scaffold slot definitions ────────────────────────────────────────────────
export const PRESET_SCAFFOLD: Record<string, { slots: string[]; description: string }> = {
  hook: {
    description: 'Percutant & High Impact opener',
    slots: [
      '[CONTEXT_DROP] — Drop the viewer mid-thought. No intro. No greeting. Start with a hook.',
      '[PROBLEM_MIRROR] — Describe a specific, painful, or relatable situation.',
      '[STAKE_ESCALATION] — What happens if they do nothing?',
      '[IMPLICIT_ROADMAP] — Signal that there is a better way without listing points.'
    ]
  },
  reveal: {
    description: 'The Core Explanation — one major point explored in depth',
    slots: [
      '[OBSERVATION] — State a surprising fact or a hidden truth about the topic.',
      '[EXPLANATION] — Why does this happen? Go deep into the mechanics.',
      '[ABSURD_METAPHOR] — Use a specific, slightly surreal image to make it stick.',
      '[CONSEQUENCE] — What does this mean for the viewer?',
      '[TRANSITION] — A bridging sentence toward the next scene.',
      '[CHAPTER_BRIDGE] — A closing sentence that seals this scene AND pulls the viewer into the next one.'
    ]
  },
  mirror: {
    description: 'Emotional Recognition — the viewer sees themselves in the message',
    slots: [
      '[EMOTIONAL_RECOGNITION] — Describe a situation where the viewer feels stuck, undervalued, or frustrated',
      '[NORMALIZATION] — Validate that they are not alone or that their feeling makes sense',
      '[IDENTITY_SHIFT] — Reframe their situation from a new perspective',
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

export const BASE_SPEC: Partial<VideoTypeSpecification> = {
  visualRules: [
    'The concept must be visually dominant without breaking realistic scale',
    'Environments must be realistic and include multiple objects',
    'Characters must actively interact with conceptual objects'
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
  expansionRules: [
    'If the input topic has fewer points than the target scene count, SPLIT each point into multiple sequential scenes.',
    'Go deeper into one specific moment: "Imagine the feeling of..."',
    'Add the consequence that nobody talks about',
    'Give the one image so specific it borders on absurd'
  ]
}

export const PRIME_DIRECTIVE = `
PRIME DIRECTIVE — Read this before anything else.

The target word count is the #1 technical requirement. If you under-generate, the video will fail.

The reference voice for this script is **Visceral, Detailed, and Human**.

DENSITY & ELABORATION (CRITICAL):
— DO NOT summarize your points. Explore them.
— Detail = Duration. No detail = Failure.
— Use '...' at the end of heavy realizations to signal the pause.
— Never pad with filler — expand with substance.
`

export const VOICE_MODEL_EXAMPLE = `
"You ever just wake up already tired?
Like before your feet even hit the floor, your soul's already clocked out.
That's not normal. I know everyone says it is, but it's not.
You're not just tired. You're drained... 
It's that heavy, leaden feeling in your chest, like somebody's been slowly siphoning your life force through a tiny invisible straw for years.
And you've just accepted it as your new baseline."
`

export const NARRATION_OUTPUT_FORMAT = (effectiveDuration: number, targetWords: number) => `{
  "topic": "string",
  "audience": "string",
  "fullNarration": "string — verbatim join of all scene narration fields",
  "totalWordCount": ${targetWords},
  "scenes": [
    {
      "sceneNumber": 1,
      "id": "string",
      "preset": "hook | reveal | mirror | bridge | conclusion",
      "narration": "string",
      "wordCount": "number",
      "estimatedDuration": "number",
      "summary": "string",
      "cameraAction": "string",
      "imagePrompt": "string",
      "animationPrompt": "string"
    }
  ]
}`
