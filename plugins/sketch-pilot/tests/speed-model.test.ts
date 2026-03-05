import { PromptManager } from '../src/core/prompt-manager';
import { VideoGenerationOptions, videoGenerationOptionsSchema, suggestSceneDuration } from '../src/types/video-script.types';

async function testSpeedModel() {
    const pm = new PromptManager();

    console.log('--- Test 1: Baseline Speed (EN, Kokoro) ---');
    const options1 = videoGenerationOptionsSchema.parse({ language: 'en-US', audioProvider: 'kokoro' });
    const wps1 = pm.getWordsPerSecond(options1);
    console.log(`WPS: ${wps1.toFixed(2)} (Expected ~2.00)`);
    const dur1 = suggestSceneDuration(10, 'story', wps1);
    console.log(`Duration for 10 words (story): ${dur1.toFixed(2)}s`);

    console.log('\n--- Test 2: French (Slower) ---');
    const options2 = videoGenerationOptionsSchema.parse({ language: 'fr-FR', audioProvider: 'kokoro' });
    const wps2 = pm.getWordsPerSecond(options2);
    console.log(`WPS: ${wps2.toFixed(2)} (Expected ~1.80)`);
    const dur2 = suggestSceneDuration(10, 'story', wps2);
    console.log(`Duration for 10 words (story): ${dur2.toFixed(2)}s`);

    console.log('\n--- Test 3: ElevenLabs (Even Slower) ---');
    const options3 = videoGenerationOptionsSchema.parse({ language: 'en-US', audioProvider: 'elevenlabs' });
    const wps3 = pm.getWordsPerSecond(options3);
    console.log(`WPS: ${wps3.toFixed(2)} (Expected ~1.80)`);
    const dur3 = suggestSceneDuration(10, 'story', wps3);
    console.log(`Duration for 10 words (story): ${dur3.toFixed(2)}s`);

    console.log('\n--- Test 4: Explicit WPM Override (Fast) ---');
    const options4 = videoGenerationOptionsSchema.parse({ wordsPerMinute: 180 }); // 3.0 words/s
    const wps4 = pm.getWordsPerSecond(options4);
    console.log(`WPS: ${wps4.toFixed(2)} (Expected 3.00)`);
    const dur4 = suggestSceneDuration(10, 'story', wps4);
    console.log(`Duration for 10 words (story): ${dur4.toFixed(2)}s`);

    console.log('\n--- Test 5: Prompt Check ---');
    const sysPrompt = pm.buildScriptSystemPrompt(options4);
    if (sysPrompt.includes('3.0 words/second') && sysPrompt.includes('Language: en-US')) {
        console.log('SUCCESS: System prompt reflects dynamic speed and language');
    } else {
        console.log('FAILURE: System prompt does not reflect dynamic speed or language');
        // console.log(sysPrompt);
    }

    const userPrompt = pm.buildScriptUserPrompt('test topic', options4);
    if (userPrompt.includes('3.0 words/second')) {
        console.log('SUCCESS: User prompt reflects dynamic speed');
    } else {
        console.log('FAILURE: User prompt does not reflect dynamic speed');
    }
}

testSpeedModel().catch(console.error);
