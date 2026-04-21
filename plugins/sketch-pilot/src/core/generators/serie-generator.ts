import { SeriesRepository } from '../../../../../src/infrastructure/repositories/series.repository'
import { SagaProductionService } from '../../plugins/vimax/services/saga-production.service'
import type { EnrichedScene, ImagePrompt, VideoGenerationOptions } from '../../types/video-script.types'
import type { SceneMemory } from '../scene-memory'
import { VideoGenerator } from './video-generator.abstract'
import type { SeriesContext } from './series-video-generator'
import type { VideoGeneratorConfig } from './video-generator.abstract'

export class SerieGenerator extends VideoGenerator {
  public seriesContext: SeriesContext
  private sagaService: SagaProductionService

  constructor(config: VideoGeneratorConfig, seriesContext: SeriesContext) {
    super(config)
    this.seriesContext = seriesContext

    // Initialize the central Saga Production Service
    this.sagaService = new SagaProductionService(config.llm, new SeriesRepository())
  }

  public getType(): string {
    return 'serie'
  }

  private preGeneratedSaga: any | null = null

  public async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    console.info(`[SerieGenerator] 🧠 Vimax Proxy Mode: Pre-generating full saga for topic: ${topic}`)

    // We run the full saga generation upfront via the central service
    this.preGeneratedSaga = await this.sagaService.produceFullSaga(topic, {
      ...options,
      seriesId: this.seriesContext.seriesId,
      seriesContext: this.seriesContext
    } as any)

    // We return the prompts used for planning to satisfy the interface,
    // although the results are already captured.
    const data = this.sagaService.getAgent().planner.getLastPromptData()
    return {
      systemPrompt: data.system,
      userPrompt: data.user
    }
  }

  public buildTwoPassPrompts(
    topic: string,
    options: VideoGenerationOptions,
    targetWords?: number
  ): { pass1: { system: string; user: string; targetWords: number } } {
    const episodeIndex = (options as any).episodeNumber || this.seriesContext.episodeNumber || 1
    const episode = this.preGeneratedSaga?.episodes?.[episodeIndex - 1]

    if (episode) {
      console.info(`[SerieGenerator] 📦 Serving pre-generated narration for Episode ${episodeIndex}`)
      return {
        pass1: {
          system: 'VIMAX_RESULTS_PROXY',
          user: `VIMAX_RESULT: ${episode.narration}`,
          targetWords: episode.narration.split(/\s+/).length
        }
      }
    }

    // Fallback if no pre-generated data
    const target = targetWords || Math.round((options.duration || 60) * 2.45)

    return {
      pass1: { system: 'Vimax Narration System Prompt', user: topic, targetWords: target }
    }
  }

  public buildPass2Prompts(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    chunkContext?: { chunkIndex: number; totalChunks: number; startSceneNumber: number }
  ): { system: string; user: string } {
    // If the narration is already our VIMAX_RESULT, we can serve the JSON scenes
    if (validatedNarration.startsWith('VIMAX_RESULT:')) {
      const episodeIndex = (options as any).episodeNumber || this.seriesContext.episodeNumber || 1
      const episode = this.preGeneratedSaga?.episodes?.[episodeIndex - 1]
      if (episode?.screenplay) {
        console.info(`[SerieGenerator] 📦 Serving pre-generated structured script for Episode ${episodeIndex}`)
        return {
          system: 'VIMAX_RESULTS_PROXY',
          user: `VIMAX_RESULT_JSON: ${JSON.stringify(episode.screenplay)}`
        }
      }
    }

    return {
      system: 'Vimax Screenwriter System Prompt',
      user: `Narration to structure: ${validatedNarration}`
    }
  }

  public buildNarrationRetryUserPrompt(
    topic: string,
    currentNarration: string,
    options: VideoGenerationOptions,
    targetWords: number,
    actualWords: number,
    attempt: number
  ): string {
    return `The narration is too short (${actualWords}/${targetWords}). Please expand it with more details.`
  }

  public fixFullNarrationDrift(script: any): { script: any; driftFixed: boolean; driftWords: number } {
    return { script, driftFixed: false, driftWords: 0 }
  }

  public override auditScript(script: any): { isValid: boolean; issues: string[]; feedback?: string } {
    // Logic for synchronous audit could be placed here, delegating to a Vimax-based sentinel if available
    return { isValid: true, issues: [] }
  }

  public async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages?: boolean,
    aspectRatio?: string,
    memory?: SceneMemory,
    hasLocationReference?: boolean
  ): Promise<ImagePrompt> {
    // If we have pre-generated data, try to find the matching scene
    if (this.preGeneratedSaga) {
      const episodeIndex = this.seriesContext.episodeNumber || 1
      const episode = this.preGeneratedSaga.episodes?.[episodeIndex - 1]
      const vimaxScene = episode?.scenes?.[scene.sceneNumber - 1]

      if (vimaxScene?.imagePrompt) {
        console.info(`[SerieGenerator] 📦 Serving pre-generated image prompt for Scene ${scene.sceneNumber}`)
        return {
          sceneId: scene.id,
          prompt: vimaxScene.imagePrompt
        }
      }
    }

    // Fallback: Generate Image Prompt using Vimax Planner (Motion/Visual mode)
    const result = await this.sagaService.getAgent().planner.generateImagePrompt(
      scene.narration,
      '', // Character context
      null, // Previous anchor
      false // Climax flag
    )

    return {
      sceneId: scene.id,
      prompt: result.imagePrompt
    }
  }

  public buildAnimationPrompt(
    scene: EnrichedScene,
    imageStyle?: { characterDescription?: string }
  ): { sceneId: string; instructions: string; movements: any[] } {
    // If we have pre-generated data, try to find the matching scene
    if (this.preGeneratedSaga) {
      const episodeIndex = this.seriesContext.episodeNumber || 1
      const episode = this.preGeneratedSaga.episodes?.[episodeIndex - 1]
      const vimaxScene = episode?.scenes?.[scene.sceneNumber - 1]

      if (vimaxScene?.animationPrompt) {
        console.info(`[SerieGenerator] 📦 Serving pre-generated animation for Scene ${scene.sceneNumber}`)
        return {
          sceneId: scene.id,
          instructions: vimaxScene.animationPrompt,
          movements: []
        }
      }
    }

    const instructions = scene.animationPrompt || ''
    return {
      sceneId: scene.id,
      instructions,
      movements: []
    }
  }

  public async buildThumbnailPrompt(title: string, environment?: string, inspirationUrl?: string): Promise<string> {
    // High impact YouTube thumbnail generation
    return `Series Thumbnail for "${title}". ${environment || ''}`
  }

  public async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    // System instructions for image generation, could be influenced by Vimax plugins
    return 'Photorealistic and cinematic style, following the Series Bible.'
  }
}
