/**
 * Audio Service Interface and Factory
 * 
 * This module provides an abstraction layer for audio/TTS services,
 * making it easy to switch between different audio providers.
 */

export interface WordTiming {
    word: string;
    start: number; // seconds
    end: number; // seconds
    startMs: number;
    durationMs: number;
}

export interface AudioGenerationResult {
    audioPath: string;
    duration: number; // seconds
    wordTimings?: WordTiming[];
}

export interface AudioService {
    generateSpeech(text: string, outputPath: string): Promise<AudioGenerationResult>;
}

export type AudioProvider = 'demo' | 'google-tts' | 'openai-tts' | 'elevenlabs' | 'kokoro';

export interface AudioServiceConfig {
    provider: AudioProvider;
    apiKey?: string;
    lang?: string;
    // Google TTS specific options
    voiceName?: string;
    audioEncoding?: 'MP3' | 'LINEAR16' | 'OGG_OPUS';
    // ElevenLabs specific options
    voiceId?: string;
    modelId?: string;
    // Kokoro TTS specific options
    kokoroVoicePreset?: string;
}

/**
 * Factory for creating audio service instances
 */
export class AudioServiceFactory {
    /**
     * Create an audio service based on the configuration
     */
    static create(config: AudioServiceConfig): AudioService {
        switch (config.provider) {
            case 'demo':
                const { DemoAudioService } = require('./demo-audio.service');
                return new DemoAudioService(config.lang);
            case 'google-tts':
                if (!config.apiKey) {
                    throw new Error('API key is required for Google TTS provider');
                }
                const { GoogleTTSService } = require('./google-tts.service');
                return new GoogleTTSService(
                    config.apiKey,
                    config.lang || 'en-US',
                    config.voiceName,
                    config.audioEncoding || 'MP3'
                );
            case 'elevenlabs':
                if (!config.apiKey) {
                    throw new Error('API key is required for ElevenLabs provider');
                }
                const { ElevenLabsService } = require('./elevenlabs.service');
                return new ElevenLabsService(
                    config.apiKey,
                    config.voiceId || 'EXAVITQu4vr4xnSDxMaL',
                    config.modelId || 'eleven_monolingual_v1'
                );
            case 'kokoro':
                const { KokoroTTSService } = require('./kokoro-tts.service');
                return new KokoroTTSService(
                    config.apiKey || '',
                    config.lang || 'en-US',
                    config.kokoroVoicePreset || 'af_heart'
                );
            case 'openai-tts':
                throw new Error(`Audio provider "${config.provider}" is not yet implemented. Consider using google-tts, elevenlabs, or kokoro.`);
            default:
                throw new Error(`Unknown audio provider: ${config.provider}`);
        }
    }

    /**
     * Get available providers
     */
    static getAvailableProviders(): AudioProvider[] {
        return ['demo', 'google-tts', 'openai-tts', 'elevenlabs'];
    }

    /**
     * Get implemented providers
     */
    static getImplementedProviders(): AudioProvider[] {
        return ['demo', 'google-tts', 'elevenlabs', 'kokoro'];
    }
}
