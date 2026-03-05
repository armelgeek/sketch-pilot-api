#!/usr/bin/env ts-node

/**
 * Demo: Test Remotion-style high-impact subtitles
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { NanoBananaEngine } from '../src/core/nano-banana-engine';
import { VideoGenerationOptions } from '../src/types/video-script.types';
import { AnimationServiceConfig } from '../src/services/animation';
import { AudioServiceConfig } from '../src/services/audio';

async function main() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   Remotion-Style High-Impact Subtitles Demo               ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('❌ Error: Please set GOOGLE_API_KEY in your .env file');
        process.exit(1);
    }

    const STYLE_SUFFIX = "Full body visible, tight composition, entire character visible from head to toe, minimalist stickman, vector style, flat design, clean lines, white background, high quality.";
    const SYSTEM_PROMPT = "You are an expert illustrator for whiteboard animations.";

    const engine = new NanoBananaEngine(
        apiKey,
        STYLE_SUFFIX,
        SYSTEM_PROMPT,
        { provider: 'demo', lang: 'en' },
        { provider: 'veo', apiKey: apiKey }
    );

    const topic = "How to Focus in a Distracted World";

    const options: VideoGenerationOptions = {
        duration: 30,
        sceneCount: 2,
        style: 'educational',
        characterConsistency: true,
        animationClipDuration: 6,
        animationMode: 'panning',
        aspectRatio: '16:9',
        backgroundColor: '#FFF',
        imageProvider: 'grok',
        llmProvider: 'grok',
        textOverlay: {
            enabled: true,
            position: 'bottom',
            style: 'remotion', // Modern, word-by-word style using ASS
            fontSize: 54,
            fontColor: 'white',
            highlightColor: '#FFEE58', // Yellow highlight for active word
            backgroundColor: 'transparent',
            fontFamily: 'Arial',
            maxCharsPerLine: 30
        },
        scriptOnly: false
    };

    console.log('🚀 Generating video with REMOTION-STYLE subtitles...');

    try {
        const videoPackage = await engine.generateVideoFromTopic(topic, options, []);
        console.log(`\n✅ Done! Check the result in: ${videoPackage.outputPath}`);
    } catch (error) {
        console.error('\n❌ Generation failed:', error);
    }
}

main().catch(console.error);
