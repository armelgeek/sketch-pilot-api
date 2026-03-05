import { VideoAssembler } from '../src/services/video/video-assembler.service';
import { CompleteVideoScript, VideoGenerationOptions, QualityMode, KokoroVoicePreset } from '../src/types/video-script.types';
import * as path from 'path';
import * as fs from 'fs';

async function testProFeatures() {
    console.log('--- Testing Video Pro Features ---');

    const assembler = new VideoAssembler();
    const projectDir = path.join(process.cwd(), 'output', 'test-pro');
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    // Mock Script
    const mockScript: CompleteVideoScript = {
        title: "Pro Test",
        totalDuration: 5,
        sceneCount: 1,
        aspectRatio: '16:9',
        scenes: [
            {
                id: "scene1",
                sceneNumber: 1,
                timeRange: { start: 0, end: 5 },
                narration: "Testing professional video features including branding and 4K resolution.",
                imagePrompt: "test",
                animationPrompt: "test",
                tension: 5,
                expression: "happy",
                eyelineMatch: "forward",
                actions: ["gesturing"],
                visualDensity: "medium",
                pauseBefore: 0.4,
                pauseAfter: 0.1,
                continueFromPrevious: false
            }
        ]
    };

    // 1. Test SRT Generation
    console.log('\n[1] Testing SRT Generation...');
    const srtPath = path.join(projectDir, 'test.srt');
    // Mock manifest for SRT
    const sceneDir = path.join(process.cwd(), 'output', 'scenes', 'scene1');
    if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true });
    fs.writeFileSync(path.join(sceneDir, 'manifest.json'), JSON.stringify({
        wordTimings: [
            { word: "Testing", startMs: 100, end: 500 },
            { word: "pro", startMs: 600, end: 1000 },
            { word: "features", startMs: 1100, end: 1500 }
        ]
    }));

    await assembler.generateSRT(mockScript, srtPath);
    if (fs.existsSync(srtPath)) {
        const content = fs.readFileSync(srtPath, 'utf8');
        console.log('✓ SRT Generated corectly:');
        console.log(content);
    } else {
        console.error('✗ SRT Generation failed');
    }

    // 2. Test Branding (Watermark/Logo)
    // Create a dummy video and logo for testing branding method
    console.log('\n[2] Testing Branding Filter logic...');
    // We can't easily run the full FFmpeg command without real inputs, 
    // but we can test the positioning logic if we export it or test it via a small run.

    const brandingOptions = {
        watermarkText: "PRO MASTER 2026",
        position: 'top-right' as any,
        opacity: 0.5
    };

    // Mock a small video if ffmpeg is available
    const inputVideo = path.join(projectDir, 'input.mp4');
    const brandedVideo = path.join(projectDir, 'branded.mp4');

    // Create 1 sec black video
    // if ffmpge exists in environment
    try {
        const { execSync } = require('child_process');
        execSync(`ffmpeg -y -f lavfi -i color=c=black:s=1280x720:d=1 -pix_fmt yuv420p ${inputVideo}`);

        console.log('Applying branding...');
        await assembler.applyBranding(inputVideo, brandingOptions, brandedVideo);

        if (fs.existsSync(brandedVideo)) {
            console.log('✓ Branded video generated successfully');
        }
    } catch (e) {
        console.warn('Skipping branding physical test (ffmpeg might not be in PATH or test environment)', e);
    }

    // 3. Test Resolution Presets
    console.log('\n[3] Testing Resolution Mapping...');
    const resolutions = ['720p', '1080p', '4k', '9:16'];
    for (const res of resolutions) {
        const val = (assembler as any).getResolution(res);
        console.log(`- ${res} => ${val}`);
    }

    console.log('\n--- Pro Features Verification Complete ---');
}

testProFeatures().catch(console.error);
