
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { AnimationServiceFactory } from '../src/services/animation';

// Load .env
dotenv.config();

async function testAnimation() {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
        console.error("XAI_API_KEY is missing in .env");
        return;
    }

    const animationService = AnimationServiceFactory.create({
        provider: 'grok',
        apiKey: apiKey
    });

    // Use an existing model image
    const imagePath = path.join(__dirname, '..', 'models', '  model.jpg');
    const outputPath = path.join(__dirname, '..', 'output', 'test-animation.mp4');

    if (!fs.existsSync(imagePath)) {
        console.error(`Reference image not found: ${imagePath}`);
        return;
    }

    // Ensure output dir exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log("🚀 Starting Standalone Animation Test...");
    console.log(`Image: ${imagePath}`);
    console.log(`Output: ${outputPath}`);

    try {
        const startTime = Date.now();
        const result = await animationService.animateImage(
            imagePath,
            "Smoothly animate the hand of the stickman waving. IMPORTANT: Preserve the exact black stickman character and flat minimalist style from the source image. DO NOT change the background or character design.",
            1, // 1 second duration
            outputPath
        );

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✅ TEST SUCCESSFUL!`);
        console.log(`Video saved to: ${result}`);
        console.log(`Total time: ${duration.toFixed(1)}s`);
    } catch (error) {
        console.error("\n❌ TEST FAILED");
        console.error(error);
    }
}

testAnimation();
