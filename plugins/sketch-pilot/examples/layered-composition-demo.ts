import * as dotenv from 'dotenv'
import { NanoBananaEngine } from '../src/core/nano-banana-engine'

dotenv.config()

async function runLayeredDemo() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('Please set GOOGLE_API_KEY in .env')
    process.exit(1)
  }

  const engine = new NanoBananaEngine(
    apiKey,
    'Sketchy hand-drawn stickman style, monochrome ink on yellow paper.',
    'You are an expert animator creating cinematic whiteboard videos.'
  )

  const topic = 'A quick lesson about focus and productivity'

  console.log(`Starting Layered Composition Demo for: "${topic}"`)

  try {
    const result = await engine.generateVideoFromTopic(topic, {
      llmProvider: 'grok',
      imageProvider: 'grok',
      animationMode: 'panning',
      animationClipDuration: 5,
      aspectRatio: '16:9',
      backgroundColor: '#FFF',
      videoGenre: 'educational',
      characterConsistency: true,
      scriptOnly: false
    })

    console.log('\n✨ DEMO COMPLETE! ✨')
    console.log(`Project Directory: ${result.outputPath}`)
    console.log(`Instructions for viewing:`)
    console.log(`1. Check the 'scenes' folder for background.png and asset_X.png files.`)
    console.log(`2. Check the manifest.json in each scene folder to see timing/animations.`)
    console.log(`3. Watch final_video_no_music.mp4 to see the elements enter the scene.`)
  } catch (error) {
    console.error('Demo failed:', error)
  }
}

runLayeredDemo()
