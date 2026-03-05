import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { TranscriptionService, TranscriptionResult } from './transcription.service';
import { WordTiming } from './index';

const execAsync = promisify(exec);

export interface WhisperLocalConfig {
    model?: string;
    device?: string;
    language?: string;
}

export class WhisperLocalService implements TranscriptionService {
    private readonly model: string;
    private readonly device: string;
    private readonly language?: string;

    constructor(config: WhisperLocalConfig = {}) {
        this.model = config.model || 'base';
        this.device = config.device || 'cpu';
        this.language = config.language;
    }

    async transcribe(audioPath: string): Promise<TranscriptionResult> {
        console.log(`[WhisperLocal] Transcribing (local): ${audioPath} using model ${this.model}`);

        const tempDir = path.dirname(audioPath);
        const fileName = path.basename(audioPath, path.extname(audioPath));
        const outputDir = path.join(tempDir, `whisper_${Date.now()}`);
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        try {
            // --word_timestamps True is essential for AssCaptionService
            // --output_format json gives us the full data structure
            let command = `whisper "${audioPath}" --model ${this.model} --device ${this.device} --output_dir "${outputDir}" --output_format json --word_timestamps True`;
            
            if (this.language) {
                command += ` --language ${this.language}`;
            }

            console.log(`[WhisperLocal] Running command: ${command}`);
            await execAsync(command);

            const jsonPath = path.join(outputDir, `${fileName}.json`);
            if (!fs.existsSync(jsonPath)) {
                throw new Error(`Whisper output JSON not found at ${jsonPath}`);
            }

            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            const text = data.text || "";
            const wordTimings: WordTiming[] = [];

            // Flattening all words from all segments
            if (data.segments) {
                for (const segment of data.segments) {
                    if (segment.words) {
                        for (const w of segment.words) {
                            const cleanWord = w.word.trim();
                            // Skip punctuation-only words (.,!?;:—-" etc)
                            if (!/^[.,!?;:\-—"'`""''«»„‟]+$/.test(cleanWord)) {
                                wordTimings.push({
                                    word: cleanWord,
                                    start: w.start,
                                    end: w.end,
                                    startMs: Math.round(w.start * 1000),
                                    durationMs: Math.round((w.end - w.start) * 1000)
                                });
                            }
                        }
                    }
                }
            }

            // Cleanup
            try {
                fs.rmSync(outputDir, { recursive: true, force: true });
            } catch (e) {
                console.warn(`[WhisperLocal] Cleanup failed: ${e}`);
            }

            return { text, wordTimings };
        } catch (error) {
            console.error(`[WhisperLocal] Error during local transcription:`, error);
            throw new Error(`Local Whisper transcription failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
