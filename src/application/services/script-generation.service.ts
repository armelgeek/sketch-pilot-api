import process from 'node:process'

import { PromptManager } from '@sketch-pilot/core/prompt-manager'
import { ScriptValidator, type ScriptValidationResult } from '@sketch-pilot/core/script-validator'
/**
 * Script Generation Service — application-layer service.
 * Integrates the sketch-pilot VideoScriptGenerator into the backend DDD architecture.
 */
import { VideoScriptGenerator } from '@sketch-pilot/core/video-script-generator'
import { LLMServiceFactory, type LLMServiceConfig } from '@sketch-pilot/services/llm'
import {
  videoGenerationOptionsSchema,
  type CompleteVideoScript,
  type VideoGenerationOptions
} from '@sketch-pilot/types/video-script.types'
import { PromptService } from '@/application/services/prompt.service'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'

export type { ScriptValidationResult }

export interface GenerateScriptOptions {
  duration?: number
  maxDuration?: number
  sceneCount?: number
  language?: string
  qualityMode?: string
  llmProvider?: string
  promptId?: string
  characterModelId?: string
  aspectRatio?: '9:16' | '16:9' | '1:1'
  backgroundMusic?: string
}

export class ScriptGenerationService {
  private readonly validator = new ScriptValidator()
  private readonly promptService = new PromptService(new PromptRepository())
  private readonly characterModelRepository = new CharacterModelRepository()

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

    // 1. Resolve Spec from DB by promptId
    const spec = await this.promptService.resolveSpec(options.promptId)

    // 2. Build options using the schema for validation and transformation (handles dynamic scene count, duration mapping, etc.)
    const targetDuration = options.duration || options.maxDuration
    const genOptions = videoGenerationOptionsSchema.parse({
      minDuration: targetDuration,
      maxDuration: targetDuration,
      sceneCount: options.sceneCount,
      language: options.language,
      aspectRatio: options.aspectRatio,
      qualityMode: options.qualityMode,
      characterModelId: options.characterModelId,
      backgroundMusic: options.backgroundMusic,
      customSpec: spec
    })

    // 3. Initialize generator and run (using the SAME spec for both script and image)
    const promptManager = new PromptManager({
      scriptSpec: spec as any,
      imageSpec: spec as any
    })
    const generator = new VideoScriptGenerator(llmService, promptManager)
    const script = await generator.generateCompleteScript(topic, genOptions as VideoGenerationOptions)

    // 4. Best-Fit Matching for auto-discovered characters
    if (script.characterSheets && script.characterSheets.length > 0) {
      for (const sheet of script.characterSheets) {
        if (!sheet.modelId && sheet.metadata) {
          const model = await this.characterModelRepository.findByMetadata(
            sheet.metadata.gender,
            sheet.metadata.age
          )
          if (model) {
            sheet.modelId = model.id
          }
        }
      }
    }

    return script
  }

  /**
   * Validate a video script (0–20 score system).
   */
  validateScript(script: CompleteVideoScript): ScriptValidationResult {
    return this.validator.validate(script)
  }
}
