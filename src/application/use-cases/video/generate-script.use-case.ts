import { IUseCase } from '@/domain/types'
import { ScriptGenerationService, type GenerateScriptOptions } from '@/application/services/script-generation.service'
import type { CompleteVideoScript } from '@sketch-pilot/types/video-script.types'

type GenerateScriptParams = {
  topic: string
  options?: GenerateScriptOptions
}

type GenerateScriptResponse = {
  success: boolean
  script?: CompleteVideoScript
  metadata?: {
    sceneCount: number
    estimatedDuration: number
    language: string
  }
  error?: string
}

const scriptGenerationService = new ScriptGenerationService()

export class GenerateScriptUseCase extends IUseCase<GenerateScriptParams, GenerateScriptResponse> {
  async execute({ topic, options = {} }: GenerateScriptParams): Promise<GenerateScriptResponse> {
    try {
      const script = await scriptGenerationService.generateScript(topic, options)
      return {
        success: true,
        script,
        metadata: {
          sceneCount: script.scenes?.length ?? 0,
          estimatedDuration: script.totalDuration ?? options.maxDuration ?? 60,
          language: options.language ?? 'en'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Script generation failed'
      }
    }
  }
}
