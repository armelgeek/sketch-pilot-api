/**
 * Script Generation Service — application-layer service.
 * Integrates the sketch-pilot VideoScriptGenerator into the backend DDD architecture.
 */
import { VideoScriptGenerator } from '@sketch-pilot/core/video-script-generator'
import { PromptManager } from '@sketch-pilot/core/prompt-manager'
import { ScriptValidator } from '@sketch-pilot/core/script-validator'
import { LLMServiceFactory, type LLMServiceConfig } from '@sketch-pilot/services/llm'
import type { VideoGenerationOptions, CompleteVideoScript } from '@sketch-pilot/types/video-script.types'
import type { ScriptValidationResult } from '@sketch-pilot/core/script-validator'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { PromptService } from '@/application/services/prompt.service'

export type { ScriptValidationResult }

export interface GenerateScriptOptions {
  maxDuration?: number
  sceneCount?: number
  style?: 'motivational' | 'educational' | 'storytelling' | 'tutorial'
  videoType?: string
  videoGenre?: string
  language?: string
  qualityMode?: string
  llmProvider?: string
}

export class ScriptGenerationService {
  private readonly validator = new ScriptValidator()
  private readonly promptService = new PromptService(new PromptRepository())

  /**
   * Generate a complete video script using the LLM engine.
   * Does not consume video credits — script-only operation.
   */
  async generateScript(topic: string, options: GenerateScriptOptions = {}): Promise<CompleteVideoScript> {
    const llmConfig: LLMServiceConfig = {
      provider: (options.llmProvider as LLMServiceConfig['provider']) || 'gemini',
      apiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || ''
    }
    const llmService = LLMServiceFactory.create(llmConfig)

    // Build a PromptManager with a dynamic loader so prompts are resolved from the DB
    const promptService = this.promptService
    const promptManager = new PromptManager({
      promptLoader: async (promptType, context, variables) => {
        return promptService.resolve({
          promptType: promptType as any,
          videoType: context?.videoType,
          videoGenre: context?.videoGenre,
          language: context?.language,
          variables: variables as any,
        })
      },
    })

    const generator = new VideoScriptGenerator(llmService, promptManager)

    const genOptions: Partial<VideoGenerationOptions> = {
      maxDuration: options.maxDuration || 60,
      sceneCount: options.sceneCount || 6,
      style: (options.style as any) || 'educational',
      videoType: options.videoType as any,
      videoGenre: options.videoGenre as any,
      language: options.language || 'en',
      qualityMode: options.qualityMode as any
    }

    return generator.generateCompleteScript(topic, genOptions as VideoGenerationOptions)
  }

  /**
   * Validate a video script (0–20 score system).
   */
  validateScript(script: CompleteVideoScript): ScriptValidationResult {
    return this.validator.validate(script)
  }
}
