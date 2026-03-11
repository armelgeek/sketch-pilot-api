import * as fs from 'node:fs'
import * as path from 'node:path'
import { GoogleGenAI } from '@google/genai'
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
import type { AssCaptionConfig } from '../services/video/ass-caption.service'
import { PromptManager } from './prompt-manager'
import { VideoScriptGenerator } from './video-script-generator'

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
    transcriptionConfig?: TranscriptionConfig
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

    this.promptManager = new PromptManager({
      backgroundColor: '#F5F5F5'
    })
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

    const visualSource = 'local' // Always local (100% local rule)

    // With 100% local mode, create fallback composition instead of AI generation
    if (this.currentOptions?.localOnlyImages !== false) {
      console.warn(
        `[NanoBanana] Local-only mode: Skipping AI image generation for scene ${scene.id}. Creating fallback image.`
      )
      const aspectRatio = this.currentOptions?.aspectRatio || '16:9'
      const [width, height] = aspectRatio === '9:16' ? [720, 1280] : aspectRatio === '1:1' ? [1024, 1024] : [1280, 720]

      await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: (scene as any).backgroundColor || this.currentOptions?.backgroundColor || '#FFFFFF'
        }
      })
        .webp()
        .toFile(filename)
      return filename
    }

    const systemInstruction = this.promptManager.buildImageSystemInstruction(hasReferenceImages)

    try {
      const quality =
        this.currentOptions?.qualityMode === QualityMode.LOW_COST
          ? 'ultra-low'
          : this.currentOptions?.qualityMode === QualityMode.HIGH_QUALITY
            ? 'high'
            : 'medium'

      return await this.imageService.generateImage(fullPrompt, filename, {
        quality,
        smartUpscale: true,
        format: 'webp',
        aspectRatio: this.currentOptions?.aspectRatio || '16:9',
        removeBackground: false,
        skipTrim: true,
        referenceImages: baseImages,
        systemInstruction
      })
    } catch (error: any) {
      if (this.currentImageProvider !== 'gemini' && this.isNetworkError(error)) {
        console.warn(`[NanoBanana] Network error with ${this.currentImageProvider}, falling back to Gemini...`)
        try {
          const geminiService = ImageServiceFactory.create({
            provider: 'gemini',
            apiKey: this.apiKey
          } as any)
          return await geminiService.generateImage(fullPrompt, filename, {
            quality: 'medium',
            smartUpscale: true,
            format: 'webp',
            aspectRatio: this.currentOptions?.aspectRatio || '16:9',
            removeBackground: false,
            skipTrim: true,
            referenceImages: baseImages,
            systemInstruction
          })
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
    bgPath?: string
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
    const sceneImage = 'scene.webp' // Default to WebP format

    // Standard single image generation
    const imagePrompt = scene.imagePrompt || scene.narration || ''
    const imagePath = path.join(targetDir, `scene.webp`)

    // Unified Reference Images: Bible + (Optional) Previous Scene
    const effectiveBaseImages = [...baseImages]
    if (scene.continueFromPrevious && lastSceneImage) {
      // Add the previous scene's image as a high-fidelity reference
      // It is placed AFTER the character bible to maintain identity but provide scene context
      effectiveBaseImages.push(lastSceneImage)
    }

    // Whiteboard Mode: Always white background, transparent character on top
    console.log(
      `[NanoBanana] Whiteboard Mode: Compositing assets for scene ${scene.id} (Pose: ${scene.poseId || 'STAND'})`
    )
    const [width, height] = aspectRatio === '9:16' ? [720, 1280] : aspectRatio === '1:1' ? [1024, 1024] : [1280, 720]

    // Resolve pose path
    const poseId = scene.poseId || 'STAND'
    const posePath = path.join(process.cwd(), 'src/assets/stickmen', `${poseId}.png`)

    try {
      // Start with AI-generated background or pure white
      const composition =
        bgPath && fs.existsSync(bgPath)
          ? sharp(bgPath)
          : sharp({
            create: {
              width,
              height,
              channels: 3,
              background: '#FFFFFF'
            }
          })

      const overlays: any[] = []

      // 1. Character pose overlay — ONLY in local mode (skip if AI already has the character)
      if (poseId !== 'NONE' && fs.existsSync(posePath) && !bgPath) {
        const style = (scene as any).onscreenTextStyle || {}
        const globalStyle = this.currentOptions?.globalTextStyle || {}
        const sceneOverride = (this.currentOptions?.sceneStyles || {})[scene.id] || {}

        const poseSpec = (scene as any).poseStyle || {}
        const globalPoseStyle = this.currentOptions?.globalPoseStyle || {}
        const scenePoseOverride = (this.currentOptions?.scenePoseStyles || {})[scene.id] || {}

        const posePos = scenePoseOverride.position || poseSpec.position || globalPoseStyle.position || 'center'
        const poseScale = scenePoseOverride.scale || poseSpec.scale || globalPoseStyle.scale || 1

        // Standard character height (~80% of canvas)
        const baseCharHeight = Math.floor(height * 1)
        const charHeight = Math.floor(baseCharHeight * poseScale)

        const poseBuffer = await sharp(posePath).resize({ height: charHeight, fit: 'inside' }).toBuffer()

        // Get actual dimensions of resized pose for precise positioning
        const poseMeta = await sharp(poseBuffer).metadata()
        const poseW = poseMeta.width || 0
        const poseH = poseMeta.height || 0

        // Horizontal positioning
        let leftOffset: number
        if (posePos === 'left') {
          leftOffset = Math.floor(width * 0.1)
        } else if (posePos === 'right') {
          leftOffset = Math.floor(width * 0.9 - poseW)
        } else if (
          posePos === 'custom' &&
          (scenePoseOverride.x !== undefined || poseSpec.x !== undefined || globalPoseStyle.x !== undefined)
        ) {
          const x = scenePoseOverride.x ?? poseSpec.x ?? globalPoseStyle.x ?? 50
          leftOffset = Math.floor((x / 100) * width - poseW / 2)
        } else {
          leftOffset = Math.floor((width - poseW) / 2) // default center
        }

        // Vertical positioning: Default to centered
        let topOffset: number
        if (
          posePos === 'custom' &&
          (scenePoseOverride.y !== undefined || poseSpec.y !== undefined || globalPoseStyle.y !== undefined)
        ) {
          const y = scenePoseOverride.y ?? poseSpec.y ?? globalPoseStyle.y ?? 50
          topOffset = Math.floor((y / 100) * height - poseH / 2)
        } else {
          topOffset = Math.floor((height - poseH) / 2)
        }

        overlays.push({ input: poseBuffer, top: topOffset, left: leftOffset })
      }

      // 2. Onscreen text overlay (independent of pose — can be mixed)
      if (scene.onscreenText) {
        const style = (scene as any).onscreenTextStyle || {}
        const globalStyle = this.currentOptions?.globalTextStyle || {}
        const sceneOverride = (this.currentOptions?.sceneStyles || {})[scene.id] || {}

        // Text renders ONLY when USER explicitly enables it via globalTextStyle or sceneStyles.
        // The AI-generated scene-level onscreenTextStyle is intentionally ignored here.
        const textEnabled = globalStyle.enabled === true || sceneOverride.enabled === true
        if (!textEnabled) {
          // Skip rendering — will be handled in post-edit
        } else {
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
            const hasCharacter = poseId !== 'NONE' && fs.existsSync(posePath)
            const pos = position || (hasCharacter ? 'top' : 'center')

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

      await composition.composite(overlays).webp().toFile(imagePath)
    } catch (error) {
      console.error(`[NanoBanana] Composition failed, creating solid white fallback:`, error)
      await sharp({
        create: { width, height, channels: 3, background: '#FFFFFF' }
      })
        .webp()
        .toFile(imagePath)
    }

    // Generate thumbnail from scene image
    const thumbnailPath = path.join(targetDir, 'thumbnail.jpg')
    await this.generateThumbnail(imagePath, thumbnailPath)

    // ── Keyword Visual Generation ──────────────────────────────────────────────
    // For each keywordVisual, generate an alt-image that will be spliced into
    // the video at the exact word timestamp when the keyword is spoken.
    if (scene.keywordVisuals && scene.keywordVisuals.length > 0) {
      console.log(`[NanoBanana] Generating ${scene.keywordVisuals.length} keyword visuals for scene ${scene.id}...`)
      const keywordManifest: Array<{ keyword: string; imagePath: string }> = []

      for (let i = 0; i < scene.keywordVisuals.length; i++) {
        const kv = scene.keywordVisuals[i]
        const kvPath = path.join(targetDir, `keyword_visual_${i}.webp`)

        await this.generationQueue.add(
          () =>
            this.generateImage(
              {
                ...scene,
                imagePrompt: kv.imagePrompt,
                narration: kv.imagePrompt
              } as EnrichedScene,
              baseImages,
              kvPath
            ),
          `Scene ${scene.id} Keyword Visual [${kv.keyword}]`,
          this.currentImageProvider
        )

        keywordManifest.push({ keyword: kv.keyword, imagePath: kvPath })
      }

      // Write manifest so VideoAssembler can look up keyword → image path
      const manifestPath = path.join(targetDir, 'keyword_visuals.json')
      fs.writeFileSync(manifestPath, JSON.stringify(keywordManifest, null, 2))
      console.log(`[NanoBanana] Keyword visual manifest written: ${manifestPath}`)
    }

    const audioPath = path.join(targetDir, `narration.mp3`)
    let wordTimings: WordTiming[] | undefined = (scene as any).globalWordTimings

    if (wordTimings && wordTimings.length > 0) {
      console.log(`[NanoBanana] Using global word timings for scene ${scene.id}`)
      // When using global audio, duration is exactly what Whisper measured
      totalDuration = scene.timeRange.end - scene.timeRange.start
    } else if (scene.narration && !options.skipAudio) {
      try {
        const audioResult = await this.audioService.generateSpeech(scene.narration, audioPath)
        wordTimings = audioResult.wordTimings

        // Try transcription if word timings are missing
        if (!wordTimings || wordTimings.length === 0) {
          // Auto-initialize Whisper local if not already done
          if (!this.transcriptionService) {
            console.log(`[NanoBanana] Word timings missing from TTS. Auto-initializing Whisper local...`)
            this.currentTranscriptionConfig = {
              provider: 'whisper-local',
              model: 'base',
              device: 'cpu',
              language: 'en'
            }
            this.transcriptionService = TranscriptionServiceFactory.create(this.currentTranscriptionConfig as any)
          }

          try {
            console.log(`[NanoBanana] Transcribing with ${this.currentTranscriptionConfig?.provider}...`)
            const transcriptionResult = await this.transcriptionService.transcribe(audioPath)
            wordTimings = transcriptionResult.wordTimings
          } catch (error) {
            console.error(`[NanoBanana] Transcription error:`, error)
          }
        }
      } catch (error) {
        console.error(`[NanoBanana] Audio error:`, error)
      }
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
    console.log(`[NanoBanana] Scene manifest saved.`)
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
    const globalAudioPath = path.join(projectDir, 'global_narration.mp3')

    if (!fs.existsSync(scriptPath) || !fs.existsSync(globalAudioPath)) {
      console.warn(`[NanoBanana] Cannot sync timings: script.json or global_narration.mp3 missing in ${projectDir}`)
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
          ; (manifest as any).globalWordTimings = wordTimings.map((w) => ({
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
      script.totalDuration = mappedTimings[mappedTimings.length - 1].end
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
        `[NanoBanana] Updating transcription provider: ${this.currentTranscriptionConfig?.provider || 'none'
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
${uniqueCharacters.length > 1
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
    projectId?: string
  ): Promise<CompleteVideoPackage> {
    const validOptions = videoGenerationOptionsSchema.parse(options)
    this.currentOptions = validOptions

    console.log(`\n=== GENERATING SCRIPT: ${topic} ===`)
    const script = await this.generateStructuredScript(topic, validOptions)

    return this.generateVideoFromScript(script, options, baseImages, projectId)
  }

  /**
   * Generates a new stickman pose using AI and stores it in the library.
   * Auto-removes background to create a transparent PNG.
   */
  async generateAndStorePose(poseId: string, referenceImages: string[] = []): Promise<string | null> {
    const libraryDir = path.join(process.cwd(), 'src/assets/stickmen')
    if (!fs.existsSync(libraryDir)) fs.mkdirSync(libraryDir, { recursive: true })

    const targetPath = path.join(libraryDir, `${poseId}.png`)
    const tempPath = path.join(process.cwd(), 'tmp', `pose-gen-${Date.now()}.webp`)
    if (!fs.existsSync(path.dirname(tempPath))) fs.mkdirSync(path.dirname(tempPath), { recursive: true })

    try {
      console.log(`[NanoBanana] Generating dynamic pose: ${poseId}...`)

      const imageUrl = await this.imageService.generateImage(
        `SINGLE CHARACTER, MINIMALIST STICKMAN, ${poseId} POSE, FULL BODY, FRONT VIEW, SOLID WHITE BACKGROUND, CLEAN VECTOR LINES, NO SHADING, NO COLOR FILLS.`,
        tempPath,
        {
          aspectRatio: '1:1',
          referenceImages,
          systemInstruction:
            'You are an asset generator for a minimalist whiteboard animation library. Create a single clean black-outline stickman in the requested pose on a PURE solid white (#FFFFFF) background. Use only black lines, no fills, no gradients.'
        }
      )

      if (fs.existsSync(imageUrl)) {
        // Remove white background via raw pixel manipulation:
        // Any near-white pixel (R,G,B all > 200) becomes fully transparent.
        const img = sharp(imageUrl).ensureAlpha()
        const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
        const { width, height, channels } = info // channels = 4 (RGBA)

        for (let i = 0; i < data.length; i += channels) {
          if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
            data[i + 3] = 0 // fully transparent
          }
        }

        const transparentBuffer = await sharp(data, { raw: { width, height, channels: 4 } })
          .trim()
          .png()
          .toBuffer()

        fs.writeFileSync(targetPath, transparentBuffer)
        console.log(`[NanoBanana] ✓ Dynamic pose stored (transparent): ${targetPath}`)
        return targetPath
      }
    } catch (error) {
      console.error(`[NanoBanana] Error generating pose:`, error)
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    }
    return null
  }

  /**
   * PRO DUCE video from an existing script object.
   * This is the core "Post-AI" entry point.
   */
  async generateVideoFromScript(
    script: CompleteVideoScript,
    options: Partial<VideoGenerationOptions> = {},
    baseImages: string[] = [],
    projectId?: string
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
        lang: 'en',
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
    const usedCharacterVariants = new Set<string>()

    for (const scene of script.scenes) {
      if (scene.characterVariant) {
        usedCharacterVariants.add(scene.characterVariant)
      } else {
        usedCharacterVariants.add('standard')
      }
    }

    const characterReferenceImages: string[] = []
    if (usedCharacterVariants.size > 0) {
      console.log(`[NanoBanana] Loading character models for: ${Array.from(usedCharacterVariants).join(', ')}`)
      for (const variant of usedCharacterVariants) {
        const referenceImages = await characterModelManager.getReferenceImagesForCharacter(variant)
        characterReferenceImages.push(...referenceImages)
      }

      if (characterReferenceImages.length > 0) {
        console.log(`[NanoBanana] ✓ Character reference images loaded (${characterReferenceImages.length} model(s))`)
      } else {
        console.warn(`[NanoBanana] ⚠ No character reference images found. Using text-only description.`)
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHARACTER STUDIO (V2 Phase 2): Reference Images
    // ─────────────────────────────────────────────────────────────────────────
    const projectName = projectId || `video-${Date.now()}-${Math.random().toString(36).slice(7)}`
    const projectDir = path.join(__dirname, '..', '..', 'output', projectName)
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true })

    // Use model reference images directly — no character bible generation
    const allBaseImages = [...characterReferenceImages, ...baseImages]

    const scenesDir = path.join(projectDir, 'scenes')
    if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true })

    // --- POSE LIBRARY AUTO-EXPANSION ---
    // Pre-check all scenes for missing poses and generate them before we do anything else.
    // This ensures they are available for the Production Report and any subsequent steps.
    for (const scene of script.scenes) {
      const poseId = (scene as any).poseId || 'STAND'
      if (poseId === 'NONE') continue

      const posePath = path.join(process.cwd(), 'src/assets/stickmen', `${poseId}.png`)
      if (!fs.existsSync(posePath)) {
        console.warn(`[NanoBanana] ⚠ Pose '${poseId}' not found in library. Generating with AI...`)
        try {
          await this.generateAndStorePose(poseId, allBaseImages)
        } catch (error) {
          console.error(`[NanoBanana] ❌ Failed to expand pose library for '${poseId}':`, error)
        }
      }
    }

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
      style: 'colored',
      fontSize: 70,
      fontFamily: 'Montserrat',
      position: 'bottom',
      highlightColor: '#FFE135',
      borderSize: 2,
      shadowSize: 3
    }
    this.currentAssCaptionConfig = assCaptionConfig

    // Note: Whisper local will be auto-initialized in composeScene if word timings are empty
    // No need to pre-initialize here - it happens on-demand

    let lastSceneImageBase64: string | undefined

    // --- GLOBAL AUDIO GENERATION ---
    const skipAudio = validOptions.skipAudio || false
    const globalAudioPath = path.join(projectDir, 'global_narration.mp3')
    let globalWordTimings: WordTiming[] = []

    if (!skipAudio) {
      console.log(`\n[NanoBanana] --- Generating Global Audio ---`)
      const fullScriptText = script.scenes.map((s) => s.narration).join('\n\n...\n\n') // Add strong pause between scenes

      try {
        const audioResult = await this.audioService.generateSpeech(fullScriptText, globalAudioPath)

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

        console.log(`[NanoBanana] Transcribing global audio with Whisper...`)
        const transcriptionResult = await this.transcriptionService.transcribe(globalAudioPath)
        globalWordTimings = transcriptionResult.wordTimings

        // Map timings back to scenes
        console.log(`[NanoBanana] Mapping global timings to scenes...`)
        const sceneNarrations = script.scenes.map((s) => ({ sceneId: s.id, narration: s.narration }))
        const mappedTimings = TimingMapper.mapScenes(sceneNarrations, globalWordTimings)

        // Update scene timeRanges and store timings
        mappedTimings.forEach((timing, idx) => {
          const scene = script.scenes[idx]
          scene.timeRange.start = timing.start
          scene.timeRange.end = timing.end
            ; (scene as any).globalWordTimings = timing.wordTimings
          console.log(`[NanoBanana] Scene ${scene.id}: ${timing.start.toFixed(2)}s -> ${timing.end.toFixed(2)}s`)
        })

        // Update total duration
        if (mappedTimings.length > 0) {
          script.totalDuration = mappedTimings[mappedTimings.length - 1].end
        }

        script.globalAudio = 'global_narration.mp3'
      } catch (audioError) {
        console.error(`[NanoBanana] Global audio generation/transcription failed:`, audioError)
        // Fallback: we might want to continue with per-scene audio if this fails,
        // but the user specifically asked for this new flow.
      }
    }
    // --------------------------------

    for (const scene of script.scenes) {
      const sceneDir = path.join(scenesDir, scene.id)
      if (!fs.existsSync(sceneDir)) {
        fs.mkdirSync(sceneDir, { recursive: true })
      }

      // All visuals are now local (100% local rule)
      const visualSource = 'local'
      const poseId = (scene as any).poseId || 'STAND'
      const posePath = path.join(process.cwd(), 'src/assets/stickmen', `${poseId}.png`)

      // Validate that pose exists for non-NONE scenes
      if (poseId !== 'NONE' && !fs.existsSync(posePath)) {
        console.warn(
          `[NanoBanana] ⚠ Pose '${poseId}' missing for scene ${scene.id}. Ensure it exists in assets/stickmen/`
        )
      }

      // Only AI generation is skipped - all visuals are local composition
      await this.composeScene(scene, allBaseImages, sceneDir, lastSceneImageBase64, undefined)

      // Keep track of the last generated image to allow for "Scene Continuation"
      const lastImagePath = path.join(sceneDir, 'scene.webp')
      if (fs.existsSync(lastImagePath)) {
        lastSceneImageBase64 = fs.readFileSync(lastImagePath).toString('base64')
      }
    }

    // Assemble Final Video
    if (!validOptions.scriptOnly && !validOptions.generateOnlyScenes) {
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
          }
        )
        console.log(`\n✅ VIDEO ASSEMBLY COMPLETE: ${finalVideoPath}`)
      } catch (assemblyError) {
        console.error(`\n❌ VIDEO ASSEMBLY FAILED:`, assemblyError)
      }
    }

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

  /**
   * Helper to make transparent stickmen opaque by adding a white background
   * that follows the outer silhouette (handles hollow/outline assets).
   */
  private async solidifyPose(posePath: string, targetHeight: number): Promise<Buffer> {
    const original = sharp(posePath)

    // Resize first to work with target dimensions
    const resized = original.resize({ height: targetHeight, fit: 'inside' })
    const resizedBuffer = await resized.toBuffer()
    const resizedMetadata = await sharp(resizedBuffer).metadata()
    const w = resizedMetadata.width || 100
    const h = resizedMetadata.height || targetHeight

    // Create a "filled" mask by blurring and thresholding the alpha channel
    // This fills small interior gaps (like body/limbs) while keeping the silhouette
    const alphaMask = await sharp(resizedBuffer)
      .ensureAlpha()
      .extractChannel('alpha')
      .blur(3) // Subtle blur to close small gaps in outlines
      .threshold(1)
      .toBuffer()

    // Composite: White Background -> Masked with Alpha -> Original Outlines on top
    return await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([
        { input: alphaMask, blend: 'dest-in' },
        { input: resizedBuffer, blend: 'over' }
      ])
      .png()
      .toBuffer()
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
    enableContextualBackground: boolean = true
  ): Promise<CompleteVideoPackage> {
    return this.generateVideoFromTopic(
      topic,
      {
        userId,
        qualityMode,
        enableContextualBackground,
        branding: {
          watermarkText: 'PRO MASTER 2026',
          position: 'top-right' as any,
          opacity: 1,
          scale: 1
        },
        minDuration: 100,
        maxDuration: 120,
        style: 'educational',
        animationMode: 'none',
        aspectRatio: '16:9',
        scriptOnly: false,
        imageProvider: 'gemini',
        llmProvider: 'gemini',
        kokoroVoicePreset: KokoroVoicePreset.BF_ISABELLA,
        backgroundMusic: 'upbeat',
        assCaptions: {
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
}

function readImageToBase64(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath)
  return fileBuffer.toString('base64')
}
