import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "node:fs";
import sharp from "sharp";
import { z } from "zod";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { VideoScriptGenerator } from "./video-script-generator";
import { PromptManager, DEFAULT_STYLE_SUFFIX, DEFAULT_CHARACTER_SYSTEM_INSTRUCTION, type PromptLoader } from "./prompt-manager";
import { TaskQueue } from "../utils/task-queue";
import { getCharacterModelManager } from "../utils/character-models";
import {
  AudioService,
  AudioServiceFactory,
  AudioServiceConfig,
  WordTiming,
} from "../services/audio";
import {
  TranscriptionService,
  TranscriptionServiceFactory,
  TranscriptionServiceConfig,
} from "../services/audio/transcription.service";
import {
  AnimationService,
  AnimationServiceFactory,
  AnimationServiceConfig,
} from "../services/animation";
import { VideoAssembler } from "../services/video/video-assembler.service";
import {
  AssCaptionService,
  AssCaptionConfig,
} from "../services/video/ass-caption.service";
import {
  BrandingConfig,
  CompleteVideoPackage,
  CompleteVideoScript,
  EnrichedScene,
  VideoGenerationOptions,
  videoGenerationOptionsSchema,
  ImageProvider,
  LLMProvider,
  KokoroVoicePreset,
  SceneLayout,
  Position,
  AssetDefinition,
  TextDefinition,
  TranscriptionConfig,
} from "../types/video-script.types";
import {
  ImageService,
  ImageServiceFactory,
  ImageServiceConfig,
} from "../services/image";
import {
  LLMService,
  LLMServiceFactory,
  LLMServiceConfig,
} from "../services/llm";

import { TimingMapper } from "../utils/timing-mapper";
import { CreditsService } from "../services/user/credits-service";
import { CostManager } from "../utils/cost-manager";
import { SceneCacheService } from "../services/llm/scene-cache.service";
import { QualityMode } from "../types/video-script.types";

// Types and Schemas
export const generationOptionsSchema = z.object({
  prompt: z.string(),
  referenceImages: z.array(z.string()).optional(), // Base64 strings
});

export interface SceneDescription {
  id: string;
  script: string;
}

export type GenerationOptions = z.infer<typeof generationOptionsSchema>;

// (Other shared schemas moved to video-script.types.ts for consolidation)

export class NanoBananaEngine {
  private readonly styleSuffix: string;
  private readonly systemPrompt: string;
  private readonly client: GoogleGenAI;
  private scriptGenerator: VideoScriptGenerator;
  readonly promptManager: PromptManager;
  private readonly generationQueue: TaskQueue;
  private audioService: AudioService;
  private transcriptionService?: TranscriptionService;
  private readonly animationService: AnimationService;
  private imageService: ImageService;
  private llmService: LLMService;
  private currentOptions?: VideoGenerationOptions;
  private currentImageProvider: ImageProvider = "gemini";
  private currentLLMProvider: LLMProvider = "gemini";
  private currentTranscriptionConfig?: TranscriptionConfig;
  private currentAssCaptionConfig?: AssCaptionConfig;
  private currentKokoroVoicePreset: KokoroVoicePreset = KokoroVoicePreset.AF_HEART;

  private readonly creditsService: CreditsService;
  private readonly sceneCache: SceneCacheService;

  // Store config for service re-initialization
  private readonly apiKey: string;
  private readonly audioConfig?: AudioServiceConfig;
  private readonly animationConfig?: AnimationServiceConfig;
  private readonly llmConfig?: LLMServiceConfig;

  constructor(
    apiKey: string,
    styleSuffix?: string,
    systemPrompt?: string,
    audioConfig?: AudioServiceConfig,
    animationConfig?: AnimationServiceConfig,
    imageConfig?: ImageServiceConfig,
    llmConfig?: LLMServiceConfig,
    transcriptionConfig?: TranscriptionConfig,
    promptLoader?: PromptLoader,
  ) {
    this.apiKey = apiKey;
    this.audioConfig = audioConfig;
    this.animationConfig = animationConfig;
    this.llmConfig = llmConfig;
    this.currentTranscriptionConfig = transcriptionConfig;
    this.styleSuffix = styleSuffix ?? DEFAULT_STYLE_SUFFIX;
    this.systemPrompt = systemPrompt ?? DEFAULT_CHARACTER_SYSTEM_INSTRUCTION;

    this.client = new GoogleGenAI({ apiKey });

    // Central prompt manager — shared with the script generator
    this.promptManager = new PromptManager({
      styleSuffix: this.styleSuffix,
      characterSystemInstruction: this.systemPrompt,
      backgroundColor: "#F5F5F5",
      promptLoader,
    });

    // Use factory pattern to create services
    this.audioService = AudioServiceFactory.create(
      audioConfig || {
        provider: "kokoro",
        lang: "en",
        apiKey: process.env.HUGGING_FACE_TOKEN || apiKey,
        kokoroVoicePreset: this.currentKokoroVoicePreset
      },
    );
    this.animationService = AnimationServiceFactory.create(
      animationConfig || { provider: "veo", apiKey },
    );

    if (transcriptionConfig) {
      this.transcriptionService =
        TranscriptionServiceFactory.create(transcriptionConfig);
    }

    this.currentImageProvider = imageConfig?.provider || "gemini";
    this.imageService = ImageServiceFactory.create(
      imageConfig || {
        provider: this.currentImageProvider,
        apiKey,
        styleSuffix,
        systemPrompt,
      },
    );

    this.llmService = LLMServiceFactory.create(
      llmConfig || {
        provider: this.currentLLMProvider,
        apiKey,
        cacheSystemPrompt: true,  // ← Option B: Enable prompt caching
      },
    );

    this.creditsService = new CreditsService();
    this.sceneCache = new SceneCacheService();

    // Pass the shared PromptManager into VideoScriptGenerator via constructor injection
    this.scriptGenerator = new VideoScriptGenerator(
      this.llmService,
      this.promptManager,
    );

    // Initialize queue with provider-specific rate limits and circuit breakers
    // maxConcurrency is total global concurrency across all providers
    this.generationQueue = new TaskQueue({
      maxConcurrency: 10,
      maxRetries: 6,
      initialDelayMs: 2000,
      providerConfigs: {
        'image': { maxConcurrent: 2, failureThreshold: 3 },
        'llm': { maxConcurrent: 3, failureThreshold: 5 },
        'animation': { maxConcurrent: 1, failureThreshold: 2 },
        // Specific providers can also be defined if known
        [this.currentImageProvider]: { maxConcurrent: 2 },
        [this.currentLLMProvider || 'gemini']: { maxConcurrent: 3 }
      }
    });

    // Ensure output directory exists
    const outputDir = path.join(__dirname, "..", "..", "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  async generateSceneLayout(script: string): Promise<SceneLayout> {
    console.log(
      `[NanoBanana] Analyzing script for layout: "${script.substring(0, 50)}..."`,
    );

    const cacheKey = `layout:${script}`;
    const cached = this.sceneCache.get(cacheKey);
    if (cached) {
      console.log(`[NanoBanana] Returning cached layout for: "${script.substring(0, 30)}..."`);
      return this.parseSceneLayout(cached);
    }

    const text = await this.generationQueue.add(
      () => this.llmService.generateContent(
        script,
        this.promptManager.buildLayoutSystemPrompt(),
        "application/json",
      ),
      `Scene Layout Analysis`,
      'llm'
    );

    if (!text) throw new Error("Failed to generate layout JSON");

    this.sceneCache.set(cacheKey, text);
    return this.parseSceneLayout(text);
  }

  private parseSceneLayout(text: string): SceneLayout {
    try {
      const cleaned =
        typeof text === "string"
          ? text.replace(/```json\n?|\n?```/g, "").trim()
          : text;

      const parsed =
        typeof cleaned === "string" ? JSON.parse(cleaned) : cleaned;
      return {
        assets: parsed.assets || [],
        texts: parsed.texts || [],
        backgroundColor: parsed.backgroundColor || "#FFF",
      } as SceneLayout;
    } catch (e) {
      console.error("[NanoBanana] Layout parsing error:", e, text);
      throw e;
    }
  }

  async generateAsset(
    asset: AssetDefinition,
    baseImages: string[],
    filename: string,
    customPrompt?: string,
    skipTrim: boolean = true,
    aspectRatio?: string,
    removeBackground: boolean = false,
    captionPosition?: string,
    progressiveElements?: string[],
  ): Promise<string> {
    const referenceImageCount = baseImages.length;
    const fullPrompt = this.promptManager.buildAssetImagePrompt(
      asset,
      referenceImageCount,
      customPrompt,
      captionPosition,
      progressiveElements,
    );
    const systemInstruction =
      this.promptManager.buildImageSystemInstruction(referenceImageCount > 0);

    try {
      const quality = this.currentOptions?.qualityMode === QualityMode.LOW_COST
        ? 'ultra-low'
        : this.currentOptions?.qualityMode === QualityMode.HIGH_QUALITY
          ? 'high'
          : 'medium';

      return await this.imageService.generateImage(fullPrompt, filename, {
        quality,
        smartUpscale: true,
        format: 'webp',
        aspectRatio: aspectRatio || this.currentOptions?.aspectRatio || "16:9",
        removeBackground,
        skipTrim,
        referenceImages: baseImages,
        systemInstruction,
      });
    } catch (error) {
      // Network error fallback: if Grok fails, try Gemini
      const isNetError = this.isNetworkError(error);
      if (isNetError && this.currentImageProvider === 'grok') {
        console.warn(`[NanoBanana] Network error with Grok, falling back to Gemini...`);
        this.currentImageProvider = 'gemini';
        this.imageService = ImageServiceFactory.create({
          provider: 'gemini',
          apiKey: this.apiKey,
          styleSuffix: this.styleSuffix,
          systemPrompt: this.systemPrompt,
        });

        // Retry with Gemini
        try {
          return await this.imageService.generateImage(fullPrompt, filename, {
            quality: 'medium',
            smartUpscale: true,
            format: 'webp',
            aspectRatio: aspectRatio || this.currentOptions?.aspectRatio || "16:9",
            removeBackground,
            skipTrim,
            referenceImages: baseImages,
            systemInstruction,
          });
        } catch (fallbackError) {
          console.error(`[NanoBanana] Fallback to Gemini also failed:`, fallbackError);
          throw fallbackError;
        }
      }

      console.error(`[NanoBanana] Error generating ${asset.type}:`, error);
      throw error;
    }
  }

  /**
   * Generates a thumbnail.jpg from the given image file using sharp.
   * The thumbnail is resized to a maximum width of 320px while preserving aspect ratio.
   */
  private async generateThumbnail(
    imagePath: string,
    thumbnailPath: string,
  ): Promise<void> {
    if (!fs.existsSync(imagePath)) {
      console.warn(
        `[NanoBanana] Cannot create thumbnail: source image not found at ${imagePath}`,
      );
      return;
    }
    try {
      await sharp(imagePath)
        .resize(320, null, { withoutEnlargement: true, fit: "inside" })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);
      console.log(`[NanoBanana] Thumbnail created: ${thumbnailPath}`);
    } catch (error) {
      console.warn(`[NanoBanana] Failed to create thumbnail: ${error}`);
    }
  }

  /**
   * Detect if error is network-related
   */
  private isNetworkError(error: any): boolean {
    const message = error?.message || '';
    const code = error?.code || '';
    return (
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'ENETUNREACH' ||
      code === 'EHOSTUNREACH' ||
      message.includes('timeout') ||
      message.includes('ECONNRESET') ||
      message.includes('connect')
    );
  }

  /**
   * Composes a full scene.
   */
  async composeScene(
    scene: EnrichedScene,
    baseImages: string[],
    targetDir: string,
    lastSceneImage?: string,
  ): Promise<void> {
    console.log(`\n--- Composing Scene: ${scene.id} ---`);
    const options = this.currentOptions || ({} as any);
    const animationMode = options.animationMode || "static";
    const aspectRatio = options.aspectRatio || "16:9";
    let totalDuration = scene.timeRange
      ? scene.timeRange.end - scene.timeRange.start
      : 5;

    console.log(
      `[NanoBanana] Options: Mode=${animationMode}, Clip=${options.animationClipDuration}s`,
    );

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let layers: any[] = [];
    let sceneImage = "scene.webp"; // Default to WebP format

    // Standard single image generation
    const imagePrompt = scene.imagePrompt || scene.narration || "";
    const imagePath = path.join(targetDir, `scene.webp`);

    // Unified Reference Images: Bible + (Optional) Previous Scene
    const effectiveBaseImages = [...baseImages];
    if (scene.continueFromPrevious && lastSceneImage) {
      // Add the previous scene's image as a high-fidelity reference
      // It is placed AFTER the character bible to maintain identity but provide scene context
      effectiveBaseImages.push(lastSceneImage);
    }

    await this.generationQueue.add(
      () =>
        this.generateAsset(
          {
            type: "character",
            description: imagePrompt,
            position: "center",
            scale: 1.0,
            zIndex: 0,
          },
          effectiveBaseImages,
          imagePath,
          imagePrompt,
          true,
          aspectRatio,
          false,  // removeBackground: false - Keep white background
          this.currentAssCaptionConfig?.position || "bottom",
          scene.progressiveElements,  // Progressive reveal elements
        ),
      `Scene ${scene.id} Image`,
      this.currentImageProvider
    );

    // Generate thumbnail from scene image
    const thumbnailPath = path.join(targetDir, "thumbnail.jpg");
    await this.generateThumbnail(imagePath, thumbnailPath);

    // ── Keyword Visual Generation ──────────────────────────────────────────────
    // For each keywordVisual, generate an alt-image that will be spliced into
    // the video at the exact word timestamp when the keyword is spoken.
    if (scene.keywordVisuals && scene.keywordVisuals.length > 0) {
      console.log(`[NanoBanana] Generating ${scene.keywordVisuals.length} keyword visuals for scene ${scene.id}...`);
      const keywordManifest: Array<{ keyword: string; imagePath: string }> = [];

      for (let i = 0; i < scene.keywordVisuals.length; i++) {
        const kv = scene.keywordVisuals[i];
        const kvPath = path.join(targetDir, `keyword_visual_${i}.webp`);

        await this.generationQueue.add(
          () => this.generateAsset(
            {
              type: "character",
              description: kv.imagePrompt,
              position: "center",
              scale: 1.0,
              zIndex: 0,
            },
            baseImages,        // Use character bible only (no previous scene ref)
            kvPath,
            kv.imagePrompt,
            true,              // skipTrim
            aspectRatio,
            false,             // removeBackground
            this.currentAssCaptionConfig?.position || "bottom",
            undefined,         // no progressiveElements
          ),
          `Scene ${scene.id} Keyword Visual [${kv.keyword}]`,
          this.currentImageProvider
        );

        keywordManifest.push({ keyword: kv.keyword, imagePath: kvPath });
      }

      // Write manifest so VideoAssembler can look up keyword → image path
      const manifestPath = path.join(targetDir, "keyword_visuals.json");
      fs.writeFileSync(manifestPath, JSON.stringify(keywordManifest, null, 2));
      console.log(`[NanoBanana] Keyword visual manifest written: ${manifestPath}`);
    }

    const audioPath = path.join(targetDir, `narration.mp3`);
    let wordTimings: WordTiming[] | undefined = (scene as any).globalWordTimings;

    if (wordTimings && wordTimings.length > 0) {
      console.log(`[NanoBanana] Using global word timings for scene ${scene.id}`);
      // When using global audio, duration is exactly what Whisper measured
      totalDuration = scene.timeRange.end - scene.timeRange.start;
    } else if (scene.narration) {
      try {
        const audioResult = await this.audioService.generateSpeech(
          scene.narration,
          audioPath,
        );
        wordTimings = audioResult.wordTimings;

        // Try transcription if word timings are missing
        if (!wordTimings || wordTimings.length === 0) {
          // Auto-initialize Whisper local if not already done
          if (!this.transcriptionService) {
            console.log(
              `[NanoBanana] Word timings missing from TTS. Auto-initializing Whisper local...`,
            );
            this.currentTranscriptionConfig = {
              provider: "whisper-local",
              model: "base",
              device: "cpu",
              language: "en",
            };
            this.transcriptionService = TranscriptionServiceFactory.create(
              this.currentTranscriptionConfig,
            );
          }

          try {
            console.log(
              `[NanoBanana] Transcribing with ${this.currentTranscriptionConfig?.provider}...`,
            );
            const transcriptionResult =
              await this.transcriptionService.transcribe(audioPath);
            wordTimings = transcriptionResult.wordTimings;
          } catch (transcribeErr) {
            console.error(`[NanoBanana] Transcription error:`, transcribeErr);
          }
        }
      } catch (error) {
        console.error(`[NanoBanana] Audio error:`, error);
      }
    }

    // 5. Generate Animation (Queued) - primarily for AI mode
    let hasVideo = false;
    const videoPath = path.join(targetDir, `animation.mp4`);
    const clipDuration = options.animationClipDuration || 6;

    if (animationMode === "ai" && scene.animationPrompt) {
      await this.generationQueue.add(async () => {
        try {
          await this.animationService.animateImage(
            path.join(targetDir, sceneImage),
            scene.animationPrompt,
            clipDuration,
            videoPath,
            aspectRatio,
          );
          hasVideo = fs.existsSync(videoPath);
        } catch (error) {
          console.error(`[NanoBanana] Animation error:`, error);
        }
      }, `Scene ${scene.id} Animation`, 'animation');
    }

    // 6. Subtitles are now handled by VideoAssembler during stitching to ensure perfect sync with padding

    // 7. Save Manifest
    const manifest: any = {
      id: scene.id,
      sceneImage,
      audio: (!options.useGlobalAudio && scene.narration) ? "narration.mp3" : undefined,
      video: hasVideo ? "animation.mp4" : undefined,
      videoMeta: hasVideo
        ? { clipDuration, totalDuration, loop: true }
        : undefined,
      animationMode,
      layers: layers.length > 0 ? layers : undefined,
      panningEffect:
        animationMode === "panning"
          ? {
            type: scene.cameraAction?.type || "zoom-in",
            intensity: scene.cameraAction?.intensity || "medium",
            duration: totalDuration,
          }
          : undefined,
      aspectRatio,
      soundEffects: scene.soundEffects,
      cameraAction: scene.cameraAction,
      transitionToNext: scene.transitionToNext,
      backgroundColor:
        scene.backgroundColor || options.backgroundColor || "#FFFF",
      pauseBefore: (scene as any).pauseBefore,
      pauseAfter: (scene as any).pauseAfter,
    };

    // Store both relative and global word timings if available
    if (wordTimings && wordTimings.length > 0) {
      const startTime = scene.timeRange.start;

      // wordTimings: Relative to scene start (for clip effects)
      manifest.wordTimings = wordTimings.map(w => {
        const relStart = Math.max(0, w.start - startTime);
        const relEnd = Math.max(relStart, w.end - startTime);
        return {
          ...w,
          start: Math.round(relStart * 100) / 100,
          end: Math.round(relEnd * 100) / 100,
          startMs: Math.round(relStart * 1000)
        };
      });

      // globalWordTimings: Absolute (for global sync / subtitles)
      manifest.globalWordTimings = wordTimings.map(w => ({
        ...w,
        start: Math.round(w.start * 100) / 100,
        end: Math.round(w.end * 100) / 100,
        startMs: Math.round(w.startMs)
      }));
    }

    fs.writeFileSync(
      path.join(targetDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    console.log(`[NanoBanana] Scene manifest saved.`);
  }

  /**
   * Regenerates the scene image and thumbnail for an existing scene directory.
   * Useful for re-generating just the visuals without re-running the full pipeline.
   *
   * @param scene - The enriched scene data containing imagePrompt and id
   * @param baseImages - Reference images as base64 strings for character consistency
   * @param targetDir - The scene directory where scene.webp and thumbnail.jpg will be written
   */
  async regenerateSceneImage(
    scene: EnrichedScene,
    baseImages: string[],
    targetDir: string,
  ): Promise<void> {
    console.log(`\n--- Regenerating Scene Image: ${scene.id} ---`);
    const aspectRatio = this.currentOptions?.aspectRatio || "16:9";
    const imagePrompt = scene.imagePrompt || scene.narration || "";
    const imagePath = path.join(targetDir, "scene.webp");

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    await this.generationQueue.add(
      () =>
        this.generateAsset(
          {
            type: "character",
            description: imagePrompt,
            position: "center",
            scale: 1.0,
            zIndex: 0,
          },
          baseImages,
          imagePath,
          imagePrompt,
          true,
          aspectRatio,
          false,
          this.currentAssCaptionConfig?.position || "bottom",
          undefined,
        ),
      `Scene ${scene.id} Image Regeneration`,
      this.currentImageProvider
    );

    const thumbnailPath = path.join(targetDir, "thumbnail.jpg");
    await this.generateThumbnail(imagePath, thumbnailPath);
    console.log(`[NanoBanana] Scene ${scene.id} image and thumbnail regenerated.`);
  }

  /**
   * Generates a "Character Bible" (Scene 0) used as the visual anchor for all other scenes.
   */
  async generateCharacterBible(
    script: CompleteVideoScript,
    projectDir: string,
    existingBaseImages: string[] = []
  ): Promise<string[]> {
    console.log(`\n[NanoBanana] --- Generating Character Bible (Scene 0) ---`);

    // Gather all unique character variants from the script
    const uniqueCharacters = Array.from(new Set(
      script.scenes
        .map(s => s.characterVariant)
        .filter(Boolean) as string[]
    ));

    if (uniqueCharacters.length === 0) {
      uniqueCharacters.push('standard');
    }

    // Use the narration of the first scene if possible to get a good description, or the title
    const mainCharacterDescription = script.titles[0];

    const biblePath = path.join(projectDir, "character_bible.webp");
    const biblePrompt = this.promptManager.buildCharacterBiblePrompt(mainCharacterDescription, uniqueCharacters);

    try {
      const bibleImageUrl = await this.imageService.generateImage(biblePrompt, biblePath, {
        quality: 'high', // Bible needs to be high quality for subsequent mapping
        aspectRatio: '1:1', // Grid is best as square
        referenceImages: existingBaseImages,
        systemInstruction: `You are creating a CHARACTER REFERENCE SHEET. 
Output a 2x2 grid. 
${uniqueCharacters.length > 1
            ? `Include all characters: ${uniqueCharacters.join(', ')}. Each should have at least one full-body and one clear face shot.`
            : "Include: 1. Full body front, 2. Dynamic pose, 3. Face close-up, 4. Side profile."}
PLAIN WHITE BACKGROUND.`
      });

      if (fs.existsSync(bibleImageUrl)) {
        console.log(`[NanoBanana] ✓ Character Bible generated: ${bibleImageUrl}`);
        const buffer = fs.readFileSync(bibleImageUrl);
        return [buffer.toString('base64')];
      }
    } catch (error) {
      console.warn(`[NanoBanana] ⚠ Failed to generate Character Bible, falling back to existing models.`, error);
    }

    return [];
  }

  /**
   * Synchronizes scene timings with global narration audio and updates manifests.
   * Useful for re-syncing an existing project directory before assembly.
   */
  async syncTimings(projectDir: string): Promise<void> {
    const scriptPath = path.join(projectDir, "script.json");
    const globalAudioPath = path.join(projectDir, "global_narration.mp3");

    if (!fs.existsSync(scriptPath) || !fs.existsSync(globalAudioPath)) {
      console.warn(`[NanoBanana] Cannot sync timings: script.json or global_narration.mp3 missing in ${projectDir}`);
      return;
    }

    const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8")) as CompleteVideoScript;

    // Auto-initialize Whisper local if not already done
    if (!this.transcriptionService) {
      console.log(`[NanoBanana-Sync] Initializing Whisper for sync...`);
      this.transcriptionService = TranscriptionServiceFactory.create({
        provider: "whisper-local",
        model: "base",
        device: "cpu",
        language: "en",
      });
    }

    console.log(`[NanoBanana-Sync] Transcribing global audio for project: ${path.basename(projectDir)}`);
    const transcriptionResult = await this.transcriptionService.transcribe(globalAudioPath);
    const globalWordTimings = transcriptionResult.wordTimings;

    console.log(`[NanoBanana-Sync] Mapping word timings to scenes...`);
    const sceneNarrations = script.scenes.map(s => ({ sceneId: s.id, narration: s.narration }));
    const mappedTimings = TimingMapper.mapScenes(sceneNarrations, globalWordTimings);

    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i];
      const timing = mappedTimings[i];

      scene.timeRange.start = timing.start;
      scene.timeRange.end = timing.end;

      // Update manifest
      const sceneDir = path.join(projectDir, "scenes", scene.id);
      const manifestPath = path.join(sceneDir, "manifest.json");

      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const startTime = timing.start;
        const wordTimings = timing.wordTimings;

        // Update wordTimings (relative to scene start for clip effects)
        manifest.wordTimings = wordTimings.map(w => {
          const relStart = Math.max(0, w.start - startTime);
          const relEnd = Math.max(relStart, (w.end - startTime));
          return {
            ...w,
            start: Math.round(relStart * 100) / 100,
            end: Math.round(relEnd * 100) / 100,
            startMs: Math.round(relStart * 1000)
          };
        });

        // Update globalWordTimings (absolute for global subtitle sync)
        (manifest as any).globalWordTimings = wordTimings.map(w => ({
          ...w,
          start: Math.round(w.start * 100) / 100,
          end: Math.round(w.end * 100) / 100,
          startMs: Math.round(w.startMs)
        }));

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
    }

    // Update script total duration
    if (mappedTimings.length > 0) {
      script.totalDuration = mappedTimings[mappedTimings.length - 1].end;
    }

    // Save updated script
    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));
    console.log(`[NanoBanana-Sync] Sync completed and files updated for ${script.scenes.length} scenes.`);
  }

  /**
   * Generate complete video from topic.
   */
  async generateVideoFromTopic(
    topic: string,
    options: Partial<VideoGenerationOptions> = {},
    baseImages: string[] = [],
  ): Promise<CompleteVideoPackage> {
    const startTime = Date.now();
    const validOptions = videoGenerationOptionsSchema.parse(options);
    this.currentOptions = validOptions;

    // Dynamic quality mode & provider configuration
    const qualityMode = validOptions.qualityMode || QualityMode.STANDARD;

    // Credit Check
    let creditCost = 0; // Will be calculated after script generation if scene count unknown
    if (validOptions.userId) {
      // Preliminary check with estimated scenes (maxDuration / 5)
      const estimatedScenes = Math.ceil(validOptions.maxDuration / 5);
      const estimatedCreditCost = CostManager.calculateVideoCost(validOptions, estimatedScenes);
      const balance = this.creditsService.getCredits(validOptions.userId);

      if (balance < estimatedCreditCost) {
        throw new Error(`Insufficient credits. Estimated: ${estimatedCreditCost}, Balance: ${balance}`);
      }
      console.log(`[NanoBanana] User ${validOptions.userId} balance: ${balance}. Estimated cost: ${estimatedCreditCost}`);
    }

    // Configure Image Service based on Quality Mode
    let imageQuality: 'ultra-low' | 'low' | 'medium' | 'high' = 'medium';
    if (qualityMode === QualityMode.LOW_COST) imageQuality = 'ultra-low';
    if (qualityMode === QualityMode.HIGH_QUALITY) imageQuality = 'high';

    if (validOptions.imageProvider !== this.currentImageProvider) {
      console.log(
        `[NanoBanana] Switching image provider: ${this.currentImageProvider} -> ${validOptions.imageProvider} (${qualityMode} mode)`,
      );
      this.currentImageProvider = validOptions.imageProvider;
      this.imageService = ImageServiceFactory.create({
        provider: this.currentImageProvider,
        apiKey:
          this.currentImageProvider === "grok"
            ? process.env.XAI_API_KEY || this.apiKey
            : this.apiKey,
        styleSuffix: this.styleSuffix,
        systemPrompt: this.systemPrompt,
        defaultQuality: imageQuality,
      });
    }

    // Dynamic Kokoro voice switching
    if (validOptions.kokoroVoicePreset && validOptions.kokoroVoicePreset !== this.currentKokoroVoicePreset) {
      console.log(
        `[NanoBanana] Switching Kokoro voice: ${this.currentKokoroVoicePreset} -> ${validOptions.kokoroVoicePreset}`,
      );
      this.currentKokoroVoicePreset = validOptions.kokoroVoicePreset;
      this.audioService = AudioServiceFactory.create({
        provider: "kokoro",
        lang: "en",
        apiKey: process.env.HUGGING_FACE_TOKEN || this.apiKey,
        kokoroVoicePreset: this.currentKokoroVoicePreset,
      });
    }

    // Set background color from options
    if (validOptions.backgroundColor) {
      this.promptManager.setBackgroundColor(validOptions.backgroundColor);
    }

    console.log(`\n=== GENERATING VIDEO: ${topic} ===`);
    const script = await this.generateStructuredScript(topic, validOptions);

    // ─────────────────────────────────────────────────────────────────────────
    // AUTO-LOAD CHARACTER MODELS FOR CONSISTENCY
    // ─────────────────────────────────────────────────────────────────────────
    const characterModelManager = getCharacterModelManager();
    const usedCharacterVariants = new Set<string>();

    for (const scene of script.scenes) {
      if (scene.characterVariant) {
        usedCharacterVariants.add(scene.characterVariant);
      } else {
        usedCharacterVariants.add('standard');
      }
    }

    const characterReferenceImages: string[] = [];
    if (usedCharacterVariants.size > 0) {
      const firstCharacter = Array.from(usedCharacterVariants)[0];
      console.log(`[NanoBanana] Loading character models for: ${Array.from(usedCharacterVariants).join(', ')}`);
      const referenceImages = characterModelManager.getReferenceImagesForCharacter(firstCharacter);
      characterReferenceImages.push(...referenceImages);

      if (characterReferenceImages.length > 0) {
        console.log(`[NanoBanana] ✓ Character reference images loaded (${characterReferenceImages.length} model(s))`);
      } else {
        console.warn(`[NanoBanana] ⚠ No character reference images found. Using text-only description.`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHARACTER STUDIO (V2 Phase 2): Generate Scene 0 Bible
    // ─────────────────────────────────────────────────────────────────────────
    const projectDir = path.join(
      __dirname,
      "..",
      "..",
      "output",
      `video-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    );
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    const bibleBase64 = await this.generateCharacterBible(script, projectDir, characterReferenceImages);

    // Merge with any provided base images - Bible takes priority for consistency
    const allBaseImages = [...bibleBase64, ...characterReferenceImages, ...baseImages];

    // (Layouts are now pre-generated within the script by the LLM)

    const scenesDir = path.join(projectDir, "scenes");
    fs.mkdirSync(scenesDir, { recursive: true });

    // EXPORT EARLY: Save script and detailed report before starting asset generation
    console.log(
      `[NanoBanana] Exporting production report to: ${projectDir}/script.md`,
    );
    await this.exportVideoPackage(script, projectDir);

    // Calculate Final Credit Cost
    creditCost = CostManager.calculateVideoCost(validOptions, script.sceneCount);
    console.log(`\n💰 CREDIT COST: ${creditCost} credits (${qualityMode} mode)\n`);

    // Actual Credit Deduction
    if (validOptions.userId) {
      const success = this.creditsService.deductCredits(validOptions.userId, creditCost);
      if (!success) {
        throw new Error(`Insufficient credits for final generation. Cost: ${creditCost}`);
      }
      console.log(`[NanoBanana] Credits deducted: ${creditCost}. New balance: ${this.creditsService.getCredits(validOptions.userId)}`);
    }

    if (validOptions.scriptOnly) {
      console.log(
        `\n📄 SCRIPT-ONLY MODE: Stopping here. Report saved to: ${projectDir}/script.md`,
      );
      const stats = {
        apiCalls: script.sceneCount * 2,
        estimatedCost: creditCost,
        actualCost: creditCost,
        generationTimeMs: Date.now() - startTime,
      };
      fs.writeFileSync(
        path.join(projectDir, "metadata.json"),
        JSON.stringify(stats, null, 2),
      );
      return {
        script,
        projectId: path.basename(projectDir),
        outputPath: projectDir,
        generatedAt: new Date().toISOString(),
        metadata: stats,
      };
    }

    // Setup ASS caption config EARLY in pipeline (before composeScene)
    const assCaptionConfig: AssCaptionConfig = validOptions.assCaptions || {
      style: "colored",
      fontSize: 70,
      fontFamily: "Montserrat",
      position: "bottom",
      highlightColor: "#FFE135",
      borderSize: 2,
      shadowSize: 3,
    };
    this.currentAssCaptionConfig = assCaptionConfig;

    // Note: Whisper local will be auto-initialized in composeScene if word timings are empty
    // No need to pre-initialize here - it happens on-demand

    let lastSceneImageBase64: string | undefined;

    // --- GLOBAL AUDIO GENERATION ---
    console.log(`\n[NanoBanana] --- Generating Global Audio ---`);
    const fullScriptText = script.scenes.map(s => s.narration).join("\n\n...\n\n"); // Add strong pause between scenes
    const globalAudioPath = path.join(projectDir, "global_narration.mp3");
    let globalWordTimings: WordTiming[] = [];

    try {
      const audioResult = await this.audioService.generateSpeech(fullScriptText, globalAudioPath);

      // Auto-initialize Whisper local if not already done
      if (!this.transcriptionService) {
        console.log(`[NanoBanana] Initializing Whisper for global timing...`);
        this.currentTranscriptionConfig = {
          provider: "whisper-local",
          model: "base",
          device: "cpu",
          language: validOptions.language?.split('-')[0] || "en",
        };
        this.transcriptionService = TranscriptionServiceFactory.create(this.currentTranscriptionConfig);
      }

      console.log(`[NanoBanana] Transcribing global audio with Whisper...`);
      const transcriptionResult = await this.transcriptionService.transcribe(globalAudioPath);
      globalWordTimings = transcriptionResult.wordTimings;

      // Map timings back to scenes
      console.log(`[NanoBanana] Mapping global timings to scenes...`);
      const sceneNarrations = script.scenes.map(s => ({ sceneId: s.id, narration: s.narration }));
      const mappedTimings = TimingMapper.mapScenes(sceneNarrations, globalWordTimings);

      // Update scene timeRanges and store timings
      mappedTimings.forEach((timing, idx) => {
        const scene = script.scenes[idx];
        scene.timeRange.start = timing.start;
        scene.timeRange.end = timing.end;
        (scene as any).globalWordTimings = timing.wordTimings;
        console.log(`[NanoBanana] Scene ${scene.id}: ${timing.start.toFixed(2)}s -> ${timing.end.toFixed(2)}s`);
      });

      // Update total duration
      if (mappedTimings.length > 0) {
        script.totalDuration = mappedTimings[mappedTimings.length - 1].end;
      }

      script.globalAudio = "global_narration.mp3";

    } catch (audioError) {
      console.error(`[NanoBanana] Global audio generation/transcription failed:`, audioError);
      // Fallback: we might want to continue with per-scene audio if this fails, 
      // but the user specifically asked for this new flow.
    }
    // --------------------------------

    for (const scene of script.scenes) {
      const sceneDir = path.join(scenesDir, scene.id);
      await this.composeScene(scene, allBaseImages, sceneDir, lastSceneImageBase64);

      // Keep track of the last generated image to allow for "Scene Continuation"
      const lastImagePath = path.join(sceneDir, "scene.webp");
      if (fs.existsSync(lastImagePath)) {
        lastSceneImageBase64 = `data:image/webp;base64,${fs.readFileSync(lastImagePath).toString("base64")}`;
      }
    }

    // Assemble Final Video
    if (!validOptions.scriptOnly) {
      try {
        const videoAssembler = new VideoAssembler();
        const finalVideoPath = await videoAssembler.assembleVideo(
          script,
          scenesDir,
          projectDir,
          (validOptions.animationMode || "panning") as
          | "panning"
          | "ai"
          | "composition"
          | "static"
          | "none",
          {
            ...validOptions,
            globalAudioPath: fs.existsSync(globalAudioPath) ? globalAudioPath : undefined
          },
        );
        console.log(`\n✅ VIDEO ASSEMBLY COMPLETE: ${finalVideoPath}`);
      } catch (assemblyError) {
        console.error(`\n❌ VIDEO ASSEMBLY FAILED:`, assemblyError);
      }
    }

    const stats = {
      apiCalls: script.sceneCount * 2,
      estimatedCost: creditCost,
      actualCost: creditCost,
      generationTimeMs: Date.now() - startTime,
    };

    fs.writeFileSync(
      path.join(projectDir, "metadata.json"),
      JSON.stringify(stats, null, 2),
    );
    return {
      script,
      projectId: path.basename(projectDir),
      outputPath: projectDir,
      generatedAt: new Date().toISOString(),
      metadata: stats,
    };
  }

  async generateStructuredScript(
    topic: string,
    options: Partial<VideoGenerationOptions> = {},
  ): Promise<CompleteVideoScript> {
    const validOptions = videoGenerationOptionsSchema.parse(options);

    // Dynamic LLM provider switching
    if (validOptions.llmProvider !== this.currentLLMProvider) {
      console.log(
        `[NanoBanana] Switching LLM provider: ${this.currentLLMProvider} -> ${validOptions.llmProvider}`,
      );
      this.currentLLMProvider = validOptions.llmProvider;
      this.llmService = LLMServiceFactory.create({
        provider: this.currentLLMProvider,
        apiKey:
          this.currentLLMProvider === "grok"
            ? process.env.XAI_API_KEY || this.apiKey
            : this.apiKey,
        cacheSystemPrompt: true,  // ← Option B: Enable prompt caching
      });
      // Re-initialize generator with new service, sharing the same PromptManager
      this.scriptGenerator = new VideoScriptGenerator(
        this.llmService,
        this.promptManager,
      );
    }

    // Initialize/Switch Transcription Service
    if (
      validOptions.transcription &&
      JSON.stringify(validOptions.transcription) !==
      JSON.stringify(this.currentTranscriptionConfig)
    ) {
      console.log(
        `[NanoBanana] Updating transcription provider: ${this.currentTranscriptionConfig?.provider || "none"} -> ${validOptions.transcription.provider}`,
      );
      this.currentTranscriptionConfig =
        validOptions.transcription as TranscriptionConfig;
      this.transcriptionService = TranscriptionServiceFactory.create(
        this.currentTranscriptionConfig,
      );
    }

    try {
      return await this.generationQueue.add(
        () => this.scriptGenerator.generateCompleteScript(topic, validOptions),
        `Script Generation: ${topic}`,
        'llm'
      );
    } catch (error) {
      // Network error fallback: if Grok LLM fails, try Claude Haiku
      const isNetError = this.isNetworkError(error);
      if (isNetError && this.currentLLMProvider === 'grok') {
        console.warn(`[NanoBanana] Network error with Grok LLM, falling back to Claude Haiku...`);
        this.currentLLMProvider = 'haiku';
        this.llmService = LLMServiceFactory.create({
          provider: 'haiku',
          apiKey: this.apiKey,
          cacheSystemPrompt: true,
        });
        // Re-initialize generator with Claude
        this.scriptGenerator = new VideoScriptGenerator(
          this.llmService,
          this.promptManager,
        );

        // Retry with Claude Haiku
        try {
          return await this.scriptGenerator.generateCompleteScript(topic, validOptions);
        } catch (fallbackError) {
          console.error(`[NanoBanana] Fallback to Claude Haiku also failed:`, fallbackError);
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  async exportVideoPackage(
    script: CompleteVideoScript,
    outputPath: string,
  ): Promise<void> {
    if (!fs.existsSync(outputPath))
      fs.mkdirSync(outputPath, { recursive: true });
    fs.writeFileSync(
      path.join(outputPath, "script.json"),
      JSON.stringify(script, null, 2),
    );
    fs.writeFileSync(
      path.join(outputPath, "script.md"),
      this.scriptGenerator.exportToMarkdown(script),
    );
  }

  /**
   * MVP shortcut: generate a short, simple static video with minimal choices.
   * Produces a 30-second video with no animation. Scene count is derived
   * automatically from the duration (~1 scene per 10 seconds).
   *
   * @param topic - Subject or idea for the video (e.g. "How to stay focused at work")
   * @param baseImages - Optional reference images as base64 strings for character consistency
   */
  async generateMvp(
    topic: string,
    baseImages: string[] = [],
    userId?: string,
    qualityMode: QualityMode = QualityMode.LOW_COST,
    branding?: BrandingConfig,
    enableContextualBackground: boolean = true,
  ): Promise<CompleteVideoPackage> {
    return this.generateVideoFromTopic(
      topic,
      {
        userId,
        qualityMode,
        enableContextualBackground,
        branding: {
          watermarkText: "PRO MASTER 2026",
          position: 'top-right' as any,
          opacity: 1,
          scale: 1
        },
        minDuration: 100,
        maxDuration: 120,
        style: "educational",
        animationMode: "none",
        aspectRatio: "16:9",
        scriptOnly: false,
        imageProvider: "gemini",
        llmProvider: "gemini",
        kokoroVoicePreset: KokoroVoicePreset.BF_ISABELLA,
        backgroundMusic: "upbeat",
        assCaptions: {
          enabled: true,
          style: "colored",
          fontSize: 70,
          fontFamily: "Montserrat",
          position: "bottom",
          inactiveColor: "#FFFFFF",
          highlightColor: "#FFE135",
          borderSize: 2,
          shadowSize: 3,
        },
      },
      baseImages,
    );
  }
}

function readImageToBase64(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString("base64");
}
