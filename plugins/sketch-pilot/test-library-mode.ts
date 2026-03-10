import * as fs from 'node:fs'
import * as path from 'node:path'
import { NanoBananaEngine } from './src/core/nano-banana-engine'

async function test() {
  const engine = new NanoBananaEngine('fake-key')

  const scene: any = {
    id: 'test-scene',
    visualMode: 'standard',
    backgroundId: 'ABSTR-DARK',
    poseId: 'EXHAUSTED',
    timeRange: { start: 0, end: 5 },
    narration: 'Test narration'
  }

  const targetDir = path.join(process.cwd(), 'debug-output')
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir)

  console.log('Testing composeScene with Library Mode...')
  try {
    // We need to mock currentOptions to avoid null pointer
    ;(engine as any).currentOptions = { animationMode: 'static', aspectRatio: '16:9' }

    await engine.composeScene(scene, [], targetDir)
    console.log('✓ composeScene finished.')

    const imagePath = path.join(targetDir, 'scene.webp')
    if (fs.existsSync(imagePath)) {
      console.log(`✓ scene.webp created at ${imagePath}`)
      const stats = fs.statSync(imagePath)
      console.log(`  Size: ${stats.size} bytes`)
    } else {
      console.log('✗ scene.webp NOT created.')
    }
  } catch (error) {
    console.error('✗ composeScene failed:', error)
  }
}

test()
