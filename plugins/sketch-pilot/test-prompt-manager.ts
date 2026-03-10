import { PromptManager } from './src/core/prompt-manager'
import type { VideoGenerationOptions } from './src/types/video-script.types'

async function testPromptManager() {
  console.log('Testing PromptManager with PromptMaker...')

  const pm = new PromptManager()
  const options: VideoGenerationOptions = {
    duration: 60,
    videoType: 'psychology',
    language: 'fr-FR'
  }

  const topic = "Comment l'effet placebo fonctionne réellement"

  try {
    const userPrompt = pm.buildScriptUserPrompt(topic, options)
    console.log('\n--- Generated User Prompt (excerpt) ---')
    console.log(`${userPrompt.slice(0, 500)}...`)

    if (userPrompt.includes('[RÔLE]') && userPrompt.includes(topic)) {
      console.log('\n✅ SUCCESS: Prompt contains expected sections and topic.')
    } else {
      console.log('\n❌ FAILURE: Prompt is missing expected sections.')
    }

    const systemPrompt = pm.buildScriptSystemPrompt(options)
    console.log('\n--- Generated System Prompt (excerpt) ---')
    console.log(`${systemPrompt.slice(0, 300)}...`)
  } catch (error) {
    console.error('\n❌ ERROR during test:', error)
  }
}

testPromptManager()
