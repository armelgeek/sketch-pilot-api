import { IUseCase } from '@/domain/types'
import { ScriptGenerationService } from '@/application/services/script-generation.service'
import type { CompleteVideoScript } from '@sketch-pilot/types/video-script.types'
import type { ScriptValidationResult } from '@/application/services/script-generation.service'

type ValidateScriptParams = {
  script: CompleteVideoScript
}

type ValidateScriptResponse = {
  success: boolean
  validation?: ScriptValidationResult
  error?: string
}

const scriptGenerationService = new ScriptGenerationService()

export class ValidateScriptUseCase extends IUseCase<ValidateScriptParams, ValidateScriptResponse> {
  async execute({ script }: ValidateScriptParams): Promise<ValidateScriptResponse> {
    try {
      const validation = scriptGenerationService.validateScript(script)
      return { success: true, validation }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      }
    }
  }
}
