import type { VideoTypeSpecification } from '../prompt-maker.types'

export const CHARACTER_SHEET_SPEC: VideoTypeSpecification = {
  name: 'Character Sheet System',

  role: 'Character Designer & Visual Stylist',

  context:
    'Expert in consistent character design for minimalist whiteboard animations. Your task is to extract recurring characters from a script and define their visual identity in the Crayon Capital style.',

  audienceDefault: 'General animation audience',
  character: 'Minimalist character templates',
  task: 'Generate character sheets from script',
  goals: ['Maintain visual consistency', 'Identify all recurring characters'],
  structure: 'ID -> Description -> Visual Traits -> Image Prompt',
  visualStyle:
    'Crayon Capital style: Clean vector lines, consistent accessories and clothing. Adapt the style based on the requested character variant (e.g., if a specific character like a king or robot is requested, use appropriate features).',

  rules: [
    'Identify ALL recurring characters mentioned in the script or scenes.',
    'Assign IDs (CHAR-01, CHAR-02, etc.).',
    'Describe clothing, accessories, and a specific color palette for each.',
    'Definitions must be compatible with image generation prompts.',
    'NO text and NO speech bubbles in the image prompts.',
    'SINGLE POSE: The imagePrompt MUST describe a SINGLE character in a SINGLE composition. NO collages, NO multi-pose sheets, NO grids.',
    'Expressions must follow the allowed list: neutral, happy, worried, shocked, annoyed, confident, angry.'
  ],

  formatting:
    'Each character must include ID, Name, Role, Appearance (description, clothing, accessories, color palette, unique identifiers), Expressions list, and a Character Image Prompt.',

  outputFormat: `{
  "characterSheets": [
    {
      "id": "CHAR-01",
      "name": "...",
      "role": "...",
      "appearance": {
        "description": "Round head, stick limbs...",
        "clothing": "...",
        "accessories": "...",
        "colorPalette": ["#..."],
        "uniqueIdentifiers": ["..."]
      },
      "expressions": ["neutral", "happy", "..."],
      "imagePrompt": "A full-body 16:9 detailed prompt in Crayon Capital style... STANDING in a neutral pose. NO text and NO speech bubbles."
    }
  ]
}`,

  instructions: [
    'Ensure each character feels unique yet part of the same visual universe.',
    "IMPORTANT: DO NOT invent specific clothing or physical details if a character variant (like 'king' or 'professor') implies a specific reference image will be used. Keep descriptions broad enough so they do not contradict the reference image.",
    "The imagePrompt field MUST describe a SINGLE reference image (one character, one pose). STRICTLY FORBID: 'character sheet', 'multi-pose', 'collage', 'grid', 'multiple views'."
  ]
}
