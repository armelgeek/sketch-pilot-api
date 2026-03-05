/**
 * Kokoro TTS Example
 * Ultra-cheap text-to-speech service demonstration
 * 
 * Usage:
 *   npx ts-node examples/test-kokoro-tts.ts
 */

import { AudioServiceFactory } from '../src/services/audio';
import path from 'path';

async function testKokoroTTS() {
  console.log('🎙️ Kokoro TTS Example\n');

  // Create Kokoro service with different voices
  const voices = [
    { preset: 'af_heart', lang: 'en-US', text: 'Hello! This is af_heart speaking. Kokoro TTS is ultra-cheap and runs on Hugging Face.' },
    { preset: 'af_bella', lang: 'en-US', text: 'Hello! This is af_bella speaking. Kokoro TTS is ultra-cheap and runs on Hugging Face.' },
    { preset: 'am_adam', lang: 'en-US', text: 'Hello! This is am_adam speaking. Kokoro TTS is ultra-cheap and runs on Hugging Face.' },
    { preset: 'bf_emma', lang: 'en-US', text: 'Hello! This is bf_emma speaking. Kokoro TTS is ultra-cheap and runs on Hugging Face.' },
  ];
  
  for (const voiceConfig of voices) {
    try {
      console.log(`\n📢 Testing voice: ${voiceConfig.preset}`);
      
      const audioService = AudioServiceFactory.create({
        provider: 'kokoro',
        apiKey: process.env.HUGGING_FACE_TOKEN || '',
        lang: voiceConfig.lang,
        kokoroVoicePreset: voiceConfig.preset
      });

      const text = voiceConfig.text;
      const outputPath = path.join(__dirname, `../output/kokoro-${voiceConfig.preset}-output.wav`);

      console.log(`   Text: "${text}"`);
      console.log(`   Output: ${outputPath}`);

      const result = await audioService.generateSpeech(text, outputPath);

      console.log(`   ✅ Success!`);
      console.log(`   Duration: ${result.duration.toFixed(2)}s`);
      console.log(`   Word timings: ${result.wordTimings?.length || 0} words`);

      if (result.wordTimings && result.wordTimings.length > 0) {
        console.log(`   First 3 words:`);
        result.wordTimings.slice(0, 3).forEach((timing, idx) => {
          console.log(`     ${idx + 1}. "${timing.word}" (${timing.durationMs}ms)`);
        });
      }
    } catch (error) {
      console.error(`   ❌ Error with voice ${voiceConfig.preset}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log('\n✨ Done!');
}

// Run test
testKokoroTTS().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
