# Stickman Generator - Project Structure

This project has been reorganized for better maintainability, modularity, and ease of switching between services.

---

## 📊 **NEW: Strategic Analyses Available**

A comprehensive market, competitive, and pricing strategy analysis has been completed.

### 🎯 Main Documents

- **[🚀 ANALYSIS_MVP.md](./docs/ANALYSIS_MVP.md)** - MVP analysis of video generation engine (no UI/API) ⚡ **NEW**
- **[📖 ANALYSIS_COMPLETE.md](./docs/ANALYSIS_COMPLETE.md)** - Consolidated main document (⚡ START HERE)
- **[💼 BUSINESS_ANALYSIS.md](./docs/BUSINESS_ANALYSIS.md)** - Market, opportunities, personas
- **[🏆 COMPETITIVE_ANALYSIS.md](./docs/COMPETITIVE_ANALYSIS.md)** - 6 competitors analyzed, positioning
- **[💰 WINNING_PRICING_STRATEGY.md](./docs/WINNING_PRICING_STRATEGY.md)** - Profitable pricing strategy

### ⚠️ Key Insight

The current pricing strategy ($9-19/month) generates **negative margins** and is not viable. A new value-based strategy ($49-399/month) with 60%+ positive margins is proposed.

**Impact**: From -$48K/year (losing) to +$1.3M/year (profitable) on 1,000 customers.

👉 **[See all analyses in /docs](./docs/README.md)**

---

## 📁 Directory Structure

```
stickman-generator/
├── src/                          # Source code
│   ├── core/                     # Core engine and generators
│   │   ├── nano-banana-engine.ts # Main video generation engine
│   │   ├── video-script-generator.ts
│   │   └── prompt-generator.ts
│   ├── services/                 # Service implementations
│   │   ├── animation/           # Animation service providers
│   │   │   ├── index.ts         # Factory and interface
│   │   │   ├── grok-animation.service.ts
│   │   │   └── veo-animation.service.ts
│   │   ├── audio/               # Audio/TTS service providers
│   │   │   ├── index.ts         # Factory and interface
│   │   │   └── demo-audio.service.ts
│   │   └── video/               # Video processing services
│   │       └── video-assembler.service.ts
│   ├── types/                    # Type definitions and schemas
│   │   └── video-script.types.ts
│   ├── utils/                    # Utility functions
│   │   └── task-queue.ts
│   └── index.ts                  # Main export file
├── examples/                     # Example usage
│   └── video-generation-demo.ts
├── models/                       # Reference images (kept for compatibility)
├── docs/                         # Documentation
└── output/                       # Generated videos and assets

```

## 🎯 Key Improvements

### 1. Video Types & Genres (Inspired by shortsbot.ai) 🎬

The project now supports **9 video types** and **16 video genres** to create targeted content for different audiences and purposes, similar to shortsbot.ai's approach.

#### Available Video Types

- **faceless** - Faceless videos with narration and visuals
- **tutorial** - Step-by-step how-to guides  
- **listicle** - Top 5/10 lists, facts, rankings
- **news** - News recaps, trending topics
- **animation** - Motion graphics and animations
- **review** - Product reviews and recommendations
- **story** - Narratives, urban legends, mini-mysteries
- **motivational** - Inspirational quotes and affirmations
- **entertainment** - Memes, trends, funny content

#### Available Video Genres/Niches

- **educational** - Learning and knowledge
- **fun** - Fun and engaging entertainment content
- **business** - Business tips, entrepreneurship
- **lifestyle** - Daily life, productivity, wellness
- **tech** - Technology and gadgets
- **finance** - Money, investing, personal finance
- **health** - Health and fitness
- **travel** - Travel tips and destinations
- **food** - Recipes and food content
- **gaming** - Gaming content and tips
- **sports** - Sports news and analysis
- **science** - Scientific facts and discoveries
- **history** - Historical facts and stories
- **self-improvement** - Personal development
- **mystery** - Mysteries and unsolved cases
- **general** - General interest content

#### Using Video Types & Genres

```typescript
import { VideoGenerationOptions } from './src/types/video-script.types';

const options: VideoGenerationOptions = {
    // duration range support - the engine will try to hit the max value
    minDuration: 50,
    maxDuration: 70,
    sceneCount: 6,
    style: 'educational',
    videoType: 'tutorial',        // Specify video type
    videoGenre: 'tech',           // Specify video genre
    characterConsistency: true,
    animationClipDuration: 6,
    animationMode: 'ai',
    // You can optionally tag each scene with a `contextType` such as
    // 'story', 'quick-list' or 'transition' to help the duration model
    // estimate scene lengths. It will still work without these labels.
    autoTransitions: true  // if true (default), missing transitions are assigned at random
};

const script = await engine.generateStructuredScript(
    "How to Build Your First AI App",
    options
);
```

**Examples:**
- Tutorial + Tech: "5 Steps to Master Python"
- Listicle + Business: "Top 10 Productivity Hacks for Entrepreneurs"
- Story + Mystery: "The Unsolved Case That Baffled Detectives"
- Review + Health: "Why This Fitness Tracker is Worth It"

📖 **For complete documentation, see [docs/VIDEO_TYPES_GENRES.md](docs/VIDEO_TYPES_GENRES.md)**

### 2. Service Abstraction with Factory Pattern

The project now uses the **Factory Pattern** to abstract service implementations, making it easy to switch between different providers.

#### Animation Services

```typescript
import { AnimationServiceFactory, AnimationServiceConfig } from './services/animation';

// Configure which animation provider to use
const animationConfig: AnimationServiceConfig = {
    provider: 'veo',  // or 'grok'
    apiKey: 'your-api-key'
};

// Create the service
const animationService = AnimationServiceFactory.create(animationConfig);
```

**Available Animation Providers:**
- `veo` - Google's Veo 3.1 API (default)
- `grok` - xAI's Grok Imagine API

#### Audio Services

```typescript
import { AudioServiceFactory, AudioServiceConfig } from './services/audio';

// Configure which audio provider to use
const audioConfig: AudioServiceConfig = {
    provider: 'demo',  // 'demo', 'google-tts', 'elevenlabs'
    lang: 'en'
};

// Create the service
const audioService = AudioServiceFactory.create(audioConfig);
```

**Available Audio Providers:**
- `demo` - Free Google Translate TTS (implemented)
- `google-tts` - Google Cloud Text-to-Speech (✅ **implemented**)
- `elevenlabs` - ElevenLabs TTS (✅ **implemented**)
- `openai-tts` - OpenAI TTS (not yet implemented)

**Google Cloud TTS Configuration:**
```typescript
const audioConfig: AudioServiceConfig = {
    provider: 'google-tts',
    apiKey: process.env.GOOGLE_TTS_API_KEY,
    lang: 'en-US',                           // Language code (e.g., 'en-US', 'fr-FR', 'es-ES')
    voiceName: 'en-US-Neural2-C',           // Optional: specific voice name
    audioEncoding: 'MP3'                     // Optional: 'MP3', 'LINEAR16', 'OGG_OPUS'
};
```

**ElevenLabs TTS Configuration:**
```typescript
const audioConfig: AudioServiceConfig = {
    provider: 'elevenlabs',
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: 'EXAVITQu4vr4xnSDxMaL',       // Voice ID (default: Bella)
    modelId: 'eleven_monolingual_v1'        // Model ID
};
```

> 📖 **For detailed audio service documentation, see [docs/AUDIO_SERVICES.md](docs/AUDIO_SERVICES.md)**

### 2. Improved Main Engine

The `NanoBananaEngine` now accepts service configurations in its constructor:

```typescript
import { NanoBananaEngine } from './core/nano-banana-engine';

const engine = new NanoBananaEngine(
    apiKey,
    styleSuffix,
    systemPrompt,
    audioConfig,      // Optional: defaults to demo audio
    animationConfig   // Optional: defaults to veo
);
```

### 3. Organized File Structure

- **Core**: Main business logic and generators
- **Services**: Pluggable service implementations
- **Types**: Shared type definitions
- **Utils**: Utility functions like task queue

## 🚀 Usage

### Basic Usage

```typescript
import { 
    NanoBananaEngine,
    AnimationServiceConfig,
    AudioServiceConfig 
} from './src';

// Configure services
const audioConfig: AudioServiceConfig = {
    provider: 'demo',
    lang: 'en'
};

const animationConfig: AnimationServiceConfig = {
    provider: 'veo',
    apiKey: process.env.GOOGLE_API_KEY
};

// Initialize engine
const engine = new NanoBananaEngine(
    apiKey,
    styleSuffix,
    systemPrompt,
    audioConfig,
    animationConfig
);

// Generate video
const videoPackage = await engine.generateVideoFromTopic(
    "Your video topic",
    { 
        // simple single duration or use range as shown earlier:
        duration: 60,
        sceneCount: 6,
        style: 'motivational',
        animationMode: 'ai'
    },
    baseImages
);
```

### Scene Timing and Context

A new **scene-duration model** calculates suggested lengths based on word
count and an optional `contextType` label.  The formula is:

```
base = words / 2.5
factor = {
  quick-list:0.8, transition:0.7, story:1.0,
  explanation:1.2, detailed-breakdown:1.4, conclusion:0.9
}[context]
suggested = clamp(base * factor, 3, 30)
```

Audio coverage (audio-duration / video-duration) is then kept within 0.9–1.1.


### Adding Text Overlays

Add text overlays to your videos at classic positions (top, center, bottom, etc.):

```typescript
import { VideoGenerationOptions } from './src/types/video-script.types';

const options: VideoGenerationOptions = {
    // you can also provide a range [min,max] instead of a single duration
    // minDuration: 55,
    // maxDuration: 65,
    duration: 60,
    sceneCount: 6,
    style: 'motivational',
    animationMode: 'ai',
    textOverlay: {
        enabled: true,
        position: 'bottom',          // 'top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'
        fontSize: 48,                // Font size in pixels
        fontColor: 'white',          // Text color
        backgroundColor: 'black@0.7', // Background color with transparency
        fontFamily: 'Arial',         // Font family
        maxCharsPerLine: 40          // Maximum characters per line before wrapping
    }
};

const videoPackage = await engine.generateVideoFromTopic(
    "Your video topic",
    options,
    baseImages
);
```

**Text Overlay Positions:**
- `top` - Centered at the top (classic for titles)
- `center` - Centered in the middle (classic for emphasis)
- `bottom` - Centered at the bottom (classic for captions/subtitles)
- `top-left`, `top-right` - Corner positions
- `bottom-left`, `bottom-right` - Corner positions

The narration text from each scene will be automatically overlaid on the video at the specified position.

### Switching Between Services

To switch between animation providers, simply change the configuration:

```typescript
// Use Grok instead of Veo
const animationConfig: AnimationServiceConfig = {
    provider: 'grok',  // Changed from 'veo'
    apiKey: process.env.XAI_API_KEY
};
```

## 🔨 Building

```bash
npm install
npm run build
```

The compiled output will be in the `dist/` directory.

## 📦 Running Examples

### Basic Video Generation
```bash
npm run demo:video
```

### Video Types & Genres Demo
```bash
npm run demo:types
```

This interactive demo showcases the new video types and genres feature inspired by shortsbot.ai.

### Text Overlay Demo
```bash
npm run demo:text
```

This demo showcases the text overlay feature with captions at classic video positions.

## 🔄 Migration from Old Structure

The old structure (`models/` directory) is still present for reference but is no longer used by the build system. All new code should use the `src/` directory structure.

### Old Import Paths
```typescript
import { NanoBananaEngine } from './models/nano-banana-engine';
import { VideoScriptGenerator } from './models/video-script-generator';
```

### New Import Paths
```typescript
import { NanoBananaEngine } from './src/core/nano-banana-engine';
import { VideoScriptGenerator } from './src/core/video-script-generator';
// Or use the main export
import { NanoBananaEngine, VideoScriptGenerator } from './src';
```

## 🎨 Adding New Service Providers

### Adding a New Animation Provider

1. Create a new service file in `src/services/animation/`:
```typescript
// my-animation.service.ts
import { AnimationService } from './index';

export class MyAnimationService implements AnimationService {
    async animateImage(imagePath: string, prompt: string, duration: number, outputPath: string): Promise<string> {
        // Your implementation
    }
}
```

2. Update the factory in `src/services/animation/index.ts`:
```typescript
export type AnimationProvider = 'grok' | 'veo' | 'my-provider';

static create(config: AnimationServiceConfig): AnimationService {
    switch (config.provider) {
        case 'my-provider':
            const { MyAnimationService } = require('./my-animation.service');
            return new MyAnimationService(config.apiKey);
        // ... other cases
    }
}
```

### Adding a New Audio Provider

Follow the same pattern in `src/services/audio/`.

## 📝 License

ISC
