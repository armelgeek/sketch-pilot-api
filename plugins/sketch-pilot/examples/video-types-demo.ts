#!/usr/bin/env ts-node

/**
 * Demo: Video Types and Genres
 * 
 * This example demonstrates the new video type and genre system inspired by shortsbot.ai
 * It shows how to generate different types of videos with specific genres for targeted content.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { NanoBananaEngine } from '../src/core/nano-banana-engine';
import { VideoGenerationOptions, VideoType, VideoGenre } from '../src/types/video-script.types';
import { AnimationServiceConfig } from '../src/services/animation';
import { AudioServiceConfig } from '../src/services/audio';

/**
 * Example configurations for different video types and genres
 */
const videoExamples: Array<{
    name: string;
    topic: string;
    videoType: VideoType;
    videoGenre: VideoGenre;
    description: string;
}> = [
        {
            name: 'Educational Tutorial',
            topic: '5 Steps to Master Time Management',
            videoType: 'tutorial',
            videoGenre: 'self-improvement',
            description: 'Step-by-step guide on productivity'
        },
        {
            name: 'Tech Review',
            topic: 'Why This AI Tool Changes Everything',
            videoType: 'review',
            videoGenre: 'tech',
            description: 'Product review focusing on technology'
        },
        {
            name: 'Business Listicle',
            topic: 'Top 3 Mistakes New Entrepreneurs Make',
            videoType: 'listicle',
            videoGenre: 'business',
            description: 'List-based business advice'
        },
        {
            name: 'Motivational Story',
            topic: 'The Man Who Never Gave Up',
            videoType: 'story',
            videoGenre: 'motivational',
            description: 'Inspirational narrative story'
        },
        {
            name: 'Health Facts',
            topic: '3 Scientifically Proven Ways to Boost Energy',
            videoType: 'listicle',
            videoGenre: 'health',
            description: 'Health tips in list format'
        },
        {
            name: 'Mystery Entertainment',
            topic: 'The Unsolved Case That Baffled Everyone',
            videoType: 'story',
            videoGenre: 'mystery',
            description: 'Engaging mystery story'
        },
        {
            name: 'Finance Educational',
            topic: 'How Compound Interest Actually Works',
            videoType: 'tutorial',
            videoGenre: 'finance',
            description: 'Financial education tutorial'
        },
    ];

/**
 * Main demo function
 */
async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   Video Types & Genres Demo - Inspired by shortsbot.ai    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // 1. Check API key
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('❌ Error: Please set GOOGLE_API_KEY in your .env file');
        process.exit(1);
    }

    // 2. Display available examples
    console.log('📋 Available Video Examples:\n');
    videoExamples.forEach((example, index) => {
        console.log(`${index + 1}. ${example.name}`);
        console.log(`   Topic: "${example.topic}"`);
        console.log(`   Type: ${example.videoType} | Genre: ${example.videoGenre}`);
        console.log(`   ${example.description}\n`);
    });

    // 3. Interactive selection
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const selection = await new Promise<string>((resolve) => {
        readline.question('Select an example (1-' + videoExamples.length + ') or press Enter for first one: ', (ans: string) => {
            readline.close();
            resolve(ans || '1');
        });
    });

    const selectedIndex = parseInt(selection) - 1;
    if (selectedIndex < 0 || selectedIndex >= videoExamples.length) {
        console.error('❌ Invalid selection');
        process.exit(1);
    }

    const selectedExample = videoExamples[selectedIndex];
    console.log(`\n✅ Selected: ${selectedExample.name}\n`);

    // 4. Initialize engine
    const STYLE_SUFFIX = "Full body visible, tight composition, entire character visible from head to toe, minimalist stickman, vector style, flat design, clean lines, white background, high quality.";
    const SYSTEM_PROMPT = "You are an expert illustrator. Your task is to generate a new image that perfectly matches the artistic style of the provided reference images. The character is a black stickman. You must maintain the EXACT physical appearance and design of the character from the references. Do not change the line width, head shape, or proportions. Only change the character's expression, pose, and the surrounding scenery/decor as described in the prompt.";

    const audioConfig: AudioServiceConfig = {
        provider: 'demo',
        lang: 'en'
    };

    const animationConfig: AnimationServiceConfig = {
        provider: 'veo',
        apiKey: apiKey
    };

    const engine = new NanoBananaEngine(
        apiKey,
        STYLE_SUFFIX,
        SYSTEM_PROMPT,
        audioConfig,
        animationConfig
    );

    // 5. Configure video options with type and genre
    const options: Partial<VideoGenerationOptions> = {
        // range example: anywhere between 50 and 70 seconds (aims for max)
        minDuration: 50,
        maxDuration: 70,
        sceneCount: 6,
        scriptOnly: false,
        style: 'educational',
        videoType: selectedExample.videoType,
        videoGenre: selectedExample.videoGenre,
        characterConsistency: true,
        animationClipDuration: 6,
        animationMode: 'ai'
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Generating Script with Video Type & Genre');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📝 Topic: ${selectedExample.topic}`);
    console.log(`🎬 Video Type: ${selectedExample.videoType}`);
    console.log(`🎭 Video Genre: ${selectedExample.videoGenre}`);
    const durDisplay = options.minDuration && options.maxDuration
        ? `${options.minDuration}-${options.maxDuration}s (target ${options.maxDuration}s)`
        : `${options.duration}s`;
    console.log(`⏱️  Duration: ${durDisplay} with ${options.sceneCount} scenes`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 6. Generate script only (to see the impact of type and genre)
    const script = await engine.generateStructuredScript(selectedExample.topic, options);

    console.log('✅ Script generated successfully!\n');
    console.log(`📄 Title: ${script.title}`);
    console.log(`🎨 Theme: ${script.theme}`);
    console.log(`📊 Scenes: ${script.sceneCount}\n`);

    // 7. Display scenes preview
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Scene Preview:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    script.scenes.forEach((scene, index) => {
        console.log(`Scene ${index + 1}: ${scene.timeRange.start}s - ${scene.timeRange.end}s`);
        console.log(`📝 ${scene.narration}`);
        console.log(`🎭 Expression: ${scene.expression}`);
        console.log(`🎬 Actions: ${scene.actions.join(', ')}`);
        if (scene.props && scene.props.length > 0) {
            console.log(`🎪 Props: ${scene.props.join(', ')}`);
        }
        console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Demo completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 Tip: Different video types and genres produce different narrative styles!');
    console.log('   Try running this demo again with different selections.\n');
}

// Run the demo
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Error running demo:', error);
        process.exit(1);
    });
}

export { main as demoVideoTypes };
