import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { AnimationServiceFactory } from '../src/services/animation'

// Load environment variables
dotenv.config()

async function runTest() {
  console.log('🚀 Starting Standalone Veo 3.1 Animation Test...')

  const animationService = AnimationServiceFactory.create({
    provider: 'veo',
    apiKey: process.env.GOOGLE_API_KEY
  })

  // Use the same model image as before
  const imagePath = path.join(__dirname, '..', 'models', '  model.jpg')
  const outputPath = path.join(__dirname, '..', 'output', 'test-veo-animation.mp4')

  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Source image not found at ${imagePath}`)
    return
  }

  console.log(`Image: ${imagePath}`)
  console.log(`Output: ${outputPath}`)

  try {
    const startTime = Date.now()
    const result = await animationService.animateImage(
      imagePath,
      'Smoothly animate the hand of the stickman waving. IMPORTANT: Preserve the exact black stickman character and flat minimalist style from the source image. DO NOT change the background or character design.',
      6, // 6 second duration for Veo
      outputPath
    )

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n✅ TEST SUCCESSFUL!`)
    console.log(`Video saved to: ${result}`)
    console.log(`Total time: ${duration}s`)
  } catch (error) {
    console.error('\n❌ TEST FAILED:')
    console.error(error)
    process.exit(1)
  }
}

runTest()
