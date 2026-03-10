import process from 'node:process'

import { PromptManager } from '@sketch-pilot/core/prompt-manager'
import { ScriptValidator, type ScriptValidationResult } from '@sketch-pilot/core/script-validator'
/**
 * Script Generation Service — application-layer service.
 * Integrates the sketch-pilot VideoScriptGenerator into the backend DDD architecture.
 */
import { VideoScriptGenerator } from '@sketch-pilot/core/video-script-generator'
import { LLMServiceFactory, type LLMServiceConfig } from '@sketch-pilot/services/llm'
import { PromptService } from '@/application/services/prompt.service'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import type { CompleteVideoScript, VideoGenerationOptions } from '@sketch-pilot/types/video-script.types'

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

    // Build a PromptManager for generating prompts
    const promptManager = new PromptManager()

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

    return await generator.generateCompleteScript(topic, genOptions as VideoGenerationOptions)
  }

  /**
   * Validate a video script (0–20 score system).
   */
  validateScript(script: CompleteVideoScript): ScriptValidationResult {
    return this.validator.validate(script)
  }
}
