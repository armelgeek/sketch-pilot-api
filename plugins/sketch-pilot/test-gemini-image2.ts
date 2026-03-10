import { GoogleGenAI } from '@google/genai'
import * as dotenv from 'dotenv'

dotenv.config()

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

async function main() {
  const prompt = `2D clean vector cartoon in Crayon Capital style, consistent characters from reference, The Protagonist (Minimalist character with a round head, simple facial features, and stick-figure limbs. wearing A simple collared shirt and straight-leg pants.) stands, looking puzzled at a faint, shimmering 'dollar' sign far away on the horizon., A transparent, soft 'bubble' or 'box' labeled 'Comfort Zone' materializes around The Protagonist (Minimalist character with a round head, simple facial features, and stick-figure limbs. wearing A simple collared shirt and straight-leg pants.)., accurate Puzzled, then thoughtful and slightly resigned. expression, Plain white., consistent outfits, simple gradient lighting, medium outlines, cinematic framing, no text, no speech bubbles, 16:9.`

  try {
    console.log('Sending request...')
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ text: prompt }],
      config: {
        responseModalities: ['IMAGE']
      } as any
    })
    console.log('Response:', JSON.stringify(response, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

main()
