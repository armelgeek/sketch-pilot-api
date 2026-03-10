import { PromptManager } from './src/core/prompt-manager'
import type { EnrichedScene } from './src/types/video-script.types'

async function verifyPrompts() {
  console.log('Verifying Image Prompt Consistency...')

  const pm = new PromptManager()
  const scene: EnrichedScene = {
    id: 'scene-1',
    sceneNumber: 1,
    narration: 'Le roi se tient fièrement devant son trône.',
    actions: ['The king standing proudly', 'The king wearing a crown'],
    expression: 'confident',
    timeRange: { start: 0, end: 10 },
    duration: 10,
    summary: 'The king on his throne'
  } as any

  // Test case 1: With reference images (should not contain "faceless")
  const promptWithRef = pm.buildImagePrompt(scene, true)
  console.log('\n--- Prompt WITH Reference Images ---')
  console.log(promptWithRef.prompt)

  if (promptWithRef.prompt.includes('faceless')) {
    console.log("❌ FAILURE: Prompt contains 'faceless' but has reference images.")
  } else if (promptWithRef.prompt.includes('consistent characters from reference')) {
    console.log('✅ SUCCESS: Prompt uses reference-driven character description.')
  } else {
    console.log('❌ FAILURE: Prompt missing reference-driven description.')
  }

  // Test case 2: Without reference images (should contain "minimal character with simple facial features")
  const promptWithoutRef = pm.buildImagePrompt(scene, false)
  console.log('\n--- Prompt WITHOUT Reference Images ---')
  console.log(promptWithoutRef.prompt)

  if (promptWithoutRef.prompt.includes('faceless')) {
    console.log("❌ FAILURE: Prompt still contains 'faceless'.")
  } else if (promptWithoutRef.prompt.includes('minimal character with simple facial features')) {
    console.log('✅ SUCCESS: Prompt uses the new default description.')
  } else {
    console.log('❌ FAILURE: Prompt missing new default description.')
  }
}

verifyPrompts()
