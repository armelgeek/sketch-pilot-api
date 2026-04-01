import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GoogleGenAI } from '@google/genai'

import axios from 'axios'
import sharp from 'sharp'
import { AnimationServiceFactory, type AnimationService, type AnimationServiceConfig } from '../services/animation'
import { AudioServiceFactory, type AudioService, type AudioServiceConfig, type WordTiming } from '../services/audio'
import { TranscriptionServiceFactory, type TranscriptionService } from '../services/audio/transcription.service'
import { ImageServiceFactory, type ImageService, type ImageServiceConfig } from '../services/image'
import { LLMServiceFactory, type LLMService, type LLMServiceConfig } from '../services/llm'
import { SceneCacheService } from '../services/llm/scene-cache.service'
import { VideoAssembler } from '../services/video/video-assembler.service'
import {
  KokoroVoicePreset,
  QualityMode,
  suggestSceneDuration,
  videoGenerationOptionsSchema,
  type AssCaptionConfig,
  type BrandingConfig,
  type CompleteVideoPackage,
  type CompleteVideoScript,
  type EnrichedScene,
  type ImageProvider,
  type LLMProvider,
  type TranscriptionConfig,
  type VideoGenerationOptions
} from '../types/video-script.types'
import { runFfmpeg } from '../utils/ffmpeg-utils'
import { TaskQueue } from '../utils/task-queue'

import { TimingMapper } from '../utils/timing-mapper'
import { PromptManager, type PromptManagerConfig } from './prompt-manager'
import { VideoScriptGenerator } from './video-script-generator'
import type { SceneMemory } from './scene-memory'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Types and Schemas
export interface SceneDescription {
  id: string
  script: string
}

export interface GenerationOptions {
  prompt: string
  referenceImages?: string[]
}

// (Other shared schemas moved to video-script.types.ts for consolidation)

export class NanoBananaEngine {
  private readonly systemPrompt: string
  private readonly client: GoogleGenAI
  private scriptGenerator: VideoScriptGenerator
  readonly promptManager: PromptManager
  private readonly generationQueue: TaskQueue
  private _audioService?: AudioService
  private _transcriptionService?: TranscriptionService
  private _animationService?: AnimationService
  private _imageService?: ImageService
  private _llmService?: LLMService
  private readonly outputDir: string
  private currentOptions: VideoGenerationOptions = videoGenerationOptionsSchema.parse({
    aspectRatio: '16:9',
    qualityMode: QualityMode.STANDARD,
    sceneCount: 3,
    minDuration: 30,
    maxDuration: 60
  })
  private currentImageProvider: ImageProvider = 'gemini'
  private currentLLMProvider: LLMProvider = 'gemini'
  private currentTranscriptionConfig?: TranscriptionConfig
  private currentAssCaptionConfig?: AssCaptionConfig
  private currentKokoroVoicePreset: KokoroVoicePreset = KokoroVoicePreset.AF_HEART

  private readonly sceneCache: SceneCacheService

  // Store config for service re-initialization
  private readonly apiKey: string
  private readonly audioConfig?: AudioServiceConfig
  private readonly animationConfig?: AnimationServiceConfig
  private readonly llmConfig?: LLMServiceConfig
  private readonly imageConfig?: ImageServiceConfig
  private readonly transcriptionConfig?: TranscriptionConfig

  constructor(
    apiKey: string,
    systemPrompt?: string,
    audioConfig?: AudioServiceConfig,
    animationConfig?: AnimationServiceConfig,
    imageConfig?: ImageServiceConfig,
    llmConfig?: LLMServiceConfig,
    transcriptionConfig?: TranscriptionConfig,
    promptSpecs?: PromptManagerConfig
  ) {
    this.apiKey = apiKey
    this.audioConfig = audioConfig
    this.animationConfig = animationConfig
    this.llmConfig = llmConfig
    this.imageConfig = imageConfig
    this.transcriptionConfig = transcriptionConfig

    this.currentTranscriptionConfig = transcriptionConfig || {
      provider: 'whisper-local',
      model: 'base',
      device: 'cpu',
      language: 'en'
    }

    this.client = new GoogleGenAI({ apiKey })

    this.promptManager = new PromptManager(promptSpecs)
    this.systemPrompt = systemPrompt ?? ''

    this.currentImageProvider = imageConfig?.provider || 'gemini'
    this.currentLLMProvider = llmConfig?.provider || 'gemini'

    this.sceneCache = new SceneCacheService()

    // Will be lazily instantiated properly when generateStructuredScript is called
    this.scriptGenerator = null as any

    // Initialize queue with provider-specific rate limits and circuit breakers
    // maxConcurrency is total global concurrency across all providers
    this.generationQueue = new TaskQueue({
      maxConcurrency: 10,
      maxRetries: 6,
      initialDelayMs: 2000,
      providerConfigs: {
        image: { maxConcurrent: 2, failureThreshold: 3 },
        llm: { maxConcurrent: 3, failureThreshold: 5 },
        animation: { maxConcurrent: 1, failureThreshold: 2 },
        // Specific providers can also be defined if known
        [this.currentImageProvider]: { maxConcurrent: 2 },
        [this.currentLLMProvider || 'gemini']: { maxConcurrent: 3 }
      }
    })

    this.outputDir = path.join(process.cwd(), 'uploads', 'output')
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Getters for Lazy Service Initialization
  // ─────────────────────────────────────────────────────────────────────────────

  async getAudioService(): Promise<AudioService> {
    if (!this._audioService) {
      this._audioService = await AudioServiceFactory.create(
        this.audioConfig || {
          provider: 'kokoro',
          lang: 'en',
          apiKey: process.env.HUGGING_FACE_TOKEN || this.apiKey
        }
      )
    }
    return this._audioService
  }

  set audioService(service: AudioService) {
    this._audioService = service
  }

  async getAnimationService(): Promise<AnimationService> {
    if (!this._animationService) {
      this._animationService = await AnimationServiceFactory.create(
        this.animationConfig || { provider: 'veo', apiKey: this.apiKey }
      )
    }
    return this._animationService
  }

  set animationService(service: AnimationService) {
    this._animationService = service
  }

  async getImageService(): Promise<ImageService> {
    if (!this._imageService) {
      this._imageService = await ImageServiceFactory.create(
        this.imageConfig || {
          provider: this.currentImageProvider,
          apiKey: this.apiKey,
          systemPrompt: this.systemPrompt
        }
      )
    }
    return this._imageService
  }

  set imageService(service: ImageService) {
    this._imageService = service
  }

  async getLlmService(): Promise<LLMService> {
    if (!this._llmService) {
      this._llmService = await LLMServiceFactory.create(
        this.llmConfig || {
          provider: this.currentLLMProvider,
          apiKey: this.apiKey,
          cacheSystemPrompt: true
        }
      )
    }
    return this._llmService
  }

  set llmService(service: LLMService) {
    this._llmService = service
  }

  async getTranscriptionService(): Promise<TranscriptionService | undefined> {
    if (!this._transcriptionService && this.transcriptionConfig) {
      this._transcriptionService = await TranscriptionServiceFactory.create(this.transcriptionConfig as any)
    }
    return this._transcriptionService
  }
  set transcriptionService(service: TranscriptionService | undefined) {
    this._transcriptionService = service
  }

  private async downloadAndEncodeImages(
    images: (string | { name?: string; data: string })[]
  ): Promise<{ name?: string; data: string }[]> {
    const encodedImages: { name?: string; data: string }[] = []

    for (const img of images) {
      try {
        if (typeof img === 'object') {
          // If it's already an object, assume data is base64 or a URL
          if (img.data.startsWith('http')) {
            const response = await axios.get(img.data, { responseType: 'arraybuffer' })
            const base64 = Buffer.from(response.data, 'binary').toString('base64')
            encodedImages.push({ name: img.name, data: base64 })
          } else {
            encodedImages.push(img)
          }
          continue
        }

        const url = img as string
        if (url.startsWith('http')) {
          console.log(`[NanoBanana] Downloading and encoding reference image: ${url}`)
          const response = await axios.get(url, { responseType: 'arraybuffer' })
          const base64 = Buffer.from(response.data, 'binary').toString('base64')
          encodedImages.push({ data: base64 })
        } else if (url.length < 1000 && (url.includes('/') || url.includes('\\'))) {
          // Likely a file path if it's short and contains separators
          if (fs.existsSync(url)) {
            const data = fs.readFileSync(url).toString('base64')
            encodedImages.push({ data })
          } else {
            // If it's not a path and not a URL, it might be raw base64 already
            encodedImages.push({ data: url })
          }
        } else {
          // Assume raw base64
          encodedImages.push({ data: url })
        }
      } catch (error) {
        console.error(`[NanoBanana] Failed to download or encode image: ${JSON.stringify(img)}`, error)
        // Skip failed images to avoid crashing the whole pipeline
      }
    }

    return encodedImages
  }

  async generateImage(
    scene: EnrichedScene,
    baseImages: (string | { name?: string; data: string })[],
    filename: string,
    bypassCache: boolean = false
  ): Promise<string> {
    const characterImages = await this.promptManager.resolveCharacterImages()
    const rawAllBaseImages = [...baseImages, ...characterImages]
    const allBaseImages = await this.downloadAndEncodeImages(rawAllBaseImages)
    const hasReferenceImages = allBaseImages.length > 0

    console.log(`[NanoBanana] Preparing image for scene ${scene.id} with ${allBaseImages.length} reference images.`)

    const hasLocationReference = rawAllBaseImages.some(
      (img) => typeof img === 'object' && (img as any).name === 'LOCATION'
    )

    const { prompt: fullPrompt } = await this.promptManager.buildImagePrompt(
      scene,
      hasReferenceImages,
      this.currentOptions?.aspectRatio || '16:9',
      undefined, // memory
      hasLocationReference
    )

    console.log(`[NanoBanana] Final image prompt for scene ${scene.id}: "${fullPrompt}"`)

    const systemInstruction = await this.promptManager.buildImageSystemInstruction(hasReferenceImages)

    if (!bypassCache) {
      const cachedResult = this.sceneCache.get(fullPrompt, {
        sceneId: scene.id,
        imageStyle: this.currentOptions?.imageStyle
      })

      if (cachedResult && fs.existsSync(cachedResult)) {
        console.log(`[NanoBanana] ✓ Using cached image for scene ${scene.id} from ${cachedResult}`)
        if (cachedResult !== filename) {
          fs.copyFileSync(cachedResult, filename)
        }
        return filename
      } else if (cachedResult) {
        console.log(`[NanoBanana] ⚠ Cached image not found on disk, regenerating...`)
      }
    } else {
      console.log(`[NanoBanana] 🚀 Bypassing cache for scene ${scene.id} due to reprompt/force...`)
    }

    const maxRetries = 5
    let lastError: any
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const quality =
          this.currentOptions?.qualityMode === QualityMode.LOW_COST
            ? 'ultra-low'
            : this.currentOptions?.qualityMode === QualityMode.HIGH_QUALITY
              ? 'high'
              : 'medium'

        const seed = parseInt(scene.id.replaceAll(/\D/g, '').slice(0, 10) || '12345', 10)

        // Using the high-quality natural language prompt directly from PromptManager
        const refinedPrompt = fullPrompt

        const startTime = Date.now()
        const imageService = await this.getImageService()
        const imageUrl = await imageService.generateImage(refinedPrompt, filename, {
          aspectRatio: this.currentOptions?.aspectRatio || '16:9',
          referenceImages: allBaseImages,
          systemInstruction
        })

        const duration = Date.now() - startTime
        console.log(
          `[NanoBanana] ✓ Image generated in ${duration}ms for scene ${scene.id} (Attempt ${attempt}/${maxRetries})`
        )

        if (!bypassCache) {
          this.sceneCache.set(fullPrompt, imageUrl, {
            sceneId: scene.id,
            imageStyle: this.currentOptions?.imageStyle
          })
        }
        return imageUrl
      } catch (error: any) {
        lastError = error
        const isTimeout =
          error.message?.toLowerCase().includes('timeout') || error.name?.toLowerCase().includes('timeout')
        if (isTimeout && attempt < maxRetries) {
          console.warn(
            `[NanoBanana] ⚠ Image generation TIMEOUT for scene ${scene.id}. Retrying (${attempt}/${maxRetries})...`
          )
          continue
        }
        break // Break if not a timeout or final attempt
      }
    }

    // ── FALLBACK CASCADE ───────────────────────────────────────────────────
    const error = lastError
    if (this.currentImageProvider !== 'gemini' && this.isNetworkError(error)) {
      console.warn(`[NanoBanana] Network error with ${this.currentImageProvider}, falling back to Gemini...`)
      try {
        const geminiService = await ImageServiceFactory.create({ provider: 'gemini', apiKey: this.apiKey } as any)
        const result = await geminiService.generateImage(fullPrompt, filename, {
          quality: 'medium',
          smartUpscale: true,
          format: 'webp',
          aspectRatio: this.currentOptions?.aspectRatio || '16:9',
          referenceImages: allBaseImages,
          systemInstruction
        })
        this.sceneCache.set(fullPrompt, result, {
          sceneId: scene.id,
          imageStyle: this.currentOptions?.imageStyle
        })
        return result
      } catch (fallbackError: unknown) {
        console.error(`[NanoBanana] Fallback to Gemini also failed:`, fallbackError)

        // Stage 3 Fallback - Minimalist Safety Prompt
        try {
          console.warn(`[NanoBanana] Attempting STAGE 3 fallback (Safety Prompt)...`)
          const safetyPrompt = `Minimalist whiteboard drawing, very simple sketch, clean lines on white background, neutral composition.`
          const geminiService = await ImageServiceFactory.create({ provider: 'gemini', apiKey: this.apiKey } as any)
          return await geminiService.generateImage(safetyPrompt, filename, {
            aspectRatio: this.currentOptions?.aspectRatio || '16:9',
            quality: 'low'
          })
        } catch (ultraError: any) {
          console.error(`[NanoBanana] STAGE 3 fallback failed:`, ultraError.message)

          // Stage 4 Fallback - HARDCODED Blank Image (Last Resort)
          console.error(
            `[NanoBanana] CRITICAL: All image APIs failed for scene ${scene.id}. Generating blank placeholder to prevent ship.`
          )
          const [width, height] = this.currentOptions?.aspectRatio === '9:16' ? [720, 1280] : [1280, 720]
          await sharp({
            create: {
              width,
              height,
              channels: 3,
              background: { r: 255, g: 255, b: 255 }
            }
          })
            .webp()
            .toFile(filename)
          return filename
        }
      }
    }

    console.error(`[NanoBanana] Final generation error for scene ${scene.id}:`, error?.message || error)
    throw error
  }

  /**
   * Generates a thumbnail.jpg from the given image file using sharp.
   * The thumbnail is resized to a maximum width of 320px while preserving aspect ratio.
   */
  private async generateThumbnail(imagePath: string, thumbnailPath: string): Promise<void> {
    if (!fs.existsSync(imagePath)) {
      console.warn(`[NanoBanana] Cannot create thumbnail: source image not found at ${imagePath}`)
      return
    }
    try {
      await sharp(imagePath)
        .resize(320, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath)
      console.log(`[NanoBanana] Thumbnail created: ${thumbnailPath}`)
    } catch (error) {
      console.warn(`[NanoBanana] Failed to create thumbnail: ${error}`)
    }
  }

  /**
   * Detect if error is network-related
   */
  private isNetworkError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as any).code) : ''
    return (
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'ENETUNREACH' ||
      code === 'EHOSTUNREACH' ||
      message.includes('timeout') ||
      message.includes('ECONNRESET') ||
      message.includes('connect')
    )
  }

  /**
   * Composes a full scene.
   */
  private async composeScene(
    scene: EnrichedScene,
    referenceImages: (string | { name?: string; data: string })[],
    outputDir: string,
    lastSceneImageBase64?: string,
    isReprompt: boolean = false,
    script?: CompleteVideoScript,
    memory?: SceneMemory
  ): Promise<void> {
    const startTime = Date.now()
    const options = this.currentOptions || ({} as any)
    const animationMode = options.animationMode || 'static'
    const aspectRatio = options.aspectRatio || '16:9'

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const imagePath = path.join(outputDir, `scene.webp`)
    const tempBgPath = path.join(outputDir, 'temp_bg.webp')

    // If reprompting, delete existing images to ensure no stale cache is used
    if (isReprompt) {
      console.log(`[NanoBanana] 🧨 Reprompting scene ${scene.id} — Forcing regeneration.`)
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath)
      if (fs.existsSync(tempBgPath)) fs.unlinkSync(tempBgPath)
    }

    const effectiveBaseImages = [...referenceImages]
    if (scene.continueFromPrevious && lastSceneImageBase64) {
      effectiveBaseImages.push(lastSceneImageBase64)
    }

    const [width, height] = aspectRatio === '9:16' ? [720, 1280] : aspectRatio === '1:1' ? [1024, 1024] : [1280, 720]

    try {
      // 1. Generate Image
      const finalImagePath = await this.generateImage(scene, effectiveBaseImages, tempBgPath, isReprompt)
      if (!finalImagePath) {
        throw new Error(`generateImage failed to return a valid path.`)
      }

      await sharp(tempBgPath).resize(width, height, { fit: 'cover' }).webp().toFile(imagePath)
    } catch (error) {
      console.error(`[NanoBanana] Composition failed for scene ${scene.id}:`, error)

      // Emergency placeholder
      if (!fs.existsSync(imagePath)) {
        await sharp({
          create: {
            width,
            height,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
          }
        })
          .webp()
          .toFile(imagePath)
      }
      throw error
    } finally {
      if (fs.existsSync(tempBgPath)) {
        try {
          fs.unlinkSync(tempBgPath)
        } catch {
          /* ignore */
        }
      }
    }

    // 2. Generate thumbnail
    const thumbnailPath = path.join(outputDir, 'thumbnail.jpg')
    await this.generateThumbnail(imagePath, thumbnailPath)

    // 3. Audio Word Timings
    const wordTimings: WordTiming[] | undefined = (scene as any).globalWordTimings
    const totalDuration = scene.timeRange ? scene.timeRange.end - scene.timeRange.start : 5

    // 4. Animation
    let hasVideo = false
    const videoPath = path.join(outputDir, `animation.mp4`)
    const clipDuration = options.animationClipDuration || 6

    if (animationMode === 'ai' && scene.animationPrompt) {
      hasVideo = true
      await this.generationQueue.add(async () => {
        try {
          const animationService = await this.getAnimationService()
          await animationService.animateImage(imagePath, scene.animationPrompt!, clipDuration, videoPath, aspectRatio)
          hasVideo = fs.existsSync(videoPath)
        } catch (error) {
          console.error(`[NanoBanana] Animation error:`, error)
        }
      })
    }

    // 5. Save Manifest
    const manifest: any = {
      id: scene.id,
      sceneImage: 'scene.webp',
      audio: !options.globalAudioPath && scene.narration ? 'narration.mp3' : undefined,
      video: hasVideo ? 'animation.mp4' : undefined,
      videoMeta: hasVideo ? { clipDuration, totalDuration, loop: true } : undefined,
      animationMode,
      cameraAction: (scene as any).cameraAction,
      transition: (scene as any).transition,
      pauseBefore: (scene as any).pauseBefore,
      pauseAfter: (scene as any).pauseAfter,
      aspectRatio
    }

    if (wordTimings && wordTimings.length > 0) {
      const startTime = scene.timeRange.start
      manifest.wordTimings = wordTimings.map((w) => ({
        ...w,
        start: Math.round(Math.max(0, w.start - startTime) * 100) / 100,
        end: Math.round(Math.max(0, w.end - startTime) * 100) / 100,
        startMs: Math.round(Math.max(0, w.start - startTime) * 1000)
      }))
      manifest.globalWordTimings = wordTimings.map((w) => ({
        ...w,
        start: Math.round(w.start * 100) / 100,
        end: Math.round(w.end * 100) / 100,
        startMs: Math.round(w.startMs)
      }))
    }

    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  }

  /**
   * Regenerates the scene image and thumbnail for an existing scene directory.
   */
  async regenerateSceneImage(
    scene: EnrichedScene,
    baseImages: (string | { name?: string; data: string })[],
    targetDir: string
  ): Promise<void> {
    console.log(`\n--- Regenerating Scene Image: ${scene.id} ---`)
    const imagePath = path.join(targetDir, 'scene.webp')

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    await this.generationQueue.add(
      async () => await this.generateImage(scene, baseImages, imagePath, true),
      `Scene ${scene.id} Image Regeneration`,
      this.currentImageProvider
    )

    const thumbnailPath = path.join(targetDir, 'thumbnail.jpg')
    await this.generateThumbnail(imagePath, thumbnailPath)
    console.log(`[NanoBanana] Scene ${scene.id} image and thumbnail regenerated.`)
  }

  /**
   * Synchronizes scene timings with global narration audio and updates manifests.
   * Useful for re-syncing an existing project directory before assembly.
   */
  async syncTimings(
    projectDir: string,
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>
  ): Promise<void> {
    const scriptPath = path.join(projectDir, 'script.json')
    const globalAudioPath = path.join(projectDir, 'narration.mp3')

    if (!fs.existsSync(scriptPath) || !fs.existsSync(globalAudioPath)) {
      console.warn(`[NanoBanana] Cannot sync timings: script.json or narration.mp3 missing in ${projectDir}`)
      return
    }

    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8')) as CompleteVideoScript

    // Auto-initialize Whisper local if not already done
    if (!(await this.getTranscriptionService())) {
      console.log(`[NanoBanana-Sync] Initializing Whisper for sync...`)
      this.transcriptionService = await TranscriptionServiceFactory.create(
        (this.currentTranscriptionConfig as any) || {
          provider: 'whisper-local',
          model: 'base',
          device: 'cpu',
          language: 'en'
        }
      )
    }

    const transcriptionService = (await this.getTranscriptionService())!
    console.log(`[NanoBanana-Sync] Transcribing global audio for project: ${path.basename(projectDir)}`)
    const transcriptionResult = await transcriptionService.transcribe(globalAudioPath, (p, msg) => {
      if (onProgress) {
        onProgress(Math.round(p), `Transcription: ${msg}`)
      }
    })
    const globalWordTimings = transcriptionResult.wordTimings

    console.log(`[NanoBanana-Sync] Mapping word timings to scenes...`)
    const sceneNarrations = script.scenes.map((s) => ({ sceneId: s.id, narration: s.narration }))
    const mappedTimings = TimingMapper.mapScenes(sceneNarrations, globalWordTimings)

    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]
      const timing = mappedTimings[i]

      scene.timeRange.start = timing.start
      scene.timeRange.end = timing.end

      // Update manifest
      const sceneDir = path.join(projectDir, 'scenes', scene.id)
      const manifestPath = path.join(sceneDir, 'manifest.json')

      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        const startTime = timing.start
        const wordTimings = timing.wordTimings

        // Update wordTimings (relative to scene start for clip effects)
        manifest.wordTimings = wordTimings.map((w) => {
          const relStart = Math.max(0, w.start - startTime)
          const relEnd = Math.max(relStart, w.end - startTime)
          return {
            ...w,
            start: Math.round(relStart * 100) / 100,
            end: Math.round(relEnd * 100) / 100,
            startMs: Math.round(relStart * 1000)
          }
        })

        // Update globalWordTimings (absolute for global subtitle sync)
        ;(manifest as any).globalWordTimings = wordTimings.map((w) => ({
          ...w,
          start: Math.round(w.start * 100) / 100,
          end: Math.round(w.end * 100) / 100,
          startMs: Math.round(w.startMs)
        }))

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      }
    }

    // Update script total duration
    if (mappedTimings.length > 0) {
      script.totalDuration = mappedTimings.at(-1)!.end
    }

    // Save updated script
    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2))
    console.log(`[NanoBanana-Sync] Sync completed and files updated for ${script.scenes.length} scenes.`)
  }

  /**
   * Generates a structured video script from a topic.
   * This includes LLM provider switching and transcription config updates.
   */
  async generateStructuredScript(
    topic: string,
    options: Partial<VideoGenerationOptions> = {},
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>
  ): Promise<CompleteVideoScript> {
    const validOptions = videoGenerationOptionsSchema.parse({
      ...options
    })

    // Dynamic LLM provider switching
    if (!this.scriptGenerator || validOptions.llmProvider !== this.currentLLMProvider) {
      if (validOptions.llmProvider && validOptions.llmProvider !== this.currentLLMProvider) {
        console.log(`[NanoBanana] Switching LLM provider: ${this.currentLLMProvider} -> ${validOptions.llmProvider}`)
        this.currentLLMProvider = validOptions.llmProvider
        this.llmService = await LLMServiceFactory.create({
          provider: this.currentLLMProvider,
          apiKey: this.currentLLMProvider === 'grok' ? process.env.XAI_API_KEY || this.apiKey : this.apiKey,
          cacheSystemPrompt: true // ← Option B: Enable prompt caching
        })
      }

      // Re-initialize generator with new service, sharing the same PromptManager
      this.scriptGenerator = new VideoScriptGenerator(await this.getLlmService(), this.promptManager)
    }

    // Initialize/Switch Transcription Service
    if (
      validOptions.transcription &&
      JSON.stringify(validOptions.transcription) !== JSON.stringify(this.currentTranscriptionConfig)
    ) {
      console.log(
        `[NanoBanana] Updating transcription provider: ${
          this.currentTranscriptionConfig?.provider || 'none'
        } -> ${validOptions.transcription.provider}`
      )
      this.currentTranscriptionConfig = validOptions.transcription
      this.transcriptionService = await TranscriptionServiceFactory.create(this.currentTranscriptionConfig as any)
    }

    try {
      const wrappedOnProgress = async (p: number, m: string, meta?: Record<string, any>) => {
        if (onProgress) {
          // Map script gen 0-100% to 0-15%
          const scriptProgress = Math.round((p / 100) * 15)
          await onProgress(scriptProgress, m, meta)
        }
      }

      return await this.generationQueue.add(
        async () => await this.scriptGenerator.generateCompleteScript(topic, validOptions, wrappedOnProgress),
        `Script Generation: ${topic}`,
        'llm'
      )
    } catch (error) {
      // Network error fallback: if Grok LLM fails, try Claude Haiku
      const isNetError = this.isNetworkError(error)
      if (isNetError && this.currentLLMProvider === 'grok') {
        console.warn(`[NanoBanana] Network error with Grok LLM, falling back to Claude Haiku...`)
        this.currentLLMProvider = 'haiku'
        this.llmService = await LLMServiceFactory.create({
          provider: 'haiku',
          apiKey: this.apiKey,
          cacheSystemPrompt: true
        })

        // Re-initialize generator with Claude
        this.scriptGenerator = new VideoScriptGenerator(await this.getLlmService(), this.promptManager)
        ;(validOptions as any).llmProvider = 'haiku' // Propagate the provider change to options

        // Retry with Claude Haiku
        try {
          return await this.scriptGenerator.generateCompleteScript(topic, validOptions, onProgress)
        } catch (fallbackError) {
          console.error(`[NanoBanana] Fallback to Claude Haiku also failed:`, fallbackError)
          throw fallbackError
        }
      }
      throw error
    }
  }

  async exportVideoPackage(script: CompleteVideoScript, outputPath: string): Promise<void> {
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true })
    }

    // Ensure scriptGenerator is initialized (needed for exportToMarkdown)
    if (!this.scriptGenerator) {
      this.scriptGenerator = new VideoScriptGenerator(await this.getLlmService(), this.promptManager)
    }

    fs.writeFileSync(path.join(outputPath, 'script.json'), JSON.stringify(script, null, 2))
    fs.writeFileSync(path.join(outputPath, 'script.md'), this.scriptGenerator.exportToMarkdown(script))
  }

  /**
   * Generate complete video from topic.
   */
  async generateVideoFromTopic(
    topic: string,
    options: Partial<VideoGenerationOptions> = {},
    baseImages: string[] = [],
    projectId?: string,
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>,
    onTimingSync?: (script: CompleteVideoScript) => Promise<void>,
    onSceneGenerated?: (scene: any, script: CompleteVideoScript, index: number, progress: number) => Promise<void>
  ): Promise<CompleteVideoPackage> {
    const validOptions = videoGenerationOptionsSchema.parse(options)
    this.currentOptions = validOptions

    if (onProgress) {
      await onProgress(0, `Starting generation: ${topic}...`)
    }

    console.log(`\n=== GENERATING SCRIPT: ${topic} ===`)
    const script = await this.generateStructuredScript(topic, validOptions, onProgress)

    if (onProgress && validOptions.scriptOnly) {
      await onProgress(100, `Script generated successfully.`)
    } else if (onProgress) {
      await onProgress(15, `Script generated. Starting asset generation...`)
    }

    return this.generateVideoFromScript(
      script,
      options,
      baseImages,
      projectId,
      onProgress,
      onTimingSync,
      onSceneGenerated
    )
  }

  /**
   * PRO DUCE video from an existing script object.
   * This is the core "Post-AI" entry point.
   */
  async generateVideoFromScript(
    script: CompleteVideoScript,
    options: Partial<VideoGenerationOptions> = {},
    baseImages: string[] = [],
    projectId?: string,
    onProgress?: (progress: number, message: string, metadata?: Record<string, any>) => Promise<void>,
    onTimingSync?: (script: CompleteVideoScript) => Promise<void>,
    onSceneGenerated?: (scene: any, script: CompleteVideoScript, index: number, progress: number) => Promise<void>
  ): Promise<CompleteVideoPackage> {
    const startTime = Date.now()
    const validOptions = videoGenerationOptionsSchema.parse(options)
    this.currentOptions = validOptions

    // Ensure all scenes have timeRange and sceneNumber (robustness)
    const needsMaintenance = script.scenes.some((s) => !s.timeRange || s.sceneNumber === undefined)
    if (needsMaintenance) {
      console.log(`[NanoBanana] Script scenes are missing timeRanges or numbers; auto-assigning...`)
      if (!this.scriptGenerator) {
        this.scriptGenerator = new VideoScriptGenerator(await this.getLlmService(), this.promptManager)
      }
      script.scenes = this.scriptGenerator.assignTimeRanges(script.scenes as any, validOptions) as any
    }

    // Dynamic quality mode & provider configuration
    const qualityMode = validOptions.qualityMode || QualityMode.STANDARD

    // Configure Image Service based on Quality Mode
    let imageQuality: 'ultra-low' | 'low' | 'medium' | 'high' = 'medium'
    if (qualityMode === QualityMode.LOW_COST) imageQuality = 'ultra-low'
    if (qualityMode === QualityMode.HIGH_QUALITY) imageQuality = 'high'

    if (validOptions.imageProvider !== this.currentImageProvider) {
      console.log(
        `[NanoBanana] Switching image provider: ${this.currentImageProvider} -> ${validOptions.imageProvider} (${qualityMode} mode)`
      )
      this.currentImageProvider = validOptions.imageProvider
      this.imageService = await ImageServiceFactory.create({
        provider: this.currentImageProvider,
        apiKey: this.currentImageProvider === 'grok' ? process.env.XAI_API_KEY || this.apiKey : this.apiKey,
        systemPrompt: this.systemPrompt,
        defaultQuality: imageQuality
      })
    }

    // Dynamic Kokoro voice switching
    if (validOptions.kokoroVoicePreset && validOptions.kokoroVoicePreset !== this.currentKokoroVoicePreset) {
      console.log(
        `[NanoBanana] Switching Kokoro voice: ${this.currentKokoroVoicePreset} -> ${validOptions.kokoroVoicePreset}`
      )
      this.currentKokoroVoicePreset = validOptions.kokoroVoicePreset
      this.audioService = await AudioServiceFactory.create({
        provider: 'kokoro',
        lang: (validOptions.language?.split('-')[0] || 'en') as any,
        apiKey: process.env.HUGGING_FACE_TOKEN || this.apiKey,
        kokoroVoicePreset: this.currentKokoroVoicePreset
      })
    }

    console.log(`\n=== GENERATING VIDEO FROM SCRIPT ===`)

    // ─────────────────────────────────────────────────────────────────────────
    // Character resolution removed

    // ─────────────────────────────────────────────────────────────────────────
    // CHARACTER STUDIO (V2 Phase 2): Reference Images
    // ─────────────────────────────────────────────────────────────────────────
    const projectName = projectId || `video-${Date.now()}-${Math.random().toString(36).slice(7)}`
    const projectDir = path.join(this.outputDir, projectName)
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true })

    // Use all base images collectively for universal references if needed
    const allBaseImages = [...baseImages]

    const scenesDir = path.join(projectDir, 'scenes')
    if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true })

    // EXPORT EARLY: Save script and detailed report before starting asset generation
    console.log(`[NanoBanana] Exporting production report to: ${projectDir}/script.md`)
    await this.exportVideoPackage(script, projectDir)

    if (validOptions.scriptOnly) {
      console.log(`\n📄 SCRIPT-ONLY MODE: Stopping here. Report saved to: ${projectDir}/script.md`)
      const stats = {
        apiCalls: script.sceneCount * 2,
        generationTimeMs: Date.now() - startTime
      }
      fs.writeFileSync(path.join(projectDir, 'metadata.json'), JSON.stringify(stats, null, 2))
      return {
        script,
        projectId: path.basename(projectDir),
        outputPath: projectDir,
        generatedAt: new Date().toISOString(),
        metadata: stats
      }
    }

    // Setup ASS caption config EARLY in pipeline (before composeScene)
    const assCaptionConfig: AssCaptionConfig = validOptions.assCaptions || {
      enabled: true,
      style: 'colored',
      fontSize: 70,
      fontFamily: 'Montserrat',
      position: 'bottom',
      inactiveColor: '#FFFFFF',
      highlightColor: '#FFE135',
      borderSize: 2,
      shadowSize: 3
    }
    this.currentAssCaptionConfig = assCaptionConfig

    // Note: Whisper local will be auto-initialized in composeScene if word timings are empty
    // No need to pre-initialize here - it happens on-demand

    let lastSceneImageBase64: string | undefined
    const globalAudioPath = path.join(projectDir, 'narration.mp3')

    // --- AUDIO GENERATION & TIMING SYNC (REAL-WORLD) ---
    // Instead of one big file, we generate per-scene to get exact durations and avoid drift.
    const skipAudio =
      validOptions.skipAudio ||
      validOptions.generateOnlyAssembly ||
      validOptions.repromptSceneIndex !== undefined ||
      false

    if (!skipAudio) {
      if (onProgress) await onProgress(16, 'Generating narration audio (per-scene)...')
      console.log(`\n[NanoBanana] --- Generating Per-Scene Audio & Syncing Timings ---`)

      let currentTime = 0
      const audioFiles: string[] = []

      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i]
        const sceneDir = path.join(scenesDir, scene.id)
        if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true })

        const sceneAudioPath = path.join(sceneDir, 'narration.mp3')
        const voiceId = validOptions.kokoroVoicePreset || KokoroVoicePreset.AF_HEART

        // Always generate if it doesn't exist, or if forceRegenerateAudio is on
        const forceRegen = (options as any).forceRegenerateAudio || (validOptions as any).forceRegenerateAudio
        if (forceRegen || !fs.existsSync(sceneAudioPath)) {
          const wordCount = (scene.narration || '').split(/\s+/).filter(Boolean).length
          console.log(`[NanoBanana] Scene ${i + 1}: Synthesizing ${wordCount} words...`)

          try {
            const audioService = await this.getAudioService()
            const audioResult = await audioService.generateSpeech(scene.narration, sceneAudioPath, {
              voice: voiceId,
              voiceId,
              pacing: (scene as any).pacing // Pass scene pacing for KokoroTTS speed adjustment
            })

            // Store duration and word timings in scene
            ;(scene as any).audioDuration = audioResult.duration
            ;(scene as any).globalWordTimings = audioResult.wordTimings
            console.log(`[NanoBanana] ✓ Scene ${i + 1} Duration: ${audioResult.duration.toFixed(2)}s`)
          } catch (audioError: any) {
            console.warn(`[NanoBanana] ⚠ Scene audio generation failed for ${scene.id}: ${audioError.message}`)
            // Fallback estimation if generation fails
            const wordCount = (scene.narration || '').split(/\s+/).length
            ;(scene as any).audioDuration = Math.max(3, wordCount / 2.5)
          }
        } else {
          // If audio exists, we need to know its duration to sync timings
          // We can't easily get it without ffprobe here, so we might need a utility or store it in manifest
          // For now, if it exists, we assume the script.json timings might be correct OR we should re-measure
          console.log(`[NanoBanana] Scene ${i + 1} audio already exists at ${sceneAudioPath}`)
          // If we have no duration, we might need to estimate or use existing timeRange
          if (!(scene as any).audioDuration) {
            ;(scene as any).audioDuration = scene.timeRange.end - scene.timeRange.start
          }
        }

        // Update TimeRange based on real duration
        const duration = (scene as any).audioDuration || 5
        scene.timeRange = { start: currentTime, end: currentTime + duration }
        currentTime += duration

        audioFiles.push(sceneAudioPath)

        // Increment audio progress from 16 to 25%
        if (onProgress) {
          const audioProg = 16 + Math.round(((i + 1) / script.scenes.length) * 9)
          await onProgress(audioProg, `Synthesized audio for scene ${i + 1}/${script.scenes.length}...`)
        }
      }

      script.totalDuration = currentTime
      script.globalAudio = 'narration.mp3'

      // Save the synchronized script EARLY
      fs.writeFileSync(path.join(projectDir, 'script.json'), JSON.stringify(script, null, 2))
      console.log(`[NanoBanana] Synchronized script with real durations (${script.totalDuration.toFixed(2)}s)`)

      // Stitch audio files into global narration.mp3
      if (audioFiles.length > 0 && !fs.existsSync(globalAudioPath)) {
        if (onProgress) await onProgress(25, 'Stitching audio tracks...')
        console.log(`[NanoBanana] Stitching ${audioFiles.length} scenes into global narration.mp3...`)
        await this.stitchAudioFiles(audioFiles, globalAudioPath)
      }

      // --- FINAL TRANSCRIPTION SYNC (GROUND TRUTH) ---
      // Although we have per-scene durations, a final Whisper pass on the stitched file
      // ensures that timeRange and word-level captions are perfectly aligned with the reality of narration.mp3.
      if (fs.existsSync(globalAudioPath)) {
        if (onProgress) await onProgress(26, 'Synchronizing word timings (Whisper AI)...')
        console.log(`[NanoBanana] Running final Whisper sync for word-perfect timings...`)
        try {
          if (!(await this.getTranscriptionService())) {
            this.currentTranscriptionConfig = {
              provider: 'whisper-local',
              model: 'base',
              device: 'cpu',
              language: validOptions.language?.split('-')[0] || 'en'
            }
            this.transcriptionService = await TranscriptionServiceFactory.create(this.currentTranscriptionConfig as any)
          }

          const transcriptionService = (await this.getTranscriptionService())!
          const transcriptionResult = await transcriptionService.transcribe(globalAudioPath, async (p, msg) => {
            if (onProgress) {
              // Transcription takes the 26-35% range
              const transProgress = 26 + Math.round(p * 0.09)
              await onProgress(transProgress, `Synchronisation vocale : ${p}%`)
            }
          })
          const assemblyWordTimings = transcriptionResult.wordTimings

          // Map word timings back to scenes (Refines TimeRange from synthesis durations to real audio detection)
          const sceneNarrations = script.scenes.map((s: any) => ({ sceneId: s.id, narration: s.narration }))
          const mappedTimings = TimingMapper.mapScenes(sceneNarrations, assemblyWordTimings)

          mappedTimings.forEach((timing: any, idx: number) => {
            const scene = script.scenes[idx]
            scene.timeRange = { start: timing.start, end: timing.end }
            if (timing.wordTimings.length > 0) {
              ;(scene as any).globalWordTimings = timing.wordTimings
            }
          })

          if (mappedTimings.length > 0) {
            script.totalDuration = mappedTimings.at(-1)!.end
          }
          console.log(`[NanoBanana] ✓ Final timings updated from transcription (${script.totalDuration.toFixed(2)}s)`)
        } catch (error: any) {
          console.warn(
            `[NanoBanana] ⚠ Final transcription refinement failed: ${error.message}. Keeping synthesis durations.`
          )
        }
      }

      // Trigger timing sync callback
      if (onTimingSync) {
        console.log(`[NanoBanana] Timing sync reached. Triggering callback...`)
        await onTimingSync(script)
      }

      // AUDIO-ONLY MODE: Return early — skip all image compositing below
      if (validOptions.generateOnlyAudio) {
        console.log(`[NanoBanana] generateOnlyAudio=true — Audio & transcription complete. Skipping image generation.`)
        return {
          script,
          projectId: projectName,
          outputPath: projectDir,
          generatedAt: new Date().toISOString(),
          metadata: { generationTimeMs: Date.now() - startTime }
        }
      }
    } else if (validOptions.generateOnlyAssembly) {
      console.log(`[NanoBanana] Assembly-only mode: Loading existing global audio and script mappings...`)

      const forceRegen = (options as any).forceRegenerateAudio || (validOptions as any).forceRegenerateAudio

      // If voice changed, delete cached narration so it gets re-generated with the new voice
      if (forceRegen && fs.existsSync(globalAudioPath)) {
        console.log(`[NanoBanana] forceRegenerateAudio=true — deleting cached narration to re-generate with new voice`)
        fs.unlinkSync(globalAudioPath)
      }

      if (fs.existsSync(globalAudioPath)) {
        // ✅ Priority 1: Audio already exists locally
        script.globalAudio = 'narration.mp3'
      } else if (
        !forceRegen &&
        script.globalAudio &&
        typeof script.globalAudio === 'string' &&
        script.globalAudio.startsWith('http')
      ) {
        // ✅ Priority 2: Download from MinIO (Skipped if forceRegen is true)
        console.log(`[NanoBanana] Narration not found locally. Downloading from MinIO: ${script.globalAudio}`)
        let downloaded = false
        try {
          const narrationResponse = await axios.get(script.globalAudio, { responseType: 'arraybuffer' })
          fs.writeFileSync(globalAudioPath, Buffer.from(narrationResponse.data))
          script.globalAudio = 'narration.mp3'
          downloaded = true
          console.log(`[NanoBanana] ✓ Narration downloaded to ${globalAudioPath}`)
        } catch (error: any) {
          console.warn(`[NanoBanana] ⚠ Failed to download narration from MinIO: ${error.message}`)
        }

        if (!downloaded) {
          // ✅ Priority 3: Re-generate narration from script text (last resort)
          console.log(`[NanoBanana] Regenerating narration from script text as a last resort...`)
          try {
            const fullScriptText = script.scenes.map((s: any) => s.narration).join('\n\n...\n\n')
            const audioService = await this.getAudioService()
            await audioService.generateSpeech(fullScriptText, globalAudioPath)
            if (fs.existsSync(globalAudioPath)) {
              script.globalAudio = 'narration.mp3'
              console.log(`[NanoBanana] ✓ Narration re-generated from script at ${globalAudioPath}`)
            }
          } catch (error: any) {
            console.error(
              `[NanoBanana] ❌ Narration re-generation also failed: ${error.message}. Assembly will have no audio.`
            )
          }
        }
      } else {
        // ✅ Priority 3 (no URL or forceRegen=true): Re-generate narration from script text
        console.log(
          `[NanoBanana] ${forceRegen ? 'Force Regenerate ON' : 'No local narration and no URL'}. Regenerating from script text...`
        )
        try {
          const fullScriptText = script.scenes.map((s: any) => s.narration).join('\n\n...\n\n')
          const audioService = await this.getAudioService()
          await audioService.generateSpeech(fullScriptText, globalAudioPath)
          if (fs.existsSync(globalAudioPath)) {
            script.globalAudio = 'narration.mp3'
            console.log(`[NanoBanana] ✓ Narration re-generated from script at ${globalAudioPath}`)
          }
        } catch (error: any) {
          console.error(
            `[NanoBanana] ❌ Narration re-generation failed: ${error.message}. Assembly will have no audio.`
          )
        }
      }

      // --- TRANSCRIPTION FOR ASS CAPTIONS (assembly-only) ---
      // If assCaptions is enabled and word timings are not already in the script, run Whisper to get them.
      // This is needed so VideoAssembler.generateGlobalASS produces word-highlighted subtitles.
      const needsTranscription = fs.existsSync(globalAudioPath)

      if (needsTranscription) {
        if (onProgress) await onProgress(26, 'Synchronizing word timings (Whisper AI)...')
        console.log(`[NanoBanana] ASS captions enabled — running Whisper transcription for word timings...`)
        try {
          // Auto-initialize Whisper if needed
          if (!(await this.getTranscriptionService())) {
            this.currentTranscriptionConfig = {
              provider: 'whisper-local',
              model: 'base',
              device: 'cpu',
              language: validOptions.language?.split('-')[0] || 'en'
            }
            this.transcriptionService = await TranscriptionServiceFactory.create(this.currentTranscriptionConfig as any)
          }

          const transcriptionService = (await this.getTranscriptionService())!
          const transcriptionResult = await transcriptionService.transcribe(globalAudioPath, async (p, msg) => {
            if (onProgress) {
              const transProgress = 26 + Math.round(p * 0.09)
              await onProgress(transProgress, `Synchronisation vocale : ${p}%`)
            }
          })
          const assemblyWordTimings = transcriptionResult.wordTimings

          // Map word timings back to scenes (using existing TimeRange from script)
          const sceneNarrations = script.scenes.map((s: any) => ({ sceneId: s.id, narration: s.narration }))
          const mappedTimings = TimingMapper.mapScenes(sceneNarrations, assemblyWordTimings)

          // Store word timings in each scene for generateGlobalASS to use
          mappedTimings.forEach((timing: any, idx: number) => {
            const scene = script.scenes[idx]
            // ALWAYS update timeRange with transcription ground truth (or proportional estimate for unmatched scenes)
            scene.timeRange = { start: timing.start, end: timing.end }
            if (timing.wordTimings.length > 0) {
              ;(scene as any).globalWordTimings = timing.wordTimings
            }
          })

          if (script.totalDuration === 0 && mappedTimings.length > 0) {
            script.totalDuration = mappedTimings.at(-1)!.end
          }

          console.log(
            `[NanoBanana] ✓ Transcription complete — word timings injected into ${mappedTimings.length} scenes`
          )

          // Trigger timing sync callback even in assembly-only mode
          if (onTimingSync) {
            console.log(`[NanoBanana-Assembly] Timing sync reached. Triggering callback...`)
            await onTimingSync(script)
          }
        } catch (error: any) {
          console.warn(
            `[NanoBanana] ⚠ Transcription failed, ASS captions will use scene text fallback: ${error.message}`
          )
        }
      }
    } else if (skipAudio && !validOptions.generateOnlyAssembly) {
      console.log(`[NanoBanana] Audio skipped. Estimating timing based on text length for scenes...`)
      let currentTime = 0
      script.scenes.forEach((scene) => {
        const wordCount = (scene.narration || '').split(/\s+/).length
        const duration = suggestSceneDuration(wordCount, undefined, 2.5, (scene as any).pacing)
        scene.timeRange = { start: currentTime, end: currentTime + duration }
        currentTime += duration
      })
      script.totalDuration = currentTime
      if (onProgress) await onProgress(27, 'Audio timing estimated. Starting composition...')
    }

    // --- SCENE COMPOSITION ---
    // Skip composition if we only want audio OR if visuals are already generated
    // BUT ALWAYS allow composition if we are REPROMPTING a specific scene
    const skipComposition =
      (validOptions.generateOnlyAudio || validOptions.generateOnlyAssembly) && validOptions.repromptSceneIndex == null
    if (!skipComposition) {
      const startSceneIndex = validOptions.resumeFromSceneIndex ?? 0
      const locationImageMap = new Map<string, string>()

      if (startSceneIndex > 0) {
        console.log(
          `[NanoBanana] Resuming scene generation from index ${startSceneIndex} (${script.scenes.length - startSceneIndex} scenes to generate)`
        )
      }

      let completedScenesCount = 0
      for (let i = startSceneIndex; i < script.scenes.length; i++) {
        const scene = script.scenes[i]

        // If we are only re-prompting a specific scene, skip others
        // BUT we must still load the lastSceneImageBase64 from the preceding scene to maintain continuity if requested.
        const repromptVal =
          validOptions.repromptSceneIndex != null ? String(validOptions.repromptSceneIndex) : undefined
        const isTargetScene =
          repromptVal !== undefined &&
          (repromptVal === String(i) || // 0-based match
            repromptVal === String(i + 1) || // 1-based match
            repromptVal === scene.id) // ID match

        if (repromptVal !== undefined && !isTargetScene) {
          const expectedSceneDir = path.join(scenesDir, scene.id)
          const expectedImagePath = path.join(expectedSceneDir, 'scene.webp')
          if (fs.existsSync(expectedImagePath)) {
            lastSceneImageBase64 = fs.readFileSync(expectedImagePath).toString('base64')
            // Also seed the location map from existing files during a skip/resume
            if (scene.locationId && !locationImageMap.has(scene.locationId)) {
              locationImageMap.set(scene.locationId, lastSceneImageBase64)
            }
          }
          completedScenesCount++ // Count as completed since it's skipped
          continue
        }

        const expectedSceneDir = path.join(scenesDir, scene.id)
        const expectedImagePath = path.join(expectedSceneDir, 'scene.webp')
        if (fs.existsSync(expectedImagePath) && repromptVal === undefined) {
          console.log(`[NanoBanana] Scene ${i + 1} already has an image, skipping generation to allow resumption...`)
          lastSceneImageBase64 = fs.readFileSync(expectedImagePath).toString('base64')
          // Also seed the location map from existing files during a skip/resume
          if (scene.locationId && !locationImageMap.has(scene.locationId)) {
            locationImageMap.set(scene.locationId, lastSceneImageBase64)
          }
          completedScenesCount++ // Count as completed since it's already there
          continue
        }

        const progressMessage = `Preparing scene ${i + 1}/${script.scenes.length}...`
        console.log(`[NanoBanana] ${progressMessage}`)

        // Perform task execution (parallelized internally if needed)
        await this.generationQueue.add(async () => {
          const repromptVal =
            validOptions.repromptSceneIndex != null ? String(validOptions.repromptSceneIndex) : undefined
          const isReprompt =
            repromptVal !== undefined &&
            (repromptVal === String(i) || // 0-based match
              repromptVal === String(i + 1) || // 1-based match
              repromptVal === scene.id) // ID match

          if (isReprompt) {
            console.log(`[NanoBanana] 🎯 Target MATCHED for reprompt: Index=${i}, Value=${repromptVal}`)
          }

          // Load previous scene image if this scene continues from it
          if (scene.continueFromPrevious && i > 0 && !lastSceneImageBase64) {
            const prevScene = script.scenes[i - 1]
            const prevSceneDir = path.join(scenesDir, prevScene.id)
            const prevImagePath = path.join(prevSceneDir, 'scene.webp')
            if (fs.existsSync(prevImagePath)) {
              lastSceneImageBase64 = fs.readFileSync(prevImagePath).toString('base64')
            }
          }

          const sceneDir = path.join(scenesDir, scene.id)
          if (!fs.existsSync(sceneDir)) {
            fs.mkdirSync(sceneDir, { recursive: true })
          }

          // Determine scene-specific reference images
          // 1. High Priority: Global Style
          const sceneBaseImages: (string | { name: string; data: string })[] = []
          sceneBaseImages.push(...baseImages)

          // 3. Context/Anchor: Location
          // We add this LAST so it acts as a background context rather than a subject reference.
          // IMPORTANT: Skip location anchoring during manual REPROMPTS to allow the user to escape a bad style/DNA.
          if (scene.locationId && !isReprompt) {
            const locationRef = locationImageMap.get(scene.locationId)
            if (locationRef) {
              console.log(`[NanoBanana] ⚓ Anchoring background for ${scene.id} to location: ${scene.locationId}`)
              sceneBaseImages.push({ name: 'LOCATION', data: locationRef })
            }
          }

          // Compose scene
          try {
            const memory = (script as any).memory || {
              locations: new Map(),
              timeOfDay: '',
              weather: ''
            }

            await this.composeScene(scene, sceneBaseImages, sceneDir, lastSceneImageBase64, isReprompt, script, memory)

            // Update Progress inside the task execution
            completedScenesCount++
            const sceneProgress =
              27 + Math.round(((startSceneIndex + completedScenesCount) / script.scenes.length) * 58)

            if (onProgress) {
              await onProgress(sceneProgress, `Generated scene ${i + 1}/${script.scenes.length}...`, {
                currentSceneIndex: i
              })
            }

            if (onSceneGenerated) {
              console.log(`[NanoBanana] Scene ${i + 1} generated. Triggering visualization callback...`)
              await onSceneGenerated(scene, script, i + 1, sceneProgress)
            }

            // Skip redundant per-scene audio generation as it is now done in the INITIAL phase
            // However, we ensure the manifest correctly references the already generated audio if needed
            const sceneAudioPath = path.join(sceneDir, 'narration.mp3')
            if (fs.existsSync(sceneAudioPath)) {
              // (scene as any).audioDuration and (scene as any).globalWordTimings are already injected
            }

            // Update continuity tracking
            const lastImagePath = path.join(sceneDir, 'scene.webp')
            if (fs.existsSync(lastImagePath)) {
              lastSceneImageBase64 = fs.readFileSync(lastImagePath).toString('base64')
              // Store this scene as the visual anchor for its locationId
              if (scene.locationId && !locationImageMap.has(scene.locationId)) {
                locationImageMap.set(scene.locationId, lastSceneImageBase64)
              }
            }
          } catch (sceneError) {
            console.error(`[NanoBanana] Failed to generate scene ${scene.id}:`, sceneError)
          }
        })
      }
    }

    // Wait for all queued tasks to complete before assembly
    await this.generationQueue.onIdle()

    // --- GLOBAL AUDIO CONCATENATION ---
    // ALREADY COMPLETED in the initial phase.
    // If it somehow failed, we could retry here, but usually, it's done.

    // --- ASSEMBLE FINAL VIDEO ---
    const skipAssembly =
      validOptions.scriptOnly ||
      validOptions.generateOnlyScenes ||
      validOptions.generateOnlyAudio ||
      validOptions.repromptSceneIndex !== undefined
    if (!skipAssembly) {
      // Ensure all scene images are present locally before assembly
      for (const [index, scene] of script.scenes.entries()) {
        const sceneDir = path.join(scenesDir, scene.id)
        const localPath = path.join(sceneDir, 'scene.webp')

        if (!fs.existsSync(localPath) && scene.imageUrl) {
          console.log(
            `[NanoBanana] Downloading missing local scene image ${index + 1}/${script.scenes.length} from MinIO...`
          )
          if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true })
          try {
            const response = await axios.get(scene.imageUrl, { responseType: 'arraybuffer' })
            fs.writeFileSync(localPath, Buffer.from(response.data))
          } catch (error: any) {
            console.warn(`[NanoBanana] Failed to download scene image from MinIO: ${error.message}`)
          }
        }
      }

      try {
        const videoAssembler = new VideoAssembler()
        const finalVideoPath = await videoAssembler.assembleVideo(
          script,
          scenesDir,
          projectDir,
          (validOptions.animationMode || 'panning') as 'panning' | 'ai' | 'composition' | 'static' | 'none',
          {
            ...validOptions,
            globalAudioPath: fs.existsSync(globalAudioPath) ? globalAudioPath : undefined
          },
          async (p, m) => {
            if (onProgress) {
              const assemblyProgress = validOptions.generateOnlyAssembly
                ? Math.round(p)
                : 85 + Math.round((p / 100) * 15)
              await onProgress(assemblyProgress, m)
            }
          }
        )
        console.log(`\n✅ VIDEO ASSEMBLY COMPLETE: ${finalVideoPath}`)
        if (onProgress) await onProgress(100, 'Video finalized! Saving results...')

        // --- CLEANUP INTERMEDIATE FILES ---
        await this.cleanupProject(projectDir, 'intermediate')
      } catch (assemblyError) {
        console.error(`\n❌ VIDEO ASSEMBLY FAILED:`, assemblyError)
      }
    } else {
      console.log(
        `[NanoBanana] Skipping final assembly (Mode: ${validOptions.generateOnlyAudio ? 'Audio Only' : 'Scenes Only'})`
      )
    }

    const stats = {
      apiCalls: script.sceneCount,
      generationTimeMs: Date.now() - startTime
    }

    fs.writeFileSync(path.join(projectDir, 'metadata.json'), JSON.stringify(stats, null, 2))
    return {
      script,
      projectId: path.basename(projectDir),
      outputPath: projectDir,
      generatedAt: new Date().toISOString(),
      metadata: stats
    }
  }

  /**
   * MVP shortcut: generate a short, simple static video with minimal choices.
   */
  async generateMvp(
    topic: string,
    baseImages: string[] = [],
    userId?: string,
    qualityMode: QualityMode = QualityMode.LOW_COST,
    branding?: BrandingConfig,
    enableContextualBackground: boolean = true,
    assCaptions?: AssCaptionConfig
  ): Promise<CompleteVideoPackage> {
    return this.generateVideoFromTopic(
      topic,
      {
        userId,
        qualityMode,
        enableContextualBackground,
        branding: branding || {
          watermarkText: 'PRO MASTER 2026',
          position: 'top-right' as any,
          opacity: 1,
          scale: 1
        },
        duration: 120,
        animationMode: 'none',
        aspectRatio: '16:9',
        scriptOnly: false,
        imageProvider: 'gemini',
        llmProvider: 'gemini',
        kokoroVoicePreset: KokoroVoicePreset.BF_ISABELLA,
        backgroundMusic: 'upbeat',
        assCaptions: assCaptions || {
          enabled: true,
          style: 'colored',
          fontSize: 70,
          fontFamily: 'Montserrat',
          position: 'bottom',
          inactiveColor: '#FFFFFF',
          highlightColor: '#FFE135',
          borderSize: 2,
          shadowSize: 3
        }
      },
      baseImages
    )
  }

  private async stitchAudioFiles(filePaths: string[], outputPath: string): Promise<void> {
    const listFile = `${outputPath}.list.txt`
    const fileListContent = filePaths.map((p) => `file '${path.resolve(p)}'`).join('\n')
    fs.writeFileSync(listFile, fileListContent)

    try {
      // Use ffmpeg concat demuxer with aresample to ensure clean timestamps
      await runFfmpeg([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-af',
        'aresample=async=1',
        '-ac',
        '2',
        '-ar',
        '44100',
        '-y',
        outputPath
      ])
    } finally {
      if (fs.existsSync(listFile)) fs.unlinkSync(listFile)
    }
  }

  /**
   * Clears the scene image cache to force regeneration.
   * Useful when you want to regenerate scenes with different parameters.
   */
  clearImageCache(): void {
    this.sceneCache.clear()
    console.log('[NanoBanana] Scene image cache cleared')
  }

  /**
   * Gets the current cache size for debugging purposes.
   */
  getCacheStats(): { entries: number; cacheFile: string } {
    const cacheSize = Object.keys((this.sceneCache as any).cache).length
    const cacheFile = (this.sceneCache as any).filePath
    return { entries: cacheSize, cacheFile }
  }

  /**
   * Final production cleanup.
   * - 'intermediate': removes scenes and intermediate assembly files, keeps final video/metadata.
   * - 'full': removes the entire project directory.
   */
  private async cleanupProject(projectDir: string, mode: 'intermediate' | 'full' = 'intermediate'): Promise<void> {
    if (!fs.existsSync(projectDir)) return

    if (mode === 'full') {
      console.log(`[NanoBanana] 🔥 Purging project directory: ${projectDir}`)
      fs.rmSync(projectDir, { recursive: true, force: true })
      return
    }

    console.log(`[NanoBanana] 🧹 Cleaning up intermediate artifacts in: ${projectDir}`)

    // 1. Delete scenes directory
    const scenesDir = path.join(projectDir, 'scenes')
    if (fs.existsSync(scenesDir)) {
      fs.rmSync(scenesDir, { recursive: true, force: true })
    }

    // 2. Delete intermediate root files (concatenations, unpolished versions, etc.)
    const rootFiles = fs.readdirSync(projectDir)
    const filesToDelete = rootFiles.filter((file) => {
      // Keep only these files
      const toKeep = ['final_video.mp4', 'script.json', 'script.md', 'metadata.json', 'subtitles.srt']
      return !toKeep.includes(file)
    })

    for (const file of filesToDelete) {
      const filePath = path.join(projectDir, file)
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath)
      }
    }
  }

  /**
   * Public API to manually purge a project (e.g., on cancellation)
   */
  public async purgeProject(projectId: string): Promise<void> {
    const projectDir = path.join(this.outputDir, projectId)
    await this.cleanupProject(projectDir, 'full')
  }
}
