import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
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
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
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
  private readonly seriesRepository = new SeriesRepository()
  private readonly videoRepository = new VideoRepository()

  constructor() {}

  private async buildEngine(
    options: Partial<VideoGenerationOptions> = {},
    videoId?: string
  ): Promise<NanoBananaEngine | null> {
    const apiKey = process.env.GEMINI_API_KEY || ''

    // 1. Resolve Spec from DB
    const scriptSpec = await this.promptService.resolveSpec((options as any).promptId)

    // 1.5. Resolve Registries and Series Context
    let seriesContext = undefined
    let videoRecord = undefined

    if (videoId) {
      videoRecord = await this.videoRepository.findById(videoId)
    }

    const seriesId = options.seriesId || (options as any).seriesContext?.seriesId || videoRecord?.seriesId
    if (seriesId) {
      seriesContext = await this.seriesRepository.getSeriesContext(seriesId)

      // Arc Welding: Extract the pitch for the specific episode number
      if (seriesContext && seriesContext.plannedEpisodes && videoRecord?.episodeNumber !== undefined) {
        const currentPitch = seriesContext.plannedEpisodes.find((p) => Number(p.number) === videoRecord.episodeNumber)
        if (currentPitch) {
          seriesContext.currentEpisodePitch = currentPitch.hook || currentPitch.title
        }

        // Dynamic Pacing: Determine if this is the end of the road
        const total = seriesContext.totalEpisodes || 0
        seriesContext.isFinalEpisode = videoRecord.episodeNumber >= total && total > 0

        // V16: Pass the whole plan for foreshadowing
        seriesContext.plannedEpisodes = seriesContext.plannedEpisodes || []
      }
    }
    // 2. Resolve Voice
    const effectiveVoiceId = options.kokoroVoicePreset as string | undefined

    let provider = (options.audioProvider as AudioServiceConfig['provider']) || 'elevenlabs'
    // Banni Kokoro : Forcer ElevenLabs coûte que coûte
    if ((provider as string) === 'kokoro') provider = 'elevenlabs'

    const audioConfig: AudioServiceConfig = {
      provider,
      lang: options.language || 'en',
      apiKey:
        provider === 'kokoro' ? process.env.HUGGING_FACE_TOKEN || apiKey : process.env.ELEVENLABS_API_KEY || apiKey,
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

    const llmProvider = (options.llmProvider as LLMProvider) || 'openai'
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

    // Unify registries (Series + Standalone) to ensure absolute identity locking
    // Series Bible takes precedence over local video snapshots
    const unifiedRegistries = {
      characterRegistry: {
        ...(videoRecord?.characterRegistry || {}),
        ...(seriesContext?.characterRegistry || {})
      },
      locationRegistry: {
        ...(videoRecord?.locationRegistry || {}),
        ...(seriesContext?.locationRegistry || {})
      },
      assetRegistry: {
        ...(videoRecord?.assetRegistry || {}),
        ...(seriesContext?.assetRegistry || {})
      }
    }

    console.info(
      `[VideoGenerationService] Unified Registry -> Characters: ${Object.keys(unifiedRegistries.characterRegistry).length}, Locations: ${Object.keys(unifiedRegistries.locationRegistry).length}, Assets: ${Object.keys(unifiedRegistries.assetRegistry).length}`
    )

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
        characterModelId: options.characterModelId,
        seriesContext: seriesContext as any,
        // Standalone registries (now unified)
        characterRegistry: unifiedRegistries.characterRegistry,
        locationRegistry: unifiedRegistries.locationRegistry,
        assetRegistry: unifiedRegistries.assetRegistry
      }
    )
  }

  /**
   * Generate a complete video from a topic.
   */
  async generateVideo(input: VideoGenerationInput & { projectId?: string }): Promise<CompleteVideoPackage> {
    const { topic, options = {}, projectId, onProgress, videoId } = input
    const engine = await this.buildEngine(options, videoId)
    if (!engine) throw new Error('Failed to initialize video generation engine')

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
   * Only generate the script (Pass 1 & Pass 2).
   */
  async generateScriptOnly(input: VideoGenerationInput): Promise<any> {
    const { topic, options = {}, videoId } = input
    const engine = await this.buildEngine(options, videoId)
    if (!engine) throw new Error('Failed to initialize script generation engine')
    const data = await engine.generateStructuredScript(topic, options, async (p, m) => {
      if (input.onProgress) await input.onProgress(p, m)
    })
    console.log('[...........DATA............]', data)
    return data
  }

  /**
   * Render a video directly from an existing script.
   */
  async renderVideoFromScript(
    input: VideoGenerationInput & { script: any; projectId?: string }
  ): Promise<CompleteVideoPackage> {
    const { script, options = {}, projectId, onProgress, videoId } = input
    const engine = await this.buildEngine(options, videoId)
    if (!engine) throw new Error('Failed to initialize video rendering engine')

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
      input.onTimingSync,
      input.onSceneGenerated
    )
  }

  /**
   * Stop an ongoing video generation.
   */
  async stopGeneration(videoId: string): Promise<void> {
    const key = `cancel-video-${videoId}`
    await redisClient.set(key, 'true', 'EX', 3600)
  }

  /**
   * Generate AI thumbnails.
   */
  async generateThumbnails(input: {
    title: string
    inspirationUrl?: string
    options?: Partial<VideoGenerationOptions>
    outputDir?: string
    count?: number
    videoId?: string
  }): Promise<string[]> {
    const { title, inspirationUrl, options = {}, outputDir, count, videoId } = input
    const engine = await this.buildEngine(options, videoId)
    if (!engine) throw new Error('Failed to initialize thumbnail generation engine')
    return await engine.generateAIThumbnail(title, inspirationUrl, outputDir, count)
  }

  /**
   * Generate a single character image.
   */
  async generateCharacterImage(input: {
    prompt: string
    baseModelId: string
    outputDir?: string
    videoId?: string
  }): Promise<string> {
    const { prompt, baseModelId, outputDir, videoId } = input
    const engine = await this.buildEngine({ characterModelId: baseModelId }, videoId)
    if (!engine) throw new Error('Failed to initialize character generation engine')

    const tempDir = outputDir || path.join(process.cwd(), 'uploads', 'temp', `char-${Date.now()}`)
    if (!(await fs.stat(tempDir).catch(() => null))) {
      await fs.mkdir(tempDir, { recursive: true })
    }

    const filename = path.join(tempDir, 'character.webp')

    // Create a minimal scene for the engine to generate the image
    const scene: any = {
      id: 'char-gen',
      imagePrompt: `Character modification request: ${prompt}. Apply these modifications to the character over the reference image. Ignore strict character consistency if it conflicts with these modifications.`,
      locationId: 'studio'
    }

    const imageUrl = await engine.generateImage(scene, [], filename, true)
    return imageUrl
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
