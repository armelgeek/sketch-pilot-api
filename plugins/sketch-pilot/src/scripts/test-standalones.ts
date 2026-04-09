import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'

import { VideoGeneratorFactory } from '../core/generators/video-generator.factory.js'
import { VideoScriptGenerator } from '../core/video-script-generator.js'
import { LLMServiceFactory } from '../services/llm/index.js'
import { videoGenerationOptionsSchema } from '../types/video-script.types.js'

dotenv.config()

async function runStandaloneTest() {
  console.log('🧪 RUNNING STANDALONE VIDEO GENERATION TEST (AI-POWERED)...\n')

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

    // 2. Setup Generator
    console.log('[2/4] Initializing Standalone Generator...')

    const mockSpec = {
      name: 'Educational Explainer',
      role: 'Expert Tutor',
      context: 'Science education for kids.',
      task: 'Explain a complex topic simply.',
      audienceDefault: 'Children aged 8-12',
      goals: ['Engagement', 'Clarity'],
      structure: ['Hook', 'Main Concept', 'Example', 'Summary']
    }

    const generator = VideoGeneratorFactory.create({ scriptSpec: mockSpec as any })
    const scriptGenerator = new VideoScriptGenerator(llmService, generator)

    // 3. Generate Script
    console.log('[3/4] Generating Standalone script (Topic: Why is the sky blue?)...')
    const options = videoGenerationOptionsSchema.parse({
      duration: 15,
      aspectRatio: '16:9',
      language: 'french'
    })

    const script = await scriptGenerator.generateCompleteScript('Pourquoi le ciel est-il bleu ?', options)

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
    const logFile = path.join(logsDir, 'standalone-output.json')
    fs.writeFileSync(logFile, JSON.stringify(script, null, 2))

    console.log(`--- OUTPUT SAVED TO ${logFile} ---`)
    console.log('-------------------\n')
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

runStandaloneTest().catch(console.error)
