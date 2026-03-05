/**
 * Video Generation Service — application-layer service.
 * Integrates the sketch-pilot NanoBananaEngine into the backend DDD architecture.
 * Used by the BullMQ worker to execute video generation jobs.
 */
import { NanoBananaEngine } from '@sketch-pilot/core/nano-banana-engine'
import type { VideoGenerationOptions, CompleteVideoPackage } from '@sketch-pilot/types/video-script.types'
import type { LLMServiceConfig } from '@sketch-pilot/services/llm'
import type { AudioServiceConfig } from '@sketch-pilot/services/audio'
import type { AnimationServiceConfig } from '@sketch-pilot/services/animation'
import type { ImageServiceConfig } from '@sketch-pilot/services/image'

export interface VideoGenerationInput {
  topic: string
  userId?: string
  options?: Partial<VideoGenerationOptions>
}

export class VideoGenerationService {
  private buildEngine(options: Partial<VideoGenerationOptions> = {}): NanoBananaEngine {
    const apiKey = process.env.GEMINI_API_KEY || ''

    const audioConfig: AudioServiceConfig = {
      provider: (options.audioProvider as AudioServiceConfig['provider']) || 'kokoro',
      lang: options.language || 'en',
      apiKey: process.env.HUGGING_FACE_TOKEN || apiKey,
      // kokoroVoicePreset comes from options and may be a KokoroVoicePreset enum value
      kokoroVoicePreset: options.kokoroVoicePreset as string | undefined
    }

    const animationConfig: AnimationServiceConfig = {
      provider: 'veo',
      apiKey
    }

    const imageConfig: ImageServiceConfig = {
      provider: (options.imageProvider as ImageServiceConfig['provider']) || 'gemini',
      apiKey: options.imageProvider === 'grok' ? (process.env.XAI_API_KEY || apiKey) : apiKey
    }

    const llmConfig: LLMServiceConfig = {
      provider: (options.llmProvider as LLMServiceConfig['provider']) || 'gemini',
      apiKey,
      cacheSystemPrompt: true
    }

    // NanoBananaEngine constructor: (apiKey, styleSuffix?, systemPrompt?, audioConfig?, animationConfig?, imageConfig?, llmConfig?)
    // styleSuffix and systemPrompt use their defaults (undefined → built-in defaults)
    return new NanoBananaEngine(
      apiKey,
      undefined, // styleSuffix — use engine default
      undefined, // systemPrompt — use engine default
      audioConfig,
      animationConfig,
      imageConfig,
      llmConfig
    )
  }

  /**
   * Generate a complete video from a topic.
   * This is the main entry point used by the BullMQ worker.
   */
  async generateVideo(input: VideoGenerationInput): Promise<CompleteVideoPackage> {
    const { topic, options = {} } = input
    const engine = this.buildEngine(options)
    return engine.generateVideoFromTopic(topic, options)
  }
}
