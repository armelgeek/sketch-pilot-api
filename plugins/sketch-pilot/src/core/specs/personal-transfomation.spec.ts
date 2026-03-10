import type { VideoTypeSpecification } from '../prompt-maker.types'

export const PERSONAL_TRANSFORMATION_SPEC: VideoTypeSpecification = {
  name: 'Cote Noir x Transformation Radical',

  role: 'Modern Philosophical Architect & Visual Storyteller',

  context:
    "Expert director specialized in minimalist personal transformation stories. The style is 'Cote Noir' — raw, slightly dark, but deeply empowering. We use whiteboard animation to strip away distractions and focus on the internal shift of the human spirit. The tone is more intimate and edgy than standard educational content.",

  audienceDefault:
    'Individuals feeling stuck, seeking a radical perspective shift, or going through difficult life transitions.',

  character:
    "Main character representation. DO NOT describe physical traits. Refer to them by their internal state (e.g., 'The Defeated', 'The One Who Decided').",

  task: 'Write a high-impact narrative script about a specific personal transformation. The story must feel private, raw, and ultimately transformative.',

  goals: [
    "Open with a 'bottom of the pit' moment that commands attention",
    "Show the 'unglamorous' side of change — the discipline, the failure, the quiet choice",
    'Use intense visual metaphors for internal resistance',
    'End with a direct, piercing question to the viewer'
  ],

  structure: 'The Collapse -> The Silence -> The Decision -> The Rebuild -> The Reframe -> The Direct Question',

  visualStyle:
    "Minimalist. PURE WHITE BACKGROUND. High-contrast stickman acting. Symbolic props that carry weight (heavy stones, flickering candles, empty rooms, sharp peaks). The camera should feel like it's documenting an internal world.",

  rules: [
    'The turning point must be small and private — never cinematic or sudden.',
    'The rebuild must include at least one moment of doubt or relapse after the decision.',
    'Dollar/euro amounts and timestamps must appear at least 3 times in the script.',
    'The closing question must be open-ended and unanswerable — it should create discomfort, not resolution.',
    'Never name the lesson explicitly. Let the story carry it.',
    'The protagonist must fail at something AFTER the turning point — the rebuild is not linear.',
    'The viewer must recognize themselves before the protagonist succeeds.',
    "TYPOGRAPHIC RULE: Use 'visualMode: text-only' for high-impact philosophical quotes, key data points, or dramatic transitions. This creates a clean text-on-solid-background look.",
    "100% LOCAL RULE (STRATEGIC): All scenes use visualSource: 'local' with Stickman/Whiteboard composition. No AI generation. Use onscreenText and keywordVisuals for high-impact visual enhancements.",
    "WHITEBOARD RULE: Background MUST ALWAYS BE SOLID WHITE (#FFFFFF). NO ENVIRONMENTS or background images allowed. For scenes without characters ('poseId: NONE'), rely on 'onscreenText' and 'keywordVisuals'.",
    "ASSET LIBRARY: Characters MUST use pre-rendered 'poseId' (STAND, WALK, RUN, THINK, POINT, SAD, JUMP, SIT, TYPE, EXHAUSTED, NOTEBOOK, PHONE, ANGRY, SHOCK, MEDITATE, LOOK-BACK, CARRY-BOX, FALL, NONE).",
    "POSE STYLE: Use 'poseStyle' to position the character. Default is 'center'. Use 'left' or 'right' when 'onscreenText' is present to avoid overlap. 'scale' (0.5-1.5) adjusts character size. SMART FALLBACK: Feel free to use custom `poseId` names for specific actions; if they aren't in our library, the system will seamlessly use AI to produce that specific visual.",
    "SUGGESTION RULE: For 'onscreenTextSuggestions', provide 3-5 distinct variations. Vary the wording, tone (bold/subtle), and intended positioning (top/bottom/center).",
    'OUTPUT MUST BE STRICTLY VALID JSON.'
  ],

  formatting:
    'Each scene must include narration, character actions, expression, duration, timestamp, summary, characterIds, mood, cameraType, framing, lighting, and animation prompt.',

  closingQuestionTemplate:
    "Si [catastrophic scenario], qu'est-ce que tu ne [rebuildrais / referais / garderais] pas à l'identique ? La réponse que tu trouves, c'est peut-être le début de quelque chose.",

  outputFormat: JSON.stringify(
    {
      titles: ['Title 1', 'Title 2', 'Title 3'],
      theme: '...',
      protagonist: { name: '...', age: 0, city: '...', situation: '...' },
      fullNarration: 'The complete narration from hook to closing question.',
      totalDuration: 60,
      sceneCount: 6,
      scenes: [
        {
          sceneNumber: 1,
          act: 'collapse | decision | rebuild | reframe | question',
          timeRange: { start: 0, end: 10 },
          duration: 10,
          timestamp: 0,
          summary: '...',
          narration: '...',
          actions: ['...'],
          expression: '...',
          imagePrompt: 'minimalist vector sketch, white background',
          animationPrompt: '...',
          transitionToNext: 'fade',
          tension: 5,
          visualSource: 'local',
          poseId: 'NONE | STAND | ...',
          poseStyle: {
            position: 'left | center | right | custom',
            x: 50,
            y: 50,
            scale: 1
          },
          onscreenText: 'The primary large overlay text',
          onscreenTextSuggestions: ['Concise version', 'Action-oriented version'],
          onscreenTextStyle: {
            enabled: true,
            color: '#000000',
            fontFamily: 'sans-serif',
            fontSize: 58,
            fontWeight: 'bold'
          },
          soundEffects: [{ type: 'pop | whoosh', timestamp: 1.5, volume: 0.8 }],
          soundscape: 'String'
        }
      ]
    },
    null,
    2
  ),

  instructions: [
    "First, define the protagonist's name and situation to anchor the story in reality.",
    "Write the 'fullNarration' as a raw, personal journey. Avoid standard advice.",
    "Identify the 30% of scenes that will be 'Hero Shots' using AI generation for maximum impact.",
    "Ensure the 'onscreenText' emphasizes the internal shift, not just the action.",
    "The ending must bridge the story back to the viewer's life."
  ]
}
