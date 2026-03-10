import { GoogleGenAI } from '@google/genai'
import * as dotenv from 'dotenv'

dotenv.config()

async function testImagen() {
  const apiKey = process.env.GOOGLE_API_KEY // Changed to GOOGLE_API_KEY
  if (!apiKey) {
    console.error('No GOOGLE_API_KEY found in .env')
    return
  }

  const ai = new GoogleGenAI({ apiKey })

  // Test both possible image models
  const models = ['imagen-3.0-generate-001', 'gemini-2.5-flash']

  for (const modelId of models) {
    console.log(`\nTesting model: ${modelId}`)
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: 'Draw a minimal stickman' }] }],
        config: {
          responseModalities: ['IMAGE']
        } as any
      })

      console.log('Success! Candidates:', response.candidates?.length)
      if (response.candidates && response.candidates.length > 0) {
        console.log('Finish Reason:', response.candidates[0].finishReason)
        if (response.candidates[0].content && response.candidates[0].content.parts) {
          const hasImage = response.candidates[0].content.parts.some((p) => p.inlineData)
          console.log('Has Image:', hasImage)
        }
      }
    } catch (error: any) {
      console.error(`Failed with ${modelId}:`, error.message)
    }
  }
}

testImagen()
