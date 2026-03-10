import * as fs from 'node:fs'
import * as path from 'node:path'
import { VideoAssembler } from '../src/services/video/video-assembler.service'
import type { CompleteVideoScript } from '../src/types/video-script.types'

async function runTest() {
  const testDir = path.join(__dirname, '..', 'output', 'test-assembly')
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true })
  fs.mkdirSync(testDir, { recursive: true })

  const scenesDir = path.join(testDir, 'scenes')
  fs.mkdirSync(scenesDir)

  console.log('Creating dummy assets...')

  // Create 3 dummy scenes
  const scenes = []
  for (let i = 1; i <= 3; i++) {
    const sceneId = `scene_${i}`
    const sceneDir = path.join(scenesDir, sceneId)
    fs.mkdirSync(sceneDir)

    // Skip creating dummy images - they're not needed for assembly test
    // The VideoAssembler can handle missing images or accept pre-existing ones

    // Create dummy "audio" (using ffmpeg via VideoAssembler? No, let's just create an empty file and mock duration or assume default)
    // Actually, let's try to run without audio for now, or assume default duration.
    // We can create a dummy mp3 if needed, but existing logic handles missing audio.

    scenes.push({
      id: sceneId,
      visualDescription: `Scene ${i}`,
      narration: `Narration ${i}`,
      imagePrompt: `Image ${i}`
    })
  }

  const script: CompleteVideoScript = {
    title: 'Test Video',
    totalDuration: 15,
    sceneCount: 3,
    scenes: scenes.map((s, idx) => {
      const i = idx + 1
      return {
        id: s.id,
        sceneNumber: i,
        timeRange: { start: (i - 1) * 5, end: i * 5 },
        narration: s.narration,
        actions: [],
        expression: 'neutral',
        imagePrompt: s.imagePrompt,
        animationPrompt: i === 1 ? 'Zoom in' : i === 2 ? 'Pan right' : 'Shake',
        cameraAction: {
          type: i === 1 ? 'zoom-in' : i === 2 ? 'pan-right' : 'shake',
          intensity: 'medium'
        },
        visualDensity: 'medium'
      } as any
    })
  }

  const assembler = new VideoAssembler()

  console.log('Testing Panning Mode...')
  try {
    const result = await assembler.assembleVideo(script, scenesDir, testDir, 'panning', options)
    console.log('Panning Result:', result)
    if (fs.existsSync(result)) console.log('SUCCESS: Panning video created.')
    else console.error('FAILURE: Panning video not found.')
  } catch (error) {
    console.error('Panning Test Failed:', error)
  }

  // TODO: Test AI Mode (requires existing video files)
}

runTest()
