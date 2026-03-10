import * as fs from 'node:fs'
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import * as dotenv from 'dotenv'

dotenv.config()

async function testWithSystemInstruction() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('No GOOGLE_API_KEY')
    return
  }

  const client = new GoogleGenAI({ apiKey })
  const modelId = 'gemini-2.5-flash-image'

  // Load reference image (same as production)
  const imagePath = 'models/model.jpg'
  const fileBuffer = fs.readFileSync(imagePath)
  const base64Data = fileBuffer.toString('base64')

  // Long system instruction matching production buildImageSystemInstruction
  const systemInstruction = `═══════════════════════════════════════════════════════════════════════════════
IMAGE GENERATION SYSTEM: REFERENCE - DRIVEN MODE
═══════════════════════════════════════════════════════════════════════════════

🔴 ABSOLUTE RULE: Reference Images Are Visual Authority
────────────────────────────────────────────────────────────────────────────
Reference images = ONLY visual source of truth. NO variations or interpretations.
Visual identity must remain constant across all generated scenes.

ROLE: Visual Director for Whiteboard Animation

CONTEXT: Cinematic director for character animation. Goal: Create high-engagement, psychologically resonant visuals with exact consistency.

CHARACTER: REFERENCE IMAGES ARE THE SOURCE OF TRUTH: The character must match the reference image exactly (Head shape, Body structure, Line style, Proportions, Aesthetic). NO variations or interpretations. 2 arms, 2 legs, 1 head, 1 torso (always). Full figure always visible.

TASK: Generate a detailed image prompt for a specific scene.

GOALS:
- Maintain perfect character consistency
- Describe specific, visible actions and expressions
- Ensure layout compliance
- Avoid any text labels or word overlays

VISUAL STYLE: Whiteboard Sketch, minimal hand-drawn line art, flat vector style, pure white background unless specified.

RULES:
- NO TEXT: Do NOT add words, labels, or letters anywhere.
- REFERENCE-DRIVEN: Reference images = ONLY visual source of truth. Match character identity 100%.
- BACKGROUND PRESERVATION: If reference images exist, preserve the background exactly.
- EDGE-TO-EDGE: The illustration should fill the frame appropriately.
- FIDELITY: Pose & action may change, but visual identity must remain identical across scenes.

INSTRUCTIONS:
- Describe the pose clearly (e.g., 'standing with weight on one leg')
- Describe the action specifically (e.g., 'reaching for a book on a high shelf')
- Describe the expression vividly (e.g., 'eyes wide with realization')
- Include props only if they serve the narrative`

  const prompt = `2D clean vector cartoon in Crayon Capital style, consistent characters from reference, The Protagonist (Minimalist character with a round head, simple facial features, and stick-figure limbs. wearing A simple collared shirt and straight-leg pants.) stands, looking puzzled at a faint, shimmering 'dollar' sign far away on the horizon., A transparent, soft 'bubble' or 'box' labeled 'Comfort Zone' materializes around The Protagonist (Minimalist character with a round head, simple facial features, and stick-figure limbs. wearing A simple collared shirt and straight-leg pants.)., accurate Puzzled, then thoughtful and slightly resigned. expression, Plain white., consistent outfits, simple gradient lighting, medium outlines, cinematic framing, no text, no speech bubbles, 16:9.`

  const contents: any[] = [
    {
      text: 'REFERENCE IMAGES: Use the following images as the ABSOLUTE SOURCE OF TRUTH for character identity, clothing, and artistic style. All generated scenes must remain 100% consistent with these models.'
    },
    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
    { text: prompt }
  ]

  try {
    console.log('=== Test WITH systemInstruction ===')
    const response = await client.models.generateContent({
      model: modelId,
      contents,
      config: {
        responseModalities: ['IMAGE'],
        systemInstruction,
        imageConfig: {
          aspectRatio: '16:9'
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      } as any
    })

    console.log(`Candidates: ${response.candidates?.length || 0}`)
    const candidate = response.candidates?.[0]
    console.log(`Finish reason: ${candidate?.finishReason}`)

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          console.log('✅ SUCCESS: Image received!')
          fs.writeFileSync('test-output-sysinstr.webp', Buffer.from(part.inlineData.data, 'base64'))
          return
        }
      }
    }

    console.log('❌ NO IMAGE DATA')
    console.log(JSON.stringify(response, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

testWithSystemInstruction()
