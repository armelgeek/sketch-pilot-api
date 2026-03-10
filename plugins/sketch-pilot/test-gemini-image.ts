import * as fs from 'node:fs'
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import * as dotenv from 'dotenv'

dotenv.config()

async function testGeminiDirectly() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('No GOOGLE_API_KEY found in .env')
    return
  }

  const client = new GoogleGenAI({ apiKey })
  const modelId = 'gemini-2.5-flash-image'

  const imagePath = 'models/model.jpg'
  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found at ${imagePath}`)
    return
  }

  const fileBuffer = fs.readFileSync(imagePath)
  const base64Data = fileBuffer.toString('base64')

  // Test base64 string
  console.log(`Base64 length: ${base64Data.length}`)
  console.log(`Base64 start: ${base64Data.slice(0, 20)}`)

  const contents: any[] = [
    {
      text: 'REFERENCE IMAGES: Use the following images as the ABSOLUTE SOURCE OF TRUTH for character identity, clothing, and artistic style. All generated scenes must remain 100% consistent with these models.'
    },
    { inlineData: { mimeType: 'image/jpg', data: base64Data } },
    {
      text: `2D clean vector cartoon in Crayon Capital style, consistent characters from reference, The Protagonist (Minimalist character with a round head, simple facial features, and stick-figure limbs. wearing A simple collared shirt and straight-leg pants.) stands, looking puzzled at a faint, shimmering 'dollar' sign far away on the horizon., A transparent, soft 'bubble' or 'box' labeled 'Comfort Zone' materializes around The Protagonist (Minimalist character with a round head, simple facial features, and stick-figure limbs. wearing A simple collared shirt and straight-leg pants.)., accurate Puzzled, then thoughtful and slightly resigned. expression, Plain white., consistent outfits, simple gradient lighting, medium outlines, cinematic framing, no text, no speech bubbles, 16:9.`
    }
  ]

  try {
    console.log('Calling Gemini API...')
    const response = await client.models.generateContent({
      model: modelId,
      contents,
      config: {
        responseModalities: ['IMAGE'],
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

    console.log(`Raw response received. Candidates: ${response.candidates?.length || 0}`)

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0]
      console.log(`Candidate 0 finish reason: ${candidate.finishReason}`)

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            console.log('SUCCESS: Image data received!')
            fs.writeFileSync('test-output.webp', Buffer.from(part.inlineData.data, 'base64'))
            return
          }
        }
      }
    }

    console.log('API call completed, but no image data isolated.')
    console.log(JSON.stringify(response, null, 2))
  } catch (error) {
    console.error('API Error:')
    console.dir(error, { depth: null })
  }
}

testGeminiDirectly()
