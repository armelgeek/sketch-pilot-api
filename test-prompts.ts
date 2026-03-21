import { PromptManager } from './plugins/sketch-pilot/src/core/prompt-manager'
import { SceneMemoryBuilder } from './plugins/sketch-pilot/src/core/scene-memory'

const script = {
  scenes: [
    {
      id: 'scene-1',
      location: 'A futuristic lab',
      timeOfDay: 'Morning',
      action: 'Eleanor is standing, looking at a glowing orb.',
      characterIds: ['eleanor_id'],
      cameraAngle: 'Medium shot',
      weather: 'Clear'
    },
    {
      id: 'scene-2',
      action: 'Eleanor holds the orb up to the light, smiling.',
      characterIds: ['eleanor_id'],
      cameraAngle: 'Close up'
    },
    {
      id: 'scene-3',
      location: 'Outside the lab',
      action: 'Eleanor is running away.',
      characterIds: ['eleanor_id'],
      weather: 'Raining'
    },
    {
      id: 'scene-4',
      action: 'A glowing orb is pulsing on a pedestal.',
      characterIds: [],
      cameraAngle: 'Wide shot'
    }
  ],
  characterSheets: [
    {
      id: 'eleanor_id',
      name: 'Eleanor',
      imagePrompt:
        'A 30-year-old female scientist, wearing a white lab coat over a blue shirt, with short black hair and round glasses.'
    }
  ]
}

const promptManager = new PromptManager()
const memoryBuilder = new SceneMemoryBuilder()
const memoryStates = (memoryBuilder as any).buildTimeline
  ? (memoryBuilder as any).buildTimeline(script.scenes)
  : (memoryBuilder as any).build
    ? (memoryBuilder as any).build(script.scenes)
    : []

for (let i = 0; i < script.scenes.length; i++) {
  const scene = script.scenes[i]
  const memory = memoryStates[i]

  // Extraire la description du personnage correspondant
  let styleParams = undefined
  if (scene.characterIds && scene.characterIds.length > 0) {
    const char = script.characterSheets.find((c) => c.id === scene.characterIds[0])
    if (char) {
      styleParams = {
        style: char.imagePrompt,
        gender: 'female',
        age: '30',
        role: 'scientist',
        subjectDescription: char.imagePrompt
      }
    }
  }

  const result = promptManager.buildImagePrompt(scene as any, true, '16:9', styleParams as any, memory)
  console.info(`\n--- SCENE ${i + 1}: ${scene.id} ---`)
  console.info(result.prompt)
}
