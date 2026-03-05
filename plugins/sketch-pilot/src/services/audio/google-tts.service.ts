import * as fs from 'node:fs';
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import { AudioService, AudioGenerationResult, WordTiming } from './index';
import { detectAndTrimSilence } from '../../utils/audio-trimmer';

/**
 * Google Cloud Text-to-Speech service implementation
 * Provides high-quality text-to-speech synthesis using Google Cloud TTS API
 */
export class GoogleTTSService implements AudioService {
    private readonly client: TextToSpeechClient;
    private readonly languageCode: string;
    private readonly voiceName?: string;
    private readonly audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding;

    constructor(
        apiKey: string,
        languageCode: string = 'en-US',
        voiceName?: string,
        audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS' = 'MP3'
    ) {
        // Initialize the client with API key
        this.client = new TextToSpeechClient({
            apiKey: apiKey,
        });

        this.languageCode = languageCode;
        this.voiceName = voiceName;

        // Map string to enum
        const encodingMap = {
            'MP3': protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
            'LINEAR16': protos.google.cloud.texttospeech.v1.AudioEncoding.LINEAR16,
            'OGG_OPUS': protos.google.cloud.texttospeech.v1.AudioEncoding.OGG_OPUS,
        };
        this.audioEncoding = encodingMap[audioEncoding];
    }

    /**
     * Generates speech and saves it to an audio file
     */
    async generateSpeech(text: string, outputPath: string): Promise<AudioGenerationResult> {
        console.log(`[GoogleTTS] Generating speech for: "${text.substring(0, 50)}..."`);

        try {
            // Construct the request (cast to any for enableTimepointing which may not be in current type defs)
            const request: any = {
                input: { text },
                voice: {
                    languageCode: this.languageCode,
                    ...(this.voiceName && { name: this.voiceName }),
                },
                audioConfig: {
                    audioEncoding: this.audioEncoding,
                },
                // enableTimepointing is experimental; word-level timings via SSML marks
                // enableTimepointing: [1], // SSML_MARK = 1
            };

            // Perform the text-to-speech request
            const [response] = await this.client.synthesizeSpeech(request);

            if (!response.audioContent) {
                throw new Error('No audio content received from Google TTS');
            }

            // Write the audio content to file
            await fs.promises.writeFile(outputPath, response.audioContent, 'binary');

            console.log(`[GoogleTTS] Speech generated successfully: ${outputPath}`);

            // Initial implementation for timepoints - Google TTS returns them for SSML <mark> tags
            // For raw text, we might not get word-level alignment directly with this config.
            // However, to satisfy the interface, we return the structure.
            // Real word-level timestamps might require additional handling or specific voice config.

            // ✅ Trim silence
            const trimmedPath = outputPath.replace('.mp3', '_trimmed.mp3');
            const trimResult = await detectAndTrimSilence(outputPath, trimmedPath);
            if (fs.existsSync(trimmedPath)) {
                fs.renameSync(trimmedPath, outputPath);
            }

            console.log(`[GoogleTTS] ✅ Speech generated & trimmed: ${outputPath} (-${trimResult.startTrimmedMs}ms start)`);

            const wordTimings: WordTiming[] = []; // Placeholder for now

            return {
                audioPath: outputPath,
                duration: trimResult.newDurationMs / 1000,
                wordTimings
            };
        } catch (error) {
            console.error(`[GoogleTTS] Error generating speech:`, error);
            throw new Error(`Failed to generate speech with Google TTS: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
