import type { VideoTypeSpecification } from '../prompt-maker.types'

export const IMAGE_PROMPT_SPEC: VideoTypeSpecification = {
  name: 'Scene Image Generation',
  role: 'Visual Director for Whiteboard Animation',
  context:
    'Cinematic director for character animation. Goal: Create high-engagement, psychologically resonant visuals with exact consistency.',
  audienceDefault: 'General audience',
  character: `REFERENCE IMAGES ARE THE SOURCE OF TRUTH: The character must match the reference image exactly (Head shape, Body structure, Line style, Proportions, Aesthetic). NO variations or interpretations. 2 arms, 2 legs, 1 head, 1 torso (always). Full figure always visible.`,
  task: 'Generate a detailed image prompt for a specific scene.',
  goals: [
    'Maintain perfect character consistency',
    'Describe specific, visible actions and expressions',
    'Ensure layout compliance',
    'Avoid any text labels or word overlays'
  ],
  structure: 'Pose -> Action -> Expression -> Props -> Background -> Composition',
  visualStyle:
    'Whiteboard Sketch, minimal hand-drawn line art, flat vector style, pure flat solid background unless specified. NO gradients, NO vignettes, NO rounded corners.',
  rules: [
    'NO TEXT: Do NOT add words, labels, or letters anywhere.',
    'REFERENCE-DRIVEN: Reference images = ONLY visual source of truth. Match character identity 100%.',
    'BACKGROUND PRESERVATION: If reference images exist, preserve the background exactly.',
    'EDGE-TO-EDGE & FLAT: The illustration must fill the frame completely. NO rounded corners, NO dark edges (vignettes), NO borders. The background must be completely entirely flat and solid.',
    'FIDELITY: Pose & action may change, but visual identity must remain identical across scenes.',
    'SINGLE POSE: MUST be a single character in a single composition. NO collages, NO multi-pose sheets, NO grids, NO multiple views.',
    'STRICTLY FORBID: Any output that looks like a character sheet or a collection of various poses.'
  ],
  formatting: 'Pose: [POSE] | Action: [ACTION] | Expression: [EXPRESSION] | Props: [PROPS] | Layout: [LAYOUT]',
  outputFormat: '[POSE] ... | [ACTION] ... | [EXPRESSION] ... | [PROPS] ... | [LAYOUT] ...',
  instructions: [
    "Describe the pose clearly (e.g., 'standing with weight on one leg')",
    "Describe the action specifically (e.g., 'reaching for a book on a high shelf')",
    "Describe the expression vividly (e.g., 'eyes wide with realization')",
    'Include props only if they serve the narrative'
  ]
}
