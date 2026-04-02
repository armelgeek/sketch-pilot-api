export const PROVIDER_WPS: Record<string, number> = {
  kokoro: 2.45,
  openai: 2.37,
  gpt4o: 2.37,
  'gpt-4o': 2.37,
  elevenlabs: 2.1,
  azure: 2.2,
  google: 2.15
}

export const PROVIDER_SAFETY_FACTOR: Record<string, number> = {
  kokoro: 1.05,
  openai: 1.15,
  gpt4o: 1.15,
  'gpt-4o': 1.15,
  elevenlabs: 1.15,
  azure: 1.15,
  google: 1.15
}

export const DEFAULT_WPS = 2.37
export const DEFAULT_SAFETY_FACTOR = 1.05

export const EMOTION_CURVE = [
  'Start with curiosity',
  'Build identification',
  'Introduce doubt',
  'Create discomfort or fear',
  'End with empowerment or control'
]

export const NARRATIVE_ROLES = [
  'The Worker (execution, effort)',
  'The System (invisible rules)',
  'The Strategist (alternative behavior)'
]

export const PATTERN_INTERRUPTS = [
  'Break rhythm every 20–40 seconds with a short, unexpected sentence',
  'Use contrast in sentence length (long → very short)',
  'Insert sudden reframe phrases: "No.", "Wrong.", "In reality."',
  'Occasionally switch tone: analytical → emotional → blunt'
]

export const ANTI_BORING_RULES = [
  'Remove any sentence that does not add tension, insight, or emotion',
  'Avoid generic advice unless reframed in a contrarian way',
  'Prefer specific, visual, or extreme phrasing over neutral language'
]

export const POST_PROCESSING = [
  'Check that each scene contains a clear narrative function (tension, reveal, or shift)',
  'Insert punchlines where energy drops',
  'Ensure at least one major twist exists in the script',
  'Remove any flat or redundant explanation'
]

export const INTERNAL_CHECK = [
  'Is there a clear twist?',
  'Are there enough punchlines?',
  'Does each part increase tension?'
]

export const EXPANSION_RULES = [
  'If the input topic has fewer points than the target scene count, SPLIT each point into multiple sequential scenes (e.g., "Point 1: Setup", "Point 1: Expansion", "Point 1: Connection").',
  'DO NOT limit yourself to the number of paragraphs in the input. If the target is 20 scenes, produce exactly 20 scenes by diving deeper into the nuances of each point.',
  'ELABORATE: use the input sentences only as a SEED. Add sensory details, consequences, historical context, or specific metaphors to expand the narrative.',
  'CHAPTER BLOCKS: Group scenes into clusters that explore a single concept from multiple angles before moving to the next concept.'
]

export const CONCLUSION_RULES = [
  'Reframe the true objective of the topic',
  'Use a strong contrast to create memorability',
  'Project the viewer into the future (positive or negative)',
  'Include a metaphor or identity shift',
  'End with a sense of control or strategic advantage',
  'Avoid generic or soft endings'
]

export const SCENE_PRESETS: Record<string, { description: string; rules: string[] }> = {
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
}

export const ORCHESTRATION = [
  'First generate full narration',
  'Then split into scenes',
  'Assign a preset type to each scene (hook, reveal, mirror, bridge, conclusion)',
  'The LAST scene must ALWAYS be a conclusion',
  'Use a "bridge" scene ideally just before the conclusion to build final tension',
  'Each scene must visually represent its narration clearly',
  'Maintain continuity across scenes (location, action)'
]

export const PRESET_MIN_WORDS = {
  hook: 35,
  reveal: 55,
  mirror: 45,
  bridge: 30,
  conclusion: 40
}

export const PRESET_MIN_SENTENCES = {
  hook: 2,
  reveal: 3,
  mirror: 2,
  bridge: 2,
  conclusion: 2
}
