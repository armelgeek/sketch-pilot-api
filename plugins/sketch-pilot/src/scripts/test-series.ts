import * as dotenv from 'dotenv'
import { VideoGeneratorFactory } from '../core/generators/video-generator.factory.js'
import { VideoScriptGenerator } from '../core/video-script-generator.js'
import { LLMServiceFactory } from '../services/llm/index.js'
import { videoGenerationOptionsSchema } from '../types/video-script.types.js'

dotenv.config()

async function runRealSeriesTest() {
  console.log('🧪 RUNNING REAL SERIES GENERATION TEST (AI-POWERED)...\n')

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

    // 2. Setup Series Context (SEASON FINALE)
    console.log('[2/4] Initializing Series Generator for Series Finale (Episode 10)...')
    const seriesContext = {
      seriesId: 'saga-mystery-forest',
      episodeNumber: 1,
      totalEpisodes: 3, // Enable total count
      previousEpisodesContext: '',
      characterRegistry: {
        'Detective Sinclair': {
          description: 'Worn-out brown coat, silver hair, looking determined.',
          modelId: 'sinclair-v1' // Manual Casting
        }
      }
    }

    const mockSpec = {
      name: 'Mystery Storytelling',
      role: 'Mystery Writer',
      context: 'Victorian detective mystery.',
      task: 'Generate a script.',
      audienceDefault: 'Mystery fans',
      goals: ['Building suspense', 'Character development'],
      structure: ['Hook', 'Investigation', 'Cliffhanger']
    }

    const generator = VideoGeneratorFactory.create({ scriptSpec: mockSpec as any }, seriesContext)
    const scriptGenerator = new VideoScriptGenerator(llmService, generator)

    // 3. Generate Script
    console.log('[3/4] Generating Episode 1 script (Topic: The Bakery Investigation)...')
    const options = videoGenerationOptionsSchema.parse({
      duration: 15, // Very short for verification
      aspectRatio: '16:9',
      language: 'french',
      qualityMode: 'high-quality'
    })

    const script = await scriptGenerator.generateCompleteScript(
      'Enquête à la boulangerie après la découverte du médaillon',
      options
    )

    // 4. Output Result
    console.log('\n=================================================')
    console.log('✅ GENERATION SUCCESSFUL')
    console.log('=================================================\n')

    console.log('--- OUTPUT JSON ---')
    console.log(JSON.stringify(script, null, 2))
    console.log('-------------------\n')

    if (script.seriesMetadata) {
      console.log('✨ Episodic Metadata matches expected structure.')
    } else {
      console.warn('⚠️ Warning: No seriesMetadata found in output.')
    }
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

runRealSeriesTest().catch(console.error)
