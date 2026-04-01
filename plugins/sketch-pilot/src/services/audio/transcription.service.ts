import type { WordTiming } from './index'

export interface TranscriptionResult {
  text: string
  wordTimings: WordTiming[]
}

export interface TranscriptionService {
  transcribe: (
    audioPath: string,
    onProgress?: (progress: number, message: string) => void
  ) => Promise<TranscriptionResult>
}

export type TranscriptionProvider = 'whisper-openai' | 'whisper-local' | 'assemblyai'

export interface TranscriptionServiceConfig {
  provider: TranscriptionProvider
  apiKey?: string
  model?: string
  device?: string
  language?: string
}

export const TranscriptionServiceFactory = {
  async create(config: TranscriptionServiceConfig): Promise<TranscriptionService> {
    switch (config.provider) {
      case 'whisper-openai': {
        const { WhisperOpenAiService } = await import('./whisper-openai.service')
        return new WhisperOpenAiService(config.apiKey)
      }
      case 'whisper-local': {
        const { WhisperLocalService } = await import('./whisper-local.service')
        return new WhisperLocalService({
          model: config.model || 'base',
          device: config.device || 'cpu',
          language: config.language
        })
      }
      default:
        throw new Error(`Unknown transcription provider: ${config.provider}`)
    }
  }
}
