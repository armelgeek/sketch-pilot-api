import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import process from 'node:process'

/**
 * Video Generation Service — application-layer service.
 * Integrates the sketch-pilot NanoBananaEngine into the backend DDD architecture.
 * Used by the BullMQ worker to execute video generation jobs.
 */
import { NanoBananaEngine } from '@sketch-pilot/core/nano-banana-engine'
import { VideoScriptGenerator } from '@sketch-pilot/core/video-script-generator'
import { ImageServiceFactory, type ImageServiceConfig } from '@sketch-pilot/services/image'
import { getCharacterModelManager } from '@sketch-pilot/utils/character-models'
import { PromptService } from '@/application/services/prompt.service'
import { checkpointService } from '@/application/services/video-checkpoint.service'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { AnimationServiceConfig } from '@sketch-pilot/services/animation'
import type { AudioServiceConfig } from '@sketch-pilot/services/audio'
import type { LLMServiceConfig } from '@sketch-pilot/services/llm'
import type {
  CompleteVideoPackage,
  TranscriptionConfig,
  VideoGenerationOptions
} from '@sketch-pilot/types/video-script.types'

export interface VideoGenerationInput {
  topic: string
  userId?: string
  options?: Partial<VideoGenerationOptions>
  onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>
  onTimingSync?: (script: any) => Promise<void>
  onSceneGenerated?: (scene: any, script: any, index: number, progress: number) => Promise<void>
}

export class VideoGenerationService {
  private readonly promptService = new PromptService(new PromptRepository())
  private readonly characterModelRepository = new CharacterModelRepository()
  private readonly videoRepository = new VideoRepository()
  private readonly creditsRepository = new CreditsRepository()

  // Track active engines for cancellation
  private static activeEngines = new Map<string, NanoBananaEngine>()

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
      if (!model) {
        const gender = identifier.gender && identifier.gender !== 'unknown' ? identifier.gender : undefined
        const age = identifier.age && identifier.age !== 'unknown' ? identifier.age : undefined

        if (gender || age) {
          console.info(
            `[VideoGenerationService] No model found for name "${identifier.name}". Trying metadata match: ${gender || 'any'}, ${age || 'any'}`
          )
          model = await this.characterModelRepository.findByMetadata(gender, age)
        }
      }

      if (!model || !model.imageUrl) return null

      try {
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
    const scriptSpec = await this.promptService.resolveSpec((options as any).promptId)

    let artistPersona: string | undefined
    let stylePrefix: string | undefined
    let effectiveVoiceId = options.kokoroVoicePreset as string | undefined

    if (options.characterModelId) {
      const charModel = await this.characterModelRepository.findById(options.characterModelId)
      if (charModel) {
        if (!effectiveVoiceId && charModel.voiceId) {
          effectiveVoiceId = charModel.voiceId
        }
        artistPersona = (charModel as any).artistPersona || undefined
        stylePrefix = (charModel as any).stylePrefix || undefined
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

    const transcriptionConfig: TranscriptionConfig = {
      provider: 'whisper-local',
      model: 'base',
      device: 'cpu',
      language: options.language?.split('-')[0] || 'en'
    }

    return new NanoBananaEngine(
      apiKey,
      artistPersona,
      stylePrefix,
      undefined, // systemPrompt
      audioConfig,
      animationConfig,
      imageConfig,
      llmConfig,
      transcriptionConfig,
      {
        scriptSpec: scriptSpec as any,
        imageSpec: scriptSpec as any,
        negativePrompt: options.negativePrompt
      },
      options.negativePrompt
    )
  }

  /**
   * Generates a full video from a topic, handling engine tracking and lifecycle.
   */
  private async generateFullVideoInternal(
    videoId: string,
    topic: string,
    options: Partial<VideoGenerationOptions>,
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>,
    onTimingSync?: (script: any) => Promise<void>,
    onSceneGenerated?: (scene: any, script: any, index: number, progress: number) => Promise<void>
  ): Promise<CompleteVideoPackage> {
    const engine = await this.buildEngine(options)
    VideoGenerationService.activeEngines.set(videoId, engine)

    try {
      return await engine.generateVideoFromTopic(
        topic,
        options as VideoGenerationOptions,
        [], // existingScenes
        videoId,
        onProgress,
        onTimingSync,
        onSceneGenerated
      )
    } finally {
      VideoGenerationService.activeEngines.delete(videoId)
    }
  }

  async generateVideo(input: VideoGenerationInput & { projectId?: string }): Promise<CompleteVideoPackage> {
    const { topic, options = {}, projectId, onProgress, onTimingSync, onSceneGenerated } = input
    return await this.generateFullVideoInternal(
      projectId || 'temp-generation',
      topic,
      options,
      onProgress,
      onTimingSync,
      onSceneGenerated
    )
  }

  async renderVideoFromScript(
    input: VideoGenerationInput & { script: any; projectId?: string }
  ): Promise<CompleteVideoPackage> {
    const { script, options = {}, projectId, onProgress, onTimingSync } = input
    const engine = await this.buildEngine(options)
    // One-off render doesn't typically need cancellation registry
    return await engine.generateVideoFromScript(
      script,
      options as VideoGenerationOptions,
      [],
      projectId,
      onProgress,
      onTimingSync
    )
  }

  async generateCharacterImage(prompt: string, modelId?: string): Promise<Buffer> {
    const apiKey = process.env.GEMINI_API_KEY || ''
    const imageService = ImageServiceFactory.create({ provider: 'gemini', apiKey })

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
      aspectRatio: '1:1',
      quality: 'high',
      systemInstruction: 'Generate a high-quality character design illustration.'
    })

    const buffer = await this.fetchImageBuffer(imageUrl)
    if (!imageUrl.startsWith('http')) {
      await fs.unlink(imageUrl).catch(() => {})
    }
    return buffer
  }

  private async fetchImageBuffer(urlOrPath: string): Promise<Buffer> {
    if (urlOrPath.startsWith('http')) {
      const response = await fetch(urlOrPath)
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`)
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }
    return await fs.readFile(urlOrPath)
  }

  exportPromptsToJson(script: any): string {
    const generator = new VideoScriptGenerator(null as any)
    return generator.exportPromptsToJson(script)
  }

  async stopGeneration(videoId: string): Promise<boolean> {
    const engine = VideoGenerationService.activeEngines.get(videoId)
    if (engine) {
      console.info(`[VideoService] 🛑 Stopping pipeline for video: ${videoId}`)
      engine.stop()
      VideoGenerationService.activeEngines.delete(videoId)
      await this.videoRepository.update(videoId, { status: 'draft' as any })
      return true
    }
    return false
  }

  async restartGeneration(videoId: string, topic: string, options: any): Promise<any> {
    console.info(`[VideoService] 🔄 Restarting pipeline for video: ${videoId}`)
    await this.stopGeneration(videoId)
    await checkpointService.deleteCheckpoint(videoId)
    await this.videoRepository.update(videoId, { status: 'pending' as any })
    return this.generateVideo({ topic, options, projectId: videoId })
  }

  /**
   * Rescripts the entire video: deletes script, checkpoints, and re-enqueues.
   */
  async rescriptGeneration(videoId: string, topic: string, options: any): Promise<any> {
    console.info(`[VideoService] 📝 Rescripting video: ${videoId}`)
    await this.stopGeneration(videoId)
    await checkpointService.deleteCheckpoint(videoId)
    // Clear the script in DB to force Step 1
    await this.videoRepository.update(videoId, { script: null } as any)
    await this.videoRepository.update(videoId, { status: 'pending' as any })
    return this.generateVideo({ topic, options, projectId: videoId })
  }

  /**
   * Inserts a new scene at the specified index, using the LLM to "magic" the visual prompts from the narration.
   */
  async insertScene(videoId: string, index: number, narration: string): Promise<any> {
    console.info(`[VideoService] ➕ Inserting scene at index ${index} for video: ${videoId}`)
    const video = await this.videoRepository.findById(videoId)
    if (!video || !video.script) throw new Error('Video script not found')

    const engine = await this.buildEngine(video.options || {})
    const generator = new VideoScriptGenerator(engine.getLLMService())

    // 1. Enrich the new scene from narration using global context
    const enrichedScene = await generator.enrichSceneFromNarration(
      narration,
      video.script as any, // Complete script to provide context (style, characters)
      index + 1 // Proposed scene number
    )

    // 2. Insert into script
    const script = video.script as any
    script.scenes.splice(index, 0, enrichedScene)

    // 3. Recalculate all scene numbers and time ranges to keep continuity
    this.recalculateScriptTiming(script, video.options || {})

    // 4. Update the video record
    await this.videoRepository.update(videoId, {
      script,
      sceneCount: script.scenes.length,
      totalDuration: script.totalDuration
    } as any)

    return script
  }

  /**
   * Recalculates scene numbers and time ranges for an entire script.
   */
  private recalculateScriptTiming(script: any, options: any): void {
    const generator = new VideoScriptGenerator(null as any)

    // Re-assign numbers
    script.scenes
      .forEach((s: any, i: number) => {
        s.sceneNumber = i + 1
        if (!s.id) s.id = `scene-${i + 1}-${Math.random().toString(36).slice(2, 9)}`
      })(
        // Use the generator's internal logic for time distribution
        // We need to access the private method or replicate it.
        // For now, let's just use a simple shift logic if we don't want to export everything.
        // Actually, it's better to expose assignTimeRanges in VideoScriptGenerator.

        // I'll update VideoScriptGenerator to export a utility or public method for this.
        // Assuming I will do it in the next step.
        generator as any
      )
      .assignTimeRanges(script.scenes, options)

    script.sceneCount = script.scenes.length
    script.totalDuration = script.scenes.length > 0 ? script.scenes.at(-1).timeRange.end : 0
  }
}
