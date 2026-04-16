import { buildVisualPrompt } from './visual-engine'

export async function generateSceneImages({ scenes, registry, imageModel }: any) {
  const results = []

  let prevScene = null

  for (const scene of scenes) {
    const prompt = buildVisualPrompt(registry, scene, prevScene)

    const image = await imageModel.generate({
      prompt
    })

    results.push({
      sceneId: scene.id,
      prompt,
      image
    })

    prevScene = scene
  }

  return results
}
