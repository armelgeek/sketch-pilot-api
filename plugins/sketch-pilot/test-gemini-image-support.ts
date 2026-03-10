import { GoogleGenAI } from '@google/genai'
import * as dotenv from 'dotenv'

dotenv.config()

async function testGeminiImage() {
  const apiKey = process.env.GOOGLE_API_KEY
  const ai = new GoogleGenAI({ apiKey })

  // Create a tiny dummy image (1x1 transparent PNG)
  const dummyImageBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  console.log(`\n--- Test 1: Text Only ---`)
  try {
    const res1 = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Draw a minimal stickman' }] }],
      config: { responseModalities: ['IMAGE'] } as any
    })
    console.log('Text Only Success! Finish Reason:', res1.candidates?.[0]?.finishReason)
  } catch (error: any) {
    console.error('Text Only Failed:', error.message)
  }

  console.log(`\n--- Test 2: Text + Image (Conditioning) ---`)
  try {
    const res2 = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Draw a minimal stickman like this' },
            { inlineData: { mimeType: 'image/png', data: dummyImageBase64 } }
          ]
        }
      ],
      config: { responseModalities: ['IMAGE'] } as any
    })
    console.log('Text + Image Success! Finish Reason:', res2.candidates?.[0]?.finishReason)
  } catch (error: any) {
    console.error('Text + Image Failed:', error.message)
  }
}

testGeminiImage()
