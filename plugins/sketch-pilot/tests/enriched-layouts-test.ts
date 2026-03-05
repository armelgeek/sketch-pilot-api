import { NanoBananaEngine } from './src/core/nano-banana-engine';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

async function testEnrichedLayouts() {
    console.log('--- STARTING ENRICHED LAYOUTS TEST ---');

    const apiKey = process.env.XAI_API_KEY || '';
    if (!apiKey) {
        console.error('Error: XAI_API_KEY is missing in .env');
        process.exit(1);
    }

    const systemPrompt = "You are a professional SHORT-FORM VIDEO DIRECTOR and SCRIPT WRITER specialized in whiteboard stickman animation.";
    const styleSuffix = "whiteboard animation style, hand-drawn sketchy stickman, ink on paper, minimalist off-white background";

    // Correct instantiation of NanoBananaEngine
    const engine = new NanoBananaEngine(
        apiKey,
        styleSuffix,
        systemPrompt,
        { provider: 'demo', lang: 'en' },  // Audio config
        { provider: 'veo', apiKey },       // Animation config
        { provider: 'grok', apiKey, styleSuffix, systemPrompt }, // Image config
        { provider: 'grok', apiKey }       // LLM config
    );

    const topic = "The daily life of a remote software developer, from morning coffee to deep focus to evening relaxation.";

    try {
        console.log('Generating video package...');
        // Use generateVideoFromTopic which is the main entry point
        const result = await engine.generateVideoFromTopic(topic, {
            duration: 30,
            sceneCount: 5,
            style: 'storytelling',
            videoType: 'story',
            videoGenre: 'tech',
            scriptOnly: true, // We only want to see the layout choices in the report
            aspectRatio: '16:9',
            imageProvider: 'grok',
            llmProvider: 'grok'
        });

        console.log('Script generated successfully!');
        console.log('Production Report saved to:', path.join(result.outputPath, 'script.md'));

        // Let's check the layouts chosen in the scenes
        console.log('\n--- SELECTED LAYOUTS ---');
        result.script.scenes.forEach((scene, i) => {
            console.log(`Scene ${i + 1}: Layout = ${scene.layoutType}`);
        });

        // Verify if any new layouts were used
        const newLayouts = [
            'dual-character-meeting-table',
            'character-thinking-large-cloud',
            'character-energy-impact',
            'dual-character-dialogue',
            'character-pointing-large-screen',
            'asymmetric-dual-confrontation',
            'circular-process-cycle',
            'character-at-desk-workstation',
            'character-on-pedestal-stage',
            'character-mobile-phone-tablet',
            'character-in-armchair-relaxing',
            'dual-character-professor-student',
            'asymmetric-dual-scene-contrast',
            'character-with-side-bullet-highlights',
            'comparison-visual-ratio-pots',
            'software-ui-with-narrator',
            'character-surrounded-by-concept-icons'
        ];

        const usedNewLayouts = result.script.scenes.filter(s => s.layoutType && newLayouts.includes(s.layoutType));
        if (usedNewLayouts.length > 0) {
            console.log(`\nSUCCESS: Used ${usedNewLayouts.length} new layout types!`);
            usedNewLayouts.forEach(s => console.log(`- ${s.layoutType}`));
        } else {
            console.log('\nWARNING: No new layout types were selected in this run. Try running again or checking prompts.');
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testEnrichedLayouts();
