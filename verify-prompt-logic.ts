import { PromptManager } from './plugins/sketch-pilot/src/core/prompt-manager.ts'

async function verify() {
  const pm = new PromptManager({
    scriptSpec: {
      name: 'Test',
      role: 'Test Role',
      context: 'Test Context',
      audienceDefault: 'Test Audience',
      task: 'Test Task',
      goals: [],
      structure: '',
      rules: [],
      formatting: '',
      outputFormat: '',
      instructions: []
    }
  })

  // Verify WPS and Safety Factor
  const options: any = { audioProvider: 'kokoro' }
  const wps = pm.getWordsPerSecond(options)
  const safety = pm.getPublicSafetyFactor(options)

  console.info(`Kokoro WPS: ${wps} (Expected: 2.2)`)
  console.info(`Kokoro Safety Factor: ${safety} (Expected: 1.0)`)

  if (wps !== 2.2) console.error('FAIL: WPS should be 2.2')
  if (safety !== 1) console.error('FAIL: Safety Factor should be 1.0')

  const sceneWithChars: any = {
    id: 'scene-1',
    sceneNumber: 1,
    summary: 'A character is standing.',
    narration: 'Hello world',
    characterIds: ['CHAR-01'],
    duration: 5,
    timestamp: 0
  }

  console.info('\n--- Image Prompt Generation ---')
  const prompt1 = await pm.buildImagePrompt(sceneWithChars as any, false, '16:9')
  console.info('Prompt:', prompt1.prompt)

  if (prompt1.prompt) {
    console.info('PASS: Image prompt generated successfully')
  } else {
    console.error('FAIL: Image prompt is empty')
  }

  console.info('\n--- System Prompt Narration Instructions ---')
  const systemPrompt = await pm.buildScriptSystemPrompt(options)
  if (systemPrompt.includes('2.20 words/second')) {
    console.info('PASS: System prompt contains correct WPS')
  } else {
    console.error('FAIL: System prompt does not contain correct WPS')
  }

  if (systemPrompt.includes('FAVOR SHORT, PUNCHY SENTENCES')) {
    console.info('PASS: System prompt contains new pacing instructions')
  } else {
    console.error('FAIL: System prompt missing new pacing instructions')
  }
}

verify().catch(console.error)
