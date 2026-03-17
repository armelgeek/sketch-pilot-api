import * as fs from 'node:fs'
import * as path from 'node:path'
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
import { getCharacterModelManager } from '../utils/character-models'
import { TaskQueue } from '../utils/task-queue'
import { TimingMapper } from '../utils/timing-mapper'

import { PromptManager, type PromptManagerConfig } from './prompt-manager'
import { VideoScriptGenerator } from './video-script-generator'
import '../utils/polyfills'

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
  private currentOptions: VideoGenerationOptions = videoGenerationOptionsSchema.parse({})
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
  private readonly styleSuffix?: string
  private readonly transcriptionConfig?: TranscriptionConfig

  constructor(
    apiKey: string,
    styleSuffix?: string,
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
    this.styleSuffix = styleSuffix
    this.transcriptionConfig = transcriptionConfig

    this.currentTranscriptionConfig = transcriptionConfig || {
      provider: 'whisper-local',
      model: 'base',
      device: 'cpu',
      language: 'en'
    }

    this.client = new GoogleGenAI({ apiKey })

    this.promptManager = new PromptManager(
      promptSpecs || {
        backgroundColor: '#F5F5F5'
      }
    )
    this.systemPrompt = systemPrompt ?? this.promptManager.buildScriptCompletePrompt('', {} as any)

    this.currentImageProvider = imageConfig?.provider || 'gemini'
    this.currentLLMProvider = llmConfig?.provider || 'gemini'

    this.sceneCache = new SceneCacheService()

    // Pass the shared PromptManager into VideoScriptGenerator via constructor injection
    this.scriptGenerator = new VideoScriptGenerator(this.llmService, this.promptManager)

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

    // Ensure output directory exists
    const outputDir = path.join(__dirname, '..', '..', 'output')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Getters for Lazy Service Initialization
  // ─────────────────────────────────────────────────────────────────────────────

  get audioService(): AudioService {
    if (!this._audioService) {
      this._audioService = AudioServiceFactory.create(
        this.audioConfig || {
          provider: 'kokoro',
          lang: 'en',
          apiKey: process.env.HUGGING_FACE_TOKEN || this.apiKey,
          kokoroVoicePreset: this.currentKokoroVoicePreset
        }
      )
    }
    return this._audioService
  }

  set audioService(service: AudioService) {
    this._audioService = service
  }

  get animationService(): AnimationService {
    if (!this._animationService) {
      this._animationService = AnimationServiceFactory.create(
        this.animationConfig || { provider: 'veo', apiKey: this.apiKey }
      )
    }
    return this._animationService
  }

  set animationService(service: AnimationService) {
    this._animationService = service
  }

  get imageService(): ImageService {
    if (!this._imageService) {
      this._imageService = ImageServiceFactory.create(
        this.imageConfig || {
          provider: this.currentImageProvider,
          apiKey: this.apiKey,
          styleSuffix: this.styleSuffix,
          systemPrompt: this.systemPrompt
        }
      )
    }
    return this._imageService
  }

  set imageService(service: ImageService) {
    this._imageService = service
  }

  get llmService(): LLMService {
    if (!this._llmService) {
      this._llmService = LLMServiceFactory.create(
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

  get transcriptionService(): TranscriptionService | undefined {
    if (!this._transcriptionService && this.transcriptionConfig) {
      this._transcriptionService = TranscriptionServiceFactory.create(this.transcriptionConfig as any)
    }
    return this._transcriptionService
  }

  set transcriptionService(service: TranscriptionService | undefined) {
    this._transcriptionService = service
  }

  async generateImage(scene: EnrichedScene, baseImages: string[], filename: string): Promise<string> {
    const hasReferenceImages = baseImages.length > 0
    const { prompt: fullPrompt } = this.promptManager.buildImagePrompt(
      scene,
      hasReferenceImages,
      this.currentOptions?.aspectRatio || '16:9',
      this.currentOptions?.imageStyle
    )

    const systemInstruction = this.promptManager.buildImageSystemInstruction(hasReferenceImages)

    const cacheKey = `${scene.id}-${this.currentOptions?.qualityMode || 'standard'}-${this.currentOptions?.aspectRatio || '16:9'}`
    const cachedResult = this.sceneCache.get(fullPrompt, {
      sceneId: scene.id,
      imageStyle: this.currentOptions?.imageStyle
    })

    if (cachedResult) {
      console.log(`[NanoBanana] ✓ Using cached image for scene ${scene.id}`)
      return cachedResult
    }

    try {
      const quality =
        this.currentOptions?.qualityMode === QualityMode.LOW_COST
          ? 'ultra-low'
          : this.currentOptions?.qualityMode === QualityMode.HIGH_QUALITY
            ? 'high'
            : 'medium'

      const seed = parseInt(scene.id.replaceAll(/\D/g, '').slice(0, 10) || '12345', 10)

      const result = await this.imageService.generateImage(fullPrompt, filename, {
        quality,
        smartUpscale: true,
        format: 'webp',
        aspectRatio: this.currentOptions?.aspectRatio || '16:9',
        removeBackground: false,
        skipTrim: true,
        referenceImages: baseImages,
        systemInstruction,
        seed
      })

      this.sceneCache.set(fullPrompt, result, {
        sceneId: scene.id,
        imageStyle: this.currentOptions?.imageStyle
      })
      return result
    } catch (error: any) {
      if (this.currentImageProvider !== 'gemini' && this.isNetworkError(error)) {
        console.warn(`[NanoBanana] Network error with ${this.currentImageProvider}, falling back to Gemini...`)
        try {
          const seed = parseInt(scene.id.replaceAll(/\D/g, '').slice(0, 10) || '12345', 10)
          const geminiService = ImageServiceFactory.create({
            provider: 'gemini',
            apiKey: this.apiKey
          } as any)
          const result = await geminiService.generateImage(fullPrompt, filename, {
            quality: 'medium',
            smartUpscale: true,
            format: 'webp',
            aspectRatio: this.currentOptions?.aspectRatio || '16:9',
            removeBackground: false,
            skipTrim: true,
            referenceImages: baseImages,
            systemInstruction,
            seed
          })
          this.sceneCache.set(fullPrompt, result, {
            sceneId: scene.id,
            imageStyle: this.currentOptions?.imageStyle
          })
          return result
        } catch (fallbackError) {
          console.error(`[NanoBanana] Fallback to Gemini also failed:`, fallbackError)
          throw fallbackError
        }
      }

      console.error(`[NanoBanana] Error generating image for scene ${scene.id}:`, error)
      throw error
    }
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
  private isNetworkError(error: any): boolean {
    const message = error?.message || ''
    const code = error?.code || ''
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
  async composeScene(
    scene: EnrichedScene,
    baseImages: string[],
    targetDir: string,
    lastSceneImage?: string,
    isReprompt: boolean = false
  ): Promise<void> {
    console.log(`\n--- Composing Scene: ${scene.id} ---`)
    const options = this.currentOptions || ({} as any)
    const animationMode = options.animationMode || 'static'
    const aspectRatio = options.aspectRatio || '16:9'
    let totalDuration = scene.timeRange ? scene.timeRange.end - scene.timeRange.start : 5

    console.log(`[NanoBanana] Options: Mode=${animationMode}, Clip=${options.animationClipDuration}s`)

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const layers: any[] = []
    const sceneImage = 'scene.webp'
    const imagePath = path.join(targetDir, `scene.webp`)

    const effectiveBaseImages = [...baseImages]
    if (scene.continueFromPrevious && lastSceneImage) {
      effectiveBaseImages.push(lastSceneImage)
    }

    const [width, height] = aspectRatio === '9:16' ? [720, 1280] : aspectRatio === '1:1' ? [1024, 1024] : [1280, 720]

    try {
      // Check if scene image already exists (but NOT if this is a reprompt)

      const tempBgPath = path.join(targetDir, 'temp_bg.webp')
      await this.generateImage(scene, effectiveBaseImages, tempBgPath)

      const composition = sharp(tempBgPath).resize(width, height, { fit: 'cover' })

      const overlays: any[] = []

      // 1. Onscreen text overlay
      if (scene.onscreenText) {
        const style = (scene as any).onscreenTextStyle || {}
        const globalStyle = this.currentOptions?.globalTextStyle || {}
        const sceneOverride = (this.currentOptions?.sceneStyles || {})[scene.id] || {}

        // Text renders ONLY when USER explicitly enables it via globalTextStyle or sceneStyles.
        // The AI-generated scene-level onscreenTextStyle is intentionally ignored here.
        const textEnabled = globalStyle.enabled === true || sceneOverride.enabled === true
        if (textEnabled) {
          const text = scene.onscreenText
          const textColor = sceneOverride.color || style.color || globalStyle.color || '#000000'
          const fontFamily = sceneOverride.fontFamily || style.fontFamily || globalStyle.fontFamily || 'sans-serif'
          const fontSize = sceneOverride.fontSize || style.fontSize || globalStyle.fontSize || Math.round(height * 0.08)
          const fontWeight = sceneOverride.fontWeight || style.fontWeight || globalStyle.fontWeight || 'bold'
          const maxWordsPerLine =
            sceneOverride.maxWordsPerLine || style.maxWordsPerLine || globalStyle.maxWordsPerLine || 6
          const highlightWords: Array<{ word: string; color: string }> =
            sceneOverride.highlightWords || style.highlightWords || []
          const globalHighlightColor = sceneOverride.highlightColor || globalStyle.highlightColor

          // Determine Y position and X anchor center in pixels
          let baseY: number
          let centerX: number

          const position = style.position || globalStyle.position
          const x = style.x ?? globalStyle.x
          const y = style.y ?? globalStyle.y

          if (position === 'custom' && x !== undefined && y !== undefined) {
            centerX = (x / 100) * width
            baseY = (y / 100) * height
          } else {
            centerX = width / 2
            const pos = position || 'top'

            if (pos === 'top') baseY = height * 0.15
            else if (pos === 'bottom') baseY = height * 0.85
            else baseY = height * 0.45 // center
          }

          // Split text into lines based on maxWordsPerLine
          const words = text.split(/\s+/)
          const lines: string[][] = []
          for (let i = 0; i < words.length; i += maxWordsPerLine) {
            lines.push(words.slice(i, i + maxWordsPerLine))
          }

          // Build highlight lookup (case-insensitive)
          const highlightMap = new Map<string, string>()
          for (const hw of highlightWords) {
            highlightMap.set(hw.word.toLowerCase(), hw.color || globalHighlightColor || textColor)
          }

          // Build SVG with multi-line tspans and per-word coloring
          const lineHeight = fontSize * 1.3
          const totalTextHeight = lines.length * lineHeight
          const startY = baseY - totalTextHeight / 2 + lineHeight / 2

          let textElements = ''
          lines.forEach((lineWords, lineIdx) => {
            const y = startY + lineIdx * lineHeight
            const tspans = lineWords
              .map((w, wIdx) => {
                const cleanWord = w.replaceAll(/[.,!?;:]/g, '')
                const hlColor = highlightMap.get(cleanWord.toLowerCase())
                const fill = hlColor || textColor
                // Escape special XML characters
                const escaped = w.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
                // Add space before word (except first word)
                const spacer = wIdx > 0 ? ' ' : ''
                return `${spacer}<tspan fill="${fill}">${escaped}</tspan>`
              })
              .join('')
            textElements += `<text xml:space="preserve" x="${centerX}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-weight="${fontWeight}" font-family="${fontFamily}">${tspans}</text>\n`
          })

          // Add a semi-transparent backing rectangle for readability (especially on AI backgrounds)
          const padding = 20
          const rectWidth = width * 0.9
          const rectHeight = totalTextHeight + padding * 2
          const rectX = centerX - rectWidth / 2
          const rectY = startY - lineHeight / 2 - padding

          const backingRect = `<rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" fill="rgba(255,255,255,0.7)" rx="15" />`

          const svgText = `<svg width="${width}" height="${height}">
              ${backingRect}
              ${textElements}
            </svg>`

          overlays.push({ input: Buffer.from(svgText), gravity: 'center' })
        }
      }

      // Final composition
      if (overlays.length > 0) {
        await composition.composite(overlays).webp().toFile(imagePath)
      } else {
        await composition.webp().toFile(imagePath)
      }

      // Clean up temporary background file
      if (fs.existsSync(tempBgPath)) {
        try {
          fs.unlinkSync(tempBgPath)
        } catch {
          // ignore cleanup errors
        }
      }
    } catch (error) {
      console.error(
        `[NanoBanana] Composition failed for scene ${scene.id}, creating white fallback:`,
        error instanceof Error ? error.message : error
      )
      console.log(`[NanoBanana] Writing fallback white image to ${imagePath} (${width}x${height})`)
      await sharp({
        create: { width, height, channels: 3, background: '#FFFFFF' }
      })
        .webp()
        .toFile(imagePath)
      console.log(`[NanoBanana] Fallback image written, exists: ${fs.existsSync(imagePath)}`)
    }

    // Generate thumbnail from scene image
    const thumbnailPath = path.join(targetDir, 'thumbnail.jpg')
    console.log(`[NanoBanana] Creating thumbnail from ${imagePath} at ${thumbnailPath}...`)
    if (!fs.existsSync(imagePath)) {
      console.error(`[NanoBanana] CRITICAL: Scene image not found at ${imagePath}! Cannot create thumbnail.`)
    } else {
      await this.generateThumbnail(imagePath, thumbnailPath)
      console.log(`[NanoBanana] Thumbnail created, exists: ${fs.existsSync(thumbnailPath)}`)
    }

    const audioPath = path.join(targetDir, `narration.mp3`)
    const wordTimings: WordTiming[] | undefined = (scene as any).globalWordTimings

    if (wordTimings && wordTimings.length > 0) {
      console.log(`[NanoBanana] Using global word timings for scene ${scene.id}`)
      // When using global audio, duration is exactly what Whisper measured
      totalDuration = scene.timeRange.end - scene.timeRange.start
    } else {
      console.warn(`[NanoBanana] ⚠ Word timings missing for scene ${scene.id}. Audio-visual sync may be degraded.`)
      totalDuration = 5 // Default fallback
    }

    // 5. Generate Animation (Queued) - primarily for AI mode
    let hasVideo = false
    const videoPath = path.join(targetDir, `animation.mp4`)
    const clipDuration = options.animationClipDuration || 6

    if (animationMode === 'ai' && scene.animationPrompt) {
      await this.generationQueue.add(
        async () => {
          try {
            await this.animationService.animateImage(
              path.join(targetDir, sceneImage),
              scene.animationPrompt,
              clipDuration,
              videoPath,
              aspectRatio
            )
            hasVideo = fs.existsSync(videoPath)
          } catch (error) {
            console.error(`[NanoBanana] Animation error:`, error)
          }
        },
        `Scene ${scene.id} Animation`,
        'animation'
      )
    }

    // 6. Subtitles are now handled by VideoAssembler during stitching to ensure perfect sync with padding

    // 7. Save Manifest
    const manifest: any = {
      id: scene.id,
      sceneImage,
      audio: !options.globalAudioPath && scene.narration ? 'narration.mp3' : undefined,
      video: hasVideo ? 'animation.mp4' : undefined,
      videoMeta: hasVideo ? { clipDuration, totalDuration, loop: true } : undefined,
      animationMode,
      layers: layers.length > 0 ? layers : undefined,
      panningEffect:
        animationMode === 'panning'
          ? {
              type: scene.cameraAction?.type || 'zoom-in',
              intensity: scene.cameraAction?.intensity || 'medium',
              duration: totalDuration
            }
          : undefined,
      aspectRatio,
      soundEffects: scene.soundEffects,
      cameraAction: scene.cameraAction,
      transitionToNext: scene.transitionToNext,
      backgroundColor: scene.backgroundColor || options.backgroundColor || '#FFFFFF',
      pauseBefore: (scene as any).pauseBefore,
      pauseAfter: (scene as any).pauseAfter,
      onscreenText: scene.onscreenText,
      visualMode: scene.visualMode
    }

    // Store both relative and global word timings if available
    if (wordTimings && wordTimings.length > 0) {
      const startTime = scene.timeRange.start

      // wordTimings: Relative to scene start (for clip effects)
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

      // globalWordTimings: Absolute (for global sync / subtitles)
      manifest.globalWordTimings = wordTimings.map((w) => ({
        ...w,
        start: Math.round(w.start * 100) / 100,
        end: Math.round(w.end * 100) / 100,
        startMs: Math.round(w.startMs)
      }))
    }

    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log(`[NanoBanana] Scene manifest saved to ${path.join(targetDir, 'manifest.json')}`)
  }

  /**
   * Regenerates the scene image and thumbnail for an existing scene directory.
   * Useful for re-generating just the visuals without re-running the full pipeline.
   *
   * @param scene - The enriched scene data containing imagePrompt and id
   * @param baseImages - Reference images as base64 strings for character consistency
   * @param targetDir - The scene directory where scene.webp and thumbnail.jpg will be written
   */
  async regenerateSceneImage(scene: EnrichedScene, baseImages: string[], targetDir: string): Promise<void> {
    console.log(`\n--- Regenerating Scene Image: ${scene.id} ---`)
    const aspectRatio = this.currentOptions?.aspectRatio || '16:9'
    const { prompt: fullPrompt } = this.promptManager.buildImagePrompt(
      scene,
      baseImages.length > 0,
      aspectRatio,
      this.currentOptions?.imageStyle
    )
    const imagePath = path.join(targetDir, 'scene.webp')

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    await this.generationQueue.add(
      () => this.generateImage(scene, baseImages, imagePath),
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
  async syncTimings(projectDir: string): Promise<void> {
    const scriptPath = path.join(projectDir, 'script.json')
    const globalAudioPath = path.join(projectDir, 'narration.mp3')

    if (!fs.existsSync(scriptPath) || !fs.existsSync(globalAudioPath)) {
      console.warn(`[NanoBanana] Cannot sync timings: script.json or narration.mp3 missing in ${projectDir}`)
      return
    }

    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8')) as CompleteVideoScript

    // Auto-initialize Whisper local if not already done
    if (!this.transcriptionService) {
      console.log(`[NanoBanana-Sync] Initializing Whisper for sync...`)
      this.transcriptionService = TranscriptionServiceFactory.create({
        provider: 'whisper-local',
        model: 'base',
        device: 'cpu',
        language: 'en'
      })
    }

    console.log(`[NanoBanana-Sync] Transcribing global audio for project: ${path.basename(projectDir)}`)
    const transcriptionResult = await this.transcriptionService.transcribe(globalAudioPath)
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
    options: Partial<VideoGenerationOptions> = {}
  ): Promise<CompleteVideoScript> {
    const validOptions = videoGenerationOptionsSchema.parse(options)

    // Dynamic LLM provider switching
    if (validOptions.llmProvider !== this.currentLLMProvider) {
      console.log(`[NanoBanana] Switching LLM provider: ${this.currentLLMProvider} -> ${validOptions.llmProvider}`)
      this.currentLLMProvider = validOptions.llmProvider
      this.llmService = LLMServiceFactory.create({
        provider: this.currentLLMProvider,
        apiKey: this.currentLLMProvider === 'grok' ? process.env.XAI_API_KEY || this.apiKey : this.apiKey,
        cacheSystemPrompt: true // ← Option B: Enable prompt caching
      })

      // Re-initialize generator with new service, sharing the same PromptManager
      this.scriptGenerator = new VideoScriptGenerator(this.llmService, this.promptManager)
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
      this.transcriptionService = TranscriptionServiceFactory.create(this.currentTranscriptionConfig as any)
    }

    try {
      return await this.generationQueue.add(
        () => this.scriptGenerator.generateCompleteScript(topic, validOptions),
        `Script Generation: ${topic}`,
        'llm'
      )
    } catch (error) {
      // Network error fallback: if Grok LLM fails, try Claude Haiku
      const isNetError = this.isNetworkError(error)
      if (isNetError && this.currentLLMProvider === 'grok') {
        console.warn(`[NanoBanana] Network error with Grok LLM, falling back to Claude Haiku...`)
        this.currentLLMProvider = 'haiku'
        this.llmService = LLMServiceFactory.create({
          provider: 'haiku',
          apiKey: this.apiKey,
          cacheSystemPrompt: true
        })

        // Re-initialize generator with Claude
        this.scriptGenerator = new VideoScriptGenerator(this.llmService, this.promptManager)

        // Retry with Claude Haiku
        try {
          return await this.scriptGenerator.generateCompleteScript(topic, validOptions)
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
    fs.writeFileSync(path.join(outputPath, 'script.json'), JSON.stringify(script, null, 2))
    fs.writeFileSync(path.join(outputPath, 'script.md'), this.scriptGenerator.exportToMarkdown(script))
  }

  /**
   * Generates a "Character Bible" (Scene 0) Grid to anchor visual consistency.
   * This generates a single square grid with multi-angle reference shots.
   */
  async generateCharacterBible(
    script: CompleteVideoScript,
    projectDir: string,
    existingBaseImages: string[] = []
  ): Promise<string[]> {
    console.log(`\n[NanoBanana] --- Generating Character Bible (Scene 0) ---`)

    // Gather all unique character variants from the script
    const uniqueCharacters = Array.from(
      new Set(script.scenes.map((s) => s.characterVariant).filter(Boolean) as string[])
    )

    if (uniqueCharacters.length === 0) {
      uniqueCharacters.push('standard')
    }

    try {
      const bibleImageUrl = await this.imageService.generateImage(
        `CHARACTER BIBLE: Consistent ${uniqueCharacters.join(', ')} design.`,
        path.join(projectDir, 'character_bible.webp'),
        {
          aspectRatio: '1:1', // Grid is best as square
          referenceImages: existingBaseImages,
          systemInstruction: `You are creating a CHARACTER REFERENCE SHEET. 
Output a 2x2 grid. 
${
  uniqueCharacters.length > 1
    ? `Include all characters: ${uniqueCharacters.join(', ')}. Each should have at least one full-body and one clear face shot.`
    : 'Include: 1. Full body front, 2. Dynamic pose, 3. Face close-up, 4. Side profile.'
}
PLAIN WHITE BACKGROUND.`
        }
      )

      if (fs.existsSync(bibleImageUrl)) {
        console.log(`[NanoBanana] ✓ Character Bible generated: ${bibleImageUrl}`)
        const buffer = fs.readFileSync(bibleImageUrl)
        const biblePath = path.join(projectDir, 'character_bible.webp')
        fs.writeFileSync(biblePath, buffer)
        return [buffer.toString('base64')]
      }
    } catch (error) {
      console.warn(`[NanoBanana] ⚠ Failed to generate Character Bible, falling back to existing models.`, error)
    }
    return []
  }

  /**
   * Generate complete video from topic.
   */
  async generateVideoFromTopic(
    topic: string,
    options: Partial<VideoGenerationOptions> = {},
    baseImages: string[] = [],
    projectId?: string,
    onProgress?: (progress: number, message: string) => Promise<void>
  ): Promise<CompleteVideoPackage> {
    const validOptions = videoGenerationOptionsSchema.parse(options)
    this.currentOptions = validOptions

    if (onProgress) {
      await onProgress(5, `Generating script for topic: ${topic}...`)
    }

    console.log(`\n=== GENERATING SCRIPT: ${topic} ===`)
    const script = await this.generateStructuredScript(topic, validOptions)

    if (onProgress && validOptions.scriptOnly) {
      await onProgress(100, `Script generated successfully.`)
    } else if (onProgress) {
      await onProgress(15, `Script generated. Starting asset generation...`)
    }

    return this.generateVideoFromScript(script, options, baseImages, projectId, onProgress)
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
    onProgress?: (progress: number, message: string) => Promise<void>
  ): Promise<CompleteVideoPackage> {
    const startTime = Date.now()
    const validOptions = videoGenerationOptionsSchema.parse(options)
    this.currentOptions = validOptions

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
      this.imageService = ImageServiceFactory.create({
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
      this.audioService = AudioServiceFactory.create({
        provider: 'kokoro',
        lang: (validOptions.language?.split('-')[0] || 'en') as any,
        apiKey: process.env.HUGGING_FACE_TOKEN || this.apiKey,
        kokoroVoicePreset: this.currentKokoroVoicePreset
      })
    }

    // Set background color from options
    if (validOptions.backgroundColor) {
      this.promptManager.setBackgroundColor(validOptions.backgroundColor)
    }

    console.log(`\n=== GENERATING VIDEO FROM SCRIPT ===`)

    // ─────────────────────────────────────────────────────────────────────────
    // AUTO-LOAD CHARACTER MODELS FOR CONSISTENCY
    // ─────────────────────────────────────────────────────────────────────────
    const characterModelManager = getCharacterModelManager()
    const characterReferenceMap = new Map<string, string[]>() // name -> base64[]

    // 1. Process Enrolled Characters (Explicit User Choice)
    if (validOptions.characters && validOptions.characters.length > 0) {
      console.log(`[NanoBanana] Loading enrolled characters: ${validOptions.characters.map((c) => c.name).join(', ')}`)
      for (const enrollment of validOptions.characters) {
        let model = null
        if (enrollment.modelId) {
          model = await characterModelManager.loadCharacterModelById(enrollment.modelId)
        } else {
          model = await characterModelManager.loadCharacterModel({ name: enrollment.name })
        }

        if (model) {
          characterReferenceMap.set(enrollment.name, [model.base64])
          if (enrollment.modelId) {
            characterReferenceMap.set(enrollment.modelId, [model.base64])
          }
        }
      }
    }

    // 2. Process Script Characters (Auto-Discovered by LLM)
    const scriptCharacters = script.characterSheets || []
    for (const charSheet of scriptCharacters) {
      if (characterReferenceMap.has(charSheet.name)) continue

      console.log(`[NanoBanana] Resolving reference for script character: ${charSheet.name}`)

      // A. Custom Reference Image (User Refined)
      if (charSheet.referenceImageUrl) {
        try {
          console.log(
            `[NanoBanana] Loading custom reference image for ${charSheet.name}: ${charSheet.referenceImageUrl}`
          )
          const response = await axios.get(charSheet.referenceImageUrl, { responseType: 'arraybuffer' })
          const base64 = Buffer.from(response.data, 'binary').toString('base64')
          characterReferenceMap.set(charSheet.name, [base64])
          if (charSheet.id) characterReferenceMap.set(charSheet.id, [base64])
          continue // Priority: user-refined character image wins
        } catch (error: any) {
          console.warn(`[NanoBanana] ⚠ Failed to load custom reference for ${charSheet.name}:`, error.message)
        }
      }

      // B. Visual Model Reference (Standard Casting)
      let model = null
      if (charSheet.modelId && charSheet.modelId !== 'none') {
        model = await characterModelManager.loadCharacterModelById(charSheet.modelId)
      } else if (!charSheet.modelId) {
        // Try to match by metadata ONLY if no explicit modelId (or "none") was provided
        const metadata = charSheet.metadata
        model = await characterModelManager.loadCharacterModel({
          name: charSheet.name,
          gender: metadata?.gender,
          age: metadata?.age
        })
      }

      if (model) {
        console.log(`[NanoBanana] ✓ Matched "${charSheet.name}" to model: ${model.name}`)
        characterReferenceMap.set(charSheet.name, [model.base64])
        // Also key by internal IDs for robustness in scene mapping
        if (charSheet.id) characterReferenceMap.set(charSheet.id, [model.base64])
        if (charSheet.modelId && charSheet.modelId !== 'none') {
          characterReferenceMap.set(charSheet.modelId, [model.base64])
        }
      } else {
        console.warn(`[NanoBanana] ⚠ No model match for "${charSheet.name}". Will generate fresh visuals.`)
      }
    }

    // 3. Fallback for single model (Legacy Support)
    if (validOptions.characterModelId && characterReferenceMap.size === 0) {
      const model = await characterModelManager.loadCharacterModelById(validOptions.characterModelId)
      if (model) {
        characterReferenceMap.set('standard', [model.base64])
      }
    }

    if (characterReferenceMap.size > 0) {
      console.log(`[NanoBanana] ✓ characterReferenceMap initialized with ${characterReferenceMap.size} character(s)`)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHARACTER STUDIO (V2 Phase 2): Reference Images
    // ─────────────────────────────────────────────────────────────────────────
    const projectName = projectId || `video-${Date.now()}-${Math.random().toString(36).slice(7)}`
    const projectDir = path.join(__dirname, '..', '..', 'output', projectName)
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true })

    // Use all base images collectively for universal references if needed
    const allBaseImages = [...baseImages]
    characterReferenceMap.forEach((imgs) => allBaseImages.push(...imgs))

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

    // --- GLOBAL AUDIO GENERATION ---
    const skipAudio =
      validOptions.skipAudio ||
      validOptions.generateOnlyAssembly ||
      validOptions.repromptSceneIndex !== undefined ||
      false
    const globalAudioPath = path.join(projectDir, 'narration.mp3')
    let globalWordTimings: WordTiming[] = []

    // Skip generation if narration.mp3 already exists (Force re-use)
    const audioExists = fs.existsSync(globalAudioPath)
    if (audioExists && !skipAudio) {
      console.log(`[NanoBanana] Found existing global narration at ${globalAudioPath}. Skipping generation.`)
    }

    if (!skipAudio) {
      if (onProgress) await onProgress(10, 'Generating narration audio...')
      try {
        if (!audioExists) {
          console.log(`\n[NanoBanana] --- Generating Global Audio ---`)

          // Resolve character voices
          const characterVoices = new Map<string, string>()
          if (script.characterSheets) {
            for (const char of script.characterSheets as any[]) {
              if (char.voiceId && char.voiceId !== 'none') {
                characterVoices.set(char.id, char.voiceId)
              }
            }
          }

          const isMultiVoice = script.scenes.some(
            (s) => s.speakingCharacterId && characterVoices.has(s.speakingCharacterId)
          )

          if (isMultiVoice) {
            console.log(`[NanoBanana] Multi-voice detected. Generating scene-by-scene audio.`)
            const tempDir = path.join(projectDir, 'temp_audio')
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

            const sceneAudioFiles: string[] = []
            for (let i = 0; i < script.scenes.length; i++) {
              const scene = script.scenes[i]
              const sceneAudioPath = path.join(tempDir, `scene_${i}.mp3`)
              const voiceId = scene.speakingCharacterId ? characterVoices.get(scene.speakingCharacterId) : undefined

              console.log(
                `[NanoBanana] Generating scene ${i} audio ${voiceId ? `(Voice: ${voiceId})` : '(Global Voice)'}`
              )
              await this.audioService.generateSpeech(scene.narration, sceneAudioPath, {
                voice: voiceId,
                voiceId
              })
              sceneAudioFiles.push(sceneAudioPath)
            }

            console.log(`[NanoBanana] Stitching ${sceneAudioFiles.length} audio files...`)
            await this.stitchAudioFiles(sceneAudioFiles, globalAudioPath)

            // Cleanup temp
            try {
              fs.rmSync(tempDir, { recursive: true, force: true })
            } catch {
              /* ignore */
            }
          } else {
            console.log(`[NanoBanana] Single voice detected. Generating global narration.`)
            const fullScriptText = script.scenes.map((s) => s.narration).join('\n\n...\n\n') // Add strong pause between scenes
            await this.audioService.generateSpeech(fullScriptText, globalAudioPath)
          }
        } else {
          console.log(`[NanoBanana] Using existing global narration at ${globalAudioPath}`)
        }

        // Auto-initialize Whisper local if not already done
        if (!this.transcriptionService) {
          console.log(`[NanoBanana] Initializing Whisper for global timing...`)
          this.currentTranscriptionConfig = {
            provider: 'whisper-local',
            model: 'base',
            device: 'cpu',
            language: validOptions.language?.split('-')[0] || 'en'
          }
          this.transcriptionService = TranscriptionServiceFactory.create(this.currentTranscriptionConfig as any)
        }

        if (onProgress) await onProgress(12, 'Transcribing audio with Whisper...')
        console.log(`[NanoBanana] Transcribing global audio with Whisper...`)
        const transcriptionResult = await this.transcriptionService.transcribe(globalAudioPath)
        globalWordTimings = transcriptionResult.wordTimings

        if (onProgress) await onProgress(14, 'Mapping timings to scenes...')
        console.log(`[NanoBanana] Mapping global timings to scenes...`)
        const sceneNarrations = script.scenes.map((s) => ({ sceneId: s.id, narration: s.narration }))
        const mappedTimings = TimingMapper.mapScenes(sceneNarrations, globalWordTimings)

        // Update scene timeRanges and store timings
        mappedTimings.forEach((timing, idx) => {
          const scene = script.scenes[idx]
          scene.timeRange.start = timing.start
          scene.timeRange.end = timing.end
          ;(scene as any).globalWordTimings = timing.wordTimings
          if (timing.wordTimings.length === 0) {
            console.warn(
              `[NanoBanana] ⚠ Scene ${scene.id} could not be matched to any words in transcription. Using estimation.`
            )
          }
          console.log(
            `[NanoBanana] Scene ${scene.id}: ${timing.start.toFixed(2)}s -> ${timing.end.toFixed(2)}s (${timing.wordTimings.length} words)`
          )
        })

        // Update total duration
        if (mappedTimings.length > 0) {
          script.totalDuration = mappedTimings.at(-1)!.end
        }

        script.globalAudio = 'narration.mp3'

        // Persist the synchronized script so future renders use these exact timings
        fs.writeFileSync(path.join(projectDir, 'script.json'), JSON.stringify(script, null, 2))
        console.log(`[NanoBanana] Synchronized script saved to script.json`)
      } catch (audioError) {
        console.error(`[NanoBanana] Global audio generation/transcription failed:`, audioError)
      }
    } else if (validOptions.generateOnlyAssembly) {
      console.log(`[NanoBanana] Assembly-only mode: Loading existing global audio and script mappings...`)

      const forceRegen = (validOptions as any).forceRegenerateAudio

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
            await this.audioService.generateSpeech(fullScriptText, globalAudioPath)
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
          await this.audioService.generateSpeech(fullScriptText, globalAudioPath)
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
      const needsTranscription =
        validOptions.assCaptions?.enabled !== false &&
        fs.existsSync(globalAudioPath) &&
        script.scenes.some((s: any) => !s.globalWordTimings || s.globalWordTimings.length === 0)

      if (needsTranscription) {
        console.log(`[NanoBanana] ASS captions enabled — running Whisper transcription for word timings...`)
        try {
          // Auto-initialize Whisper if needed
          if (!this.transcriptionService) {
            this.currentTranscriptionConfig = {
              provider: 'whisper-local',
              model: 'base',
              device: 'cpu',
              language: validOptions.language?.split('-')[0] || 'en'
            }
            this.transcriptionService = TranscriptionServiceFactory.create(this.currentTranscriptionConfig as any)
          }

          const transcriptionResult = await this.transcriptionService.transcribe(globalAudioPath)
          const assemblyWordTimings = transcriptionResult.wordTimings

          // Map word timings back to scenes (using existing TimeRange from script)
          const sceneNarrations = script.scenes.map((s: any) => ({ sceneId: s.id, narration: s.narration }))
          const mappedTimings = TimingMapper.mapScenes(sceneNarrations, assemblyWordTimings)

          // Store word timings in each scene for generateGlobalASS to use
          mappedTimings.forEach((timing: any, idx: number) => {
            const scene = script.scenes[idx]
            if (timing.wordTimings.length > 0) {
              ;(scene as any).globalWordTimings = timing.wordTimings
              // Also update timeRange if it's still 0–0 (first generation)
              if (!scene.timeRange || (scene.timeRange.start === 0 && scene.timeRange.end === 0)) {
                scene.timeRange = { start: timing.start, end: timing.end }
              }
            }
          })

          if (script.totalDuration === 0 && mappedTimings.length > 0) {
            script.totalDuration = mappedTimings.at(-1)!.end
          }

          console.log(
            `[NanoBanana] ✓ Transcription complete — word timings injected into ${mappedTimings.length} scenes`
          )
        } catch (error: any) {
          console.warn(
            `[NanoBanana] ⚠ Transcription failed, ASS captions will use scene text fallback: ${error.message}`
          )
        }
      }
    }

    // --- SCENE COMPOSITION ---
    // Skip composition if we only want audio OR if visuals are already generated
    const skipComposition = validOptions.generateOnlyAudio || validOptions.generateOnlyAssembly
    if (!skipComposition) {
      const startSceneIndex = validOptions.resumeFromSceneIndex ?? 0
      if (startSceneIndex > 0) {
        console.log(
          `[NanoBanana] Resuming scene generation from index ${startSceneIndex} (${script.scenes.length - startSceneIndex} scenes to generate)`
        )
      }

      for (let i = startSceneIndex; i < script.scenes.length; i++) {
        const scene = script.scenes[i]

        if (validOptions.repromptSceneIndex !== undefined && validOptions.repromptSceneIndex !== i) {
          continue
        }

        // Report progress for scene generation
        const sceneProgress = 15 + ((i - startSceneIndex) / script.scenes.length) * 70
        const progressMessage = `Generating scene ${i + 1}/${script.scenes.length}...`
        if (onProgress) {
          await onProgress(sceneProgress, progressMessage)
        }
        console.log(`[NanoBanana] ${progressMessage} (${sceneProgress.toFixed(0)}%)`)

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

        // Determine scene-specific reference images based on characterIds
        const sceneCharacterNames = scene.characterIds || []
        const sceneBaseImages = [...baseImages]

        if (sceneCharacterNames.length > 0) {
          for (const charName of sceneCharacterNames) {
            const refs = characterReferenceMap.get(charName)
            if (refs) sceneBaseImages.push(...refs)
          }
        } else if (scene.characterVariant) {
          const refs = characterReferenceMap.get(scene.characterVariant)
          if (refs) sceneBaseImages.push(...refs)
        } else if (characterReferenceMap.has('standard')) {
          sceneBaseImages.push(...characterReferenceMap.get('standard')!)
        }

        // Compose scene (generates background internally, then overlays text)
        const isReprompt = validOptions.repromptSceneIndex === i
        await this.composeScene(scene, sceneBaseImages, sceneDir, lastSceneImageBase64, isReprompt)

        // Keep track of the last generated image to allow for "Scene Continuation"
        const lastImagePath = path.join(sceneDir, 'scene.webp')
        if (fs.existsSync(lastImagePath)) {
          lastSceneImageBase64 = fs.readFileSync(lastImagePath).toString('base64')
        }
      }

      // Wait for all queued tasks (animations, etc.) to complete before assembly
      await this.generationQueue.onIdle()

      // Report progress after scene generation complete
      if (onProgress) {
        await onProgress(85, 'Scene generation complete, assembling video...')
      }
    }

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
        if (onProgress) await onProgress(87, 'Assembling final video with FFmpeg...')
        const videoAssembler = new VideoAssembler()
        const finalVideoPath = await videoAssembler.assembleVideo(
          script,
          scenesDir,
          projectDir,
          (validOptions.animationMode || 'panning') as 'panning' | 'ai' | 'composition' | 'static' | 'none',
          {
            ...validOptions,
            globalAudioPath: fs.existsSync(globalAudioPath) ? globalAudioPath : undefined
          }
        )
        console.log(`\n✅ VIDEO ASSEMBLY COMPLETE: ${finalVideoPath}`)
        if (onProgress) await onProgress(98, 'Video assembled! Uploading...')
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
        minDuration: 100,
        maxDuration: 120,
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
    const { exec } = require('node:child_process')
    const { promisify } = require('node:util')
    const execAsync = promisify(exec)

    const listFile = `${outputPath}.list.txt`
    const fileListContent = filePaths.map((p) => `file '${path.resolve(p)}'`).join('\n')
    fs.writeFileSync(listFile, fileListContent)

    try {
      // Use ffmpeg concat demuxer with aresample to ensure clean timestamps
      await execAsync(
        `ffmpeg -f concat -safe 0 -i "${listFile}" -af "aresample=async=1" -ac 2 -ar 44100 -y "${outputPath}"`
      )
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
}
