import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import { AudioService, AudioGenerationResult } from './index';

/**
 * A free implementation using Google Translate's TTS API for the demo.
 * NOTE: For production, consider using Google Cloud TTS, OpenAI TTS, or ElevenLabs.
 */
export class DemoAudioService implements AudioService {
    private readonly lang: string;

    constructor(lang: string = 'en') {
        this.lang = lang;
    }

    /**
     * Generates speech and saves it to an MP3 file.
     */
    async generateSpeech(text: string, outputPath: string): Promise<AudioGenerationResult> {
        console.log(`[DemoAudio] Generating speech for: "${text.substring(0, 30)}..."`);

        try {
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${this.lang}&client=tw-ob`;

            return new Promise((resolve, reject) => {
                const file = fs.createWriteStream(outputPath);
                https.get(url, (response) => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`Failed to generate audio: ${response.statusCode} ${response.statusMessage}`));
                        return;
                    }
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        file.close();
                        const wordCount = text.split(/\s+/).length;
                        const duration = Math.max(1, wordCount / 2.5); // Crude estimation
                        resolve({
                            audioPath: outputPath,
                            duration,
                            wordTimings: [] // No timings for demo
                        });
                    });
                }).on('error', (err) => {
                    fs.unlink(outputPath, () => { });
                    reject(err);
                });
            });
        } catch (error) {
            console.error(`[DemoAudio] Error:`, error);
            throw error;
        }
    }
}
