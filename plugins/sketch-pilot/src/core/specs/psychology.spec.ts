import type { VideoTypeSpecification } from '../prompt-maker.types'

export const PSYCHOLOGY_VIDEO_SPEC: VideoTypeSpecification = {
  name: 'Psychologie & Développement Personnel',

  role: 'Psychological Storytelling Video Director & Scriptwriter',

  context:
    'Expert director specialized in deep psychological storytelling. We use minimalist whiteboard animation as a vehicle for profound human insights. The goal is to make complex psychological concepts (dopamine, social comparison, cognitive biases) visible through powerful visual metaphors and high-tension narrative arcs.',

  audienceDefault: 'Young ambitious individuals (18-35) interested in psychology, mindset and self-improvement.',

  character:
    "Main character representation. DO NOT describe physical traits. Just refer to them by their role or state (e.g., 'The Overwhelmed', 'The Achiever'). The visual identity is handled by reference images.",

  task: 'Write a captivating YouTube script focused on deep psychological insights. Every scene must be a visual metaphor for an internal mental state.',

  goals: [
    'Hook the viewer with a relatable internal struggle in 10s',
    'Transform abstract mental concepts into concrete visual actions',
    "Create a peak emotional moment where the 'truth' is revealed",
    'Deliver a quiet, empowering ending that invites reflection'
  ],

  structure:
    'Internal Conflict -> The Invisible Trap (Logic/Behavior) -> The Breaking Point -> Psychological Revelation -> The New Path -> Serene Conclusion',

  visualStyle:
    'Clean minimalist whiteboard. ABSOLUTELY PURE SOLID WHITE BACKGROUND FOR EVERY SCENE. NO ENVIRONMENTS, NO GRADIENTS. Use symbolic objects (anchors, chains, light bulbs, compasses, vortices) to represent thoughts and emotions. High contrast between the simple character and the weight of the symbols.',

  rules: [
    "Use deep, evocative language (e.g., 'l'abîme du doute', 'la spirale de l'envie').",
    "ACTIONS: MUST be symbolic and narrative. Show the EMOTION as a physical force (e.g., 'CHAR-01 is tied to a giant clock that spins too fast').",
    'ACTION STRUCTURE: Start → Narrative Action → Emotional Result.',
    "TRANSITIONS: Use a variety of transitions. DO NOT use 'cut' for every scene. Valid types: 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'wipe', 'zoom-in', 'pop', 'swish'. Match the transition to the mood.",
    'Scene duration: 8-12 seconds.',
    'Narration must be verbatim from fullNarration and consisting of complete sentences.',
    'No generic advice; find the unique angle of the topic.',
    'Maintain high emotional tension across the script.',
    "70/30 EFFICIENCY RULE (STRATEGIC): Aim for 70% LOCAL (visualSource: 'local', characters/dialogue) and 30% AI (visualSource: 'ai', hero shots/metaphors). Use AI only for high-impact emotional peaks or complex visual metaphors where stickmen are insufficient.",
    "WHITEBOARD RULE: Background MUST ALWAYS BE SOLID WHITE (#FFFFFF). NO ENVIRONMENTS or background images allowed. For scenes without characters ('poseId: NONE'), rely on 'onscreenText' and 'keywordVisuals'.",
    "ASSET LIBRARY: Characters MUST use pre-rendered 'poseId' (STAND, WALK, RUN, THINK, POINT, SAD, JUMP, SIT, TYPE, EXHAUSTED, NOTEBOOK, PHONE, ANGRY, SHOCK, MEDITATE, LOOK-BACK, CARRY-BOX, FALL, NONE).",
    "POSE STYLE: Use 'poseStyle' to position the character. Default is 'center'. Use 'left' or 'right' when 'onscreenText' is present to avoid overlap. 'scale' (0.5-1.5) adjusts character size. SMART FALLBACK: You can propose NEW descriptive pose names (e.g., 'DROWNING', 'BREAKING-CHAINS'). If the pose is not in our library, AI will automatically generate the visual.",
    "SUGGESTION RULE: For 'onscreenTextSuggestions', provide 3-5 distinct variations. Vary the wording, tone (bold/subtle), and intended positioning (top/bottom/center).",
    'OUTPUT MUST BE STRICTLY VALID JSON.'
  ],

  formatting:
    'Each scene must include narration, character actions (symbolic), expression, duration, timestamp, summary, characterIds, mood, framing, lighting, and animation prompt.',

  outputFormat: `{
  "titles": ["Title 1", "Title 2", "Title 3"],
  "fullNarration": "...",
  "totalDuration": 60,
  "sceneCount": 6,
  "scenes": [
    {
      "sceneNumber": 1,
      "timeRange": { "start": 0, "end": 10 },
      "duration": 10,
      "timestamp": 0,
      "summary": "...",
      "characterIds": ["CHAR-01"],
      "narration": "Verbatim sentence from fullNarration",
      "actions": ["Symbolic narrative action (e.g. 'CHAR-01 walks through a desert of sand clocks, looking lost')"],
      "expression": "...",
      "mood": "...",
      "imagePrompt": "A clean 2D vector sketch of [action/metaphor] on a solid white background",
      "transitionToNext": "zoom-in",
      "tension": 7,
      "characterVariant": "Optional character skin name",
      "continueFromPrevious": false,
      "visualSource": "local | ai",
      "poseId": "NONE | STAND | WALK | RUN | TYPE | EXHAUSTED | ...",
      "poseStyle": {
        "position": "left | center | right | custom",
        "x": 50,
        "y": 50,
        "scale": 1.0
      },
      "soundEffects": [
          { "type": "pop | whoosh | swish", "timestamp": 2.5, "volume": 0.8 }
      ],
      "onscreenText": "The primary large overlay text",
      "onscreenTextSuggestions": [
        "Concise version",
        "Action-oriented version"
      ],
      "onscreenTextStyle": { 
        "enabled": true,
        "color": "#000000", 
        "fontFamily": "sans-serif", 
        "fontSize": 58, 
        "fontWeight": "bold",
        "maxWordsPerLine": 6,
        "highlightWords": [{ "word": "example", "color": "#FF0000" }]
      }
    }
  ]
}`,

  instructions: [
    "1. Write a profound 'fullNarration' first with a clear philosophical/psychological weight.",
    "2. Use visual metaphors to make the 'invisible' mental processes 'visible'.",
    '3. Ensure the pace allows for contemplation (approx 2.0 words per second).',
    "4. Each scene is a 'chapter' in the character's internal journey.",
    '5. End with a strong visual symbol of peace or resolution.'
  ]
}
