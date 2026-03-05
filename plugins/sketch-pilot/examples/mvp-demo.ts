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

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { NanoBananaEngine } from '../src/core/nano-banana-engine';

async function main() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('❌ Please set GOOGLE_API_KEY in your .env file');
        process.exit(1);
    }

    const engine = new NanoBananaEngine(apiKey);

    const topic = process.argv[2] || 'Elon musk mindset'
    console.log(`\n🚀 MVP Generation — Topic: "${topic}"\n`);

    const result = await engine.generateMvp(topic);

    console.log(`\n✅ Done!`);
    console.log(`📁 Project: ${result.projectId}`);
    console.log(`📂 Output:  ${result.outputPath}`);
    console.log(`⏱️  Time:    ${((result.metadata?.generationTimeMs ?? 0) / 1000).toFixed(1)}s`);
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
