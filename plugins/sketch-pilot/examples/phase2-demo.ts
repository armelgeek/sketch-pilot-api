import dotenv from 'dotenv';
import { NanoBananaEngine } from '../src/core/nano-banana-engine';
import { VideoGenerationOptions } from '../src/types/video-script.types';
import path from 'path';
import fs from 'fs';

dotenv.config();

const API_KEY = process.env.GOOGLE_API_KEY || '';

function loadReferenceImages(modelsDir: string): string[] {
    const imageFiles = ['  model.jpg', '  model.jpg', '  model.jpg', '  model.jpg'];
    const loadedImages: string[] = [];
    for (const file of imageFiles) {
        const filePath = path.join(modelsDir, file);
        if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            loadedImages.push(fileBuffer.toString('base64'));
        }
    }
    return loadedImages;
}

async function runPhase2Demo() {
    console.log("🚀 Starting Phase 2 Advanced Whiteboard Demo...");

    const styleSuffix = "(whiteboard animation, hand-drawn sketchy black lines, minimalist, warm off-white background #FFF, very rare red tiny highlights)";
    const systemPrompt = "You are an expert whiteboard animation illustrator. Your task is to generate a new image that perfectly matches the artistic style and physical proportions of the provided reference images. The character is a black stickman with a hand-drawn, sketchy look. You must maintain the EXACT head shape, line thickness, and body proportions from the references above all else. Stick to black ink, use RED only for critical tiny highlights. Maintain a minimalist whiteboard style.";

    const engine = new NanoBananaEngine(
        API_KEY,
        styleSuffix,
        systemPrompt
    );

    const modelsDir = path.join(__dirname, '..', 'models');
    const baseImages = loadReferenceImages(modelsDir);
    console.log(`✅ Loaded ${baseImages.length} reference images\n`);

    const topic = "Comment l'efficacité personnelle impacte le monde global (Utilise des métaphores comme globe-head et bulles de pensée)";

    const options: VideoGenerationOptions = {
        duration: 20,
        sceneCount: 3,
        style: 'educational',
        characterConsistency: true,
        aspectRatio: '16:9',
        animationMode: 'none',
        animationClipDuration: 5,
        backgroundColor: '#FFF'
    };

    console.log(`\n--- Generating Script for Topic: "${topic}" ---`);

    // We only generate the script to verify the Phase 2 element detection
    const result = await engine.generateVideoFromTopic(topic, options, baseImages);

    console.log("\n✅ Script Generated Successfully!");

    result.script.scenes.forEach((scene: any, index: number) => {
        console.log(`\n--- Scene ${index + 1}: ${scene.id} ---`);
        console.log(`Layout: ${scene.layoutType}`);
        console.log(`Variant: ${scene.characterVariant || 'standard'}`);
        if (scene.visualText && scene.visualText.length > 0) {
            console.log(`Text: ${JSON.stringify(scene.visualText)}`);
        }
        console.log(`Prompt Preview: ${scene.imagePrompt.substring(0, 150)}...`);
    });

    console.log("\n🚀 Demo Complete. Check the prompts above for globe-heads and thought-bubbles!");
}

if (!API_KEY) {
    console.error("❌ GOOGLE_API_KEY not found in environment.");
} else {
    runPhase2Demo().catch(console.error);
}
