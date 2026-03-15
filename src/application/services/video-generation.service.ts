import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import process from 'node:process'

/**
 * Video Generation Service — application-layer service.
 * Integrates the sketch-pilot NanoBananaEngine into the backend DDD architecture.
 * Used by the BullMQ worker to execute video generation jobs.
 */
import { NanoBananaEngine } from '@sketch-pilot/core/nano-banana-engine'
import { ImageServiceFactory, type ImageServiceConfig } from '@sketch-pilot/services/image'
import { getCharacterModelManager } from '@sketch-pilot/utils/character-models'
import { PromptService } from '@/application/services/prompt.service'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import type { AnimationServiceConfig } from '@sketch-pilot/services/animation'
import type { AudioServiceConfig } from '@sketch-pilot/services/audio'
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

  constructor() {
    this.initializeCharacterLoader()
  }

  private initializeCharacterLoader() {
    const manager = getCharacterModelManager()
    manager.setExternalLoader(async (identifier) => {
      let model = null
      if (identifier.id) {
        model = await this.characterModelRepository.findById(identifier.id)
      } else if (identifier.name) {
        model = await this.characterModelRepository.findByName(identifier.name)
      }

      // Fallback: search by metadata (Best-Fit Match)
      if (!model && (identifier.gender || identifier.age)) {
        console.log(
          `[VideoGenerationService] No model found for name "${identifier.name}". Trying metadata match: ${identifier.gender}, ${identifier.age}`
        )
        model = await this.characterModelRepository.findByMetadata(identifier.gender, identifier.age)
      }

      if (!model || !model.imageUrl) return null

      try {
        // Since we are backend-side (Node.js), we might need to fetch the image if it's a URL
        // or just return it if it's already a base64 string.
        // For now, let's assume imageUrl is what we need.
        // If it's a MinIO URL, we might need to fetch it.
        // But the engine expects base64 or a local path.
        // Considering "100% Dynamic", we'll just pass the URL if the engine supports it,
        // or fetch it here.

        // Let's check what CharacterModel interface expects:
        // export interface CharacterModel { name: string; path: string; base64: string; mimeType: string; }

        // If it's a URL, we should fetch it and convert to base64 for the AI service.
        const imageBuffer = await this.fetchImageBuffer(model.imageUrl)
        const base64 = imageBuffer.toString('base64')
        const dataUrl = `data:${model.mimeType || 'image/jpeg'};base64,${base64}`

        return {
          name: model.name,
          path: model.imageUrl,
          base64: dataUrl,
          mimeType: model.mimeType || 'image/jpeg'
        }
      } catch (error) {
        console.error(`[VideoGenerationService] Failed to load character model image: ${model.imageUrl}`, error)
        return null
      }
    })
  }

  private async buildEngine(options: Partial<VideoGenerationOptions> = {}): Promise<NanoBananaEngine> {
    const apiKey = process.env.GEMINI_API_KEY || ''

    // 1. Resolve Spec from DB
    const scriptSpec = await this.promptService.resolveSpec((options as any).promptId)

    // 2. Resolve Voice if Character is provided and no voice specified
    let effectiveVoiceId = options.kokoroVoicePreset as string | undefined
    if (!effectiveVoiceId && options.characterModelId) {
      const charModel = await this.characterModelRepository.findById(options.characterModelId)
      if (charModel?.voiceId) {
        effectiveVoiceId = charModel.voiceId
      }
    }

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

    const llmConfig: LLMServiceConfig = {
      provider: (options.llmProvider as LLMServiceConfig['provider']) || 'gemini',
      apiKey,
      cacheSystemPrompt: true
    }

    // NanoBananaEngine constructor: (apiKey, styleSuffix?, systemPrompt?, audioConfig?, animationConfig?, imageConfig?, llmConfig?, transcriptionConfig?, promptSpecs?)
    return new NanoBananaEngine(
      apiKey,
      undefined, // styleSuffix
      undefined, // systemPrompt
      audioConfig,
      animationConfig,
      imageConfig,
      llmConfig,
      undefined, // transcriptionConfig
      {
        scriptSpec: scriptSpec as any,
        imageSpec: scriptSpec as any // Unified: Using same spec for both phases
      }
    )
  }

  /**
   * Generate a complete video from a topic.
   * This is the main entry point used by the BullMQ worker.
   */
  async generateVideo(input: VideoGenerationInput & { projectId?: string }): Promise<CompleteVideoPackage> {
    const { topic, options = {}, projectId } = input
    const engine = await this.buildEngine(options)
    return await engine.generateVideoFromTopic(topic, options as VideoGenerationOptions, [], projectId)
  }

  /**
   * Render a video directly from an existing script.
   * This bypasses the LLM generation phase and is used for manually validated scripts.
   */
  async renderVideoFromScript(
    input: VideoGenerationInput & { script: any; projectId?: string }
  ): Promise<CompleteVideoPackage> {
    const { script, options = {}, projectId } = input
    const engine = await this.buildEngine(options)
    return await engine.generateVideoFromScript(script, options as VideoGenerationOptions, [], projectId)
  }

  /**
   * Generate a character reference image using a model as a style anchor.
   */
  async generateCharacterImage(prompt: string, modelId?: string): Promise<Buffer> {
    const apiKey = process.env.GEMINI_API_KEY || ''
    const imageConfig: ImageServiceConfig = {
      provider: 'gemini', // Use Gemini for high-quality character consistency
      apiKey
    }
    const imageService = ImageServiceFactory.create(imageConfig)

    const referenceImages: string[] = []
    if (modelId && modelId !== 'none') {
      const model = await this.characterModelRepository.findById(modelId)
      if (model?.imageUrl) {
        const imageBuffer = await this.fetchImageBuffer(model.imageUrl)
        referenceImages.push(imageBuffer.toString('base64'))
      }
    }

    const filename = `char-gen-${Date.now()}.png`
    const imageUrl = await imageService.generateImage(prompt, filename, {
      referenceImages,
      removeBackground: false,
      aspectRatio: '1:1',
      quality: 'high',
      systemInstruction:
        'Generate a high-quality character design illustration. Maintain the style of the reference image if provided.'
    })

    // Fetch the generated image and return as Buffer
    const buffer = await this.fetchImageBuffer(imageUrl)

    // If it was a local file, we might want to clean it up
    // Note: fetchImageBuffer doesn't delete the file, so we do it here if it's local
    if (!imageUrl.startsWith('http')) {
      await fs.unlink(imageUrl).catch(() => {})
    }

    return buffer
  }

  /**
   * Robustly fetch an image as a Buffer, handling both URLs and local paths.
   */
  private async fetchImageBuffer(urlOrPath: string): Promise<Buffer> {
    if (urlOrPath.startsWith('http')) {
      const response = await fetch(urlOrPath)
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`)
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }

    // Assume it's a local file path
    return await fs.readFile(urlOrPath)
  }
}
