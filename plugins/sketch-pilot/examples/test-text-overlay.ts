#!/usr/bin/env ts-node

/**
 * Demo: Test text overlay feature on videos
 *
 * This example demonstrates:
 * 1. Enabling text overlays on generated videos
 * 2. Testing different text positions (top, center, bottom)
 * 3. Customizing text appearance (font, color, size)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'

import { NanoBananaEngine } from '../src/core/nano-banana-engine'
import type { AnimationServiceConfig } from '../src/services/animation'
import type { AudioServiceConfig } from '../src/services/audio'
import type { VideoGenerationOptions } from '../src/types/video-script.types'

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

/**
 * Helper to load reference images as base64
 */
function loadReferenceImages(modelsDir: string): string[] {
  const imageFiles = ['  model.jpg', '  model.jpg', '  model.jpg', '  model.jpg']
  const loadedImages: string[] = []

  for (const file of imageFiles) {
    const filePath = path.join(modelsDir, file)
    if (fs.existsSync(filePath)) {
      console.log(`[Demo] Loading reference: ${filePath}`)
      const fileBuffer = fs.readFileSync(filePath)
      loadedImages.push(fileBuffer.toString('base64'))
    } else {
      console.warn(`[Demo] File not found: ${filePath}`)
    }
  }

  return loadedImages
}

/**
 * Main demo function
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║   Text Overlay Feature Demo                              ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')

  // 1. Check API key
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('❌ Error: Please set GOOGLE_API_KEY in your .env file')
    process.exit(1)
  }

  // 2. Initialize engine with configurable services
  const STYLE_SUFFIX =
    'Full body visible, tight composition, entire character visible from head to toe, minimalist stickman, vector style, flat design, clean lines, white background, high quality.'
  const SYSTEM_PROMPT =
    "You are an expert illustrator. Your task is to generate a new image that perfectly matches the artistic style of the provided reference images. The character is a black stickman. You must maintain the EXACT physical appearance and design of the character from the references. Do not change the line width, head shape, or proportions. Only change the character's expression, pose, and the surrounding scenery/decor as described in the prompt. Any props, symbols, or objects (like arrows, plants, items) must follow the same flat vector design language, strict minimalist style, and line thickness as the character. No realistic textures or 3D effects on props."

  // Service configurations
  const audioConfig: AudioServiceConfig = {
    provider: 'demo',
    lang: 'en'
  }

  const animationConfig: AnimationServiceConfig = {
    provider: 'veo',
    apiKey
  }

  const engine = new NanoBananaEngine(apiKey, STYLE_SUFFIX, SYSTEM_PROMPT, audioConfig, animationConfig)

  // 3. Load reference images
  const modelsDir = path.join(__dirname, '..', 'models')
  const baseImages = loadReferenceImages(modelsDir)
  console.log(`✅ Loaded ${baseImages.length} reference images\n`)

  // 4. Define video topic and options WITH TEXT OVERLAY
  const topic = '3 Simple Steps to Success'

  // Test with bottom position (classic video caption position)
  const options: VideoGenerationOptions = {
    duration: 60,
    sceneCount: 3,
    style: 'motivational',
    characterConsistency: true,
    animationClipDuration: 6,
    animationMode: 'panning', // Use panning to speed up generation for testing
    textOverlay: {
      enabled: true,
      position: 'bottom', // Classic video position
      fontSize: 48,
      fontColor: 'white',
      backgroundColor: 'black@0.7',
      fontFamily: 'Arial',
      maxCharsPerLine: 40
    }
  }

  console.log('\n📝 Text Overlay Configuration:')
  console.log(`   Position: ${options.textOverlay?.position}`)
  console.log(`   Font Size: ${options.textOverlay?.fontSize}px`)
  console.log(`   Font Color: ${options.textOverlay?.fontColor}`)
  console.log(`   Background: ${options.textOverlay?.backgroundColor}`)
  console.log(`   Max Chars Per Line: ${options.textOverlay?.maxCharsPerLine}\n`)

  // 5. Generate video
  try {
    const videoPackage = await engine.generateVideoFromTopic(topic, options, baseImages)

    console.log('\n✅ Video generation complete!')
    console.log(`📁 Output directory: ${videoPackage.outputPath}`)
    console.log(`🎬 Final video: ${path.join(videoPackage.outputPath, 'final_video.mp4')}`)
    console.log(`\n🎉 Text overlays have been added to the video at ${options.textOverlay?.position} position!`)
  } catch (error) {
    console.error('\n❌ Error during video generation:', error)
    process.exit(1)
  }
}

// Run the demo
main().catch(console.error)
