import process from 'node:process'
import { GoogleGenAI } from '@google/genai'
import * as dotenv from 'dotenv'

dotenv.config()

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not configured')
    return
  }

  const client = new GoogleGenAI({ apiKey })

  try {
    console.log('Listing available models...')
    // In newer SDKs, listing models might be different. Let's try to see if it exists.
    // Based on @google/genai, it's models.list()
    const result = await (client as any).models.list()
    console.log('Models:', JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Error listing models:', error)
  }
}

listModels()
