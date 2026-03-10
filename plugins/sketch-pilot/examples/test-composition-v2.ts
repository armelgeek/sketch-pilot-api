import * as fs from 'node:fs'
import * as path from 'node:path'
import sharp from 'sharp'
import { VideoAssembler } from '../src/services/video/video-assembler.service'
import type { CompleteVideoScript } from '../src/types/video-script.types'

async function testComposition() {
  const testDir = path.join(__dirname, '..', 'output', 'test-composition')
  const scenesDir = path.join(testDir, 'scenes')
  const sceneId = 'scene_1'
  const sceneDir = path.join(scenesDir, sceneId)

  if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true })

  console.log('Creating mock assets...')

  // 1. Create Background (1920x1080 solid blue)
  const bgPath = path.join(sceneDir, 'background.png')
  await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 100, g: 150, b: 200 }
    }
  })
    .png()
    .toFile(bgPath)

  // 2. Create Asset 1 (Red square)
  const asset1Path = path.join(sceneDir, 'asset_0.png')
  await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 }
    }
  })
    .png()
    .toFile(asset1Path)

  // 3. Create Asset 2 (Green circle - mock)
  const asset2Path = path.join(sceneDir, 'asset_1.png')
  await sharp({
    create: {
      width: 300,
      height: 300,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 }
    }
  })
    .png()
    .toFile(asset2Path)

  // 4. Create Manifest
  const manifest = {
    id: sceneId,
    sceneImage: 'background.png',
    animationMode: 'composition',
    layers: [
      {
        path: 'asset_0.png',
        x: 10,
        y: 20,
        scale: 1,
        animation: { type: 'pop-in', delay: 0, duration: 0.5 }
      },
      {
        path: 'asset_1.png',
        x: 60,
        y: 30,
        scale: 1.2,
        animation: { type: 'slide-right', delay: 1, duration: 1 }
      }
    ],
    aspectRatio: '16:9'
  }

  fs.writeFileSync(path.join(sceneDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  // 5. Run Assembler
  const script: CompleteVideoScript = {
    title: 'Composition Test',
    totalDuration: 5,
    sceneCount: 1,
    scenes: [
      {
        id: sceneId,
        sceneNumber: 1,
        timeRange: { start: 0, end: 5 },
        narration: 'This is a composition test.',
        actions: [],
        expression: 'happy',
        imagePrompt: 'BG with layers',
        animationPrompt: 'layers enter',
        visualDensity: 'medium'
      } as any
    ]
  }

  const assembler = new VideoAssembler()
  console.log('Assembling composed video...')
  try {
    const result = await assembler.assembleVideo(script, scenesDir, testDir, 'composition', options)
    console.log('✅ Composition Success! Video saved at:', result)
  } catch (error) {
    console.error('❌ Composition Failed:', error)
  }
}

testComposition()
