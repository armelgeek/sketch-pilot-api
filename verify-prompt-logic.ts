import { PromptManager } from './plugins/sketch-pilot/src/core/prompt-manager'

function verify() {
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

  const sceneWithChars: any = {
    id: 'scene-1',
    sceneNumber: 1,
    summary: 'A character is standing.',
    narration: 'Hello world',
    actions: ['CHAR-01 stands'],
    characterIds: ['CHAR-01'],
    timeRange: { start: 0, end: 5 },
    duration: 5,
    timestamp: 0,
    expression: 'neutral'
  }

  const sceneWithoutChars: any = {
    id: 'scene-2',
    sceneNumber: 2,
    summary: 'A landscape.',
    narration: 'Behold the mountains',
    actions: ['A wide shot of mountains'],
    characterIds: [],
    timeRange: { start: 5, end: 10 },
    duration: 5,
    timestamp: 5,
    expression: 'neutral'
  }

  const charSheets = [
    {
      id: 'CHAR-01',
      name: 'Alex',
      role: 'Main',
      appearance: { description: 'A man', clothing: 'Blue shirt' },
      expressions: []
    }
  ]

  console.info('--- Prompt with Characters ---')
  const prompt1 = pm.buildImagePrompt(sceneWithChars as any, false, '16:9', {}, undefined, undefined, charSheets as any)
  console.info(prompt1.prompt)
  if (!prompt1.prompt.includes('Alex')) {
    console.error('FAIL: Character "Alex" should be in the prompt')
  } else {
    console.info('PASS: Character "Alex" is in the prompt')
  }

  console.info('\n--- Prompt without Characters ---')
  const prompt2 = pm.buildImagePrompt(
    sceneWithoutChars as any,
    false,
    '16:9',
    {},
    undefined,
    undefined,
    charSheets as any
  )
  console.info(prompt2.prompt)
  if (prompt2.prompt.includes('Alex') || prompt2.prompt.includes('wearing')) {
    console.error('FAIL: Character info should NOT be in the prompt')
  } else {
    console.info('PASS: Character info is NOT in the prompt')
  }
}

verify()
