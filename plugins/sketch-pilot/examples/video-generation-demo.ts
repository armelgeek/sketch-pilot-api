#!/usr/bin/env ts-node

/**
 * Demo: Generate a complete video from a topic using NanoBananaEngine
 *
 * This example demonstrates:
 * 1. Generating a complete 59-second video script (6 scenes)
 * 2. Creating image prompts for each scene
 * 3. Generating animation instructions
 * 4. Producing all assets (characters and props)
 * 5. Exporting in the 3-part format (Script, Image Prompts, Animation)
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
  console.log('║   NanoBanana Video Script Generator Demo                 ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')

  // 1. Check API key
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('❌ Error: Please set GOOGLE_API_KEY in your .env file')
    process.exit(1)
  }

  // 2. Initialize engine with configurable services
  const STYLE_SUFFIX =
    'Full body visible, tight composition, entire character visible from head to toe, minimalist stickman, vector style, flat design, clean lines, solid off-white background (#F5F5F5), high quality, no text, no borders.'
  const SYSTEM_PROMPT =
    "You are an expert illustrator. Your task is to generate a new image that perfectly matches the artistic style of the provided reference images. The character is a black stickman. You must maintain the EXACT physical appearance and design of the character from the references. Do not change the line width, head shape, or proportions. Only change the character's expression, pose, and the surrounding scenery/decor as described in the prompt. Any props, symbols, or objects (like arrows, plants, items) must follow the same flat vector design language, strict minimalist style, and line thickness as the character. NO realistic textures, NO 3D effects, NO physical boards, NO frames, NO borders, NO grid lines, and NO text coordinates or labels unless specifically part of the scene's visual text."

  // Service configurations - easily switch between providers
  const audioConfig: AudioServiceConfig = {
    provider: 'demo', // Can be changed to 'google-tts', 'openai-tts', 'elevenlabs' when implemented
    lang: 'en'
  }

  const animationConfig: AnimationServiceConfig = {
    provider: 'veo', // Can be changed to 'grok'
    apiKey
  }

  const engine = new NanoBananaEngine(apiKey, STYLE_SUFFIX, SYSTEM_PROMPT, audioConfig, animationConfig)

  // 3. Load reference images
  const modelsDir = path.join(__dirname, '..', 'models')
  const baseImages = loadReferenceImages(modelsDir)
  console.log(`✅ Loaded ${baseImages.length} reference images\n`)

  // 4. Define video topic and options
  const topic =
    'Why you are not losing weight on a diet, explained with a stickman character going through different scenarios like eating healthy, exercising, and facing common pitfalls.'
  const options: VideoGenerationOptions = {
    videoType: 'story',
    videoGenre: 'mystery',
    scriptOnly: false,
    duration: 300, // Reduced duration for demo
    sceneCount: 10, // Reduced scene count for demo cost saving
    style: 'motivational',
    characterConsistency: true,
    animationClipDuration: 6,
    animationMode: 'static',
    aspectRatio: '16:9',
    backgroundColor: '#F5F5F5',
    imageProvider: 'gemini',
    llmProvider: 'gemini'
  }

  // 5. Generate structured script
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('STEP 1: Generating Script')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const script = await engine.generateStructuredScript(topic, options)

  console.log('✅ Script generated successfully!')
  console.log(`Title: ${script.title}`)
  console.log(`Scenes: ${script.sceneCount}`)
  console.log('')

  // 6. Generate full video with assets & animation
  const costPerScriptEnrichment = 0.001
  const costPerImage = 0.02
  const costPerSecondAnimation = 0.15
  const costPerTTS = 0.005

  const scriptCost = script.sceneCount * costPerScriptEnrichment
  const imageCost = script.sceneCount * costPerImage
  const isAIAnimation = options.animationMode === 'ai'
  const animationCost = isAIAnimation ? script.sceneCount * options.animationClipDuration * costPerSecondAnimation : 0
  const audioCost = script.sceneCount * costPerTTS
  const estimatedCost = scriptCost + imageCost + animationCost + audioCost

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('STEP 2: Generating Full Video with Assets & Animation')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`💰 TOTAL ESTIMATED COST: $${estimatedCost.toFixed(2)}`)
  console.log(`   - Images: $${imageCost.toFixed(2)}`)
  console.log(
    `   - Animation: $${animationCost.toFixed(2)} (${isAIAnimation ? '$0.15/s - Short Loop' : 'FREE - Panning Mode'})`
  )
  console.log(`   - Audio/Script: $${(scriptCost + audioCost).toFixed(2)}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  /* // Interactive confirmation
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
        readline.question('Proceed with generation? (y/n): ', (ans: string) => {
            readline.close();
            resolve(ans.toLowerCase());
        });
    });

    if (answer !== 'y') {
        console.log('❌ Generation cancelled by user.');
        process.exit(0);
    } */

  console.log('\n🚀 Starting generation...\n')
  const fullVideo = await engine.generateVideoFromTopic(topic, options, baseImages)

  console.log(`\n✅ Full video generated!`)
  console.log(`📁 Project: ${fullVideo.projectId}`)
  console.log(`📂 Output: ${fullVideo.outputPath}`)
  console.log(`💰 Cost: $${fullVideo.metadata?.estimatedCost?.toFixed(2)}`)
  console.log(`⏱️  Time: ${(fullVideo.metadata?.generationTimeMs || 0) / 1000}s`)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Demo completed successfully!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

// Run the demo
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Error running demo:', error)
    process.exit(1)
  })
}

export { main as demoVideoGeneration }
