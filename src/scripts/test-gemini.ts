import process from 'node:process'
import * as dotenv from 'dotenv'
import { GeminiLLMService } from '../../plugins/sketch-pilot/src/services/llm/gemini-llm.service'

dotenv.config()

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not configured in .env')
    return
  }

  console.log('Testing Gemini LLM Service...')
  const gemini = new GeminiLLMService({
    provider: 'gemini',
    apiKey,
    modelId: 'gemini-2.5-flash'
  })

  try {
    const response = await gemini.generateContent('Say "Hello World" if you are working correctly.')
    console.log('✅ Gemini Response:', response)
  } catch (error) {
    console.error('❌ Gemini Error:', error)
  }
}

testGemini()
