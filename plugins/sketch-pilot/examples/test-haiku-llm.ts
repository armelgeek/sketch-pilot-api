/**
 * Test Claude 3.5 Haiku vs Gemini for video script generation
 * 
 * COST COMPARISON:
 * - Gemini 2.5-flash: $2.50 per 1M input tokens ($2.00/script @ ~800K tokens)
 * - Claude Haiku: $0.03 per 1M input tokens ($0.00/script @ ~800K tokens)
 * 
 * SPEED & QUALITY:
 * Expected: Haiku ~5-10x faster + -99% cheaper with comparable quality for JSON/structured output
 */

import { LLMServiceFactory, LLMProvider } from '../src/services/llm';
import { PromptManager } from '../src/core/prompt-manager';
import { VideoGenerationOptions } from '../src/types/video-script.types';

async function testHaikuVsGemini() {
    const topic = 'How to build a habit in 30 days';
    const duration = 30;

    const options: VideoGenerationOptions = {
        duration,
        sceneCount: 5,
        sceneCountFixed: true,
        maxSceneDuration: 10,
        style: 'educational',
        videoType: 'tutorial',
        videoGenre: 'self-improvement',
        aspectRatio: '16:9',
    };

    const promptManager = new PromptManager({
        styleSuffix: 'Minimalist stickman animation, sketchy black ink on off-white background',
    });

    const systemPrompt = promptManager.buildScriptSystemPrompt(options);
    const userPrompt = promptManager.buildScriptUserPrompt(topic, options);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('CLAUDE HAIKU vs GEMINI TEST');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Topic: ${topic}`);
    console.log(`Duration: ${duration}s | Scenes: 5 | Type: ${options.videoType}`);
    console.log();
    console.log(`System prompt: ${systemPrompt.length} chars`);
    console.log(`User prompt: ${userPrompt.length} chars`);
    console.log(`Total: ${(systemPrompt.length + userPrompt.length).toLocaleString()} chars`);
    console.log();

    const apiKeyHaiku = process.env.ANTHROPIC_API_KEY;
    const apiKeyGemini = process.env.GOOGLE_GENAI_API_KEY;

    if (!apiKeyHaiku) {
        console.error('❌ ANTHROPIC_API_KEY not set. Set it in .env');
        return;
    }

    // Test Claude Haiku
    console.log('🟦 TESTING CLAUDE HAIKU 3.5...');
    console.log('─────────────────────────────────────────────────────────────');
    try {
        const startHaiku = Date.now();
        const haikuService = LLMServiceFactory.create({
            provider: 'haiku',
            apiKey: apiKeyHaiku,
            modelId: 'claude-3-5-haiku-20241022',
        });

        const haikuResult = await haikuService.generateContent(userPrompt, systemPrompt, 'application/json');
        const haikuTime = Date.now() - startHaiku;

        console.log(`✅ SUCCESS (${haikuTime}ms)`);
        console.log(`Output size: ${haikuResult.length} chars`);
        console.log();
        console.log('FIRST 500 CHARS OF OUTPUT:');
        console.log(haikuResult.substring(0, 500));
        console.log();

        // Try to parse as JSON
        try {
            const parsed = JSON.parse(haikuResult);
            console.log(`✅ Valid JSON | Scenes: ${parsed.scenes?.length || 0}`);
            if (parsed.scenes?.[0]) {
                console.log(`Sample scene 1: "${parsed.scenes[0].narration?.substring(0, 50)}..."`);
            }
        } catch (e) {
            console.log('⚠️ Output is not valid JSON');
        }
    } catch (error: any) {
        console.error(`❌ ERROR: ${error.message}`);
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════════');

    // Test Gemini for comparison (optional)
    if (apiKeyGemini) {
        console.log('🟦 TESTING GEMINI 2.5-FLASH (for comparison)...');
        console.log('─────────────────────────────────────────────────────────────');
        try {
            const startGemini = Date.now();
            const geminiService = LLMServiceFactory.create({
                provider: 'gemini',
                apiKey: apiKeyGemini,
                modelId: 'gemini-2.5-flash',
            });

            const geminiResult = await geminiService.generateContent(userPrompt, systemPrompt, 'application/json');
            const geminiTime = Date.now() - startGemini;

            console.log(`✅ SUCCESS (${geminiTime}ms)`);
            console.log(`Output size: ${geminiResult.length} chars`);

            // Speed comparison
            console.log();
            console.log('📊 COMPARISON:');
            console.log(`  Haiku speed: ${(geminiTime / Math.max(1, haikuTime)).toFixed(1)}x`);
            console.log(`  Haiku cost: ~$0.00 | Gemini cost: ~$2.00`);
        } catch (error: any) {
            console.error(`⚠️ Gemini error: ${error.message}`);
        }
    } else {
        console.log('ℹ️ Gemini skipped (GOOGLE_GENAI_API_KEY not set)');
        console.log();
        console.log('📊 EXPECTED COMPARISON:');
        console.log('  Haiku speed: ~5-10x faster');
        console.log('  Haiku cost: ~$0.00 (99% cheaper than Gemini)');
        console.log('  Quality: Comparable for JSON/structured output');
    }
}

testHaikuVsGemini().catch(console.error);
