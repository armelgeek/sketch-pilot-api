import { VideoScriptGenerator } from './src/core/video-script-generator';
import { GeminiLLMService } from './src/services/llm/gemini-llm.service';
import { VideoGenerationOptions } from './src/types/video-script.types';
import * as dotenv from 'dotenv';

dotenv.config();

async function testLayerGeneration() {
    console.log("Initializing VideoScriptGenerator...");

    if (!process.env.GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY not found in environment variables");
    }

    const llmService = new GeminiLLMService({
        provider: 'gemini',
        apiKey: process.env.GOOGLE_API_KEY,
        modelId: 'gemini-2.5-flash'
    });

    const generator = new VideoScriptGenerator(llmService);

    const options: VideoGenerationOptions = {
        duration: 20,
        sceneCount: 3,
        style: 'motivational',
        videoType: 'story',
        videoGenre: 'general',
        characterConsistency: true,
        animationClipDuration: 5,
        animationMode: 'composition',
        aspectRatio: '9:16',    // Changed to Vertical for testing
        imageProvider: 'gemini',
        llmProvider: 'gemini',
        scriptOnly: true,
        backgroundColor: '#FFFFFF'
    };

    try {
        console.log("Generating script for topic: 'The power of silence'...");
        const script = await generator.generateCompleteScript('The power of silence', options);

        console.log("\n--- GENERATION SUCCESSFUL ---\n");

        script.scenes.forEach((scene, index) => {
            console.log(`\nSCENE ${index + 1}:`);
            console.log(`Layout Type: ${scene.layoutType}`);
            console.log(`Image Prompt Snippet: ...${scene.imagePrompt.substring(scene.imagePrompt.length - 150)}`);

            if (scene.layout?.texts && scene.layout.texts.length > 0) {
                console.log(`Text Layers: ${scene.layout.texts.length}`);
                scene.layout.texts.forEach((text, tIndex) => {
                    console.log(`  Text ${tIndex + 1}: "${text.content}"`);
                    console.log(`    Position: ${text.position}`);
                    console.log(`    Z-Index: ${text.zIndex}`);
                    console.log(`    Animation: ${JSON.stringify(text.animation)}`);
                });
            } else {
                console.log("No Text Layers found.");
            }
        });

    } catch (error) {
        console.error("Error generating script:", error);
    }
}

testLayerGeneration();
