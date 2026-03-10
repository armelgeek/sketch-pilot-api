#!/usr/bin/env ts-node

/**
 * MVP Demo: Fast stickman video generation with minimal configuration.
 *
 * Generates a 3-scene, 30-second video with static images and narration.
 * No AI video animation — keeps it simple and fast.
 *
 * Usage:
 *   npm run demo:mvp
 *   npm run demo:mvp -- "Your topic here"
 *   GOOGLE_API_KEY=your_key ts-node examples/mvp-demo.ts "Your topic here"
 */

import * as path from 'node:path'
import * as dotenv from 'dotenv'

import { NanoBananaEngine } from '../src/core/nano-banana-engine'

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('❌ Please set GOOGLE_API_KEY in your .env file')
    process.exit(1)
  }

  const engine = new NanoBananaEngine(apiKey, undefined, undefined, {
    provider: 'elevenlabs',
    apiKey: process.env.ELEVENLABS_API_KEY
  })

  const topic = process.argv[2] || "Create something BEFORE you're ready"
  console.log(`\n🚀 MVP Generation — Topic: "${topic}"\n`)

  const result = await engine.generateMvp(topic)
  /**
     * 
     * , {
        qualityMode: "low-cost" as any,
        minDuration: 30,
        maxDuration: 40,
        animationMode: "none",
        globalTextStyle: {
            color: "#FFD700", // Golden text
            fontFamily: "Outfit",
            fontSize: 65,
            fontWeight: "bolder",
            position: "bottom", // Force all text to bottom
            highlightColor: "#FF4500" // Orange-Red highlights
        },
        /* 
        // Example of Per-Scene Overrides (Post-AI):
        sceneStyles: {
            "scene-1": { position: "top", color: "#FFFFFF" },
            "scene-2": { x: 50, y: 10, position: "custom" }
        }
        */

  console.log(`\n✅ Done!`)
  console.log(`📁 Project: ${result.projectId}`)
  console.log(`📂 Output:  ${result.outputPath}`)
  console.log(`⏱️  Time:    ${((result.metadata?.generationTimeMs ?? 0) / 1000).toFixed(1)}s`)
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
