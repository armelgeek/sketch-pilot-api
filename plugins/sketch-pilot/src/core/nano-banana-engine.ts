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
  private projectLocationCache: Map<string, string> = new Map()

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

  async generateImage(
    scene: EnrichedScene,
    baseImages: (string | { name?: string; data: string })[],
    filename: string,
    bypassCache: boolean = false
  ): Promise<string> {
    const characterImages = await this.promptManager.resolveCharacterImages()
    const allBaseImages = await this.downloadAndEncodeImages([...baseImages, ...characterImages])
    const hasReferenceImages = allBaseImages.length > 0
    const hasLocationReference = allBaseImages.some((img: any) => img.name === 'LOCATION')
    const { prompt: fullPrompt } = await this.promptManager.buildImagePrompt(
      scene,
      hasReferenceImages,
      this.currentOptions?.aspectRatio || '16:9',
      undefined,
      hasLocationReference
    )
    const systemInstruction = await this.promptManager.buildImageSystemInstruction(hasReferenceImages)

    if (!bypassCache) {
      const cached = this.sceneCache.get(fullPrompt, { sceneId: scene.id, imageStyle: this.currentOptions?.imageStyle })
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
          systemInstruction
        })
        if (!bypassCache)
          this.sceneCache.set(fullPrompt, imageUrl, { sceneId: scene.id, imageStyle: this.currentOptions?.imageStyle })
        return imageUrl
      } catch (error: any) {
        lastError = error
        if (this.isNetworkError(error) && attempt < maxRetries) continue
        break
      }
    }

    if (this.currentImageProvider !== 'gemini' && this.isNetworkError(lastError)) {
      try {
        const gemini = await ImageServiceFactory.create({ provider: 'gemini', apiKey: this.apiKey } as any)
        return await gemini.generateImage(fullPrompt, filename, {
          aspectRatio: this.currentOptions?.aspectRatio || '16:9',
          referenceImages: allBaseImages,
          systemInstruction
        })
      } catch {
        const [w, h] = this.currentOptions?.aspectRatio === '9:16' ? [720, 1280] : [1280, 720]
        await sharp({ create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } } })
          .webp()
          .toFile(filename)
        return filename
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
    memory?: SceneMemory
  ): Promise<void> {
    const options = this.currentOptions
    const aspectRatio = options.aspectRatio || '16:9'
    const [width, height] = aspectRatio === '9:16' ? [720, 1280] : aspectRatio === '1:1' ? [1024, 1024] : [1280, 720]
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    const imagePath = path.join(outputDir, 'scene.webp')
    const tempBg = path.join(outputDir, 'temp_bg.webp')

    const effectiveRefs = [...referenceImages]
    if (scene.continueFromPrevious && lastSceneB64) effectiveRefs.push({ data: lastSceneB64 })

    // Location-based consistency: Reuse base image if same location exists in current project
    if (scene.locationId && this.projectLocationCache.has(scene.locationId)) {
      const locationB64 = this.projectLocationCache.get(scene.locationId)!
      effectiveRefs.push({ name: 'LOCATION', data: locationB64 })
    }

    // --- OPTIMIZATION: Physical Reuse or Polyptych existing asset ---
    if (fs.existsSync(imagePath) && !isReprompt) {
      console.log(`[NanoBanana] 💎 Using existing image asset for scene ${scene.id}`)
      scene.imageUrl = imagePath
    } else if (scene.continueFromPrevious && lastScenePath && fs.existsSync(lastScenePath) && !isReprompt) {
      console.log(`[NanoBanana] ♻️ Reusing physical image from previous scene: ${lastScenePath}`)
      fs.copyFileSync(lastScenePath, imagePath)
      scene.imageUrl = imagePath
    } else {
      const MAX_IMAGE_RETRIES = 3
      let lastImageError: any
      for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {
        try {
          await this.generateImage(scene, effectiveRefs, tempBg, isReprompt)
          await sharp(tempBg).resize(width, height, { fit: 'cover' }).webp().toFile(imagePath)
          lastImageError = null
          break
        } catch (error: any) {
          lastImageError = error
          if (attempt < MAX_IMAGE_RETRIES) {
            console.warn(
              `[NanoBanana] Image attempt ${attempt}/${MAX_IMAGE_RETRIES} failed, retrying in ${attempt * 3}s...`
            )
            await new Promise((r) => setTimeout(r, attempt * 3000))
          } else {
            console.error(`[NanoBanana] Image generation failed after ${MAX_IMAGE_RETRIES} attempts: ${error.message}`)
          }
        } finally {
          if (fs.existsSync(tempBg)) fs.unlinkSync(tempBg)
        }
      }

      // Only write blank placeholder if all retries exhausted
      if (lastImageError && !fs.existsSync(imagePath)) {
        await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
          .webp()
          .toFile(imagePath)
      }
    }

    // Store in location cache for future scenes
    if (scene.locationId && !this.projectLocationCache.has(scene.locationId) && fs.existsSync(imagePath)) {
      this.projectLocationCache.set(scene.locationId, fs.readFileSync(imagePath).toString('base64'))
    }

    await this.generateThumbnail(imagePath, path.join(outputDir, 'thumbnail.jpg'))
    const wordTimings = (scene as any).globalWordTimings
    const totalDuration = scene.timeRange ? scene.timeRange.end - scene.timeRange.start : 5

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
        } catch {}
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

    if (wordTimings?.length > 0) {
      const start = scene.timeRange.start
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
        : scene.timeRange?.end - scene.timeRange?.start || 5
      scene.timeRange = { start: currentTime, end: currentTime + d }
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
            if (onProgress) await onProgress(Math.round((p / 100) * 15), m)
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
    }, 2500)

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
    if (onProgress) await onProgress(0, `[Étape 1/3] Démarrage de l'écriture: ${topic}`)
    const script = await this.withPulse(0, 100, 'Studio: Crafting your unique script...', onProgress, () =>
      this.generateStructuredScript(topic, valid, onProgress)
    )
    if (valid.scriptOnly)
      return {
        script,
        projectId: projectId || 'script-only',
        outputPath: '',
        generatedAt: new Date().toISOString(),
        metadata: { apiCalls: script.sceneCount }
      }
    if (onProgress) await onProgress(100, `[Étape 1/3] Script terminé.`)
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
    this.currentOptions = valid
    this.projectLocationCache.clear()
    const projectName = projectId || script.id || `video-${Date.now()}`
    const projectDir = path.join(this.outputDir, projectName)
    const scenesDir = path.join(projectDir, 'scenes')
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true })
    if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true })
    await this.exportVideoPackage(script, projectDir)

    const assConfig = valid.assCaptions || {
      enabled: false,
      style: 'colored' as const,
      fontSize: 70,
      fontFamily: 'Montserrat',
      position: 'bottom' as const,
      highlightColor: '#FFE135'
    }
    this.currentAssCaptionConfig = assConfig

    const skipAudio = valid.skipAudio || valid.generateOnlyScenes
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
      if (onProgress) await onProgress(0, '[Étape 2/3] Organisation des scènes...')

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
      if (onProgress) await onProgress(5, '[Étape 2/3] Préparation de la narration...')
      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i]
        const sceneDir = path.join(scenesDir, scene.id)
        if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true })
        const audioPath = path.join(sceneDir, 'narration.mp3')

        // MD5 hash of narration to detect changes
        const textHash = crypto
          .createHash('md5')
          .update(scene.narration + voiceId)
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
            console.log(`[NanoBanana] 🎤 Generating audio for Scene ${i + 1}/${script.scenes.length}...`)
            const audio = await this.getAudioService()
            const res = await audio.generateSpeech(scene.narration, audioPath)
            if (res.wordTimings) (scene as any).globalWordTimings = res.wordTimings
            ;(scene as any).audioDuration = res.duration
            fs.writeFileSync(hashFile, textHash)
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
        if (fs.existsSync(p)) {
          audioFiles.push(p)
          const d = (s as any).audioDuration || (await this.getRealDuration(p))
          s.timeRange = { start: currentTime, end: currentTime + d }
          currentTime += d
        } else {
          const d = s.timeRange?.end - s.timeRange?.start || 5
          s.timeRange = { start: currentTime, end: currentTime + d }
          currentTime += d
        }
      }
      script.totalDuration = currentTime

      if (audioFiles.length > 0) {
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
          if (onProgress) await onProgress(20, '[Étape 2/3] Synchronisation des paroles (Whisper AI)...')
          try {
            const { TranscriptionServiceFactory } = await import('../services/audio/transcription.service')
            const transcriptionService = await TranscriptionServiceFactory.create({
              provider: 'whisper-local',
              model: 'base',
              device: 'cpu',
              language: valid.language?.split('-')[0] || 'en'
            } as any)
            const result = await transcriptionService.transcribe(globalAudioPath)
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
          const res = await axios.get((scene as any).imageUrl, { responseType: 'arraybuffer' })
          fs.writeFileSync(sceneImg, Buffer.from(res.data))
        } catch (error: any) {
          console.warn(`[NanoBanana] ⚠ Scene download failed for ${scene.id}: ${error.message}`)
        }
      }
    }

    // ─── COMPOSITION DES SCÈNES ───────────────────────────────────────────────
    if (!skipComposition) {
      const sceneImagePromises = new Map<number, Promise<string | undefined>>()
      let completed = 0

      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i]
        const isTarget =
          valid.repromptSceneIndex != null &&
          (String(valid.repromptSceneIndex) === String(i) || String(valid.repromptSceneIndex) === scene.id)
        const sceneDir = path.join(scenesDir, scene.id)
        const sceneImg = path.join(sceneDir, 'scene.webp')

        if (fs.existsSync(sceneImg) && !isTarget) {
          const cacheTask = this.generationQueue.add(async () => {
            try {
              // IMPORTANTE: S'assurer que l'imageUrl est présente pour la persistance
              scene.imageUrl = sceneImg
              console.log(`[NanoBanana] 💾 Cache hit for scene ${i + 1} (${scene.id})`)

              const b64 = fs.readFileSync(sceneImg).toString('base64')
              completed++

              const localPr = Math.round((completed / script.scenes.length) * 100)
              if (onProgress)
                await onProgress(localPr, `[Étape 2/3] Scène ${completed}/${script.scenes.length} (cache)`)

              if (onSceneGenerated) {
                console.log(`[NanoBanana] 📣 Triggering onSceneGenerated for cached scene ${scene.id}...`)
                await onSceneGenerated(scene, script, i + 1, localPr)
              }

              return b64
            } catch (error: any) {
              console.warn(`[NanoBanana] ⚠ Error reading cached asset for scene ${i + 1}: ${error.message}`)
              return undefined
            }
          })
          sceneImagePromises.set(i, cacheTask)
          continue
        }

        const task = this.generationQueue.add(async () => {
          if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true })
          const prevB64 = scene.continueFromPrevious && i > 0 ? await sceneImagePromises.get(i - 1) : undefined

          const localStartPr = Math.round((completed / script.scenes.length) * 100)
          const localEndPr = Math.round(((completed + 1) / script.scenes.length) * 100)

          await this.withPulse(
            localStartPr,
            localEndPr,
            `[Étape 2/3] Génération scène ${i + 1}...`,
            onProgress,
            async () => {
              const prevScenePath = i > 0 ? path.join(scenesDir, script.scenes[i - 1].id, 'scene.webp') : undefined
              await this.composeScene(scene, baseImages, sceneDir, prevB64, prevScenePath, isTarget, script)
            }
          )

          completed++
          const localPr = Math.round((completed / script.scenes.length) * 100)
          if (onProgress) await onProgress(localPr, `[Étape 2/3] Scène ${completed}/${script.scenes.length}`)
          if (onSceneGenerated) await onSceneGenerated(scene, script, i + 1, localPr)
          return fs.existsSync(sceneImg) ? fs.readFileSync(sceneImg).toString('base64') : undefined
        })
        sceneImagePromises.set(i, task)
      }
      await this.generationQueue.onIdle()
    }

    // ─── ASSEMBLAGE FINAL ─────────────────────────────────────────────────────
    // Skip final assembly on reprompt — only the image was changed, video stays as-is.
    if (!valid.generateOnlyAudio && !valid.generateOnlyScenes && valid.repromptSceneIndex == null) {
      try {
        const globalAudioPath = path.join(projectDir, 'narration.mp3')
        const assembler = new VideoAssembler()
        await assembler.assembleVideo(
          {
            projectId: projectName,
            script,
            outputPath: projectDir,
            options: valid,
            globalAudioPath: fs.existsSync(globalAudioPath) ? globalAudioPath : undefined
          },
          async (p, m) => {
            if (onProgress) await onProgress(p, `[Étape 3/3] ${m}`)
          }
        )
        await this.cleanupProject(projectDir, 'intermediate')
      } catch (error) {
        console.error(`[NanoBanana] Assembly fail:`, error)
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
    fs.writeFileSync(listFile, filePaths.map((p) => `file '${path.resolve(p)}'`).join('\n'))
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
    if (fs.existsSync(scDir)) fs.rmSync(scDir, { recursive: true, force: true })
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
