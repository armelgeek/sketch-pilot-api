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
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { PromptService } from '@/application/services/prompt.service'

export interface VideoGenerationInput {
  topic: string
  userId?: string
  options?: Partial<VideoGenerationOptions>
}

export class VideoGenerationService {
  private readonly promptService = new PromptService(new PromptRepository())

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

    // Build a dynamic prompt loader that resolves prompts from the DB
    const promptService = this.promptService
    const promptLoader = async (
      promptType: string,
      context?: { videoType?: string; videoGenre?: string; language?: string },
      variables?: Record<string, string | number | boolean>
    ) => {
      return promptService.resolve({
        promptType: promptType as any,
        videoType: context?.videoType,
        videoGenre: context?.videoGenre,
        language: context?.language,
        variables: variables as any,
      })
    }

    // NanoBananaEngine constructor: (apiKey, styleSuffix?, systemPrompt?, audioConfig?, animationConfig?, imageConfig?, llmConfig?, transcriptionConfig?, promptLoader?)
    // styleSuffix and systemPrompt use their defaults (undefined → built-in defaults)
    return new NanoBananaEngine(
      apiKey,
      undefined, // styleSuffix — use engine default (overridable via DB prompt)
      undefined, // systemPrompt — use engine default (overridable via DB prompt)
      audioConfig,
      animationConfig,
      imageConfig,
      llmConfig,
      undefined, // transcriptionConfig
      promptLoader
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
