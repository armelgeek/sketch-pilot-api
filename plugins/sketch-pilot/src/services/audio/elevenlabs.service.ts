import * as fs from 'node:fs';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'stream';
import { AudioService, AudioGenerationResult } from './index';
import { detectAndTrimSilence } from '../../utils/audio-trimmer';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * ElevenLabs text-to-speech service implementation
 * Provides high-quality, natural-sounding text-to-speech synthesis
 */
export class ElevenLabsService implements AudioService {
    private readonly client: ElevenLabsClient;
    private readonly voiceId: string;
    private readonly modelId: string;

    constructor(
        apiKey: string,
        voiceId: string = 'EXAVITQu4vr4xnSDxMaL', // Default: Bella voice
        modelId: string = 'eleven_monolingual_v1'
    ) {
        this.client = new ElevenLabsClient({
            apiKey: apiKey,
        });

        this.voiceId = voiceId;
        this.modelId = modelId;
    }

    /**
     * Generates speech and saves it to an audio file
     */
    async generateSpeech(text: string, outputPath: string): Promise<AudioGenerationResult> {
        console.log(`[ElevenLabs] Generating speech for: "${text.substring(0, 50)}..."`);

        try {
            // Generate audio stream
            const audioStream = await this.client.textToSpeech.convert(this.voiceId, {
                text,
                modelId: this.modelId,
                voiceSettings: {
                    stability: 0.5,
                    similarityBoost: 0.5,
                },
            });

            // Create write stream
            const fileStream = fs.createWriteStream(outputPath);

            // Convert async iterable to readable stream and pipe to file
            await new Promise<void>((resolve, reject) => {
                const readable = Readable.from(audioStream);

                readable.pipe(fileStream);

                fileStream.on('finish', () => {
                    console.log(`[ElevenLabs] Speech generated successfully: ${outputPath}`);
                    resolve();
                });

                fileStream.on('error', (error: Error) => {
                    console.error(`[ElevenLabs] File stream error:`, error);
                    reject(error);
                });

                readable.on('error', (error: Error) => {
                    console.error(`[ElevenLabs] Audio stream error:`, error);
                    reject(error);
                });
            });

            // For now, ElevenLabs implementation doesn't return word timings
            // We can add it later if we use the timestamp feature (requires different API usage)
            // ✅ Trim silence
            const trimmedPath = outputPath.replace('.mp3', '_trimmed.mp3');
            const trimResult = await detectAndTrimSilence(outputPath, trimmedPath);
            if (fs.existsSync(trimmedPath)) {
                fs.renameSync(trimmedPath, outputPath);
            }

            console.log(`[ElevenLabs] ✅ Speech generated & trimmed: ${outputPath} (-${trimResult.startTrimmedMs}ms start)`);

            return {
                audioPath: outputPath,
                duration: trimResult.newDurationMs / 1000,
                wordTimings: []
            };
        } catch (error) {
            console.error(`[ElevenLabs] Error generating speech:`, error);
            throw new Error(`Failed to generate speech with ElevenLabs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
