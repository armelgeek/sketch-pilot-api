# Audio Service Implementation Guide

This document provides a comprehensive guide to using the audio abstraction layer in the Stickman Generator project.

## Overview

The audio service abstraction provides a unified interface for text-to-speech (TTS) generation, supporting multiple providers:

- **Demo** - Free Google Translate TTS (for testing/demo purposes)
- **Google Cloud TTS** - High-quality, scalable TTS from Google Cloud
- **ElevenLabs** - Natural-sounding AI-powered voice synthesis
- **OpenAI TTS** - (Planned for future implementation)

## Quick Start

### 1. Install Dependencies

The required packages are already included in `package.json`:

```bash
npm install
```

### 2. Set Up API Keys

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add your keys:

```env
# For Google Cloud TTS
GOOGLE_TTS_API_KEY=your_google_tts_api_key_here

# For ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

### 3. Use in Your Code

```typescript
import { AudioServiceFactory, AudioServiceConfig } from './src/services/audio';

// Choose a provider
const audioConfig: AudioServiceConfig = {
    provider: 'google-tts',  // or 'demo', 'elevenlabs'
    apiKey: process.env.GOOGLE_TTS_API_KEY,
    lang: 'en-US'
};

// Create the service
const audioService = AudioServiceFactory.create(audioConfig);

// Generate speech
await audioService.generateSpeech(
    'Hello, this is a test of the audio service!',
    'output/audio.mp3'
);
```

## Provider Details

### Demo Audio Service

**Use Case:** Testing, demos, or when you don't have API keys.

**Limitations:**
- Uses free Google Translate TTS API (may have rate limits)
- Basic voice quality
- Limited language support

**Configuration:**
```typescript
const config: AudioServiceConfig = {
    provider: 'demo',
    lang: 'en'  // Language code (e.g., 'en', 'fr', 'es')
};
```

### Google Cloud Text-to-Speech

**Use Case:** Production applications requiring high-quality, scalable TTS.

**Features:**
- High-quality voices (Standard, WaveNet, Neural2)
- 220+ voices in 40+ languages
- SSML support for advanced speech control
- Multiple audio formats

**Configuration:**
```typescript
const config: AudioServiceConfig = {
    provider: 'google-tts',
    apiKey: process.env.GOOGLE_TTS_API_KEY,
    lang: 'en-US',                           // Language code
    voiceName: 'en-US-Neural2-C',           // Optional: specific voice
    audioEncoding: 'MP3'                     // Optional: 'MP3', 'LINEAR16', 'OGG_OPUS'
};
```

**Popular Voice Names:**
- English (US): `en-US-Neural2-A`, `en-US-Neural2-C`, `en-US-Neural2-D`
- English (UK): `en-GB-Neural2-A`, `en-GB-Neural2-B`
- French: `fr-FR-Neural2-A`, `fr-FR-Neural2-B`
- Spanish: `es-ES-Neural2-A`, `es-ES-Neural2-B`

**Getting API Key:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Text-to-Speech API
3. Create credentials (API key)
4. Add billing information (free tier available)

### ElevenLabs TTS

**Use Case:** Applications requiring the most natural-sounding voices.

**Features:**
- Ultra-realistic AI voices
- Voice cloning capabilities
- Multiple languages
- Adjustable voice settings (stability, similarity)

**Configuration:**
```typescript
const config: AudioServiceConfig = {
    provider: 'elevenlabs',
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: 'EXAVITQu4vr4xnSDxMaL',       // Voice ID (default: Bella)
    modelId: 'eleven_monolingual_v1'        // Model ID
};
```

**Popular Voice IDs:**
- Bella: `EXAVITQu4vr4xnSDxMaL`
- Rachel: `21m00Tcm4TlvDq8ikWAM`
- Antoni: `ErXwobaYiN019PkySvjV`
- Arnold: `VR6AewLTigWG4xSOukaG`

**Getting API Key:**
1. Sign up at [ElevenLabs](https://elevenlabs.io/)
2. Go to Profile Settings
3. Copy your API key
4. Free tier includes 10,000 characters/month

## Testing

Run the test script to verify all audio services:

```bash
npm run test:audio
```

This will:
- Test the demo service (always runs)
- Test Google TTS (if API key is set)
- Test ElevenLabs (if API key is set)
- Generate sample audio files in `/tmp`

## Integration with NanoBananaEngine

The main video generation engine already supports the audio service abstraction:

```typescript
import { NanoBananaEngine } from './src/core/nano-banana-engine';
import { AudioServiceConfig } from './src/services/audio';

const audioConfig: AudioServiceConfig = {
    provider: 'elevenlabs',
    apiKey: process.env.ELEVENLABS_API_KEY,
};

const engine = new NanoBananaEngine(
    apiKey,
    styleSuffix,
    systemPrompt,
    audioConfig,      // Pass your audio config here
    animationConfig
);

// Generate video - audio will be generated using your chosen provider
const videoPackage = await engine.generateVideoFromTopic(topic, options, baseImages);
```

## Advanced Usage

### Switching Providers at Runtime

```typescript
class MyVideoGenerator {
    private audioService: AudioService;
    
    switchAudioProvider(provider: AudioProvider, apiKey?: string) {
        const config: AudioServiceConfig = {
            provider,
            apiKey,
            lang: 'en-US'
        };
        this.audioService = AudioServiceFactory.create(config);
    }
    
    async generateNarration(text: string, outputPath: string) {
        return await this.audioService.generateSpeech(text, outputPath);
    }
}
```

### Error Handling

```typescript
try {
    await audioService.generateSpeech(text, outputPath);
    console.log('Audio generated successfully!');
} catch (error) {
    if (error.message.includes('API key')) {
        console.error('Invalid or missing API key');
    } else if (error.message.includes('quota')) {
        console.error('API quota exceeded');
    } else {
        console.error('Audio generation failed:', error);
    }
}
```

### Checking Available Providers

```typescript
import { AudioServiceFactory } from './src/services/audio';

// Get all supported providers
const available = AudioServiceFactory.getAvailableProviders();
// Returns: ['demo', 'google-tts', 'openai-tts', 'elevenlabs']

// Get currently implemented providers
const implemented = AudioServiceFactory.getImplementedProviders();
// Returns: ['demo', 'google-tts', 'elevenlabs']
```

## Troubleshooting

### "API key is required" Error
- Make sure you've set the appropriate API key in your `.env` file
- Verify the key is being loaded with `dotenv.config()`

### "No audio content received" Error (Google TTS)
- Check that your API key has TTS API enabled
- Verify you have billing enabled (even for free tier)
- Check your language/voice name is valid

### "Failed to generate speech" Error (ElevenLabs)
- Verify your API key is valid
- Check your quota hasn't been exceeded
- Ensure the voice ID exists in your account

### Network/Connection Errors
- Check your internet connection
- Verify firewall settings allow HTTPS requests
- Try switching providers to isolate the issue

## Cost Considerations

### Demo Service
- **Cost:** Free
- **Limits:** Subject to Google Translate TTS rate limits

### Google Cloud TTS
- **Cost:** $4 per 1 million characters (Standard voices)
- **Cost:** $16 per 1 million characters (WaveNet/Neural2 voices)
- **Free Tier:** 1 million characters per month (Standard) or 0.5 million (Premium)

### ElevenLabs
- **Free Tier:** 10,000 characters per month
- **Creator:** $5/month for 30,000 characters
- **Pro:** $22/month for 100,000 characters
- **Scale:** Custom pricing for larger volumes

## Future Enhancements

Planned features for future releases:

1. **OpenAI TTS Integration** - Add support for OpenAI's TTS API
2. **Voice Caching** - Cache generated audio to reduce API calls
3. **Batch Processing** - Generate multiple audio clips in parallel
4. **SSML Support** - Add advanced speech synthesis markup
5. **Voice Profiles** - Save and reuse voice configurations

## Contributing

To add a new audio provider:

1. Create a new service file: `src/services/audio/my-provider.service.ts`
2. Implement the `AudioService` interface
3. Update the `AudioServiceFactory` in `src/services/audio/index.ts`
4. Add configuration options to `AudioServiceConfig`
5. Update this documentation
6. Add tests to `examples/test-audio-services.ts`

## License

ISC
