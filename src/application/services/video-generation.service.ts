import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import process from 'node:process'

/**
 * Video Generation Service — application-layer service.
 * Integrates the sketch-pilot NanoBananaEngine into the backend DDD architecture.
 * Used by the BullMQ worker to execute video generation jobs.
 */
import { NanoBananaEngine } from '@sketch-pilot/core/nano-banana-engine'
import { PromptService } from '@/application/services/prompt.service'
import { redisClient } from '@/infrastructure/config/queue.config'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import type { AnimationServiceConfig } from '@sketch-pilot/services/animation'
import type { AudioServiceConfig } from '@sketch-pilot/services/audio'
import type { ImageServiceConfig } from '@sketch-pilot/services/image'
import type { LLMServiceConfig } from '@sketch-pilot/services/llm'
import type { CompleteVideoPackage, LLMProvider, VideoGenerationOptions } from '@sketch-pilot/types/video-script.types'

export interface VideoGenerationInput {
  videoId?: string
  topic: string
  userId?: string
  options?: Partial<VideoGenerationOptions>
  onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>
  onTimingSync?: (script: any) => Promise<void>
  onSceneGenerated?: (scene: any, script: any, index: number, progress: number) => Promise<void>
}

export class VideoGenerationService {
  private readonly promptService = new PromptService(new PromptRepository())

  constructor() {}

  private async buildEngine(options: Partial<VideoGenerationOptions> = {}): Promise<NanoBananaEngine> {
    const apiKey = process.env.GEMINI_API_KEY || ''

    // 1. Resolve Spec from DB
    const scriptSpec = await this.promptService.resolveSpec((options as any).promptId)

    // 2. Resolve Voice
    const effectiveVoiceId = options.kokoroVoicePreset as string | undefined

    const audioConfig: AudioServiceConfig = {
      provider: (options.audioProvider as AudioServiceConfig['provider']) || 'kokoro',
      lang: options.language || 'en',
      apiKey: process.env.HUGGING_FACE_TOKEN || apiKey,
      kokoroVoicePreset: effectiveVoiceId
    }

    const animationConfig: AnimationServiceConfig = {
      provider: 'veo',
      apiKey
    }

    const imageConfig: ImageServiceConfig = {
      provider: (options.imageProvider as ImageServiceConfig['provider']) || 'gemini',
      apiKey: options.imageProvider === 'grok' ? process.env.XAI_API_KEY || apiKey : apiKey
    }

    const llmProvider = (options.llmProvider as LLMProvider) || 'gemini'
    const llmApiKey =
      llmProvider === 'openai'
        ? process.env.OPENAI_API_KEY
        : llmProvider === 'claude' || llmProvider === 'haiku'
          ? process.env.ANTHROPIC_API_KEY
          : llmProvider === 'grok'
            ? process.env.XAI_API_KEY
            : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

    const llmConfig: LLMServiceConfig = {
      provider: llmProvider,
      apiKey: llmApiKey || '',
      cacheSystemPrompt: true
    }

    // NanoBananaEngine constructor
    return new NanoBananaEngine(
      apiKey,
      undefined, // systemPrompt
      audioConfig,
      animationConfig,
      imageConfig,
      llmConfig,
      undefined, // transcriptionConfig
      {
        scriptSpec: scriptSpec as any,
        characterModelId: options.characterModelId
      }
    )
  }

  /**
   * Generate a complete video from a topic.
   */
  async generateVideo(input: VideoGenerationInput & { projectId?: string }): Promise<CompleteVideoPackage> {
    const { topic, options = {}, projectId, onProgress, videoId } = input
    const engine = await this.buildEngine(options)

    if (videoId) {
      await redisClient.del(`cancel-video-${videoId}`)
    }

    const wrappedOnProgress = async (progress: number, message: string, metadata?: Record<string, any>) => {
      if (videoId) {
        const isCancelled = await redisClient.get(`cancel-video-${videoId}`)
        if (isCancelled) {
          console.warn(`[VideoGenerationService] Aborting generation for video ${videoId}`)
          throw new Error('Generation cancelled by user')
        }
      }
      if (onProgress) {
        await onProgress(progress, message, metadata)
      }
    }

    return await engine.generateVideoFromTopic(
      topic,
      options as VideoGenerationOptions,
      [],
      projectId,
      wrappedOnProgress,
      input.onTimingSync,
      input.onSceneGenerated
    )
  }

  /**
   * Render a video directly from an existing script.
   */
  async renderVideoFromScript(
    input: VideoGenerationInput & { script: any; projectId?: string }
  ): Promise<CompleteVideoPackage> {
    const { script, options = {}, projectId, onProgress, videoId } = input
    const engine = await this.buildEngine(options)

    if (videoId) {
      await redisClient.del(`cancel-video-${videoId}`)
    }

    const wrappedOnProgress = async (progress: number, message: string, metadata?: Record<string, any>) => {
      if (videoId) {
        const isCancelled = await redisClient.get(`cancel-video-${videoId}`)
        if (isCancelled) {
          console.warn(`[VideoGenerationService] Aborting rendering for video ${videoId}`)
          throw new Error('Generation cancelled by user')
        }
      }
      if (onProgress) {
        await onProgress(progress, message, metadata)
      }
    }

    return await engine.generateVideoFromScript(
      script,
      options as VideoGenerationOptions,
      [],
      projectId,
      wrappedOnProgress,
      input.onTimingSync
    )
  }

  /**
   * Stop an ongoing video generation.
   */
  async stopGeneration(videoId: string): Promise<void> {
    const key = `cancel-video-${videoId}`
    await redisClient.set(key, 'true', 'EX', 3600)
    console.info(`[VideoGenerationService] Marked video ${videoId} for cancellation`)
  }

  /**
   * Robustly fetch an image as a Buffer.
   */
  private async fetchImageBuffer(urlOrPath: string): Promise<Buffer> {
    if (urlOrPath.startsWith('http')) {
      const response = await fetch(urlOrPath)
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`)
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }
    return await fs.readFile(urlOrPath)
  }
}
