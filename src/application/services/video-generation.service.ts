import { Buffer } from 'node:buffer'
import process from 'node:process'

/**
 * Video Generation Service — application-layer service.
 * Integrates the sketch-pilot NanoBananaEngine into the backend DDD architecture.
 * Used by the BullMQ worker to execute video generation jobs.
 */
import { NanoBananaEngine } from '@sketch-pilot/core/nano-banana-engine'
import { getCharacterModelManager } from '@sketch-pilot/utils/character-models'
import { PromptService } from '@/application/services/prompt.service'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import type { AnimationServiceConfig } from '@sketch-pilot/services/animation'
import type { AudioServiceConfig } from '@sketch-pilot/services/audio'
import type { ImageServiceConfig } from '@sketch-pilot/services/image'
import type { LLMServiceConfig } from '@sketch-pilot/services/llm'
import type { CompleteVideoPackage, VideoGenerationOptions } from '@sketch-pilot/types/video-script.types'

export interface VideoGenerationInput {
  topic: string
  userId?: string
  options?: Partial<VideoGenerationOptions>
}

export class VideoGenerationService {
  private readonly promptService = new PromptService(new PromptRepository())
  private readonly characterModelRepository = new CharacterModelRepository()

  /**
   * Configure the engine with database-backed character models
   */
  private configureCharacterLoader(): void {
    const manager = getCharacterModelManager()
    manager.setExternalLoader(async (name: string) => {
      const dbModel = await this.characterModelRepository.findByName(name)
      if (!dbModel) return null

      if (dbModel.imageUrl) {
        try {
          const response = await fetch(dbModel.imageUrl)
          const buffer = await response.arrayBuffer()
          return {
            name: dbModel.name,
            path: dbModel.imageUrl,
            base64: Buffer.from(buffer).toString('base64'),
            mimeType: dbModel.mimeType || 'image/jpeg'
          }
        } catch (error) {
          console.error(`[VideoService] Failed to fetch model image from ${dbModel.imageUrl}:`, error)
        }
      }

      return null
    })
  }

  private buildEngine(options: Partial<VideoGenerationOptions> = {}): NanoBananaEngine {
    // Ensure loader is configured
    this.configureCharacterLoader()

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
      apiKey: options.imageProvider === 'grok' ? process.env.XAI_API_KEY || apiKey : apiKey
    }

    const llmConfig: LLMServiceConfig = {
      provider: (options.llmProvider as LLMServiceConfig['provider']) || 'gemini',
      apiKey,
      cacheSystemPrompt: true
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
      undefined // transcriptionConfig
    )
  }

  /**
   * Generate a complete video from a topic.
   * This is the main entry point used by the BullMQ worker.
   */
  async generateVideo(input: VideoGenerationInput & { projectId?: string }): Promise<CompleteVideoPackage> {
    const { topic, options = {}, projectId } = input
    const engine = this.buildEngine(options)
    return await engine.generateVideoFromTopic(topic, options, [], projectId)
  }

  /**
   * Render a video directly from an existing script.
   * This bypasses the LLM generation phase and is used for manually validated scripts.
   */
  async renderVideoFromScript(
    input: VideoGenerationInput & { script: any; projectId?: string }
  ): Promise<CompleteVideoPackage> {
    const { script, options = {}, projectId } = input
    const engine = this.buildEngine(options)
    return await engine.generateVideoFromScript(script, options, [], projectId)
  }
}
