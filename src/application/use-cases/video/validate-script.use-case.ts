import { ScriptGenerationService, type ScriptValidationResult } from '@/application/services/script-generation.service'
import { IUseCase } from '@/domain/types'
import type { CompleteVideoScript } from '@sketch-pilot/types/video-script.types'

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
  execute({ script }: ValidateScriptParams): ValidateScriptResponse {
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
