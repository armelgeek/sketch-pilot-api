import crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GoogleGenAI } from '@google/genai'
import axios from 'axios'
import sharp from 'sharp'

import { AnimationServiceFactory, type AnimationService, type AnimationServiceConfig } from '../services/animation'
import { AudioServiceFactory, type AudioService, type AudioServiceConfig } from '../services/audio'
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
  type VideoGenerationOptions
} from '../types/video-script.types'
import { runFfmpeg } from '../utils/ffmpeg-utils'
import { TaskQueue } from '../utils/task-queue'
import { SeriesVideoGenerator } from './generators/series-video-generator'
import { VideoGeneratorFactory } from './generators/video-generator.factory'
import { PolyptychEngine } from './polyptych-engine'
import { VideoScriptGenerator } from './video-script-generator'
import type { VideoGenerator, VideoGeneratorConfig } from './generators/video-generator.abstract'
import type { SceneMemory } from './scene-memory'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class NanoBananaEngine {
  private readonly systemPrompt: string
  private readonly client: GoogleGenAI
  private scriptGenerator: VideoScriptGenerator
  readonly promptManager: VideoGenerator
  private readonly generationQueue: TaskQueue
  private _audioService?: AudioService
  private _animationService?: AnimationService
  private _imageService?: ImageService
  private _llmService?: LLMService
  private readonly outputDir: string
  private readonly projectLocationCache: Map<string, string> = new Map()
  private readonly characterDNA: Map<string, string> = new Map()
  private currentOptions: VideoGenerationOptions = videoGenerationOptionsSchema.parse({
    aspectRatio: '16:9',
    qualityMode: QualityMode.STANDARD,
    sceneCount: 3,
    minDuration: 30,
    maxDuration: 60
  })
  private currentImageProvider: ImageProvider = 'gemini'
  private currentLLMProvider: LLMProvider = 'gemini'
  private currentAssCaptionConfig?: AssCaptionConfig
  private currentKokoroVoicePreset: KokoroVoicePreset | string = KokoroVoicePreset.AF_HEART
  private readonly sceneCache: SceneCacheService
  private readonly apiKey: string
  private readonly audioConfig?: AudioServiceConfig
  private readonly animationConfig?: AnimationServiceConfig
  private readonly llmConfig?: LLMServiceConfig
  private readonly imageConfig?: ImageServiceConfig

  constructor(
    apiKey: string,
    systemPrompt?: string,
    audioConfig?: AudioServiceConfig,
    animationConfig?: AnimationServiceConfig,
    imageConfig?: ImageServiceConfig,
    llmConfig?: LLMServiceConfig,
    _deprecated_transcriptionConfig?: any,
    promptSpecs?: VideoGeneratorConfig
  ) {
    this.apiKey = apiKey
    this.audioConfig = audioConfig
    this.animationConfig = animationConfig
    this.llmConfig = llmConfig
    this.imageConfig = imageConfig
    this.client = new GoogleGenAI({ apiKey })
    this.promptManager = VideoGeneratorFactory.create({
      ...promptSpecs,
      systemPrompt: systemPrompt ?? ''
    })
    this.systemPrompt = systemPrompt ?? ''
    this.currentImageProvider = imageConfig?.provider || 'gemini'
    this.currentLLMProvider = llmConfig?.provider || 'gemini'
    this.sceneCache = new SceneCacheService()
    this.scriptGenerator = null as any
    this.generationQueue = new TaskQueue({
      maxConcurrency: 10,
      maxRetries: 6,
      initialDelayMs: 2000,
      providerConfigs: {
        image: { maxConcurrent: 2, failureThreshold: 3 },
        llm: { maxConcurrent: 3, failureThreshold: 5 },
        animation: { maxConcurrent: 1, failureThreshold: 2 },
        [this.currentImageProvider]: { maxConcurrent: 2 },
        [this.currentLLMProvider || 'gemini']: { maxConcurrent: 3 }
      }
    })
    this.outputDir = path.join(process.cwd(), 'uploads', 'output')
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true })
  }

  async getAudioService(): Promise<AudioService> {
    if (!this._audioService) {
      this._audioService = await AudioServiceFactory.create(
        this.audioConfig || { provider: 'kokoro', lang: 'en', apiKey: process.env.HUGGING_FACE_TOKEN || this.apiKey }
      )
    }
    return this._audioService
  }

  async getAnimationService(): Promise<AnimationService> {
    if (!this._animationService)
      this._animationService = await AnimationServiceFactory.create(
        this.animationConfig || { provider: 'veo', apiKey: this.apiKey }
      )
    return this._animationService
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

  async getLlmService(): Promise<LLMService> {
    if (!this._llmService) {
      this._llmService = await LLMServiceFactory.create(
        this.llmConfig || { provider: this.currentLLMProvider, apiKey: this.apiKey, cacheSystemPrompt: true }
      )
    }
    return this._llmService
  }

  private async downloadAndEncodeImages(
    images: (string | { name?: string; data: string })[]
  ): Promise<{ name?: string; data: string }[]> {
    const encodedImages: { name?: string; data: string }[] = []
    for (const img of images) {
      try {
        if (typeof img === 'object') {
          if (img.data.startsWith('http')) {
            const response = await axios.get(img.data, { responseType: 'arraybuffer' })
            encodedImages.push({ name: img.name, data: Buffer.from(response.data, 'binary').toString('base64') })
          } else encodedImages.push(img)
          continue
        }
        const url = img as string
        if (url.startsWith('http')) {
          const response = await axios.get(url, { responseType: 'arraybuffer' })
          encodedImages.push({ data: Buffer.from(response.data, 'binary').toString('base64') })
        } else if (url.length < 1000 && (url.includes('/') || url.includes('\\')) && fs.existsSync(url)) {
          encodedImages.push({ data: fs.readFileSync(url).toString('base64') })
        } else encodedImages.push({ data: url })
      } catch (error) {
        console.error(`[NanoBanana] Image encode fail:`, error)
      }
    }
    return encodedImages
  }

  public async generateImage(
    scene: EnrichedScene,
    refs?: { name: string; data: string }[],
    tempPath?: string,
    isReprompt: boolean = false,
    onStatus?: (status: string, message?: string) => void,
    visualDNA?: string,
    seed?: number,
    evolutionHints?: string
  ): Promise<string> {
    const filename = tempPath || path.join(this.outputDir, scene.id, `prompt_${scene.id}.webp`)
    const bypassCache = isReprompt

    // 1. Resolve effective reference images
    const baseImages = await this.promptManager.resolveCharacterImages()

    // --- Hardened Character Extraction (v12.0) ---
    // Check multiple potential fields for active characters
    const charactersFromSchema = scene.charactersInScene || []
    const charactersFromAlias = (scene as any).characters || []
    const charactersFromProjections = (scene as any).projections?.characters || []

    // Extract mentions from narration as a robust fallback
    const narrationMentions = scene.narration?.match(/@\w+/g) || []

    const rawActiveCharacters = [...new Set([...charactersFromSchema])]
    console.log('characters', scene)

    console.log('charactersFromSchema', charactersFromSchema)
    console.log('charactersFromAlias', charactersFromAlias)
    console.log('charactersFromProjections', charactersFromProjections)
    console.log('narrationMentions', narrationMentions)
    // Normalize IDs to match registry handles (@slug)
    const activeCharacters = rawActiveCharacters.map((id) =>
      id.startsWith('@')
        ? id.toLowerCase()
        : `@${id
            .toLowerCase()
            .trim()
            .replaceAll(/[\s\-_]+/g, '')}`
    )

    console.info('[GENERATE IMAGE REFERENCE CHARACTERS]', rawActiveCharacters)
    console.log('[BASE IMAGE TO FILTER]', JSON.stringify(baseImages))
    // Filter registry images: only keep those whose name matches an active character
    // or if they are "LOCATION" anchors, or if they are the special "BASE_ANCHOR"
    const filteredBaseImages = baseImages.filter((img) => {
      if (typeof img === 'object' && img.name) {
        // Character images from registry are named '@id'
        if (activeCharacters.includes(img.name.toLowerCase())) return true
        // Keep if it's a location anchor or base anchor (handled separately usually but good to be safe)
        if (img.name.startsWith('LOCATION') || img.name.startsWith('base-')) return true
        // If it has no specific name mapping but is in the list, we might want to keep it
        // but for characters we must be strict.
        return false
      }
      return true // Keep generic images (unlikely to be character models if no name)
    })
    console.log('[FILTERED BASE IMAGES]', filteredBaseImages)

    const characterImages = refs || []
    const allBaseImages = await this.downloadAndEncodeImages([...filteredBaseImages, ...characterImages])

    //console.log('[FILTERED BASE IMAGES]', allBaseImages)
    // 2. Inject Bridge into references if it exists
    const sequelBridgeUrl = (this.promptManager as any).seriesContext?.lastEpisodeFinalImage
    if (sequelBridgeUrl) {
      console.info(`[NanoBanana] 🎬 PROJECT SEQUEL: Bridging with last episode final frame...`)
      const encodedBridge = await this.downloadAndEncodeImages([
        {
          name: 'Sequel Bridge',
          data: sequelBridgeUrl
        }
      ])
      allBaseImages.push(...encodedBridge)
    }

    const hasReferenceImages = allBaseImages.length > 0

    // [V47] Master Style Injection: Always use the series thumbnail as the aesthetic truth
    const masterStyleUrl = (this.promptManager as any).seriesContext?.thumbnailUrl
    if (masterStyleUrl && hasReferenceImages) {
      console.info(`[NanoBanana] 🎨 MASTER STYLE: Injecting global series aesthetic...`)
      const encodedMaster = await this.downloadAndEncodeImages([
        {
          name: 'Master Style',
          data: masterStyleUrl
        }
      ])
      allBaseImages.unshift(...encodedMaster) // Put at the beginning for primary attention
    }

    // 2. Extract & Strip Internal Tags (@VisualState, @LocationState)
    let internalContext = ''
    const visualStateRegex = /@VisualState:\s*\[([^\]]+)\]/i

    // Use Projections Layer if available (v9.0)
    const basePrompt = (scene as any).projections?.visualDescription || scene.imagePrompt || ''
    const match = visualStateRegex.exec(basePrompt)
    if (match) {
      internalContext = `SCENE COMPOSITION / VISUAL STATE: ${match[1]}`
      console.info(`[NanoBanana] 👁️  Internal Visual State: ${match[1]}`)
    }

    const cleanPrompt = basePrompt.replaceAll(/@VisualState:\s*\[[^\]]+\]/gi, '').trim()
    const tempScene = { ...scene, imagePrompt: cleanPrompt }

    const { prompt: fullPrompt, reuseReferenceImage } = await this.promptManager.buildImagePrompt(
      tempScene,
      hasReferenceImages,
      this.currentOptions?.aspectRatio || '16:9',
      undefined
    )

    const visualStyleLock = (this.promptManager as any).seriesContext?.visualStyleLock

    let systemInstruction = await this.promptManager.buildImageSystemInstruction(
      hasReferenceImages || !!sequelBridgeUrl
    )

    // [V48] Style Enforcement Logic: If a StyleLock is present, enforce it at the model level
    if (visualStyleLock) {
      console.info(`[NanoBanana] 🛡️ STYLE LOCK: Enforcing ${visualStyleLock.visualStyle}...`)
      const mandatory = visualStyleLock.mandatoryTerms?.length
        ? `- MANDATORY (Must include): ${visualStyleLock.mandatoryTerms.join(', ')}`
        : ''
      const forbidden = visualStyleLock.forbiddenTerms?.length
        ? `- FORBIDDEN (Do NOT use): ${visualStyleLock.forbiddenTerms.join(', ')}`
        : ''

      const styleEnforcement = `
### 🛡️ STRICT STYLE ENFORCEMENT (OBLIGATOIRE) 🛡️
You MUST adhere strictly to the following artistic DNA. Ignore any default "realistic", "cinematic" or "photographic" tendencies unless explicitly requested by the style.
- STYLE : ${visualStyleLock.visualStyle}
${mandatory}
${forbidden}
- NOTE : If the prompt says "cinématographique", interpret it based on the MEDIUM (${visualStyleLock.visualStyle}), NOT as a request for realism.
`.trim()

      systemInstruction = `${styleEnforcement}\n\n${systemInstruction}`
    }

    // 3. Inject Visual DNA & Internal Context
    if (visualDNA || internalContext || masterStyleUrl) {
      const isPortrait = scene.id === 'char-gen' || scene.locationId === 'studio'
      const dnaHeader = isPortrait
        ? 'SERIES ARTISTIC AESTHETIC DNA (STYLE LOCK):'
        : 'ENVIRONMENT SOURCE OF TRUTH (STRICT PERSISTENCE):'

      if (visualDNA) systemInstruction = `${dnaHeader}\n${visualDNA}\n\n${systemInstruction}`
      if (internalContext) systemInstruction = `${internalContext}\n\n${systemInstruction}`

      if (masterStyleUrl && !isPortrait) {
        systemInstruction = `MASTER STYLE PRIORITY: Use the "Master Style" reference image for general artistic rendering (colors, lighting, vibe). ⚠️ IMPORTANT: If the TEXT PROMPT or VISUAL DNA specifies a different medium (e.g. Whiteboard, Sketch, Stick Figure), PRIORITIZE the medium of the prompt over the Master Style. Also, if a character is visible in the "Master Style" but NOT mentioned in the text prompt, DO NOT include them.\n\n${systemInstruction}`
      }

      if (isPortrait) {
        systemInstruction = `CHARACTER IDENTITY PRIORITY: Maintain the exact features of the character provided in reference images. The DNA below should ONLY be used for artistic style (lighting, linework, color palette, rendering style).\n\n${systemInstruction}`
      }
    }

    if (evolutionHints) {
      systemInstruction = `${evolutionHints}\n\n${systemInstruction}`
    }

    if (!bypassCache) {
      const cached = this.sceneCache.get(fullPrompt, {
        sceneId: scene.id,
        imageStyle: this.currentOptions?.imageStyle,
        aspectRatio: this.currentOptions?.aspectRatio
      })
      if (cached && fs.existsSync(cached)) {
        if (cached !== filename) fs.copyFileSync(cached, filename)
        return filename
      }
    }

    const maxRetries = 5
    let lastError: any
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const imageService = await this.getImageService()
        const imageUrl = await imageService.generateImage(fullPrompt, filename, {
          aspectRatio: this.currentOptions?.aspectRatio || '16:9',
          referenceImages: allBaseImages,
          onStatus,
          systemInstruction, // Inject style DNA here
          seed,
          quality: (this.currentOptions?.qualityMode as any) || 'medium',
          format: 'webp'
        })
        return imageUrl
      } catch (error: any) {
        lastError = error
        if (this.isNetworkError(error) && attempt < maxRetries) continue
        break
      }
    }

    if (this.currentImageProvider !== 'gemini' && this.isNetworkError(lastError)) {
      console.info(`[NanoBanana] 🔄 Multi-provider fallback: Attempting Gemini after network error...`)
      try {
        const gemini = await ImageServiceFactory.create({ provider: 'gemini', apiKey: this.apiKey } as any)
        return await gemini.generateImage(fullPrompt, filename, {
          aspectRatio: this.currentOptions?.aspectRatio || '16:9',
          referenceImages: allBaseImages,
          systemInstruction
        })
      } catch (geminiError: any) {
        console.error(`[NanoBanana] ❌ Critical failure: Gemini fallback also failed: ${geminiError.message}`)
        throw geminiError
      }
    }
    throw lastError
  }

  async generateAIThumbnail(
    title: string,
    inspirationUrl?: string,
    outputDir?: string,
    count: number = 1
  ): Promise<string[]> {
    const prompt = await this.promptManager.buildThumbnailPrompt(title, inspirationUrl)
    const results: string[] = []
    const baseDir = outputDir || path.join(this.outputDir, `thumb-${Date.now()}`)
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true })
    const referenceImages = inspirationUrl ? [{ data: inspirationUrl }] : []
    const characterImages = await this.promptManager.resolveCharacterImages()
    const thumbnailInspirations = await this.promptManager.resolveThumbnailInspirations()
    const encodedRefs = await this.downloadAndEncodeImages([
      ...referenceImages,
      ...characterImages,
      ...thumbnailInspirations
    ])
    const systemInstruction = await this.promptManager.buildImageSystemInstruction(encodedRefs.length > 0)
    for (let i = 0; i < count; i++) {
      const filename = path.join(baseDir, `thumb_${i}.webp`)
      const imageService = await this.getImageService()
      const url = await imageService.generateImage(prompt, filename, {
        aspectRatio: '16:9',
        referenceImages: encodedRefs,
        systemInstruction
      })
      results.push(url)
    }
    return results
  }

  private async generateThumbnail(imagePath: string, thumbnailPath: string): Promise<void> {
    if (!fs.existsSync(imagePath)) return
    try {
      await sharp(imagePath)
        .resize(320, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath)
    } catch (error) {
      console.warn(`[NanoBanana] Thumb fail:`, error)
    }
  }

  private isNetworkError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    return msg.includes('timeout') || msg.includes('econn') || msg.includes('enet') || msg.includes('connect')
  }

  private async composeScene(
    scene: EnrichedScene,
    referenceImages: (string | { name?: string; data: string })[],
    outputDir: string,
    lastSceneB64?: string,
    lastScenePath?: string,
    isReprompt: boolean = false,
    script?: CompleteVideoScript,
    memory?: SceneMemory,
    onProgress?: (p: number, m: string, meta?: any) => void
  ): Promise<void> {
    const options = this.currentOptions
    const resolutionPreset = options.resolution || '720p'
    let baseHeight = 720
    if (resolutionPreset === '1080p') baseHeight = 1080
    if (resolutionPreset === '4k') baseHeight = 2160

    const makeEven = (val: number) => {
      const rounded = Math.round(val)
      return rounded % 2 === 0 ? rounded : rounded + 1
    }

    const aspectRatio = options.aspectRatio || '16:9'
    console.log(`[Resolution]: ${aspectRatio}`)
    let [width, height] = [1280, 720]

    if (aspectRatio === '9:16') {
      ;[width, height] = [makeEven(baseHeight), makeEven(baseHeight * (16 / 9))]
    } else if (aspectRatio === '1:1') {
      ;[width, height] = [makeEven(baseHeight), makeEven(baseHeight)]
    } else {
      ;[width, height] = [makeEven(baseHeight * (16 / 9)), makeEven(baseHeight)]
    }
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    const imagePath = path.join(outputDir, 'scene.webp')
    const tempBg = path.join(outputDir, 'temp_bg.webp')

    const effectiveRefs = [...referenceImages]

    // --- VISUAL COHERENCE SYSTEM (Registry-based) ---
    const locationId =
      scene.locationId && scene.locationId !== 'default'
        ? SeriesVideoGenerator.normalizeId(scene.locationId)
        : 'default'
    console.log('[LOCATION ID]', locationId)

    // --- VISUAL DNA & STYLE CONTINUITY ---
    const context = (this.promptManager as any).seriesContext
    const dnaParts: string[] = []

    if (context) {
      if (context.visualStyle) dnaParts.push(`STYLE: ${context.visualStyle}`)
      if (context.colorPalette) dnaParts.push(`PALETTE: ${context.colorPalette}`)
      if (context.symbolicMotifs?.length > 0) dnaParts.push(`MOTIFS: ${context.symbolicMotifs.join(', ')}`)
      if (context.cameraStyle) dnaParts.push(`CAMERA: ${context.cameraStyle}`)
    }

    if (scene.persistentDecorTokens?.length > 0) {
      dnaParts.push(`DECOR: ${scene.persistentDecorTokens.join(', ')}`)
    }

    const dnaInstruction = dnaParts.length > 0 ? dnaParts.join(' | ') : undefined
    if (dnaInstruction) {
      console.info(`[NanoBanana] 🧬 DNA: ${dnaInstruction}`)
    }

    // [V4] Legacy Continuity Support (Previous Frame Chaining)
    if (scene.continueFromPrevious && lastSceneB64) {
      console.info(`[NanoBanana] 🔗 CONTINUITY: Adding previous scene as reference anchor.`)
      effectiveRefs.push({ name: 'PREVIOUS_SCENE_FRAME', data: lastSceneB64 })
    }

    // --- OPTIMIZATION: Physical Reuse or Polyptych existing asset ---
    if (fs.existsSync(imagePath) && !isReprompt) {
      console.log(`[NanoBanana] 💎 Using existing image asset for scene ${scene.id}`)
      scene.imageUrl = imagePath
    } else {
      const MAX_IMAGE_RETRIES = 3
      let lastImageError: any

      // REPROMPT CONTINUITY: If we are reprompting, use the existing image as a strong reference
      // to maintain props, layout, and character posture while applying NEW text instructions.
      if (isReprompt && fs.existsSync(imagePath)) {
        const currentImageB64 = fs.readFileSync(imagePath).toString('base64')
        effectiveRefs.push({ name: 'ORIGINAL_SCENE', data: currentImageB64 })
      }

      const shouldGenerateVariants = options.enableVariants
      const variantCount = shouldGenerateVariants ? 3 : 1
      const variantsDir = path.join(outputDir, 'variants')

      if (shouldGenerateVariants) {
        console.info(`[NanoBanana] 🎭 VARIANT GENERATION: Re-anchor step detected for scene ${scene.id}.`)
        if (!fs.existsSync(variantsDir)) fs.mkdirSync(variantsDir, { recursive: true })
      }

      const baseSeed = options.initialSeed ?? Math.floor(Math.random() * 1000000)
      const sceneSeed = baseSeed + scene.sceneNumber

      for (let v = 0; v < variantCount; v++) {
        const variantSuffix = shouldGenerateVariants ? `_v${v + 1}` : ''
        const currentTarget = shouldGenerateVariants ? path.join(variantsDir, `variant-${v + 1}.webp`) : imagePath
        const currentSeed = shouldGenerateVariants ? sceneSeed + v * 1337 : sceneSeed

        for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {
          try {
            await this.generateImage(
              scene,
              effectiveRefs as { name: string; data: string }[],
              tempBg,
              isReprompt,
              (s, m) => {
                const statusMsg = shouldGenerateVariants ? `${s} (Variant ${v + 1})` : s
                if (onProgress) onProgress(-1, statusMsg, { message: m })
              },
              dnaInstruction,
              currentSeed,
              undefined
            )
            await sharp(tempBg).resize(width, height, { fit: 'cover' }).webp().toFile(currentTarget)

            // Auto-promote the first variant as the main scene image for default preview
            if (shouldGenerateVariants && v === 0) {
              fs.copyFileSync(currentTarget, imagePath)
            }

            lastImageError = null
            break
          } catch (error: any) {
            lastImageError = error
            if (attempt < MAX_IMAGE_RETRIES) {
              const statusMsg = this.isNetworkError(error) ? 'step.network_retry' : 'step.composition_retry'
              if (onProgress) onProgress(-1, statusMsg, { attempt, max: MAX_IMAGE_RETRIES, error: error.message })
              console.warn(
                `[NanoBanana] Image ${variantSuffix} attempt ${attempt}/${MAX_IMAGE_RETRIES} failed: ${error.message}. Retrying...`
              )
              await new Promise((r) => setTimeout(r, attempt * 3000))
            } else {
              console.error(
                `[NanoBanana] Image generation failed after ${MAX_IMAGE_RETRIES} attempts: ${error.message}`
              )
            }
          } finally {
            if (fs.existsSync(tempBg)) fs.unlinkSync(tempBg)
          }
        }
        if (lastImageError) break // Abort variants if one fails critically
      }

      // Only write blank placeholder if all retries exhausted
      if (lastImageError && !fs.existsSync(imagePath)) {
        await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
          .webp()
          .toFile(imagePath)
      }
    }

    // [V47] Master Style Promotion: If this is the FIRST scene and no thumbnail exists,
    // promote it as the absolute aesthetic truth for the entire series/episode.
    if (context && !context.thumbnailUrl && fs.existsSync(imagePath)) {
      const b64 = fs.readFileSync(imagePath).toString('base64')
      console.info(`[NanoBanana] 🎨 MASTER STYLE PROMOTION: Setting global series DNA from first scene result.`)
      context.thumbnailUrl = b64
    }

    await this.generateThumbnail(imagePath, path.join(outputDir, 'thumbnail.jpg'))
    const wordTimings = (scene as any).globalWordTimings
    const totalDuration =
      (scene as any).timeRange?.start !== undefined && (scene as any).timeRange?.end !== undefined
        ? (scene as any).timeRange.end - (scene as any).timeRange.start
        : 5

    let hasVideo = false
    const videoPath = path.join(outputDir, 'animation.mp4')

    if (options.animationMode === 'ai' && scene.animationPrompt) {
      await this.generationQueue.add(async () => {
        try {
          const anim = await this.getAnimationService()
          await anim.animateImage(
            imagePath,
            scene.animationPrompt!,
            options.animationClipDuration || 6,
            videoPath,
            aspectRatio
          )
          hasVideo = fs.existsSync(videoPath)
        } catch (error) {
          console.warn(`[NanoBanana] Animation fail:`, error)
        }
      })
    }

    const manifest: any = {
      id: scene.id,
      sceneImage: 'scene.webp',
      audio: scene.narration ? 'narration.mp3' : undefined,
      video: hasVideo ? 'animation.mp4' : undefined,
      videoMeta: hasVideo ? { clipDuration: 6, totalDuration, loop: true } : undefined,
      animationMode: options.animationMode,
      cameraAction: (scene as any).cameraAction,
      transition: (scene as any).transition,
      pauseBefore: (scene as any).pauseBefore,
      pauseAfter: (scene as any).pauseAfter,
      aspectRatio
    }

    if (wordTimings?.length > 0 && (scene as any).timeRange?.start !== undefined) {
      const start = (scene as any).timeRange.start
      manifest.wordTimings = wordTimings.map((w: any) => ({
        ...w,
        start: Math.round(Math.max(0, w.start - start) * 100) / 100,
        end: Math.round(Math.max(0, w.end - start) * 100) / 100,
        startMs: Math.round(Math.max(0, w.start - start) * 1000)
      }))
      manifest.globalWordTimings = wordTimings.map((w: any) => ({
        ...w,
        start: Math.round(w.start * 100) / 100,
        end: Math.round(w.end * 100) / 100
      }))
    }
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    scene.imageUrl = imagePath
    scene.thumbnailUrl = path.join(outputDir, 'thumbnail.jpg')
    if (hasVideo) (scene as any).videoUrl = videoPath
  }

  async syncTimings(projectDir: string, onProgress?: (p: number, m: string) => Promise<void>): Promise<void> {
    const scriptPath = path.join(projectDir, 'script.json')
    if (!fs.existsSync(scriptPath)) return
    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8')) as CompleteVideoScript
    let currentTime = 0
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]
      const audioPath = path.join(projectDir, 'scenes', scene.id, 'narration.mp3')
      const d = fs.existsSync(audioPath)
        ? await this.getRealDuration(audioPath)
        : (scene as any).timeRange?.end !== undefined && (scene as any).timeRange?.start !== undefined
          ? (scene as any).timeRange.end - (scene as any).timeRange.start
          : 5
      ;(scene as any).timeRange = { start: currentTime, end: currentTime + d }
      currentTime += d
      if (onProgress) await onProgress(Math.round(((i + 1) / script.scenes.length) * 100), `Syncing sc ${i + 1}`)
    }
    script.totalDuration = currentTime
    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2))
  }

  async generateStructuredScript(
    topic: string,
    options: Partial<VideoGenerationOptions> = {},
    onProgress?: (p: number, m: string) => Promise<void>
  ): Promise<CompleteVideoScript> {
    const valid = videoGenerationOptionsSchema.parse(options)
    if (valid.llmProvider && valid.llmProvider !== this.currentLLMProvider) {
      this.currentLLMProvider = valid.llmProvider
      this._llmService = await LLMServiceFactory.create({
        provider: this.currentLLMProvider,
        apiKey: this.apiKey,
        cacheSystemPrompt: true
      })
      this.scriptGenerator = new VideoScriptGenerator(await this.getLlmService(), this.promptManager)
    } else if (!this.scriptGenerator)
      this.scriptGenerator = new VideoScriptGenerator(await this.getLlmService(), this.promptManager)

    try {
      return await this.generationQueue.add(
        () =>
          this.scriptGenerator.generateCompleteScript(topic, valid, async (p, m) => {
            // Keep original behavior if caller didn't scale,
            // but generateVideoFromTopic now handles the 0-15 scaling.
            if (onProgress) await onProgress(p, m)
          }),
        `Script: ${topic}`,
        'llm'
      )
    } catch (error) {
      if (this.isNetworkError(error) && this.currentLLMProvider === 'grok') {
        this.currentLLMProvider = 'haiku'
        this._llmService = await LLMServiceFactory.create({
          provider: 'haiku',
          apiKey: this.apiKey,
          cacheSystemPrompt: true
        })
        this.scriptGenerator = new VideoScriptGenerator(await this.getLlmService(), this.promptManager)
        return await this.scriptGenerator.generateCompleteScript(topic, { ...valid, llmProvider: 'haiku' }, onProgress)
      }
      throw error
    }
  }

  async exportVideoPackage(script: CompleteVideoScript, outputPath: string): Promise<void> {
    if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true })
    if (!this.scriptGenerator)
      this.scriptGenerator = new VideoScriptGenerator(await this.getLlmService(), this.promptManager)
    fs.writeFileSync(path.join(outputPath, 'script.json'), JSON.stringify(script, null, 2))
    fs.writeFileSync(path.join(outputPath, 'script.md'), this.scriptGenerator.exportToMarkdown(script))
  }

  /**
   * Helper to periodically increment progress while waiting for an async task.
   */
  private async withPulse(
    start: number,
    end: number,
    message: string,
    onProgress: ((p: number, m: string) => Promise<void>) | undefined,
    task: () => Promise<any>
  ): Promise<any> {
    if (!onProgress) return task()

    let current = start
    const interval = setInterval(() => {
      if (current < end - 1) {
        current += 1
        onProgress(current, message).catch(() => {})
      }
    }, 800)

    try {
      const result = await task()
      return result
    } finally {
      clearInterval(interval)
      await onProgress(end, message)
    }
  }

  async generateVideoFromTopic(
    topic: string,
    options: Partial<VideoGenerationOptions> = {},
    baseImages: string[] = [],
    projectId?: string,
    onProgress?: (p: number, m: string) => Promise<void>,
    onTimingSync?: (s: any) => Promise<void>,
    onSceneGenerated?: (s: any, sc: any, i: number, pr: number) => Promise<void>
  ): Promise<CompleteVideoPackage> {
    const valid = videoGenerationOptionsSchema.parse(options)
    if (onProgress) await onProgress(0, 'step.step_1_script')
    const script = await this.withPulse(0, 100, 'step.step_1_script', onProgress, () =>
      this.generateStructuredScript(topic, valid, async (p, m) => {
        if (onProgress) await onProgress(p, m)
      })
    )
    if (valid.scriptOnly)
      return {
        script,
        projectId: projectId || 'script-only',
        outputPath: '',
        generatedAt: new Date().toISOString(),
        metadata: { apiCalls: script.sceneCount }
      }
    if (onProgress) await onProgress(100, 'step.step_1_script')
    return this.generateVideoFromScript(
      script,
      { ...options, _isTopicCall: true } as any,
      baseImages,
      projectId,
      onProgress,
      onTimingSync,
      onSceneGenerated
    )
  }

  async generateVideoFromScript(
    script: CompleteVideoScript,
    options: Partial<VideoGenerationOptions> = {},
    baseImages: string[] = [],
    projectId?: string,
    onProgress?: (p: number, m: string) => Promise<void>,
    onTimingSync?: (s: any) => Promise<void>,
    onSceneGenerated?: (s: any, sc: any, i: number, pr: number) => Promise<void>
  ): Promise<CompleteVideoPackage> {
    const startTime = Date.now()
    const valid = videoGenerationOptionsSchema.parse(options)

    // ─── RESYNC OPTIONS IF NEEDED (Aspect Ratio Sync) ────────────────────────
    if (script.aspectRatio && script.aspectRatio !== valid.aspectRatio) {
      console.log(`[NanoBanana] 📐 Syncing engine aspect ratio to script: ${script.aspectRatio}`)
      valid.aspectRatio = script.aspectRatio as any
    }

    // --- Persist Location Cache cross-appels ---
    const persistLocationCache = !!(options as any)?.persistLocationCache
    if (!persistLocationCache) {
      this.projectLocationCache.clear()
    }

    this.currentOptions = valid

    // Pre-load location cache from persistent registries
    const spec = (valid.customSpec as any) || {}
    const registry =
      spec.seriesMetadata?.locationRegistry ||
      spec.localLocationRegistry ||
      (this.promptManager as any).seriesContext?.locationRegistry ||
      {}
    for (const [id, data] of Object.entries(registry)) {
      if ((data as any).thumbnailUrl) {
        // Force normalization of registry keys for absolute consistency
        const normalizedId = SeriesVideoGenerator.normalizeId(id)
        this.projectLocationCache.set(normalizedId, (data as any).thumbnailUrl)
      }
    }

    const { SceneMemoryBuilder } = await import('./scene-memory')
    const memory = new SceneMemoryBuilder().build(script)

    const projectName = projectId || script.id || `video-${Date.now()}`
    const projectDir = path.join(this.outputDir, projectName)
    const scenesDir = path.join(projectDir, 'scenes')
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true })
    if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true })
    await this.exportVideoPackage(script, projectDir)

    // PROGRESS SCALING LOGIC
    // ─── PHASES DÉFINIES ─────────────────────────────────────────────────────
    // Étape 2/3 : Images (Génération visuelle)
    // Étape 3/3 : Audio & Montage (Assembly)

    const assConfig = valid.assCaptions || {
      enabled: false,
      style: 'colored' as const,
      fontSize: 70,
      fontFamily: 'Montserrat',
      position: 'bottom' as const,
      highlightColor: '#FFE135'
    }
    this.currentAssCaptionConfig = assConfig

    const skipAudio = valid.skipAudio || valid.generateOnlyScenes || valid.repromptSceneIndex != null
    const skipComposition = (valid.generateOnlyAudio || valid.generateOnlyAssembly) && valid.repromptSceneIndex == null

    // ─── OPTIMIZATION: Check for existing audio/transcription reuse ───────────
    const combinedScriptText = script.scenes.map((s: any) => s.id + s.narration).join('|')
    const voiceId = valid.kokoroVoicePreset || 'default'
    const scriptHash = `${voiceId}-${combinedScriptText.length}-${Buffer.from(combinedScriptText).toString('base64').substring(0, 32)}`
    const scriptHashPath = path.join(projectDir, 'script_hash.txt')
    const globalAudioPath = path.join(projectDir, 'narration.mp3')
    const transcriptHashPath = path.join(projectDir, 'transcript_hash.txt')

    // Merge direct parameter and option-based references
    if (valid.referenceImages && Array.isArray(valid.referenceImages)) {
      baseImages.push(...(valid.referenceImages as string[]))
    }

    const isScriptUnchanged = fs.existsSync(scriptHashPath) && fs.readFileSync(scriptHashPath, 'utf8') === scriptHash

    // ─── POLYPTYCH PRE-PROCESSING ──────────────────────────────────────────
    // Group scenes only if polyptychMode is explicitly enabled.
    if (valid.polyptychMode) {
      if (onProgress) await onProgress(0, 'step.step_2_images')

      // 1. Automatically group scenes that are not manually grouped
      PolyptychEngine.autoGroup(script.scenes)

      // 2. Identify all groups (manual and auto)
      const groups = PolyptychEngine.groupScenes(script.scenes)

      if (groups.length > 0) {
        console.log(`[NanoBanana] 🧩 Handling ${groups.length} polyptych groups...`)
        const polyptychEngine = new PolyptychEngine(await this.getImageService())

        // Resolve character references for consistency
        const characterImages = await this.promptManager.resolveCharacterImages()
        console.log(
          `[NanoBanana] 🎭 Resolving consistency with ${characterImages.length} character images and ${baseImages.length} base images.`
        )
        const allBaseImages = await this.downloadAndEncodeImages([...baseImages, ...characterImages])
        const hasReferenceImages = allBaseImages.length > 0
        const systemInstruction = await this.promptManager.buildImageSystemInstruction(hasReferenceImages)

        for (const group of groups) {
          // Detect if this group contains a scene targeted for regeneration
          const repromptId = valid.repromptSceneIndex != null ? String(valid.repromptSceneIndex) : null
          const isGroupTargeted = group.scenes.some((s, idx) => repromptId === String(idx) || repromptId === s.id)

          if (isGroupTargeted) {
            const masterPath = path.join(scenesDir, `polyptych_${group.id}_master.png`)
            if (fs.existsSync(masterPath)) {
              console.log(`[NanoBanana] 🔄 Scene in group ${group.id} targeted for reprompt. Invalidating master...`)
              fs.unlinkSync(masterPath)
            }
          }

          await polyptychEngine.processGroup(group, scenesDir, valid, {
            referenceImages: allBaseImages,
            systemInstruction,
            baseStyle: this.systemPrompt
          })
        }
      }
    }

    // ─── AUDIO GENERATION (Scene by Scene) ──────────────────────────────────
    if (!skipAudio) {
      if (onProgress) await onProgress(0, 'step.step_3_audio_prep:0')
      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i]
        const sceneDir = path.join(scenesDir, scene.id)
        if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true })
        const audioPath = path.join(sceneDir, 'narration.mp3')

        // MD5 hash of narration to detect changes
        const cleanNarration = (scene.narration || '').replace(/^[A-Z\s]+[:-]\s*/i, '').trim()
        const textHash = crypto
          .createHash('md5')
          .update(cleanNarration + voiceId)
          .digest('hex')
        const hashFile = path.join(sceneDir, 'audio_hash.txt')
        const isAudioValid =
          fs.existsSync(audioPath) && fs.existsSync(hashFile) && fs.readFileSync(hashFile, 'utf8') === textHash

        if (!isAudioValid) {
          // Priority 1: Download from MinIO if available (cross-worker worker)
          if ((scene as any).audioUrl) {
            console.log(`[NanoBanana] 📥 Downloading audio for ${scene.id} from MinIO...`)
            try {
              const res = await axios.get((scene as any).audioUrl, { responseType: 'arraybuffer' })
              fs.writeFileSync(audioPath, Buffer.from(res.data))
              fs.writeFileSync(hashFile, textHash)
              console.log(`[NanoBanana] ✓ Audio downloaded for ${scene.id}`)
            } catch (error: any) {
              console.warn(`[NanoBanana] ⚠ Failed to download audio for ${scene.id}: ${error.message}`)
            }
          }

          // Priority 2: Generate if still missing or invalid
          // RE-CHECK validity after potential download
          const stillInvalid =
            !fs.existsSync(audioPath) || !fs.existsSync(hashFile) || fs.readFileSync(hashFile, 'utf8') !== textHash

          if (stillInvalid) {
            const globalStart = Math.min(14, Math.round((i / script.scenes.length) * 15))
            const globalEnd = Math.min(15, Math.round(((i + 1) / script.scenes.length) * 15))

            await this.withPulse(globalStart, globalEnd, `step.step_3_audio_prep:${i + 1}`, onProgress, async () => {
              console.log(`[NanoBanana] 🎤 Generating audio for Scene ${i + 1}/${script.scenes.length}...`)
              const audio = await this.getAudioService()
              const res = await audio.generateSpeech(cleanNarration, audioPath)
              if (res.wordTimings) (scene as any).globalWordTimings = res.wordTimings
              ;(scene as any).audioDuration = res.duration
              fs.writeFileSync(hashFile, textHash)
            })
          }
        }

        // Always get duration if we don't have it
        if (!(scene as any).audioDuration && fs.existsSync(audioPath)) {
          ;(scene as any).audioDuration = await this.getRealDuration(audioPath)
        }
      }

      // ─── STITCH GLOBAL AUDIO & CALCULATE TIMINGS ──────────────────────────
      let currentTime = 0
      const audioFiles: string[] = []
      for (const s of script.scenes) {
        const p = path.join(scenesDir, s.id, 'narration.mp3')
        if (p && fs.existsSync(p)) {
          audioFiles.push(p)
          const d = (s as any).audioDuration || (await this.getRealDuration(p))
          ;(s as any).timeRange = { start: currentTime, end: currentTime + d }
          currentTime += d
        } else {
          const d =
            (s as any).timeRange?.end !== undefined && (s as any).timeRange?.start !== undefined
              ? (s as any).timeRange.end - (s as any).timeRange.start
              : 5
          ;(s as any).timeRange = { start: currentTime, end: currentTime + d }
          currentTime += d
        }
      }
      script.totalDuration = currentTime

      if (audioFiles.length > 0) {
        if (onProgress) await onProgress(15, 'step.step_3_narration')
        console.log(`[NanoBanana] 🧵 Stitching ${audioFiles.length} audio clips into global narration...`)
        await this.stitchAudioFiles(audioFiles, globalAudioPath)
        script.globalAudio = 'narration.mp3'
        fs.writeFileSync(scriptHashPath, scriptHash)
      }

      // ─── TRANSCRIPTION (Optional, for captions/Whisper) ─────────────────────
      const captionsEnabled = this.currentAssCaptionConfig?.enabled ?? valid.assCaptions?.enabled ?? false
      if (captionsEnabled && fs.existsSync(globalAudioPath)) {
        const audioStatHash = this.getFileHashInfo(globalAudioPath)
        const cachedTranscriptValid =
          fs.existsSync(transcriptHashPath) && fs.readFileSync(transcriptHashPath, 'utf8') === audioStatHash

        if (!cachedTranscriptValid) {
          if (onProgress) await onProgress(42, 'step.step_3_whisper')
          try {
            const { TranscriptionServiceFactory } = await import('../services/audio/transcription.service')
            const transcriptionService = await TranscriptionServiceFactory.create({
              provider: 'whisper-local',
              model: 'base',
              device: 'cpu',
              language: valid.language?.split('-')[0] || 'en'
            } as any)
            const result = await this.withPulse(15, 17, 'step.step_3_whisper', onProgress, () =>
              transcriptionService.transcribe(globalAudioPath)
            )
            const { TimingMapper } = await import('../utils/timing-mapper')
            const sceneNarrations = script.scenes.map((s: any) => ({ sceneId: s.id, narration: s.narration }))
            const mappedTimings = TimingMapper.mapScenes(sceneNarrations, result.wordTimings)
            mappedTimings.forEach((timing: any, idx: number) => {
              const scene = script.scenes[idx]
              if (timing.wordTimings.length > 0) (scene as any).globalWordTimings = timing.wordTimings
            })
            fs.writeFileSync(transcriptHashPath, audioStatHash)
          } catch (error: any) {
            console.warn(`[NanoBanana] ⚠ Transcription failed: ${error.message}`)
          }
        }
      }

      if (onTimingSync) await onTimingSync(script)
      fs.writeFileSync(path.join(projectDir, 'script.json'), JSON.stringify(script, null, 2))
    }

    // ─── TÉLÉCHARGEMENT DES IMAGES (Caches distants) ─────────────────────────
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]
      const isTarget =
        valid.repromptSceneIndex != null &&
        (String(valid.repromptSceneIndex) === String(i) || String(valid.repromptSceneIndex) === scene.id)
      const sceneDir = path.join(scenesDir, scene.id)
      const sceneImg = path.join(sceneDir, 'scene.webp')

      if (!fs.existsSync(sceneImg) && (scene as any).imageUrl && !isTarget) {
        try {
          if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true })
          const globalStart = 17 + Math.round((i / script.scenes.length) * 5)
          const globalEnd = 17 + Math.round(((i + 1) / script.scenes.length) * 5)
          await this.withPulse(globalStart, globalEnd, `step.step_2_download:${i + 1}`, onProgress, async () => {
            const res = await axios.get((scene as any).imageUrl, { responseType: 'arraybuffer' })
            fs.writeFileSync(sceneImg, Buffer.from(res.data))
          })
        } catch (error: any) {
          console.warn(`[NanoBanana] ⚠ Scene download failed for ${scene.id}: ${error.message}`)
        }
      }
    }

    // ─── COMPOSITION DES SCÈNES ───────────────────────────────────────────────
    if (!skipComposition) {
      if (onProgress) {
        await onProgress(22, 'step.step_2_images')
      }
      const sceneImagePromises = new Map<number, Promise<string | undefined>>()
      const context = (this.promptManager as any).seriesContext
      let completed = 0

      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i]
        const isTarget =
          valid.repromptSceneIndex != null &&
          (String(valid.repromptSceneIndex) === String(i) || String(valid.repromptSceneIndex) === scene.id)
        const sceneDir = path.join(scenesDir, scene.id)
        const sceneImg = path.join(sceneDir, 'scene.webp')

        const locId = SeriesVideoGenerator.normalizeId(scene.locationId || 'default')

        if (fs.existsSync(sceneImg) && !isTarget) {
          const cacheTask = this.generationQueue.add(
            async () => {
              try {
                // IMPORTANTE: S'assurer que l'imageUrl est présente pour la persistance
                scene.imageUrl = sceneImg
                console.log(`[NanoBanana] 💾 Cache hit for scene ${i + 1} (${scene.id})`)

                const b64 = fs.readFileSync(sceneImg).toString('base64')

                // [V48] Master Style Promotion from Cache
                if (i === 0 && context && !context.thumbnailUrl) {
                  console.info(`[NanoBanana] 🎨 MASTER STYLE PROMOTION (Cache): Setting global series DNA from S1.`)
                  context.thumbnailUrl = b64
                }

                completed++
                const globalPr = 22 + Math.round((completed / script.scenes.length) * 63)
                if (onProgress) {
                  await onProgress(globalPr, `step.step_2_scene:${i + 1}`)
                }

                if (onSceneGenerated) {
                  console.log(`[NanoBanana] 📣 Triggering onSceneGenerated for cached scene ${scene.id}...`)
                  await onSceneGenerated(scene, script, i + 1, globalPr)
                }

                return b64
              } catch (error: any) {
                console.warn(`[NanoBanana] ⚠ Error reading cached asset for scene ${i + 1}: ${error.message}`)
                return undefined
              }
            },
            `Cache ${scene.id}`,
            undefined, // No provider rate limit for cache
            locId // Sequential per location
          )
          sceneImagePromises.set(i, cacheTask)

          // [V48] S1 Lock: Sequential establishment from cache
          if (i === 0 && context && !context.thumbnailUrl) {
            await cacheTask
          }
          continue
        }

        const task = this.generationQueue.add(
          async () => {
            // [V48] Visual Continuity Logic
            if (
              i > 0 && // 1. All scenes must wait for S1 if it establishes global Master Style DNA
              context &&
              !context.thumbnailUrl
            ) {
              const s1Task = sceneImagePromises.get(0)
              if (s1Task) await s1Task
            }

            if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true })
            const prevB64 = scene.continueFromPrevious && i > 0 ? await sceneImagePromises.get(i - 1) : undefined

            const prevScenePath = i > 0 ? path.join(scenesDir, script.scenes[i - 1].id, 'scene.webp') : undefined
            const prevScene = i > 0 ? script.scenes[i - 1] : undefined

            const sceneMemory = {
              ...(memory || {}),
              previousScene: prevScene
            } as any

            await this.composeScene(
              scene,
              baseImages,
              sceneDir,
              prevB64,
              prevScenePath,
              isTarget,
              script,
              sceneMemory,
              onProgress
            )

            completed++
            const globalPr = 22 + Math.round((completed / script.scenes.length) * 63)
            if (onProgress) {
              await onProgress(globalPr, `step.step_2_scene:${i + 1}`)
            }
            if (onSceneGenerated) await onSceneGenerated(scene, script, i + 1, globalPr)
            return fs.existsSync(sceneImg) ? fs.readFileSync(sceneImg).toString('base64') : undefined
          },
          `Scene ${i + 1}`,
          'image', // Standard image provider limit
          locId // STRICT sequentiality per location for AnchorEngine
        )
        sceneImagePromises.set(i, task)

        // [V48] S1 Lock: Sequential establishment of the master style
        if (i === 0 && context && !context.thumbnailUrl) {
          console.info(`[NanoBanana] 📸 Establishing Master Style DNA from Scene 1...`)
          await task
        }
      }
      await this.generationQueue.onIdle()
    }

    // ─── ASSEMBLAGE FINAL ─────────────────────────────────────────────────────
    // Skip final assembly on reprompt — only the image was changed, video stays as-is.
    if (!valid.generateOnlyAudio && !valid.generateOnlyScenes && valid.repromptSceneIndex == null) {
      try {
        const globalAudioPath = path.join(projectDir, 'narration.mp3')
        const assembler = new VideoAssembler()
        await this.withPulse(85, 100, 'step.step_3_assembly', onProgress, async () =>
          assembler.assembleVideo(
            {
              projectId: projectName,
              script,
              outputPath: projectDir,
              options: valid,
              globalAudioPath: fs.existsSync(globalAudioPath) ? globalAudioPath : undefined
            },
            async (p, m) => {
              if (onProgress) {
                const scaledP = 85 + Math.round((p / 100) * 15)
                await onProgress(Math.min(100, scaledP), `[Étape 3/3] ${m}`)
              }
            }
          )
        )
        await this.cleanupProject(projectDir, 'intermediate')

        // Final sanity check: ensure at least one video output exists
        const finalMp4 = path.join(projectDir, 'final_video.mp4')
        const assembledMp4 = path.join(projectDir, 'assembled_video.mp4')
        if (!fs.existsSync(finalMp4) && !fs.existsSync(assembledMp4)) {
          throw new Error(`Assembly completed but final video file not found in ${projectDir}`)
        }
      } catch (error: any) {
        console.error(`[NanoBanana] Assembly fail:`, error)
        throw error // Propagate error to worker
      }
    }

    const stats = { apiCalls: script.sceneCount, generationTimeMs: Date.now() - startTime }
    fs.writeFileSync(path.join(projectDir, 'metadata.json'), JSON.stringify(stats, null, 2))
    return {
      script,
      projectId: projectName,
      outputPath: projectDir,
      generatedAt: new Date().toISOString(),
      metadata: stats
    }
  }

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
        duration: 120,
        animationMode: 'none',
        aspectRatio: '16:9',
        scriptOnly: false,
        imageProvider: 'gemini',
        llmProvider: 'gemini',
        kokoroVoicePreset: KokoroVoicePreset.BF_ISABELLA,
        backgroundMusic: 'upbeat',
        branding: branding || { watermarkText: 'PRO MASTER 2026', position: 'top-right' as any, opacity: 1, scale: 1 },
        assCaptions: assCaptions || {
          enabled: true,
          style: 'colored' as const,
          fontSize: 70,
          fontFamily: 'Montserrat',
          position: 'bottom' as const,
          highlightColor: '#FFE135'
        }
      },
      baseImages
    )
  }

  private async stitchAudioFiles(filePaths: string[], outputPath: string): Promise<void> {
    const listFile = `${outputPath}.list.txt`

    // --- Verification: Filter out invalid/corrupted files via ffprobe ---
    const validFiles: string[] = []
    for (const f of filePaths) {
      if (!fs.existsSync(f)) continue
      const duration = await this.getRealDuration(f)
      if (duration > 0) {
        validFiles.push(f)
      } else {
        console.warn(`[NanoBanana] ⚠ Skipping corrupted/empty audio file: ${f}`)
      }
    }

    if (validFiles.length === 0) {
      console.warn(`[NanoBanana] ⚠ No valid audio files to stitch for ${outputPath}`)
      return
    }

    fs.writeFileSync(listFile, validFiles.map((p) => `file '${path.resolve(p)}'`).join('\n'))
    try {
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

  private async getRealDuration(filePath: string): Promise<number> {
    const cp = await import('node:child_process')
    return new Promise((res) => {
      cp.exec(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, (err, stdout) => {
        if (err) return res(0)
        const d = parseFloat(stdout?.trim() || '0')
        res(isNaN(d) ? 0 : d)
      })
    })
  }

  private getFileHashInfo(filePath: string): string {
    if (!fs.existsSync(filePath)) return ''
    const stat = fs.statSync(filePath)
    return `${stat.mtimeMs}-${stat.size}`
  }

  clearImageCache(): void {
    this.sceneCache.clear()
  }

  getCacheStats(): { entries: number; cacheFile: string } {
    return {
      entries: Object.keys((this.sceneCache as any).cache).length,
      cacheFile: (this.sceneCache as any).filePath
    }
  }

  private async cleanupProject(projectDir: string, mode: 'intermediate' | 'full' = 'intermediate'): Promise<void> {
    if (!fs.existsSync(projectDir)) return
    if (mode === 'full') {
      fs.rmSync(projectDir, { recursive: true, force: true })
      return
    }
    const scDir = path.join(projectDir, 'scenes')
    if (fs.existsSync(scDir)) {
      // --- cleanupDelay: Ensure SSE events and files are fully flushed before deletion ---
      console.log(`[NanoBanana] 🧹 Cleaning up scenes in ${projectDir} (delay: 2s)...`)
      await new Promise((resolve) => setTimeout(resolve, 2000))
      fs.rmSync(scDir, { recursive: true, force: true })
    }
    const keep = [
      'final_video.mp4',
      'assembled_video.mp4',
      'script.json',
      'script.md',
      'metadata.json',
      'subtitles.srt',
      'narration.mp3',
      'script_hash.txt',
      'transcript_hash.txt'
    ]
    fs.readdirSync(projectDir).forEach((f) => {
      if (!keep.includes(f) && fs.statSync(path.join(projectDir, f)).isFile()) fs.unlinkSync(path.join(projectDir, f))
    })
  }

  public async purgeProject(projectId: string): Promise<void> {
    await this.cleanupProject(path.join(this.outputDir, projectId), 'full')
  }
}
