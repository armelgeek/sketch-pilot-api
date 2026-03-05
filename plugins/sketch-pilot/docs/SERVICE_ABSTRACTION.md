# Service Abstraction Pattern Guide

This document explains how the service abstraction pattern is implemented in the Stickman Generator project and how to use it.

## Overview

The project uses the **Factory Pattern** to abstract service implementations. This makes it easy to:
- Switch between different service providers without changing business logic
- Add new service providers without modifying existing code
- Test components in isolation by mocking services
- Configure services at runtime

## Architecture

```
┌─────────────────┐
│ NanoBananaEngine│
└────────┬────────┘
         │
         │ uses
         │
    ┌────▼────────────────────────────┐
    │  Service Factories              │
    │  (AnimationServiceFactory,      │
    │   AudioServiceFactory)          │
    └────┬────────────────────────────┘
         │
         │ creates
         │
    ┌────▼────────────────────────────┐
    │  Service Implementations        │
    │  - GrokAnimationService         │
    │  - VeoAnimationService          │
    │  - DemoAudioService             │
    │  - (future implementations)     │
    └─────────────────────────────────┘
```

## Components

### 1. Service Interface

Defines the contract that all implementations must follow:

```typescript
// src/services/animation/index.ts
export interface AnimationService {
    animateImage(
        imagePath: string, 
        prompt: string, 
        duration: number, 
        outputPath: string
    ): Promise<string>;
}
```

### 2. Service Configuration

Type-safe configuration for service creation:

```typescript
export type AnimationProvider = 'grok' | 'veo';

export interface AnimationServiceConfig {
    provider: AnimationProvider;
    apiKey?: string;
}
```

### 3. Service Factory

Creates service instances based on configuration:

```typescript
export class AnimationServiceFactory {
    static create(config: AnimationServiceConfig): AnimationService {
        switch (config.provider) {
            case 'grok':
                const { GrokAnimationService } = require('./grok-animation.service');
                return new GrokAnimationService(config.apiKey);
            case 'veo':
                const { VeoAnimationService } = require('./veo-animation.service');
                return new VeoAnimationService(config.apiKey);
            default:
                throw new Error(`Unknown animation provider: ${config.provider}`);
        }
    }
}
```

### 4. Service Implementations

Concrete implementations of the service interface:

```typescript
// src/services/animation/veo-animation.service.ts
export class VeoAnimationService implements AnimationService {
    async animateImage(
        imagePath: string, 
        prompt: string, 
        duration: number, 
        outputPath: string
    ): Promise<string> {
        // Implementation using Google Veo API
    }
}
```

## Usage Examples

### Basic Usage

```typescript
import { AnimationServiceFactory } from './src/services/animation';

// Configure the service
const config = {
    provider: 'veo',
    apiKey: process.env.GOOGLE_API_KEY
};

// Create the service
const animationService = AnimationServiceFactory.create(config);

// Use the service
const result = await animationService.animateImage(
    'input.png',
    'Animate the stickman waving',
    6,
    'output.mp4'
);
```

### With Dependency Injection

```typescript
class VideoGenerator {
    constructor(
        private animationService: AnimationService,
        private audioService: AudioService
    ) {}

    async generate() {
        // Use services
        await this.animationService.animateImage(...);
        await this.audioService.generateSpeech(...);
    }
}

// Inject services
const generator = new VideoGenerator(
    AnimationServiceFactory.create({ provider: 'veo', apiKey: '...' }),
    AudioServiceFactory.create({ provider: 'demo' })
);
```

### Runtime Configuration

```typescript
// Load configuration from environment or config file
const animationProvider = process.env.ANIMATION_PROVIDER || 'veo';
const audioProvider = process.env.AUDIO_PROVIDER || 'demo';

const engine = new NanoBananaEngine(
    apiKey,
    styleSuffix,
    systemPrompt,
    { provider: audioProvider as AudioProvider },
    { provider: animationProvider as AnimationProvider, apiKey }
);
```

## Benefits

### 1. Easy Provider Switching

Switch between providers with a single configuration change:

```typescript
// Before: Using Veo
const config = { provider: 'veo', apiKey: googleKey };

// After: Using Grok
const config = { provider: 'grok', apiKey: xaiKey };
```

### 2. Type Safety

TypeScript ensures you're using valid providers:

```typescript
// ✅ Valid
const config: AnimationServiceConfig = { provider: 'veo', apiKey: '...' };

// ❌ Compile error - 'invalid' is not a valid provider
const config: AnimationServiceConfig = { provider: 'invalid', apiKey: '...' };
```

### 3. Testability

Easy to mock services for testing:

```typescript
class MockAnimationService implements AnimationService {
    async animateImage() {
        return 'mock-output.mp4';
    }
}

// Use mock in tests
const engine = new NanoBananaEngine(
    apiKey,
    styleSuffix,
    systemPrompt,
    audioConfig,
    new MockAnimationService() // Inject mock
);
```

### 4. Extensibility

Add new providers without modifying existing code:

1. Create new implementation:
```typescript
// src/services/animation/my-animation.service.ts
export class MyAnimationService implements AnimationService {
    async animateImage(...) {
        // Your implementation
    }
}
```

2. Update factory:
```typescript
export type AnimationProvider = 'grok' | 'veo' | 'my-provider';

static create(config: AnimationServiceConfig): AnimationService {
    switch (config.provider) {
        case 'my-provider':
            const { MyAnimationService } = require('./my-animation.service');
            return new MyAnimationService(config.apiKey);
        // ... existing cases
    }
}
```

3. Use it:
```typescript
const service = AnimationServiceFactory.create({ 
    provider: 'my-provider', 
    apiKey: '...' 
});
```

## Best Practices

### 1. Keep Interfaces Minimal

Only include methods that are common to all implementations:

```typescript
// ✅ Good - minimal interface
interface AnimationService {
    animateImage(...): Promise<string>;
}

// ❌ Bad - provider-specific method
interface AnimationService {
    animateImage(...): Promise<string>;
    getGrokSpecificOption(): string; // Only Grok has this
}
```

### 2. Use Configuration Objects

Pass configuration as objects for flexibility:

```typescript
// ✅ Good - flexible
interface ServiceConfig {
    provider: string;
    apiKey?: string;
    options?: Record<string, any>;
}

// ❌ Bad - rigid
function create(provider: string, apiKey: string, option1: string, option2: number)
```

### 3. Fail Fast

Validate configuration early:

```typescript
static create(config: AnimationServiceConfig): AnimationService {
    if (!config.provider) {
        throw new Error('Provider is required');
    }
    
    // Create service...
}
```

### 4. Document Provider Capabilities

```typescript
/**
 * Animation Service Factory
 * 
 * Supported providers:
 * - 'veo': Google Veo 3.1 API (4-8 seconds, 720p)
 * - 'grok': xAI Grok Imagine API (1-10 seconds, variable resolution)
 */
export class AnimationServiceFactory { ... }
```

## Comparison with Direct Instantiation

### Before (Direct Instantiation)

```typescript
// Hard-coded dependency
import { VeoAnimationService } from './veo-animation.service';

class Engine {
    private animation = new VeoAnimationService(); // Hard-coded
    
    async generate() {
        await this.animation.animateImage(...);
    }
}

// Problem: To switch providers, need to modify Engine class
```

### After (Factory Pattern)

```typescript
// Abstracted dependency
import { AnimationService, AnimationServiceFactory } from './services/animation';

class Engine {
    constructor(
        private animation: AnimationService // Interface, not implementation
    ) {}
    
    async generate() {
        await this.animation.animateImage(...);
    }
}

// Benefit: Switch providers without modifying Engine
const engine1 = new Engine(AnimationServiceFactory.create({ provider: 'veo' }));
const engine2 = new Engine(AnimationServiceFactory.create({ provider: 'grok' }));
```

## Future Enhancements

### 1. Service Registry

```typescript
class ServiceRegistry {
    private static services = new Map<string, any>();
    
    static register(name: string, factory: () => any) {
        this.services.set(name, factory);
    }
    
    static get(name: string) {
        const factory = this.services.get(name);
        if (!factory) throw new Error(`Service ${name} not found`);
        return factory();
    }
}
```

### 2. Async Factory Methods

```typescript
static async createAsync(config: ServiceConfig): Promise<Service> {
    // Load configuration from remote source
    const remoteConfig = await fetchConfig(config.provider);
    return this.create({ ...config, ...remoteConfig });
}
```

### 3. Service Composition

```typescript
class CompositeAnimationService implements AnimationService {
    constructor(
        private primary: AnimationService,
        private fallback: AnimationService
    ) {}
    
    async animateImage(...) {
        try {
            return await this.primary.animateImage(...);
        } catch (error) {
            return await this.fallback.animateImage(...);
        }
    }
}
```

## Conclusion

The service abstraction pattern makes the codebase:
- **Flexible**: Easy to switch providers
- **Maintainable**: Changes are localized
- **Testable**: Easy to mock and test
- **Extensible**: New providers can be added easily

For questions or issues, please refer to the main README or open an issue on GitHub.
