import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'

import { VideoGeneratorFactory } from '../core/generators/video-generator.factory.js'
import { VideoScriptGenerator } from '../core/video-script-generator.js'
import { LLMServiceFactory } from '../services/llm/index.js'
import { videoGenerationOptionsSchema } from '../types/video-script.types.js'

dotenv.config()

async function runQuotesTest() {
  console.log('🧪 RUNNING QUOTES VIDEO GENERATION TEST (AI-POWERED)...\n')

  try {
    // 1. Setup LLM
    const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || ''
    const provider = 'openai'

    if (!apiKey) {
      console.error('❌ FAIL: No API key found in .env (OPENAI_API_KEY or GEMINI_API_KEY)')
      return
    }

    console.log(`[1/4] Initializing LLM (${provider})...`)
    const llmService = await LLMServiceFactory.create({
      provider: provider as any,
      apiKey
    })

    // 2. Setup Generator (QUOTES MODE)
    console.log('[2/4] Initializing Quotes Generator...')

    const mockSpec = {
      name: 'Stoic Wisdom',
      role: 'Stoic Philosopher',
      context: 'Teaching ancient wisdom for modern life.',
      task: 'Generate a short philosophical script.',
      audienceDefault: 'Seekers of wisdom',
      goals: ['Inspiration', 'Reflection'],
      structure: ['Quote', 'Context', 'Application']
    }

    const generator = VideoGeneratorFactory.create({ scriptSpec: mockSpec as any }, { isQuotes: true })
    const scriptGenerator = new VideoScriptGenerator(llmService, generator)

    // 3. Generate Script
    console.log('[3/4] Generating Quotes script (Topic: Pensées de Marc Aurèle sur le temps)...')
    const options = videoGenerationOptionsSchema.parse({
      duration: 15,
      aspectRatio: '9:16', // Typical for social media quotes
      language: 'french'
    })

    const script = await scriptGenerator.generateCompleteScript(
      'Pensées de Marc Aurèle sur le temps et la fugacité de la vie',
      options
    )

    // 4. Output Result
    console.log('\n=================================================')
    console.log('✅ GENERATION SUCCESSFUL')
    console.log('=================================================\n')

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const logsDir = path.join(__dirname, '../../tests/logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    const logFile = path.join(logsDir, 'quotes-output.json')
    fs.writeFileSync(logFile, JSON.stringify(script, null, 2))

    console.log(`--- OUTPUT SAVED TO ${logFile} ---`)
    console.log('-------------------\n')

    if (script.quotesMetadata) {
      console.log('✨ Quotes Metadata matches expected structure.')
      console.log('Author:', script.quotesMetadata.author)
      console.log('School:', script.quotesMetadata.philosophicalSchool)
    } else {
      console.warn('⚠️ Warning: No quotesMetadata found in output.')
    }
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

runQuotesTest().catch(console.error)
